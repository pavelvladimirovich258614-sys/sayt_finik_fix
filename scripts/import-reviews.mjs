// Импорт отзывов Авито из content/reviews/avito-reviews.json. Идемпотентно (по source_key), пробный запуск по умолчанию.
//   node scripts/import-reviews.mjs [--commit]
// Отзывы клиентов (ремонт и сервис) публикуются, записи о покупках/продажах сохраняются скрытыми. Оценки не выдумываются.
import "../src/env.mjs";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../src/portfolio/store.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const commit = process.argv.includes("--commit");
const dataDir = process.env.DATA_DIR || join(root, "data");
const { reviews } = JSON.parse(readFileSync(join(root, "content", "reviews", "avito-reviews.json"), "utf8"));
const store = openStore(dataDir);
if (commit && existsSync(join(dataDir, "portfolio.db"))) { mkdirSync(join(dataDir, "backups"), { recursive: true }); const bk = join(dataDir, "backups", `pre-reviews-${Date.now()}.db`); store.db.exec(`VACUUM INTO '${bk}'`); console.log("Копия базы:", bk); }
let add = 0, skip = 0;
for (const r of reviews) {
  if (store.hasReviewKey(r.source_key)) { skip++; continue; }
  if (commit) store.addReview({ source: "avito", source_key: r.source_key, kind: r.kind, author: r.author, rating: null, body: r.body, review_date: r.review_date, item: r.item, reply: r.reply, has_photos: r.has_photos, status: r.kind === "repair" || r.kind === "service" ? "approved" : "hidden" });
  add++;
}
console.log(`${commit ? "Добавлено" : "Будет добавлено"}: ${add}, уже есть: ${skip}.${commit ? "" : " Пробный запуск, добавьте --commit."}`);
store.close();
