import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enhanceOne, jobs } from "../scripts/enhance-photos.mjs";

const webp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "ff-hq-"));
  await mkdir(join(root, "slides"));
  await writeFile(join(root, "slides", "sample.webp"), webp());
  return root;
}
test("исходные фото всех слайдов включены в пакет улучшения", () => {
  assert.equal(jobs.filter((x) => x.input.startsWith("slides/")).length, 6);
  assert.ok(jobs.some((x) => x.input === "master.webp"));
});
test("успешная HD-обработка сохраняет отдельный WebP и не меняет исходник", async () => {
  const sourceDir = await setup(), calls = [];
  const output = webp();
  const fetchFn = async (url, params) => {
    calls.push(url);
    if (calls.length === 1) {
      assert.match(url, /^https:\/\/api\.claid\.ai\/v1\/image\/edit\/upload$/);
      assert.equal(params.headers.Authorization, "Bearer test-key");
      assert.equal(params.method, "POST");
      assert.ok(params.body instanceof FormData);
      return { ok: true, json: async () => ({ data: { output: { tmp_url: "https://cdn.example.test/improved.webp" } } }) };
    }
    return { ok: true, arrayBuffer: async () => Uint8Array.from(output).buffer };
  };
  const job = { input: "slides/sample.webp", output: "slides-hq/sample.webp", width: 2560 };
  assert.equal(await enhanceOne(job, { apiKey: "test-key", fetchFn, sourceDir }), "enhanced");
  assert.deepEqual(await readFile(join(sourceDir, job.output)), output);
  assert.deepEqual(await readFile(join(sourceDir, job.input)), webp());
  assert.equal(await enhanceOne(job, { apiKey: "test-key", fetchFn, sourceDir }), "cached");
  assert.equal(calls.length, 2);
});
test("ошибка API сохраняет оригинал и не создаёт битый HD-файл", async () => {
  const sourceDir = await setup();
  const job = { input: "slides/sample.webp", output: "slides-hq/sample.webp", width: 2560 };
  await assert.rejects(() => enhanceOne(job, {
    apiKey: "test-key", sourceDir,
    fetchFn: async () => ({ ok: false, status: 503 })
  }), /HTTP 503/);
  assert.deepEqual(await readFile(join(sourceDir, job.input)), webp());
  await assert.rejects(readFile(join(sourceDir, job.output)), { code: "ENOENT" });
});
test("отсутствие API-ключа не приводит к сетевому запросу", async () => {
  const sourceDir = await setup();
  await assert.rejects(() => enhanceOne({ input: "slides/sample.webp", output: "slides-hq/sample.webp" }, {
    sourceDir, fetchFn: () => { throw new Error("Доступ к сети недопустим"); }
  }), /CLAID_API_KEY/);
});
test("слайдер и портфолио имеют автоматическую смену через пять секунд", async () => {
  const js = await readFile(new URL("../src/client/app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../src/templates.mjs", import.meta.url), "utf8");
  assert.match(html, /data-interval="5000"/);
  assert.match(js, /lbDelay = 5000/);
  assert.match(js, /setInterval\(function \(\) \{ step\(1, false\); \}, lbDelay\)/);
  assert.doesNotMatch(js, /stage\.addEventListener\("mouseenter"/);
  assert.match(js, /HD-фото временно недоступно/);
});
