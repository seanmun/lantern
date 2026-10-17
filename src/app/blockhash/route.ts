import { proxyOrdinals } from '@/utils/ordinalsProxy';

/** GET /blockhash: ordinals.com's legacy recursion endpoint, used by some inscriptions. */
export async function GET() {
  return proxyOrdinals('/blockhash', { immutable: false });
}
