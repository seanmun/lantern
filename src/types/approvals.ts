/** Open token approvals for a wallet (see src/chains/approvals.ts). */

export interface ApprovalItem {
  chain: string;
  token: string;
  tokenSymbol: string;
  kind: 'erc20' | 'nft-all';      // nft-all: ApprovalForAll on a whole collection
  spender: string;
  spenderName: string | null;
  spenderVerified: boolean;
  spenderIsContract: boolean;
  allowance: number | null;       // tokens; null when unlimited or unknown
  unlimited: boolean;
  balance: number | null;         // the wallet's balance of the token
  valueAtRiskUSD: number | null;  // what the spender could take today
  lastApprovedBlock: number;
  risk: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface ChainApprovals {
  chain: string;
  chainId: number;
  items: ApprovalItem[];
  scanned: number;                // approval events found
  error?: string;
}

export interface ApprovalsReport {
  address: string;
  chains: ChainApprovals[];
}
