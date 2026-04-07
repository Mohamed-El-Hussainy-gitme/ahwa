import "server-only";

import { createHash, createHmac } from 'node:crypto';

function env(name: string) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function buildAbsoluteUrl(req: Request) {
  const url = new URL(req.url);
  return `${url.origin}${url.pathname}${url.search}`;
}

type SignaturePayload = {
  iss: string;
  sub: string;
  exp: number;
  nbf: number;
  body: string;
};

async function verifyWithKey(jwt: string, signingKey: string, body: string, url: string) {
  if (!jwt || !signingKey) {
    return false;
  }

  const parts = jwt.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = createHmac('sha256', signingKey).update(`${header}.${payload}`).digest('base64url');
  if (signature !== expectedSignature) {
    return false;
  }

  const claims = JSON.parse(base64UrlDecode(payload)) as SignaturePayload;
  if (claims.iss !== 'Upstash') {
    return false;
  }
  if (claims.sub !== url) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > Number(claims.exp ?? 0) || now < Number(claims.nbf ?? 0)) {
    return false;
  }

  const expectedBodyHash = createHash('sha256').update(body ?? '').digest('base64url');
  const normalizedClaimHash = String(claims.body ?? '').replace(/=+$/g, '');
  return normalizedClaimHash === expectedBodyHash;
}

export async function verifyQStashRequest(req: Request, rawBody = '') {
  const signature = req.headers.get('upstash-signature') ?? '';
  const url = buildAbsoluteUrl(req);
  const currentSigningKey = env('QSTASH_CURRENT_SIGNING_KEY');
  const nextSigningKey = env('QSTASH_NEXT_SIGNING_KEY');

  if (await verifyWithKey(signature, currentSigningKey, rawBody, url)) {
    return true;
  }

  return verifyWithKey(signature, nextSigningKey, rawBody, url);
}
