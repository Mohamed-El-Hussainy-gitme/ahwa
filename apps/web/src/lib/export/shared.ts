const ALLOWED_PRINT_PATHS = [
  /^\/reports\/print$/,
  /^\/customers\/print$/,
  /^\/customers\/[^/]+\/print$/,
  /^\/menu\/print$/,
] as const;

export function sanitizePdfFilename(name: string) {
  return String(name || 'ahwa-export')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ahwa-export';
}

export function isAllowedPrintPathname(pathname: string) {
  return ALLOWED_PRINT_PATHS.some((pattern) => pattern.test(pathname));
}
