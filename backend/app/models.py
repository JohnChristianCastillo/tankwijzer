"""Shared shapes for a fuel station and its prices, and their JSON form.

These are the only structures the snapshot writes and the frontend reads, so any
change here is a change to the published data contract.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FuelPrice:
    """One fuel at one station: what it costs and what the legal ceiling is."""

    fuel: str
    label: str
    price: float
    ceiling: float | None = None

    def to_dict(self) -> dict:
        return {
            "fuel": self.fuel,
            "label": self.label,
            "price": round(self.price, 3),
            "ceiling": round(self.ceiling, 4) if self.ceiling is not None else None,
        }


@dataclass
class Station:
    """One fuel station, with every price known for it at snapshot time."""

    id: str
    name: str
    brand: str
    lat: float
    lng: float
    address: str
    postcode: str
    city: str
    available: bool
    prices: list[FuelPrice] = field(default_factory=list)
    pumps_total: int = 0
    pumps_available: int = 0
    updated: str = ""
    source: str = ""
    source_url: str = ""

    def price_for(self, fuel: str) -> FuelPrice | None:
        for price in self.prices:
            if price.fuel == fuel:
                return price
        return None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "brand": self.brand,
            "lat": self.lat,
            "lng": self.lng,
            "address": self.address,
            "postcode": self.postcode,
            "city": self.city,
            "available": self.available,
            "prices": [price.to_dict() for price in self.prices],
            "pumpsTotal": self.pumps_total,
            "pumpsAvailable": self.pumps_available,
            "updated": self.updated,
            "source": self.source,
            "sourceUrl": self.source_url,
        }
