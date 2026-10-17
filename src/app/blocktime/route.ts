import { proxyOrdinals } from '@/utils/ordinalsProxy';

/** GET /blocktime: ordinals.com's legacy recursion endpoint, used by some inscriptions. */
export async function GET() {
  return proxyOrdinals('/blocktime', { immutable: false });
}
