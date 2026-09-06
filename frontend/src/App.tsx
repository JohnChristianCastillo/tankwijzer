/** Wires the snapshot, the controls and the two views (map and list) together. */

import { useEffect, useMemo, useState } from "react";

import { buildViews, formatPrice, loadSnapshot } from "./api";
import { centreForPostcode, type Point } from "./geo";
import { DEFAULT_PREFS, loadPrefs, savePrefs } from "./prefs";
import { Controls } from "./components/Controls";
import { StationCard, cardId } from "./components/StationCard";
import { StationMap } from "./components/StationMap";
import { Footer } from "./components/Footer";
import type { FuelCode, Snapshot } from "./types";

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [postcode, setPostcode] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
    // The hash names a station, so a link to one pump opens on that pump.
    const fromHash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (fromHash) setSelectedId(fromHash);
    loadSnapshot().then(setSnapshot).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    // Picking a pin on the map should also bring its card to you.
    const card = document.getElementById(cardId(selectedId));
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId, snapshot]);

  useEffect(() => {
    const hash = selectedId ? `#${encodeURIComponent(selectedId)}` : "";
    if (hash !== window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
    }
  }, [selectedId]);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    if (!snapshot) return;
    const centre = centreForPostcode(snapshot.stations, postcode);
    if (centre) {
      setOrigin(centre);
      setLocateError(null);
    }
  }, [postcode, snapshot]);

  const views = useMemo(() => {
    if (!snapshot) return [];
    return buildViews(snapshot.stations, {
      fuel: prefs.fuel,
      origin,
      radiusKm: origin ? prefs.radiusKm : null,
      sort: origin ? prefs.sort : "price",
    });
  }, [snapshot, prefs.fuel, prefs.radiusKm, prefs.sort, origin]);

  const priced = views.filter((view) => view.selectedPrice !== null);
  const cheapest = priced.length > 0 ? priced[0] : null;
  const ceiling = snapshot?.ceilings[prefs.fuel] ?? null;

  function locate() {
    if (!navigator.geolocation) {
      setLocateError("Deze browser geeft geen locatie door.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
        setPostcode("");
        setLocateError(null);
        setLocating(false);
      },
      () => {
        setLocateError("Locatie niet gelukt. Vul een postcode in.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  if (error) {
    return (
      <main className="shell">
        <h1 className="title">Tankwijzer</h1>
        <p className="notice notice-error">{error}</p>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="shell">
        <h1 className="title">Tankwijzer</h1>
        <p className="notice">Prijzen laden...</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="header">
        <h1 className="title">Tankwijzer</h1>
        <p className="subtitle">
          Brandstofprijzen bij DATS 24 in Belgie, met de officiele maximumprijs ernaast.
        </p>
      </header>

      <Controls
        fuel={prefs.fuel}
        onFuel={(fuel: FuelCode) => setPrefs({ ...prefs, fuel })}
        sort={prefs.sort}
        onSort={(sort) => setPrefs({ ...prefs, sort })}
        radiusKm={prefs.radiusKm}
        onRadius={(radiusKm) => setPrefs({ ...prefs, radiusKm })}
        hasOrigin={origin !== null}
        locating={locating}
        onLocate={locate}
        onClearLocation={() => {
          setOrigin(null);
          setPostcode("");
        }}
        postcode={postcode}
        onPostcode={setPostcode}
      />

      {locateError && <p className="notice notice-error">{locateError}</p>}

      <section className="summary">
        {ceiling !== null && (
          <p className="ceiling">
            Officiele maximumprijs vandaag: <strong>{formatPrice(ceiling)} EUR/L</strong>
            <span className="ceiling-source">FOD Economie</span>
          </p>
        )}
        {cheapest && cheapest.selectedPrice && (
          <p className="cheapest">
            Goedkoopste {origin ? "in de buurt" : "van het land"}:{" "}
            <strong>{formatPrice(cheapest.selectedPrice.price)}</strong> bij {cheapest.name}
            {cheapest.distanceKm !== null && ` op ${cheapest.distanceKm.toFixed(1)} km`}
          </p>
        )}
      </section>

      <StationMap
        stations={views}
        selectedId={selectedId}
        cheapestId={cheapest?.id ?? null}
        origin={origin}
        onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
      />

      <section className="results">
        <h2 className="results-title">
          {priced.length} van {views.length} stations met een prijs
        </h2>
        <ul className="station-list">
          {views.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              fuel={prefs.fuel}
              isSelected={station.id === selectedId}
              isCheapest={station.id === cheapest?.id}
              onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
            />
          ))}
          {views.length === 0 && (
            <li className="notice">Geen stations binnen deze straal. Vergroot de straal.</li>
          )}
        </ul>
      </section>

      <Footer generated={snapshot.generated} />
    </main>
  );
}
