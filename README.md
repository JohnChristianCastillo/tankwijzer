# Tankwijzer

Brandstofprijzen bij DATS 24 in Belgie, in het Nederlands, met de officiele
maximumprijs van de FOD Economie ernaast. Euro 95 (E10) staat standaard aan.

A static site. Prices are precomputed into one JSON file by a scheduled job, so the
published page calls no API at all and nothing has to be running for it to work.

## Why only DATS 24

Belgium has no per-station price obligation and no government dataset, so there is no
open source of real pump prices. Of the major networks, DATS 24 is the only one that
publishes its own prices, which it does as structured records on its own site,
including the official FOD maximum per fuel. The others treat the price as something
you learn at the pump.

Stations of other brands are therefore absent rather than shown without a price. A
price this project cannot source is not a price it invents.

## Layout

```
backend/
  app/models.py           Station and FuelPrice, the published data contract
  app/sources/dats24.py   the only file that knows how DATS 24 shapes its pages
  tools/snapshot.py       the batch job that writes the snapshot
  tests/                  parser tests against a real captured record
frontend/
  src/api.ts              loading, distance, sorting, the Waze link
  src/geo.ts              postcode to map centre, from the station data itself
  src/prefs.ts            localStorage for fuel, sort and radius
  src/components/         Controls, StationMap, StationCard, Footer
  src/styles/             one stylesheet per concern, no inline styles
scripts/                  snapshot to data branch, and the Cloudflare build
.github/workflows/        the twice daily refresh
wrangler.jsonc            Workers config, at the repo root
```

## Running it

```bash
# snapshot, from backend/
pip install -r requirements.txt
python tools/snapshot.py --limit 5     # quick check
python tools/snapshot.py               # all 147 stations, about three minutes
python tests/test_dats24.py            # parser tests, no network

# site, from frontend/
npm install
npm run dev
npm run build
```

The snapshot writes `frontend/public/data/stations.json`, which is gitignored. It
reaches production through the orphan `data` branch, never through `main`.

`snapshot.py` refuses to overwrite a good snapshot with one covering far fewer
stations. Pass `--force` when a drop in coverage is real.

## Data and attribution

Prices from DATS 24, as they publish them. Official maximum prices from FOD Economie,
carried in the same records. Map tiles and geography from OpenStreetMap, under ODbL.

Independent hobby project, not affiliated with DATS 24. Prices are informational; the
price on the pump is the one that counts.
