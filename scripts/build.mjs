// Сборка статического сайта: node scripts/build.mjs  →  public/
import { mkdirSync, rmSync, writeFileSync, cpSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { site, categories, narrow } from "../src/data.mjs";
import * as t from "../src/templates.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");
const siteUrl = process.env.SITE_URL || ""; // [Уточнить: домен], например https://finikfix.ru
const metrika = process.env.METRIKA_ID || ""; // [Уточнить: номер счётчика Яндекс.Метрики]
const photoFile = ["master.webp", "master.jpg", "master.jpeg", "master.png"].find((f) => existsSync(join(root, "src/assets/img", f)));
const hasPhoto = !!photoFile;
const o = { hasPhoto, photoFile, metrika, siteUrl };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "src/client"), join(out, "assets"), { recursive: true });
cpSync(join(root, "src/assets"), join(out, "assets"), { recursive: true });

const pages = [
  ["/", t.homePage(o)],
  ...categories.map((c) => [`/${c.slug}/`, t.categoryPage(c, o)]),
  ...narrow.map((n) => [`/${n.slug}/`, t.narrowPage(n, o)]),
  ["/ceny/", t.pricesPage(o)],
  ["/o-mastere/", t.aboutPage(o)],
  ["/otzyvy/", t.reviewsPage(o)],
  ["/kontakty/", t.contactsPage(o)],
  ["/vosstanovlennaya-tekhnika/", t.shopPage(o)],
  ["/privacy/", t.legalPage(o, "/privacy/", "Политика конфиденциальности", t.privacyHtml)],
  ["/consent/", t.legalPage(o, "/consent/", "Согласие на обработку персональных данных", t.consentHtml)],
  ["/spasibo/", t.legalPage(o, "/spasibo/", "Спасибо за заявку", t.thanksHtml)],
];
for (const [path, html] of pages) {
  const dir = join(out, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}
writeFileSync(join(out, "404.html"), t.legalPage(o, "/404.html", "Страница не найдена", `<p>Такой страницы нет. <a href="/">Перейти на главную</a></p>`));

const indexable = pages.filter(([p]) => !["/privacy/", "/consent/", "/spasibo/"].includes(p)).map(([p]) => p);
if (siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `<url><loc>${base}${p}</loc></url>`).join("\n")}\n</urlset>\n`);
}
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /spasibo/\nDisallow: /api/\n${siteUrl ? `Sitemap: ${siteUrl.replace(/\/$/, "")}/sitemap.xml\n` : ""}`);

console.log(`Собрано страниц: ${pages.length + 1}. Фото мастера: ${hasPhoto ? "есть" : "НЕТ (положите src/assets/img/master.jpg|png|webp)"}. SITE_URL: ${siteUrl || "не задан"}. Метрика: ${metrika || "не задана"}.`);
