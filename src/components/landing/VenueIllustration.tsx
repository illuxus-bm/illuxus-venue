import * as React from "react";

/**
 * Drawn event hall for the landing hero: one-point perspective onto a stage
 * and glowing screen, chandeliers, a centre aisle and rows of round tables.
 * Every colour reads the theme tokens, so it follows light and dark mode.
 *
 * Used instead of a venue's uploaded cover photo, which can be anything the
 * admin uploaded (screenshots, floor plans) and isn't art-directed.
 */

// Vanishing geometry (viewBox 400×300): the back wall is the rectangle
// x 120–280, y 60–170; walls, floor and ceiling run from it to the frame.
const BACK = { left: 120, right: 280, top: 60, bottom: 170 };
const VP = { x: 200, y: 115 };

/** x where the left wall's floor edge sits at height y (mirror for the right). */
const floorEdgeX = (y: number) => ((300 - y) * BACK.left) / (300 - BACK.bottom);

const v = (name: string) => `hsl(var(--${name}))`;
const va = (name: string, alpha: number) => `hsl(var(--${name}) / ${alpha})`;

/** Tall windows down a side wall, shrinking toward the back. */
function windows(side: "left" | "right") {
  const xs = [10, 46, 76, 100];
  const widths = [22, 18, 13, 9];
  return xs.map((x0, i) => {
    const x1 = x0 + widths[i];
    // At x, the left wall runs from the ceiling edge y = x/2 (line (0,0)→(120,60))
    // down to the floor edge y = 300 − 130x/120 (line (0,300)→(120,170)).
    // Windows fill 12%–70% of that height.
    const wallTop = (x: number) => x / 2;
    const wallBottom = (x: number) => 300 - (130 * x) / 120;
    const top = (x: number) => wallTop(x) + (wallBottom(x) - wallTop(x)) * 0.12;
    const bottom = (x: number) => wallBottom(x) - (wallBottom(x) - wallTop(x)) * 0.3;
    const pts = [
      [x0, top(x0)],
      [x1, top(x1)],
      [x1, bottom(x1)],
      [x0, bottom(x0)],
    ].map(([x, y]) => [side === "left" ? x : 400 - x, y]);
    return pts.map((p) => p.join(",")).join(" ");
  });
}

/** Round tables in perspective rows, leaving the aisle clear. */
const TABLE_ROWS = [
  { y: 192, r: 8, xs: [138, 168, 232, 262] },
  { y: 222, r: 12, xs: [100, 152, 248, 300] },
  { y: 262, r: 17, xs: [62, 138, 262, 338] },
];

function Table({ x, y, r }: { x: number; y: number; r: number }) {
  const chairs = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    return { cx: x + Math.cos(a) * r * 1.35, cy: y + Math.sin(a) * r * 0.55 };
  });
  return (
    <g>
      {chairs
        .filter((c) => c.cy < y)
        .map((c, i) => (
          <ellipse key={`b${i}`} cx={c.cx} cy={c.cy} rx={r * 0.26} ry={r * 0.16} style={{ fill: va("primary", 0.55) }} />
        ))}
      <ellipse cx={x} cy={y + r * 0.18} rx={r} ry={r * 0.42} style={{ fill: va("foreground", 0.12) }} />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.4} style={{ fill: v("card") }} />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.4} style={{ fill: "none", stroke: va("foreground", 0.12) }} strokeWidth={0.6} />
      <circle cx={x} cy={y - r * 0.12} r={Math.max(1.4, r * 0.16)} style={{ fill: v("accent") }} />
      {chairs
        .filter((c) => c.cy >= y)
        .map((c, i) => (
          <ellipse key={`f${i}`} cx={c.cx} cy={c.cy} rx={r * 0.26} ry={r * 0.16} style={{ fill: va("primary", 0.75) }} />
        ))}
    </g>
  );
}

function Chandelier({ x, y, r, drop }: { x: number; y: number; r: number; drop: number }) {
  return (
    <g>
      <line x1={x} y1={y - drop} x2={x} y2={y} style={{ stroke: va("foreground", 0.25) }} strokeWidth={0.6} />
      <circle cx={x} cy={y} r={r * 3.2} fill="url(#vi-glow)" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.45} style={{ fill: v("accent") }} />
      {[-1, -0.5, 0, 0.5, 1].map((k) => (
        <line
          key={k}
          x1={x + k * r}
          y1={y}
          x2={x + k * r * 0.8}
          y2={y + r * 0.9}
          style={{ stroke: va("accent", 0.8) }}
          strokeWidth={0.5}
        />
      ))}
    </g>
  );
}

