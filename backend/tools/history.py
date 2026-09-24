"""Builds the price history the site charts: the official FOD maximum per fuel over time.

Run it from backend/. It writes frontend/public/data/history.json next to the
station snapshot, and reaches production the same way, through the data branch.

The file holds change points only, one [date, price] pair each time the tariff
moved, because the maximum price is a step function: it holds until the next
tariff. Since 2018 that is a few hundred points per fuel, a few kilobytes.

A normal run re-reads only the years that can still change, from the year of the
newest known point to now, and keeps everything older from the previous file.

    python tools/history.py              update the existing history
    python tools/history.py --full       rebuild everything from 2018
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.sources.energia import COLUMNS, FIRST_YEAR, EnergiaError, EnergiaSource  # noqa: E402

OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "history.json"

Series = dict[str, list[tuple[date, float]]]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Tankwijzer price history.")
    parser.add_argument("--full", action="store_true", help=f"rebuild from {FIRST_YEAR}")
    parser.add_argument("--out", type=Path, default=OUTPUT, help="output file")
    parser.add_argument("--force", action="store_true", help="write even if history shrank")
    args = parser.parse_args()

    today = datetime.now(tz=timezone.utc).date()
    previous = None if args.full else _load(args.out)

    if previous:
        newest = max(points[-1][0] for points in previous.values() if points)
        start_year = newest.year
        print(f"existing history up to {newest}, re-reading {start_year} to {today.year}")
    else:
        start_year = FIRST_YEAR
        print(f"building the full history, {FIRST_YEAR} to {today.year}")

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
            return 1
        for code, points in year_series.items():
            fresh[code].extend(points)
        print(f"  {year}: {sum(len(points) for points in year_series.values())} changes")

    cutoff = date(start_year, 1, 1)
    merged: Series = {}
    for code in COLUMNS.values():
        kept = [point for point in (previous or {}).get(code, []) if point[0] < cutoff]
        merged[code] = _collapse(kept + sorted(fresh[code]))

    if not all(merged.values()):
        print("a fuel came back with no history at all, refusing to write")
        return 1

    if previous and not args.force and not _is_growth(previous, merged):
        return 1

    payload = {
        "generated": datetime.now(tz=timezone.utc).isoformat(),
        "source": "FOD Economie, via Energia",
        "sourceUrl": "https://www.energiafed.be/nl/maximumprijzen/databank",
        "series": {
            code: [[day.isoformat(), price] for day, price in points]
            for code, points in merged.items()
        },
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    size_kb = args.out.stat().st_size / 1024
    for code, points in merged.items():
        first, last = points[0], points[-1]
        print(f"{code}: {len(points)} changes, {first[0]} {first[1]} to {last[0]} {last[1]}")
    print(f"\nwrote {args.out}, {size_kb:.1f} KB")
    return 0


def _load(path: Path) -> Series | None:
    """The previous history, or None when there is none worth building on."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return {
            code: [(date.fromisoformat(day), float(price)) for day, price in points]
            for code, points in raw["series"].items()
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
                f"refusing to publish: {code} has {len(after)} changes now against "
                f"{len(points)} before. Pass --force if this is real."
            )
            return False
    return True


if __name__ == "__main__":
    raise SystemExit(main())
