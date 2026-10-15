import { Asset } from '@/types';

/** RFC 4180 field quoting. Leading =,+,-,@ are prefixed so spreadsheets don't run them as formulas. */
function field(value: unknown): string {
  if (value === undefined || value === null) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text) && !/^-?\d/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Portfolio snapshot as CSV, one row per asset. */
export function assetsToCsv(assets: Asset[], walletName: (address: string) => string): string {
  const header = [
    'wallet', 'address', 'chain', 'type', 'standard', 'symbol', 'name', 'balance', 'price_usd', 'value_usd',
    'contract', 'stake_id', 'stake_t_shares', 'stake_interest_hex', 'stake_end_date', 'pool_backing_hex',
  ];
  const rows = assets.map((a) => [
    walletName(a.walletAddress), a.walletAddress, a.chain, a.type, a.tokenStandard, a.symbol, a.name, a.balanceFormatted,
    a.priceUSD, a.valueUSD, a.contractAddress ?? a.inscriptionId, a.stake?.stakeId, a.stake?.tShares, a.stake?.interestHex,
    a.stake?.endDate.slice(0, 10), a.pool?.backingHex,
  ]);
  return [header, ...rows].map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';
}
