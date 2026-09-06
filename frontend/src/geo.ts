/** Turns a typed postcode into a map centre, using only the station data we already have.

There is no geocoder here on purpose. The published snapshot covers the whole
country, so the stations themselves are a good enough gazetteer: an exact postcode
match when one exists, otherwise the centre of the postal zone sharing the first
two digits. That keeps the app fully static and adds no runtime dependency.
*/

import type { Station } from "./types";

export interface Point {
  lat: number;
  lng: number;
}

export function centreForPostcode(stations: Station[], postcode: string): Point | null {
  if (postcode.length !== 4) return null;

  const exact = stations.filter((station) => station.postcode === postcode);
  if (exact.length > 0) return centroid(exact);

  const zone = stations.filter((station) => station.postcode.startsWith(postcode.slice(0, 2)));
  if (zone.length > 0) return centroid(zone);

  return null;
}

function centroid(stations: Station[]): Point {
  const total = stations.reduce(
    (sum, station) => ({ lat: sum.lat + station.lat, lng: sum.lng + station.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: total.lat / stations.length, lng: total.lng / stations.length };
}
