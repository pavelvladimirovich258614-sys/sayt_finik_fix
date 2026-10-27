// SQLite-хранилище портфолио и админки (встроенный node:sqlite, без зависимостей).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { CATEGORIES, CAT_SET, cleanWork } from "./model.mjs";
export { CATEGORIES, cleanWork };

export function openStore(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o750 });
  const db = new DatabaseSync(join(dataDir, "portfolio.db"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
  CREATE TABLE IF NOT EXISTS works(id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, problem TEXT NOT NULL DEFAULT '', solution TEXT NOT NULL DEFAULT '',
    is_real INTEGER NOT NULL DEFAULT 1, published INTEGER NOT NULL DEFAULT 0, on_home INTEGER NOT NULL DEFAULT 0, in_slider INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY, work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE, file TEXT NOT NULL UNIQUE, width INTEGER NOT NULL, height INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);`);

  const now = () => new Date().toISOString();
  const q = (sql) => db.prepare(sql);
  const withPhotos = (works) => {
    if (!works.length) return [];
    const ph = q(`SELECT id, work_id, file, width, height FROM photos WHERE work_id IN (${works.map(() => "?").join(",")}) ORDER BY sort, id`).all(...works.map((w) => w.id));
    return works.map((w) => ({ ...w, photos: ph.filter((p) => p.work_id === w.id).map(({ work_id, ...p }) => p) }));
  };
  const plain = (rows) => rows.map((r) => ({ ...r }));

  return {
    db,
    close: () => db.close(),
    listPublic({ category, home, slider } = {}) {
      let sql = "SELECT * FROM works WHERE published=1"; const args = [];
      if (category && CAT_SET.has(category)) { sql += " AND category=?"; args.push(category); }
      if (home) sql += " AND on_home=1";
      if (slider) sql += " AND in_slider=1";
      const rows = withPhotos(plain(q(sql + " ORDER BY sort, id DESC").all(...args))).filter((w) => w.photos.length);
      return rows.map((w) => ({ id: w.id, title: w.title, category: w.category, problem: w.problem, solution: w.solution, is_real: !!w.is_real, photos: w.photos }));
    },
    listAll: () => withPhotos(plain(q("SELECT * FROM works ORDER BY sort, id DESC").all())),
    getWork: (id) => withPhotos(plain(q("SELECT * FROM works WHERE id=?").all(id)))[0] || null,
    createWork(w) {
      const min = q("SELECT COALESCE(MIN(sort),0) AS m FROM works").get().m;
      const r = q("INSERT INTO works(title,category,problem,solution,is_real,published,on_home,in_slider,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(w.title, w.category, w.problem, w.solution, w.is_real, w.published, w.on_home, w.in_slider, min - 1, now(), now());
      return Number(r.lastInsertRowid);
    },
    updateWork(id, w) {
      return q("UPDATE works SET title=?,category=?,problem=?,solution=?,is_real=?,published=?,on_home=?,in_slider=?,updated_at=? WHERE id=?")
        .run(w.title, w.category, w.problem, w.solution, w.is_real, w.published, w.on_home, w.in_slider, now(), id).changes > 0;
    },
    deleteWork(id) { // возвращает файлы, которые нужно удалить с диска
      const files = q("SELECT file FROM photos WHERE work_id=?").all(id).map((r) => r.file);
      return q("DELETE FROM works WHERE id=?").run(id).changes ? files : null;
    },
    photoCount: (workId) => q("SELECT COUNT(*) AS n FROM photos WHERE work_id=?").get(workId).n,
    addPhoto(workId, { file, width, height }) {
      const max = q("SELECT COALESCE(MAX(sort),0) AS m FROM photos WHERE work_id=?").get(workId).m;
      return Number(q("INSERT INTO photos(work_id,file,width,height,sort) VALUES(?,?,?,?,?)").run(workId, file, width, height, max + 1).lastInsertRowid);
    },
    deletePhoto(id) {
      const r = q("SELECT file FROM photos WHERE id=?").get(id);
      if (!r) return null;
      q("DELETE FROM photos WHERE id=?").run(id); return r.file;
    },
    reorderWorks(ids) { const st = q("UPDATE works SET sort=? WHERE id=?"); ids.forEach((id, i) => st.run(i, id)); },
    reorderPhotos(workId, ids) { const st = q("UPDATE photos SET sort=? WHERE id=? AND work_id=?"); ids.forEach((id, i) => st.run(i, id, workId)); },
    // админы и сессии
    adminCount: () => q("SELECT COUNT(*) AS n FROM admins").get().n,
    getAdminByEmail: (email) => q("SELECT * FROM admins WHERE email=?").get(String(email).toLowerCase()) || null,
    saveAdmin(email, hash) { q("INSERT INTO admins(email,pass_hash,created_at) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET pass_hash=excluded.pass_hash").run(String(email).toLowerCase(), hash, now()); },
    putSession: (id, adminId, csrf, expires) => q("INSERT INTO sessions(id,admin_id,csrf,expires) VALUES(?,?,?,?)").run(id, adminId, csrf, expires),
    getSession(id) {
      const s = q("SELECT s.id, s.csrf, s.expires, a.id AS admin_id, a.email FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.id=?").get(id);
      if (!s) return null;
      if (s.expires < Date.now()) { q("DELETE FROM sessions WHERE id=?").run(id); return null; }
      return { ...s };
    },
    delSession: (id) => q("DELETE FROM sessions WHERE id=?").run(id),
    purgeSessions: () => q("DELETE FROM sessions WHERE expires<?").run(Date.now()),
    deleteSessionsOf: (adminId) => q("DELETE FROM sessions WHERE admin_id=?").run(adminId),
  };
}
