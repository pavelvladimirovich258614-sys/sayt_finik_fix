import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp, validateLead } from "../server.mjs";
import { categories, narrow } from "../src/data.mjs";

const pub = (p) => join(import.meta.dirname, "..", "public", p);
const allHtml = () => {
  const out = [];
  const walk = (d) => readdirSync(d).forEach((n) => { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : f.endsWith(".html") && out.push(f); });
  walk(pub(""));
  return out;
};

test("все страницы собраны", () => {
  for (const s of ["", ...categories.map((c) => c.slug), ...narrow.map((n) => n.slug), "ceny", "o-mastere", "otzyvy", "kontakty", "vosstanovlennaya-tekhnika", "privacy", "consent", "spasibo"])
    assert.ok(existsSync(pub(join(s, "index.html"))), s);
});

test("на каждой странице один h1, title и description", () => {
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8");
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1, f);
    assert.match(h, /<title>.+<\/title>/, f);
    assert.match(h, /<meta name="description"/, f);
  }
});

test("жёсткие правила: гарантия 90 дней, нет 12 месяцев, нет точного адреса", () => {
  const all = allHtml().map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(all.includes("90 дней"));
  assert.ok(!/12 месяцев/.test(all));
  assert.ok(!/ул\.|улица|дом \d/i.test(all.replace(/<script[\s\S]*?<\/script>/g, "")));
  assert.ok(all.includes("не настраиваю интернет на дому") || all.includes("Не настраиваю интернет на дому"));
});

test("форма: чекбокс согласия и ссылки на ПД на страницах с формой", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  assert.match(h, /id="f-ok"/);
  assert.match(h, /href="\/consent\/"/);
});

test("validateLead", () => {
  const ok = { name: "Иван", phone: "+7 (901) 662-45-89", category: "Xbox", comment: "", consent: true };
  assert.ok(validateLead(ok).lead);
  assert.ok(validateLead({ ...ok, consent: false }).error);
  assert.ok(validateLead({ ...ok, phone: "123" }).error);
  assert.ok(validateLead({ ...ok, name: " " }).error);
  assert.equal(validateLead({ ...ok, website: "x" }).error, "spam");
});

test("API и статика", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const app = createApp({ DATA_DIR: dir, RATE_LIMIT: "100" });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    assert.equal((await fetch(base + "/")).status, 200);
    assert.equal((await fetch(base + "/remont-xbox/")).status, 200);
    assert.equal((await fetch(base + "/nope")).status, 404);
    assert.equal((await fetch(base + "/..%2f..%2fetc/passwd")).status === 200, false);
    const post = (b) => fetch(base + "/api/lead", { method: "POST", body: JSON.stringify(b) });
    assert.equal((await post({ name: "Иван", phone: "+7 (901) 662-45-89", category: "Xbox", consent: true })).status, 200);
    assert.equal((await post({ name: "Иван", phone: "1", consent: true })).status, 400);
    assert.equal((await post({ name: "Иван", phone: "+7 (901) 662-45-89" })).status, 400);
    assert.match(readFileSync(join(dir, "leads.jsonl"), "utf8"), /Иван/);
    assert.equal((await fetch(base + "/api/lead")).status, 405);
  } finally { app.close(); }
});

test("внутренние ссылки и якоря не битые", () => {
  const ids = (h) => new Set([...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8");
    for (const m of h.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
      const [, path, hash] = m;
      if (path === "/" || path.startsWith("/assets/")) { if (path.startsWith("/assets/")) assert.ok(existsSync(pub(path)), `${f}: ${path}`); }
      else assert.ok(existsSync(pub(join(path, "index.html"))), `${f}: ${path}`);
      if (hash && path !== "/" ) { /* якорь на другую страницу */ }
      const target = path === "/" || path === "" ? readFileSync(pub("index.html"), "utf8") : existsSync(pub(join(path, "index.html"))) ? readFileSync(pub(join(path, "index.html")), "utf8") : "";
      if (hash && target) assert.ok(ids(target).has(hash.slice(1)), `${f}: ${path}${hash}`);
    }
    for (const m of h.matchAll(/href="#([^"]+)"/g)) assert.ok(ids(h).has(m[1]), `${f}: #${m[1]}`);
  }
});

test("юридические страницы доступны из подвала и формы", () => {
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8");
    assert.match(h, /href="\/privacy\/"/, f);
    assert.match(h, /href="\/consent\/"/, f);
  }
});

test("слайдер: 6 кадров, первый грузится сразу, файлы на месте", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  assert.equal((h.match(/<figure class="hs-slide[" ]/g) || []).length, 6);
  assert.equal((h.match(/fetchpriority="high"/g) || []).length, 1);
  assert.equal((h.match(/data-src="\/assets\/img\/slides\//g) || []).length, 5);
  assert.equal((h.match(/class="hs-dot"/g) || []).length, 6);
  for (const f of h.match(/\/assets\/img\/(?:slides|cats)\/[\w.-]+\.webp/g) || []) assert.ok(existsSync(pub(f)), f);
});

test("главная: семь категорий со ссылками на существующие страницы", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  const links = [...h.matchAll(/class="cat-card[^"]*" href="\/([\w-]+)\/"/g)].map((m) => m[1]);
  assert.equal(links.length, 7);
  for (const s of links) assert.ok(existsSync(pub(join(s, "index.html"))), s);
});

test("микроскоп упоминается редко, контакты актуальны, MAX не выдуман", () => {
  const all = allHtml().map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok((all.match(/икроскоп/g) || []).length <= 2);
  assert.ok(all.includes("Fil.nikita98@mail.ru"));
  assert.ok(!/>MAX</.test(all));
});
