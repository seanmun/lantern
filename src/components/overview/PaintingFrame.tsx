'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface Artwork {
  id: string;
  title: string;
  subtitle: string;     // collection · chain
  detail?: string;      // e.g. "Floor $480"
  imageUrl: string;
  live: boolean;        // HTML/SVG inscription rendered in a sandboxed frame
  pixelated: boolean;   // pixel-art Ordinals stay crisp when scaled up
}

interface PaintingFrameProps {
  artworks: Artwork[];
  intervalMs?: number;
  emptyMessage?: string;
}

const FADE_MS = 1200;

// Carved gilt: layered metallic stops, catching light top-left
// Antique gilt: muted golds with darker recesses, as on an old carved frame
const GILT = 'linear-gradient(145deg, #4a3410 0%, #9c7a32 9%, #dcc07a 20%, #9a7630 32%, #ecd79a 44%, #8f6d2b 56%, #cfae62 70%, #6a4c18 84%, #a8853c 100%)';
const GILT_INNER = 'linear-gradient(145deg, #6a4c18 0%, #d9bd74 30%, #8a6826 55%, #c9a75b 80%, #5a3f12 100%)';
// Fine grain + crackle so the gilt reads aged rather than glossy
const PATINA = 'repeating-linear-gradient(115deg, rgba(40,25,5,0.07) 0 1px, transparent 1px 3px), repeating-linear-gradient(25deg, rgba(255,245,215,0.06) 0 1px, transparent 1px 4px)';
const BRASS = 'linear-gradient(180deg, #e9cd7d 0%, #c99d3e 45%, #a57826 100%)';

/** Acanthus-style corner flourish, drawn once and rotated into each corner. */
function Corner({ gradientId, className }: { gradientId: string; className: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`pointer-events-none absolute h-14 w-14 sm:h-16 sm:w-16 ${className}`} aria-hidden="true">
      <path
        d="M2 2h30c-6 2-11 5-14 10 6-3 13-3 18 1-7 0-12 3-15 8 5-2 10-1 13 2-6 1-10 4-12 9 3-1 6 0 8 2-5 1-8 4-9 9l-2 3c-1-6-3-11-7-14 4 0 6-2 7-5-4 1-8 0-10-3 4-1 6-4 7-7-4 1-8 0-11-3 4-1 7-4 8-8C8 8 5 5 2 2z"
        fill={`url(#${gradientId})`}
        stroke="#5e400f"
        strokeOpacity="0.45"
        strokeWidth="0.75"
      />
      <circle cx="9" cy="9" r="4.2" fill={`url(#${gradientId})`} stroke="#5e400f" strokeOpacity="0.5" strokeWidth="0.75" />
    </svg>
  );
}

/**
 * A gilded museum frame that cross-fades through the viewer's collectibles.
 * Pauses on hover/focus; no auto-rotation when the OS asks for reduced motion.
 */
