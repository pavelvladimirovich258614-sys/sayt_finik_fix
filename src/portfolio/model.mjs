// Категории и проверка полей работы (без SQLite, чтобы сайт не зависел от версии Node при старте).
export const CATEGORIES = [
  ["playstation", "PlayStation"], ["xbox", "Xbox"], ["nintendo", "Nintendo"], ["gamepads", "Геймпады"],
  ["laptops", "Ноутбуки"], ["pc", "ПК"], ["phones", "Смартфоны и планшеты"], ["other", "Другое"],
];
export const CAT_SET = new Set(CATEGORIES.map((c) => c[0]));

const bool = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
const text = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);

export function cleanWork(b) {
  const w = { title: text(b.title, 120), category: String(b.category || ""), problem: text(b.problem, 2000), solution: text(b.solution, 2000), is_real: bool(b.is_real), published: bool(b.published), on_home: bool(b.on_home), in_slider: bool(b.in_slider) };
  if (!w.title) return { error: "Укажите название работы" };
  if (!CAT_SET.has(w.category)) return { error: "Выберите категорию" };
  return { work: w };
}
