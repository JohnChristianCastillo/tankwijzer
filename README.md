# Tankwijzer

Brandstofprijzen bij DATS 24 in Belgie, in het Nederlands, met de officiele
maximumprijs van de FOD Economie ernaast, en het prijsverloop: de maximumprijs sinds
2018 en de DATS 24 pompprijzen sinds 6 september 2026. Euro 95 (E10) staat standaard aan.

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
  app/archive.py          every price observation ever made, append only
  app/sources/dats24.py   the only file that knows how DATS 24 shapes its pages
  app/sources/energia.py  the only file that knows how Energia shapes its exports
  tools/snapshot.py       the batch job that writes the snapshot
  tools/history.py        the batch job that writes the history, per source
  tools/import_snapshots.py  puts older published snapshots into the archive
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
python tests/test_archive.py

# site, from frontend/
npm install
npm run dev
npm run build
```

The snapshot writes `frontend/public/data/stations.json` and records the same prices in
`archive/dats24/<month>.json`. The history job writes `history.json` next to the
snapshot. All of it is gitignored and reaches the orphan `data` branch through
`scripts/publish-data.sh`, never `main`. The site serves `data/` only; the archive
lives on the branch but is not part of the site.

`snapshot.py` refuses to overwrite a good snapshot with one covering far fewer
stations, and `history.py` refuses an FOD history shorter than the last one.
Pass `--force` when the change is real.

`publish-data.sh` refuses to push when any file on the data branch would disappear
or any archive file would get smaller. The archive is the only copy of DATS 24 prices
from the past, which cannot be fetched again, so a run that started from a missing
copy must fail rather than replace it. `ALLOW_DROP=1` overrides this.

## Price history

Two sources, kept apart so the chart can show either or both.

**The official maximum.** FOD Economie only publishes the current tariff. Energia,
the fuel federation, republishes the full daily history per year since 2018, which
they allow for non-commercial use with the source named. Change points only, since
the maximum holds until the next tariff: about 350 per fuel for the eight fuels sold
at a pump. Heating oil and other products delivered by truck are left out.

**DATS 24.** What DATS 24 actually charged, per day the median over all stations plus
the cheapest and dearest. Nobody publishes this history, so it only exists because
every run is kept in the archive. It starts on 6 September 2026: runs before the
archive existed were recovered from the data branch's overwritten commits and
imported with `tools/import_snapshots.py`.

`history.json` is about 58 KB, 13 KB gzipped. The DATS 24 part grows by roughly
65 KB a year, the archive by roughly 6 MB a year.

## Data and attribution

Prices from DATS 24, as they publish them. Official maximum prices from FOD Economie,
carried in the same records. The history of the maximum price from the
[Energia databank](https://www.energiafed.be/nl/maximumprijzen/databank), checked
against [Statbel](https://statbel.fgov.be/nl/themas/energie/aardolieprijzen). Map tiles and geography from OpenStreetMap, under ODbL.

Independent hobby project, not affiliated with DATS 24. Prices are informational; the
price on the pump is the one that counts.
