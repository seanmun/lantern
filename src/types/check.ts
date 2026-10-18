/** Results of the public /check lookup: a token, a contract, a wallet or a transaction. */

export type CheckVerdict = 'trusted' | 'ok' | 'suspicious' | 'scam' | 'unknown';

export interface CheckSignal {
  id: string;
  strength: 'strong' | 'weak' | 'info' | 'good';
  label: string;
}

export interface TokenCheck {
  chain: string;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number | null;
  priceUSD: number | null;
  liquidityUSD: number | null;
  volume24hUSD: number | null;
  holders: number | null;
  verdict: CheckVerdict;
  signals: CheckSignal[];
  label?: string;             // a well-known contract, e.g. "HEX"
  // PulseChain copied every Ethereum contract at the fork (May 2023)
  forkCopy?: { ethereumSymbol: string; ethereumPriceUSD: number | null };
}

export interface ContractCheck {
  chain: string;
  address: string;
  name: string | null;        // verified contract name
  verified: boolean;
  label?: string;
}

export interface TxTransferCheck {
  token: string;              // contract address
  symbol: string;
  amount: number | null;      // null for NFTs
  from: string;
  to: string;
  nft: boolean;
}

export interface TxCheck {
  chain: string;
  hash: string;
  status: 'success' | 'failed' | 'pending';
  blockNumber: number | null;
  timestamp: number | null;   // ms
  from: string;
  to: string | null;          // null: contract creation
  toLabel?: string;
  value: number;              // native coin
  nativeSymbol: string;
  feeNative: number | null;
  method: string | null;      // decoded function name, if known
  transfers: TxTransferCheck[];
  summary: string;            // plain English
}

export type CheckResult =
  | { kind: 'token'; tokens: TokenCheck[] }        // one per chain the contract exists on
  | { kind: 'contract'; contracts: ContractCheck[] }
  | { kind: 'wallet'; address: string; chains: string[] }
  | { kind: 'tx'; tx: TxCheck }
  | { kind: 'not-found'; message: string }
  | { kind: 'invalid'; message: string };
