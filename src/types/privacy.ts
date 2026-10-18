/** Public facts behind the wallet privacy score (see src/chains/privacy.ts and src/utils/privacyScore.ts). */
export interface PrivacyFacts {
  address: string;
  ens: string | null;                          // ENS name pointing at the wallet
  identityTags: string[];                      // explorer tags naming a person or organisation
  activeChains: string[];                      // chains where the address has sent transactions
  transactions: number;                        // public transaction count (Ethereum + PulseChain)
  exchanges: { name: string; count: number }[]; // exchanges seen among recent counterparties
  privacyTools: string[];                      // privacy systems the wallet has used
  counterparties: string[];                    // recent counterparties, lowercase
  sampled: number;                             // how many recent transfers were looked at
}
