"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { decodePolyline } from "@/lib/polyline";

// Leaflet touches `window`/`document` as soon as its module is evaluated, so
// it can't be imported at the top level of a file that gets server-rendered
// (which "use client" components still are, for the initial HTML). Loading
// it dynamically inside useEffect keeps all of that client-only.
export default function RouteMap({ polyline }: { polyline: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current || mapRef.current) return;
      const points = decodePolyline(polyline);
      if (points.length < 2) return;

      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const line = L.polyline(points, { color: "#16a34a", weight: 4 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [16, 16] });

      // Circle markers (vector, not image-based) for start/end — sidesteps
      // the well-known issue where Leaflet's default icon images 404 under
      // most bundlers, without needing an icon asset workaround.
      L.circleMarker(points[0], { radius: 6, color: "#16a34a", fillColor: "#16a34a", fillOpacity: 1 }).addTo(map);
      L.circleMarker(points[points.length - 1], {
        radius: 6,
        color: "#dc2626",
        fillColor: "#dc2626",
        fillOpacity: 1,
      }).addTo(map);
    }

    init();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [polyline]);

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-lg border border-gray-200" />;
}
