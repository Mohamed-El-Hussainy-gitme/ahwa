import { Suspense } from 'react';
import PlatformLoginClient from './PlatformLoginClient';
export const dynamic = 'force-dynamic';
export default function PlatformLoginPage() { return <Suspense fallback={<div className="min-h-dvh bg-neutral-50" />}><PlatformLoginClient /></Suspense>; }
