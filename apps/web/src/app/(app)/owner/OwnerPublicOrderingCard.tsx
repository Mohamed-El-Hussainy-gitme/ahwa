'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AppIcon } from '@/ui/icons/AppIcon';
import { useSession } from '@/lib/session';

function resolvePublicUrl(cafeSlug: string) {
  if (typeof window === 'undefined') {
    return `/c/${cafeSlug}`;
  }
  return `${window.location.origin}/c/${cafeSlug}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function OwnerPublicOrderingCard() {
  const session = useSession();
  const cafeSlug = session.user?.cafeSlug?.trim() ?? '';
  const cafeName = session.user?.cafeName?.trim() || 'القهوة الحالية';
  const [svgMarkup, setSvgMarkup] = useState('');
  const [qrStatus, setQrStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  const publicUrl = useMemo(() => (cafeSlug ? resolvePublicUrl(cafeSlug) : ''), [cafeSlug]);
  const qrImageSrc = useMemo(() => {
    if (!svgMarkup) return '';
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  }, [svgMarkup]);

  useEffect(() => {
    let cancelled = false;

    async function buildQr() {
      if (!publicUrl) {
        setSvgMarkup('');
        setQrStatus('failed');
        return;
      }

      setQrStatus('loading');
      try {
        const markup = await QRCode.toString(publicUrl, {
          type: 'svg',
          width: 512,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#1e1712',
            light: '#ffffff',
          },
        });
        if (!cancelled) {
          setSvgMarkup(markup);
          setQrStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setSvgMarkup('');
          setQrStatus('failed');
        }
      }
    }

    void buildQr();

    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  function handlePrint() {
    if (!svgMarkup || typeof window === 'undefined') return;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    const safeCafeName = escapeHtml(cafeName);
    const safePublicUrl = escapeHtml(publicUrl);

    printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>QR - ${safeCafeName}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: Arial, sans-serif;
        background: #f4ede3;
        color: #1e1712;
        margin: 0;
        padding: 24px;
      }
      .sheet {
        width: 820px;
        max-width: 100%;
        margin: 0 auto;
        background: #fffdf9;
        border: 1px solid #dccdbb;
        border-radius: 28px;
        padding: 40px 36px;
        text-align: center;
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.24em;
        color: #9b6b2e;
        font-weight: 700;
      }
      h1 {
        font-size: 32px;
        margin: 14px 0 10px;
        line-height: 1.3;
      }
      .lead {
        max-width: 520px;
        margin: 0 auto;
        line-height: 1.9;
        color: #6b5a4c;
        font-size: 16px;
      }
      .qr-wrap {
        margin: 28px auto 18px;
        width: 360px;
        max-width: 100%;
        padding: 20px;
        border-radius: 28px;
        border: 1px solid #e6d8c6;
        background: #ffffff;
      }
      .qr-wrap svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .hint {
        margin-top: 14px;
        font-size: 14px;
        color: #6b5a4c;
      }
      .url {
        margin-top: 14px;
        direction: ltr;
        word-break: break-all;
        font-size: 12px;
        color: #8a6f59;
      }
      @media print {
        @page { size: A4 portrait; margin: 12mm; }
        body {
          background: white;
          padding: 0;
        }
        .sheet {
          width: auto;
          border-radius: 0;
          border: none;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <section class="sheet">
      <div class="eyebrow">QR ORDERING</div>
      <h1>${safeCafeName}</h1>
      <p class="lead">امسح الكود لفتح المنيو والطلب مباشرة بدون انتظار الويتر.</p>
      <div class="qr-wrap">${svgMarkup}</div>
      <div class="hint">Scan to view menu and order</div>
      <div class="url">${safePublicUrl}</div>
    </section>
    <script>
      window.onload = function () { window.print(); };
    </script>
  </body>
</html>`);
    printWindow.document.close();
  }

  if (!cafeSlug) {
    return (
      <div className="rounded-[24px] border border-[#dccdbb] bg-[#fffaf4] p-4 text-sm leading-7 text-[#6b5a4c] shadow-sm">
        تعذر تجهيز رابط الطلب الذاتي الآن لأن slug المقهى غير متاح في الجلسة الحالية.
      </div>
    );
  }

  return (
    <section className="rounded-[28px] border border-[#dccdbb] bg-[linear-gradient(180deg,#fffdf9_0%,#f5ecdf_100%)] p-5 shadow-[0_18px_40px_rgba(30,23,18,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.24em] text-[#9b6b2e]">QR ORDERING</div>
          <h2 className="mt-2 text-[22px] font-black leading-tight text-[#1e1712]">QR الطلب الذاتي للزبائن</h2>
          <p className="mt-2 text-sm leading-7 text-[#6b5a4c]">
            اطبع البطاقة الخاصة بـ <span className="font-bold text-[#1e1712]">{cafeName}</span> وضعها داخل المقهى ليتمكن الزبائن من
            فتح المنيو والطلب مباشرة.
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[#ead5b8] bg-white/80 text-[#9b6b2e] shadow-sm">
          <AppIcon name="menu" className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 rounded-[26px] border border-[#e6d8c6] bg-[#fffaf4] p-4 md:p-6">
        <div className="mx-auto max-w-[420px] rounded-[28px] border border-[#dccdbb] bg-white px-5 py-6 text-center shadow-sm">
          <div className="text-[11px] font-semibold tracking-[0.24em] text-[#9b6b2e]">QR ORDERING</div>
          <h3 className="mt-3 text-[28px] font-black leading-tight text-[#1e1712]">{cafeName}</h3>
          <p className="mt-3 text-sm leading-7 text-[#6b5a4c]">امسح الكود لفتح المنيو والطلب مباشرة بدون انتظار الويتر.</p>

          <div className="mx-auto mt-5 w-full max-w-[280px] rounded-[24px] border border-[#e6d8c6] bg-white p-4 shadow-sm">
            {qrStatus === 'ready' ? (
              <img src={qrImageSrc} alt={`QR ${cafeName}`} className="block h-auto w-full" />
            ) : qrStatus === 'failed' ? (
              <div className="rounded-[18px] bg-[#fff7f1] p-4 text-center text-xs leading-6 text-[#8d5d3b]">
                تعذر توليد QR الآن. تأكد من تثبيت الحزمة الجديدة ثم أعد التشغيل.
              </div>
            ) : (
              <div className="rounded-[18px] bg-[#f8f1e6] p-8 text-center text-xs leading-6 text-[#6b5a4c]">جارٍ توليد QR…</div>
            )}
          </div>

          <div className="mt-4 text-sm text-[#6b5a4c]">Scan to view menu and order</div>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={handlePrint}
          disabled={qrStatus !== 'ready'}
          className="inline-flex items-center gap-2 rounded-[18px] border border-[#dccdbb] bg-[#1e1712] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AppIcon name="chart" className="h-4 w-4" />
          طباعة QR
        </button>
      </div>
    </section>
  );
}
