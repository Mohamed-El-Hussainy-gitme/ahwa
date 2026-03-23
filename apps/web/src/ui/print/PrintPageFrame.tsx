'use client';

import type { ReactNode } from 'react';

type PrintPageFrameProps = {
  title: string;
  subtitle?: string;
  exportFilename?: string;
  children: ReactNode;
  shellClassName?: string;
  contentClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
};

function mergeClassNames(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function PrintPageFrame({
  title,
  subtitle,
  exportFilename,
  children,
  shellClassName,
  contentClassName,
  titleClassName,
  subtitleClassName,
}: PrintPageFrameProps) {
  void exportFilename;

  return (
    <main className="min-h-screen bg-neutral-100 print:bg-white">
      <div className={mergeClassNames('mx-auto max-w-5xl px-4 py-4 print:max-w-none print:px-0 print:py-0', shellClassName)}>
        <div className="mb-4 rounded-3xl border bg-white p-4 shadow-sm print:hidden">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className={mergeClassNames('text-lg font-bold text-neutral-900', titleClassName)}>{title}</div>
              {subtitle ? <div className={mergeClassNames('mt-1 text-xs text-neutral-500', subtitleClassName)}>{subtitle}</div> : null}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => window.print()} className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">طباعة</button>
              <button type="button" onClick={() => window.history.back()} className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-neutral-700">رجوع</button>
            </div>
          </div>
        </div>
        <div id="pdf-export-root" className={mergeClassNames('rounded-3xl border bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none', contentClassName)}>
          <div className="mb-4 border-b pb-3 print:mb-3">
            <div className={mergeClassNames('text-2xl font-bold text-neutral-900 print:text-xl', titleClassName)}>{title}</div>
            {subtitle ? <div className={mergeClassNames('mt-1 text-xs text-neutral-500', subtitleClassName)}>{subtitle}</div> : null}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
