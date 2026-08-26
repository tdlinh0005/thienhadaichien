/* THIÊN HÀ ĐẠI CHIẾN — tầng database (SQLite, dùng node:sqlite có sẵn của Node)
 * Không phụ thuộc gói ngoài nào. File dữ liệu: server/data/thdc.db          */
'use strict';
var fs = require('fs'), path = require('path');
var assertSupportedNode = require('./runtime-version.js').assertSupportedNode;
assertSupportedNode(process.versions.node);
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
     diemCT INTEGER NOT NULL DEFAULT 0,
     diemNC INTEGER NOT NULL DEFAULT 0,
     diemHam INTEGER NOT NULL DEFAULT 0,
     diemThu INTEGER NOT NULL DEFAULT 0,
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

  /* hạm đội đang bay tới hành tinh NGƯỜI CHƠI KHÁC — chỉ mục để bên phòng thủ
     được báo động trước. Ghi lại mỗi lần lưu đế quốc, y như bảng ht. */
  `CREATE TABLE IF NOT EXISTS hamdang (
     tkA INTEGER NOT NULL REFERENCES tk(id) ON DELETE CASCADE,
     fid INTEGER NOT NULL,
     tkD INTEGER NOT NULL REFERENCES tk(id) ON DELETE CASCADE,
     tu TEXT NOT NULL, den TEXT NOT NULL, nv TEXT NOT NULL,
     denT INTEGER NOT NULL, tenA TEXT NOT NULL, lmA TEXT,
     PRIMARY KEY (tkA, fid)
   )`,
  "CREATE INDEX IF NOT EXISTS hamdang_tkd ON hamdang(tkD, denT)",
  "CREATE INDEX IF NOT EXISTS hamdang_den_nv ON hamdang(den,nv,denT)",

  /* Chỉ mục PHÁI SINH của các hạm đội đang đậu trên quỹ đạo. Tàu và hàng
     vẫn chỉ có một bản canonical trong dq.state của tkA; bảng này tuyệt đối
     không giữ JSON đội hình để tránh nhân đôi tài sản khi phục hồi/restart. */
  `CREATE TABLE IF NOT EXISTS hamgiu (
     tkA INTEGER NOT NULL REFERENCES tk(id) ON DELETE CASCADE,
     fid INTEGER NOT NULL,
     tkD INTEGER NOT NULL REFERENCES tk(id) ON DELETE CASCADE,
     tu TEXT NOT NULL, td TEXT NOT NULL,
     giuLuc INTEGER NOT NULL, giuDenT INTEGER NOT NULL, tiepNLT INTEGER NOT NULL,
     PRIMARY KEY (tkA, fid)
   )`,
  "CREATE INDEX IF NOT EXISTS hamgiu_td ON hamgiu(td,giuLuc,giuDenT)",
  "CREATE INDEX IF NOT EXISTS hamgiu_tkd ON hamgiu(tkD,td,giuDenT)",
  "CREATE INDEX IF NOT EXISTS hamgiu_due ON hamgiu(giuDenT)",

  /* NPC dùng chung cả server */
  "CREATE TABLE IF NOT EXISTS npc (key TEXT PRIMARY KEY, data TEXT NOT NULL, t INTEGER NOT NULL)",

  /* bãi phế liệu dùng chung */
  "CREATE TABLE IF NOT EXISTS pl (td TEXT PRIMARY KEY, kl REAL NOT NULL DEFAULT 0, tt REAL NOT NULL DEFAULT 0)",

  /* liên minh */
  `CREATE TABLE IF NOT EXISTS lm (
     ten TEXT PRIMARY KEY, tag TEXT NOT NULL, chu INTEGER NOT NULL, tao INTEGER NOT NULL, mota TEXT
   )`,

  /* đơn xin gia nhập; chủ liên minh phải duyệt trước khi dq.lm thay đổi */
  `CREATE TABLE IF NOT EXISTS lm_xin (
     lm TEXT NOT NULL REFERENCES lm(ten) ON DELETE CASCADE,
     tk INTEGER NOT NULL REFERENCES tk(id) ON DELETE CASCADE,
     khi INTEGER NOT NULL,
     PRIMARY KEY (lm,tk)
   )`,
  "CREATE INDEX IF NOT EXISTS lm_xin_tk ON lm_xin(tk,khi DESC)",

  /* Lệnh chiến tranh của bản gốc nhắm tới một chỉ huy cụ thể. Bên tuyên là
     liên minh (chủ ra lệnh, thành viên hiện tại cùng hưởng quyền) hoặc chính
     tài khoản khi người đó chưa gia nhập liên minh. */
  `CREATE TABLE IF NOT EXISTS chien (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     lmA TEXT REFERENCES lm(ten) ON DELETE CASCADE,
     tkA INTEGER REFERENCES tk(id) ON DELETE CASCADE,
     tkD INTEGER NOT NULL REFERENCES tk(id) ON DELETE CASCADE,
     khi INTEGER NOT NULL,
     CHECK ((lmA IS NULL) <> (tkA IS NULL)),
     CHECK (tkA IS NULL OR tkA<>tkD)
   )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS chien_lm_muctieu ON chien(lmA,tkD) WHERE lmA IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS chien_tk_muctieu ON chien(tkA,tkD) WHERE tkA IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS chien_muctieu ON chien(tkD,khi DESC)",

  /* bảng tin toàn server: ai đánh ai, ai lập liên minh... */
  `CREATE TABLE IF NOT EXISTS bangtin (
     id INTEGER PRIMARY KEY AUTOINCREMENT, khi INTEGER NOT NULL, loai TEXT NOT NULL, noi TEXT NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS bangtin_khi ON bangtin(khi DESC)",

  /* phòng chat chung được nguồn ITD xác nhận; kênh riêng liên minh là [SUY LUẬN] */
  `CREATE TABLE IF NOT EXISTS chat (
     id INTEGER PRIMARY KEY AUTOINCREMENT, khi INTEGER NOT NULL,
     tk INTEGER NOT NULL, ten TEXT NOT NULL, lm TEXT,
     kenh TEXT NOT NULL CHECK(kenh IN ('chung','lienminh')), noi TEXT NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS chat_kenh ON chat(kenh,khi DESC,id DESC)",
  "CREATE INDEX IF NOT EXISTS chat_lm ON chat(lm,kenh,khi DESC,id DESC)",
  "CREATE INDEX IF NOT EXISTS chat_khi ON chat(khi)",

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
  /* Tự sửa database của các bản cũ: trước khi có bộ máy quản trị, chủ liên
     minh có thể rời/xoá tài khoản mà lm.chu không đổi. Chuyển quyền cho thành
     viên mạnh nhất còn lại rồi xoá các liên minh thực sự không còn ai. */
  db.exec(`UPDATE lm
           SET chu=(SELECT dq.tk FROM dq WHERE dq.lm=lm.ten ORDER BY dq.diem DESC,dq.tk LIMIT 1)
           WHERE NOT EXISTS (SELECT 1 FROM dq WHERE dq.tk=lm.chu AND dq.lm=lm.ten)
             AND EXISTS (SELECT 1 FROM dq WHERE dq.lm=lm.ten);
           DELETE FROM chat
           WHERE kenh='lienminh' AND NOT EXISTS (
             SELECT 1 FROM lm WHERE lm.ten=chat.lm
               AND EXISTS (SELECT 1 FROM dq WHERE dq.lm=lm.ten)
           );
           DELETE FROM lm WHERE NOT EXISTS (SELECT 1 FROM dq WHERE dq.lm=lm.ten);`);
  return db;
}

/* ---------- lớp truy vấn ---------- */
function Kho(duong, options) {
  options = options || {};
  if (duong === ':memory:' && options.allowMemoryDb !== true)
    throw new Error('allowMemoryDb is test-only');
  this.db = moDB(duong);
  this.duong = duong;
  this.clock = options.clock;
  this.logger = options.logger;
  this.onTransaction = typeof options.onTransaction === 'function' ? options.onTransaction : null;
  this.onIdleWait = typeof options.onIdleWait === 'function' ? options.onIdleWait : null;
  this.idleWaiters = [];
  this.transactionDepth = 0;
  this.transactionRollbackOnly = false;
  this.transactionFailure = null;
  this._schedulerFinalizers = null;
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
    tkXoa: d.prepare('DELETE FROM tk WHERE id=?'),
    phienXoaCua: d.prepare('DELETE FROM phien WHERE tk=?'),
    phienXoaKhac: d.prepare('DELETE FROM phien WHERE tk=? AND token<>?'),
    lmDonRong: d.prepare('DELETE FROM lm WHERE (SELECT COUNT(*) FROM dq WHERE dq.lm=lm.ten)=0'),

    phienThem: d.prepare('INSERT INTO phien(token,tk,tao,hetHan) VALUES(?,?,?,?)'),
    phienGet: d.prepare('SELECT * FROM phien WHERE token=?'),
    phienXoa: d.prepare('DELETE FROM phien WHERE token=?'),
    phienDonRac: d.prepare('DELETE FROM phien WHERE hetHan<?'),

    dqGet: d.prepare('SELECT * FROM dq WHERE tk=?'),
    dqThem: d.prepare(
      'INSERT INTO dq(tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,' +
      'keTiep,lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
    ),
    dqLuu: d.prepare(
      'UPDATE dq SET state=?,diem=?,diemCT=?,diemNC=?,diemHam=?,diemThu=?,lastTick=?,' +
      'keTiep=?,lm=?,soHT=?,capNhat=? WHERE tk=?'
    ),
    dqLuuState: d.prepare('UPDATE dq SET state=?,capNhat=? WHERE tk=?'),
    dqDenHan: d.prepare('SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep,tk LIMIT ?'),
    dqXepHang: d.prepare(`SELECT dq.tk, dq.diem, dq.diemCT, dq.diemNC, dq.diemHam, dq.diemThu,
                                 dq.lm, dq.soHT, tk.hienthi, tk.vaoCuoi
                          FROM dq JOIN tk ON tk.id=dq.tk ORDER BY dq.diem DESC LIMIT ?`),
    tkTheoHienThi: d.prepare('SELECT * FROM tk WHERE hienthi=? COLLATE NOCASE'),
    dqTheoLM: d.prepare(`SELECT dq.tk, dq.diem, dq.soHT, tk.hienthi FROM dq JOIN tk ON tk.id=dq.tk
                         WHERE dq.lm=? ORDER BY dq.diem DESC`),
    dqTongLM: d.prepare('SELECT lm, COUNT(*) sl, SUM(diem) diem FROM dq WHERE lm IS NOT NULL GROUP BY lm'),

    htXoaCua: d.prepare('DELETE FROM ht WHERE tk=?'),
    htThem: d.prepare(
      'INSERT INTO ht(td,tk,ten,pi,thuDo) VALUES(?,?,?,?,?) ON CONFLICT(td) DO UPDATE SET ' +
      'tk=excluded.tk,ten=excluded.ten,pi=excluded.pi,thuDo=excluded.thuDo'
    ),
    htGet: d.prepare(
      'SELECT ht.*, tk.hienthi, tk.vaoCuoi, dq.diem, dq.lm FROM ht JOIN tk ON tk.id=ht.tk ' +
      'JOIN dq ON dq.tk=ht.tk WHERE ht.td=?'
    ),
    htTrongHe: d.prepare(`SELECT ht.*, tk.hienthi, tk.vaoCuoi, dq.diem, dq.lm FROM ht
                          JOIN tk ON tk.id=ht.tk JOIN dq ON dq.tk=ht.tk WHERE ht.td LIKE ?`),
    htDem: d.prepare('SELECT COUNT(*) n FROM ht'),

    hdXoaCua: d.prepare('DELETE FROM hamdang WHERE tkA=?'),
    hdThem: d.prepare('INSERT INTO hamdang(tkA,fid,tkD,tu,den,nv,denT,tenA,lmA) VALUES(?,?,?,?,?,?,?,?,?)'),
    hdToi: d.prepare(`SELECT d.* FROM hamdang d JOIN ht h ON h.td=d.den
                      WHERE h.tk=? AND d.denT>? ORDER BY d.denT,d.tkA,d.fid`),
    hdGiuDen: d.prepare("SELECT tkA,fid FROM hamdang WHERE den=? AND nv='hold' AND denT<=? ORDER BY tkA,fid"),
    hdDonRac: d.prepare('DELETE FROM hamdang WHERE denT<?'),

    hgXoaCua: d.prepare('DELETE FROM hamgiu WHERE tkA=?'),
    hgThem: d.prepare('INSERT INTO hamgiu(tkA,fid,tkD,tu,td,giuLuc,giuDenT,tiepNLT) VALUES(?,?,?,?,?,?,?,?)'),
    /* `giuLuc<=T<giuDenT`: hạm tới đúng giây T được phòng thủ, hết hạn đúng
       T thì không. JOIN ht + dq làm row cũ mất hiệu lực ngay khi đổi chủ/rời LM. */
    hgTai: d.prepare(`SELECT g.*,tk.hienthi tenA,a.lm lmA
                       FROM hamgiu g
                       JOIN ht h ON h.td=g.td AND h.tk=g.tkD
                       JOIN dq a ON a.tk=g.tkA
                       JOIN dq d0 ON d0.tk=g.tkD
                       JOIN tk ON tk.id=g.tkA
                       WHERE g.tkD=? AND g.td=? AND g.giuLuc<=? AND g.giuDenT>?
                         AND (g.tkA=g.tkD OR (a.lm IS NOT NULL AND a.lm=d0.lm))
                       ORDER BY g.tkA,g.fid`),
    /* Candidate thô để battle tua authoritative trước khi quyết định quyền và
       expiry. Không lọc thời gian/LM ở đây: row stale phải được nạp để hook bắt
       quay về, còn eligibility cuối vẫn là giuLuc<=T<giuDenT. */
    hgCan: d.prepare(`SELECT g.tkA,g.fid
                      FROM hamgiu g
                      WHERE g.td=?
                      ORDER BY g.tkA,g.fid`),
    hgToi: d.prepare(`SELECT g.*,tk.hienthi tenA,a.lm lmA
                       FROM hamgiu g
                       JOIN ht h ON h.td=g.td AND h.tk=g.tkD
                       JOIN dq a ON a.tk=g.tkA
                       JOIN dq d0 ON d0.tk=g.tkD
                       JOIN tk ON tk.id=g.tkA
                       WHERE g.tkD=? AND g.giuLuc<=? AND g.giuDenT>? AND g.tiepNLT>?
                         AND (g.tkA=g.tkD OR (a.lm IS NOT NULL AND a.lm=d0.lm))
                       ORDER BY g.td,g.tkA,g.fid`),
    npcGet: d.prepare('SELECT data FROM npc WHERE key=?'),
    npcSet: d.prepare(
      'INSERT INTO npc(key,data,t) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET ' +
      'data=excluded.data,t=excluded.t'
    ),

    plGet: d.prepare('SELECT kl,tt FROM pl WHERE td=?'),
    plSet: d.prepare(
      'INSERT INTO pl(td,kl,tt) VALUES(?,?,?) ON CONFLICT(td) DO UPDATE SET ' +
      'kl=excluded.kl,tt=excluded.tt'
    ),
    plTrongHe: d.prepare('SELECT td,kl,tt FROM pl WHERE td LIKE ? AND (kl>0 OR tt>0)'),

    lmDS: d.prepare(`SELECT lm.*, (SELECT COUNT(*) FROM dq WHERE dq.lm=lm.ten) sl,
                     (SELECT COALESCE(SUM(diem),0) FROM dq WHERE dq.lm=lm.ten) diem FROM lm ORDER BY diem DESC`),
    lmGet: d.prepare('SELECT * FROM lm WHERE ten=?'),
    lmTheoTag: d.prepare('SELECT * FROM lm WHERE tag=? COLLATE NOCASE'),
    lmCuaChu: d.prepare('SELECT * FROM lm WHERE chu=?'),
    lmThem: d.prepare('INSERT INTO lm(ten,tag,chu,tao,mota) VALUES(?,?,?,?,?)'),
    lmDoiChu: d.prepare('UPDATE lm SET chu=? WHERE ten=?'),
    lmKeNhi: d.prepare('SELECT tk FROM dq WHERE lm=? AND tk<>? ORDER BY diem DESC,tk LIMIT 1'),
    lmXoa: d.prepare('DELETE FROM lm WHERE ten=?'),
    lmXinGet: d.prepare('SELECT * FROM lm_xin WHERE lm=? AND tk=?'),
    lmXinThem: d.prepare('INSERT INTO lm_xin(lm,tk,khi) VALUES(?,?,?)'),
    lmXinXoa: d.prepare('DELETE FROM lm_xin WHERE lm=? AND tk=?'),
    lmXinXoaCua: d.prepare('DELETE FROM lm_xin WHERE tk=?'),
    lmXinCua: d.prepare('SELECT lm,khi FROM lm_xin WHERE tk=? ORDER BY khi DESC'),
    lmXinDS: d.prepare(`SELECT x.lm,x.tk,x.khi,tk.hienthi,dq.diem,dq.soHT
                        FROM lm_xin x JOIN tk ON tk.id=x.tk JOIN dq ON dq.tk=x.tk
                        WHERE x.lm=? ORDER BY x.khi,x.tk`),

    chienGetLM: d.prepare('SELECT * FROM chien WHERE lmA=? AND tkD=?'),
    chienGetTK: d.prepare('SELECT * FROM chien WHERE tkA=? AND tkD=?'),
    chienThemLM: d.prepare('INSERT INTO chien(lmA,tkA,tkD,khi) VALUES(?,NULL,?,?)'),
    chienThemTK: d.prepare('INSERT INTO chien(lmA,tkA,tkD,khi) VALUES(NULL,?,?,?)'),
    chienTheoLM: d.prepare(`SELECT c.*,tk.hienthi tenD,dq.lm lmD
                            FROM chien c JOIN tk ON tk.id=c.tkD JOIN dq ON dq.tk=c.tkD
                            WHERE c.lmA=? ORDER BY c.khi DESC,c.id DESC`),
    chienTheoTK: d.prepare(`SELECT c.*,tk.hienthi tenD,dq.lm lmD
                            FROM chien c JOIN tk ON tk.id=c.tkD JOIN dq ON dq.tk=c.tkD
                            WHERE c.tkA=? ORDER BY c.khi DESC,c.id DESC`),
    chienToi: d.prepare(`SELECT c.*,a.hienthi tenA,adq.lm lmTkA
                         FROM chien c LEFT JOIN tk a ON a.id=c.tkA LEFT JOIN dq adq ON adq.tk=c.tkA
                         WHERE c.tkD=? ORDER BY c.khi DESC,c.id DESC`),

    btThem: d.prepare('INSERT INTO bangtin(khi,loai,noi) VALUES(?,?,?)'),
    btDS: d.prepare('SELECT * FROM bangtin ORDER BY khi DESC, id DESC LIMIT ?'),

    chatThem: d.prepare('INSERT INTO chat(khi,tk,ten,lm,kenh,noi) VALUES(?,?,?,?,?,?)'),
    chatChung: d.prepare(
      "SELECT id,khi,ten,lm,kenh,noi FROM chat WHERE kenh='chung' AND khi>=? " +
      "ORDER BY khi DESC,id DESC LIMIT ?"
    ),
    chatLM: d.prepare(
      "SELECT id,khi,ten,lm,kenh,noi FROM chat WHERE kenh='lienminh' AND lm=? " +
      "AND khi>=? ORDER BY khi DESC,id DESC LIMIT ?"
    ),
    chatLMXoa: d.prepare("DELETE FROM chat WHERE kenh='lienminh' AND lm=?"),
    chatDonRac: d.prepare('DELETE FROM chat WHERE khi<?'),

    tranThem: d.prepare('INSERT INTO tran(khi,tkA,tkD,td,kq,cuop,matA,matD) VALUES(?,?,?,?,?,?,?,?)'),
    tranDS: d.prepare('SELECT * FROM tran ORDER BY khi DESC LIMIT ?')
  };
}

Kho.prototype.cauhinh = function (k, v) {
  if (v === undefined) { var r = this.q.cauhinhGet.get(k); return r ? r.v : null; }
  this.q.cauhinhSet.run(k, String(v));
  return v;
};
Kho.prototype._baoRanh = function () {
  if (this.transactionDepth !== 0) return;
  this.idleWaiters.splice(0).forEach(function (resolve) { resolve(); });
};
Kho.prototype.choRanh = function () {
  var self = this;
  if (self.onIdleWait) self.onIdleWait(self.transactionDepth);
  if (self.transactionDepth === 0) return Promise.resolve();
  return new Promise(function (resolve) { self.idleWaiters.push(resolve); });
};
Kho.prototype.trongGiaoDich = function (f, options) {
  options = options || {};
  var self = this;
  function chayDongBo() {
    var result = f();
    if (result && typeof result.then === 'function') {
      var asyncError = new TypeError('UNIT_OF_WORK_ASYNC');
      asyncError.code = 'UNIT_OF_WORK_ASYNC';
      throw asyncError;
    }
    return result;
  }
  if (this.transactionDepth > 0) {
    this.transactionDepth++;
    try { return chayDongBo(); }
    catch (error) {
      if (!this.transactionRollbackOnly) {
        this.transactionRollbackOnly = true;
        this.transactionFailure = error;
      }
      throw error;
    }
    finally { this.transactionDepth--; }
  }

  var immediate = options.immediate === true;
  this.transactionRollbackOnly = false;
  this.transactionFailure = null;
  this._schedulerFinalizers = [];
  this.db.exec(immediate ? 'BEGIN IMMEDIATE' : 'BEGIN');
  this.transactionDepth = 1;
  try {
    var result;
    try {
      if (this.onTransaction) this.onTransaction(immediate ? 'begin-immediate' : 'begin');
      result = chayDongBo();
      if (this.transactionRollbackOnly) throw this.transactionFailure;
      for (var i = 0; i < this._schedulerFinalizers.length; i++) {
        this._schedulerFinalizers[i]();
        if (this.transactionRollbackOnly) throw this.transactionFailure;
      }
      this.db.exec('COMMIT');
    } catch (error) {
      var failure = this.transactionRollbackOnly ? this.transactionFailure : error;
      try { this.db.exec('ROLLBACK'); } catch (rollbackError) { void rollbackError; }
      this.transactionDepth = 0;
      if (this.onTransaction) {
        try { this.onTransaction('rollback'); } catch (rollbackObserverError) { void rollbackObserverError; }
      }
      throw failure;
    }
    this.transactionDepth = 0;
    if (this.onTransaction) this.onTransaction('commit');
    return result;
  } finally {
    self.transactionDepth = 0;
    self.transactionRollbackOnly = false;
    self.transactionFailure = null;
    self._schedulerFinalizers = null;
    self._baoRanh();
  }
};
Kho.prototype.giaoDich = Kho.prototype.trongGiaoDich;
Kho.prototype.dangKySchedulerFinalizer = function (fn) {
  if (typeof fn !== 'function') throw new Error('SCHEDULER_FINALIZER_INVALID');
  if (this.transactionDepth === 0 || !this._schedulerFinalizers) {
    throw new Error('SCHEDULER_FINALIZER_TRANSACTION_REQUIRED');
  }
  if (this._schedulerFinalizers.indexOf(fn) < 0) this._schedulerFinalizers.push(fn);
};
Kho.prototype.schedulerStatements = function () {
  if (this._schedulerStatements) return this._schedulerStatements;
  var columns = this.db.prepare('PRAGMA table_info(dq)').all().map(function (row) {
    return row.name;
  });
  if (columns.indexOf('revision') < 0) throw new Error('SCHEDULER_SCHEMA_REQUIRED');
  this._schedulerStatements = {dqLuu: this.db.prepare(
    'UPDATE dq SET state=?,diem=?,diemCT=?,diemNC=?,diemHam=?,diemThu=?,' +
    'lastTick=?,keTiep=?,lm=?,soHT=?,capNhat=?,revision=revision+1 WHERE tk=? ' +
    'RETURNING revision'
  )};
  return this._schedulerStatements;
};
Kho.prototype.dong = function () { try { this.db.close(); } catch (e) { } };

module.exports = { Kho: Kho, moDB: moDB, SCHEMA: SCHEMA };
