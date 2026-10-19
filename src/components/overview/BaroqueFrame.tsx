import { useId } from 'react';

/**
 * A carved and gilded Victorian Baroque frame, drawn as one SVG over a square.
 *
 * Geometry (viewBox units): the frame's outer edge is the square 0..400 and its
 * moulding is 48 deep, so the sight opening is 48..352. Corner cartouches and
 * crests break past the edge, as carved frames do, so the viewBox has a margin.
 * Each side is one mitred rail drawn once and rotated, carrying its profile
 * gradient, pearl beading and acanthus run; light falls from the top, so the
 * top rail is brightest and the bottom one sits in shadow.
 */

export const FRAME_MARGIN = 16;
const SIZE = 400;
const DEPTH = 48;
const BOX = SIZE + FRAME_MARGIN * 2;
/** Where the sight opening starts, as a share of the drawn square */
export const OPENING_INSET = (FRAME_MARGIN + DEPTH) / BOX;

const r = (n: number) => Math.round(n * 10) / 10;
const pt = (x: number, y: number) => `${r(x)} ${r(y)}`;
const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (cx: number, cy: number, radius: number, deg: number): [number, number] => [cx + radius * Math.cos(rad(deg)), cy + radius * Math.sin(rad(deg))];

/** Scallop shell: a fan of lobes around `mid` (degrees, pointing outward). */
function shell(cx: number, cy: number, radius: number, mid: number, spread: number, lobes: number) {
  const angles = Array.from({ length: lobes + 1 }, (_, i) => mid - spread + (i * 2 * spread) / lobes);
  let outline = `M${pt(cx, cy)} L${pt(...polar(cx, cy, radius, angles[0]))}`;
  for (let i = 0; i < lobes; i++) {
    const half = (angles[i] + angles[i + 1]) / 2;
    outline += ` Q${pt(...polar(cx, cy, radius * 1.16, half))} ${pt(...polar(cx, cy, radius, angles[i + 1]))}`;
  }
  outline += ' Z';
  const ribs = angles.slice(1, -1).map((a) => `M${pt(...polar(cx, cy, radius * 0.22, a))} L${pt(...polar(cx, cy, radius * 0.93, a))}`).join(' ');
  return { outline, ribs };
}

/** A carved scroll arm ending in a volute that winds `turns` times inward. */
function scroll(from: [number, number], c1: [number, number], c2: [number, number], to: [number, number], center: [number, number], turns: number, clockwise = true) {
  let d = `M${pt(...from)} C${pt(...c1)} ${pt(...c2)} ${pt(...to)}`;
  const start = Math.atan2(to[1] - center[1], to[0] - center[0]);
  const r0 = Math.hypot(to[0] - center[0], to[1] - center[1]);
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = start + (clockwise ? 1 : -1) * t * turns * 2 * Math.PI;
    const radius = r0 * (1 - 0.82 * t);
    d += ` L${pt(center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a))}`;
  }
  return d;
}

/** Pointed acanthus leaf with a turned-back lobe, laid along `angle`. */
function leaf(x: number, y: number, length: number, width: number, angle: number) {
  const p = (u: number, v: number) => {
    const a = rad(angle);
    return pt(x + u * Math.cos(a) - v * Math.sin(a), y + u * Math.sin(a) + v * Math.cos(a));
  };
  const L = length, W = width;
  return `M${p(0, 0)} C${p(L * 0.25, -W)} ${p(L * 0.55, -W * 1.1)} ${p(L * 0.7, -W * 0.45)} C${p(L * 0.78, -W * 0.9)} ${p(L * 0.95, -W * 0.6)} ${p(L, 0)} C${p(L * 0.8, W * 0.25)} ${p(L * 0.6, W * 0.5)} ${p(L * 0.45, W * 0.35)} C${p(L * 0.3, W * 0.7)} ${p(L * 0.1, W * 0.5)} ${p(0, 0)} Z`;
}

