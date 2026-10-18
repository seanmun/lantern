import type { Metadata } from 'next';
import { StatusView } from '@/components/status/StatusView';

export const metadata: Metadata = {
  title: 'Is PulseChain down?',
  description: 'Live health of PulseChain and the services around it: RPCs, explorers, the beacon chain and price feeds.',
};

export default function StatusPage() {
  return <StatusView />;
}
