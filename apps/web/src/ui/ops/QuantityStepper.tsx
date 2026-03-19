'use client';

type Props = {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
};

export function QuantityStepper({ label, value, onDecrement, onIncrement }: Props) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <button
        type="button"
        onClick={onDecrement}
        className="h-11 w-11 rounded-2xl border border-slate-200 bg-white text-lg font-bold text-slate-700"
      >
        -
      </button>

      <div className="text-center">
        <div className="text-[11px] font-semibold text-slate-500">{label}</div>
        <div className="text-xl font-black text-slate-900">{value}</div>
      </div>

      <button
        type="button"
        onClick={onIncrement}
        className="h-11 w-11 rounded-2xl bg-slate-900 text-lg font-bold text-white"
      >
        +
      </button>
    </div>
  );
}
