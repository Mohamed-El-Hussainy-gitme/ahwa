import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const N = 16384;
const r = 8;
const p = 1;
const keyLen = 32;

function b64(buf: Buffer) {
  return buf.toString("base64url");
}
function unb64(s: string) {
  return Buffer.from(s, "base64url");
}

// format: scrypt$N$r$p$salt$hash
export function hashSecret(secret: string) {
  const salt = randomBytes(16);
  const dk = scryptSync(secret, salt, keyLen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${b64(salt)}$${b64(dk)}`;
}

export function verifySecret(secret: string, stored: string) {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const Nraw = parts[1];
    const rraw = parts[2];
    const praw = parts[3];
    const saltRaw = parts[4];
    const expectedRaw = parts[5];

    if (!Nraw || !rraw || !praw || !saltRaw || !expectedRaw) return false;

    const Np = Number(Nraw);
    const rp = Number(rraw);
    const pp = Number(praw);
    const salt = unb64(saltRaw);
    const expected = unb64(expectedRaw);

    const dk = scryptSync(secret, salt, expected.length, { N: Np, r: rp, p: pp });
    return timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}
