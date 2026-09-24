"""Holds the archive to its one promise: observations are added, never lost.

Everything runs in a temporary folder, never against the real archive.

    python tests/test_archive.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import archive  # noqa: E402
from app.models import FuelPrice, Station  # noqa: E402

MORNING = datetime(2026, 9, 24, 5, 3, 1, tzinfo=timezone.utc)


def _station(number: str, e10: float) -> Station:
    return Station(
        id=f"dats24:{number}", name=number, brand="DATS 24", lat=51.0, lng=3.7,
        address="", postcode="9000", city="Gent", available=True,
        prices=[FuelPrice("E10", "Euro 95 (E10)", e10, 2.058)],
    )


def test_records_prices_by_station_and_fuel() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = archive.record("dats24", MORNING, [_station("37", 1.9191)], root)

        assert path == root / "dats24" / "2026-09.json", path
        assert archive.load("dats24", root) == {"2026-09-24T05:03:01Z": {"37": {"E10": 1.919}}}


def test_recording_twice_changes_nothing() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        archive.record("dats24", MORNING, [_station("37", 1.919)], root)
        before = (root / "dats24" / "2026-09.json").read_text(encoding="utf-8")
        archive.record("dats24", MORNING, [_station("37", 1.919)], root)
        after = (root / "dats24" / "2026-09.json").read_text(encoding="utf-8")

        assert before == after


def test_later_runs_are_added_not_replaced() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        archive.record("dats24", MORNING, [_station("37", 1.919)], root)
        archive.record("dats24", MORNING + timedelta(hours=10), [_station("37", 1.899)], root)
        archive.record("dats24", MORNING + timedelta(days=7), [_station("37", 1.889)], root)

        observations = archive.load("dats24", root)
        assert len(observations) == 3, observations
        assert list(observations) == sorted(observations), "not oldest first"
        assert (root / "dats24" / "2026-10.json").exists(), "October went into September"


def test_a_corrupt_month_stops_the_run() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "dats24").mkdir()
        (root / "dats24" / "2026-09.json").write_text("{truncated", encoding="utf-8")
        try:
            archive.record("dats24", MORNING, [_station("37", 1.919)], root)
        except json.JSONDecodeError:
            content = (root / "dats24" / "2026-09.json").read_text(encoding="utf-8")
            assert content == "{truncated", "the corrupt file was overwritten"
            return
        raise AssertionError("a corrupt month was silently replaced")


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
    print("all archive tests passed" if not failures else f"{failures} test(s) failed")
    raise SystemExit(1 if failures else 0)
