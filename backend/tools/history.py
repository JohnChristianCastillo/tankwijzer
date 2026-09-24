"""Builds the price history the site charts, one block per source so each can be switched off.

Run it from backend/. It writes frontend/public/data/history.json next to the
station snapshot, and reaches production the same way, through the data branch.

Two sources, kept apart on purpose:

- fod: the official FOD maximum per pump fuel since 2018, from the Energia
  exports. Change points only, [day, price], because the maximum is a step
  function that holds until the next tariff. A normal run re-reads only the
  years that can still change and keeps everything older.
- dats24: what DATS 24 actually charged, one row per day, [day, median,
  cheapest, dearest, stations]. Derived from the archive on every run, so the
  archive stays the only source of truth and this block can always be rebuilt.

If Energia is unreachable the previous FOD block is kept and the DATS 24 block
still updates, so one broken upstream never freezes the other.

    python tools/history.py              update
    python tools/history.py --full       re-read the FOD history from 2018
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app import archive  # noqa: E402
from app.sources.energia import COLUMNS, FIRST_YEAR, EnergiaError, EnergiaSource  # noqa: E402

OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "history.json"

# The DATS 24 fuels anyone picks a station by. AdBlue and hydrogen stay in the
# archive but get no chart line.
DATS24_FUELS = {"E10", "SP98", "GO", "CNG"}

Series = dict[str, list[tuple[date, float]]]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Tankwijzer price history.")
    parser.add_argument("--full", action="store_true", help=f"re-read FOD from {FIRST_YEAR}")
    parser.add_argument("--out", type=Path, default=OUTPUT, help="output file")
    parser.add_argument("--force", action="store_true", help="write even if FOD history shrank")
    args = parser.parse_args()

    previous = _load_fod(args.out)
    fod, fod_ok = _update_fod(previous, args.full, args.force)
    if not fod:
        print("no FOD history at all, refusing to write")
        return 1

    dats24 = archive.daily_summary(archive.load("dats24"), DATS24_FUELS)
    for fuel, rows in dats24.items():
        print(f"dats24 {fuel}: {len(rows)} days, {rows[0][0]} to {rows[-1][0]}")

    payload = {
        "generated": datetime.now(tz=timezone.utc).isoformat(),
        "sources": {
            "fod": {
                "series": {
                    code: [[day.isoformat(), price] for day, price in points]
                    for code, points in fod.items()
                },
            },
            "dats24": {"series": dats24},
        },
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"\nwrote {args.out}, {args.out.stat().st_size / 1024:.1f} KB")

    if not fod_ok:
        print("the FOD block is the previous one, its update failed")
        return 1
    return 0


def _update_fod(previous: Series | None, full: bool, force: bool) -> tuple[Series | None, bool]:
    """The new FOD series and whether the update worked. Falls back to `previous`."""
    today = datetime.now(tz=timezone.utc).date()

    # A product that is new since the last run has no older years to keep.
    complete = previous is not None and set(COLUMNS.values()) <= set(previous)
    if complete and not full:
        newest = max(points[-1][0] for points in previous.values() if points)
        start_year = newest.year
        print(f"FOD history up to {newest}, re-reading {start_year} to {today.year}")
    else:
        start_year = FIRST_YEAR
        print(f"building the full FOD history, {FIRST_YEAR} to {today.year}")

    source = EnergiaSource()
    fresh: Series = {code: [] for code in COLUMNS.values()}

    for year in range(start_year, today.year + 1):
        try:
            year_series = source.fetch_year(year)
        except (EnergiaError, OSError) as err:
            # The first days of January can come before the new year's first tariff,
            # so an empty or missing current year is expected then, and only then.
            if year == today.year and today.month == 1:
                print(f"  {year}: nothing published yet, skipped")
                continue
            print(f"  {year}: FAILED, {err}")
            return previous, False
        for code, points in year_series.items():
            fresh[code].extend(points)
        print(f"  {year}: {sum(len(points) for points in year_series.values())} changes")

    cutoff = date(start_year, 1, 1)
    merged: Series = {}
    for code in COLUMNS.values():
        kept = [point for point in (previous or {}).get(code, []) if point[0] < cutoff]
        merged[code] = _collapse(kept + sorted(fresh[code]))

    if not all(merged.values()):
        print("a fuel came back with no FOD history at all")
        return previous, False

    if previous and not force and not _is_growth(previous, merged):
        return previous, False

    for code, points in merged.items():
        print(f"fod {code}: {len(points)} changes, {points[0][0]} to {points[-1][0]}")
    return merged, True


def _load_fod(path: Path) -> Series | None:
    """The previous FOD history, or None when there is none worth building on."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        # The first format had a single source and kept its series at the top.
        series = raw["sources"]["fod"]["series"] if "sources" in raw else raw["series"]
        return {
            code: [(date.fromisoformat(day), float(price)) for day, price in points]
            for code, points in series.items()
        }
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _collapse(points: list[tuple[date, float]]) -> list[tuple[date, float]]:
    """Drop repeated dates and points that restate the price already in force."""
    by_day = dict(points)
    result: list[tuple[date, float]] = []
    for day in sorted(by_day):
        if result and result[-1][1] == by_day[day]:
            continue
        result.append((day, by_day[day]))
    return result


def _is_growth(previous: Series, merged: Series) -> bool:
    """History only ever grows. A shorter series means a bad read, not a change."""
    for code, points in previous.items():
        after = merged.get(code, [])
        if len(after) < len(points) or (after and after[-1][0] < points[-1][0]):
            print(
                f"refusing the FOD update: {code} has {len(after)} changes now against "
                f"{len(points)} before. Pass --force if this is real."
            )
            return False
    return True


if __name__ == "__main__":
    raise SystemExit(main())
