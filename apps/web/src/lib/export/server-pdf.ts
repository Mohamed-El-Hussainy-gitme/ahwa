import { access } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { ApiRouteError } from '@/app/api/_shared';
import { isAllowedPrintPathname, sanitizePdfFilename } from '@/lib/export/shared';

type PlaywrightModule = typeof import('playwright');
type ChromiumBrowser = Awaited<ReturnType<PlaywrightModule['chromium']['launch']>>;

type ExportPdfRequest = {
  request: NextRequest;
  target: string;
  filename: string;
};

const DEFAULT_PDF_TIMEOUT_MS = 45_000;
const PRINT_ROOT_SELECTOR = '#pdf-export-root';
const CHROMIUM_CANDIDATE_PATHS = [
  process.env.AHWA_PDF_CHROMIUM_EXECUTABLE_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((value): value is string => Boolean(value));

async function existingExecutablePath() {
  for (const candidate of CHROMIUM_CANDIDATE_PATHS) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return await import('playwright');
  } catch (error) {
    throw new ApiRouteError(
      'PDF_BROWSER_UNAVAILABLE',
      error instanceof Error ? error.message : 'Playwright is not installed.',
      503,
    );
  }
}

function resolveAppOrigin(request: NextRequest) {
  const configured = process.env.AHWA_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();
  if (host) {
    return `${forwardedProto || request.nextUrl.protocol.replace(':', '') || 'http'}://${host}`;
  }

  return request.nextUrl.origin;
}

function resolveTargetUrl(request: NextRequest, target: string) {
  const raw = String(target || '').trim();
  if (!raw.startsWith('/')) {
    throw new ApiRouteError('INVALID_PDF_TARGET', 'Invalid PDF target.', 400);
  }

  const url = new URL(raw, resolveAppOrigin(request));
  if (!isAllowedPrintPathname(url.pathname)) {
    throw new ApiRouteError('PDF_TARGET_NOT_ALLOWED', 'This page cannot be exported as PDF.', 403);
  }

  return url;
}

function parseCookieHeader(request: NextRequest, hostname: string, secure: boolean) {
  const raw = request.headers.get('cookie')?.trim();
  if (!raw) return [];

  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=');
      const name = separatorIndex >= 0 ? entry.slice(0, separatorIndex).trim() : entry.trim();
      const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : '';
      return {
        name,
        value,
        domain: hostname,
        path: '/',
        httpOnly: false,
        secure,
      };
    })
    .filter((cookie) => cookie.name.length > 0);
}

async function launchBrowser(playwright: PlaywrightModule) {
  const executablePath = await existingExecutablePath();

  try {
    return await playwright.chromium.launch({
      headless: true,
      executablePath: executablePath ?? undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=medium'],
    });
  } catch (error) {
    throw new ApiRouteError(
      'PDF_BROWSER_LAUNCH_FAILED',
      error instanceof Error ? error.message : 'Failed to launch Chromium for PDF export.',
      503,
    );
  }
}

async function waitForPrintableState(browser: ChromiumBrowser, url: URL, cookies: ReturnType<typeof parseCookieHeader>) {
  const context = await browser.newContext({
    locale: 'ar-EG',
    colorScheme: 'light',
    viewport: { width: 1280, height: 1810 },
  });

  try {
    if (cookies.length) {
      await context.addCookies(cookies.map((cookie) => ({
        ...cookie,
        url: undefined,
        expires: -1,
        sameSite: 'Lax' as const,
      })));
    }

    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: DEFAULT_PDF_TIMEOUT_MS });
    await page.waitForSelector(PRINT_ROOT_SELECTOR, { state: 'visible', timeout: DEFAULT_PDF_TIMEOUT_MS });
    await page.waitForFunction(
      () => {
        const bodyText = document.body?.innerText ?? '';
        return !bodyText.includes('جاري التحميل') && !bodyText.includes('جاري تجهيز');
      },
      { timeout: DEFAULT_PDF_TIMEOUT_MS },
    ).catch(() => undefined);
    await page.waitForFunction(
      async () => {
        if (!('fonts' in document) || !document.fonts) return true;
        if (document.fonts.status === 'loaded') return true;
        await document.fonts.ready;
        return true;
      },
      { timeout: DEFAULT_PDF_TIMEOUT_MS },
    ).catch(() => undefined);

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '12mm',
        right: '10mm',
        bottom: '12mm',
        left: '10mm',
      },
    });
  } finally {
    await context.close();
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = Uint8Array.from(bytes);
  const arrayBuffer = new ArrayBuffer(copy.byteLength);
  new Uint8Array(arrayBuffer).set(copy);
  return arrayBuffer;
}

export async function exportPrintPageAsPdf({ request, target, filename }: ExportPdfRequest): Promise<{
  bytes: ArrayBuffer;
  filename: string;
}> {
  const targetUrl = resolveTargetUrl(request, target);
  const playwright = await loadPlaywright();
  const browser = await launchBrowser(playwright);

  try {
    const pdfBuffer = await waitForPrintableState(
      browser,
      targetUrl,
      parseCookieHeader(request, targetUrl.hostname, targetUrl.protocol === 'https:'),
    );

    return {
      bytes: toArrayBuffer(pdfBuffer),
      filename: `${sanitizePdfFilename(filename)}.pdf`,
    };
  } finally {
    await browser.close();
  }
}
