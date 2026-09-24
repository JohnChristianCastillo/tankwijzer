/** Remembers the last fuel, sort, radius and history range in localStorage.

Every read is guarded: private windows and blocked site data make localStorage
throw rather than return nothing, and a first visit must still render.
*/

import { DEFAULT_RANGE, isRangeKey, type RangeKey } from "./history";
import type { FuelCode } from "./types";

const KEY = "tankwijzer.prefs.v1";

export interface Prefs {
  fuel: FuelCode;
  sort: "price" | "distance";
  radiusKm: number | null;
  historyRange: RangeKey;
}

export const DEFAULT_PREFS: Prefs = {
  fuel: "E10",
  sort: "price",
  radiusKm: 15,
  historyRange: DEFAULT_RANGE,
};

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const prefs = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    if (!isRangeKey(prefs.historyRange)) prefs.historyRange = DEFAULT_RANGE;
    return prefs;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage is a convenience here. Losing it changes nothing that matters.
  }
}
