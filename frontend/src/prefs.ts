/** Remembers the last fuel, sort, radius, history range and sources in localStorage.

Every read is guarded: private windows and blocked site data make localStorage
throw rather than return nothing, and a first visit must still render.
*/

import { ALL_SOURCES, DEFAULT_RANGE, isRangeKey, isSourceList, type RangeKey } from "./history";
import type { FuelCode, SourceKey } from "./types";

const KEY = "tankwijzer.prefs.v1";

export interface Prefs {
  fuel: FuelCode;
  sort: "price" | "distance";
  radiusKm: number | null;
  historyRange: RangeKey;
  historySources: SourceKey[];
}

export const DEFAULT_PREFS: Prefs = {
  fuel: "E10",
  sort: "price",
  radiusKm: 15,
  historyRange: DEFAULT_RANGE,
  historySources: ALL_SOURCES,
};

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const prefs = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    if (!isRangeKey(prefs.historyRange)) prefs.historyRange = DEFAULT_RANGE;
    if (!isSourceList(prefs.historySources)) prefs.historySources = ALL_SOURCES;
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
