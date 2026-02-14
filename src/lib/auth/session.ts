// src/lib/auth/session.ts
import { cookies } from "next/headers";

export type SessionType = "partner" | "staff";

export type AnySession = {
  typ: SessionType;

  cafeId: string;

  // partner
  partnerId?: string;

  // staff
  staffId?: string;
  shiftId?: string | null;
  shiftRole?: string | null;
  pinVersion?: number;

  iat: number; // issued at (unix seconds)
  exp: number; // expires (unix seconds)
};

const COOKIE_NAME = "ahwa_session";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const s = process.env.AHWA_SESSION_SECRET;
  if (!s) throw new Error("Missing AHWA_SESSION_SECRET");
  return s;
}

// ---------------------------------------------------------------------------
// base64url helpers (Buffer when available, else btoa/atob)
// ---------------------------------------------------------------------------
type Base64Globals = {
  btoa?: (data: string) => string;
  atob?: (data: string) => string;
  Buffer?: typeof import("buffer").Buffer;
};

function getBase64Globals(): Base64Globals {
  return globalThis as unknown as Base64Globals;
}

function bytesToBase64(bytes: Uint8Array): string {
  const g = getBase64Globals();

  // Node.js
  if (g.Buffer) return g.Buffer.from(bytes).toString("base64");

  // Edge / browser
  if (!g.btoa) throw new Error("btoa is not available in this runtime");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return g.btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const g = getBase64Globals();
  if (g.Buffer) return new Uint8Array(g.Buffer.from(b64, "base64"));
  if (!g.atob) throw new Error("atob is not available in this runtime");

  const bin = g.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  const b64 = bytesToBase64(bytes);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return base64ToBytes(b64);
}

const te = new TextEncoder();
const td = new TextDecoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // TS 6 / lib.dom typings are stricter about BufferSource.
  // Copy into a real ArrayBuffer (not ArrayBufferLike / SharedArrayBuffer).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

function utf8Bytes(s: string): Uint8Array {
  return te.encode(s);
}

function utf8ToArrayBuffer(s: string): ArrayBuffer {
  return toArrayBuffer(te.encode(s));
}

function utf8Decode(bytes: Uint8Array): string {
  return td.decode(bytes);
}

function getSubtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (c?.subtle) return c.subtle;
  throw new Error("WebCrypto subtle is not available in this runtime");
}

async function importHmacKey(secret: string) {
  const subtle = getSubtle();
  // IMPORTANT: Some runtimes require hash as { name: 'SHA-256' } (not a string).
  return subtle.importKey(
    "raw",
    utf8ToArrayBuffer(secret),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign", "verify"]
  );
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const subtle = getSubtle();
  const key = await importHmacKey(secret);
  const sig = await subtle.sign("HMAC", key, utf8ToArrayBuffer(data));
  return toBase64Url(new Uint8Array(sig));
}

async function hmacVerify(secret: string, data: string, sigB64Url: string): Promise<boolean> {
  const subtle = getSubtle();
  const key = await importHmacKey(secret);
  const sig = fromBase64Url(sigB64Url);
  return subtle.verify("HMAC", key, toArrayBuffer(sig), utf8ToArrayBuffer(data));
}

/**
 * Very small “token” format:
 *   payloadB64Url.signatureB64Url
 * payload = JSON(AnySession without secret)
 */
async function signSessionPayload(
  payload: Omit<AnySession, "iat" | "exp">,
  maxAgeSec = DEFAULT_MAX_AGE_SECONDS
) {
  const now = Math.floor(Date.now() / 1000);
  const full: AnySession = {
    ...payload,
    iat: now,
    exp: now + maxAgeSec,
  };

  const json = JSON.stringify(full);
  const payloadB64 = toBase64Url(utf8Bytes(json));
  const sig = await hmacSign(getSecret(), payloadB64);
  return `${payloadB64}.${sig}`;
}

async function verifySessionToken(token: string): Promise<AnySession | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;

  const ok = await hmacVerify(getSecret(), payloadB64, sig);
  if (!ok) return null;

  let session: AnySession;
  try {
    const json = utf8Decode(fromBase64Url(payloadB64));
    session = JSON.parse(json) as AnySession;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!session?.exp || session.exp <= now) return null;
  if (!session?.typ || !session?.cafeId) return null;

  return session;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------
function serializeCookie(
  name: string,
  value: string,
  opts: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
  } = {}
) {
  const enc = encodeURIComponent(value);
  const parts: string[] = [`${name}=${enc}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`Path=${opts.path ?? "/"}`);

  const ss = opts.sameSite ?? "lax";
  parts.push(`SameSite=${ss === "lax" ? "Lax" : ss === "strict" ? "Strict" : "None"}`);

  if (opts.httpOnly ?? true) parts.push("HttpOnly");
  if (opts.secure ?? (process.env.NODE_ENV === "production")) parts.push("Secure");
  return parts.join("; ");
}

function setCookieOnResponse(
  res: Response,
  name: string,
  value: string,
  opts: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
  }
) {
  // NextResponse has res.cookies.set()
  type CookieSetOpts = {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
  };
  type ResponseWithCookies = Response & {
    cookies?: {
      set: (n: string, v: string, o: CookieSetOpts) => void;
    };
  };

  const withCookies = res as ResponseWithCookies;
  if (withCookies.cookies?.set) {
    withCookies.cookies.set(name, value, {
      httpOnly: opts.httpOnly ?? true,
      secure: opts.secure ?? (process.env.NODE_ENV === "production"),
      sameSite: opts.sameSite ?? "lax",
      path: opts.path ?? "/",
      maxAge: opts.maxAge,
    });
    return res;
  }

  // Fallback: raw Set-Cookie header
  const cookie = serializeCookie(name, value, opts);
  res.headers.append("Set-Cookie", cookie);
  return res;
}

export async function clearSession(res: Response) {
  setCookieOnResponse(res, COOKIE_NAME, "", { maxAge: 0, httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}

/**
 * Read session from server cookies (Server Components / Route Handlers)
 */
export async function readAnySessionFromServerCookies(): Promise<AnySession | null> {
  // Next.js typings differ by version: cookies() can be sync or async.
  const jar = await Promise.resolve(cookies());
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

/** Write a signed session cookie */
async function setSession(
  res: Response,
  payload: Omit<AnySession, "iat" | "exp">,
  maxAgeSec = DEFAULT_MAX_AGE_SECONDS
) {
  const token = await signSessionPayload(payload, maxAgeSec);
  setCookieOnResponse(res, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  });
  return res;
}

/** Partner session */
export async function setPartnerSession(
  res: Response,
  payload: { cafeId: string; partnerId: string },
  maxAgeSec = DEFAULT_MAX_AGE_SECONDS
) {
  return await setSession(
    res,
    {
      typ: "partner",
      cafeId: payload.cafeId,
      partnerId: payload.partnerId,
    },
    maxAgeSec
  );
}

/** Staff session */
export async function setStaffSession(
  res: Response,
  payload: { cafeId: string; staffId: string; shiftId?: string | null; shiftRole?: string | null; pinVersion?: number },
  maxAgeSec = DEFAULT_MAX_AGE_SECONDS
) {
  return await setSession(
    res,
    {
      typ: "staff",
      cafeId: payload.cafeId,
      staffId: payload.staffId,
      shiftId: payload.shiftId ?? null,
      shiftRole: payload.shiftRole ?? null,
      pinVersion: payload.pinVersion ?? 0,
    },
    maxAgeSec
  );
}
