// Идемпотентный импорт отзывов Авито (по source_key). Клиентские отзывы (ремонт, сервис) публикуются, остальные скрыты. Оценки не выставляются.
export function importReviews({ store, reviews, commit = false }) {
  let add = 0, skip = 0;
  for (const r of reviews) {
    if (store.hasReviewKey(r.source_key)) { skip++; continue; }
    if (commit) store.addReview({ source: "avito", source_key: r.source_key, kind: r.kind, author: r.author, rating: null, body: r.body, review_date: r.review_date, item: r.item, reply: r.reply, has_photos: r.has_photos, status: r.kind === "repair" || r.kind === "service" ? "approved" : "hidden" });
    add++;
  }
  return { add, skip };
}
