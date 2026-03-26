'use client';

import Link, { type LinkProps } from 'next/link';
import { opsBadge, opsToolbarButton } from '@/ui/ops/premiumStyles';

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
  if (tone === 'emerald') return opsBadge('success');
  if (tone === 'amber') return opsBadge('warning');
  if (tone === 'sky') return opsBadge('info');
  return opsBadge('neutral');
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
    <div className="sticky top-[108px] z-[5] rounded-[24px] border border-[#decdb9] bg-[rgba(255,250,244,0.96)] p-3 shadow-[0_12px_28px_rgba(30,23,18,0.08)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-bold text-[#1e1712]">{title}</div>
          {subtitle ? <div className="mt-1 text-xs leading-6 text-[#7d6a59]">{subtitle}</div> : null}
        </div>

        {stats?.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {stats.map((stat) => (
              <div key={`${stat.label}-${stat.value}`} className={statTone(stat.tone)}>
                {stat.label} {stat.value}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {actions?.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {actions.map((action) => (
            <Link key={`${String(action.href)}-${action.label}`} href={action.href} className={opsToolbarButton}>
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
