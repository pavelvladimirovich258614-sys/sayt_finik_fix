// Создание (или смена пароля) администратора из консоли сервера. Пароля по умолчанию нет.
//   node scripts/create-admin.mjs Fil.nikita98@mail.ru
// Пароль вводится скрытно (не показывается и не попадает в историю команд). Минимум 12 символов.
import "../src/env.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../src/portfolio/store.mjs";
import { hashPassword, passwordProblem } from "../src/portfolio/auth.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR || join(root, "data");
const email = String(process.argv[2] || "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("Использование: node scripts/create-admin.mjs <email>"); process.exit(2); }
if (!process.stdin.isTTY) { console.error("Нужен интерактивный терминал: пароль не принимается из аргументов и каналов."); process.exit(2); }

function ask(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin; let buf = "";
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    const onData = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") { stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData); process.stdout.write("\n"); return resolve(buf); }
        if (c === "\u0003") { stdin.setRawMode(false); process.stdout.write("\n"); process.exit(130); }
        if (c === "\u007f" || c === "\b") buf = buf.slice(0, -1); else if (c >= " ") buf += c;
      }
    };
    stdin.on("data", onData);
  });
}

const store = openStore(dataDir);
const exists = store.getAdminByEmail(email);
if (!exists && store.adminCount() > 0) { console.error("Администратор уже создан. Для другого email удалите его вручную или используйте тот же email для смены пароля."); process.exit(1); }
const p1 = await ask(exists ? "Новый пароль (мин. 12 символов): " : "Пароль администратора (мин. 12 символов): ");
const problem = passwordProblem(p1);
if (problem) { console.error(problem); process.exit(1); }
const p2 = await ask("Повторите пароль: ");
if (p1 !== p2) { console.error("Пароли не совпадают"); process.exit(1); }
store.saveAdmin(email, await hashPassword(p1));
if (exists) store.deleteSessionsOf(exists.id);
console.log(exists ? `Пароль для ${email} обновлён, старые сессии закрыты.` : `Администратор ${email} создан. Вход: https://<домен>/admin/ (после включения ADMIN_ENABLED=1 и HTTPS).`);
store.close();
