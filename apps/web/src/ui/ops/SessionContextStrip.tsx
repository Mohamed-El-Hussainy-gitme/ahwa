'use client';

import Link, { type LinkProps } from 'next/link';

type Stat = {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'emerald' | 'amber' | 'sky';
};

type Action = {
  label: string;
  href: LinkProps['href'];
};

function statTone(tone: Stat['tone']) {
  if (tone === 'emerald') return 'bg-emerald-50 text-emerald-700';
  if (tone === 'amber') return 'bg-amber-50 text-amber-700';
  if (tone === 'sky') return 'bg-sky-50 text-sky-700';
  return 'bg-slate-100 text-slate-700';
}

export function SessionContextStrip({
  title,
  subtitle,
  stats,
  actions,
}: {
  title: string;
  subtitle?: string;
  stats?: Stat[];
  actions?: Action[];
}) {
  return (
    <div className="sticky top-[108px] z-[5] rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-bold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>

        {stats?.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {stats.map((stat) => (
              <div key={`${stat.label}-${stat.value}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${statTone(stat.tone)}`}>
                {stat.label} {stat.value}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {actions?.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {actions.map((action) => (
            <Link
              key={`${String(action.href)}-${action.label}`}
              href={action.href}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold whitespace-nowrap text-slate-700"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
