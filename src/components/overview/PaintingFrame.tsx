'use client';

import { useEffect, useRef, useState } from 'react';
import { BaroqueFrame, OPENING_INSET } from './BaroqueFrame';

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

const BRASS = 'linear-gradient(180deg, #e9cd7d 0%, #c99d3e 45%, #a57826 100%)';
// Deep velvet slip between the carving and the art, as Victorian frames had
const VELVET = 'radial-gradient(120% 110% at 50% 35%, #5c1622 0%, #3d0c15 55%, #23060c 100%)';

/**
 * A carved Baroque frame that cross-fades through the viewer's collectibles.
 * Pauses on hover/focus; no auto-rotation when the OS asks for reduced motion.
 */
export function PaintingFrame({ artworks, intervalMs = 10_000, emptyMessage = 'Add a wallet that holds NFTs or Ordinals to hang art here' }: PaintingFrameProps) {
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
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
        ) : failed[art.id] ? (
          <div className="flex h-full items-center justify-center p-6 text-center font-serif text-sm italic text-[#7a6845]">
            This piece&apos;s image couldn&apos;t be loaded from where it&apos;s hosted
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- remote NFT media
          <img
            src={art.imageUrl}
            alt={art.title}
            onLoad={onLoad}
            onError={() => {
              setFailed((f) => ({ ...f, [art.id]: true }));
              onLoad();
            }}
            className="h-full w-full object-contain"
            style={{ imageRendering: art.pixelated ? 'pixelated' : 'auto' }}
          />
        )}
      </div>
    );
  };

  return (
    <figure
      // Hangs straight on the page: no backdrop, so the frame gets the full width
      className="relative m-0 flex flex-col items-center"
      aria-roledescription="carousel"
      aria-label="Collectibles on display"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Frame: the opening sits under the carving so the moulding's shadow falls onto it */}
      <div className="relative aspect-square w-full" style={{ filter: 'drop-shadow(0 22px 22px rgba(10,5,0,0.55)) drop-shadow(0 6px 6px rgba(10,5,0,0.35))' }}>
        <div className="absolute p-[4%]" style={{ inset: `${OPENING_INSET * 100}%`, background: VELVET, boxShadow: 'inset 0 8px 14px rgba(0,0,0,0.65), inset 0 -2px 6px rgba(0,0,0,0.4)' }}>
          <div
            className="relative h-full w-full overflow-hidden bg-[#ebe4d4]"
            // a thin gilt fillet around the art
            style={{ boxShadow: '0 0 0 1.5px #d6b263, 0 0 0 2.5px #3a2504, 0 3px 8px rgba(0,0,0,0.55)' }}
          >
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
        <BaroqueFrame className="pointer-events-none absolute inset-0 h-full w-full" />
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
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <button onClick={() => go(safeIndex - 1)} aria-label="Previous piece" className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink hover:bg-soft">‹</button>
          <span className="tabular-nums">{safeIndex + 1} / {count}</span>
          <button onClick={() => go(safeIndex + 1)} aria-label="Next piece" className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink hover:bg-soft">›</button>
          {(paused || reducedMotion) && <span className="italic">{reducedMotion ? 'auto-rotate off (reduced motion)' : 'paused'}</span>}
        </div>
      )}
    </figure>
  );
}
