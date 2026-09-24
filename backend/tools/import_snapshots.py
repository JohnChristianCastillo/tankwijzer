"""Adds published stations.json snapshots to the archive, for runs that predate it.

Every run before the archive existed overwrote the one before it on the data
branch. Those overwritten commits stay fetchable by hash for a while, and this
puts their prices where they belong. Each snapshot is recorded under its own
`generated` time, so importing the same file twice changes nothing.

    python tools/import_snapshots.py path/to/*.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import archive  # noqa: E402

# A snapshot this much smaller than a full run is a quick check, not a record.
MIN_STATIONS = 100


def main() -> int:
    parser = argparse.ArgumentParser(description="Import snapshots into the archive.")
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()

    for path in sorted(args.files):
        snapshot = json.loads(path.read_text(encoding="utf-8"))
        stations = snapshot["stations"]
        if len(stations) < MIN_STATIONS:
            print(f"  skipped {path.name}: only {len(stations)} stations")
            continue

        prices = {
            station["id"].split(":", 1)[-1]: {
                price["fuel"]: price["price"] for price in station["prices"]
            }
            for station in stations
        }
        observed = datetime.fromisoformat(snapshot["generated"])
        target = archive.record_prices(snapshot["sources"][0], observed, prices)
        print(f"  {path.name}: {len(prices)} stations -> {target.name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
