// Калькулятор и прайс: вся логика выбора «категория → модель → услуга» считается здесь (из src/data.mjs), клиент только показывает результат.
import { services, calcCategories, consoleModels, stickTypes, priceGroups, diagnostics, diagResult, modelResult } from "./data.mjs";
import { pairTotal, PAIR_DISCOUNT } from "./pricing.mjs";

export const rub = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
const NO_MODEL = { id: "_", name: "" };

/** Результат услуги для модели: fixed (price), diag, model, sticks или null, если услуга к модели не относится. */
export function resolveService(id, model = NO_MODEL) {
  const sv = services[id];
  if (!sv) return null;
  const base = { id, name: sv.name };
  if (sv.fam && model.fam && !sv.fam.includes(model.fam)) return null;
  if (sv.kind === "sticks") return { ...base, kind: "sticks" };
  if (sv.kind === "diag") return { ...base, kind: "diag" };
  if (sv.kind === "model") return { ...base, kind: "model", ...(sv.input ? { input: sv.input } : {}) };
  let price = null;
  if (sv.byModel) {
    if (model.id in sv.byModel) price = sv.byModel[model.id];
    else if (!model.clarify) return null; // модель без подтверждённой цены, не «clarify»: услуга не предлагается
  } else if (model.clarify) price = null;
  else price = sv.flat;
  if (price == null) return { ...base, kind: "model" };
  const note = [sv.parts, sv.noteByModel && sv.noteByModel[model.id]].filter(Boolean).join(". ");
  return { ...base, kind: "fixed", price, ...(sv.parts ? { parts: sv.parts } : {}), ...(note ? { note } : {}) };
}

/** Данные для клиентского калькулятора (window.FF.calc). Скидка на два стика берётся из таблицы pairs, формула одна: src/pricing.mjs. */
export function buildCalc() {
  const cats = calcCategories.map((c) => {
    const models = c.models || [NO_MODEL];
    return {
      id: c.id, name: c.name, modelLabel: c.models ? c.modelLabel : null,
      models: models.map((m) => ({ id: m.id, name: m.name, services: c.services.map((id) => resolveService(id, m)).filter(Boolean) })),
    };
  });
  const types = stickTypes.map((t) => ({ name: t.name, short: t.short, price: t.price }));
  const pairs = types.map((a) => types.map((b) => pairTotal(a.price, b.price)));
  return { cats, sticks: { types, pairs, percent: Math.round(PAIR_DISCOUNT * 100) }, text: { diag: diagResult, model: modelResult, diagnostics: diagnostics.short } };
}

const lineFor = (m, price) => `${m.short || m.name} — ${rub(price)}`;
/** Строки таблицы цен для услуги: { name, lines[], note }. famFilter — показать только модели этого семейства. */
export function priceRow(id, famFilter) {
  const sv = services[id];
  const models = consoleModels.concat([{ id: "office", short: "офисный" }, { id: "gaming", short: "игровой" }]);
  if (sv.kind === "sticks") return { name: sv.name, lines: stickTypes.map((t) => `${t.short} — ${rub(t.price)}`), note: "Цена за один аналог. Два стика (любых типов): скидка 15% на сумму." };
  if (sv.kind === "diag") return { name: sv.name, lines: [diagResult], note: "" };
  if (sv.kind === "model") return { name: sv.name, lines: [modelResult], note: "" };
  if (sv.byModel) {
    const lines = Object.entries(sv.byModel).filter(([id2]) => { const m = models.find((x) => x.id === id2); return !famFilter || (m && m.fam === famFilter) || !m.fam; }).map(([id2, p]) => lineFor(models.find((x) => x.id === id2), p));
    const notes = [...new Set(Object.entries(sv.noteByModel || {}).filter(([id2]) => !famFilter || (models.find((x) => x.id === id2) || {}).fam === famFilter).map(([, t]) => t))];
    return { name: sv.name, lines, note: notes.join(" ") };
  }
  return { name: sv.name, lines: [rub(sv.flat)], note: sv.parts || "" };
}
export const priceRows = (ids, famFilter) => ids.map((id) => priceRow(id, famFilter)).filter((r) => r.lines.length);
export const priceGroupRows = () => priceGroups.map((g) => ({ ...g, rows: priceRows(g.services) }));
