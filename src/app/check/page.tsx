import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckView } from '@/components/check/CheckView';

export const metadata: Metadata = {
  title: 'Check',
  description: 'Check any wallet, token or transaction: is it a scam, is it a fork copy, did it really succeed?',
};

export default function CheckPage() {
  return (
    <Suspense>
      <CheckView />
    </Suspense>
  );
}
