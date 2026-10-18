import { useId } from 'react';

/**
 * The Lantern logo as a vector: a violet lantern with a faceted hexagon flame,
 * redrawn from public/Lantern.png so it stays crisp from 16 px up and sits on
 * any background. The frame takes --color-mark (lighter in dark mode).
 */
export function LanternMark({ size = 26, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const frame = 'var(--color-mark)';
  // Left half of the cage, mirrored for the right
  const cage = 'M627 474H470Q431 474 431 513L342 902Q334 945 372 967L460 1004';
  const glass = 'M515 530C470 600 440 700 443 820C445 880 455 920 482 948';
  return (
    <svg width={size} height={size} viewBox="112 110 1030 1030" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`glow-${id}`} cx="627" cy="790" r="200" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD27A" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFD27A" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* handle (its lower ends hide behind the cap) */}
      <rect x="445" y="145" width="364" height="290" rx="88" fill="none" stroke={frame} strokeWidth="34" />
      {/* glass: glow, then outline */}
      <path d={`${glass}H772C799 920 809 880 811 820C814 700 784 600 739 530Z`} fill={`url(#glow-${id})`} />
      <path d={glass} fill="none" stroke={frame} strokeWidth="17" strokeLinecap="round" />
      <path d={glass} fill="none" stroke={frame} strokeWidth="17" strokeLinecap="round" transform="translate(1254 0) scale(-1 1)" />
      {/* cage */}
      <path d={cage} fill="none" stroke={frame} strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      <path d={cage} fill="none" stroke={frame} strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" transform="translate(1254 0) scale(-1 1)" />
      {/* knob, cap and collar */}
      <rect x="562" y="312" width="128" height="62" rx="9" fill={frame} />
      <path d="M533 368H721Q729 368 733 375L770 440Q774 452 762 452H492Q480 452 484 440L521 375Q525 368 533 368Z" fill={frame} />
      <rect x="512" y="448" width="230" height="82" rx="8" fill={frame} />
      {/* hexagon flame */}
      <g>
        <path d="M628 620L525 765L627 700Z" fill="#FF4E58" />
        <path d="M628 620L627 700L730 765Z" fill="#F0308C" />
        <path d="M525 765L627 700L627 790Z" fill="#FF7A2E" />
        <path d="M730 765L627 700L627 790Z" fill="#FF5A36" />
        <path d="M525 765L525 873L627 790Z" fill="#FF9A2E" />
        <path d="M730 765L730 873L627 790Z" fill="#FF7424" />
        <path d="M525 873L627 940L627 790Z" fill="#FFC23A" />
        <path d="M730 873L627 940L627 790Z" fill="#FFAA30" />
        <path d="M627 790L598 860L627 940L656 860Z" fill="#FFE14A" />
      </g>
      {/* burner and base */}
      <rect x="518" y="940" width="218" height="56" rx="10" fill={frame} />
      <path d="M465 996H789L826 1036H838Q848 1036 848 1046V1108Q848 1118 838 1118H416Q406 1118 406 1108V1046Q406 1036 416 1036H428Z" fill={frame} />
    </svg>
  );
}
