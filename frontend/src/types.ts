/** The shape of the published snapshot. Must match backend/app/models.py. */

export type FuelCode = "E10" | "SP98" | "GO" | "CNG" | "ADBLUE" | "H2";

/**
 * The fuels the switcher offers, E95 first because it is the default.
 * AdBlue and hydrogen are priced per station too and appear on the station
 * detail, but nobody chooses a station by their AdBlue price.
 */
export const FUELS: { code: FuelCode; label: string; short: string }[] = [
  { code: "E10", label: "Euro 95 (E10)", short: "E95" },
  { code: "GO", label: "Diesel", short: "Diesel" },
  { code: "SP98", label: "Super 98", short: "98" },
  { code: "CNG", label: "CNG", short: "CNG" },
];

export interface Price {
  fuel: FuelCode;
  label: string;
  price: number;
  ceiling: number | null;
}

export interface Station {
  id: string;
  name: string;
  brand: string;
  lat: number;
  lng: number;
  address: string;
  postcode: string;
  city: string;
  available: boolean;
  prices: Price[];
  pumpsTotal: number;
  pumpsAvailable: number;
  updated: string;
  source: string;
  sourceUrl: string;
}

export interface Snapshot {
  generated: string;
  sources: string[];
  ceilings: Partial<Record<FuelCode, number>>;
  stations: Station[];
}

/** A station with the selected fuel resolved, plus distance when a position is known. */
export interface StationView extends Station {
  selectedPrice: Price | null;
  distanceKm: number | null;
}
