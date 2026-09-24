/** Range maths for the price history chart: windows, step lookups, ticks and dates.

The maximum price is a step function, one value in force until the next tariff,
so a window is described by the price in force at its start plus every change
inside it. Days are whole UTC day numbers, which keeps daylight saving out of it.
*/

import type { HistoryPoint } from "./types";

export type RangeKey = "1W" | "1M" | "3M" | "1J" | "5J" | "ALL";

export const RANGES: { key: RangeKey; short: string; label: string }[] = [
  { key: "1W", short: "1W", label: "1 week" },
  { key: "1M", short: "1M", label: "1 maand" },
  { key: "3M", short: "3M", label: "3 maanden" },
  { key: "1J", short: "1J", label: "1 jaar" },
  { key: "5J", short: "5J", label: "5 jaar" },
  { key: "ALL", short: "Alles", label: "alles sinds 2018" },
];

export const DEFAULT_RANGE: RangeKey = "1J";

export function isRangeKey(value: unknown): value is RangeKey {
  return RANGES.some((range) => range.key === value);
}

export interface Step {
  day: number;
  price: number;
}

export interface Window {
  start: number;
  end: number;
  /** The price in force at `start`, then every change up to `end`. */
  steps: Step[];
  current: Step;
  low: Step;
  high: Step;
}

const DAY_MS = 86_400_000;

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
 * Slice the full history to one window. `asOf` is when the history was last
 * read: the last known price is drawn up to that day and no further, so a stale
 * file never claims to know today's price.
 */
export function buildWindow(points: HistoryPoint[], key: RangeKey, asOf: string): Window | null {
  if (points.length === 0) return null;

  const all: Step[] = points.map(([iso, price]) => ({ day: dayNumber(iso), price }));
  const end = Math.max(all[all.length - 1].day, dayNumber(asOf));
  const start = rangeStart(end, key, all[0].day);

  const steps: Step[] = [{ day: start, price: priceAt(all, start) }];
  for (const step of all) {
    if (step.day > start && step.day <= end) steps.push(step);
  }

  let low = steps[0];
  let high = steps[0];
  for (const step of steps) {
    if (step.price < low.price) low = step;
    if (step.price > high.price) high = step;
  }

  return { start, end, steps, current: steps[steps.length - 1], low, high };
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

/** Round price ticks around the data, about four of them. */
export function priceTicks(low: number, high: number): number[] {
  const spread = Math.max(high - low, 0.02);
  const raw = spread / 4;
  const step = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5].find((s) => s >= raw) ?? 1;
  const first = Math.floor((low - spread * 0.08) / step) * step;
  const last = Math.ceil((high + spread * 0.08) / step) * step;
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
