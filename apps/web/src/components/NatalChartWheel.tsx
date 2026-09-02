"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildNatalWheelData,
  glyphOffsetDegrees,
  type NatalWheelData,
  type WheelAspect,
  type WheelPlanet,
} from "@astro/shared/astrology";
import type { NatalChart, Placement } from "@astro/shared/astrology";

// The chart wheel.
//
// WHY SVG AND NOT CANVAS
// ----------------------
// Every mark on this wheel is a discrete, meaningful object — a planet, a
// cusp, an aspect — and SVG keeps them as elements. That buys three things
// canvas does not:
//   * accessibility: each glyph carries a <title>, so a screen reader
//     announces "Sun in Leo, 12 degrees" instead of "image";
//   * resolution independence: the same markup is crisp on a phone and in a
//     3x store screenshot, with no devicePixelRatio arithmetic;
//   * inspectability: a wrong placement can be found in the DOM.
// Canvas would only win on a wheel with thousands of marks. This one has
// about sixty.
//
// WHAT IT DOES NOT DO
// -------------------
// No geometry. Every coordinate comes from `buildNatalWheelData` in the shared
// package, which the mobile renderer also uses — so the two wheels cannot put
// the same planet in different sectors. This file decides colour and type, and
// nothing else.

type NatalChartWheelProps = {
  chart: Pick<NatalChart, "sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto"> | null;
  rising: Placement | null;
  mc: Placement | null;
  cusps: number[] | null;
  /** Rendered under the wheel when angles and houses are unavailable. */
  unavailableNote?: string | null;
  size?: number;
};

const GLYPHS: Record<string, string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
};

const SIGN_GLYPHS: Record<string, string> = {
  Aries: "♈",
  Taurus: "♉",
  Gemini: "♊",
  Cancer: "♋",
  Leo: "♌",
  Virgo: "♍",
  Libra: "♎",
  Scorpio: "♏",
  Sagittarius: "♐",
  Capricorn: "♑",
  Aquarius: "♒",
  Pisces: "♓",
};

// Soft, and deliberately not the traditional red/blue. Harmonious reads cool
// and calm, tension reads warm — legible in dark mode without shouting.
const ASPECT_STROKE: Record<WheelAspect["kind"], string> = {
  harmonious: "rgba(139, 176, 255, 0.55)",
  challenging: "rgba(201, 134, 146, 0.50)",
  intense: "rgba(240, 214, 160, 0.55)",
};

