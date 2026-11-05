// Импорт кейсов портфолио. По умолчанию — пробный запуск (ничего не меняет).
//   node scripts/import-portfolio.mjs [--dir content/portfolio] [--only AV-01,AV-02] [--commit]
// DATA_DIR / UPLOAD_DIR берутся из окружения (на VPS: /opt/finikfix/shared/data). Перед --commit делается копия базы.
import "../src/env.mjs";
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../src/portfolio/store.mjs";
import { importCases } from "../src/portfolio/importer.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const commit = process.argv.includes("--commit");
const dir = resolve(arg("--dir") || join(root, "content", "portfolio"));
const dataDir = process.env.DATA_DIR || join(root, "data");
const uploadDir = process.env.UPLOAD_DIR || join(dataDir, "uploads");
const only = arg("--only")?.split(",").map((s) => s.trim());

const store = openStore(dataDir);
if (commit && existsSync(join(dataDir, "portfolio.db"))) {
  mkdirSync(join(dataDir, "backups"), { recursive: true });
  const bk = join(dataDir, "backups", `pre-import-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  store.db.exec(`VACUUM INTO '${bk.replace(/'/g, "''")}'`);
  console.log("Копия базы:", bk);
}
const rep = await importCases({ store, uploadDir, dir, commit, only });
for (const r of rep) console.log(`${r.id}: ${r.created ? "новая" : "есть"}, добавлено ${r.added}, пропущено (дубли) ${r.skipped}, всего ${r.total}/${r.expected}${r.published ? ", опубликована" : ""}${r.errors.length ? ", ОШИБКИ: " + r.errors.join("; ") : ""}`);
console.log(commit ? "Готово (commit)." : "Пробный запуск: ничего не изменено. Добавьте --commit.");
store.close();
process.exit(rep.some((r) => r.errors.length) ? 1 : 0);
