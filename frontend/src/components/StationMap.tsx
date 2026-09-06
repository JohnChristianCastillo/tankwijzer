/** The map. Each station is a price pill rather than a pin, so the map reads as prices.

A tooltip that only appears on hover is invisible on a phone, so the price is
painted onto the marker itself and tapping opens the detail card instead.
*/

import { useEffect, useRef, useState } from "react";
import L from "leaflet";

import { formatPrice } from "../api";
import type { StationView } from "../types";

const BELGIUM_CENTER: [number, number] = [50.85, 4.35];

/**
 * Below this zoom the whole country is on screen and 147 price pills overlap
 * into an unreadable blob, so stations become plain dots and the prices come
 * back as soon as the map is zoomed into an area worth comparing.
 */
const PILL_MIN_ZOOM = 9;

interface Props {
  stations: StationView[];
  selectedId: string | null;
  origin: { lat: number; lng: number } | null;
  cheapestId: string | null;
  onSelect: (id: string) => void;
}

export function StationMap({ stations, selectedId, origin, cheapestId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const didFit = useRef(false);
  const [zoom, setZoom] = useState(8);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: true }).setView(BELGIUM_CENTER, 8);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: 'Kaart &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    map.on("zoomend", () => setZoom(map.getZoom()));

    // The container changes size when the layout crosses the two column
    // breakpoint, and Leaflet renders into a stale size until it is told.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const asPills = zoom >= PILL_MIN_ZOOM;

    for (const station of stations) {
      const price = station.selectedPrice;
      const classes = [asPills ? "price-pill" : "price-dot"];
      if (station.id === selectedId) classes.push("is-selected");
      if (station.id === cheapestId) classes.push("is-cheapest");
      if (!price) classes.push("is-unpriced");

      const size: [number, number] = asPills ? [54, 22] : [14, 14];
      const marker = L.marker([station.lat, station.lng], {
        icon: L.divIcon({
          className: "price-marker",
          html: `<span class="${classes.join(" ")}" title="${escapeHtml(station.name)}">${
            asPills ? (price ? formatPrice(price.price) : "?") : ""
          }</span>`,
          iconSize: size,
          iconAnchor: [size[0] / 2, size[1] / 2],
        }),
        keyboard: false,
      });

      marker.on("click", () => onSelect(station.id));
      marker.addTo(layer);
    }

    if (origin) {
      L.circleMarker([origin.lat, origin.lng], {
        radius: 7,
        className: "origin-marker",
      }).addTo(layer);
    }

    if (!didFit.current && stations.length > 0) {
      map.fitBounds(L.latLngBounds(stations.map((s) => [s.lat, s.lng] as [number, number])), {
        padding: [30, 30],
      });
      didFit.current = true;
    }
  }, [stations, selectedId, cheapestId, origin, onSelect, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const station = stations.find((item) => item.id === selectedId);
    if (station) {
      // Selecting a station is a request to look at it, so pull in close enough
      // for the prices around it to be readable.
      map.setView([station.lat, station.lng], Math.max(map.getZoom(), 12), { animate: true });
    }
  }, [selectedId, stations]);

  return <div className="station-map" ref={containerRef} role="application" aria-label="Kaart met tankstations" />;
}

/** Station names go into a title attribute, so they must not be able to close it. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
