"""Holds the Energia export parser to its contract, using a real yearly export.

The fixture is the untouched 2021 export as Energia serves it, the year that also
checks the harder cases: a first row that sets every product and long runs of rows
where the fuels are blank because only heating oil moved.

    python tests/test_energia.py
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.sources.energia import EnergiaError, EnergiaSource  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "energia_daily_2021.xls"


def _parse() -> dict:
    return EnergiaSource().parse_year(FIXTURE.read_bytes(), 2021)


def test_reads_every_fuel_the_app_offers() -> None:
    series = _parse()

    assert set(series) == {"E10", "SP98", "GO"}, set(series)
    for code, points in series.items():
        assert points, f"no change points for {code}"


def test_change_points_are_oldest_first_and_inside_the_year() -> None:
    for code, points in _parse().items():
        days = [day for day, _ in points]
        assert days == sorted(days), f"{code} is not in date order"
        assert days[0].year == 2021 and days[-1].year == 2021, code


def test_matches_the_published_tariff() -> None:
    e10 = _parse()["E10"]

    assert e10[0] == (date(2021, 1, 1), 1.35), e10[0]
    assert e10[-1] == (date(2021, 12, 31), 1.7), e10[-1]
    assert len(e10) == 33, len(e10)


def test_blank_cells_are_not_read_as_changes() -> None:
    # Rows where only heating oil moved leave the fuels blank. Those must not
    # become zero prices or repeated points.
    for code, points in _parse().items():
        assert all(1.0 < price < 3.0 for _, price in points), code


def test_rejects_something_that_is_not_an_export() -> None:
    try:
        EnergiaSource().parse_year(b"<html>maintenance</html>", 2021)
    except EnergiaError:
        return
    raise AssertionError("an HTML page was accepted as an export")


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
