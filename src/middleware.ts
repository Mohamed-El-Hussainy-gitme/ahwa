import { NextResponse, type NextRequest } from "next/server";

// Middleware = Edge runtime => ممنوع Node crypto هنا.
// هنفحص وجود الكوكيز فقط، والتحقق الحقيقي يتم في API routes.

// Session cookie used by the app (HMAC-signed, see src/lib/auth/session.ts)
// NOTE: historically we used ahwa_partner/ahwa_staff, keep them for backward compatibility.
const SESSION_COOKIE = "ahwa_session";
const PARTNER_COOKIE_LEGACY = "ahwa_partner";
const STAFF_COOKIE_LEGACY = "ahwa_staff";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const isPublic =
    path === "/" ||
    path === "/login" ||
    path === "/owner-login" ||
    path === "/partner/login" ||
    /^\/c\/[^/]+\/login\/?$/.test(path) ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  const hasPartnerLegacy = !!req.cookies.get(PARTNER_COOKIE_LEGACY)?.value;
  const hasStaffLegacy = !!req.cookies.get(STAFF_COOKIE_LEGACY)?.value;

  if (!hasSession && !hasPartnerLegacy && !hasStaffLegacy) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
