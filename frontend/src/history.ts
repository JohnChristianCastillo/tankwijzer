/** Range maths for the price history chart: windows, lines per source, ticks and dates.

Two kinds of line share one window. The FOD maximum is a step function, one value
in force until the next tariff, so it is the price in force at the window start
plus every change inside it. DATS 24 is one observed row per day, and a stretch
with no observation is a gap, not a guess. Days are whole UTC day numbers, which
keeps daylight saving out of it.
*/

import type { PriceHistory, SourceKey } from "./types";

export type RangeKey = "1W" | "1M" | "3M" | "1J" | "5J" | "ALL";

export const RANGES: { key: RangeKey; short: string; label: string }[] = [
  { key: "1W", short: "1W", label: "1 week" },
  { key: "1M", short: "1M", label: "1 maand" },
  { key: "3M", short: "3M", label: "3 maanden" },
  { key: "1J", short: "1J", label: "1 jaar" },
  { key: "5J", short: "5J", label: "5 jaar" },
  { key: "ALL", short: "Alles", label: "alles" },
];

export const DEFAULT_RANGE: RangeKey = "1J";

export function isRangeKey(value: unknown): value is RangeKey {
  return RANGES.some((range) => range.key === value);
}

/**
 * Every product the history knows. The four station fuels share their codes with
 * the fuel switcher, so the chart can follow it. The rest only exist as an FOD
 * maximum, and CNG only as a DATS 24 price.
 */
export const PRODUCTS: { code: string; label: string }[] = [
  { code: "E10", label: "Euro 95 (E10)" },
  { code: "E5", label: "Euro 95 (E5)" },
  { code: "SP98", label: "Super 98 (E5)" },
  { code: "SP98_E10", label: "Super 98 (E10)" },
  { code: "GO", label: "Diesel (B7)" },
  { code: "B10", label: "Diesel (B10)" },
  { code: "XTL", label: "Diesel XTL (HVO)" },
  { code: "LPG", label: "LPG" },
  { code: "CNG", label: "CNG" },
];

/** Fixed order, and each source keeps its colour whatever else is shown. */
export const SOURCES: { key: SourceKey; label: string; long: string }[] = [
  { key: "fod", label: "Maximumprijs", long: "Officiele maximumprijs" },
  { key: "dats24", label: "DATS 24", long: "DATS 24, mediaan van de stations" },
];

export const ALL_SOURCES: SourceKey[] = SOURCES.map((source) => source.key);

export function isSourceList(value: unknown): value is SourceKey[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => ALL_SOURCES.includes(item as SourceKey))
  );
}

/** Which sources have any data at all for a product. */
export function sourcesFor(history: PriceHistory, product: string): SourceKey[] {
  return ALL_SOURCES.filter((key) => (history.sources[key]?.series[product]?.length ?? 0) > 0);
}

/** The first day DATS 24 prices were kept, as shown in the credits. */
export function dats24Since(history: PriceHistory): number | null {
  const firsts = Object.values(history.sources.dats24?.series ?? {})
    .filter((rows) => rows && rows.length > 0)
    .map((rows) => dayNumber(rows![0][0]));
  return firsts.length > 0 ? Math.min(...firsts) : null;
}

export interface Step {
  day: number;
  price: number;
}

/** DATS 24 only: the spread between the cheapest and dearest station that day. */
export interface Spread {
  day: number;
  cheapest: number;
  dearest: number;
  stations: number;
}

export interface Line {
  source: SourceKey;
  /** FOD: the price in force at the start, then each change. DATS 24: one per day. */
  steps: Step[];
  spreads: Spread[];
  /** DATS 24 only: days this far apart or more are drawn as a gap. */
  maxGap: number | null;
  current: Step;
  /** The day the current price began, from the full history, not just the window. */
  currentSince: number;
  low: Step;
  high: Step;
}

export interface ChartWindow {
  start: number;
  end: number;
  lines: Line[];
}

const DAY_MS = 86_400_000;

// Runs are twice a day, so a day or two missing is a failed run and the price
// most likely held. Longer than this and the line breaks rather than pretends.
const DATS24_MAX_GAP = 3;

