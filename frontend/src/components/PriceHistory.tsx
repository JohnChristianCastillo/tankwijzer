/** Chart of the official maximum price over time for the selected fuel, with range picker.

Drawn as a step line, because that is what the maximum price is: one value in
force until the next tariff. Hand drawn SVG rather than a chart library, since one
line, two axes and a crosshair do not justify a dependency.
*/

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { formatPrice } from "../api";
import {
  RANGES,
  buildWindow,
  dayNumber,
  longDate,
  numericDate,
  priceAt,
  priceTicks,
  timeTicks,
  type RangeKey,
} from "../history";
import { FUELS, type FuelCode, type PriceHistory as History } from "../types";

interface Props {
  history: History;
  fuel: FuelCode;
  range: RangeKey;
  onRange: (range: RangeKey) => void;
}

const HEIGHT = 260;
const MARGIN = { top: 14, right: 58, bottom: 30, left: 46 };

export function PriceHistory({ history, fuel, range, onRange }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [focusDay, setFocusDay] = useState<number | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setFocusDay(null), [fuel, range]);

  const points = history.series[fuel];
  const label = FUELS.find((item) => item.code === fuel)?.label ?? fuel;
  const view = useMemo(
    () => (points ? buildWindow(points, range, history.generated) : null),
    [points, range, history.generated],
  );

  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-head">
        <div>
          <h2 className="history-title" id="history-title">
            Verloop maximumprijs {label}
          </h2>
          {points && (
            <p className="history-subtitle">
              Het wettelijke plafond van de FOD Economie, geen pompprijs. De meeste pompen zitten
              eronder.
            </p>
          )}
        </div>
        {points && (
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
        )}
      </div>

      <div className="history-frame" ref={frameRef}>
        {!points || !view ? (
          <p className="notice">
            Voor {label} publiceert de FOD Economie geen maximumprijs, dus er is geen verloop om te
            tonen.
          </p>
        ) : (
          <Chart
            view={view}
            width={width}
            label={label}
            lastChange={dayNumber(points[points.length - 1][0])}
            focusDay={focusDay}
            onFocusDay={setFocusDay}
          />
        )}
      </div>
    </section>
  );
}

interface ChartProps {
  view: NonNullable<ReturnType<typeof buildWindow>>;
  width: number;
  label: string;
  lastChange: number;
  focusDay: number | null;
  onFocusDay: (day: number | null) => void;
}

function Chart({ view, width, label, lastChange, focusDay, onFocusDay }: ChartProps) {
  const { start, end, steps, current, low, high } = view;

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 60);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const yTicks = priceTicks(low.price, high.price);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const decimals = yTicks.length > 1 && yTicks[1] - yTicks[0] < 0.01 ? 3 : 2;
  const xTicks = timeTicks(start, end, plotWidth);

  const x = (day: number) => MARGIN.left + ((day - start) / Math.max(end - start, 1)) * plotWidth;
  const y = (price: number) => MARGIN.top + ((yMax - price) / (yMax - yMin)) * plotHeight;

  let path = `M${x(steps[0].day)},${y(steps[0].price)}`;
  for (const step of steps.slice(1)) {
    path += `H${x(step.day)}V${y(step.price)}`;
  }
  path += `H${x(end)}`;

  const change = current.price - steps[0].price;
  const focusPrice = focusDay === null ? null : priceAt(steps, focusDay);
  const tipOnLeft = focusDay !== null && x(focusDay) > width - 180;

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

  return (
    <>
      <dl className="history-stats">
        <div>
          <dt>Nu</dt>
          <dd>
            <strong>{formatPrice(current.price)}</strong> sinds {numericDate(lastChange)}
          </dd>
        </div>
        <div>
          <dt>Laagste</dt>
          <dd>
            <strong>{formatPrice(low.price)}</strong> op {numericDate(low.day)}
          </dd>
        </div>
        <div>
          <dt>Hoogste</dt>
          <dd>
            <strong>{formatPrice(high.price)}</strong> op {numericDate(high.day)}
          </dd>
        </div>
        <div>
          <dt>Verschil</dt>
          <dd>
            <strong>{signed(change)}</strong> sinds {numericDate(start)}
          </dd>
        </div>
      </dl>

      <div
        className="history-plot"
        tabIndex={0}
        role="group"
        aria-label={
          `Maximumprijs ${label} van ${numericDate(start)} tot ${numericDate(end)}. ` +
          `Nu ${formatPrice(current.price)} euro per liter. Pijltjestoetsen tonen een dag.`
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

          <path className="history-line" d={path} />

          <circle className="history-dot" cx={x(end)} cy={y(current.price)} r={4} />
          <text className="history-end" x={x(end) + 9} y={y(current.price)} dy="0.32em">
            {formatPrice(current.price)}
          </text>

          {focusDay !== null && focusPrice !== null && (
            <g>
              <line
                className="history-crosshair"
                x1={x(focusDay)}
                x2={x(focusDay)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
              />
              <circle className="history-dot" cx={x(focusDay)} cy={y(focusPrice)} r={4} />
            </g>
          )}
        </svg>

        {focusDay !== null && focusPrice !== null && (
          <div
            className="history-tip"
            aria-live="polite"
            style={{
              left: x(focusDay),
              transform: tipOnLeft ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <strong>{formatPrice(focusPrice)} EUR/L</strong>
            <span>{longDate(focusDay)}</span>
          </div>
        )}
      </div>

      <details className="history-table">
        <summary>Toon als tabel</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Vanaf</th>
              <th scope="col">Maximumprijs</th>
              <th scope="col">Wijziging</th>
            </tr>
          </thead>
          <tbody>
            {steps
              .map((step, index) => ({ step, previous: index > 0 ? steps[index - 1] : null }))
              .reverse()
              .map(({ step, previous }) => (
                <tr key={step.day}>
                  <td>{numericDate(step.day)}</td>
                  <td>{formatPrice(step.price)}</td>
                  <td>{previous ? signed(step.price - previous.price) : "begin periode"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

/** "+0,123", "-0,045" or "0,000", never a bare number whose direction is unclear. */
function signed(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return formatPrice(0);
  return `${rounded > 0 ? "+" : "-"}${formatPrice(Math.abs(rounded))}`;
}
