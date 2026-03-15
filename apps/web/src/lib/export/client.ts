'use client';

import { sanitizePdfFilename } from '@/lib/export/shared';

type DownloadPdfOptions = {
  targetPath: string;
  filename: string;
};

function getErrorCode(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'PDF_EXPORT_FAILED';
  const error = (payload as { error?: { code?: unknown } }).error;
  return typeof error?.code === 'string' ? error.code : 'PDF_EXPORT_FAILED';
}

export async function downloadServerRenderedPdf(options: DownloadPdfOptions) {
  const url = new URL('/api/print/export', window.location.origin);
  url.searchParams.set('target', options.targetPath);
  url.searchParams.set('filename', sanitizePdfFilename(options.filename));

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new Error(getErrorCode(payload));
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${sanitizePdfFilename(options.filename)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
