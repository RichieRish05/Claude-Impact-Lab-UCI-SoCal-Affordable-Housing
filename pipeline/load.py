"""Step 1: load OC landbase parcels, clip to Huntington Beach, assign each a zone, write to parcels."""

import os
import re
import string
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely
from dotenv import load_dotenv
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import create_engine, text

RAW = Path(__file__).parent / "raw"
AREA_CRS = "EPSG:2230"  # CA State Plane VI, US feet


def read_zoning():
    z = gpd.read_file(RAW / "hb_zoning.geojson")
    z = z.rename(columns={"DATA.Zoning.Base": "code", "DATA.Zoning.ZoneType": "zone_type"})
    z["zone"] = [district(c, t) for c, t in zip(z["code"], z["zone_type"])]
    return z[["code", "zone", "geometry"]].to_crs(AREA_CRS)


def district(code, zone_type):
    # District that zone_rules is keyed by: "RL-CZ-O" -> RL, "(Q)RMH-A" -> RMH-A, "SP14" -> SP14.
    # RMH-A is a subdistrict with its own column in the §210.06 standards.
    base = re.sub(r"^\(Q\)", "", code)
    if base.startswith("RMH-A"):
        return "RMH-A"
    if zone_type in ("Q", "SP"):
        return base.split("-")[0]
    return zone_type


def read_parcels():
    p = gpd.read_file(RAW / "oc_landbase_hb.geojson")
    p["apn"] = p["AssessmentNo"].fillna("").str.strip()
    p = p[p["apn"] != ""]
    p["assessed_value"] = assessed_value(p)
    # One APN can span several legal-lot polygons.
    attrs = p.drop(columns="geometry").groupby("apn").first()
    geom = p[["apn", "geometry"]].to_crs(AREA_CRS).dissolve(by="apn")
    parcels = geom.join(attrs[["SiteAddress", "SiteCityState", "assessed_value"]]).reset_index()
    return drop_shared_lots(parcels)


def drop_shared_lots(parcels):
    # Condo and mobile-home units carry their own APN on the whole common lot; they aren't buildable land.
    key = parcels.geometry.normalize().to_wkb()
    shared = key.map(key.value_counts()) > 1
    print(f"dropped {shared.sum()} unit APNs on {key[shared].nunique()} shared lots")
    return parcels[~shared]


def assessed_value(p):
    num = lambda c: pd.to_numeric(p[c].replace("", None), errors="coerce")
    # Vacant land has no improved value, which a plain + would turn into a missing total.
    total = num("AssdAmt").fillna(num("LandVal").add(num("ImprovedVal"), fill_value=0))
    return total.round().astype("Int64")


def assign_zones(parcels, zoning):
    # Zone with the largest overlap; parcels not touching HB zoning are outside the city.
    pieces = gpd.overlay(parcels[["apn", "geometry"]], zoning[["zone", "geometry"]], how="intersection", keep_geom_type=True)
    pieces["area"] = pieces.area
    best = pieces.sort_values("area", ascending=False).drop_duplicates("apn")
    best = best[best["area"] >= 0.5 * parcels.set_index("apn").loc[best["apn"]].area.values]
    return parcels.merge(best[["apn", "zone"]], on="apn", how="inner")


def address(row):
    if pd.isna(row.SiteAddress):
        return None
    # "NA" marks a missing house number, and the street that follows is often a
    # placeholder far from the lot, so it would send people to the wrong place.
    site = row.SiteAddress.strip()
    if not site or re.match(r"NA\b", site):
        return None
    street = string.capwords(site)
    city = string.capwords(row.SiteCityState) if pd.notna(row.SiteCityState) else "Huntington Beach"
    return f"{street}, {city}, CA"


def drop_unaddressed(parcels):
    # Lots with no site address can't be found or checked by a user, and are mostly strips and common land.
    missing = parcels["address"].isna()
    print(f"dropped {missing.sum()} parcels with no site address")
    return parcels[~missing]


def to_multi(g):
    # make_valid can return a GeometryCollection with stray lines; keep only the polygons.
    polys = [p for p in shapely.get_parts(g) if isinstance(p, (Polygon, MultiPolygon))]
    return MultiPolygon([q for p in polys for q in shapely.get_parts(p)])


def build():
    zoning = read_zoning()
    parcels = read_parcels()
    print(f"parcels in download: {len(parcels)}")
    parcels = assign_zones(parcels, zoning)
    print(f"parcels in Huntington Beach: {len(parcels)}")
    parcels["lot_sqft"] = parcels.area.round().astype(int)
    parcels["address"] = parcels.apply(address, axis=1)
    parcels = drop_unaddressed(parcels)
    out = parcels[["apn", "address", "zone", "lot_sqft", "assessed_value", "geometry"]].to_crs("EPSG:4326")
    out["geometry"] = out.geometry.make_valid().apply(to_multi)
    return out.rename_geometry("geom")


def write(out):
    load_dotenv(Path(__file__).parent / ".env")
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.begin() as conn:
        # The load replaces every parcel, including the FAKE- rows; later steps refill the derived columns.
        deleted = conn.execute(text("DELETE FROM parcels")).rowcount
        out.to_postgis("parcels", conn, if_exists="append", index=False, chunksize=5000)
    print(f"deleted {deleted} rows, wrote {len(out)} parcels")


if __name__ == "__main__":
    out = build()
    print(out["zone"].value_counts().to_string())
    if "--dry-run" not in sys.argv:
        write(out)
