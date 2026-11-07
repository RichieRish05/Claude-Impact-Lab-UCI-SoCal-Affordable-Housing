"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { ParcelResult } from "@/app/api/trpc/parcels";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const HUNTINGTON_BEACH: [number, number] = [-118.0, 33.69];
const ELIGIBLE = "#e4f222";
const NOT_ELIGIBLE = "#a8a7a1";
const INK = "#191918";

// Order-independent, so re-sorting the same lots counts as the same results.
export function resultsKey(parcels: ParcelResult[]): string {
  return parcels
    .map((p) => p.apn)
    .sort()
    .join(",");
}

type Props = {
  parcels: ParcelResult[];
  selectedApn: string | null;
  onSelect: (apn: string) => void;
};

const fillColor = [
  "case",
  ["get", "eligible"],
  ELIGIBLE,
  NOT_ELIGIBLE,
] as maplibregl.ExpressionSpecification;

export function ParcelMap({ parcels, selectedApn, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE_URL,
      center: HUNTINGTON_BEACH,
      zoom: 11.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      map.addSource("parcels", { type: "geojson", data: empty });
      map.addSource("parcel-points", { type: "geojson", data: empty });

      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "parcels",
        minzoom: 14,
        paint: { "fill-color": fillColor, "fill-opacity": 0.7 },
      });
      map.addLayer({
        id: "parcel-outline",
        type: "line",
        source: "parcels",
        minzoom: 14,
        paint: { "line-color": INK, "line-width": 1 },
      });
      // Lots are a few hundred feet across, so at city zoom they need a marker.
      map.addLayer({
        id: "parcel-points",
        type: "circle",
        source: "parcel-points",
        maxzoom: 15,
        paint: {
          "circle-radius": 6,
          "circle-color": fillColor,
          "circle-stroke-color": INK,
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "selected-outline",
        type: "line",
        source: "parcels",
        filter: ["==", ["get", "apn"], ""],
        paint: { "line-color": INK, "line-width": 3 },
      });
      map.addLayer({
        id: "selected-point",
        type: "circle",
        source: "parcel-points",
        maxzoom: 15,
        filter: ["==", ["get", "apn"], ""],
        paint: {
          "circle-radius": 9,
          "circle-color": "transparent",
          "circle-stroke-color": INK,
          "circle-stroke-width": 3,
        },
      });

      for (const layer of ["parcel-fill", "parcel-points"]) {
        map.on("click", layer, (e) => {
          const apn = e.features?.[0]?.properties?.apn;
          if (typeof apn === "string") onSelectRef.current(apn);
        });
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      setReady(true);
    });

    mapRef.current = map;
    return () => {
      setReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  const apnKey = resultsKey(parcels);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const properties = (p: ParcelResult) => ({ apn: p.apn, eligible: !!p.sb684_eligible });
    (map.getSource("parcels") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: parcels.map((p) => ({
        type: "Feature",
        geometry: p.geometry,
        properties: properties(p),
      })),
    });
    (map.getSource("parcel-points") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: parcels.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: properties(p),
      })),
    });

    if (parcels.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const p of parcels) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
    }
    // Refit only when the set of lots changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, apnKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const filter: maplibregl.FilterSpecification = ["==", ["get", "apn"], selectedApn ?? ""];
    map.setFilter("selected-outline", filter);
    map.setFilter("selected-point", filter);

    const parcel = parcels.find((p) => p.apn === selectedApn);
    if (parcel) {
      map.easeTo({ center: [parcel.lng, parcel.lat], zoom: Math.max(map.getZoom(), 16) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedApn]);

  return <div ref={containerRef} className="size-full" />;
}
