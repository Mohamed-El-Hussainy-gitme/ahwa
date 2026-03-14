"use client";

export function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function StatGrid({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold text-slate-600">{item.label}</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{item.value}</div>
          {item.hint ? <div className="mt-1 text-[11px] text-slate-500">{item.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
}

export function JsonPreview({ value }: { value: unknown }) {
  return <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-3 text-[11px] text-slate-100">{JSON.stringify(value, null, 2)}</pre>;
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={["rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60", props.className || ""].join(" ")} />;
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={["rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60", props.className || ""].join(" ")} />;
}
