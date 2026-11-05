// Разбор текстовой выгрузки отзывов Авито в content/reviews/avito-reviews.json (дословные тексты, без выдуманных оценок).
//   node scripts/parse-avito-reviews.mjs [вход.txt] [выход.json]
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function parseAvito(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  const roleRe = /^(.+?) · (Клиент|Покупатель|Продавец)$/;
  const starts = [];
  lines.forEach((l, i) => { const m = roleRe.exec(l); if (m) { let j = i - 1; while (j >= 0 && !lines[j].trim()) j--; if (j >= 0) starts.push({ nameIdx: j, i, date: m[1], role: m[2] }); } });
  const out = [];
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].nameIdx : lines.length;
    let body = lines.slice(s.i + 1, end);
    let item = "";
    const dealIdx = body.findIndex((l) => l.startsWith("Сделка состоялась"));
    if (dealIdx >= 0 && body.slice(0, dealIdx).every((l) => !l.trim())) { item = body[dealIdx].replace(/^Сделка состоялась\s*·?\s*/, ""); body = body.slice(dealIdx + 1); }
    // ответ мастера начинается со строки «Ремонт цифровой техники» и даты
    const rIdx = body.findIndex((l, i) => l.trim() === "Ремонт цифровой техники" && /\d{1,2} \S+/.test(body[i + 1] || ""));
    let reviewLines = rIdx >= 0 ? body.slice(0, rIdx) : body, replyLines = rIdx >= 0 ? body.slice(rIdx + 2) : [];
    const photos = replyLines.filter((l) => l.trim() === "Фото из отзыва").length;
    const clean = (a) => a.filter((l) => l.trim() !== "Показать целиком" && l.trim() !== "Фото из отзыва").join("\n").trim();
    const reviewBody = clean(reviewLines), reply = clean(replyLines);
    const kind = s.role === "Клиент" ? (/ремонт|реставрац|починим/i.test(item) ? "repair" : "service") : s.role === "Покупатель" ? "sale" : "purchase";
    const author = lines[s.nameIdx].trim();
    out.push({ source_key: "avito:" + createHash("sha256").update([author, s.date, item, reviewBody].join("|")).digest("hex").slice(0, 16), author, review_date: s.date, role: s.role, kind, item, body: reviewBody, reply, has_photos: photos > 0, rating: null, rating_known: false });
  });
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const inp = process.argv[2] || "content/reviews/avito-reviews-source.txt", outp = process.argv[3] || "content/reviews/avito-reviews.json";
  const reviews = parseAvito(readFileSync(inp, "utf8"));
  writeFileSync(outp, JSON.stringify({ source: "Авито (текстовая выгрузка, предоставлена владельцем 2026-11-05)", historic: { rating: 4.8, count: 62, distribution: { 5: 58, 4: 0, 3: 1, 2: 0, 1: 3 }, note: "Общая статистика профиля на момент выгрузки; индивидуальные оценки отзывов в выгрузке не указаны." }, reviews }, null, 1));
  const c = {}; reviews.forEach((r) => (c[r.kind] = (c[r.kind] || 0) + 1));
  console.log(reviews.length, "записей", c, "пустых текстов:", reviews.filter((r) => !r.body).length, "дублей ключей:", reviews.length - new Set(reviews.map((r) => r.source_key)).size);
}
