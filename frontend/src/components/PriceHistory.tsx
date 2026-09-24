/** Price history chart: FOD maximum and DATS 24 pump prices, per product and range.

Each source is its own line with its own fixed colour, and the source chips are
both the legend and the filter, so "only DATS 24" is one tap. Hand drawn SVG
rather than a chart library, since two lines, one band and a crosshair do not
justify a dependency.
*/

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { formatPrice } from "../api";
import {
  PRODUCTS,
  RANGES,
  SOURCES,
  buildWindow,
  dats24Since,
  longDate,
  numericDate,
  priceTicks,
  readingAt,
  sourcesFor,
  timeTicks,
  type ChartWindow,
  type Line,
  type RangeKey,
  type Spread,
} from "../history";
import type { FuelCode, PriceHistory as History, SourceKey } from "../types";

interface Props {
  history: History;
  fuel: FuelCode;
  range: RangeKey;
  onRange: (range: RangeKey) => void;
  sources: SourceKey[];
  onSources: (sources: SourceKey[]) => void;
}

const HEIGHT = 260;
const MARGIN = { top: 14, right: 58, bottom: 30, left: 46 };
const SOURCE_LABEL: Record<SourceKey, string> = { fod: "Maximumprijs", dats24: "DATS 24" };

export function PriceHistory({ history, fuel, range, onRange, sources, onSources }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const [product, setProduct] = useState<string>(fuel);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // The chart follows the fuel switcher, and can still be pointed elsewhere.
  useEffect(() => setProduct(fuel), [fuel]);

  const available = sourcesFor(history, product);
  const chosen = sources.filter((key) => available.includes(key));
  // A product can lack the one source that is switched on, like CNG with only
  // the maximum chosen. Show what exists rather than an empty chart.
  const shown = chosen.length > 0 ? chosen : available;
  const shownKey = shown.join(",");
  const productLabel = PRODUCTS.find((item) => item.code === product)?.label ?? product;

  useEffect(() => setFocusDay(null), [product, range, shownKey]);

  const view = useMemo(
    () => buildWindow(history, product, shownKey.split(",") as SourceKey[], range),
    [history, product, shownKey, range],
  );

  function toggle(key: SourceKey) {
    if (shown.includes(key)) {
      if (shown.length === 1) return;
      onSources(shown.filter((item) => item !== key));
    } else {
      onSources(SOURCES.map((source) => source.key).filter((k) => k === key || shown.includes(k)));
    }
  }

  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-head">
        <div className="history-heading">
          <h2 className="history-title" id="history-title">
            Prijsverloop
          </h2>
          <select
            className="select"
            value={product}
            aria-label="Brandstof in de grafiek"
            onChange={(event) => setProduct(event.target.value)}
          >
            {PRODUCTS.filter((item) => sourcesFor(history, item.code).length > 0).map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
          <SourcesInfo history={history} />
        </div>

        <div className="history-filters">
          <div className="control-group" role="group" aria-label="Bronnen">
            {SOURCES.map((source) => {
              const has = available.includes(source.key);
              const on = shown.includes(source.key);
              return (
                <button
                  key={source.key}
                  type="button"
                  className={on ? "chip source-chip is-on" : "chip source-chip"}
                  aria-pressed={on}
                  disabled={!has || (on && shown.length === 1)}
                  title={has ? source.long : `Geen ${source.label} voor ${productLabel}`}
                  onClick={() => toggle(source.key)}
                >
                  <span className={`line-key key-${source.key}`} aria-hidden="true" />
                  {source.label}
                </button>
              );
            })}
          </div>
          <div className="control-group" role="group" aria-label="Periode">
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={item.key === range ? "chip is-active" : "chip"}
                aria-label={item.label}
                aria-pressed={item.key === range}
                onClick={() => onRange(item.key)}
              >
                {item.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="history-frame" ref={frameRef}>
        {view ? (
          <Chart
            view={view}
            width={width}
            productLabel={productLabel}
            focusDay={focusDay}
            onFocusDay={setFocusDay}
          />
        ) : (
          <p className="notice">Geen prijsverloop voor {productLabel}.</p>
        )}
      </div>
    </section>
  );
}

/** The circled i: who the numbers come from, and on what terms. */
function SourcesInfo({ history }: { history: History }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const since = dats24Since(history);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: globalThis.PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="info" ref={wrapRef}>
      <button
        type="button"
        className="info-button"
        aria-label="Bronnen"
        aria-expanded={open}
        aria-controls="history-sources"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <circle cx="10" cy="10" r="8.5" />
          <circle className="info-dot" cx="10" cy="6" r="1.2" />
          <path d="M10 9v5.5" />
        </svg>
      </button>
      {open && (
        <div className="info-panel" id="history-sources" role="dialog" aria-label="Bronnen">
          <h3>Bronnen</h3>
          <p>
            <span className="line-key key-fod" aria-hidden="true" />
            <strong>Officiele maximumprijs.</strong> Vastgelegd door de FOD Economie, Algemene
            Directie Energie, volgens de programmaovereenkomst. Het verloop sinds 2018 komt uit de{" "}
            <a
              href="https://www.energiafed.be/nl/maximumprijzen/databank"
              target="_blank"
              rel="noreferrer"
            >
              databank van Energia
            </a>
            , hergebruikt met bronvermelding voor niet-commercieel gebruik, en is nagekeken tegen de
            open data van{" "}
            <a
              href="https://statbel.fgov.be/nl/themas/energie/aardolieprijzen"
              target="_blank"
              rel="noreferrer"
            >
              Statbel
            </a>
            . Een plafond, geen pompprijs.
          </p>
          <p>
            <span className="line-key key-dats24" aria-hidden="true" />
            <strong>DATS 24.</strong> Pompprijzen zoals{" "}
            <a href="https://dats24.be" target="_blank" rel="noreferrer">
              DATS 24
            </a>{" "}
            ze zelf publiceert, twee keer per dag opgehaald
            {since !== null && <> en bewaard sinds {numericDate(since)}</>}. De lijn is per dag de
            mediaan van alle stations, de band loopt van de goedkoopste tot de duurste.
          </p>
          <p className="info-meta">Onafhankelijk hobbyproject, niet verbonden aan deze bronnen.</p>
        </div>
      )}
    </div>
  );
}

