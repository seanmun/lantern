'use client';

import { useState } from 'react';

// Muted badge colors, picked by symbol so a token keeps its color
const BADGES = ['bg-purple-100 text-purple-700', 'bg-pink-100 text-pink-700', 'bg-sky-100 text-sky-700', 'bg-amber-100 text-amber-800', 'bg-emerald-100 text-emerald-700', 'bg-indigo-100 text-indigo-700'];

/**
 * Round token logo, served through /api/logos so the browser never contacts a
 * third party. Falls back to a lettered badge when there's no logo.
 */
export function TokenLogo({ src, symbol, size = 20 }: { src?: string; symbol: string; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size };

  if (!src || failed === src) {
    const hash = [...symbol].reduce((h, c) => h + c.charCodeAt(0), 0);
    return (
      <span
        aria-hidden
        style={{ ...style, fontSize: Math.max(8, size * 0.42) }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${BADGES[hash % BADGES.length]}`}
      >
        {symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, size >= 28 ? 3 : 2).toUpperCase() || '?'}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small proxied logos; next/image adds nothing here
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={style}
      className="shrink-0 rounded-full bg-white object-cover ring-1 ring-black/5"
      onError={() => setFailed(src)}
    />
  );
}
