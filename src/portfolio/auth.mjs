// Пароли (scrypt), сессии, cookie и ограничение попыток входа. Без внешних зависимостей.
import { scrypt, randomBytes, createHash, timingSafeEqual } from "node:crypto";

const scryptP = (pw, salt, n) => new Promise((res, rej) => scrypt(pw, salt, 64, { N: n, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
const N = 16384;

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptP(pw, salt, N);
  return `scrypt$${N}$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, n, saltHex, keyHex] = String(stored || "").split("$");
  if (alg !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scryptP(pw, Buffer.from(saltHex, "hex"), Number(n));
  const want = Buffer.from(keyHex, "hex");
  return key.length === want.length && timingSafeEqual(key, want);
}
// Выравнивает время ответа для несуществующего email (фиктивный хеш).
export const DUMMY_HASH = `scrypt$${N}$${"00".repeat(16)}$${"00".repeat(64)}`;

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const SESSION_MS = 12 * 60 * 60 * 1000;

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function sessionCookie(token, secure, maxAgeSec = SESSION_MS / 1000) {
  return `ff_sid=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
}

export function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 12) return "Пароль должен быть не короче 12 символов";
  if (pw.length > 200) return "Пароль слишком длинный";
  if (/^(.)\1+$/.test(pw)) return "Пароль слишком простой";
  return null;
}

// Ограничитель неудачных попыток: max за windowMs по ключу.
export function createLimiter(max, windowMs) {
  const m = new Map();
  const recent = (k) => { const now = Date.now(); const a = (m.get(k) || []).filter((t) => now - t < windowMs); if (a.length) m.set(k, a); else m.delete(k); return a; };
  return {
    blocked: (k) => recent(k).length >= max,
    fail: (k) => { const a = recent(k); a.push(Date.now()); m.set(k, a); },
    reset: (k) => m.delete(k),
    retryAfter: (k) => { const a = recent(k); return a.length ? Math.max(1, Math.ceil((a[0] + windowMs - Date.now()) / 1000)) : 0; },
  };
}
