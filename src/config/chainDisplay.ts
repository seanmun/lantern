/**
 * UI metadata per chain. Tailwind classes are written out in full so the
 * class scanner picks them up.
 */
export interface ChainDisplay {
  key: string;
  label: string;
  icon: string;
  dot: string;
  title: string;
  badge: string;
  border: string;
}

export const CHAIN_DISPLAY: ChainDisplay[] = [
  {
    key: 'bitcoin', label: 'Bitcoin', icon: '₿',
    dot: 'from-orange-400 to-orange-600', title: 'from-orange-600 to-orange-800',
    badge: 'bg-orange-100 text-orange-800', border: 'border-orange-100 hover:border-orange-200',
  },
  {
    key: 'ethereum', label: 'Ethereum', icon: 'Ξ',
    dot: 'from-blue-400 to-blue-600', title: 'from-blue-600 to-blue-800',
    badge: 'bg-blue-100 text-blue-800', border: 'border-blue-100 hover:border-blue-200',
  },
  {
    key: 'pulsechain', label: 'Pulsechain', icon: '♦',
    dot: 'from-pink-400 to-pink-600', title: 'from-pink-600 to-pink-800',
    badge: 'bg-pink-100 text-pink-800', border: 'border-pink-100 hover:border-pink-200',
  },
  {
    key: 'base', label: 'Base', icon: '◉',
    dot: 'from-blue-500 to-indigo-700', title: 'from-blue-700 to-indigo-900',
    badge: 'bg-indigo-100 text-indigo-800', border: 'border-indigo-100 hover:border-indigo-200',
  },
  {
    key: 'robinhood', label: 'Robinhood Chain', icon: '🪶',
    dot: 'from-green-400 to-emerald-600', title: 'from-green-600 to-emerald-800',
    badge: 'bg-green-100 text-green-800', border: 'border-green-100 hover:border-green-200',
  },
  {
    key: 'solana', label: 'Solana', icon: '◎',
    dot: 'from-violet-400 to-fuchsia-500', title: 'from-violet-600 to-fuchsia-700',
    badge: 'bg-violet-100 text-violet-800', border: 'border-violet-100 hover:border-violet-200',
  },
  {
    key: 'litecoin', label: 'Litecoin', icon: 'Ł',
    dot: 'from-slate-300 to-slate-500', title: 'from-slate-500 to-slate-700',
    badge: 'bg-slate-100 text-slate-800', border: 'border-slate-100 hover:border-slate-200',
  },
  {
    key: 'dogecoin', label: 'Dogecoin', icon: 'Ð',
    dot: 'from-amber-300 to-amber-500', title: 'from-amber-500 to-amber-700',
    badge: 'bg-amber-100 text-amber-800', border: 'border-amber-100 hover:border-amber-200',
  },
  {
    key: 'bitcoincash', label: 'Bitcoin Cash', icon: 'Ƀ',
    dot: 'from-emerald-400 to-emerald-600', title: 'from-emerald-600 to-emerald-800',
    badge: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-100 hover:border-emerald-200',
  },
];

export const chainLabel = (key: string) => CHAIN_DISPLAY.find((c) => c.key === key)?.label ?? key;
