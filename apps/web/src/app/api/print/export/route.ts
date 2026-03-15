import { NextRequest } from 'next/server';
import { apiJsonError } from '@/app/api/_shared';
import { exportPrintPageAsPdf } from '@/lib/export/server-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const target = request.nextUrl.searchParams.get('target') ?? '';
    const filename = request.nextUrl.searchParams.get('filename') ?? 'ahwa-export';
    const pdf = await exportPrintPageAsPdf({ request, target, filename });

    return new Response(pdf.bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    return apiJsonError(error, 500, 'PDF_EXPORT_FAILED');
  }
}
