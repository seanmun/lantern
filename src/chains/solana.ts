import 'server-only';
import { Asset, APIResponse } from '@/types';
import { fetchWithRetry } from '@/utils/api';

/**
 * Solana Handler - SOL + SPL tokens (classic Token program and Token-2022)
 *
 * Uses plain JSON-RPC: the public mainnet endpoint by default, or
 * SOLANA_RPC_URL (e.g. a Helius/QuickNode URL) for higher rate limits.
 * Token names/symbols come from DexScreener; tokens with no market there
 * are kept but labeled unknown (often airdropped spam).
 */

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
];
const LAMPORTS_PER_SOL = 1e9;
const META_BATCH = 30;

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: { mint: string; tokenAmount: { amount: string; decimals: number; uiAmountString: string } };
      };
    };
  };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetchWithRetry(
    RPC_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    },
    { maxRetries: 2 }
  );
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result as T;
}

/** Symbol + name for each mint that has a DEX market. */
async function tokenMetadata(mints: string[]): Promise<Map<string, { symbol: string; name: string }>> {
  const meta = new Map<string, { symbol: string; name: string }>();
  for (let i = 0; i < mints.length; i += META_BATCH) {
    try {
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.slice(i, i + META_BATCH).join(',')}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const pairs: { baseToken: { address: string; symbol: string; name: string } }[] = await response.json();
      for (const pair of Array.isArray(pairs) ? pairs : []) {
        if (!meta.has(pair.baseToken.address)) {
          meta.set(pair.baseToken.address, { symbol: pair.baseToken.symbol, name: pair.baseToken.name });
        }
      }
    } catch (error) {
      console.warn('⚠️ Solana token metadata lookup failed:', error);
    }
  }
  return meta;
}

export class SolanaHandler {
  private readonly CHAIN_NAME = 'solana';

  async getAllAssets(address: string): Promise<APIResponse<Asset[]>> {
    try {
      const [balance, ...tokenResults] = await Promise.all([
        rpc<{ value: number }>('getBalance', [address]),
        ...TOKEN_PROGRAMS.map((programId) =>
          rpc<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [address, { programId }, { encoding: 'jsonParsed' }])
        ),
      ]);

      // A wallet can hold several accounts for the same mint; sum them
      const byMint = new Map<string, { raw: bigint; decimals: number }>();
      for (const result of tokenResults) {
        for (const { account } of result.value) {
          const { mint, tokenAmount } = account.data.parsed.info;
          const raw = BigInt(tokenAmount.amount);
          if (raw === BigInt(0)) continue;
          const entry = byMint.get(mint) ?? { raw: BigInt(0), decimals: tokenAmount.decimals };
          entry.raw += raw;
          byMint.set(mint, entry);
        }
      }

      const meta = await tokenMetadata([...byMint.keys()]);
      const now = new Date();

      const assets: Asset[] = [
        {
          id: `sol_${address}_native`,
          type: 'native',
          chain: this.CHAIN_NAME,
          walletAddress: address,
          name: 'Solana',
          symbol: 'SOL',
          decimals: 9,
          balance: String(balance.value),
          balanceFormatted: String(balance.value / LAMPORTS_PER_SOL),
          lastUpdated: now,
        },
        ...[...byMint].map(([mint, { raw, decimals }]): Asset => {
          const info = meta.get(mint);
          const whole = Number(raw) / 10 ** decimals;
          return {
            id: `sol_${address}_${mint}`,
            type: 'token',
            chain: this.CHAIN_NAME,
            walletAddress: address,
            name: info?.name ?? 'Unknown token',
            symbol: info?.symbol ?? `${mint.slice(0, 4)}…`,
            decimals,
            balance: raw.toString(),
            balanceFormatted: String(whole),
            contractAddress: mint,
            tokenStandard: 'SPL',
            lastUpdated: now,
          };
        }),
      ];

      return { success: true, data: assets, timestamp: now };
    } catch (error) {
      console.error('❌ Error fetching Solana assets:', error);
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to fetch Solana assets: ${message}`,
        errorCode: /429|rate/i.test(message) ? 'RATE_LIMITED' : undefined,
        timestamp: new Date(),
      };
    }
  }
}
