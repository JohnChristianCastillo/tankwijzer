/** Fuel switcher, location controls and sorting. E95 is the default everywhere. */

import { FUELS, type FuelCode } from "../types";

interface Props {
  fuel: FuelCode;
  onFuel: (fuel: FuelCode) => void;
  sort: "price" | "distance";
  onSort: (sort: "price" | "distance") => void;
  radiusKm: number | null;
  onRadius: (radius: number | null) => void;
  hasOrigin: boolean;
  locating: boolean;
  onLocate: () => void;
  onClearLocation: () => void;
  postcode: string;
  onPostcode: (value: string) => void;
}

const RADII = [5, 10, 15, 25];

export function Controls({
  fuel,
  onFuel,
  sort,
  onSort,
  radiusKm,
  onRadius,
  hasOrigin,
  locating,
  onLocate,
  onClearLocation,
  postcode,
  onPostcode,
}: Props) {
  return (
    <div className="controls">
      <div className="control-group" role="group" aria-label="Brandstof">
        {FUELS.map((item) => (
          <button
            key={item.code}
            type="button"
            className={item.code === fuel ? "chip is-active" : "chip"}
            onClick={() => onFuel(item.code)}
          >
            {item.short}
          </button>
        ))}
      </div>

      <div className="control-group">
        <input
          className="postcode-input"
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="Postcode"
          value={postcode}
          onChange={(event) => onPostcode(event.target.value.replace(/\D/g, ""))}
          aria-label="Postcode"
        />
        <button type="button" className="chip" onClick={onLocate} disabled={locating}>
          {locating ? "Zoeken..." : "Mijn positie"}
        </button>
        {hasOrigin && (
          <button type="button" className="chip" onClick={onClearLocation}>
            Heel Belgie
          </button>
        )}
      </div>

      <div className="control-group">
        <label className="control-label" htmlFor="sort">
          Sorteer
        </label>
        <select
          id="sort"
          className="select"
          value={sort}
          onChange={(event) => onSort(event.target.value as "price" | "distance")}
        >
          <option value="price">op prijs</option>
          <option value="distance" disabled={!hasOrigin}>
            op afstand
          </option>
        </select>

        <label className="control-label" htmlFor="radius">
          Straal
        </label>
        <select
          id="radius"
          className="select"
          value={radiusKm ?? ""}
          disabled={!hasOrigin}
          onChange={(event) =>
            onRadius(event.target.value ? Number(event.target.value) : null)
          }
        >
          {RADII.map((value) => (
            <option key={value} value={value}>
              {value} km
            </option>
          ))}
          <option value="">alles</option>
        </select>
      </div>
    </div>
  );
}
