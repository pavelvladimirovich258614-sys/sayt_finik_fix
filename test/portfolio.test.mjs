import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { createApp } from "../server.mjs";
import { openStore } from "../src/portfolio/store.mjs";
import { hashPassword, verifyPassword, passwordProblem } from "../src/portfolio/auth.mjs";
import { inspectImage } from "../src/portfolio/images.mjs";
import { boundaryOf, parseMultipart } from "../src/portfolio/multipart.mjs";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
function png(w = 20, h = 20) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function jpegWithExif() {
  const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x12]), Buffer.from("Exif\0\0GPS-SECRET")]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x20, 0x00, 0x30, 0x01, 0x01, 0x11, 0x00]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), exif, sof, sos]);
}
function multipart(files) {
  const b = "----ffTest" + Math.random().toString(16).slice(2);
  const parts = files.map(([name, data, type = "image/png"]) => Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="photo"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`), data, Buffer.from("\r\n")]));
  return { body: Buffer.concat([...parts, Buffer.from(`--${b}--\r\n`)]), type: `multipart/form-data; boundary=${b}` };
}

async function setup(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ffp-"));
  const env = { DATA_DIR: dir, TRUST_PROXY: "1", ADMIN_ENABLED: "1", RATE_LIMIT: "100", ...extra };
  const st = openStore(dir);
  st.saveAdmin("Fil.nikita98@mail.ru", await hashPassword("correct horse battery"));
  st.close();
  const app = createApp(env);
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const host = `127.0.0.1:${app.address().port}`;
  const https = { "X-Forwarded-Proto": "https" };
  const call = (path, { method = "GET", headers = {}, body, secure = true, origin = true } = {}) =>
    fetch(base + path, { method, body, redirect: "manual", headers: { ...(secure ? https : {}), ...(origin && method !== "GET" ? { Origin: `${secure ? "https" : "http"}://${host}` } : {}), ...headers } });
  async function login(password = "correct horse battery") {
    const r = await call("/admin/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "fil.nikita98@mail.ru", password }) });
    const j = await r.json();
    return { r, j, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
  }
  return { dir, app, base, call, login, close: () => { app.closeAllConnections(); app.close(); } };
}
const jsonReq = (s, path, method, session, body, extra = {}) => s.call(path, { method, headers: { "Content-Type": "application/json", Cookie: session.cookie, "X-CSRF-Token": session.j.csrf, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
const work = { title: "Дрифт DualSense", category: "gamepads", problem: "Курсор уезжал", solution: "Заменил стик", is_real: true, published: true, on_home: true, in_slider: false };

test("админки нет по HTTP и без ADMIN_ENABLED", async () => {
  const s = await setup();
  assert.equal((await s.call("/admin/", { secure: false })).status, 404);
  assert.equal((await s.call("/admin/api/me", { secure: false })).status, 404);
  assert.equal((await s.call("/admin/", {})).status, 200);
  s.close();
  const off = await setup({ ADMIN_ENABLED: "" });
  assert.equal((await off.call("/admin/", {})).status, 404);
  assert.equal((await off.call("/api/portfolio", {})).status, 200); // публичное чтение работает
  off.close();
});

test("вход: cookie HttpOnly/Secure/SameSite, неверный пароль, Origin, ограничение попыток", async () => {
  const s = await setup();
  const ok = await s.login();
  assert.equal(ok.r.status, 200);
  const sc = ok.r.headers.get("set-cookie");
  assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Strict/);
  assert.ok(!JSON.stringify(ok.j).includes("scrypt"));
  const noOrigin = await s.call("/admin/api/login", { method: "POST", origin: false, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@y.ru", password: "z" }) });
  assert.equal(noOrigin.status, 403);
  for (let i = 0; i < 5; i++) assert.equal((await s.login("wrong-password-1")).r.status, 401);
  const blocked = await s.login("wrong-password-1");
  assert.equal(blocked.r.status, 429);
  assert.equal((await s.login()).r.status, 429, "и верный пароль блокируется на время окна");
  s.close();
});

test("CSRF и права: без токена и без сессии нельзя", async () => {
  const s = await setup();
  const ses = await s.login();
  assert.equal((await s.call("/admin/api/works", { method: "POST", headers: { "Content-Type": "application/json", Cookie: ses.cookie }, body: JSON.stringify(work) })).status, 403);
  assert.equal((await s.call("/admin/api/works", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": ses.j.csrf }, body: JSON.stringify(work) })).status, 401);
  assert.equal((await jsonReq(s, "/admin/api/works", "POST", ses, work)).status, 201);
  assert.equal((await jsonReq(s, "/admin/api/works", "POST", ses, { ...work, category: "hack" })).status, 400);
  assert.equal((await jsonReq(s, "/admin/api/works", "POST", ses, { ...work, title: " " })).status, 400);
  const out = await jsonReq(s, "/admin/api/logout", "POST", ses);
  assert.equal(out.status, 200);
  assert.equal((await s.call("/admin/api/me", { headers: { Cookie: ses.cookie } })).status, 401);
  s.close();
});

test("загрузка: только реальные изображения, лимиты, публичная выдача и удаление файлов", async () => {
  const s = await setup();
  const ses = await s.login();
  const id = (await (await jsonReq(s, "/admin/api/works", "POST", ses, work)).json()).id;
  const up = (files) => { const m = multipart(files); return s.call(`/admin/api/works/${id}/photos`, { method: "POST", headers: { "Content-Type": m.type, Cookie: ses.cookie, "X-CSRF-Token": ses.j.csrf }, body: m.body }); };
  // работа без фото не публикуется
  assert.equal((await (await s.call("/api/portfolio")).json()).works.length, 0);
  assert.equal((await up([["a.png", Buffer.from("это не картинка")]])).status, 400);
  assert.equal((await up([["a.php.png", Buffer.from("<?php echo 1;")]])).status, 400);
  assert.equal((await up([["a.png", Buffer.concat([png(), Buffer.alloc(9 * 1024 * 1024)])]])).status, 413);
  const good = await up([["Фото 1.png", png(40, 30)], ["b.jpg", jpegWithExif(), "image/jpeg"]]);
  assert.equal(good.status, 201);
  const photos = (await good.json()).photos;
  assert.equal(photos.length, 2);
  const files = readdirSync(join(s.dir, "uploads"));
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => /^[a-f0-9]{32}\.(png|jpg)$/.test(f)));
  const list = await (await s.call("/api/portfolio")).json();
  assert.equal(list.works.length, 1);
  assert.equal(list.works[0].photos.length, 2);
  const media = await s.call(photos[0].src);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("x-content-type-options"), "nosniff");
  assert.equal(media.headers.get("content-type"), "image/png");
  assert.equal((await s.call("/media/../../etc/passwd")).status, 404);
  assert.equal((await s.call("/media/" + "a".repeat(32) + ".png")).status, 404);
  assert.equal((await s.call("/media/" + "a".repeat(32) + ".php")).status, 404);
  // скрытие убирает из публичной выдачи
  assert.equal((await jsonReq(s, `/admin/api/works/${id}`, "PUT", ses, { ...work, published: false })).status, 200);
  assert.equal((await (await s.call("/api/portfolio")).json()).works.length, 0);
  assert.equal((await jsonReq(s, `/admin/api/works/${id}`, "DELETE", ses)).status, 200);
  assert.equal(readdirSync(join(s.dir, "uploads")).length, 0);
  assert.equal(existsSync(join(s.dir, "portfolio.db")), true);
  s.close();
});

test("фильтры публичного API: категория, главная, слайдер", async () => {
  const s = await setup();
  const ses = await s.login();
  const mk = async (w) => { const id = (await (await jsonReq(s, "/admin/api/works", "POST", ses, w)).json()).id; const m = multipart([["x.png", png()]]); await s.call(`/admin/api/works/${id}/photos`, { method: "POST", headers: { "Content-Type": m.type, Cookie: ses.cookie, "X-CSRF-Token": ses.j.csrf }, body: m.body }); return id; };
  await mk({ ...work, title: "A", category: "xbox", on_home: false, in_slider: true });
  await mk({ ...work, title: "B", category: "gamepads", on_home: true, in_slider: false });
  const get = async (q) => (await (await s.call("/api/portfolio" + q)).json()).works.map((w) => w.title);
  assert.deepEqual((await get("")).sort(), ["A", "B"]);
  assert.deepEqual(await get("?category=xbox"), ["A"]);
  assert.deepEqual(await get("?home=1"), ["B"]);
  assert.deepEqual((await (await s.call("/api/portfolio/slides")).json()).works.map((w) => w.title), ["A"]);
  s.close();
});

test("пароли и проверка изображений", async () => {
  const h = await hashPassword("long enough password");
  assert.ok(await verifyPassword("long enough password", h));
  assert.ok(!(await verifyPassword("other password!!", h)));
  assert.ok(passwordProblem("short"));
  assert.equal(passwordProblem("long enough password"), null);
  const j = inspectImage(jpegWithExif());
  assert.equal(j.image.ext, "jpg"); assert.equal(j.image.width, 48); assert.equal(j.image.height, 32);
  assert.ok(!j.image.data.includes(Buffer.from("GPS-SECRET")), "EXIF удалён");
  assert.ok(inspectImage(Buffer.from("GIF89a....")).error);
  assert.ok(inspectImage(png(5, 5)).error, "слишком маленькое изображение");
  assert.equal(boundaryOf('multipart/form-data; boundary="abc"'), "abc");
  const m = multipart([["a.png", Buffer.from("DATA")]]);
  const p = parseMultipart(m.body, boundaryOf(m.type));
  assert.equal(p.parts[0].filename, "a.png"); assert.equal(p.parts[0].data.toString(), "DATA");
});
