import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pairTotal } from "../src/pricing.mjs";
import { site, priceGroups, workCats, categories, narrow } from "../src/data.mjs";

const root = join(import.meta.dirname, "..");
const pub = join(root, "public");
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(pub).filter((f) => /\.(html|js|css|xml|txt)$/.test(f));
const html = files.filter((f) => f.endsWith(".html") && !/admin/.test(f));
const read = (f) => readFileSync(f, "utf8");

test("Авито: в публичных файлах нет ссылок и переходов на avito.ru, кнопки портфолио ведут на /portfolio/ в той же вкладке", () => {
  for (const f of files) assert.doesNotMatch(read(f), /avito\.ru/i, f);
  const src = ["src/data.mjs", "src/templates.mjs", "src/client/app.js"].map((p) => read(join(root, p))).join("\n");
  assert.doesNotMatch(src, /avito\.ru/i); assert.doesNotMatch(src, /site\.avito/);
  for (const f of html) { const h = read(f); assert.doesNotMatch(h, /смотрите в портфолио на Авито|24\+ фото/, f); for (const m of h.matchAll(/<a[^>]*data-goal="portfolio"[^>]*>/g)) { assert.match(m[0], /href="(\/portfolio\/(#w\d+)?)"/, f); assert.doesNotMatch(m[0], /target="_blank"/); } }
  assert.equal(site.avito, undefined); assert.equal(site.avitoAd, undefined);
});

test("меню: пункт «Портфолио» есть на каждой странице; на главной блок «Наши работы» не скрыт, кнопка на /portfolio/", () => {
  for (const f of html) { if (/404\.html$/.test(f)) continue; assert.match(read(f), /<nav[^>]*id="nav"[^>]*>[\s\S]*?<a href="\/portfolio\/"[^>]*>Портфолио<\/a>/, f); }
  const home = read(join(pub, "index.html"));
  assert.match(home, /<section class="alt" id="works-home"><div class="wrap">/); assert.doesNotMatch(home, /id="works-home"[^>]*hidden/);
  assert.match(home, /Наши работы — реальный ремонт/); assert.match(home, /id="works-all-btn" href="\/portfolio\/"/); assert.match(home, /id="works-home-grid"/);
});

test("страницы услуг показывают релевантные кейсы внутри сайта", () => {
  for (const [slug, cat] of Object.entries(workCats)) { const h = read(join(pub, slug, "index.html")); assert.match(h, new RegExp(`class="works-grid works-rel" data-wcat="${cat}"`), slug); assert.match(h, /href="\/portfolio\/"/); }
  assert.equal(workCats["remont-playstation"], "playstation");
  for (const s of [...categories, ...narrow].map((x) => x.slug).filter((x) => workCats[x])) assert.ok(true, s);
});

test("портфолио: диалог с миниатюрами, кнопками связи и без перехода на Авито; страница не пустая-заглушка", () => {
  const h = read(join(pub, "portfolio", "index.html"));
  assert.match(h, /class="lb-thumbs"/); assert.match(h, /class="lb-actions"/); assert.match(h, /Связаться с мастером/); assert.match(h, /data-cb hidden>Оставить заявку/);
  assert.match(h, /id="works-empty"/); assert.doesNotMatch(h, /Авито/);
  const js = read(join(pub, "assets", "app.js")); assert.match(js, /Повторить/); assert.match(js, /\/api\/portfolio/); assert.match(js, /touchstart/); assert.match(js, /ArrowLeft/);
});

test("контакты: единый источник, личные Telegram и MAX, tel:, кнопка «Скопировать номер», бот уведомлений нигде не публикуется", () => {
  assert.equal(site.phoneRaw, "+79016624589"); assert.equal(site.telegram, "https://t.me/+79016624589"); assert.equal(site.max, "https://web.max.ru/259685091");
  for (const f of files) { const t = read(f); assert.doesNotMatch(t, /se14906499|uved_nikita|platform-api/i, f); }
  const c = read(join(pub, "kontakty", "index.html"));
  assert.ok(c.includes('href="tel:+79016624589"')); assert.ok(c.includes(`href="${site.telegram}"`)); assert.ok(c.includes(`href="${site.max}"`));
  assert.match(c, /data-copy="\+79016624589"/); assert.match(c, /Скопировать номер/);
  for (const f of html) { const h = read(f); for (const m of h.matchAll(/href="(https?:\/\/(?:t\.me|max\.ru|web\.max\.ru)[^"]*)"/g)) assert.ok([site.telegram, site.max, site.channel].includes(m[1]), `${f}: ${m[1]}`); }
  const js = read(join(pub, "assets", "app.js")); assert.match(js, /navigator\.clipboard/); assert.match(js, /Номер скопирован/); assert.match(js, /execCommand\("copy"\)/);
});

test("калькулятор: данные приходят из единого источника, формула скидки одна (подробно: test/calculator.test.mjs)", () => {
  const js = read(join(pub, "assets", "app.js")); assert.match(js, /data-cb-promo|promoCurrent/); assert.match(js, /FF\.calc/);
  assert.deepEqual(pairTotal(1000, 1800), { sum: 2800, total: 2380, discount: 420 });
  assert.deepEqual(pairTotal(1500, 1500), { sum: 3000, total: 2550, discount: 450 });
  const home = read(join(pub, "index.html")); assert.ok(/window\.FF=\{"calc":\{"cats"/.test(home));
  assert.match(read(join(pub, "zamena-stika-gamepada", "index.html")), /data-cb data-cb-promo hidden>Оставить заявку со скидкой 15%/);
  assert.match(home, /data-cb data-cb-calc hidden id="c-req">Оставить заявку с расчётом/);
  assert.ok(priceGroups.length > 0);
});

test("nginx: цель admin удаляет только временный запрет админки, не трогая /admin/api/", () => {
  const cfg = `server {\n    # Админки по HTTP нет\n    location ^~ /admin { return 404; }\n    location ^~ /admin/api/ { client_max_body_size 32m; proxy_pass http://127.0.0.1:3000; }\n    location / { proxy_pass http://127.0.0.1:3000; }\n}\n`;
  const d = mkdtempSync(join(tmpdir(), "ng-")); const f = join(d, "c"); writeFileSync(f, cfg);
  const run = (...a) => spawnSync("python3", [join(root, "deploy", "nginx_lead_block.py"), f, ...a], { encoding: "utf8" });
  assert.equal(run("--check", "--target", "admin").stdout.trim(), "1"); assert.equal(run("--check").stdout.trim(), "0", "цель lead админку не трогает");
  assert.equal(run("--target", "admin").status, 0);
  const out = read(f); assert.doesNotMatch(out, /return 404/); assert.match(out, /location \^~ \/admin\/api\/ \{ client_max_body_size 32m/); assert.match(out, /location \/ \{ proxy_pass/);
  assert.equal(run("--target", "bad").status, 2);
});
