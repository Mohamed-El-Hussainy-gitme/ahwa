'use client';

export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-[#dccdbd] bg-[linear-gradient(180deg,rgba(255,252,247,0.98)_0%,rgba(248,240,230,0.98)_100%)] p-3 shadow-[0_16px_40px_rgba(30,23,18,0.14)] backdrop-blur">
      {children}
    </div>
  );
}
