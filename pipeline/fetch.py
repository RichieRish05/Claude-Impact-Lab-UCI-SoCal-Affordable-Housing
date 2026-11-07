"""Download the source layers into raw/ as GeoJSON in EPSG:4326."""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "raw"

# Huntington Beach zoning extent, padded slightly. load.py clips parcels to the zoning coverage.
HB_ENVELOPE = {
    "geometry": "-118.09,33.62,-117.93,33.765",
    "geometryType": "esriGeometryEnvelope",
    "inSR": "4326",
    "spatialRel": "esriSpatialRelIntersects",
}

SOURCES = {
    "oc_landbase_hb.geojson": {
        "url": "https://ocgis.com/arcpub/rest/services/LegalLotsAttributeOpenData/FeatureServer/0/query",
        "filter": HB_ENVELOPE,
    },
    "hb_zoning.geojson": {
        "url": "https://gis.huntingtonbeachca.gov/arcgis/rest/services/Planning/MapServer/1/query",
        "filter": {},
    },
}

# Offset paging skips and repeats rows on these servers, so fetch by explicit object IDs.
CHUNK = 500


def get_json(url, params, tries=4):
    body = urllib.parse.urlencode(params).encode()
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, data=body, timeout=180) as resp:
                data = json.load(resp)
            if "error" in data:
                raise RuntimeError(data["error"])
            return data
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


def fetch(name, src):
    ids = get_json(src["url"], {"where": "1=1", "returnIdsOnly": "true", "f": "json", **src["filter"]})["objectIds"]
    ids = sorted(set(ids))
    features = []
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i : i + CHUNK]
        params = {"objectIds": ",".join(map(str, chunk)), "outFields": "*", "outSR": "4326", "f": "geojson"}
        page = get_json(src["url"], params)["features"]
        if len(page) != len(chunk):
            raise RuntimeError(f"{name}: asked for {len(chunk)} ids, got {len(page)}")
        features.extend(page)
        print(f"{name}: {len(features)}/{len(ids)}", flush=True)
    out = RAW / name
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"wrote {out} ({len(features)} features)")


if __name__ == "__main__":
    RAW.mkdir(exist_ok=True)
    for name in sys.argv[1:] or list(SOURCES):
        fetch(name, SOURCES[name])
