import type { ReactNode } from 'react';

export function PlatformPageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          {eyebrow ? <div className="text-sm font-semibold text-indigo-600">{eyebrow}</div> : null}
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
          {description ? <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
