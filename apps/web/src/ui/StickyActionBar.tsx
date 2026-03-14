'use client';

export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/95 p-3 shadow-[0_12px_32px_rgba(15,23,42,0.16)] backdrop-blur">
      {children}
    </div>
  );
}
