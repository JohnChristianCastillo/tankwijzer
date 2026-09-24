# Tankwijzer

Brandstofprijzen bij DATS 24 in Belgie, in het Nederlands, met de officiele
maximumprijs van de FOD Economie ernaast, en het verloop van die maximumprijs sinds
2018. Euro 95 (E10) staat standaard aan.

A static site. Prices are precomputed into JSON files by a scheduled job, so the
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
  app/sources/energia.py  the only file that knows how Energia shapes its exports
  tools/snapshot.py       the batch job that writes the snapshot
  tools/history.py        the batch job that writes the maximum price history
  tests/                  parser tests against real captured records
frontend/
  src/api.ts              loading, distance, sorting, the Waze link
  src/geo.ts              postcode to map centre, from the station data itself
  src/history.ts          history windows, step lookups, axis ticks
  src/prefs.ts            localStorage for fuel, sort, radius and history range
  src/components/         Controls, StationMap, StationCard, PriceHistory, Footer
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
python tools/history.py                # maximum price history, only the recent years
python tools/history.py --full         # rebuild the history from 2018
python tests/test_dats24.py            # parser tests, no network
python tests/test_energia.py

# site, from frontend/
npm install
npm run dev
npm run build
```

The snapshot writes `frontend/public/data/stations.json` and the history job writes
`history.json` next to it. Both are gitignored and reach production through the
orphan `data` branch, never through `main`.

`snapshot.py` refuses to overwrite a good snapshot with one covering far fewer
stations, and `history.py` refuses to write a history shorter than the last one.
Pass `--force` when the change is real.

## Price history

The chart shows the official maximum price, not a pump price, because no source
has years of Belgian pump prices. FOD Economie only publishes the current tariff;
Energia, the fuel federation, republishes the full daily history per year since
2018. The history holds change points only, since the maximum is a step function:
about 320 per fuel, around 20 KB for Euro 95, diesel and Super 98 together. CNG is
not part of the FOD tariff and has no history.

## Data and attribution

Prices from DATS 24, as they publish them. Official maximum prices from FOD Economie,
carried in the same records. The history of the maximum price from the
[Energia databank](https://www.energiafed.be/nl/maximumprijzen/databank). Map tiles and geography from OpenStreetMap, under ODbL.

Independent hobby project, not affiliated with DATS 24. Prices are informational; the
price on the pump is the one that counts.
