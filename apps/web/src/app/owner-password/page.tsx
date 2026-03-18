import { Suspense } from 'react';
import OwnerPasswordSetupClient from './OwnerPasswordSetupClient';

export const dynamic = 'force-dynamic';

export default function OwnerPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-50" />}>
      <OwnerPasswordSetupClient />
    </Suspense>
  );
}
