import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(import.meta.dirname, "..");
const BLK = join(root, "deploy", "nginx_lead_block.py");
const run = (file, ...a) => spawnSync("python3", [BLK, file, ...a], { encoding: "utf8" });
const tmp = (name, content) => { const d = mkdtempSync(join(tmpdir(), "ngx-")); const f = join(d, name); writeFileSync(f, content); return f; };
const balanced = (s) => s.split("{").length === s.split("}").length;

test("nginx: реальная заглушка с JSON в return 503 удаляется целиком, соседние блоки целы", () => {
  const src = readFileSync(join(root, "deploy", "nginx-ip.conf"), "utf8");
  assert.match(src, /return 503 '\{"ok":false/);
  const f = tmp("finikfix", src);
  assert.equal(run(f, "--check").stdout.trim(), "1");
  assert.equal(run(f).status, 0);
  const out = readFileSync(f, "utf8");
  assert.doesNotMatch(out, /api\/lead/); assert.doesNotMatch(out, /return 503/);
  assert.doesNotMatch(out, /ВРЕМЕННО/, "комментарий заглушки убран");
  for (const keep of ["location ^~ /admin { return 404; }", "location / {", "proxy_pass http://127.0.0.1:3000;", "client_max_body_size 16k;", "X-Robots-Tag"]) assert.ok(out.includes(keep), keep);
  assert.ok(balanced(out)); assert.ok(balanced(src));
  assert.equal(run(f).status, 3, "повторный запуск: нечего удалять");
  assert.equal(readFileSync(f, "utf8"), out, "второй запуск файл не меняет");
});

const TRICKY = `server {
    listen 443 ssl; # managed by Certbot { не скобка }
    server_name finikfix.ru;
    # ВРЕМЕННО: заглушка заявок
    location = /api/lead {
        default_type application/json;
        return 503 '{"ok":false,"error":"закрыто } { внутри строки","x":{"y":1}}';
    }
    location = /api/leadership { proxy_pass http://127.0.0.1:3000; }
    location / { proxy_pass http://127.0.0.1:3000; }
}
server {
    listen 80;
    location = /api/lead {
        return 503 "{\\"ok\\":false}";
    }
    location /other { return 200 "ok"; }
}
server {
    listen 8080;
    # настоящий обработчик, не заглушка
    location = /api/lead { proxy_pass http://127.0.0.1:3000; }
}
`;
test("nginx: скобки в кавычках и комментариях, два server, настоящий обработчик не трогается", () => {
  const f = tmp("tricky", TRICKY);
  assert.equal(run(f, "--check").stdout.trim(), "2");
  assert.equal(run(f).status, 0);
  const out = readFileSync(f, "utf8");
  assert.doesNotMatch(out, /return 503/);
  assert.ok(out.includes("location = /api/leadership"), "соседний /api/leadership цел");
  assert.ok(out.includes("location /other { return 200"), "соседний location цел");
  assert.ok(out.includes("# настоящий обработчик") && /location = \/api\/lead \{ proxy_pass/.test(out), "блок с proxy_pass (не заглушка) цел");
  assert.ok(out.includes("Certbot { не скобка }"));
  assert.ok(balanced(out.replace(/#.*$/gm, "").replace(/"[^"]*"|'[^']*'/g, "")));
});

test("nginx: сломанный файл не меняется (код 2), права сохраняются", () => {
  const broken = "server {\n location = /api/lead {\n return 503 'x';\n";
  const f = tmp("broken", broken);
  assert.equal(run(f).status, 2); assert.equal(readFileSync(f, "utf8"), broken);
  const g = tmp("ok", readFileSync(join(root, "deploy", "nginx-ip.conf"), "utf8")); chmodSync(g, 0o640);
  assert.equal(run(g).status, 0); assert.equal(statSync(g).mode & 0o777, 0o640);
});

test("установщик: контрольные суммы совпадают с файлами, скачивание только по https и без curl|bash", () => {
  const inst = readFileSync(join(root, "deploy", "install-ops-helper.sh"), "utf8");
  const sha = (p) => createHash("sha256").update(readFileSync(join(root, "deploy", p))).digest("hex");
  assert.match(inst, new RegExp(`SHA_OPS="${sha("finikfix-ops")}"`), "SHA-256 finikfix-ops в установщике устарел: пересчитать");
  assert.match(inst, new RegExp(`SHA_BLK="${sha("nginx_lead_block.py")}"`), "SHA-256 nginx_lead_block.py в установщике устарел: пересчитать");
  assert.match(inst, /--proto '=https' --tlsv1\.2/); assert.doesNotMatch(inst.replace(/^#.*$/gm, ""), /\|\s*(ba)?sh\b/);
  assert.match(inst, /visudo -cf/); assert.match(inst, /sha256sum/);
  for (const f of ["install-ops-helper.sh", "finikfix-ops"]) execFileSync("bash", ["-n", join(root, "deploy", f)]);
});

test("помощник: фиксированные операции, нет eval, lock вне каталога deploy, whitelist ключей", () => {
  const h = readFileSync(join(root, "deploy", "finikfix-ops"), "utf8");
  const code = h.replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(code, /\beval\b/); assert.doesNotMatch(code, /bash -c|sh -c/);
  assert.match(h, /LOCK=\/run\//); assert.doesNotMatch(h, /\$BASE\/\.ops\.lock/);
  assert.match(h, /REVIEWS_FORM\|LEADS_ENABLED\|ADMIN_ENABLED\)/); assert.match(h, /MAX_API_BASE\) \[\[ "\$v" =~ \^https:\/\/platform-api/, "MAX_API_BASE только на домены MAX (токен не уйдёт на чужой хост)"); assert.match(h, /разрешён только MAX_BOT_TOKEN/); assert.match(h, /TG_BOT_TOKEN\|TG_CHAT_ID\|TG_API_BASE\) ;;/);
  assert.match(h, /\[\[ "\$v" =~ \^\[A-Za-z0-9_\.~:-\]\{16,300\}\$ \]\]/, "формат токена проверяется");
  assert.match(h, /MAX_RECIPIENT_USER_IDS\) \[\[/); assert.match(h, /\*\) echo "ключ не разрешён"/);
  assert.match(h, /nginx -t/); assert.match(h, /restore/);
});
