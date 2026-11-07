# CLAUDE.md

The offline data jobs from the "Data and eligibility engine" section of `../site/PRODUCT_SPECS.MD`: load parcels and zoning into PostGIS, extract zone rules with the LLM, compute per-parcel eligibility, and store the results. The app only reads the columns these jobs fill. Written so far: `fetch.py` (downloads), `load.py` (step 1), `extract_zones.py` (steps 2 and 3: extraction, then `show` and `verify` for the spot-check), and `eligibility.py` (step 4; tests in `test_eligibility.py`, run with `uv run pytest`). Not yet filled: `dist_transit_ft`, `flood_zone`, `neighborhood`.

## Setup and commands

```bash
uv sync                          # install dependencies into .venv
cp .env.example .env             # then fill in DATABASE_URL and ANTHROPIC_API_KEY
uv add <package>                 # add a dependency; never pip install
uv run python <script>.py        # run a step
```

Put source downloads (parcel landbase, zoning layer, code text) in `raw/`, which is gitignored. `uv run python fetch.py` downloads the OC landbase (Huntington Beach envelope) and the city zoning layer there; `uv run python load.py --dry-run` builds parcels without writing.

## Rules

- **Prisma owns the schema.** Every table is defined in `../site/prisma/schema.prisma`, following the schema-change rules in `../site/CLAUDE.md`. Jobs here only write rows, so never run `CREATE`, `ALTER`, or `DROP TABLE`, and call GeoPandas `to_postgis` or pandas `to_sql` with `if_exists="append"`, never `"replace"`, which drops and recreates the table.
- **Fake parcels:** `parcels` starts with made-up rows whose APNs begin with `FAKE-` (see `../site/prisma/fake-parcels.sql`). Delete them with `DELETE FROM parcels WHERE apn LIKE 'FAKE-%'` before loading real parcels.
- **Geometry:** `parcels.geom` is `geometry(MultiPolygon, 4326)`, so reproject to EPSG:4326 and convert single polygons to MultiPolygon before writing.
- **Eligibility lives here only.** SB 684/1123 checks, `max_homes`, and `eligibility_reason` are computed in this folder and stored. The app reads the stored columns and never reimplements the rules.
- **The LLM extracts zone rules once.** Store the source section with each zone's rules, and don't use a zone until a person has spot-checked it against the code text.
- **Database URL:** use Neon's direct host, without `-pooler`, because bulk loads can fail through PgBouncer. SQLAlchemy needs the `postgresql+psycopg://` scheme.
- **ArcGIS downloads:** these servers return short pages and repeat or skip rows under offset paging, so `fetch.py` lists object IDs first and fetches them in chunks.
- **Shared lots:** condo and mobile-home units each have an APN on the whole common lot. `load.py` drops APNs whose polygon is identical to another APN's, since they aren't buildable land.
- **Zone rules source:** `raw/code/ord4308.pdf` is Ordinance 4308 (2024), which restates §210.06 for RL, RM, RMH, RMH-A, RH, and RMP. It doesn't include parking (Ch. 231) or specific plans, and the spot-check should confirm it is still the current code.
- **Vacancy:** comes from the assessor land-use code in the city parcel layer (`hb_parcel_attrs.geojson`), checked against improvement value and building size. `vacant_confidence` is the chance the lot is vacant; 0.5 means no land-use code and nothing assessed, so check imagery.
- **Eligibility scope:** `eligibility.py` applies only the spec's state rules. It doesn't model SB 684's other exclusions (recent tenants, rent-controlled or affordable units, historic sites, hazard zones) or local density, and treats all of Huntington Beach as substantially surrounded by urban uses.
- **Comments:** keep them minimal, as in `../site/CLAUDE.md`.