export function dayNumber(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function toDate(day: number): Date {
  return new Date(day * DAY_MS);
}

/** The first day of the window that ends on `end`, in calendar terms. */
function rangeStart(end: number, key: RangeKey, first: number): number {
  const date = toDate(end);
  switch (key) {
    case "1W":
      return Math.max(first, end - 7);
    case "1M":
      date.setUTCMonth(date.getUTCMonth() - 1);
      break;
    case "3M":
      date.setUTCMonth(date.getUTCMonth() - 3);
      break;
    case "1J":
      date.setUTCFullYear(date.getUTCFullYear() - 1);
      break;
    case "5J":
      date.setUTCFullYear(date.getUTCFullYear() - 5);
      break;
    case "ALL":
      return first;
  }
  return Math.max(first, date.getTime() / DAY_MS);
}

/**
 * Slice the history to one window for one product and the chosen sources. The
 * window ends when the history was last built, so a stale file never claims to
 * know today's price, and starts no earlier than the oldest data being shown.
 */
export function buildWindow(
  history: PriceHistory,
  product: string,
  sources: SourceKey[],
  key: RangeKey,
): ChartWindow | null {
  const fod = sources.includes("fod") ? (history.sources.fod?.series[product] ?? []) : [];
  const dats24 = sources.includes("dats24") ? (history.sources.dats24?.series[product] ?? []) : [];
  if (fod.length === 0 && dats24.length === 0) return null;

  const edges = (rows: { 0: string }[]) =>
    rows.length > 0 ? [dayNumber(rows[0][0]), dayNumber(rows[rows.length - 1][0])] : [];
  const fodEdges = edges(fod);
  const datsEdges = edges(dats24);
  const firsts = [fodEdges[0], datsEdges[0]].filter((day) => day !== undefined);
  const lasts = [fodEdges[1], datsEdges[1]].filter((day) => day !== undefined);

  const end = Math.max(dayNumber(history.generated), ...lasts);
  const start = rangeStart(end, key, Math.min(...firsts));

  const lines: Line[] = [];

  if (fod.length > 0) {
    const all: Step[] = fod.map(([iso, price]) => ({ day: dayNumber(iso), price }));
    const steps: Step[] = [];
    if (all[0].day <= start) steps.push({ day: start, price: priceAt(all, start) });
    for (const step of all) {
      if (step.day > start && step.day <= end) steps.push(step);
    }
    const inForce = all.filter((step) => step.day <= end);
    const since = inForce.length > 0 ? inForce[inForce.length - 1].day : all[0].day;
    if (steps.length > 0) lines.push(finish("fod", steps, [], null, since));
  }

  if (dats24.length > 0) {
    const rows = dats24.filter(([iso]) => dayNumber(iso) >= start);
    const steps = rows.map(([iso, median]) => ({ day: dayNumber(iso), price: median }));
    const spreads = rows.map(([iso, , cheapest, dearest, stations]) => ({
      day: dayNumber(iso),
      cheapest,
      dearest,
      stations,
    }));
    // Walk back through the full series while the median held, across runs
    // that were close enough together to count as unbroken.
    let first = dats24.length - 1;
    while (
      first > 0 &&
      dats24[first - 1][1] === dats24[first][1] &&
      dayNumber(dats24[first][0]) - dayNumber(dats24[first - 1][0]) < DATS24_MAX_GAP
    ) {
      first -= 1;
    }
    const since = dayNumber(dats24[first][0]);
    if (steps.length > 0) lines.push(finish("dats24", steps, spreads, DATS24_MAX_GAP, since));
  }

  return lines.length > 0 ? { start, end, lines } : null;
}

function finish(
  source: SourceKey,
  steps: Step[],
  spreads: Spread[],
  maxGap: number | null,
  currentSince: number,
): Line {
  let low = steps[0];
  let high = steps[0];
  for (const step of steps) {
    if (step.price < low.price) low = step;
    if (step.price > high.price) high = step;
  }
  const current = steps[steps.length - 1];
  return { source, steps, spreads, maxGap, current, currentSince, low, high };
}

/** The price in force on `day`: the last step on or before it. */
export function priceAt(steps: Step[], day: number): number {
  let price = steps[0].price;
  for (const step of steps) {
    if (step.day > day) break;
    price = step.price;
  }
  return price;
}

/**
 * What a line says about one day, or null when it says nothing: before its
 * first point, or inside a DATS 24 gap.
 */
export function readingAt(
  line: Line,
  day: number,
): { price: number; spread: Spread | null } | null {
  if (day < line.steps[0].day) return null;
  if (line.maxGap === null) return { price: priceAt(line.steps, day), spread: null };

  let index = -1;
  for (let i = 0; i < line.steps.length && line.steps[i].day <= day; i += 1) index = i;
  if (index < 0 || day - line.steps[index].day >= line.maxGap) return null;
  return { price: line.steps[index].price, spread: line.spreads[index] ?? null };
}

export interface Tick {
  day: number;
  label: string;
}

/** Date ticks that suit the span, thinned so labels never touch at `width` pixels. */
export function timeTicks(start: number, end: number, width: number): Tick[] {
  const span = end - start;
  const ticks: Tick[] = [];

  if (span <= 10) {
    for (let day = Math.ceil(start); day <= end; day += 1) {
      ticks.push({ day, label: shortDate(day) });
    }
  } else if (span <= 45) {
    // Mondays. 1 January 1970, day 0, was a Thursday.
    for (let day = Math.ceil(start); day <= end; day += 1) {
      if ((day + 3) % 7 === 0) ticks.push({ day, label: shortDate(day) });
    }
  } else if (span <= 400) {
    const date = toDate(start);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    while (date.getTime() / DAY_MS <= end) {
      const month = date.getUTCMonth();
      ticks.push({
        day: date.getTime() / DAY_MS,
        label: month === 0 ? String(date.getUTCFullYear()) : MONTHS[month],
      });
      date.setUTCMonth(month + 1);
    }
  } else {
    for (let year = toDate(start).getUTCFullYear() + 1; ; year += 1) {
      const day = Date.UTC(year, 0, 1) / DAY_MS;
      if (day > end) break;
      ticks.push({ day, label: String(year) });
    }
  }

  const fit = Math.max(2, Math.floor(width / 56));
  const every = Math.ceil(ticks.length / fit);
  return ticks.filter((_, index) => index % every === 0);
}

/**
 * Round price ticks around the data, about five of them. A flat week still gets
 * a few cents of room, so an unchanged price reads as flat rather than magnified.
 */
export function priceTicks(low: number, high: number): number[] {
  const middle = (low + high) / 2;
  const spread = Math.max(high - low, 0.04);
  const bottom = Math.min(low, middle - spread / 2);
  const top = Math.max(high, middle + spread / 2);
  const raw = spread / 5;
  const step = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5].find((s) => s >= raw) ?? 1;
  const first = Math.floor((bottom - spread * 0.03) / step) * step;
  const last = Math.ceil((top + spread * 0.03) / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= last + step / 2; value += step) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return ticks;
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function shortDate(day: number): string {
  const date = toDate(day);
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}`;
}

/** "do 24 sep 2026" */
export function longDate(day: number): string {
  const date = toDate(day);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "24/09/2026" */
export function numericDate(day: number): string {
  const date = toDate(day);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}
