import type { RecentSessionLabel } from '@/lib/ops/types';

const labelBoxBase =
  'flex min-h-[3rem] items-center justify-center rounded-[14px] border border-white/12 bg-[#1e1712] px-1.5 py-2 text-center text-[12px] font-black leading-tight text-white shadow-[0_10px_20px_rgba(30,23,18,0.16)] transition duration-150 hover:-translate-y-[1px] hover:bg-[#2c221b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4d8ae]/60';

export function QuickSessionLabelGrid({
  items,
  onSelect,
}: {
  items: RecentSessionLabel[];
  onSelect: (label: string) => void;
}) {
  if (!items.length) return null;

  return (
    <div className="mt-4 text-right">
      <div className="mb-2 text-xs font-semibold text-[#7d6a59]">اختيار سريع</div>
      <div className="max-h-56 overflow-y-auto rounded-[22px] bg-[#120d09] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(3.1rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))]">
          {items.map((item) => (
            <button
              key={`${item.label}-${item.lastUsedAt ?? ''}`}
              type="button"
              onClick={() => onSelect(item.label)}
              className={labelBoxBase}
              title={item.label}
            >
              <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