// ---- The corner cartouche (top-left; mirrored across the diagonal, then rotated into each corner)
const CORNER_SHELL = shell(24, 24, 27, 225, 58, 9);
const CORNER_SCROLL = scroll([36, 6], [52, -6], [72, -7], [88, 0], [88, 9], 1.2);
const CORNER_LEAVES = [leaf(30, 30, 52, 9, 6), leaf(48, 18, 34, 6.5, -10), leaf(70, 30, 26, 5.5, 14)];

// ---- The crest at the middle of each rail
const CREST_SHELL = shell(200, 30, 30, 270, 68, 7);
const CREST_SCROLL = scroll([214, 18], [226, 8], [240, 8], [250, 14], [247, 20], 1.1);
const CREST_LEAF = leaf(222, 30, 26, 6, 10);

const RAIL = `M0 0 L${SIZE} 0 L${SIZE - DEPTH} ${DEPTH} L${DEPTH} ${DEPTH} Z`;
// Top, right, bottom, left: light from above
const RAIL_LIGHT = ['rgba(255,244,214,0.13)', 'rgba(20,10,0,0.10)', 'rgba(20,10,0,0.26)', 'rgba(255,244,214,0.04)'];

export function BaroqueFrame({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  const carved = (d: string, fill: string, width = 0.8) => (
    <path d={d} fill={fill} stroke="#3a2504" strokeOpacity="0.75" strokeWidth={width} strokeLinejoin="round" />
  );
  // Scroll arms: a dark undercut, the gilt body, then a highlight along the crown
  const scrollArm = (d: string, body = 5) => (
    <>
      <path d={d} fill="none" stroke="#2e1d03" strokeWidth={body + 2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={url('gilt')} strokeWidth={body} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#fff4c6" strokeOpacity="0.55" strokeWidth={body * 0.25} strokeLinecap="round" strokeLinejoin="round" transform="translate(-0.6 -0.8)" />
    </>
  );

  const cornerHalf = (
    <>
      {scrollArm(CORNER_SCROLL)}
      {CORNER_LEAVES.map((d, i) => <g key={i}>{carved(d, url('leaf'))}</g>)}
    </>
  );

  return (
    <svg viewBox={`${-FRAME_MARGIN} ${-FRAME_MARGIN} ${BOX} ${BOX}`} className={className} aria-hidden="true">
      <defs>
        {/* The moulding's profile, outer edge (0) to sight edge (48): bead, groove, torus, cove, leaf run, fillet */}
        <linearGradient id={id('profile')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={DEPTH}>
          <stop offset="0" stopColor="#4d3409" />
          <stop offset="0.05" stopColor="#b98f3c" />
          <stop offset="0.11" stopColor="#3a2605" />
          <stop offset="0.17" stopColor="#8c6723" />
          <stop offset="0.28" stopColor="#f7e5a4" />
          <stop offset="0.39" stopColor="#a47c2f" />
          <stop offset="0.47" stopColor="#3d2907" />
          <stop offset="0.55" stopColor="#7b5a1d" />
          <stop offset="0.7" stopColor="#c9a454" />
          <stop offset="0.79" stopColor="#5d420f" />
          <stop offset="0.85" stopColor="#2c1d04" />
          <stop offset="0.9" stopColor="#ecd48a" />
          <stop offset="0.95" stopColor="#9a7530" />
          <stop offset="1" stopColor="#1f1405" />
        </linearGradient>
        <linearGradient id={id('gilt')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1bb" />
          <stop offset="0.35" stopColor="#e2bd62" />
          <stop offset="0.7" stopColor="#9b7228" />
          <stop offset="1" stopColor="#5a3c0c" />
        </linearGradient>
        <linearGradient id={id('leaf')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f3dc8f" />
          <stop offset="0.5" stopColor="#bb8f3a" />
          <stop offset="1" stopColor="#5e400e" />
        </linearGradient>
        <radialGradient id={id('shell')} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f6e09a" />
          <stop offset="0.45" stopColor="#c99a40" />
          <stop offset="1" stopColor="#5e400e" />
        </radialGradient>
        <radialGradient id={id('pearl')} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#fff8d8" />
          <stop offset="0.5" stopColor="#c69c45" />
          <stop offset="1" stopColor="#4a3108" />
        </radialGradient>
        <pattern id={id('pearls')} width="6.5" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3.25" cy="2.8" r="2.3" fill={url('pearl')} />
        </pattern>
        {/* The leaf run: water leaves alternating with berries, in the moulding's flat band */}
        <pattern id={id('acanthus')} width="15" height={DEPTH} patternUnits="userSpaceOnUse">
          <path d="M1 32 C4 27.5 9.5 26.6 14 28.6 C10.8 29.6 9 30.8 8.2 32 C9 33.2 10.8 34.4 14 35.4 C9.5 37.4 4 36.5 1 32 Z" fill={url('leaf')} stroke="#3a2504" strokeOpacity="0.6" strokeWidth="0.45" />
          <path d="M2.5 32 L9.5 32" stroke="#4a3108" strokeOpacity="0.55" strokeWidth="0.45" />
          <circle cx="14.4" cy="32" r="1.15" fill={url('pearl')} />
        </pattern>
        <clipPath id={id('rail')}>
          <path d={RAIL} />
        </clipPath>
        <filter id={id('relief')} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.9" dy="1.8" stdDeviation="1.1" floodColor="#140b01" floodOpacity="0.75" />
        </filter>
      </defs>

      {/* Rails */}
      {[0, 90, 180, 270].map((deg, i) => (
        <g key={deg} transform={`rotate(${deg} ${SIZE / 2} ${SIZE / 2})`}>
          <path d={RAIL} fill={url('profile')} />
          <g clipPath={url('rail')}>
            <rect x="0" y="0.2" width={SIZE} height="5.6" fill={url('pearls')} />
            <rect x="0" y="25" width={SIZE} height="14" fill={url('acanthus')} />
            <path d={RAIL} fill={RAIL_LIGHT[i]} />
          </g>
          {/* mitre joint */}
          <path d={`M0 0 L${DEPTH} ${DEPTH}`} stroke="#2a1a03" strokeOpacity="0.5" strokeWidth="0.6" />
          {/* crest */}
          <g filter={url('relief')}>
            {scrollArm(CREST_SCROLL, 4)}
            {carved(CREST_LEAF, url('leaf'))}
            <g transform={`translate(${SIZE} 0) scale(-1 1)`}>
              {scrollArm(CREST_SCROLL, 4)}
              {carved(CREST_LEAF, url('leaf'))}
            </g>
            {carved(CREST_SHELL.outline, url('shell'))}
            <path d={CREST_SHELL.ribs} stroke="#4a3108" strokeOpacity="0.7" strokeWidth="0.7" fill="none" />
            <ellipse cx="200" cy="31" rx="6" ry="4.2" fill={url('gilt')} stroke="#3a2504" strokeOpacity="0.7" strokeWidth="0.7" />
          </g>
        </g>
      ))}

      {/* Corner cartouches */}
      {[0, 90, 180, 270].map((deg) => (
        <g key={deg} transform={`rotate(${deg} ${SIZE / 2} ${SIZE / 2})`} filter={url('relief')}>
          {cornerHalf}
          {/* mirrored across the diagonal for the other rail */}
          <g transform="matrix(0 1 1 0 0 0)">{cornerHalf}</g>
          {carved(CORNER_SHELL.outline, url('shell'), 0.9)}
          <path d={CORNER_SHELL.ribs} stroke="#4a3108" strokeOpacity="0.7" strokeWidth="0.8" fill="none" />
          {/* cabochon at the shell's hinge */}
          <circle cx="25" cy="25" r="7.5" fill={url('gilt')} stroke="#3a2504" strokeOpacity="0.75" strokeWidth="0.8" />
          <circle cx="23.2" cy="23.2" r="2.6" fill="#fff3c4" fillOpacity="0.7" />
        </g>
      ))}

      {/* Sight edge: the shadow the moulding casts into the opening */}
      <rect x={DEPTH} y={DEPTH} width={SIZE - DEPTH * 2} height={SIZE - DEPTH * 2} fill="none" stroke="#120a01" strokeOpacity="0.85" strokeWidth="1.2" />
    </svg>
  );
}
