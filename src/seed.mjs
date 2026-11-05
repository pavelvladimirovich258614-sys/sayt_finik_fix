// Разовое досевание данных при старте сервиса от пользователя сервиса (finikfix), без root и без SSH.
// Выполняется ТОЛЬКО если в релизе есть файл content/.seed-on-start. Только добавляет недостающее (кейсы AV-01…AV-10, фото по SHA-256,
// отзывы Авито по ключу), ничего не удаляет и не перезаписывает; перед изменениями делает копию БД. Итог пишется в журнал сервиса.
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export async function seedOnStart({ root, dataDir, uploadDir, log = console.log }) {
  if (!existsSync(join(root, "content", ".seed-on-start"))) return null;
  const { openStore } = await import("./portfolio/store.mjs");
  const { importCases } = await import("./portfolio/importer.mjs");
  const { importReviews } = await import("./portfolio/reviews-import.mjs");
  const store = openStore(dataDir);
  try {
    const dir = join(root, "content", "portfolio");
    const reviews = JSON.parse(readFileSync(join(root, "content", "reviews", "avito-reviews.json"), "utf8")).reviews;
    const dry = await importCases({ store, uploadDir, dir, commit: false });
    const need = dry.reduce((a, r) => a + r.added + (r.created ? 1 : 0), 0) + importReviews({ store, reviews, commit: false }).add;
    if (!need) { log("[seed] данные уже на месте, изменений нет"); return { changed: false }; }
    if (existsSync(join(dataDir, "portfolio.db"))) {
      mkdirSync(join(dataDir, "backups"), { recursive: true });
      const bk = join(dataDir, "backups", `pre-seed-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
      store.db.exec(`VACUUM INTO '${bk.replace(/'/g, "''")}'`); log(`[seed] копия базы: ${bk}`);
    }
    const rep = await importCases({ store, uploadDir, dir, commit: true });
    for (const r of rep) log(`[seed] ${r.id}: ${r.created ? "создан" : "есть"}, фото +${r.added}, дублей ${r.skipped}, всего ${r.total}/${r.expected}${r.published ? ", опубликован" : ""}${r.errors.length ? ", ОШИБКИ: " + r.errors.join("; ") : ""}`);
    const rv = importReviews({ store, reviews, commit: true });
    log(`[seed] отзывы Авито: добавлено ${rv.add}, уже было ${rv.skip}`);
    return { changed: true, rep, rv };
  } finally { store.close(); }
}
