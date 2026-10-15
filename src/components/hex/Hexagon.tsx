import { ReactNode, useId } from 'react';

interface HexagonProps {
  size?: number;
  children?: ReactNode;
  className?: string;
  /** Gradient stops; defaults to the HEX pink → purple */
  from?: string;
  to?: string;
}

/**
 * Pointy-top hexagon with optional centered content, the HEX visual motif.
 */
export function Hexagon({ size = 40, children, className = '', from = '#ff006b', to = '#9333ea' }: HexagonProps) {
  const gradientId = useId();
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill={`url(#${gradientId})`} />
      </svg>
      {children && <span className="relative text-xs font-bold text-white">{children}</span>}
    </span>
  );
}