export function NatalChartWheel({
  chart,
  rising,
  mc,
  cusps,
  unavailableNote = null,
  size = 340,
}: NatalChartWheelProps) {
  const t = useTranslations("webApp");
  const [showAspects, setShowAspects] = useState(true);

  const wheel: NatalWheelData = useMemo(
    () => buildNatalWheelData(chart, { size, rising, mc, cusps, showAspects }),
    [chart, size, rising, mc, cusps, showAspects],
  );

  const { geometry, center } = { geometry: wheel.geometry, center: wheel.geometry.center };
  const hasAngles = wheel.angles.length > 0;
  const hasHouses = wheel.houses.length > 0;

  return (
    <div className="rounded-[2rem] border border-border bg-card/90 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("natalWheelTitle")}
        </p>
        {wheel.aspects.length > 0 || showAspects ? (
          <button
            type="button"
            onClick={() => setShowAspects((current) => !current)}
            className="rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-pressed={showAspects}
          >
            {showAspects ? t("natalWheelHideAspects") : t("natalWheelShowAspects")}
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-7 text-text-muted">
        {wheel.anchor === "ascendant" ? t("natalWheelBodyAnchored") : t("natalWheelBodyAries")}
      </p>

      <div className="mt-5 flex justify-center">
        <svg
          viewBox={`0 0 ${geometry.size} ${geometry.size}`}
          width="100%"
          style={{ maxWidth: geometry.size }}
          role="img"
          aria-label={t("natalWheelAriaLabel")}
          className="overflow-visible"
        >
          {/* Rings. Thin, low-contrast — the data is the subject. */}
          <circle
            cx={center.x}
            cy={center.y}
            r={geometry.zodiacOuter}
            fill="none"
            stroke="rgba(232, 199, 126, 0.26)"
          />
          <circle
            cx={center.x}
            cy={center.y}
            r={geometry.zodiacInner}
            fill="none"
            stroke="rgba(232, 199, 126, 0.16)"
          />
          <circle
            cx={center.x}
            cy={center.y}
            r={geometry.hubRadius}
            fill="rgba(255, 255, 255, 0.02)"
            stroke="rgba(255, 255, 255, 0.07)"
          />

          {/* Zodiac: twelve dividers and twelve glyphs. */}
          {wheel.zodiac.map((sector) => (
            <g key={sector.sign}>
              <line
                x1={sector.divider.inner.x}
                y1={sector.divider.inner.y}
                x2={sector.divider.outer.x}
                y2={sector.divider.outer.y}
                stroke="rgba(232, 199, 126, 0.18)"
              />
              <text
                x={sector.label.x}
                y={sector.label.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="select-none"
                fontSize={geometry.size * 0.042}
                fill="rgba(232, 199, 126, 0.72)"
              >
                {SIGN_GLYPHS[sector.sign] ?? sector.sign.slice(0, 2)}
              </text>
            </g>
          ))}

          {/* House cusps. Absent entirely without a birth time and place —
              never drawn as an empty scaffold. */}
          {wheel.houses.map((house) => (
            <g key={house.number}>
              <line
                x1={house.inner.x}
                y1={house.inner.y}
                x2={house.outer.x}
                y2={house.outer.y}
                stroke="rgba(255, 255, 255, 0.09)"
                strokeDasharray="2 4"
              />
              <text
                x={house.numberAt.x}
                y={house.numberAt.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="select-none"
                fontSize={geometry.size * 0.03}
                fill="rgba(255, 255, 255, 0.32)"
              >
                {house.number}
              </text>
            </g>
          ))}

          {/* Aspects, drawn between TRUE positions and under everything else. */}
          {wheel.aspects.map((aspect, index) => (
            <line
              key={`${aspect.bodyA}-${aspect.bodyB}-${index}`}
              x1={aspect.from.x}
              y1={aspect.from.y}
              x2={aspect.to.x}
              y2={aspect.to.y}
              stroke={ASPECT_STROKE[aspect.kind]}
              strokeWidth={aspect.orb < 2 ? 1.4 : 0.9}
            >
              <title>
                {`${t(`natalPlanet_${aspect.bodyA}`)} ${t(
                  `synastryAspect_${aspect.name}`,
                )} ${t(`natalPlanet_${aspect.bodyB}`)} · ${aspect.orb.toFixed(1)}°`}
              </title>
            </line>
          ))}

          {/* Angles: ASC and MC, only ever the ones that were proven. */}
          {wheel.angles.map((angle) => (
            <g key={angle.key}>
              <line
                x1={angle.inner.x}
                y1={angle.inner.y}
                x2={angle.outer.x}
                y2={angle.outer.y}
                stroke="rgba(201, 134, 146, 0.55)"
                strokeWidth={1.3}
              />
              <text
                x={angle.label.x}
                y={angle.label.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="select-none"
                fontSize={geometry.size * 0.032}
                fill="#ffb7c7"
                fontWeight={600}
              >
                {angle.key === "asc" ? t("natalWheelAsc") : t("natalWheelMc")}
              </text>
            </g>
          ))}

          {/* Planets. Tick on the true longitude, glyph possibly nudged, and a
              leader line whenever the two are far enough apart to notice. */}
          {wheel.planets.map((planet: WheelPlanet) => {
            const offset = glyphOffsetDegrees(planet, geometry);
            return (
              <g key={planet.key}>
                <line
                  x1={planet.tickInner.x}
                  y1={planet.tickInner.y}
                  x2={planet.tickOuter.x}
                  y2={planet.tickOuter.y}
                  stroke="rgba(255, 255, 255, 0.45)"
                  strokeWidth={1.2}
                />
                {planet.nudged && offset > 1.5 ? (
                  <line
                    x1={planet.tickInner.x}
                    y1={planet.tickInner.y}
                    x2={planet.glyph.x}
                    y2={planet.glyph.y}
                    stroke="rgba(255, 255, 255, 0.16)"
                    strokeWidth={0.7}
                  />
                ) : null}
                <text
                  x={planet.glyph.x}
                  y={planet.glyph.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="select-none"
                  fontSize={geometry.size * 0.05}
                  fill="#ffffff"
                >
                  {GLYPHS[planet.key] ?? "·"}
                  <title>
                    {`${t(`natalPlanet_${planet.key}`)} — ${planet.sign} ${planet.degree}°`}
                  </title>
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Said once, under the wheel, rather than as twelve empty sectors. */}
      {(!hasAngles || !hasHouses) && unavailableNote ? (
        <p className="mt-4 text-sm leading-7 text-text-muted">{unavailableNote}</p>
      ) : null}

      {wheel.planets.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-text-muted">{t("natalWheelNoChart")}</p>
      ) : null}
    </div>
  );
}
