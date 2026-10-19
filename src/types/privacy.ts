/** Public facts behind the wallet privacy score (see src/chains/privacy.ts and src/utils/privacyScore.ts). */
export interface PrivacyFacts {
  address: string;
  ens: string | null;                          // ENS name pointing at the wallet
  ensRecords: string[];                        // what its ENS profile publishes, e.g. "X (Twitter)", "Email"
  identityTags: string[];                      // explorer tags naming a person or organisation
  activeChains: string[];                      // chains where the address has sent transactions
  transactions: number;                        // public transaction count (Ethereum + PulseChain)
  exchanges: { name: string; count: number }[]; // exchanges seen among recent counterparties
  privacyTools: string[];                      // privacy systems the wallet has used
  counterparties: string[];                    // recent counterparties, lowercase
  sampled: number;                             // how many recent transfers were looked at
  /** Who sent this wallet its first funds */
  funder: { address: string; kind: 'exchange' | 'privacy-tool' | 'contract' | 'wallet'; name: string | null; chain: string } | null;
  /** Exchange deposit addresses this wallet pays into, and how many other wallets pay into the same one */
  deposits: { exchange: string; otherSenders: number }[];
  /** Wallets this one has both sent to and received from */
  twoWay: number;
  /** Likely UTC offset from the daily pause in this wallet's own transactions */
  timezone: { offset: number; sample: number } | null;
}
