/* THIÊN HÀ ĐẠI CHIẾN — tầng database (SQLite, dùng node:sqlite có sẵn của Node)
 * Không phụ thuộc gói ngoài nào. File dữ liệu: server/data/thdc.db          */
'use strict';
var fs = require('fs'), path = require('path');
var sqlite = require('node:sqlite');

var SCHEMA = [
  "PRAGMA journal_mode=WAL",
  "PRAGMA foreign_keys=ON",
  "PRAGMA busy_timeout=4000",

  /* cấu hình server: hạt giống vũ trụ, phiên bản schema... */
  "CREATE TABLE IF NOT EXISTS cauhinh (k TEXT PRIMARY KEY, v TEXT NOT NULL)",

  /* tài khoản */
  `CREATE TABLE IF NOT EXISTS tk (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ten TEXT NOT NULL UNIQUE,             -- khoá đăng nhập (đã hạ chữ thường)
     hienthi TEXT NOT NULL,                -- tên chỉ huy hiện trong game
     mk TEXT NOT NULL,                     -- scrypt hash
     muoi TEXT NOT NULL,                   -- salt
     tao INTEGER NOT NULL,
     vaoCuoi INTEGER NOT NULL,
     quyen TEXT NOT NULL DEFAULT 'nguoi'
   )`,

  /* phiên đăng nhập */
  `CREATE TABLE IF NOT EXISTS phien (
     token TEXT PRIMARY KEY,
     tk INTEGER NOT NULL REFERENCES tk(id) ON DELETE CASCADE,
     tao INTEGER NOT NULL, hetHan INTEGER NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS phien_tk ON phien(tk)",

  /* đế quốc: toàn bộ state của một người chơi */
  `CREATE TABLE IF NOT EXISTS dq (
     tk INTEGER PRIMARY KEY REFERENCES tk(id) ON DELETE CASCADE,
     state TEXT NOT NULL,
     diem INTEGER NOT NULL DEFAULT 0,
     lastTick INTEGER NOT NULL,
     keTiep INTEGER NOT NULL,              -- mốc sự kiện gần nhất, để scheduler gọi tick
     lm TEXT,
     soHT INTEGER NOT NULL DEFAULT 1,
     capNhat INTEGER NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS dq_ketiep ON dq(keTiep)",
  "CREATE INDEX IF NOT EXISTS dq_diem ON dq(diem DESC)",

  /* chỉ mục sở hữu hành tinh: tra cứu nhanh ai đang giữ toạ độ nào */
  `CREATE TABLE IF NOT EXISTS ht (
     td TEXT PRIMARY KEY,                  -- "g:h:p"
     tk INTEGER NOT NULL REFERENCES tk(id) ON DELETE CASCADE,
     ten TEXT NOT NULL, pi INTEGER NOT NULL, thuDo INTEGER NOT NULL DEFAULT 0
   )`,
  "CREATE INDEX IF NOT EXISTS ht_tk ON ht(tk)",

  /* NPC dùng chung cả server */
  "CREATE TABLE IF NOT EXISTS npc (key TEXT PRIMARY KEY, data TEXT NOT NULL, t INTEGER NOT NULL)",

  /* bãi phế liệu dùng chung */
  "CREATE TABLE IF NOT EXISTS pl (td TEXT PRIMARY KEY, kl REAL NOT NULL DEFAULT 0, tt REAL NOT NULL DEFAULT 0)",

  /* liên minh */
  `CREATE TABLE IF NOT EXISTS lm (
     ten TEXT PRIMARY KEY, tag TEXT NOT NULL, chu INTEGER NOT NULL, tao INTEGER NOT NULL, mota TEXT
   )`,

  /* bảng tin toàn server: ai đánh ai, ai lập liên minh... */
  `CREATE TABLE IF NOT EXISTS bangtin (
     id INTEGER PRIMARY KEY AUTOINCREMENT, khi INTEGER NOT NULL, loai TEXT NOT NULL, noi TEXT NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS bangtin_khi ON bangtin(khi DESC)",

  /* thống kê trận PvP để tra cứu về sau */
  `CREATE TABLE IF NOT EXISTS tran (
     id INTEGER PRIMARY KEY AUTOINCREMENT, khi INTEGER NOT NULL,
     tkA INTEGER, tkD INTEGER, td TEXT NOT NULL, kq TEXT NOT NULL,
     cuop INTEGER NOT NULL DEFAULT 0, matA INTEGER NOT NULL DEFAULT 0, matD INTEGER NOT NULL DEFAULT 0
   )`,
  "CREATE INDEX IF NOT EXISTS tran_khi ON tran(khi DESC)"
];

function moDB(duong) {
  duong = duong || process.env.THDC_DB || path.join(__dirname, 'data', 'thdc.db');
  if (duong !== ':memory:') fs.mkdirSync(path.dirname(duong), { recursive: true });
  var db = new sqlite.DatabaseSync(duong);
  SCHEMA.forEach(function (s) { db.exec(s); });
  return db;
}

/* ---------- lớp truy vấn ---------- */
function Kho(duong) {
  this.db = moDB(duong);
  this.duong = duong;
  var d = this.db;
  this.q = {
    cauhinhGet: d.prepare('SELECT v FROM cauhinh WHERE k=?'),
    cauhinhSet: d.prepare('INSERT INTO cauhinh(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v'),

    tkTheoTen: d.prepare('SELECT * FROM tk WHERE ten=?'),
    tkTheoId: d.prepare('SELECT * FROM tk WHERE id=?'),
    tkThem: d.prepare('INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'),
    tkVao: d.prepare('UPDATE tk SET vaoCuoi=? WHERE id=?'),
    tkDem: d.prepare('SELECT COUNT(*) n FROM tk'),
    tkDoiMK: d.prepare('UPDATE tk SET mk=?, muoi=? WHERE id=?'),

    phienThem: d.prepare('INSERT INTO phien(token,tk,tao,hetHan) VALUES(?,?,?,?)'),
    phienGet: d.prepare('SELECT * FROM phien WHERE token=?'),
    phienXoa: d.prepare('DELETE FROM phien WHERE token=?'),
    phienDonRac: d.prepare('DELETE FROM phien WHERE hetHan<?'),

    dqGet: d.prepare('SELECT * FROM dq WHERE tk=?'),
    dqThem: d.prepare('INSERT INTO dq(tk,state,diem,lastTick,keTiep,lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?)'),
    dqLuu: d.prepare('UPDATE dq SET state=?,diem=?,lastTick=?,keTiep=?,lm=?,soHT=?,capNhat=? WHERE tk=?'),
    dqDenHan: d.prepare('SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep LIMIT ?'),
    dqXepHang: d.prepare(`SELECT dq.tk, dq.diem, dq.lm, dq.soHT, tk.hienthi, tk.vaoCuoi
                          FROM dq JOIN tk ON tk.id=dq.tk ORDER BY dq.diem DESC LIMIT ?`),
    dqTheoLM: d.prepare(`SELECT dq.tk, dq.diem, dq.soHT, tk.hienthi FROM dq JOIN tk ON tk.id=dq.tk
                         WHERE dq.lm=? ORDER BY dq.diem DESC`),
    dqTongLM: d.prepare('SELECT lm, COUNT(*) sl, SUM(diem) diem FROM dq WHERE lm IS NOT NULL GROUP BY lm'),

    htXoaCua: d.prepare('DELETE FROM ht WHERE tk=?'),
    htThem: d.prepare('INSERT INTO ht(td,tk,ten,pi,thuDo) VALUES(?,?,?,?,?) ON CONFLICT(td) DO UPDATE SET tk=excluded.tk,ten=excluded.ten,pi=excluded.pi,thuDo=excluded.thuDo'),
    htGet: d.prepare('SELECT ht.*, tk.hienthi, tk.vaoCuoi, dq.diem, dq.lm FROM ht JOIN tk ON tk.id=ht.tk JOIN dq ON dq.tk=ht.tk WHERE ht.td=?'),
    htTrongHe: d.prepare(`SELECT ht.*, tk.hienthi, tk.vaoCuoi, dq.diem, dq.lm FROM ht
                          JOIN tk ON tk.id=ht.tk JOIN dq ON dq.tk=ht.tk WHERE ht.td LIKE ?`),
    htDem: d.prepare('SELECT COUNT(*) n FROM ht'),

    npcGet: d.prepare('SELECT data FROM npc WHERE key=?'),
    npcSet: d.prepare('INSERT INTO npc(key,data,t) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,t=excluded.t'),

    plGet: d.prepare('SELECT kl,tt FROM pl WHERE td=?'),
    plSet: d.prepare('INSERT INTO pl(td,kl,tt) VALUES(?,?,?) ON CONFLICT(td) DO UPDATE SET kl=excluded.kl,tt=excluded.tt'),
    plTrongHe: d.prepare('SELECT td,kl,tt FROM pl WHERE td LIKE ? AND (kl>0 OR tt>0)'),

    lmDS: d.prepare(`SELECT lm.*, (SELECT COUNT(*) FROM dq WHERE dq.lm=lm.ten) sl,
                     (SELECT COALESCE(SUM(diem),0) FROM dq WHERE dq.lm=lm.ten) diem FROM lm ORDER BY diem DESC`),
    lmGet: d.prepare('SELECT * FROM lm WHERE ten=?'),
    lmThem: d.prepare('INSERT INTO lm(ten,tag,chu,tao,mota) VALUES(?,?,?,?,?)'),
    lmXoa: d.prepare('DELETE FROM lm WHERE ten=?'),

    btThem: d.prepare('INSERT INTO bangtin(khi,loai,noi) VALUES(?,?,?)'),
    btDS: d.prepare('SELECT * FROM bangtin ORDER BY khi DESC, id DESC LIMIT ?'),

    tranThem: d.prepare('INSERT INTO tran(khi,tkA,tkD,td,kq,cuop,matA,matD) VALUES(?,?,?,?,?,?,?,?)'),
    tranDS: d.prepare('SELECT * FROM tran ORDER BY khi DESC LIMIT ?')
  };
}

Kho.prototype.cauhinh = function (k, v) {
  if (v === undefined) { var r = this.q.cauhinhGet.get(k); return r ? r.v : null; }
  this.q.cauhinhSet.run(k, String(v));
  return v;
};
Kho.prototype.giaoDich = function (f) {
  this.db.exec('BEGIN');
  try { var kq = f(); this.db.exec('COMMIT'); return kq; }
  catch (e) { try { this.db.exec('ROLLBACK'); } catch (e2) { } throw e; }
};
Kho.prototype.dong = function () { try { this.db.close(); } catch (e) { } };

module.exports = { Kho: Kho, moDB: moDB, SCHEMA: SCHEMA };
