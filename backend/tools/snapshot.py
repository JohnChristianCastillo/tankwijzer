"""Builds the static snapshot the site serves: every DATS 24 station and its prices.

Run it from backend/. It writes frontend/public/data/stations.json, which is the
only file the published site loads. Nothing here talks to a database and nothing
runs at request time.

    python tools/snapshot.py                  full run
    python tools/snapshot.py --limit 5        quick check against a few stations
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.models import Station  # noqa: E402
from app.sources.dats24 import Dats24Error, Dats24Source  # noqa: E402

OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "stations.json"

# A run that loses most of the network is a broken run, not a real change in the world.
MIN_KEEP_RATIO = 0.8


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Tankwijzer station snapshot.")
    parser.add_argument("--limit", type=int, default=0, help="stop after N stations")
    parser.add_argument("--delay", type=float, default=0.7, help="seconds between requests")
    parser.add_argument("--out", type=Path, default=OUTPUT, help="output file")
    parser.add_argument("--force", action="store_true", help="write even if coverage dropped")
    args = parser.parse_args()

    source = Dats24Source(delay=args.delay)

    print("reading the DATS 24 sitemap")
    urls = source.station_urls()
    if args.limit:
        urls = urls[: args.limit]
    print(f"{len(urls)} station pages to fetch")

    stations: list[Station] = []
    failures: list[str] = []

    for index, url in enumerate(urls, start=1):
        try:
            station = source.fetch_station(url)
        except (Dats24Error, Exception) as err:  # noqa: BLE001
            failures.append(f"{url}: {err}")
            print(f"  [{index}/{len(urls)}] FAILED {url}")
            continue

        stations.append(station)
        price = station.price_for("E10")
        shown = f"{price.price:.3f}" if price else "no E10"
        print(f"  [{index}/{len(urls)}] {station.name} {shown}")

    if not stations:
        print("no stations parsed, refusing to write an empty snapshot")
        return 1

    if not _coverage_is_sane(stations, args.out, args.force):
        return 1

    snapshot = {
        "generated": datetime.now(tz=timezone.utc).isoformat(),
        "sources": ["dats24"],
        "ceilings": _ceilings(stations),
        "stations": [station.to_dict() for station in stations],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")

    size_kb = args.out.stat().st_size / 1024
    print(f"\nwrote {args.out} with {len(stations)} stations, {size_kb:.0f} KB")
    if failures:
        print(f"{len(failures)} pages failed:")
        for failure in failures[:10]:
            print(f"  {failure}")

    return 0


def _ceilings(stations: list[Station]) -> dict[str, float]:
    """The official FOD maximum per fuel, taken as the value most stations agree on.

    Every station reports the same national ceiling, so disagreement means one
    record is stale rather than that the ceiling varies by location.
    """
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)

    for station in stations:
        for price in station.prices:
            if price.ceiling is not None:
                votes[price.fuel][price.ceiling] += 1

    return {fuel: counter.most_common(1)[0][0] for fuel, counter in votes.items()}


def _coverage_is_sane(stations: list[Station], out: Path, force: bool) -> bool:
    """Refuse to replace a good snapshot with a much smaller one, unless told to."""
    if force or not out.exists():
        return True

    try:
        previous = json.loads(out.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return True

    before = len(previous.get("stations", []))
    if before and len(stations) < before * MIN_KEEP_RATIO:
        print(
            f"refusing to publish: {len(stations)} stations now against {before} before. "
            "Pass --force if this drop is real."
        )
        return False

    return True


if __name__ == "__main__":
    raise SystemExit(main())
