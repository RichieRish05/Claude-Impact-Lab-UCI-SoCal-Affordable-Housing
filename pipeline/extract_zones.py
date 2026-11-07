"""Step 2: extract residential zone rules from the HB zoning code with Claude, then mark them verified.

    uv run python extract_zones.py extract            # write zones not yet in zone_rules
    uv run python extract_zones.py extract --force    # re-extract all; clears verification
    uv run python extract_zones.py show [ZONE]        # print rules for a person to check
    uv run python extract_zones.py verify ZONE --by NAME
"""

import argparse
import json
import os
from pathlib import Path
from typing import Literal

import anthropic
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

HERE = Path(__file__).parent
SOURCE_PDF = HERE / "raw" / "code" / "ord4308.pdf"
SOURCE = "HBZSO §210.06 (RL, RM, RMH, RH, and RMP Districts—Property Development Standards), as amended by Ord. No. 4308 (2024)"
ZONES = ["RL", "RM", "RMH", "RMH-A", "RH", "RMP"]
MODEL = "claude-opus-5-5"


class Setback(BaseModel):
    min_ft: float | None = Field(description="Smallest allowed setback in feet; null if the code gives none")
    max_ft: float | None = Field(description="Cap on a percentage-based setback ('need not exceed'), else null")
    rule: str = Field(description="The rule as the code states it, including percentage-of-width formulas")


class ZoneRules(BaseModel):
    zone: str
    district_name: str
    housing_type: Literal["single_family", "multifamily", "mobile_home_park"]
    min_lot_sqft: int | None = Field(description="Min. building site in sq ft; null if not given or N/A")
    min_lot_width_ft: int | None
    min_cul_de_sac_frontage_ft: int | None
    front_setback: Setback
    side_setback: Setback
    street_side_setback: Setback
    rear_setback: Setback
    max_height_ft: int | None = Field(description="Max. height for dwellings")
    max_lot_coverage_pct: int | None
    max_far: float | None
    min_lot_area_per_unit_sqft: int | None = Field(description="Min. lot area per dwelling unit; null if not a fixed number")
    density_rule: str = Field(description="How many units a lot allows, in plain words, including frontage-based notes")
    parking: str | None = Field(description="Parking requirement if stated in the source; null if the source only cross-references another chapter")
    source_section: str = Field(description="Section and lettered provision the values come from")
    source_quotes: list[str] = Field(description="Exact phrases or table cells from the source that support the values")
    uncertain: list[str] = Field(description="Any value that was hard to read or ambiguous in the source, with why; empty if none")


class Extraction(BaseModel):
    zones: list[ZoneRules]


PROMPT = f"""The attached PDF is Huntington Beach Ordinance No. 4308, which restates Zoning Code §210.06, the property development standards for residential districts.

Extract the rules for each of these zones: {", ".join(ZONES)}. RMH-A is a subdistrict of RMH with its own column in the standards table; treat it as its own zone.

Read values from the table and its lettered "Additional Development Standards" notes. Use only what this document says. Where a cell is blank, N/A, or applies only through a note (for example the frontage-based density notes), say so in the rule text and leave the number null rather than borrowing a value from another column. Parking is cross-referenced to Chapter 231, which this document doesn't contain, so leave parking null unless the document itself states a number.

The table has six columns (RL, RM, RMH-A, RMH, RH, RMP), but some rows have fewer values than columns. When a row is short, work out from the page which columns the values sit under, and record the ambiguity in `uncertain`.

These rules will be checked by a person against the code before use, so quote the source cells that support each value."""


def engine():
    load_dotenv(HERE / ".env")
    return create_engine(os.environ["DATABASE_URL"])


def extract(force):
    with engine().connect() as conn:
        existing = {r[0] for r in conn.execute(text("SELECT zone FROM zone_rules"))}
    todo = ZONES if force else [z for z in ZONES if z not in existing]
    if not todo:
        print("all zones already extracted; pass --force to redo them")
        return

    client = anthropic.Anthropic()
    uploaded = client.files.upload(file=SOURCE_PDF)
    try:
        response = client.beta.messages.parse(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high"},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "document", "source": {"type": "file", "file_id": uploaded.id}, "title": "Ordinance No. 4308"},
                    {"type": "text", "text": PROMPT},
                ],
            }],
            output_format=Extraction,
        )
    finally:
        client.files.delete(uploaded.id)

    if response.stop_reason in ("refusal", "max_tokens"):
        raise SystemExit(f"extraction stopped: {response.stop_reason} (request {response._request_id})")
    zones = {z.zone: z for z in response.parsed_output.zones}
    missing = [z for z in todo if z not in zones]
    if missing:
        raise SystemExit(f"model returned no rules for {missing}")

    (HERE / "raw" / "zone_rules.json").write_text(response.parsed_output.model_dump_json(indent=2))
    with engine().begin() as conn:
        for name in todo:
            # A re-extraction replaces the rules, so the old verification no longer applies.
            conn.execute(
                text("""
                    INSERT INTO zone_rules (zone, rules_json, source_section)
                    VALUES (:zone, CAST(:rules AS jsonb), :source)
                    ON CONFLICT (zone) DO UPDATE SET rules_json = EXCLUDED.rules_json,
                        source_section = EXCLUDED.source_section, verified_by = NULL,
                        verified_at = NULL, updated_at = now()
                """),
                {"zone": name, "rules": zones[name].model_dump_json(), "source": SOURCE},
            )
    print(f"wrote {len(todo)} zones: {', '.join(todo)} (request {response._request_id})")
    for name in todo:
        for note in zones[name].uncertain:
            print(f"  {name} uncertain: {note}")


def show(zone):
    query = "SELECT zone, rules_json, verified_by, verified_at FROM zone_rules"
    with engine().connect() as conn:
        rows = conn.execute(text(query + (" WHERE zone = :z" if zone else " ORDER BY zone")), {"z": zone}).fetchall()
    for name, rules, by, at in rows:
        status = f"verified by {by} at {at:%Y-%m-%d}" if by else "NOT VERIFIED"
        print(f"== {name} ({status})")
        print(json.dumps(rules, indent=2))


def verify(zone, by):
    with engine().begin() as conn:
        done = conn.execute(
            text("UPDATE zone_rules SET verified_by = :by, verified_at = now(), updated_at = now() WHERE zone = :z"),
            {"by": by, "z": zone},
        ).rowcount
    print(f"marked {zone} verified by {by}" if done else f"no zone_rules row for {zone}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("extract").add_argument("--force", action="store_true")
    sub.add_parser("show").add_argument("zone", nargs="?")
    v = sub.add_parser("verify")
    v.add_argument("zone")
    v.add_argument("--by", required=True)
    args = parser.parse_args()
    if args.cmd == "extract":
        extract(args.force)
    elif args.cmd == "show":
        show(args.zone)
    else:
        verify(args.zone, args.by)
