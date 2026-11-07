"""Step 4: compute vacancy and SB 684/1123 eligibility for every parcel and store it.

Rules (PRODUCT_SPECS.MD, "State rules applied in code"):
- Multifamily-zoned lot, or vacant single-family-zoned lot.
- Lot no larger than 1.5 acres. "Substantially surrounded by urban uses" is taken as met
  everywhere in Huntington Beach, which is fully urbanized.
- New parcels at least 600 sq ft (multifamily) or 1,200 sq ft (single-family).
- Up to 10 parcels and 10 homes, one home per parcel.
Only zones a person has verified in zone_rules are used.

Groundwork narrows this to open land: a lot qualifies only if it is vacant or mostly
empty (see mostly_empty), and never if it is shared land (see not_a_building_lot).
"""

import json
import os
import re
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

HERE = Path(__file__).parent
RAW = HERE / "raw"
MAX_LOT_SQFT = 65_340  # 1.5 acres
MIN_PARCEL_SQFT = {"multifamily": 600, "single_family": 1_200}
MAX_PARCELS = 10
LABEL = {"multifamily": "multifamily", "single_family": "single-family"}
LONE_HOUSE_USE = re.compile(r"^SINGLE FAMILY RESIDENTIAL$|^RESIDENTIAL \(GENERAL\) \(SINGLE\)$")
MAX_EMPTY_FLOOR_SHARE = 0.15  # building floor area / lot area
MAX_EMPTY_VALUE_SHARE = 0.20  # improvement value / total assessed value


def vacancy(use_code, improved_value, building_sqft):
    """Return (vacant, confidence that the lot is vacant) from assessor data."""
    no_improvements = (pd.isna(improved_value) or improved_value == 0) and (pd.isna(building_sqft) or building_sqft == 0)
    if isinstance(use_code, str) and "VACANT" in use_code:
        return (True, 0.9) if no_improvements else (True, 0.6)
    if not isinstance(use_code, str):
        # No assessor land-use code: vacant only if nothing is assessed on it, and flag it.
        return (True, 0.5) if no_improvements else (False, 0.1)
    return (False, 0.2) if no_improvements else (False, 0.05)


def common_lot(lot_name, lot_type, building_sqft):
    """Whether a landbase lot is shared land rather than a building lot.

    Tract maps letter the lots they set aside for streets, greenbelts, channels and
    other common areas ("Lot E") and number the building lots. A lettered lot with a
    building on it is kept, since a few were later built on.
    """
    if lot_type == "Private RoW":
        return True
    lettered = isinstance(lot_name, str) and re.fullmatch(r"[A-Z]{1,2}", lot_name) is not None
    return lettered and (pd.isna(building_sqft) or building_sqft == 0)


def not_a_building_lot(common_lot_name, vacant, assessed_value):
    """Why the lot is shared or public land rather than a building lot, or None."""
    if common_lot_name is not None:
        return f"Lot {common_lot_name} of its tract map, which is usually shared land such as a street, greenbelt or channel, not a building lot."
    if vacant and pd.isna(assessed_value):
        # Private land always carries a land value; HOA common areas and public land don't.
        return "Vacant but has no assessed value, which usually means shared or public land such as an HOA common area, not a building lot."
    return None


def mostly_empty(building_sqft, lot_sqft, land_value, improved_value):
    """Whether a built lot is mostly open land.

    Recorded floor area alone is unreliable (some apartment complexes record one small
    building), so the buildings must also be a small share of the assessed value.
    """
    if pd.isna(building_sqft) or building_sqft <= 0 or pd.isna(land_value):
        return False
    improved = 0 if pd.isna(improved_value) else improved_value
    total = land_value + improved
    return building_sqft / lot_sqft < MAX_EMPTY_FLOOR_SHARE and total > 0 and improved / total < MAX_EMPTY_VALUE_SHARE


def evaluate(zone, housing_type, lot_sqft, vacant, confidence, not_buildable=None, use_code=None, empty=False):
    """Return (sb684_eligible, max_homes, eligibility_reason).

    Only vacant or mostly empty lots qualify: Groundwork looks for open land, not
    lots whose existing buildings would have to come down.
    """
    if not_buildable is not None:
        return False, 0, not_buildable
    if housing_type not in MIN_PARCEL_SQFT:
        why = "a mobile home park zone" if housing_type == "mobile_home_park" else "not a verified residential zone"
        return False, 0, f"Zoned {zone}, which is {why}; SB 684 needs a single-family or multifamily zone."

    kind = LABEL[housing_type]
    if housing_type == "single_family" and not vacant:
        return False, 0, f"Zoned single-family ({zone}) but not vacant; SB 684 applies to single-family lots only when vacant."

    # Only a lone house can count as mostly empty: old apartment buildings can record tiny
    # floor areas and low improvement values, and a business with a big parking lot is still a business.
    lone_house = isinstance(use_code, str) and LONE_HOUSE_USE.search(use_code) is not None
    if not vacant and not (empty and lone_house):
        return False, 0, f"Zoned {kind} ({zone}), but the lot is already built on, and Groundwork only counts vacant or mostly empty land."

    if housing_type == "single_family":
        lead = f"Vacant and zoned single-family ({zone})"
    elif vacant:
        lead = f"Vacant and zoned multifamily ({zone})"
    else:
        lead = f"Mostly empty and zoned multifamily ({zone}): its buildings cover little of the lot and are a small share of its value"
    if lot_sqft > MAX_LOT_SQFT:
        return False, 0, f"{lead}, but {lot_sqft:,} sq ft is over the 1.5-acre limit."

    min_parcel = MIN_PARCEL_SQFT[housing_type]
    fits = lot_sqft // min_parcel
    if fits < 2:
        return False, 0, f"{lead}, but {lot_sqft:,} sq ft is too small to split into two parcels of at least {min_parcel:,} sq ft."

    parcels = min(fits, MAX_PARCELS)
    capped = f" (capped at {MAX_PARCELS})" if fits > MAX_PARCELS else ""
    reason = f"{lead}; {lot_sqft:,} sq ft is within the 1.5-acre limit; fits {parcels} parcels of at least {min_parcel:,} sq ft{capped}."
    if housing_type == "single_family" and confidence < 0.9:
        reason += " Vacancy is uncertain; check imagery."
    return True, parcels, reason


