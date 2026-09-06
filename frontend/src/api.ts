/** Loads the published snapshot and derives the views the UI renders from it. */

import type { FuelCode, Snapshot, Station, StationView } from "./types";

const DATA_URL = "/data/stations.json";

export async function loadSnapshot(): Promise<Snapshot> {
  const response = await fetch(DATA_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Kon de prijzen niet laden (${response.status})`);
  }
  return (await response.json()) as Snapshot;
}

/** Great circle distance in kilometres. */
export function distanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const earthRadius = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

export interface ViewOptions {
  fuel: FuelCode;
  origin: { lat: number; lng: number } | null;
  radiusKm: number | null;
  sort: "price" | "distance";
}

/**
 * Resolve the selected fuel per station, apply the radius, and sort.
 *
 * Stations without a price for the selected fuel are kept rather than dropped:
 * they still belong on the map, and hiding them would quietly overstate coverage.
 */
export function buildViews(stations: Station[], options: ViewOptions): StationView[] {
  const { fuel, origin, radiusKm, sort } = options;

  const views: StationView[] = stations.map((station) => ({
    ...station,
    selectedPrice: station.prices.find((price) => price.fuel === fuel) ?? null,
    distanceKm: origin
      ? distanceKm(origin.lat, origin.lng, station.lat, station.lng)
      : null,
  }));

  const withinRadius =
    origin && radiusKm
      ? views.filter((view) => (view.distanceKm ?? Infinity) <= radiusKm)
      : views;

  return withinRadius.sort((a, b) => {
    if (sort === "distance" && origin) {
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    }
    const priceA = a.selectedPrice?.price ?? Infinity;
    const priceB = b.selectedPrice?.price ?? Infinity;
    if (priceA !== priceB) return priceA - priceB;
    return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  });
}

/**
 * Waze universal link. The https form opens the app when installed and falls back
 * to the Waze web map when it is not, unlike the waze:// scheme which fails silently.
 */
export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
}

export function formatPrice(value: number): string {
  return value.toFixed(3).replace(".", ",");
}

/** How stale a price is, in whole days, or null when the stamp is unreadable. */
export function ageInDays(iso: string): number | null {
  const stamp = Date.parse(iso);
  if (Number.isNaN(stamp)) return null;
  return Math.floor((Date.now() - stamp) / 86_400_000);
}
