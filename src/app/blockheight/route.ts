import { proxyOrdinals } from '@/utils/ordinalsProxy';

/** GET /blockheight: ordinals.com's legacy recursion endpoint, used by some inscriptions. */
export async function GET() {
  return proxyOrdinals('/blockheight', { immutable: false });
}
