type SessionSelectorItem = {
  id: string;
  label: string;
  subtitle: string;
};

type Props = {
  items: SessionSelectorItem[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  emptyLabel: string;
  columns?: 1 | 2;
};

export function SessionSelectorGrid({
  items,
  activeId,
  onSelect,
  disabled = false,
  emptyLabel,
  columns = 2,
}: Props) {
  if (!items.length) {
    return <div className="rounded-[20px] border border-dashed border-[#d8c7b3] bg-[#fffaf3] p-3 text-sm text-[#6b5a4c]">{emptyLabel}</div>;
  }

  return (
    <div className={columns === 1 ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'}>
      {items.map((item) => {
        const active = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            disabled={disabled}
            className={[
              'rounded-[20px] border px-3 py-3 text-right transition disabled:opacity-60',
              active
                ? 'border-[#1e1712] bg-[#1e1712] text-white shadow-[0_14px_28px_rgba(30,23,18,0.16)]'
                : 'border-[#decdb9] bg-[#fffdf8] text-[#2f241b] hover:bg-[#f3e8da]',
            ].join(' ')}
          >
            <div className="truncate text-sm font-bold">{item.label}</div>
            <div className={['mt-1 text-xs', active ? 'text-white/75' : 'text-[#7d6a59]'].join(' ')}>{item.subtitle}</div>
          </button>
        );
      })}
    </div>
  );
}
