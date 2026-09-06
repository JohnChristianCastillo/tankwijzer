"""Reads DATS 24 station prices from the records DATS 24 publishes on its own site.

Every station page at dats24.be embeds a complete JSON record in the Next.js
__NEXT_DATA__ script tag: coordinates, address, per-fuel price, the official FOD
maximum for that fuel, and per-pump availability. This module finds those pages
through the site's own sitemap and turns each record into a Station.

This is the only file that knows how DATS 24 shapes its pages. When they change
their markup, this is the file to fix, and tests/fixtures the place to look.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone

import requests

from ..models import FuelPrice, Station

SITEMAP_URL = "https://dats24.be/sitemap/nl/fueling.xml"
USER_AGENT = "tankwijzer/0.1 (personal non-commercial fuel price viewer)"

# DATS 24 product codes mapped onto the codes this project uses everywhere else.
# AdBlue and hydrogen are priced per station too, so they are carried through and
# shown on the station detail, but they are not fuels the main switcher offers.
FUEL_CODES = {
    "U": ("E10", "Euro 95 (E10)"),
    "P": ("SP98", "Super 98"),
    "D": ("GO", "Diesel"),
    "C": ("CNG", "CNG"),
    "A": ("ADBLUE", "AdBlue"),
    "W": ("H2", "Waterstof"),
}

NEXT_DATA = re.compile(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


class Dats24Error(Exception):
    """Raised when a page loads but does not contain the record we expect."""


class Dats24Source:
    """Fetches and parses the DATS 24 station pages."""

    name = "dats24"

    def __init__(self, delay: float = 0.7, timeout: int = 30) -> None:
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self._last_request = 0.0

    def station_urls(self) -> list[str]:
        """Return every fuel station page listed in the DATS 24 sitemap."""
        xml = self._get(SITEMAP_URL)
        return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)

    def fetch_station(self, url: str) -> Station:
        """Fetch one station page and parse its embedded record."""
        return self.parse_station(self._get(url), url)

    def parse_station(self, html: str, url: str) -> Station:
        """Turn a station page into a Station. Kept separate so fixtures can drive it."""
        match = NEXT_DATA.search(html)
        if match is None:
            raise Dats24Error(f"no __NEXT_DATA__ block in {url}")

        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError as err:
            raise Dats24Error(f"__NEXT_DATA__ in {url} is not valid JSON") from err

        detail = _find_dict_with(payload, "FuelStation")
        if detail is None:
            raise Dats24Error(f"no station record in {url}")

        station_id = str(detail.get("id") or "").strip()
        if not station_id:
            raise Dats24Error(f"station record in {url} has no id")

        prices = _parse_prices(detail.get("FuelStation") or {})
        pumps = (detail.get("FuelStation") or {}).get("FuelPump") or []

        return Station(
            id=f"dats24:{station_id}",
            name=_station_name(detail),
            brand="DATS 24",
            lat=float(detail.get("latitude") or 0.0),
            lng=float(detail.get("longitude") or 0.0),
            address=_address(detail),
            postcode=str(detail.get("addressPostCode") or "").strip(),
            city=str(detail.get("addressCity") or "").strip(),
            available=str(detail.get("availability") or "").upper() == "AVAILABLE",
            prices=prices,
            pumps_total=len(pumps),
            pumps_available=sum(
                1 for pump in pumps if str(pump.get("availability", "")).upper() == "AVAILABLE"
            ),
            updated=_updated_at(payload),
            source=self.name,
            source_url=url,
        )

    def _get(self, url: str) -> str:
        """Rate limited GET. The delay is politeness, not a workaround for anything."""
        elapsed = time.monotonic() - self._last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)

        response = self.session.get(url, timeout=self.timeout)
        self._last_request = time.monotonic()
        response.raise_for_status()
        return response.text


def _parse_prices(fuel_station: dict) -> list[FuelPrice]:
    """Build the price list, keeping products we have no mapping for under their own code."""
    prices: list[FuelPrice] = []

    for product in fuel_station.get("FuelProduct") or []:
        raw_price = product.get("priceEuro")
        if raw_price in (None, ""):
            continue

        code = str(product.get("code") or "").strip()
        fuel, label = FUEL_CODES.get(
            code, (code or "UNKNOWN", str(product.get("nameDutch") or code))
        )

        prices.append(
            FuelPrice(
                fuel=fuel,
                label=label,
                price=float(raw_price),
                ceiling=_optional_float(product.get("officialPriceEuro")),
            )
        )

    return prices


def _station_name(detail: dict) -> str:
    name = str(detail.get("name") or "").strip()
    return f"DATS 24 {name}" if name else "DATS 24"


def _address(detail: dict) -> str:
    street = str(detail.get("addressStreet") or "").strip()
    number = str(detail.get("addressNumber") or "").strip()
    return f"{street} {number}".strip()


def _updated_at(payload: dict) -> str:
    """The record carries its own freshness stamp in epoch milliseconds."""
    stamp = _find_value(payload, "last_updated_detail")
    if isinstance(stamp, (int, float)) and stamp > 0:
        return datetime.fromtimestamp(stamp / 1000, tz=timezone.utc).isoformat()
    return datetime.now(tz=timezone.utc).isoformat()


def _optional_float(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _find_dict_with(node: object, key: str) -> dict | None:
    """Depth first search for the first dict carrying `key`."""
    if isinstance(node, dict):
        if key in node:
            return node
        for value in node.values():
            found = _find_dict_with(value, key)
            if found is not None:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _find_dict_with(value, key)
            if found is not None:
                return found
    return None


def _find_value(node: object, key: str) -> object | None:
    owner = _find_dict_with(node, key)
    return owner.get(key) if owner else None
