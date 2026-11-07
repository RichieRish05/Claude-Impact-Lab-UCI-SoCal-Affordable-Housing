# CLAUDE.md

The offline data jobs from the "Data and eligibility engine" section of `../site/PRODUCT_SPECS.MD`: load parcels and zoning into PostGIS, extract zone rules with the LLM, compute per-parcel eligibility, and store the results. The app only reads the columns these jobs fill. None of the steps are written yet.

## Setup and commands

```bash
uv sync                          # install dependencies into .venv
cp .env.example .env             # then fill in DATABASE_URL and ANTHROPIC_API_KEY
uv add <package>                 # add a dependency; never pip install
uv run python <script>.py        # run a step
```

Put source downloads (parcel landbase, zoning layer, code text) in `raw/`, which is gitignored.

## Rules

- **Prisma owns the schema.** Every table is defined in `../site/prisma/schema.prisma`, following the schema-change rules in `../site/CLAUDE.md`. Jobs here only write rows, so never run `CREATE`, `ALTER`, or `DROP TABLE`, and call GeoPandas `to_postgis` or pandas `to_sql` with `if_exists="append"`, never `"replace"`, which drops and recreates the table.
- **Fake parcels:** `parcels` starts with made-up rows whose APNs begin with `FAKE-` (see `../site/prisma/fake-parcels.sql`). Delete them with `DELETE FROM parcels WHERE apn LIKE 'FAKE-%'` before loading real parcels.
- **Geometry:** `parcels.geom` is `geometry(MultiPolygon, 4326)`, so reproject to EPSG:4326 and convert single polygons to MultiPolygon before writing.
- **Eligibility lives here only.** SB 684/1123 checks, `max_homes`, and `eligibility_reason` are computed in this folder and stored. The app reads the stored columns and never reimplements the rules.
- **The LLM extracts zone rules once.** Store the source section with each zone's rules, and don't use a zone until a person has spot-checked it against the code text.
- **Database URL:** use Neon's direct host, without `-pooler`, because bulk loads can fail through PgBouncer. SQLAlchemy needs the `postgresql+psycopg://` scheme.
- **Comments:** keep them minimal, as in `../site/CLAUDE.md`.