export function VenueIllustration({ className }: { className?: string }) {
  const id = React.useId().replace(/:/g, "");
  const clip = `vi-floor-${id}`;
  const floor = `0,300 400,300 ${400 - BACK.left},${BACK.bottom} ${BACK.left},${BACK.bottom}`;

  // Floor grid: rays from the vanishing point plus cross lines that bunch up
  // toward the back, the same drafting grid the page's floor uses.
  const rays = Array.from({ length: 17 }, (_, i) => -200 + i * 50);
  const crossYs = [176, 185, 197, 213, 234, 262, 298];

  return (
    <svg viewBox="0 0 400 300" role="img" aria-label="Illustration of an event hall set up with a stage and round tables" className={className}>
      <defs>
        <linearGradient id="vi-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: v("primary") }} />
          <stop offset="1" style={{ stopColor: v("accent") }} />
        </linearGradient>
        <radialGradient id="vi-glow">
          <stop offset="0" style={{ stopColor: v("accent"), stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: v("accent"), stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="vi-stage-light" cx="0.5" cy="0" r="0.9">
          <stop offset="0" style={{ stopColor: v("primary"), stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: v("primary"), stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={clip}>
          <polygon points={floor} />
        </clipPath>
      </defs>

      {/* Ceiling and walls */}
      <polygon points={`0,0 400,0 ${400 - BACK.left},${BACK.top} ${BACK.left},${BACK.top}`} style={{ fill: v("muted") }} />
      <polygon points={`0,0 ${BACK.left},${BACK.top} ${BACK.left},${BACK.bottom} 0,300`} style={{ fill: va("muted", 0.7) }} />
      <polygon points={`400,0 ${400 - BACK.left},${BACK.top} ${400 - BACK.left},${BACK.bottom} 400,300`} style={{ fill: va("muted", 0.7) }} />
      {(["left", "right"] as const).flatMap((side) =>
        windows(side).map((points, i) => (
          <polygon key={`${side}${i}`} points={points} style={{ fill: va("primary", 0.12), stroke: va("primary", 0.25) }} strokeWidth={0.6} />
        )),
      )}

      {/* Back wall, screen and stage */}
      <rect x={BACK.left} y={BACK.top} width={BACK.right - BACK.left} height={BACK.bottom - BACK.top} style={{ fill: v("card") }} />
      <rect x={BACK.left} y={BACK.top} width={BACK.right - BACK.left} height={BACK.bottom - BACK.top} fill="url(#vi-stage-light)" />
      <rect x={146} y={74} width={108} height={58} rx={2} fill="url(#vi-screen)" />
      <rect x={160} y={92} width={52} height={5} rx={1} style={{ fill: va("primary-foreground", 0.9) }} />
      <rect x={160} y={101} width={34} height={3} rx={1} style={{ fill: va("primary-foreground", 0.6) }} />
      <polygon points={`128,156 272,156 284,170 116,170`} style={{ fill: va("foreground", 0.75) }} />
      <rect x={116} y={168} width={168} height={3} style={{ fill: v("accent") }} />

      {/* Floor, grid and aisle */}
      <polygon points={floor} style={{ fill: v("background") }} />
      <g clipPath={`url(#${clip})`} style={{ stroke: va("foreground", 0.1) }} strokeWidth={0.6}>
        {rays.map((x) => (
          <line key={x} x1={VP.x} y1={VP.y} x2={x} y2={300} />
        ))}
        {crossYs.map((y) => (
          <line key={y} x1={0} y1={y} x2={400} y2={y} />
        ))}
      </g>
      <polygon points="190,171 210,171 238,300 162,300" style={{ fill: va("primary", 0.16) }} />

      {/* Ceiling lights */}
      <Chandelier x={200} y={44} r={7} drop={20} />
      <Chandelier x={150} y={40} r={5} drop={16} />
      <Chandelier x={250} y={40} r={5} drop={16} />
      <Chandelier x={92} y={30} r={8} drop={22} />
      <Chandelier x={308} y={30} r={8} drop={22} />

      {/* Tables, back rows first so nearer ones overlap them */}
      {TABLE_ROWS.map((row) =>
        row.xs
          .filter((x) => x - row.r > floorEdgeX(row.y) && x + row.r < 400 - floorEdgeX(row.y))
          .map((x) => <Table key={`${row.y}-${x}`} x={x} y={row.y} r={row.r} />),
      )}
    </svg>
  );
}