def read_inputs(conn):
    parcels = pd.read_sql("SELECT apn, zone, lot_sqft, assessed_value FROM parcels", conn)
    rules = conn.execute(text("SELECT zone, rules_json FROM zone_rules WHERE verified_by IS NOT NULL")).fetchall()
    housing = {zone: r["housing_type"] for zone, r in rules}

    attrs = pd.DataFrame([f["properties"] for f in json.loads((RAW / "hb_parcel_attrs.geojson").read_text())["features"]])
    attrs.columns = [c.split(".")[-1] for c in attrs.columns]
    attrs = attrs.groupby("APN")[["USECODESTDDESCLPS", "BUILDINGSQFT"]].first()

    lots = pd.DataFrame([f["properties"] for f in json.loads((RAW / "oc_landbase_hb.geojson").read_text())["features"]])
    num = lambda c: pd.to_numeric(lots[c].replace("", None), errors="coerce")
    values = pd.DataFrame({"land": num("LandVal"), "improved": num("ImprovedVal")}).groupby(lots["AssessmentNo"]).sum(min_count=1)

    parcels = parcels.join(attrs, on="apn").join(values, on="apn")
    parcels["housing_type"] = parcels["zone"].map(housing)

    # An APN can span several legal lots; it's common land only if all of them are.
    lots = lots.join(attrs["BUILDINGSQFT"], on="AssessmentNo")
    lots["common"] = [common_lot(n, t, b) for n, t, b in zip(lots.Name, lots.LotType, lots.BUILDINGSQFT)]
    by_apn = lots.groupby("AssessmentNo").agg(all_common=("common", "all"), lot_name=("Name", "first"))
    common = by_apn.lot_name.where(by_apn.all_common).rename("common")
    parcels = parcels.join(common, on="apn")
    return parcels


def compute(parcels):
    vac = [vacancy(u, i, b) for u, i, b in zip(parcels.USECODESTDDESCLPS, parcels.improved, parcels.BUILDINGSQFT)]
    parcels["vacant"] = [v for v, _ in vac]
    parcels["vacant_confidence"] = [c for _, c in vac]
    out = [
        evaluate(
            z, h, s, v, c,
            not_buildable=not_a_building_lot(None if pd.isna(lot) else lot, v, a),
            use_code=u,
            empty=mostly_empty(b, s, land, imp),
        )
        for z, h, s, v, c, lot, a, u, b, land, imp in zip(
            parcels.zone, parcels.housing_type, parcels.lot_sqft, parcels.vacant, parcels.vacant_confidence,
            parcels.common, parcels.assessed_value, parcels.USECODESTDDESCLPS, parcels.BUILDINGSQFT,
            parcels.land, parcels.improved,
        )
    ]
    parcels["sb684_eligible"] = [e for e, _, _ in out]
    parcels["max_homes"] = [m for _, m, _ in out]
    parcels["eligibility_reason"] = [r for _, _, r in out]
    return parcels


def write(conn, parcels):
    result = conn.execute(
        text("""
            UPDATE parcels p SET vacant = v.vacant, vacant_confidence = v.conf, sb684_eligible = v.eligible,
                max_homes = v.homes, eligibility_reason = v.reason, updated_at = now()
            FROM unnest(CAST(:apn AS text[]), CAST(:vacant AS boolean[]), CAST(:conf AS float8[]),
                        CAST(:eligible AS boolean[]), CAST(:homes AS int[]), CAST(:reason AS text[]))
                AS v(apn, vacant, conf, eligible, homes, reason)
            WHERE p.apn = v.apn
        """),
        {
            "apn": parcels.apn.tolist(),
            "vacant": parcels.vacant.tolist(),
            "conf": parcels.vacant_confidence.tolist(),
            "eligible": parcels.sb684_eligible.tolist(),
            "homes": [int(h) for h in parcels.max_homes],
            "reason": parcels.eligibility_reason.tolist(),
        },
    )
    print(f"updated {result.rowcount} parcels")


if __name__ == "__main__":
    load_dotenv(HERE / ".env")
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.begin() as conn:
        parcels = compute(read_inputs(conn))
        eligible = parcels[parcels.sb684_eligible]
        print(f"eligible: {len(eligible)} of {len(parcels)}; homes: {eligible.max_homes.sum()}")
        print(eligible.groupby("zone").max_homes.agg(["count", "sum"]).to_string())
        if "--dry-run" not in sys.argv:
            write(conn, parcels)
