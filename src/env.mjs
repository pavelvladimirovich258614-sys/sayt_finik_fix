// Мини-загрузчик .env (без зависимостей): значения из окружения имеют приоритет.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const f = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#\r\n]*?)\s*(?:#.*)?$/);
    if (m && m[2] !== "" && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