export function PaintingFrame({ artworks, intervalMs = 10_000, emptyMessage = 'Add a wallet that holds NFTs or Ordinals to hang art here' }: PaintingFrameProps) {
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const gradientId = useId();
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = artworks.length;
  const safeIndex = count ? index % count : 0;
  const current = artworks[safeIndex];

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Latest values for the interval callback without re-creating the timer
  const stateRef = useRef({ index: safeIndex, count });
  useEffect(() => {
    stateRef.current = { index: safeIndex, count };
  });

  const go = (next: number) => {
    const { index: from, count: n } = stateRef.current;
    if (!n) return;
    setPrevious(from);
    setIndex(((next % n) + n) % n);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setPrevious(null), FADE_MS);
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  useEffect(() => {
    if (paused || reducedMotion || count < 2) return;
    const timer = setInterval(() => goRef.current(stateRef.current.index + 1), intervalMs);
    return () => clearInterval(timer);
  }, [paused, reducedMotion, count, intervalMs]);

  // Warm the next image so the cross-fade never shows an empty mat
  useEffect(() => {
    const next = artworks[(safeIndex + 1) % Math.max(1, count)];
    if (next && !next.live) {
      const img = new Image();
      img.src = next.imageUrl;
    }
  }, [safeIndex, artworks, count]);

  useEffect(() => () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); }, []);

  const layer = (art: Artwork, visible: boolean) => {
    const ready = loaded[art.id] || art.live;
    const onLoad = () => setLoaded((l) => (l[art.id] ? l : { ...l, [art.id]: true }));
    return (
      <div
        key={art.id}
        className="absolute inset-0 transition-opacity ease-in-out"
        style={{ opacity: visible && ready ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
        aria-hidden={!visible}
      >
        {art.live ? (
          <iframe
            src={art.imageUrl}
            title={art.title}
            sandbox="allow-scripts"
            loading="lazy"
            className="pointer-events-none h-full w-full border-0 bg-white"
            onLoad={onLoad}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- remote NFT media
          <img
            src={art.imageUrl}
            alt={art.title}
            onLoad={onLoad}
            onError={onLoad}
            className="h-full w-full object-contain"
            style={{ imageRendering: art.pixelated ? 'pixelated' : 'auto' }}
          />
        )}
      </div>
    );
  };

  return (
    <figure
      className="relative m-0 flex h-full flex-col items-center justify-center overflow-hidden rounded-2xl px-6 py-8 sm:px-10"
      style={{
        // Gallery wall with a picture light above the frame
        background: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(255,236,190,0.75), rgba(255,236,190,0) 70%), linear-gradient(180deg, #ece4d6 0%, #e2d8c6 100%)',
      }}
      aria-roledescription="carousel"
      aria-label="Collectibles on display"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff3bd" />
            <stop offset="0.45" stopColor="#d4a43a" />
            <stop offset="1" stopColor="#7b5515" />
          </linearGradient>
        </defs>
      </svg>

      {/* Frame */}
      <div
        className="relative w-full max-w-[420px] rounded-[6px] p-[18px] sm:p-[24px]"
        style={{
          background: `${PATINA}, ${GILT}`,
          boxShadow: [
            '0 30px 45px -18px rgba(40,25,5,0.55)',
            '0 10px 14px -8px rgba(40,25,5,0.35)',
            // outer bead and highlight
            'inset 0 0 0 1px rgba(40,25,5,0.6)',
            'inset 0 0 0 3px rgba(230,205,140,0.55)',
            'inset 0 0 0 4px rgba(60,40,10,0.45)',
            'inset 0 3px 3px rgba(255,240,200,0.55)',
            'inset 0 -4px 6px rgba(40,25,5,0.55)',
          ].join(', '),
        }}
      >
        <Corner gradientId={gradientId} className="-left-1 -top-1" />
        <Corner gradientId={gradientId} className="-right-1 -top-1 rotate-90" />
        <Corner gradientId={gradientId} className="-bottom-1 -right-1 rotate-180" />
        <Corner gradientId={gradientId} className="-bottom-1 -left-1 -rotate-90" />

        {/* Inner gilt lip */}
        <div
          className="rounded-[3px] p-[6px]"
          style={{
            background: `${PATINA}, ${GILT_INNER}`,
            // beaded inner molding: alternating dark/light rings
            boxShadow: '0 0 0 1px rgba(40,25,5,0.65), inset 0 0 0 1px rgba(240,215,150,0.6), inset 0 0 0 2px rgba(60,40,10,0.55), inset 0 2px 4px rgba(40,25,5,0.6)',
          }}
        >
          {/* Mat */}
          <div className="p-[9%]" style={{ background: '#f4eedf', boxShadow: 'inset 0 3px 10px rgba(50,35,10,0.35), inset 0 0 0 1px rgba(120,95,50,0.25)' }}>
            <div className="relative aspect-square w-full overflow-hidden bg-[#ebe4d4]" style={{ boxShadow: '0 0 0 1px rgba(90,70,35,0.35), 0 2px 6px rgba(40,25,5,0.35)' }}>
              {count === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-center font-serif text-sm italic text-[#7a6845]">
                  {emptyMessage}
                </div>
              ) : (
                <>
                  {previous !== null && previous !== safeIndex && artworks[previous] && layer(artworks[previous], false)}
                  {current && layer(current, true)}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Brass plaque */}
      {current && (
        <figcaption
          className="relative mt-5 w-full max-w-[300px] rounded-[3px] px-4 py-2 text-center"
          style={{ background: BRASS, boxShadow: '0 4px 8px -3px rgba(40,25,5,0.5), inset 0 1px 0 rgba(255,245,210,0.7), inset 0 -1px 0 rgba(80,55,10,0.5)' }}
          aria-live="polite"
        >
          <div className="truncate font-serif text-sm font-semibold tracking-wide text-[#3b2a0a]" style={{ textShadow: '0 1px 0 rgba(255,240,200,0.6)' }}>
            {current.title}
          </div>
          <div className="truncate font-serif text-[11px] uppercase tracking-[0.12em] text-[#4d3810]">{current.subtitle}</div>
          {current.detail && <div className="font-serif text-[11px] italic text-[#4d3810]">{current.detail}</div>}
        </figcaption>
      )}

      {count > 1 && (
        <div className="mt-4 flex items-center gap-3 text-xs text-[#6b5a3a]">
          <button onClick={() => go(safeIndex - 1)} aria-label="Previous piece" className="rounded-full px-2 py-1 hover:bg-black/5">‹</button>
          <span className="tabular-nums">{safeIndex + 1} / {count}</span>
          <button onClick={() => go(safeIndex + 1)} aria-label="Next piece" className="rounded-full px-2 py-1 hover:bg-black/5">›</button>
          {(paused || reducedMotion) && <span className="italic">{reducedMotion ? 'auto-rotate off (reduced motion)' : 'paused'}</span>}
        </div>
      )}
    </figure>
  );
}
