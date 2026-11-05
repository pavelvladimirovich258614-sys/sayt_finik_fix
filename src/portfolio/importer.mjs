// Управляемый импорт кейсов портфолио: идемпотентно по source_id (AV-01…), фото дедуплицируются по SHA-256.
// Папка: <dir>/cases.json + <dir>/<folder>/*.webp|jpg|png (порядок по имени файла; файл cover.* становится обложкой).
import { readFile, readdir, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { inspectImage } from "./images.mjs";

const EXT = /\.(webp|jpe?g|png)$/i;
export const PRICE_NOTE = "Не является текущим прайсом.";

/** Возвращает отчёт; при commit=false БД и диск не меняются. */
export async function importCases({ store, uploadDir, dir, commit = false, only = null }) {
  const manifest = JSON.parse(await readFile(join(dir, "cases.json"), "utf8"));
  const report = [];
  if (commit) await mkdir(uploadDir, { recursive: true, mode: 0o750 });
  for (const c of manifest.cases) {
    if (only && !only.includes(c.source_id)) continue;
    const r = { id: c.source_id, created: false, added: 0, skipped: 0, errors: [], published: false };
    let names = [];
    try { names = (await readdir(join(dir, c.folder))).filter((n) => EXT.test(n)).sort(); } catch { r.errors.push("папка не найдена: " + c.folder); }
    const cover = names.find((n) => /^cover\./i.test(n));
    if (cover) names = [cover, ...names.filter((n) => n !== cover)];
    let work = store.getWorkBySource(c.source_id);
    let workId = work?.id ?? null;
    const hadPhotos = work ? work.photos.length : 0;
    if (!work) { r.created = true; if (commit) workId = store.createImported({ ...c, price_note: PRICE_NOTE }); }
    const known = workId ? store.photoHashes(workId) : new Set();
    let firstNew = null;
    for (const n of names) {
      const buf = await readFile(join(dir, c.folder, n));
      const sha = createHash("sha256").update(buf).digest("hex");
      if (known.has(sha)) { r.skipped++; continue; }
      const chk = inspectImage(buf);
      if (chk.error) { r.errors.push(`${n}: ${chk.error}`); continue; }
      known.add(sha);
      if (!commit) { r.added++; continue; }
      const name = `${randomBytes(16).toString("hex")}.${chk.image.ext}`;
      await writeFile(join(uploadDir, name), chk.image.data, { flag: "wx", mode: 0o640 });
      try { const pid = store.addPhoto(workId, { file: name, width: chk.image.width, height: chk.image.height, sha256: sha }); if (firstNew === null) firstNew = pid; r.added++; }
      catch (e) { await unlink(join(uploadDir, name)).catch(() => {}); r.errors.push(`${n}: ${e.message}`); }
    }
    if (commit) {
      if (cover && firstNew !== null && hadPhotos > 0) store.setCover(workId, firstNew); // новая обложка поверх существующих
      const total = store.photoCount(workId);
      // Публикуем только свежий (скрытый) кейс, когда загружены все ожидаемые фото. Ранее скрытое админом не трогаем.
      if (!work || hadPhotos === 0) { if (total >= c.expected_photos && c.expected_photos > 0) { store.setPublished(workId, true); r.published = true; } }
    }
    r.total = (work?.photos.length ?? 0) + r.added; r.expected = c.expected_photos;
    report.push(r);
  }
  return report;
}
