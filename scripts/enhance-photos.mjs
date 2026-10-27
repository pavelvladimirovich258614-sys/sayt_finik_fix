// Необязательная пакетная подготовка HD-фотографий FinikFix через Claid.ai.
// Работает отдельно от сборки/деплоя: внешние API НЕ вызываются при просмотре сайта.
// API-ключ читается только из CLAID_API_KEY, исходники никогда не перезаписываются.
import { readFile, mkdir, writeFile, rename, rm, access } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { heroSlides, homeCats } from "../src/data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = join(ROOT, "src/assets/img");
export const jobs = [
  ...heroSlides.map((p) => ({ input: "slides/" + p.file, output: "slides-hq/" + p.file, width: 2560 })),
  ...homeCats.filter((p) => p.img).map((p) => ({ input: "cats/" + p.img, output: "cats-hq/" + p.img, width: 1600 })),
  { input: "master.webp", output: "portrait-hq/master.webp", width: 2048 },
];

// Image Edit Upload API: https://docs.claid.ai/image-editing-api/upload-api-reference
export async function enhanceOne({ input, output, width = 2560 }, { apiKey, fetchFn = fetch, sourceDir = IMAGES, force = false } = {}) {
  if (!apiKey) throw new Error("Задайте CLAID_API_KEY (ключ не помещать в репозиторий)");
  const from = join(sourceDir, input);
  const to = join(sourceDir, output);
  if (!force) {
    try { await access(to); return "cached"; } catch {}
  }
  const source = await readFile(from);
  const form = new FormData();
  form.append("file", new Blob([source], { type: "image/webp" }), basename(input));
  form.append("data", new Blob([JSON.stringify({
    operations: {
      restorations: { decompress: "auto", upscale: "photo", polish: false },
      resizing: { width, height: "auto", fit: "bounds" }
    },
    output: { format: { type: "webp", compression: { type: "lossy", quality: 92 } } }
  })], { type: "application/json" }));
  const result = await fetchFn("https://api.claid.ai/v1/image/edit/upload", {
    method: "POST", headers: { Authorization: "Bearer " + apiKey },
    body: form, signal: AbortSignal.timeout(120000)
  });
  if (!result.ok) throw new Error("Claid API HTTP " + result.status);
  const response = await result.json();
  const location = response?.data?.output?.tmp_url;
  if (!location || !/^https:\/\//.test(location)) throw new Error("Claid не вернул ссылку на HD-файл");
  const download = await fetchFn(location, { signal: AbortSignal.timeout(60000) });
  if (!download.ok) throw new Error("HD-файл недоступен: HTTP " + download.status);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (bytes.length < 16 || bytes.length > 20 * 1024 * 1024 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP")
    throw new Error("Неверный формат HD-файла, оставляем оригинал");
  await mkdir(dirname(to), { recursive: true });
  const temp = to + "." + randomBytes(6).toString("hex") + ".tmp";
  try { await writeFile(temp, bytes, { flag: "wx" }); await rename(temp, to); }
  finally { await rm(temp, { force: true }).catch(() => {}); }
  return "enhanced";
}

async function main() {
  const key = process.env.CLAID_API_KEY;
  if (!key) {
    console.error("Не задан CLAID_API_KEY. Сайт продолжает использовать исходные фотографии.");
    process.exitCode = 2; return;
  }
  const only = process.argv.find((v) => v.startsWith("--only="))?.slice(7);
  const force = process.argv.includes("--force");
  const selected = only ? jobs.filter((x) => x.input.endsWith("/" + only) || x.input === only) : jobs;
  if (!selected.length) { console.error("Изображение не найдено в перечне"); process.exitCode = 2; return; }
  let ok = 0, failed = 0;
  for (const job of selected) {
    try {
      const result = await enhanceOne(job, { apiKey: key, force });
      console.log(job.input + ": " + result);
      ok++;
    } catch (e) {
      console.error(job.input + ": " + (e?.message || "ошибка") + " (сохраняем оригинал)");
      failed++;
    }
  }
  console.log("Готово: " + ok + ", ошибки: " + failed + ". Файлы HD необходимо проверить и закоммитить до деплоя.");
  if (failed) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.cwd(), process.argv[1])) main();
