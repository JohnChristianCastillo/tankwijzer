"""Holds the DATS 24 parser to its contract, using a real record captured from their site.

The fixture is the actual record shape, trimmed of the CMS content around it. When
DATS 24 change their markup this test is what fails first, and refreshing the
fixture is how you see exactly what changed.

    python tests/test_dats24.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.sources.dats24 import Dats24Source  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "station_drongen.html"
URL = "https://dats24.be/nl/particulier/sdp/tankstation-gent-drongen_37"


def test_parses_a_station() -> None:
    station = Dats24Source().parse_station(FIXTURE.read_text(encoding="utf-8"), URL)

    assert station.id == "dats24:37", station.id
    assert station.brand == "DATS 24"
    assert station.city == "Gent"
    assert station.postcode == "9000"
    assert station.address == "Drongensesteenweg 197"
    assert 51.0 < station.lat < 51.1, station.lat
    assert 3.6 < station.lng < 3.8, station.lng
    assert station.source_url == URL


def test_maps_fuels_and_carries_the_ceiling() -> None:
    station = Dats24Source().parse_station(FIXTURE.read_text(encoding="utf-8"), URL)

    e10 = station.price_for("E10")
    assert e10 is not None, "the E10 price is the one the whole app defaults to"
    assert 1.0 < e10.price < 3.0, e10.price
    assert e10.ceiling is not None and e10.ceiling >= e10.price, (e10.price, e10.ceiling)

    assert station.price_for("GO") is not None, "diesel should map from code D"
    assert {price.fuel for price in station.prices} <= {
        "E10",
        "SP98",
        "GO",
        "CNG",
        "ADBLUE",
        "H2",
    }, "an unmapped product code slipped through"


def test_reads_pump_availability_and_freshness() -> None:
    station = Dats24Source().parse_station(FIXTURE.read_text(encoding="utf-8"), URL)

    assert station.pumps_total > 0
    assert 0 <= station.pumps_available <= station.pumps_total
    assert station.updated.startswith("20"), station.updated


if __name__ == "__main__":
    failures = 0
    for name, test in sorted(globals().items()):
        if not name.startswith("test_") or not callable(test):
            continue
        try:
            test()
            print(f"  ok    {name}")
        except AssertionError as err:
            failures += 1
            print(f"  FAIL  {name}: {err}")
    print("all parser tests passed" if not failures else f"{failures} test(s) failed")
    raise SystemExit(1 if failures else 0)
