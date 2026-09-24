"""The permanent record of every price observation, one JSON file per source per month.

The station snapshot is replaced on every run, so without this nothing observed
yesterday would survive. Unlike the FOD history, which can always be downloaded
again, these observations can never be fetched after the fact: a price DATS 24
showed last week is gone from their site. This archive is the only copy, so it is
append only and nothing here ever deletes.

    archive/dats24/2026-09.json
    {"2026-09-24T18:53:19Z": {"37": {"E10": 1.919, "GO": 2.259}, ...}, ...}

One entry per run, keyed by when the run observed it, then station id, then fuel.
The ceiling is left out on purpose: it is the same national number for every
station and lives in the FOD history already.

The archive sits on the data branch next to the published snapshot, but is not
part of the site: cf-build.sh only ships the data/ folder.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .models import Station

ROOT = Path(__file__).resolve().parents[2] / "archive"

# observed timestamp -> station id -> fuel -> price
Observations = dict[str, dict[str, dict[str, float]]]


def record(source: str, observed: datetime, stations: list[Station], root: Path = ROOT) -> Path:
    """Add one run's prices to the month file for `observed`. Recording twice is harmless."""
    prices = {
        station.id.split(":", 1)[-1]: {price.fuel: price.price for price in station.prices}
        for station in stations
    }
    return record_prices(source, observed, prices, root)


def record_prices(
    source: str,
    observed: datetime,
    prices: dict[str, dict[str, float]],
    root: Path = ROOT,
) -> Path:
    """Add prices already keyed by station id and fuel, as record() and imports produce."""
    stamp = observed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    path = root / source / f"{stamp[:7]}.json"

    month = _read(path)
    month[stamp] = {
        station: {fuel: round(price, 3) for fuel, price in fuels.items()}
        for station, fuels in prices.items()
        if fuels
    }

    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = dict(sorted(month.items()))
    path.write_text(json.dumps(ordered, separators=(",", ":")), encoding="utf-8")
    return path


def load(source: str, root: Path = ROOT) -> Observations:
    """Every observation for one source, oldest first."""
    observations: Observations = {}
    for path in sorted((root / source).glob("*.json")):
        observations.update(_read(path))
    return dict(sorted(observations.items()))


def _read(path: Path) -> Observations:
    if not path.exists():
        return {}
    # A month file that does not parse is a real problem, not an empty month.
    # Failing here stops the run before a rewrite could replace it with less.
    return json.loads(path.read_text(encoding="utf-8"))
