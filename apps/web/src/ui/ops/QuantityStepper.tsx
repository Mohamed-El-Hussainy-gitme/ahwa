'use client';

type Props = {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  compact?: boolean;
};

export function QuantityStepper({ label, value, onDecrement, onIncrement, compact = false }: Props) {
  if (compact) {
    return (
      <div className="mt-2 flex items-center justify-between rounded-[18px] border border-[#dfd1c1] bg-[#fffdfa] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <button
          type="button"
          onClick={onDecrement}
          className="h-8 w-8 rounded-[14px] border border-[#d8c7b3] bg-white text-sm font-bold text-[#5f4d3d] transition duration-150 hover:-translate-y-[1px] hover:border-[#cbb79e] active:translate-y-0"
        >
          -
        </button>

        <div className="text-center leading-tight">
          <div className="text-[10px] font-semibold tracking-[0.02em] text-[#8c7967]">{label}</div>
          <div className="text-base font-black text-[#1e1712]">{value}</div>
        </div>

        <button
          type="button"
          onClick={onIncrement}
          className="h-8 w-8 rounded-[14px] bg-[#1e1712] text-sm font-bold text-white transition duration-150 hover:-translate-y-[1px] hover:bg-[#2c221b] active:translate-y-0"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center justify-between rounded-[20px] border border-[#dfd1c1] bg-[#fffdfa] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <button
        type="button"
        onClick={onDecrement}
        className="h-11 w-11 rounded-[16px] border border-[#d8c7b3] bg-white text-lg font-bold text-[#5f4d3d] transition duration-150 hover:-translate-y-[1px] hover:border-[#cbb79e] active:translate-y-0"
      >
        -
      </button>

      <div className="text-center">
        <div className="text-[11px] font-semibold tracking-[0.02em] text-[#8c7967]">{label}</div>
        <div className="text-xl font-black text-[#1e1712]">{value}</div>
      </div>

      <button
        type="button"
        onClick={onIncrement}
        className="h-11 w-11 rounded-[16px] bg-[#1e1712] text-lg font-bold text-white transition duration-150 hover:-translate-y-[1px] hover:bg-[#2c221b] active:translate-y-0"
      >
        +
      </button>
    </div>
  );
}
