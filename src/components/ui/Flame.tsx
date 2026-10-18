/**
 * The hexagon flame from the Lantern logo, as a status mark:
 * lit (safe, working), warn (be careful, degraded), danger (scam, failed),
 * out (down: an unlit flame). Always paired with a text label; the flame
 * adds feeling, never the only signal.
 */

export type FlameState = 'lit' | 'warn' | 'danger' | 'out';

// Facets of the logo's flame, top to bottom
const FACETS = [
  'M628 620L525 765L627 700Z',
  'M628 620L627 700L730 765Z',
  'M525 765L627 700L627 790Z',
  'M730 765L627 700L627 790Z',
  'M525 765L525 873L627 790Z',
  'M730 765L730 873L627 790Z',
  'M525 873L627 940L627 790Z',
  'M730 873L627 940L627 790Z',
  'M627 790L598 860L627 940L656 860Z',
];

const PALETTES: Record<Exclude<FlameState, 'out'>, string[]> = {
  lit: ['#FF4E58', '#F0308C', '#FF7A2E', '#FF5A36', '#FF9A2E', '#FF7424', '#FFC23A', '#FFAA30', '#FFE14A'],
  warn: ['#F59E0B', '#E08A00', '#FBBF24', '#F5A524', '#FCD34D', '#FBBF24', '#FDE68A', '#FCD34D', '#FEF3C7'],
  danger: ['#B91C1C', '#991B1B', '#DC2626', '#C81E1E', '#EF4444', '#DC2626', '#F87171', '#EF4444', '#FCA5A5'],
};

export function Flame({ state, size = 24, className = '' }: { state: FlameState; size?: number; className?: string }) {
  const motion = state === 'out' ? '' : `flame-${state}`;
  return (
    <svg width={size} height={size} viewBox="505 600 245 360" className={`shrink-0 ${className}`} aria-hidden="true">
      {state !== 'out' && (
        <defs>
          <radialGradient id={`flame-glow-${state}`} cx="627" cy="820" r="150" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={PALETTES[state][6]} stopOpacity="0.55" />
            <stop offset="1" stopColor={PALETTES[state][6]} stopOpacity="0" />
          </radialGradient>
        </defs>
      )}
      {state !== 'out' && <circle cx="627" cy="820" r="150" fill={`url(#flame-glow-${state})`} />}
      <g className={motion}>
        {state === 'out'
          ? <path d="M628 620L525 765L525 873L627 940L730 873L730 765Z" fill="var(--color-soft)" stroke="var(--color-muted)" strokeWidth="14" strokeLinejoin="round" />
          : FACETS.map((d, i) => <path key={i} d={d} fill={PALETTES[state][i]} />)}
      </g>
    </svg>
  );
}
