'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { downloadServerRenderedPdf } from '@/lib/export/client';

function toPrintableTargetPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function humanizePdfError(code: string) {
  switch (code) {
    case 'INVALID_PDF_TARGET':
    case 'PDF_TARGET_NOT_ALLOWED':
      return 'هذه الصفحة غير متاحة للتصدير بصيغة PDF.';
    case 'PDF_BROWSER_UNAVAILABLE':
      return 'خدمة حفظ PDF غير جاهزة على الخادم الآن. سيتم فتح نافذة الطباعة كحل بديل.';
    case 'PDF_BROWSER_LAUNCH_FAILED':
      return 'تعذر تشغيل محرك حفظ PDF على الخادم. سيتم فتح نافذة الطباعة كحل بديل.';
    default:
      return 'تعذر حفظ الملف بصيغة PDF.';
  }
}

export function PrintPageFrame({ title, subtitle, exportFilename, children }: { title: string; subtitle?: string; exportFilename?: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    try {
      setBusy(true);
      setError(null);
      await downloadServerRenderedPdf({
        targetPath: toPrintableTargetPath(),
        filename: exportFilename || title,
      });
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : 'PDF_EXPORT_FAILED';
      setError(humanizePdfError(message));
      if (message === 'PDF_BROWSER_UNAVAILABLE' || message === 'PDF_BROWSER_LAUNCH_FAILED') {
        window.print();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-100 print:bg-white">
      <div className="mx-auto max-w-5xl px-4 py-4 print:max-w-none print:px-0 print:py-0">
        <div className="mb-4 rounded-3xl border bg-white p-4 shadow-sm print:hidden">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-neutral-900">{title}</div>
              {subtitle ? <div className="mt-1 text-xs text-neutral-500">{subtitle}</div> : null}
              <div className="mt-2 text-xs text-neutral-500">يمكنك الآن حفظ الملف كـ PDF مباشرة من الخادم أو استخدام الطباعة الورقية عند الحاجة.</div>
              {error ? <div className="mt-2 text-xs font-semibold text-red-600">{error}</div> : null}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void handleDownload()} disabled={busy} className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'جاري حفظ PDF...' : 'حفظ PDF'}</button>
              <button type="button" onClick={() => window.print()} className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-neutral-700">طباعة</button>
              <button type="button" onClick={() => window.history.back()} className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-neutral-700">رجوع</button>
            </div>
          </div>
        </div>
        <div id="pdf-export-root" className="rounded-3xl border bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <div className="mb-4 border-b pb-3 print:mb-3">
            <div className="text-2xl font-bold text-neutral-900 print:text-xl">{title}</div>
            {subtitle ? <div className="mt-1 text-xs text-neutral-500">{subtitle}</div> : null}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
