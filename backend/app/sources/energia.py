"""Reads the history of the official FOD maximum prices from the Energia exports.

FOD Economie sets the legal maximum per fuel every working day, but only publishes
the current tariff. Energia, the Belgian fuel federation, republishes the full
history as one spreadsheet per year, back to 2018:

    https://www.energiafed.be/nl/dms_maximumprijs_export/daily/{year}

Each sheet has one row per tariff date, newest first, and one column per product.
A blank cell means that product did not change on that date, so the sheet is
already a list of change points. This module turns it into exactly that.

This is the only file that knows how Energia shapes its export. Cross-checked on
2026-09-24 against the Statbel daily series for the last 365 days: no differences.
"""

from __future__ import annotations

import time
from datetime import date, datetime

import requests
import xlrd

EXPORT_URL = "https://www.energiafed.be/nl/dms_maximumprijs_export/daily/{year}"
USER_AGENT = "tankwijzer/0.1 (personal non-commercial fuel price viewer)"

# The first year Energia offers.
FIRST_YEAR = 2018

# Export column headers mapped onto the codes this project uses everywhere else.
# Every product sold at a pump is read. E10, SP98 and GO are the codes DATS 24
# uses too. Heating oil, bulk propane and the other products delivered by truck
# are left out: they are not bought at a station, and heating oil changes almost
# every working day, which would triple the file for no one using this app.
# CNG is not part of the FOD tariff, so it has no history to read.
COLUMNS = {
    "Benzine 95 RON - E10": "E10",
    "Benzine 95 RON - E5": "E5",
    "Benzine 98 RON - E5": "SP98",
    "Benzine 98 RON - E10": "SP98_E10",
    "Diesel - B7": "GO",
    "Diesel - B10": "B10",
    "Diesel - XTL": "XTL",
    "LPG": "LPG",
}

HEADER_ROW = 2
DATE_FORMAT = "%d/%m/%Y"

Change = tuple[date, float]


class EnergiaError(Exception):
    """Raised when an export loads but does not have the shape we expect."""


class EnergiaSource:
    """Fetches and parses the yearly Energia exports of the FOD maximum prices."""

    name = "energia"

    def __init__(self, delay: float = 1.0, timeout: int = 60) -> None:
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self._last_request = 0.0

    def fetch_year(self, year: int) -> dict[str, list[Change]]:
        """Fetch one year and return its change points per fuel, oldest first."""
        wait = self.delay - (time.monotonic() - self._last_request)
        if wait > 0:
            time.sleep(wait)
        response = self.session.get(EXPORT_URL.format(year=year), timeout=self.timeout)
        self._last_request = time.monotonic()
        response.raise_for_status()
        return self.parse_year(response.content, year)

    def parse_year(self, content: bytes, year: int) -> dict[str, list[Change]]:
        """Turn one yearly export into change points. Kept separate so fixtures can drive it."""
        try:
            # The export is written by a generator that leaves a harmless defect in
            # the file's internal directory. Excel ignores it; xlrd needs to be told to.
            book = xlrd.open_workbook(file_contents=content, ignore_workbook_corruption=True)
        except xlrd.XLRDError as err:
            raise EnergiaError(f"export for {year} is not a readable spreadsheet") from err

        sheet = book.sheet_by_index(0)
        if sheet.nrows <= HEADER_ROW:
            raise EnergiaError(f"export for {year} has no header row")

        header = [str(value) for value in sheet.row_values(HEADER_ROW)]
        columns = {code: _column(header, label, year) for label, code in COLUMNS.items()}

        series: dict[str, list[Change]] = {code: [] for code in columns}
        for row in range(HEADER_ROW + 1, sheet.nrows):
            stamp = sheet.cell_value(row, 0)
            if not stamp:
                continue
            try:
                day = datetime.strptime(str(stamp), DATE_FORMAT).date()
            except ValueError as err:
                raise EnergiaError(f"unreadable date {stamp!r} in the {year} export") from err

            for code, column in columns.items():
                value = sheet.cell_value(row, column)
                if value == "":
                    continue
                series[code].append((day, round(float(value), 4)))

        for points in series.values():
            points.sort()
        return series


def _column(header: list[str], label: str, year: int) -> int:
    for index, text in enumerate(header):
        if text.startswith(label):
            return index
    raise EnergiaError(f"no column {label!r} in the {year} export")
