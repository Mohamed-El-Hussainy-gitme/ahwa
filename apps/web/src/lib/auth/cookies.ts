import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const RUNTIME_SESSION_COOKIE = "ahwa_runtime_session";
export const PLATFORM_SESSION_COOKIE = "ahwa_platform_session";
export const DEVICE_TOKEN_COOKIE = "ahwa_device_token";
export const GATE_SLUG_COOKIE = "ahwa_gate_slug";

function secure() {
  return process.env.NODE_ENV === "production";
}

export async function getCookieValue(name: string): Promise<string | null> {
  const store = await cookies();
  return store.get(name)?.value ?? null;
}

export function setRuntimeSessionCookie(response: NextResponse, token: string, maxAgeSeconds?: number) {
  response.cookies.set(RUNTIME_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function setPlatformSessionCookie(response: NextResponse, token: string, maxAgeSeconds?: number) {
  response.cookies.set(PLATFORM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function setDeviceTokenCookie(response: NextResponse, token: string, maxAgeSeconds?: number) {
  response.cookies.set(DEVICE_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function setGateSlugCookie(response: NextResponse, slug: string, maxAgeSeconds = 60 * 60 * 24 * 90) {
  response.cookies.set(GATE_SLUG_COOKIE, slug, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}


export function clearRuntimeSessionCookie(response: NextResponse) {
  response.cookies.set(RUNTIME_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function clearAuthCookies(response: NextResponse) {
  for (const name of [RUNTIME_SESSION_COOKIE, PLATFORM_SESSION_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: secure(),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}
