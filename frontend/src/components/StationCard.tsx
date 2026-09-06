/** One station in the list, and the expanded detail when it is the selected one. */

import { ageInDays, formatPrice, wazeUrl } from "../api";
import type { FuelCode, StationView } from "../types";

interface Props {
  station: StationView;
  fuel: FuelCode;
  isSelected: boolean;
  isCheapest: boolean;
  onSelect: (id: string) => void;
}

export function StationCard({ station, fuel, isSelected, isCheapest, onSelect }: Props) {
  const price = station.selectedPrice;
  const age = ageInDays(station.updated);
  const isStale = age !== null && age >= 2;

  const classes = ["station-card"];
  if (isSelected) classes.push("is-selected");
  if (isCheapest) classes.push("is-cheapest");
  if (!price) classes.push("is-unpriced");

  return (
    <li className={classes.join(" ")} id={cardId(station.id)}>
      <button
        type="button"
        className="station-card-head"
        onClick={() => onSelect(station.id)}
        aria-expanded={isSelected}
      >
        <span className="station-card-identity">
          <span className="station-card-name">{station.name}</span>
          <span className="station-card-place">
            {station.address}, {station.postcode} {station.city}
            {station.distanceKm !== null && (
              <span className="station-card-distance">{station.distanceKm.toFixed(1)} km</span>
            )}
          </span>
        </span>
        <span className="station-card-price">
          {price ? (
            <>
              <span className="amount">{formatPrice(price.price)}</span>
              <span className="unit">EUR/L</span>
              {price.ceiling !== null && (
                <span className="under-max">
                  {formatPrice(price.ceiling - price.price)} onder max
                </span>
              )}
            </>
          ) : (
            <span className="no-price">geen {fuel === "E10" ? "E95" : fuel}</span>
          )}
        </span>
      </button>

      {isSelected && (
        <div className="station-card-detail">
          <ul className="fuel-list">
            {station.prices.map((item) => (
              <li key={item.fuel} className={item.fuel === fuel ? "is-current" : undefined}>
                <span className="fuel-name">{item.label}</span>
                <span className="fuel-price">{formatPrice(item.price)} EUR/L</span>
                {item.ceiling !== null && (
                  <span className="fuel-ceiling">max {formatPrice(item.ceiling)}</span>
                )}
              </li>
            ))}
            {station.prices.length === 0 && <li className="fuel-empty">Geen prijzen bekend.</li>}
          </ul>

          <dl className="station-facts">
            <div>
              <dt>Pompen</dt>
              <dd>
                {station.pumpsTotal > 0
                  ? `${station.pumpsAvailable} van ${station.pumpsTotal} beschikbaar`
                  : "onbekend"}
              </dd>
            </div>
            <div>
              <dt>Bijgewerkt</dt>
              <dd className={isStale ? "is-stale" : undefined}>{describeAge(age)}</dd>
            </div>
            <div>
              <dt>Station</dt>
              <dd>{station.available ? "open" : "niet beschikbaar"}</dd>
            </div>
          </dl>

          <div className="station-actions">
            <a
              className="action action-primary"
              href={wazeUrl(station.lat, station.lng)}
              target="_blank"
              rel="noreferrer"
            >
              Navigeer met Waze
            </a>
            <a className="action" href={station.sourceUrl} target="_blank" rel="noreferrer">
              Bron: DATS 24
            </a>
          </div>
        </div>
      )}
    </li>
  );
}

/** Stable DOM id so the selected card can be scrolled into view. */
export function cardId(stationId: string): string {
  return `station-${stationId.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

function describeAge(age: number | null): string {
  if (age === null) return "onbekend";
  if (age <= 0) return "vandaag";
  if (age === 1) return "gisteren";
  return `${age} dagen geleden`;
}