interface ChartProps {
  view: ChartWindow;
  width: number;
  productLabel: string;
  focusDay: number | null;
  onFocusDay: (day: number | null) => void;
}

function Chart({ view, width, productLabel, focusDay, onFocusDay }: ChartProps) {
  const { start, end, lines } = view;

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 60);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const values = lines.flatMap((line) => [
    ...line.steps.map((step) => step.price),
    ...line.spreads.flatMap((spread) => [spread.cheapest, spread.dearest]),
  ]);
  const yTicks = priceTicks(Math.min(...values), Math.max(...values));
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const decimals = yTicks.length > 1 && yTicks[1] - yTicks[0] < 0.01 ? 3 : 2;
  const xTicks = timeTicks(start, end, plotWidth);

  const x = (day: number) => MARGIN.left + ((day - start) / Math.max(end - start, 1)) * plotWidth;
  const y = (price: number) => MARGIN.top + ((yMax - price) / (yMax - yMin)) * plotHeight;

  const drawn = lines.map((line) => ({ line, ...geometry(line, end, x, y) }));

  // End labels only when they cannot touch. When they would, the legend and the
  // tooltip carry identity instead of labels nudged away from their lines.
  const labelYs = drawn.map((item) => y(item.line.current.price));
  const labelsFit = labelYs.every((a, i) =>
    labelYs.every((b, j) => i === j || Math.abs(a - b) >= 14),
  );

  const readings =
    focusDay === null ? [] : lines.map((line) => ({ line, reading: readingAt(line, focusDay) }));

  // The tooltip sits beside the crosshair, on whichever side it fits, and never
  // past either edge. On a phone neither side may fit, so it is measured.
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tipWidth, setTipWidth] = useState(200);
  useLayoutEffect(() => {
    if (tipRef.current) setTipWidth(tipRef.current.offsetWidth);
  }, [focusDay, lines.length]);
  const tipLeft = (() => {
    if (focusDay === null) return 0;
    const at = x(focusDay);
    const right = at + 12;
    const left = at - 12 - tipWidth;
    const preferred = right + tipWidth <= width ? right : left >= 0 ? left : right;
    return Math.min(Math.max(preferred, 0), Math.max(width - tipWidth, 0));
  })();

  function dayFromPointer(event: PointerEvent<SVGSVGElement>): number {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left - MARGIN.left) / plotWidth;
    const day = Math.round(start + ratio * (end - start));
    return Math.min(end, Math.max(start, day));
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    // A day at a time is right for a week and far too slow for eight years.
    const stride = Math.max(1, Math.round((end - start) / 60));
    const from = focusDay ?? end;
    const moves: Record<string, number> = {
      ArrowLeft: from - stride,
      ArrowRight: from + stride,
      Home: start,
      End: end,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    onFocusDay(Math.min(end, Math.max(start, moves[event.key])));
  }

  const summary = lines
    .map((line) => `${SOURCE_LABEL[line.source]} nu ${formatPrice(line.current.price)}`)
    .join(", ");

  return (
    <>
      <div className="history-stats">
        {lines.map((line) => (
          <dl key={line.source} className="history-stat-row">
            <div className="history-stat-name">
              <span className={`line-key key-${line.source}`} aria-hidden="true" />
              {SOURCE_LABEL[line.source]}
            </div>
            <div>
              <dt>Nu</dt>
              <dd>
                <strong>{formatPrice(line.current.price)}</strong> sinds{" "}
                {numericDate(line.currentSince)}
              </dd>
            </div>
            <div>
              <dt>Laagste</dt>
              <dd>
                <strong>{formatPrice(line.low.price)}</strong> op {numericDate(line.low.day)}
              </dd>
            </div>
            <div>
              <dt>Hoogste</dt>
              <dd>
                <strong>{formatPrice(line.high.price)}</strong> op {numericDate(line.high.day)}
              </dd>
            </div>
            <div>
              <dt>Verschil</dt>
              <dd>
                <strong>{signed(line.current.price - line.steps[0].price)}</strong> sinds{" "}
                {numericDate(line.steps[0].day)}
              </dd>
            </div>
          </dl>
        ))}
      </div>

      <div
        className="history-plot"
        tabIndex={0}
        role="group"
        aria-label={
          `Prijsverloop ${productLabel} van ${numericDate(start)} tot ${numericDate(end)}. ` +
          `${summary}. Pijltjestoetsen tonen een dag.`
        }
        onKeyDown={onKey}
        onFocus={() => onFocusDay(focusDay ?? end)}
        onBlur={() => onFocusDay(null)}
      >
        <svg
          className="history-svg"
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          aria-hidden="true"
          onPointerMove={(event) => onFocusDay(dayFromPointer(event))}
          onPointerDown={(event) => onFocusDay(dayFromPointer(event))}
          // A finger lifting also counts as leaving, which would hide the reading
          // the moment it appears. On touch it stays until you tap elsewhere.
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") onFocusDay(null);
          }}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className="history-grid"
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="history-axis"
                x={MARGIN.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
              >
                {tick.toFixed(decimals).replace(".", ",")}
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <text
              key={tick.day}
              className="history-axis"
              x={x(tick.day)}
              y={MARGIN.top + plotHeight + 20}
              textAnchor="middle"
            >
              {tick.label}
            </text>
          ))}

          {drawn.map(({ line, band }) =>
            band ? (
              <path
                key={`band-${line.source}`}
                className={`history-band fill-${line.source}`}
                d={band}
              />
            ) : null,
          )}
          {drawn.map(({ line, path }) => (
            <path
              key={`line-${line.source}`}
              className={`history-line stroke-${line.source}`}
              d={path}
            />
          ))}

          {drawn.map(({ line, endX }) => (
            <g key={`end-${line.source}`}>
              <circle
                className={`history-dot fill-${line.source}`}
                cx={endX}
                cy={y(line.current.price)}
                r={4}
              />
              {labelsFit && (
                <text className="history-end" x={endX + 9} y={y(line.current.price)} dy="0.32em">
                  {formatPrice(line.current.price)}
                </text>
              )}
            </g>
          ))}

          {focusDay !== null && (
            <g>
              <line
                className="history-crosshair"
                x1={x(focusDay)}
                x2={x(focusDay)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
              />
              {readings.map(({ line, reading }) =>
                reading ? (
                  <circle
                    key={line.source}
                    className={`history-dot fill-${line.source}`}
                    cx={x(focusDay)}
                    cy={y(reading.price)}
                    r={4}
                  />
                ) : null,
              )}
            </g>
          )}
        </svg>

        {focusDay !== null && (
          <div className="history-tip" ref={tipRef} aria-live="polite" style={{ left: tipLeft }}>
            <span className="history-tip-date">{longDate(focusDay)}</span>
            {readings.map(({ line, reading }) => (
              <div key={line.source} className="history-tip-row">
                <span className={`line-key key-${line.source}`} aria-hidden="true" />
                {reading ? (
                  <span>
                    <strong>{formatPrice(reading.price)}</strong> {SOURCE_LABEL[line.source]}
                    {reading.spread && <small>{spreadText(reading.spread)}</small>}
                  </span>
                ) : (
                  <span className="history-tip-none">
                    {SOURCE_LABEL[line.source]}: geen gegevens
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="history-table">
        <summary>Toon als tabel</summary>
        {lines.map((line) => (
          <SourceTable key={line.source} line={line} />
        ))}
      </details>
    </>
  );
}

function SourceTable({ line }: { line: Line }) {
  const newestFirst = line.steps
    .map((step, index) => ({ step, index, previous: index > 0 ? line.steps[index - 1] : null }))
    .reverse();

  if (line.source === "dats24") {
    return (
      <table>
        <caption>DATS 24, per dag</caption>
        <thead>
          <tr>
            <th scope="col">Datum</th>
            <th scope="col">Mediaan</th>
            <th scope="col">Goedkoopste</th>
            <th scope="col">Duurste</th>
            <th scope="col">Stations</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map(({ step, index }) => (
            <tr key={step.day}>
              <td>{numericDate(step.day)}</td>
              <td>{formatPrice(step.price)}</td>
              <td>{formatPrice(line.spreads[index].cheapest)}</td>
              <td>{formatPrice(line.spreads[index].dearest)}</td>
              <td>{line.spreads[index].stations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table>
      <caption>Officiele maximumprijs, per wijziging</caption>
      <thead>
        <tr>
          <th scope="col">Vanaf</th>
          <th scope="col">Maximumprijs</th>
          <th scope="col">Wijziging</th>
        </tr>
      </thead>
      <tbody>
        {newestFirst.map(({ step, previous }) => (
          <tr key={step.day}>
            <td>{numericDate(step.day)}</td>
            <td>{formatPrice(step.price)}</td>
            <td>{previous ? signed(step.price - previous.price) : "begin periode"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The SVG paths for one line. FOD holds each price until the next change and
 * runs to the window end. DATS 24 holds each day until the next observation,
 * and breaks where observations stop for longer than a failed run explains.
 */
function geometry(
  line: Line,
  end: number,
  x: (day: number) => number,
  y: (price: number) => number,
): { path: string; band: string | null; endX: number } {
  const { steps, spreads, maxGap } = line;
  const until = (index: number): number => {
    const next = steps[index + 1];
    if (next)
      return maxGap === null || next.day - steps[index].day < maxGap ? next.day : steps[index].day;
    return maxGap === null || end - steps[index].day < maxGap ? end : steps[index].day;
  };

  let path = "";
  let band = "";
  steps.forEach((step, index) => {
    const connected = index > 0 && until(index - 1) === step.day;
    path += connected ? `V${y(step.price)}` : `M${x(step.day)},${y(step.price)}`;
    path += `H${x(until(index))}`;

    const spread = spreads[index];
    if (spread && until(index) > step.day) {
      band +=
        `M${x(step.day)},${y(spread.dearest)}H${x(until(index))}` +
        `V${y(spread.cheapest)}H${x(step.day)}Z`;
    }
  });

  return { path, band: band || null, endX: x(until(steps.length - 1)) };
}

/** "1,889 tot 2,058, 146 stations", or "alle 92 stations 2,049" when they all agree. */
function spreadText({ cheapest, dearest, stations }: Spread): string {
  if (cheapest === dearest) return `alle ${stations} stations ${formatPrice(cheapest)}`;
  return `${formatPrice(cheapest)} tot ${formatPrice(dearest)}, ${stations} stations`;
}

/** "+0,123", "-0,045" or "0,000", never a bare number whose direction is unclear. */
function signed(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return formatPrice(0);
  return `${rounded > 0 ? "+" : "-"}${formatPrice(Math.abs(rounded))}`;
}
