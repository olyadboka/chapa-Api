import { createHash, timingSafeEqual } from 'crypto';

export function hashSha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

