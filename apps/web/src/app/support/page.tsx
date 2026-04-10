import { Suspense } from 'react';
import SupportRequestClient from './SupportRequestClient';
export const dynamic = 'force-dynamic';
export default function SupportPage() { return <Suspense fallback={<div className="min-h-dvh bg-neutral-50" />}><SupportRequestClient /></Suspense>; }
