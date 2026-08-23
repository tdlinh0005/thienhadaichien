/* THIÊN HÀ ĐẠI CHIẾN — thế giới dùng chung (server là bên quyết định)
 * Nhiệm vụ:
 *   - nạp/lưu đế quốc của từng tài khoản (state JSON trong SQLite)
 *   - tua thời gian cho đế quốc, xử lý sự kiện tới hạn
 *   - đấu PvP thật giữa nhiều chủ hạm: tua bên đánh, host và các đội hỗ trợ,
 *     đánh nhau, cướp tài nguyên, ghi báo cáo cho các bên
 *   - NPC và bãi phế liệu là TÀI SẢN CHUNG của server (bảng npc / pl)      */
'use strict';
var G = require('./rules.js').G;

var CACH_LAU_MOI_VAO = 7 * 86400;   // quá 7 ngày không vào -> hiện "lâu không vào"
var ONLINE = 300;                   // 5 phút
var CHIEN_CHO = 24 * 3600;          // Hội Đồng Bảo An chỉ cho đánh sau 24 giờ

function TheGioi(kho) {
  this.kho = kho;
  this.dangTick = new Set();
  this.chuStack = [];
  this.mocTick = [];                 // horizon cố định của TheGioi.tick ngoài cùng
  this.ctx = null;
  this.sau = 0;
  this._seed = null;
  G.HOOK = this.veHook();
}

/* Nâng toàn bộ state đã lưu trước khi server bắt đầu nhận request. Mọi bản
   ghi được chuẩn bị trong bộ nhớ trước rồi mới COMMIT cùng lúc: nếu một JSON
   hỏng hoặc thuộc phiên bản mới hơn code hiện tại, database không bị nâng
   nửa chừng. Không tick thời gian tại đây; scheduler sẽ làm việc đó sau. */
TheGioi.prototype.nangCapDuLieu = function () {
  var rows = this.kho.db.prepare('SELECT tk,state FROM dq ORDER BY tk').all();
  var tatCa = [], canLuu = new Set(), soNangCap = 0;
  var now = Math.floor(Date.now() / 1000), i;
  for (i = 0; i < rows.length; i++) {
    var st;
    try { st = JSON.parse(rows[i].state); }
    catch (e) { throw new Error('State của tài khoản #' + rows[i].tk + ' không phải JSON hợp lệ.'); }
    var v = Math.max(0, Math.floor(Number(st && st.v) || 0));
    if (v > G.STATE_VERSION)
      throw new Error('State của tài khoản #' + rows[i].tk + ' là v' + v +
        ', mới hơn engine v' + G.STATE_VERSION + '. Hãy nâng cấp mã máy chủ trước.');
    if (v === G.STATE_VERSION) {
      if (st.moHinhCT !== 'so-luong-v1' || st.moHinhNhip !== 'bao-tri-dan-su-v1' ||
          (G.QUY_DAO_V1 && st.moHinhQuyDao !== G.QUY_DAO_V1.marker))
        throw new Error('State của tài khoản #' + rows[i].tk + ' là v' + v +
          ' nhưng không có marker mô hình state hợp lệ.');
      tatCa.push({ tk: rows[i].tk, st: st });
      continue;
    }

    /* `now` là biên kích hoạt luật v5: quãng offline trước migration không
       được gây mất dân/công trình hay làm hỏng nghiên cứu hồi tố. */
    G.nangCapState(st, now);
    st.npc = {}; st.debris = {};
    canLuu.add(rows[i].tk); soNangCap++;
    tatCa.push({ tk: rows[i].tk, st: st });
  }

  /* Save v5 không biết id tài khoản của hành tinh nơi hạm đang đậu. Resolve
     đúng một lần từ toàn bộ state canonical, rồi PERSIST pin trước khi dựng
     hamgiu. Nếu chủ hiện tại không còn là ta/đồng minh thì để null: hạm không
     được phòng thủ và checkpoint authoritative kế tiếp sẽ bắt quay về. */
  var chuTD = new Map(), lmTK = new Map();
  tatCa.forEach(function (x) {
    lmTK.set(x.tk, x.st.lm ? x.st.lm.ten : null);
    for (var pi = 0; pi < (x.st.planets || []).length; pi++)
      chuTD.set(G.tdKey(x.st.planets[pi].c), x.tk);
  });
  tatCa.forEach(function (x) {
    for (var fi = 0; fi < (x.st.fleets || []).length; fi++) {
      var f = x.st.fleets[fi];
      if (f.mission !== 'hold' || f.pha !== 'giu' ||
          (f.giuTaiTk !== null && f.giuTaiTk !== undefined)) continue;
      var chu = chuTD.get(G.tdKey(f.den));
      var cungLM = chu && lmTK.get(x.tk) && lmTK.get(x.tk) === lmTK.get(chu);
      if (chu && (chu === x.tk || cungLM)) {
        f.giuTaiTk = chu;
        canLuu.add(x.tk);
      }
    }
  });

  var doi = [];
  tatCa.forEach(function (x) {
    if (!canLuu.has(x.tk)) return;
    var st = x.st, dd = G.diem(st), ke = G.sukienKe(st);
    if (!isFinite(ke)) ke = (st.lastTick || st.now || now) + 3600;
    ke = Math.min(ke, (st.lastTick || st.now || now) + 3600);
    doi.push({
      tk: x.tk, state: JSON.stringify(st),
      diem: Math.round(dd.tong), ct: Math.round(dd.ct), nc: Math.round(dd.nc),
      ham: Math.round(dd.ham), thu: Math.round(dd.thu),
      lastTick: Math.round(st.lastTick || st.now || now), ke: Math.round(ke),
      lm: st.lm ? st.lm.ten : null, soHT: (st.planets || []).length
    });
  });

  var kho = this.kho, self = this;
  kho.giaoDich(function () {
    for (var j = 0; j < doi.length; j++) {
      var x = doi[j];
      kho.q.dqLuu.run(x.state, x.diem, x.ct, x.nc, x.ham, x.thu,
        x.lastTick, x.ke, x.lm, x.soHT, now, x.tk);
    }
    kho.q.cauhinhSet.run('stateVersion', String(G.STATE_VERSION));
    self._dongBoChiMucTrongGD(tatCa);
  });
  return soNangCap;
};

/* ---------------------------------------------------------------- hạt giống */
TheGioi.prototype.seed = function () {
  if (this._seed) return this._seed;
  var s = this.kho.cauhinh('seed');
  if (!s) {
    s = 'THDC-' + Math.floor(Math.random() * 1e9);
    this.kho.cauhinh('seed', s);
    this.kho.cauhinh('moLuc', String(Math.floor(Date.now() / 1000)));
  }
  this._seed = s;
  return s;
};

/* ------------------------------------------------ unit of work dùng chung
 *
 * Mọi mutation của một nhịp authoritative chạy đồng bộ trong đúng một tiến
 * trình Node. `ctx` gom state của tất cả tài khoản bị kéo vào cùng sự kiện,
 * projection, báo cáo, NPC và phế liệu rồi COMMIT một lần ở nhịp ngoài cùng.
 * Đây là hợp đồng một-writer-process của server hiện tại; `dangTick` không
 * phải distributed lock và không cho phép hai process cùng ghi một file DB. */
TheGioi.prototype.batDau = function () {
  if (!this.ctx) this.ctx = {
    npc: new Map(), npcBan: new Set(), pl: new Map(), plBan: new Set(),
    states: new Map(), dirty: new Map(), bangTin: [], tran: [], huy: false
  };
  this.sau++;
};
TheGioi.prototype.ketThuc = function (thanhCong) {
  if (this.ctx && thanhCong === false) this.ctx.huy = true;
  if (--this.sau > 0) return;
  var c = this.ctx; this.ctx = null;
  if (!c || c.huy) return;
  var kho = this.kho, now = Math.floor(Date.now() / 1000);
  var self = this;
  kho.giaoDich(function () {
    self._ghiNhieu(Array.from(c.dirty, function (x) { return { tk: x[0], st: x[1] }; }), now);
    c.npcBan.forEach(function (k) {
      var n = c.npc.get(k);
      if (n) kho.q.npcSet.run(k, JSON.stringify(n), now);
    });
    c.plBan.forEach(function (td) {
      var p = c.pl.get(td);
      if (p) kho.q.plSet.run(td, Math.max(0, p.metal || 0), Math.max(0, p.crystal || 0));
    });
    for (var i = 0; i < c.tran.length; i++) kho.q.tranThem.run.apply(kho.q.tranThem, c.tran[i]);
    for (var j = 0; j < c.bangTin.length; j++) kho.q.btThem.run.apply(kho.q.btThem, c.bangTin[j]);
  });
};

TheGioi.prototype.ghiBangTin = function () {
  var a = Array.prototype.slice.call(arguments);
  if (this.ctx) this.ctx.bangTin.push(a); else this.kho.q.btThem.run.apply(this.kho.q.btThem, a);
};
TheGioi.prototype.ghiTran = function () {
  var a = Array.prototype.slice.call(arguments);
  if (this.ctx) this.ctx.tran.push(a); else this.kho.q.tranThem.run.apply(this.kho.q.tranThem, a);
};

TheGioi.prototype.npcLay = function (key) {
  this.batDau();
  var thanhCong = false;
  try {
    var c = this.ctx;
    if (c.npc.has(key)) { c.npcBan.add(key); thanhCong = true; return c.npc.get(key); }
    var r = this.kho.q.npcGet.get(key);
    var n = null;
    if (r) { try { n = JSON.parse(r.data); } catch (e) { n = null; } }
    if (n) { c.npc.set(key, n); c.npcBan.add(key); }
    thanhCong = true;
    return n;
  } finally { this.ketThuc(thanhCong); }
};
TheGioi.prototype.npcGhi = function (n) {
  this.batDau();
  var thanhCong = false;
  try {
    this.ctx.npc.set(n.key, n);
    this.ctx.npcBan.add(n.key);
    thanhCong = true;
  } finally { this.ketThuc(thanhCong); }
};
TheGioi.prototype.plLay = function (td) {
  this.batDau();
  var thanhCong = false;
  try {
    var c = this.ctx;
    if (!c.pl.has(td)) {
      var r = this.kho.q.plGet.get(td);
      c.pl.set(td, { metal: r ? r.kl : 0, crystal: r ? r.tt : 0 });
    }
    c.plBan.add(td);
    var o = c.pl.get(td);
    thanhCong = true;
    return o;
  } finally { this.ketThuc(thanhCong); }
};

/* ------------------------------------------------------------------- hook */
TheGioi.prototype.veHook = function () {
  var W = this;
  return {
    oNguoi: function (st, c) { return W.oNguoi(st, c); },
    npc: function (st, c, key) { return W.npcLay(key); },
    npcMoi: function (n) { W.npcGhi(n); },
    pheLieu: function (key) { return W.plLay(key); },
    xepHang: function (st) { return W.xepHangCho(st); },
    kiemTraGui: function (st, p, den, mission) { return W.kiemTraGui(st, p, den, mission); },
    kiemTraGiu: function (st, f, o) { return W.kiemTraGiu(st, f, o); },
    danhNguoi: function (st, f, o, veNha) { W.danhNguoi(st, f, o, veNha); },
    doThamNguoi: function (st, f, o) { W.doThamNguoi(st, f, o); },
    tangNguoi: function (st, f, o, veNha) { W.tangNguoi(st, f, o, veNha); },
    tenLuaNguoi: function (st, tl, o) { W.tenLuaNguoi(st, tl, o); }
  };
};

/* ----------------------------------------------------- chiến tranh / đồng minh */
TheGioi.prototype.laDongMinh = function (tkA, tkD) {
  var a = this.kho.q.dqGet.get(tkA), d = this.kho.q.dqGet.get(tkD);
  return !!(a && d && a.lm && d.lm && a.lm === d.lm);
};

/* Luật nguồn 2006: lệnh chiến tranh nhắm tới một người chơi; nếu bên tuyên
   đang ở liên minh thì quyền đánh thuộc về liên minh và thành viên hiện tại. */
TheGioi.prototype.quyenDanh = function (tkA, tkD, now) {
  now = Math.floor(+now || Date.now() / 1000);
  var a = this.kho.q.dqGet.get(tkA), d = this.kho.q.dqGet.get(tkD);
  if (!a || !d) return { duoc: false, trang: 'khongco', loi: 'Không tìm thấy một trong hai đế quốc.' };
  if (tkA === tkD) return { duoc: false, trang: 'cuaminh', loi: 'Không thể tấn công chính mình.' };
  if (a.lm && d.lm && a.lm === d.lm)
    return { duoc: false, trang: 'dongminh', loi: 'Không thể tấn công thành viên cùng liên minh.' };
  var c = a.lm ? this.kho.q.chienGetLM.get(a.lm, tkD) : this.kho.q.chienGetTK.get(tkA, tkD);
  if (!c) return { duoc: false, trang: 'chua', loi: 'Chưa có lệnh tuyên chiến với chỉ huy này.' };
  var hieuLuc = c.khi + CHIEN_CHO;
  if (now < hieuLuc) return {
    duoc: false, trang: 'cho', khi: c.khi, hieuLuc: hieuLuc,
    loi: 'Lệnh tuyên chiến chưa đủ 24 giờ; còn ' + G.tg(hieuLuc - now) + '.'
  };
  return { duoc: true, trang: 'hieuluc', khi: c.khi, hieuLuc: hieuLuc };
};

/* Kiểm tra ngay lúc phát lệnh để không trừ tàu/hàng/nhiên liệu cho một chuyến
   bay trái luật. Đến đích vẫn kiểm tra lại vì tư cách liên minh có thể đổi. */
TheGioi.prototype.kiemTraGui = function (st, p, den, mission) {
  var tkA = this.chuHienTai();
  if (!tkA) return null;
  var d = this.kho.q.htGet.get(G.tdKey(den));
  if (mission === 'hold') {
    if (!d) return 'Giữ Chỗ chỉ được gửi tới hành tinh của ta hoặc đồng minh hiện tại.';
    if (d.tk !== tkA && !this.laDongMinh(tkA, d.tk))
      return 'Chỉ được đóng quân quỹ đạo tại hành tinh của ta hoặc thành viên cùng liên minh.';
    return null;
  }
  if (!d || d.tk === tkA) return null;
  if (mission === 'attack') {
    var q = this.quyenDanh(tkA, d.tk, st.now);
    return q.duoc ? null : q.loi;
  }
  if (mission === 'transport' && !this.laDongMinh(tkA, d.tk))
    return 'Chỉ được tiếp tế tài nguyên cho thành viên cùng liên minh.';
  return null;
};

/* Core gọi tại lúc hạm Hold tới và trước từng checkpoint nhiên liệu. Chủ tọa
   độ + tư cách liên minh luôn đọc lại từ projection authoritative; giuTaiTk
   chỉ là pin chống một toạ độ đổi chủ giữa hai lần kiểm tra. */
TheGioi.prototype.kiemTraGiu = function (st, f, o) {
  var tkA = this.chuHienTai();
  if (!tkA) return 'Không xác định được chủ hạm đội.';
  var td = G.tdKey(f.den);
  var d = this.kho.q.htGet.get(td);
  if (!d) return 'Hành tinh giữ chỗ không còn tồn tại.';
  if (o && o.loai === 'nguoi' && o.tk !== d.tk) return 'Chủ hành tinh đã thay đổi.';
  if (o && o.loai === 'toi' && d.tk !== tkA) return 'Chủ hành tinh đã thay đổi.';
  if (f.giuTaiTk !== null && f.giuTaiTk !== undefined && f.giuTaiTk !== d.tk)
    return 'Hành tinh giữ chỗ đã đổi chủ.';
  if (d.tk !== tkA && !this.laDongMinh(tkA, d.tk))
    return 'Quan hệ liên minh không còn hợp lệ; hạm đội phải quay về.';
  return { tk: d.tk };
};

TheGioi.prototype.chuHienTai = function () {
  return this.chuStack.length ? this.chuStack[this.chuStack.length - 1] : 0;
};

/* Ô toạ độ có phải hành tinh của người chơi khác? */
TheGioi.prototype.oNguoi = function (st, c) {
  var td = G.tdKey(c);
  var r = this.kho.q.htGet.get(td);
  if (!r) return null;
  if (r.tk === this.chuHienTai()) return null;      // hành tinh của chính mình
  var now = Math.floor(Date.now() / 1000);
  return {
    loai: 'nguoi', key: td, c: c, tk: r.tk, pi: r.pi,
    htTen: r.ten, ten: r.hienthi, lm: r.lm || '', diem: r.diem,
    online: (now - r.vaoCuoi) < ONLINE,
    bo: (now - r.vaoCuoi) > CACH_LAU_MOI_VAO
  };
};

/* -------------------------------------------------------- nạp / lưu đế quốc */
TheGioi.prototype.nap = function (tk) {
  if (this.ctx && this.ctx.states.has(tk)) return this.ctx.states.get(tk);
  var r = this.kho.q.dqGet.get(tk);
  if (!r) return null;
  var st;
  try { st = JSON.parse(r.state); } catch (e) { return null; }
  st.npc = {}; st.debris = {};        // hai thứ này là của chung, không giữ trong state
  var out = { row: r, st: st };
  if (this.ctx) this.ctx.states.set(tk, out);
  return out;
};

TheGioi.prototype._chuanBiLuu = function (tk, st, now) {
  var dd = G.diem(st);
  var diem = Math.round(dd.tong);
  var ke = G.sukienKe(st);
  if (!isFinite(ke)) ke = st.lastTick + 3600;
  ke = Math.min(ke, st.lastTick + 3600);           // tick định kỳ ít nhất 1 giờ/lần
  st.npc = {}; st.debris = {};
  return {
    tk: tk, st: st, js: JSON.stringify(st), diem: diem,
    ct: Math.round(dd.ct), nc: Math.round(dd.nc), ham: Math.round(dd.ham), thu: Math.round(dd.thu),
    lastTick: st.lastTick, ke: Math.round(ke), lm: st.lm ? st.lm.ten : null,
    soHT: st.planets.length, now: now
  };
};

/* Ghi projection hạm sau khi TẤT CẢ projection hành tinh trong unit-of-work
   đã ở trạng thái cuối. Điều này tránh resolve mục tiêu qua một hàng ht cũ. */
TheGioi.prototype._ghiChiMucHam = function (tk, st) {
  var kho = this.kho;
  for (var j = 0; j < st.fleets.length; j++) {
    var f = st.fleets[j], td = G.tdKey(f.den), chu;
    if (f.pha === 'di' &&
        (f.mission === 'attack' || f.mission === 'transport' || f.mission === 'hold')) {
      chu = kho.q.htGet.get(td);
      if (chu && (chu.tk !== tk || f.mission === 'hold'))
        kho.q.hdThem.run(tk, f.id, chu.tk, G.tdKey(f.tu), td, f.mission,
          Math.round(f.den_t), st.ten, st.lm ? st.lm.ten : null);
    }
    if (f.mission !== 'hold' || f.pha !== 'giu') continue;
    /* hamgiu phản chiếu VỊ TRÍ canonical, kể cả quan hệ vừa hết hạn. Eligibility
       nằm ở các SELECT có JOIN ht/dq; giữ row stale cho phép battle kế tiếp nạp
       đúng owner, gọi hook và bắt hạm quay về thay vì chỉ âm thầm bỏ qua. */
    var tkD = Number(f.giuTaiTk);
    if (!Number.isSafeInteger(tkD) || tkD < 1 || !kho.q.dqGet.get(tkD)) continue;
    var giuLuc = Math.floor(Number(f.giuLuc) || 0);
    var giuDenT = Math.floor(Number(f.giuDen_t) || 0);
    if (!(giuLuc >= 0) || !(giuDenT > giuLuc)) continue;
    kho.q.hgThem.run(tk, f.id, tkD, G.tdKey(f.tu), td, giuLuc, giuDenT,
      Math.floor(Number(f.tiepNL_t) || giuDenT));
  }
};

/* Được gọi bên trong đúng một SQLite transaction. Các phase cố ý tách rời:
   dq -> xoá projection cũ -> toàn bộ ht -> toàn bộ hạm. */
TheGioi.prototype._ghiNhieu = function (ds, now) {
  if (!ds || !ds.length) return;
  var kho = this.kho, self = this;
  ds.sort(function (a, b) { return a.tk - b.tk; });
  var p = ds.map(function (x) { return self._chuanBiLuu(x.tk, x.st, now); });
  p.forEach(function (x) {
    kho.q.dqLuu.run(x.js, x.diem, x.ct, x.nc, x.ham, x.thu,
      x.lastTick, x.ke, x.lm, x.soHT, x.now, x.tk);
  });
  p.forEach(function (x) {
    kho.q.htXoaCua.run(x.tk); kho.q.hdXoaCua.run(x.tk); kho.q.hgXoaCua.run(x.tk);
  });
  p.forEach(function (x) {
    for (var i = 0; i < x.st.planets.length; i++) {
      var ht = x.st.planets[i];
      kho.q.htThem.run(G.tdKey(ht.c), x.tk, ht.ten, i, ht.thuDo ? 1 : 0);
    }
  });
  p.forEach(function (x) { self._ghiChiMucHam(x.tk, x.st); });
};

TheGioi.prototype.luu = function (tk, st) {
  var now = Math.floor(Date.now() / 1000);
  var diem = Math.round(G.diem(st).tong);
  if (this.ctx) {
    this.ctx.dirty.set(tk, st);
    if (!this.ctx.states.has(tk)) this.ctx.states.set(tk, { row: this.kho.q.dqGet.get(tk), st: st });
    return diem;
  }
  var self = this;
  this.kho.giaoDich(function () { self._ghiNhieu([{ tk: tk, st: st }], now); });
  return diem;
};

/* Startup luôn dựng lại projection từ JSON canonical, kể cả không có state
   nào cần migration. Row mồ côi vì crash/bản cũ vì thế không sống qua restart. */
TheGioi.prototype._dongBoChiMucTrongGD = function (states) {
  var self = this, kho = this.kho;
  states.sort(function (a, b) { return a.tk - b.tk; });
  kho.db.exec('DELETE FROM hamdang; DELETE FROM hamgiu; DELETE FROM ht');
  var da = new Map();
  states.forEach(function (x) {
    for (var i = 0; i < x.st.planets.length; i++) {
      var p = x.st.planets[i], td = G.tdKey(p.c);
      if (da.has(td) && da.get(td) !== x.tk)
        throw new Error('Hai đế quốc cùng sở hữu toạ độ ' + td + ' trong state canonical.');
      da.set(td, x.tk);
      kho.q.htThem.run(td, x.tk, p.ten, i, p.thuDo ? 1 : 0);
    }
  });
  states.forEach(function (x) { self._ghiChiMucHam(x.tk, x.st); });
};

TheGioi.prototype.dongBoChiMuc = function (states) {
  var self = this, kho = this.kho;
  if (!states) states = kho.db.prepare('SELECT tk,state FROM dq ORDER BY tk').all().map(function (r) {
    return { tk: r.tk, st: JSON.parse(r.state) };
  });
  kho.giaoDich(function () { self._dongBoChiMucTrongGD(states); });
  return states.length;
};

/* Hạm đội của người khác đang bay tới hành tinh của tài khoản này.
   Không lộ đội hình — muốn biết địch mang gì thì phải do thám. */
TheGioi.prototype.hamDangToi = function (tk) {
  var now = Math.floor(Date.now() / 1000);
  var ds = this.kho.q.hdToi.all(tk, now - 30);
  var out = [];
  for (var i = 0; i < ds.length; i++) {
    var r = ds[i];
    out.push({
      id: r.tkA + ':' + r.fid, ten: r.tenA, lm: r.lmA || '',
      tu: r.tu, den: r.den, nv: r.nv, den_t: r.denT
    });
  }
  return out;
};

/* Chỉ host đang gọi /api/state mới nhận danh sách này. SQL đã lọc lại chủ
   toạ độ và liên minh hiện tại; đội hình không bao giờ xuất hiện ở API công
   khai bản đồ/xếp hạng nên người ngoài không thể dùng nó như báo cáo do thám. */
TheGioi.prototype.hamGiuTai = function (tk) {
  var now = Math.floor(Date.now() / 1000);
  /* Không recursively tick tài khoản đồng minh từ GET của host. Row đã tới
     checkpoint nhiên liệu nhưng scheduler chưa tua owner được ẩn bảo thủ cho
     tới khi projection được refresh; combat luôn nạp/tick nên không dùng gap. */
  var ds = this.kho.q.hgToi.all(tk, now, now, now), out = [];
  for (var i = 0; i < ds.length; i++) {
    var r = ds[i], n = this.nap(r.tkA);
    if (!n) continue;
    var f = null;
    for (var j = 0; j < n.st.fleets.length; j++)
      if (n.st.fleets[j].id === r.fid) { f = n.st.fleets[j]; break; }
    if (!f || f.mission !== 'hold' || f.pha !== 'giu' || G.tdKey(f.den) !== r.td ||
        Number(f.giuTaiTk) !== tk || Number(f.giuDen_t) <= now || Number(f.tiepNL_t) <= now) continue;
    out.push({
      id: r.tkA + ':' + r.fid, tk: r.tkA, fid: r.fid, ten: r.tenA, lm: r.lmA || '',
      tu: r.tu, den: r.td, giuLuc: r.giuLuc, giuDen_t: r.giuDenT, tiepNL_t: r.tiepNLT,
      ships: G.clone(f.ships), ta: r.tkA === tk
    });
  }
  return out;
};

/* Tua một đế quốc tới mốc `now` (mặc định: bây giờ) */
TheGioi.prototype.tick = function (tk, now, dl) {
  if (this.dangTick.has(tk)) return null;
  now = now || Math.floor(Date.now() / 1000);
  this.dangTick.add(tk);
  this.chuStack.push(tk);
  this.mocTick.push(now);
  this.batDau();
  var r = null, thanhCong = false;
  try {
    r = this.nap(tk);
    if (!r) { thanhCong = true; return null; }
    if (dl && dl.truoc) dl.truoc(r.st);
    G.tick(r.st, now);
    if (dl && dl.sau) dl.ketQua = dl.sau(r.st);
    this.luu(tk, r.st);
    thanhCong = true;
  } finally {
    this.mocTick.pop();
    this.chuStack.pop();
    this.dangTick.delete(tk);
    this.ketThuc(thanhCong);
  }
  return r && r.st;
};

/* Chạy một hành động của người chơi (server là bên quyết định) */
TheGioi.prototype.hanhDong = function (tk, ten, dl) {
  /* Phòng thủ lớp hai cho các lời gọi nội bộ: state server chỉ được trỏ tới
     một liên minh có thật. API công khai còn chặn hẳn lmvao ở lớp ngoài. */
  if (ten === 'lmvao') {
    var tenLM = String(dl && dl.ten || '').slice(0, 48);
    if (!this.kho.q.lmGet.get(tenLM)) {
      var hienTai = this.nap(tk);
      return { loi: 'Liên minh này không tồn tại.', st: hienTai ? hienTai.st : null };
    }
  }
  var loi = null, st = null;
  var kq = this.tick(tk, null, {
    sau: function (s) {
      st = s;
      loi = G.HANHDONG[ten] ? (G.HANHDONG[ten](s, dl || {}) || null) : 'Hành động không tồn tại.';
      return loi;
    }
  });
  if (!kq) return { loi: 'Đế quốc đang được xử lý, thử lại sau một nhịp.' };
  return { loi: loi, st: st };
};

/* ------------------------------------------------------------- PvP: tấn công */
TheGioi.prototype.danhNguoi = function (st, f, o, veNha) {
  var W = this, kho = this.kho;
  var dTk = Number(o.tk), aTk = this.chuHienTai(), tTran = Math.floor(st.now);

  /* Một DB latest-state không thể quay lại snapshot lịch sử. Mọi PvP due trong
     quãng offline được dời tới horizon CỐ ĐỊNH của tick request (không đọc
     Date.now() ở đây, tránh mốc chạy mãi qua ranh giới giây), rồi chính vòng
     G.tick hiện tại sẽ gặp lại fleet ở horizon và giải quyết một lần. */
  var horizon = this.mocTick.length ? Math.floor(Number(this.mocTick[this.mocTick.length - 1])) : tTran;
  if (isFinite(horizon) && horizon > tTran) { f.den_t = horizon; return; }

  var quyen = this.quyenDanh(aTk, dTk, st.now);
  if (!quyen.duoc) {
    G.tin(st, 'he', 'Cuộc tấn công bị Hội Đồng Bảo An chặn', quyen.loi + '\nHạm đội quay về.');
    veNha(null); return;
  }

  /* Snapshot ứng viên gồm cả hạm đã đậu và hạm hold tới không muộn hơn đúng
     giây giao chiến. Phải khoá TOÀN BỘ chủ hạm trước khi tua bất kỳ ai; nếu
     một người đang được request khác xử lý thì hoãn cả trận, không âm thầm bỏ
     qua quân hỗ trợ. Trong hợp đồng một process, đoạn từ đây tới finally không
     có await nên membership/ownership không thể chen ngang. */
  var can = new Set([dTk]), i, r;
  var daGiu = kho.q.hgCan.all(o.key);
  for (i = 0; i < daGiu.length; i++) if (daGiu[i].tkA !== aTk) can.add(daGiu[i].tkA);
  var sapDen = kho.q.hdGiuDen.all(o.key, tTran);
  for (i = 0; i < sapDen.length; i++) {
    r = sapDen[i];
    if (r.tkA !== aTk) can.add(r.tkA);
  }
  var ids = Array.from(can).sort(function (a, b) { return a - b; });
  for (i = 0; i < ids.length; i++) {
    if (this.dangTick.has(ids[i])) { f.den_t = st.now + 20; return; }
  }

  /* SQLite không giữ snapshot lịch sử. Nếu một bên đã authoritative-tick qua
     T, tuyệt đối không áp trận T lên state tương lai đó. Rebase hạm tấn công
     (vẫn pha `di`, chưa có side effect) tới mốc lớn nhất và để vòng G.tick
     thử lại trên một lát cắt thời gian đơn điệu. Đây là mitigation có chủ ý;
     event sourcing/global scheduler mới có thể tái dựng một support đã rời
     quỹ đạo và biến mất khỏi projection trước lúc attack được xử lý. */
  var mocDongBo = tTran;
  for (i = 0; i < ids.length; i++) {
    var xemTruoc = this.nap(ids[i]);
    var daToi = xemTruoc && Math.floor(Number(xemTruoc.st.lastTick));
    if (isFinite(daToi) && daToi > mocDongBo) mocDongBo = daToi;
  }
  if (mocDongBo > tTran) { f.den_t = mocDongBo; return; }

  var daKhoa = [], benD = new Map();
  try {
    /* Khoá trước, rồi tua/refuel/expiry theo thứ tự tk ổn định. Mỗi state chỉ
       được stage; SQLite COMMIT duy nhất diễn ra khi tick ngoài cùng kết thúc. */
    for (i = 0; i < ids.length; i++) {
      this.dangTick.add(ids[i]); daKhoa.push(ids[i]);
    }
    for (i = 0; i < ids.length; i++) {
      var idChu = ids[i], n = this.nap(idChu);
      if (!n) continue;
      this.chuStack.push(idChu);
      try { G.tick(n.st, tTran); }
      finally { this.chuStack.pop(); }
      this.luu(idChu, n.st);
      benD.set(idChu, n);
    }

    var d = benD.get(dTk);
    if (!d) { veNha(null); return; }

    var pi = -1;
    for (i = 0; i < d.st.planets.length; i++) if (G.tdKey(d.st.planets[i].c) === o.key) pi = i;
    if (pi < 0) {                       /* đối phương đã rời toạ độ này */
      G.tin(st, 'tt', 'Mục tiêu đã biến mất', G.tdStr(f.den) + ' không còn là hành tinh của ' + o.ten + '. Hạm đội quay về.');
      veNha(null); return;
    }
    var dp = d.st.planets[pi];

    /* bảo vệ người chơi mới: hai chiều */
    var diemA = G.diem(st).tong, diemD = G.diem(d.st).tong;
    var chan = null;
    if (diemD < G.C.BAO_VE_MOI_DIEM && diemA > diemD * G.C.BAO_VE_MOI_TY_LE)
      chan = 'Đối phương đang được bảo vệ người chơi mới (' + G.so(diemD) + ' điểm so với ' + G.so(diemA) + ' điểm của ta).';
    else if (diemA < G.C.BAO_VE_MOI_DIEM && diemD > diemA * G.C.BAO_VE_MOI_TY_LE)
      chan = 'Ta đang trong diện bảo vệ người chơi mới nên không được đánh đối thủ mạnh hơn ' + G.C.BAO_VE_MOI_TY_LE + ' lần.';
    if (chan) {
      G.tin(st, 'he', 'Cuộc tấn công bị chặn', chan + '\nHạm đội quay về.');
      veNha(null); return;
    }

    /* Sau khi tất cả state đã tới T, xác minh lại hook quyền đậu tại chính T.
       Hạm stale đổi chủ/rời liên minh lập tức mất eligibility và bắt đầu về. */
    var hoTro = [];
    benD.forEach(function (n2, tkChu) {
      for (var fi = 0; fi < n2.st.fleets.length; fi++) {
        var hf = n2.st.fleets[fi];
        if (hf.mission !== 'hold' || hf.pha !== 'giu' || G.tdKey(hf.den) !== o.key ||
            G.trong(hf.ships)) continue;
        var batDau = Number(hf.giuLuc), ket = Number(hf.giuDen_t);
        if (!isFinite(batDau) || !isFinite(ket) || batDau > tTran || tTran >= ket) continue;
        W.chuStack.push(tkChu);
        var loiGiu;
        try { loiGiu = G.kiemTraGiu(n2.st, hf); }
        finally { W.chuStack.pop(); }
        if (loiGiu) {
          G.batDauVe(n2.st, hf, true, 'Hạm đội #' + hf.id + ' rời quỹ đạo ' +
            G.tdStr(hf.den) + ': ' + loiGiu);
          W.luu(tkChu, n2.st);
          continue;
        }
        if (Number(hf.giuTaiTk) !== dTk) continue;
        hoTro.push({ tk: tkChu, fid: hf.id, st: n2.st, f: hf });
      }
    });
    hoTro.sort(function (a, b) {
      if (a.tk !== b.tk) return a.tk - b.tk;
      var af = Number(a.fid), bf = Number(b.fid);
      return isFinite(af) && isFinite(bf) ? af - bf : String(a.fid).localeCompare(String(b.fid));
    });

    var nhomTau = [{ ships: dp.ships, tech: d.st.tech }];
    for (i = 0; i < hoTro.length; i++)
      nhomTau.push({ ships: hoTro[i].f.ships, tech: hoTro[i].st.tech });

    var Ld = G.loaiHT(d.st, dp);
    var kq = G.danhTran(
      { ten: st.ten, tech: st.tech, ships: f.ships },
      { ten: o.ten + ' — ' + dp.ten, tech: d.st.tech, nhomTau: nhomTau, def: dp.def,
        thuDat: Ld.thuDat, loaiHT: Ld.ten },
      G.hash(f.id + ':' + st.now + ':' + o.key));

    f.ships = kq.conShipsA;
    dp.ships = kq.conNhomD[0] || {};
    dp.def = kq.conDefD;

    function tongMat(m) {
      var tong = 0;
      for (var id in (m || {})) tong += Math.max(0, Math.floor(Number(m[id]) || 0));
      return tong;
    }
    var matTheoChu = new Map(), matTauD = tongMat(kq.matNhomD[0]);
    matTheoChu.set(dTk, matTauD);
    for (i = 0; i < hoTro.length; i++) {
      var ht = hoTro[i], matH = tongMat(kq.matNhomD[i + 1]);
      ht.f.ships = kq.conNhomD[i + 1] || {};
      matTauD += matH;
      matTheoChu.set(ht.tk, (matTheoChu.get(ht.tk) || 0) + matH);
      if (G.trong(ht.f.ships)) G.xoaHam(ht.st, ht.f);
    }

    /* --- ĐỔ BỘ: quỹ đạo vỡ rồi mới thả Robot/Tank xuống phá công trình --- */
    var doBo = null;
    if (kq.kq === 'thang' && f.linh && !G.trong(f.linh)) {
      if (!dp.linh) dp.linh = {};
      var thuDatD = G.thuMatDat(dp.def);
      doBo = G.doBoXuong(st, f, {
        ten: o.ten + ' — ' + dp.ten, tech: d.st.tech, linh: dp.linh,
        def: thuDatD, thuDat: Ld.thuDat, p: dp
      });
      G.gopThuMatDat(dp.def, thuDatD);
      st.stats.doBo = (st.stats.doBo || 0) + 1;
    }

    /* cướp */
    var cuop = { metal: 0, crystal: 0, deut: 0, food: 0 };
    if (kq.kq === 'thang') {
      var tyLe = (doBo && doBo.thang) ? Math.min(0.85, G.C.CUOP_TOI_DA + G.C.CUOP_DO_BO) : G.C.CUOP_TOI_DA;
      cuop = G.chiaHang(dp.res, G.khoangHang(f.ships) - G.tongRes(f.cargo), tyLe);
      for (var rk in cuop) {
        dp.res[rk] -= cuop[rk];
        f.cargo[rk] = (f.cargo[rk] || 0) + cuop[rk];
      }
      st.stats.thang++; st.stats.cuop += G.tongRes(cuop);
      d.st.stats.thua++;
    } else {
      st.stats.thua++; d.st.stats.thang++;
    }

    /* phế liệu chung */
    var pl = G.pheLieu(st, o.key);
    pl.metal += kq.pheLieu.metal; pl.crystal += kq.pheLieu.crystal;

    /* Loss stats là số tàu canonical theo đúng owner/group. Không dùng matD
       aggregate (có cả công sự), và không nhân loss của attacker cho mỗi hạm
       hỗ trợ: host nhận kill-credit phòng thủ đúng một lần. */
    var matA = tongMat(kq.matA);
    st.stats.tauMat = (st.stats.tauMat || 0) + matA;
    st.stats.tauDietDich = (st.stats.tauDietDich || 0) + matTauD;
    matTheoChu.forEach(function (soMat, tkChu2) {
      var n3 = benD.get(tkChu2);
      if (n3) n3.st.stats.tauMat = (n3.st.stats.tauMat || 0) + soMat;
    });
    d.st.stats.tauDietDich = (d.st.stats.tauDietDich || 0) + matA;

    var tenTheoTk = new Map(), hoTroBC = [];
    for (i = 0; i < hoTro.length; i++) {
      var tkH = hoTro[i].tk;
      if (tkH === dTk || tenTheoTk.has(tkH)) continue;
      var trH = kho.q.tkTheoId.get(tkH);
      var tenH = trH ? trH.hienthi : hoTro[i].st.ten;
      tenTheoTk.set(tkH, tenH);
      hoTroBC.push({ tk: tkH, ten: tenH, mat: matTheoChu.get(tkH) || 0 });
    }

    /* Một báo cáo cho attacker, host và mỗi owner hỗ trợ (không nhân theo số
       fleet). `hoTro` chỉ mang metadata báo cáo, tàu vẫn ở conNhomD canonical. */
    G.tin(st, 'tran', 'Báo cáo chiến đấu ' + G.tdStr(f.den) + ' — ' + o.ten, null,
      { kq: kq, cuop: cuop, pl: kq.pheLieu, td: f.den, ben: 'ta', pvp: true,
        doiThu: o.ten, doBo: doBo, hoTro: hoTroBC });
    G.tin(d.st, 'tran', (doBo && doBo.thang ? 'BỊ ĐỔ BỘ tại ' : 'BỊ TẤN CÔNG tại ') + G.tdStr(dp.c) + ' — ' + st.ten, null,
      { kq: kq, cuop: cuop, pl: kq.pheLieu, td: dp.c, ben: 'dich', pvp: true,
        doiThu: st.ten, doBo: doBo, hoTro: hoTroBC });
    for (i = 0; i < hoTroBC.length; i++) {
      var bcH = hoTroBC[i], nH = benD.get(bcH.tk);
      if (!nH) continue;
      G.tin(nH.st, 'tran', 'Hỗ trợ phòng thủ tại ' + G.tdStr(dp.c) + ' — ' + st.ten, null,
        { kq: kq, cuop: cuop, pl: kq.pheLieu, td: dp.c, ben: 'hotro', pvp: true,
          doiThu: st.ten, chuNha: o.ten, mat: bcH.mat, doBo: doBo, hoTro: hoTroBC });
    }

    var now = Math.floor(Date.now() / 1000);
    this.ghiTran(now, aTk || null, dTk, o.key, kq.kq, Math.round(G.tongRes(cuop)), matA, matTauD);
    this.ghiBangTin(now, 'tran',
      st.ten + ' đánh ' + o.ten + ' tại ' + G.tdStr(f.den) + ' — ' +
      (kq.kq === 'thang' ? 'bên tấn công thắng, cướp ' + G.so(G.tongRes(cuop)) + ' tài nguyên'
        : (kq.kq === 'thua' ? 'bên phòng thủ đứng vững' : 'hai bên cầm cự')) +
      (doBo && doBo.thang && doBo.phaCT && (doBo.phaCT.soLuong || doBo.phaCT.soCap)
        ? ' — quân đổ bộ san phẳng ' + G.so(doBo.phaCT.soLuong || doBo.phaCT.soCap) + ' công trình' : ''));

    benD.forEach(function (n4, tkChu3) { W.luu(tkChu3, n4.st); });

    if (G.trong(f.ships)) { G.ghi(st, 'Hạm đội #' + f.id + ' bị xoá sổ tại ' + G.tdStr(f.den) + '.'); G.xoaHam(st, f); return; }
    veNha(null);
  } finally {
    for (var lk = daKhoa.length - 1; lk >= 0; lk--) this.dangTick.delete(daKhoa[lk]);
  }
};

/* ------------------------------------------------------------- PvP: do thám */
TheGioi.prototype.doThamNguoi = function (st, f, o) {
  var dTk = o.tk;
  if (this.dangTick.has(dTk)) { f.den_t = st.now + 20; return; }
  var d = this.nap(dTk);
  if (!d) return;

  this.dangTick.add(dTk);
  this.chuStack.push(dTk);
  try {
    G.tick(d.st, st.now);
    var pi = -1, i;
    for (i = 0; i < d.st.planets.length; i++) if (G.tdKey(d.st.planets[i].c) === o.key) pi = i;
    if (pi < 0) { this.luu(dTk, d.st); return; }
    var dp = d.st.planets[pi];

    var soTau = f.ships.probe || 1;
    var chenh = (st.tech.spy || 0) - (d.st.tech.spy || 0);
    var mucDo = Math.max(1, Math.min(5, 1 + Math.floor(chenh / 2) + Math.floor(Math.log(soTau + 1) / Math.log(3))));

    /* phản tình báo: Trung Tâm Tình Báo của đối phương bắn hạ tàu do thám */
    var banHa = Math.min(0.9, 0.05 * (dp.b.intel || 0) + 0.03 * Math.max(0, -chenh));
    var r = G.rng(G.hash('spy' + f.id + st.now + o.key));
    var mat = 0;
    for (i = 0; i < soTau; i++) if (r() < banHa) mat++;
    if (mat > 0) { f.ships.probe -= mat; if (!f.ships.probe) delete f.ships.probe; }

    var bc = {
      td: f.den, ten: o.ten, ht: dp.ten, lm: o.lm, diem: o.diem, bo: o.bo, mucDo: mucDo, mat: mat, pvp: true,
      res: { metal: Math.floor(dp.res.metal || 0), crystal: Math.floor(dp.res.crystal || 0), deut: Math.floor(dp.res.deut || 0), food: Math.floor(dp.res.food || 0) },
      ships: mucDo >= 2 ? G.clone(dp.ships) : null,
      /* [TÁI DỰNG] Dân số/ủng hộ/thuế là chỉ số do thám có nguồn; chọn mức
         tình báo 2 để báo cáo cấp thấp nhất vẫn không làm lộ chúng. */
      danSu: mucDo >= 2 && dp.danSu ? {
        population: Math.floor(dp.danSu.population || 0),
        supportBp: Math.floor(dp.danSu.supportBp || 0),
        taxBp: Math.floor(dp.danSu.taxBp || 0)
      } : null,
      def: mucDo >= 3 ? G.clone(dp.def) : null,
      tech: mucDo >= 4 ? G.clone(d.st.tech) : null,
      ct: mucDo >= 5 ? G.clone(dp.b) : null,
      ctMode: mucDo >= 5 ? 'quantity' : null,
      t: st.now
    };
    G.tin(st, 'tt', 'Báo cáo do thám ' + G.tdStr(f.den) + ' — ' + o.ten, null, { bc: bc });
    if (!st.spy) st.spy = {};
    st.spy[o.key] = bc;

    /* đối phương biết mình bị do thám */
    G.tin(d.st, 'tt', 'Bị do thám tại ' + G.tdStr(dp.c),
      st.ten + ' đã gửi ' + G.so(soTau) + ' tàu do thám tới ' + dp.ten + ' ' + G.tdStr(dp.c) + '.' +
      (mat > 0 ? '\nTrung Tâm Tình Báo bắn hạ được ' + mat + ' chiếc.' : '\nKhông bắn hạ được chiếc nào — nên nâng Trung Tâm Tình Báo.'));
    this.luu(dTk, d.st);
  } finally {
    this.chuStack.pop();
    this.dangTick.delete(dTk);
  }
};

/* ------------------------------------------------- tiếp tế người chơi khác */
TheGioi.prototype.tangNguoi = function (st, f, o, veNha) {
  var dTk = o.tk, aTk = this.chuHienTai();
  if (this.dangTick.has(dTk)) { f.den_t = st.now + 20; return; }
  if (G.trong(f.cargo)) {
    G.tin(st, 'ham', 'Không có gì để giao', 'Hạm đội #' + f.id + ' tới ' + G.tdStr(f.den) +
      ' nhưng khoang hàng trống. Quay về.');
    veNha(null); return;
  }
  var d = this.nap(dTk);
  if (!d) { veNha(null); return; }
  if (!this.laDongMinh(aTk, dTk)) {
    G.tin(st, 'ham', 'Tiếp tế bị Hội Đồng Bảo An chặn',
      'Chỉ thành viên cùng liên minh mới được chuyển tài nguyên cho nhau. Hàng được mang về.');
    veNha(null); return;
  }

  this.dangTick.add(dTk);
  this.chuStack.push(dTk);
  try {
    G.tick(d.st, st.now);
    var pi = -1, i;
    for (i = 0; i < d.st.planets.length; i++) if (G.tdKey(d.st.planets[i].c) === o.key) pi = i;
    if (pi < 0) {
      G.tin(st, 'ham', 'Không giao được hàng', G.tdStr(f.den) + ' không còn là hành tinh của ' + o.ten + '. Hàng được mang về.');
      this.luu(dTk, d.st); veNha(null); return;
    }
    var dp = d.st.planets[pi];
    var cap = G.dungTich(dp), k, nhan = {};
    for (k in f.cargo) {
      if (!f.cargo[k]) continue;
      /* kho bên nhận chỉ chứa tới 150% dung tích, phần dư bị trả lại */
      var tran = cap[k] * 1.5;
      var themDuoc = Math.max(0, Math.floor(tran - (dp.res[k] || 0)));
      var them = Math.min(f.cargo[k], themDuoc);
      if (them > 0) { dp.res[k] = (dp.res[k] || 0) + them; nhan[k] = them; f.cargo[k] -= them; }
    }
    if (G.trong(nhan)) {
      G.tin(st, 'ham', 'Kho bên nhận đã đầy', o.ten + ' không còn chỗ chứa. Hàng được mang về.');
    } else {
      G.tin(st, 'ham', 'Đã tiếp tế ' + o.ten,
        'Giao cho ' + o.ten + ' tại ' + G.tdStr(dp.c) + ':\n' + moTaRes(nhan) +
        (G.trong(f.cargo) ? '' : '\nPhần kho bên nhận không chứa nổi được mang về.'));
      G.tin(d.st, 'ham', 'Được tiếp tế từ ' + st.ten,
        st.ten + ' vừa chở tới ' + dp.ten + ' ' + G.tdStr(dp.c) + ':\n' + moTaRes(nhan));
      this.ghiBangTin(Math.floor(Date.now() / 1000), 'tiepte',
        st.ten + ' tiếp tế ' + G.so(G.tongRes(nhan)) + ' tài nguyên cho ' + o.ten + ' tại ' + G.tdStr(dp.c) + '.');
    }
    this.luu(dTk, d.st);
    veNha(null);
  } finally {
    this.chuStack.pop();
    this.dangTick.delete(dTk);
  }
};

function moTaRes(o) {
  var ra = [];
  for (var i = 0; i < G.RES.length; i++) {
    var r = G.RES[i];
    if (o[r.id]) ra.push('  ' + r.ten + ': ' + G.so(o[r.id]));
  }
  return ra.join('\n');
}

/* ------------------------------------------------------------- bảng xếp hạng */
TheGioi.prototype.xepHangCho = function (st, loai) {
  var cot = { tong: 'diem', ct: 'diemCT', nc: 'diemNC', ham: 'diemHam', thu: 'diemThu' };
  var c = cot[loai] || 'diem';
  var ds = this.kho.q.dqXepHang.all(200).slice();
  ds.sort(function (a, b) { return (b[c] || 0) - (a[c] || 0); });
  var out = [];
  for (var i = 0; i < ds.length; i++) {
    out.push({
      hang: i + 1, ten: ds[i].hienthi, lm: ds[i].lm || '',
      diem: ds[i][c] || 0, tong: ds[i].diem,
      ct: ds[i].diemCT, nc: ds[i].diemNC, ham: ds[i].diemHam, thu: ds[i].diemThu,
      ht: ds[i].soHT, ta: st && ds[i].hienthi === st.ten
    });
  }
  return out;
};

/* ------------------------------------------------------------------ xem hệ */
TheGioi.prototype.xemHe = function (tk, g, h) {
  g = Math.max(1, Math.min(G.C.SO_THIEN_HA, Math.floor(+g || 1)));
  h = Math.max(1, Math.min(G.C.SO_HE, Math.floor(+h || 1)));
  var r = this.nap(tk);
  if (!r) return { g: g, h: h, o: [] };

  this.chuStack.push(tk);
  this.batDau();
  var thanhCong = false;
  try {
    var now = Math.floor(Date.now() / 1000);
    var lmNguoiXem = r.row.lm ? this.kho.q.lmGet.get(r.row.lm) : null;
    var coQuyenTuyen = !r.row.lm || (!!lmNguoiXem && lmNguoiXem.chu === tk);
    var chuHT = {}, i;
    var rows = this.kho.q.htTrongHe.all(g + ':' + h + ':%');
    for (i = 0; i < rows.length; i++) chuHT[rows[i].td] = rows[i];
    var plRows = this.kho.q.plTrongHe.all(g + ':' + h + ':%'), plMap = {};
    for (i = 0; i < plRows.length; i++) plMap[plRows[i].td] = { metal: plRows[i].kl, crystal: plRows[i].tt };

    var out = [];
    for (var p = 1; p <= G.C.SO_HANH_TINH; p++) {
      var c = G.toaDo(g, h, p), td = G.tdKey(c), o;
      var row = chuHT[td];
      if (row && row.tk === tk) {
        var pi = -1;
        for (i = 0; i < r.st.planets.length; i++) if (G.tdKey(r.st.planets[i].c) === td) pi = i;
        o = { loai: 'toi', key: td, c: c, pi: pi, p: pi >= 0 ? r.st.planets[pi] : { ten: row.ten, c: c } };
      } else if (row) {
        var qc = this.quyenDanh(tk, row.tk, now);
        o = {
          loai: 'nguoi', key: td, c: c, tk: row.tk, htTen: row.ten, ten: row.hienthi,
          lm: row.lm || '', diem: row.diem, online: (now - row.vaoCuoi) < ONLINE,
          bo: (now - row.vaoCuoi) > CACH_LAU_MOI_VAO,
          chien: { trang: qc.trang, khi: qc.khi || null, hieuLuc: qc.hieuLuc || null,
            duoc: qc.duoc, coQuyenTuyen: coQuyenTuyen }
        };
      } else if (G.coNPC(r.st.seed, c)) {
        o = { loai: 'npc', key: td, c: c, npc: G.npc(r.st, c) };
      } else {
        o = { loai: 'trong', key: td, c: c };
      }
      o.debris = plMap[td] && (plMap[td].metal > 0 || plMap[td].crystal > 0) ? plMap[td] : null;
      out.push(o);
    }
    /* ô 16: vùng không gian sâu, chỉ nhận nhiệm vụ Thám Hiểm */
    out.push({ loai: 'sau', key: g + ':' + h + ':' + G.C.O_THAM_HIEM, c: G.toaDo(g, h, G.C.O_THAM_HIEM), debris: null });
    thanhCong = true;
    return { g: g, h: h, o: out };
  } finally {
    this.chuStack.pop();
    this.ketThuc(thanhCong);
  }
};

/* --------------------------------------------------------- tạo đế quốc mới */
TheGioi.prototype.oTrong = function (c) {
  if (this.kho.q.htGet.get(G.tdKey(c))) return false;
  return !G.coNPC(this.seed(), c);
};
TheGioi.prototype.timNha = function () {
  var seed = this.seed();
  var soNguoi = this.kho.q.htDem.get().n;
  /* trải người chơi ra dần theo số lượng: mỗi 8 người mở thêm một vùng hệ */
  var vung = 1 + Math.floor(soNguoi / 8);
  for (var thu = 0; thu < 4000; thu++) {
    var g = 1 + Math.floor(Math.random() * Math.min(G.C.SO_THIEN_HA, 1 + Math.floor(vung / 6)));
    var h = 1 + Math.floor(Math.random() * Math.min(G.C.SO_HE, 20 + vung * 6));
    var p = 4 + Math.floor(Math.random() * 9);
    var c = G.toaDo(g, h, p);
    if (this.oTrong(c)) return c;
  }
  for (var g2 = 1; g2 <= G.C.SO_THIEN_HA; g2++)
    for (var h2 = 1; h2 <= G.C.SO_HE; h2++)
      for (var p2 = 1; p2 <= G.C.SO_HANH_TINH; p2++) {
        var c2 = G.toaDo(g2, h2, p2);
        if (this.oTrong(c2)) return c2;
      }
  void seed;
  return null;
};

TheGioi.prototype.taoDeQuoc = function (tk, hienthi) {
  var nha = this.timNha();
  if (!nha) return { loi: 'Vũ trụ đã hết chỗ trống.' };
  var st = G.moiGame(hienthi, this.seed(), nha);
  G.tin(st, 'he', 'Vũ trụ này có người thật',
    'Đây là máy chủ nhiều người chơi: những hành tinh màu cam trên bản đồ là người chơi khác. ' +
    'Muốn đánh một chỉ huy phải tuyên chiến và chờ Hội Đồng Bảo An 24 giờ; chỉ đồng minh mới tiếp tế cho nhau. Dưới ' + G.so(G.C.BAO_VE_MOI_DIEM) +
    ' điểm thì ta được bảo vệ người chơi mới.\n\n' +
    'Chưa biết bắt đầu từ đâu thì mở màn HƯỚNG DẪN ở cuối menu bên trái.');
  var now = Math.floor(Date.now() / 1000);
  var kho = this.kho;
  var dd0 = G.diem(st);
  var ke = G.sukienKe(st);
  if (!isFinite(ke)) ke = now + 3600;
  kho.giaoDich(function () {
    kho.q.dqThem.run(tk, JSON.stringify(st), Math.round(dd0.tong), Math.round(dd0.ct), Math.round(dd0.nc),
      Math.round(dd0.ham), Math.round(dd0.thu), st.lastTick, Math.round(Math.min(ke, now + 3600)), null, st.planets.length, now);
    for (var i = 0; i < st.planets.length; i++)
      kho.q.htThem.run(G.tdKey(st.planets[i].c), tk, st.planets[i].ten, i, st.planets[i].thuDo ? 1 : 0);
    kho.q.btThem.run(now, 'tk', hienthi + ' vừa nhận quyền chỉ huy hành tinh tại ' + G.tdStr(nha) + '.');
  });
  return { st: st, nha: nha };
};

/* --------------------------------------------- tên lửa bắn người chơi khác */
TheGioi.prototype.tenLuaNguoi = function (st, tl, o) {
  var dTk = o.tk, aTk = this.chuHienTai();
  var quyen = this.quyenDanh(aTk, dTk, st.now);
  if (!quyen.duoc) {
    G.tin(st, 'he', 'Tên lửa bị Hội Đồng Bảo An vô hiệu hóa',
      quyen.loi + '\n' + tl.n + ' quả không được phép đánh mục tiêu và đã tự hủy.');
    return;
  }
  if (this.dangTick.has(dTk)) { tl.khi = st.now + 20; st.tenLua.push(tl); return; }
  var d = this.nap(dTk);
  if (!d) return;

  this.dangTick.add(dTk);
  this.chuStack.push(dTk);
  try {
    G.tick(d.st, st.now);
    var pi = -1, i;
    for (i = 0; i < d.st.planets.length; i++) if (G.tdKey(d.st.planets[i].c) === o.key) pi = i;
    if (pi < 0) {
      G.tin(st, 'he', 'Tên lửa bắn trượt', G.tdStr(tl.den) + ' không còn là hành tinh của ' + o.ten + '.');
      this.luu(dTk, d.st); return;
    }
    var dp = d.st.planets[pi];
    var soChan = dp.mis.interceptor || 0;
    var kq = G.noTenLua(tl.n, dp.def, soChan, st.tech, d.st.tech, G.hash('tl' + tl.id + st.now + o.key));
    if (kq.chan > 0) {
      dp.mis.interceptor -= kq.chan;
      if (!dp.mis.interceptor) delete dp.mis.interceptor;
    }

    G.tin(st, 'tran', 'Kết quả bắn tên lửa ' + G.tdStr(tl.den) + ' — ' + o.ten, null,
      { tl: kq, soBan: tl.n, td: tl.den, ten: o.ten, ben: 'ta', pvp: true });
    G.tin(d.st, 'tran', 'BỊ BẮN TÊN LỬA tại ' + G.tdStr(dp.c) + ' — ' + st.ten, null,
      { tl: kq, soBan: tl.n, td: dp.c, ten: st.ten, ben: 'dich', pvp: true });

    var now = Math.floor(Date.now() / 1000);
    var soPha = 0; for (var k in kq.pha) soPha += kq.pha[k];
    this.ghiBangTin(now, 'tran', st.ten + ' bắn ' + tl.n + ' tên lửa vào ' + o.ten + ' tại ' +
      G.tdStr(tl.den) + ' — chặn được ' + kq.chan + ', phá ' + G.so(soPha) + ' công trình phòng thủ.');
    this.luu(dTk, d.st);
  } finally {
    this.chuStack.pop();
    this.dangTick.delete(dTk);
  }
};

/* ------------------------------------------------------- xoá tài khoản */
TheGioi.prototype.xoaTaiKhoan = function (tk, tenHienThi) {
  if (this.dangTick.has(tk)) return 'Đế quốc đang được xử lý, thử lại sau một nhịp.';
  var kho = this.kho, now = Math.floor(Date.now() / 1000);
  kho.giaoDich(function () {
    /* Chủ liên minh rời game thì chuyển quyền cho thành viên mạnh nhất còn lại,
       tránh để lm.chu trỏ tới một tài khoản đã biến mất. */
    var lmChu = kho.q.lmCuaChu.get(tk), lmGiaiTan = null;
    if (lmChu) {
      var keNhi = kho.q.lmKeNhi.get(lmChu.ten, tk);
      if (keNhi) {
        kho.q.lmDoiChu.run(keNhi.tk, lmChu.ten);
        var chuMoi = kho.q.tkTheoId.get(keNhi.tk);
        kho.q.btThem.run(now, 'lm', (chuMoi ? chuMoi.hienthi : 'Một thành viên') +
          ' tiếp quản ' + lmChu.ten + ' sau khi chủ cũ rời vũ trụ.');
      } else lmGiaiTan = lmChu.ten;
    }
    /* ht / hamdang / dq / phien có ON DELETE CASCADE nên xoá theo;
       bảng tran giữ lại lịch sử để đối thủ vẫn tra được trận cũ. */
    kho.q.phienXoaCua.run(tk);
    kho.q.tkXoa.run(tk);
    if (lmGiaiTan) kho.q.chatLMXoa.run(lmGiaiTan);
    kho.q.lmDonRong.run();
    kho.q.btThem.run(now, 'tk', tenHienThi + ' đã rời khỏi vũ trụ, các hành tinh trở về trạng thái trống.');
  });
  return null;
};

/* --------------------------------------------------------- thư người chơi */
TheGioi.prototype.guiThu = function (tkGui, tenGui, denAi, noi) {
  noi = String(noi || '').replace(/\r/g, '').slice(0, 1200).trim();
  if (!noi) return 'Thư trống.';
  var nhan = null;
  if (/^\d+$/.test(String(denAi))) nhan = this.kho.q.tkTheoId.get(Math.floor(+denAi));
  if (!nhan) nhan = this.kho.q.tkTheoHienThi.get(String(denAi || '').trim());
  if (!nhan) return 'Không tìm thấy người chơi này.';
  if (nhan.id === tkGui) return 'Không gửi thư cho chính mình.';
  if (this.dangTick.has(nhan.id)) return 'Người nhận đang được xử lý, thử lại sau một nhịp.';

  var d = this.nap(nhan.id);
  if (!d) return 'Người nhận chưa có đế quốc.';
  this.dangTick.add(nhan.id);
  this.chuStack.push(nhan.id);
  try {
    G.tick(d.st, Math.floor(Date.now() / 1000));
    G.tin(d.st, 'thu', 'Thư từ ' + tenGui, noi);
    this.luu(nhan.id, d.st);
  } finally {
    this.chuStack.pop();
    this.dangTick.delete(nhan.id);
  }
  return null;
};

/* ----------------------------------------------------------- tuyên chiến */
TheGioi.prototype.tuyenChien = function (tkA, tkD) {
  tkD = Math.floor(+tkD);
  if (!Number.isSafeInteger(tkD) || tkD < 1) return 'Chỉ huy mục tiêu không hợp lệ.';
  if (tkA === tkD) return 'Không thể tuyên chiến với chính mình.';
  var kho = this.kho;
  var a = kho.q.dqGet.get(tkA), d = kho.q.dqGet.get(tkD), tenD = kho.q.tkTheoId.get(tkD);
  if (!a || !d || !tenD) return 'Chỉ huy mục tiêu không còn trong vũ trụ.';
  if (a.lm && d.lm && a.lm === d.lm) return 'Không thể tuyên chiến với thành viên cùng liên minh.';

  var now = Math.floor(Date.now() / 1000), ben;
  if (a.lm) {
    var lm = kho.q.lmGet.get(a.lm);
    if (!lm || lm.chu !== tkA) return 'Chỉ chủ liên minh mới được đặt lệnh chiến tranh.';
    if (kho.q.chienGetLM.get(a.lm, tkD)) return 'Liên minh đã tuyên chiến với chỉ huy này.';
    kho.q.chienThemLM.run(a.lm, tkD, now);
    ben = a.lm;
  } else {
    /* [TÁI DỰNG] Nguồn xác nhận mục tiêu cá nhân nhưng không mô tả người chơi
       vô liên minh. Cho họ tự ra lệnh để luật không khóa PvP của người chơi lẻ. */
    if (kho.q.chienGetTK.get(tkA, tkD)) return 'Ta đã tuyên chiến với chỉ huy này.';
    kho.q.chienThemTK.run(tkA, tkD, now);
    var tenA = kho.q.tkTheoId.get(tkA);
    ben = tenA ? tenA.hienthi : 'Một chỉ huy';
  }
  kho.q.btThem.run(now, 'chien', ben + ' tuyên chiến với ' + tenD.hienthi +
    '; Hội Đồng Bảo An sẽ cho phép giao chiến sau 24 giờ.');

  /* Tin riêng giúp bên bị tuyên có đủ đúng 24 giờ chuẩn bị. Nếu state đang
     được xử lý ở request khác thì bảng tin và danh sách chiến tranh vẫn là
     nguồn thông báo bền vững, không tranh khóa để chèn tin bằng mọi giá.
     Đây là side effect best-effort: chiến tranh đã được ghi trước đó nên lỗi
     đọc/lưu hộp thư không được biến response thành thất bại giả. */
  if (!this.dangTick.has(tkD)) {
    try {
      var nd = this.nap(tkD);
      if (nd) {
        this.dangTick.add(tkD); this.chuStack.push(tkD);
        try {
          G.tick(nd.st, now);
          G.tin(nd.st, 'canh', 'BỊ TUYÊN CHIẾN bởi ' + ben,
            'Lệnh được đặt lúc ' + G.gio(now * 1000) + '. Sau 24 giờ, ' + ben +
            ' được phép tấn công các hành tinh của ta.');
          this.luu(tkD, nd.st);
        } finally {
          this.chuStack.pop(); this.dangTick.delete(tkD);
        }
      }
    } catch (e) { /* bảng chiến + bảng tin chung vẫn là nguồn sự thật */ }
  }
  return null;
};

TheGioi.prototype.chienCua = function (tk) {
  var dq = this.kho.q.dqGet.get(tk), now = Math.floor(Date.now() / 1000), self = this;
  var ra = dq && dq.lm ? this.kho.q.chienTheoLM.all(dq.lm) : this.kho.q.chienTheoTK.all(tk);
  var di = ra.map(function (r) {
    var q = self.quyenDanh(tk, r.tkD, now);
    return { id: r.id, tkD: r.tkD, tenD: r.tenD, lmD: r.lmD || '', khi: r.khi,
      hieuLuc: r.khi + CHIEN_CHO, trang: q.trang, duoc: q.duoc };
  });
  var den = this.kho.q.chienToi.all(tk).map(function (r) {
    var cungLM = !!(dq && dq.lm && (r.lmA === dq.lm || r.lmTkA === dq.lm));
    var caNhanDaVaoLM = !!(r.tkA && r.lmTkA);
    var trang = cungLM ? 'dongminh' : (caNhanDaVaoLM ? 'dinhchi' :
      (now >= r.khi + CHIEN_CHO ? 'hieuluc' : 'cho'));
    return { id: r.id, ben: r.lmA || r.tenA || 'Một chỉ huy', khi: r.khi,
      hieuLuc: r.khi + CHIEN_CHO, trang: trang, duoc: trang === 'hieuluc' };
  });
  return { di: di, den: den, cho: CHIEN_CHO };
};

/* Nguồn 2006 xác nhận chỉ thành viên cùng liên minh mới được chuyển tiền cho
   nhau. Galana nằm ở cấp đế quốc nên giao dịch được ghi atomically vào hai
   state JSON sau khi cả hai đã được tua tới cùng một thời điểm. */
TheGioi.prototype.chuyenGalana = function (tkA, tkD, so) {
  tkD = Math.floor(+tkD); so = Math.floor(+so);
  if (!Number.isSafeInteger(tkD) || tkD < 1 || tkD === tkA) return 'Người nhận không hợp lệ.';
  if (!Number.isSafeInteger(so) || so < 1 || so > 1000000000000)
    return 'Số Galana phải từ 1 tới 1.000.000.000.000.';
  if (!this.laDongMinh(tkA, tkD)) return 'Chỉ được chuyển Galana cho thành viên cùng liên minh.';
  if (this.dangTick.has(tkA) || this.dangTick.has(tkD)) return 'Một trong hai đế quốc đang được xử lý, thử lại sau một nhịp.';

  var now = Math.floor(Date.now() / 1000);
  if (!this.tick(tkA, now) || !this.tick(tkD, now)) return 'Không nạp được một trong hai đế quốc.';
  /* Thành viên có thể vừa bị loại/rời trong một request sát cạnh; xác nhận lại
     sau hai lần tick, ngay trước lúc ghi tiền. */
  if (!this.laDongMinh(tkA, tkD)) return 'Quan hệ liên minh đã thay đổi; giao dịch bị hủy.';
  var a = this.nap(tkA), d = this.nap(tkD);
  if (!a || !d) return 'Không nạp được một trong hai đế quốc.';
  if ((a.st.galana || 0) < so) return 'Không đủ Galana để chuyển.';
  var tenA = this.kho.q.tkTheoId.get(tkA), tenD = this.kho.q.tkTheoId.get(tkD);
  a.st.galana -= so; d.st.galana = (d.st.galana || 0) + so;
  G.tin(a.st, 'lm', 'Đã chuyển Galana cho ' + (tenD ? tenD.hienthi : 'đồng minh'),
    'Đã chuyển ' + G.so(so) + ' Galana trong nội bộ liên minh.');
  G.tin(d.st, 'lm', 'Nhận Galana từ ' + (tenA ? tenA.hienthi : 'đồng minh'),
    'Đã nhận ' + G.so(so) + ' Galana trong nội bộ liên minh.');
  var kho = this.kho;
  kho.giaoDich(function () {
    kho.q.dqLuuState.run(JSON.stringify(a.st), now, tkA);
    kho.q.dqLuuState.run(JSON.stringify(d.st), now, tkD);
    kho.q.btThem.run(now, 'tiepte', (tenA ? tenA.hienthi : 'Một chỉ huy') + ' chuyển ' +
      G.so(so) + ' Galana cho ' + (tenD ? tenD.hienthi : 'một đồng minh') + '.');
  });
  return null;
};

/* --------------------------------------------------------------- liên minh */
TheGioi.prototype.lmDS = function () {
  return this.kho.q.lmDS.all().map(function (r) {
    return { ten: r.ten, tag: r.tag, sl: r.sl, diem: r.diem, chu: r.chu, mota: r.mota || '' };
  });
};
TheGioi.prototype.lmTao = function (tk, ten, tag) {
  function thatBai(loi, ma, st) { return { loi: loi, ma: ma || 400, st: st || null }; }
  var dq = this.kho.q.dqGet.get(tk);
  if (!dq) return thatBai('Đế quốc không tồn tại.');
  if (dq.lm) return thatBai('Phải rời liên minh hiện tại trước khi lập liên minh mới.');
  ten = String(ten || '').trim().slice(0, 32).trim();
  tag = String(tag || '').trim().slice(0, 6).toUpperCase();
  if (ten.length < 3) return thatBai('Tên liên minh phải từ 3 ký tự.');
  if (!/^[A-Z0-9]{2,6}$/.test(tag)) return thatBai('Thẻ liên minh phải là 2–6 chữ/số.');
  var day = '[' + tag + '] ' + ten;
  if (this.kho.q.lmGet.get(day)) return thatBai('Liên minh này đã tồn tại.');
  if (this.kho.q.lmTheoTag.get(tag)) return thatBai('Thẻ ' + tag + ' đã có liên minh khác dùng.');
  /* tránh trùng tên với các liên minh NPC đang hiện trên bản đồ */
  for (var i = 0; i < G.LIEN_MINH.length; i++) {
    if (!G.LIEN_MINH[i]) continue;
    if (G.LIEN_MINH[i].toLowerCase() === day.toLowerCase()) return thatBai('Tên này đã có liên minh NPC dùng, chọn tên khác.');
    if (G.LIEN_MINH[i].indexOf('[' + tag + ']') === 0) return thatBai('Thẻ ' + tag + ' đã có liên minh NPC dùng, chọn thẻ khác.');
  }
  var now = Math.floor(Date.now() / 1000), kho = this.kho;
  kho.q.lmThem.run(day, tag, tk, now, null);
  /* Dùng chính chuỗi canonical vừa tạo; tuyệt đối không dựng lại từ body API
     vì trim/slice khác thứ tự từng cho phép gia nhập nhầm liên minh có sẵn. */
  var kq;
  try { kq = this.hanhDong(tk, 'lmvao', { ten: day }); }
  catch (e) {
    /* `hanhDong` lưu đế quốc trước khi `ketThuc` ghi bộ đệm NPC/phế liệu.
       Nếu bước dọn bộ đệm hiếm hoi đó lỗi thì tư cách thành viên đã bền vững;
       không được xoá liên minh và để dq.lm trỏ tới một hàng không còn tồn tại. */
    var dqSauLoi = kho.q.dqGet.get(tk);
    if (!dqSauLoi || dqSauLoi.lm !== day) kho.q.lmXoa.run(day);
    throw e;
  }
  if (!kq.st || kq.loi) {
    kho.q.lmXoa.run(day);
    return thatBai(kq.loi || 'Server đang xử lý, thử lại.', kq.st ? 400 : 503, kq.st);
  }
  kho.q.lmXinXoaCua.run(tk);
  kho.q.btThem.run(now, 'lm', 'Liên minh ' + day + ' được thành lập.');
  return { loi: null, st: kq.st, ten: day };
};
TheGioi.prototype.lmThanhVien = function (ten, tk) {
  var lm = this.kho.q.lmGet.get(ten);
  return this.kho.q.dqTheoLM.all(ten).map(function (r) {
    return { tk: r.tk, ten: r.hienthi, diem: r.diem, ht: r.soHT,
      ta: r.tk === tk, chu: !!lm && r.tk === lm.chu };
  });
};

TheGioi.prototype.lmXin = function (tk, ten) {
  ten = String(ten || '').slice(0, 48);
  var dq = this.kho.q.dqGet.get(tk);
  if (!dq) return 'Đế quốc không tồn tại.';
  if (dq.lm) return 'Đang ở trong một liên minh khác.';
  if (!this.kho.q.lmGet.get(ten)) return 'Liên minh này không tồn tại.';
  if (this.kho.q.lmXinGet.get(ten, tk)) return 'Đã gửi đơn tới liên minh này rồi.';
  this.kho.q.lmXinThem.run(ten, tk, Math.floor(Date.now() / 1000));
  return null;
};

TheGioi.prototype.lmDuyet = function (chu, ungVien, chapNhan) {
  ungVien = Math.floor(+ungVien);
  if (!Number.isSafeInteger(ungVien) || ungVien < 1) return 'Người chơi không hợp lệ.';
  var lm = this.kho.q.lmCuaChu.get(chu);
  if (!lm) return 'Chỉ chủ liên minh mới duyệt được thành viên.';
  var don = this.kho.q.lmXinGet.get(lm.ten, ungVien);
  if (!don) return 'Đơn xin này không còn tồn tại.';
  var tk = this.kho.q.tkTheoId.get(ungVien);
  if (!chapNhan) {
    this.kho.q.lmXinXoa.run(lm.ten, ungVien);
    return null;
  }
  var dq = this.kho.q.dqGet.get(ungVien);
  if (!tk || !dq) {
    this.kho.q.lmXinXoa.run(lm.ten, ungVien);
    return 'Người xin gia nhập không còn trong vũ trụ.';
  }
  if (dq.lm) {
    this.kho.q.lmXinXoaCua.run(ungVien);
    return 'Người này đã vào một liên minh khác.';
  }
  var kq = this.hanhDong(ungVien, 'lmvao', { ten: lm.ten });
  if (!kq.st || kq.loi) return kq.loi || 'Không thể cập nhật đế quốc của người xin vào.';
  this.kho.q.lmXinXoaCua.run(ungVien);
  this.kho.q.btThem.run(Math.floor(Date.now() / 1000), 'lm', tk.hienthi + ' được duyệt vào ' + lm.ten + '.');
  return null;
};

TheGioi.prototype.lmDuoi = function (chu, thanhVien) {
  thanhVien = Math.floor(+thanhVien);
  if (!Number.isSafeInteger(thanhVien) || thanhVien < 1) return 'Người chơi không hợp lệ.';
  var lm = this.kho.q.lmCuaChu.get(chu);
  if (!lm) return 'Chỉ chủ liên minh mới loại được thành viên.';
  if (thanhVien === chu) return 'Không thể tự loại mình; hãy chuyển quyền chủ trước.';
  var dq = this.kho.q.dqGet.get(thanhVien);
  if (!dq || dq.lm !== lm.ten) return 'Người này không còn trong liên minh.';
  var tk = this.kho.q.tkTheoId.get(thanhVien);
  var kq = this.hanhDong(thanhVien, 'lmra', {});
  if (!kq.st || kq.loi) return kq.loi || 'Không thể cập nhật thành viên.';
  this.kho.q.btThem.run(Math.floor(Date.now() / 1000), 'lm',
    (tk ? tk.hienthi : 'Một thành viên') + ' bị loại khỏi ' + lm.ten + '.');
  return null;
};

TheGioi.prototype.lmChuyenChu = function (chu, thanhVien) {
  thanhVien = Math.floor(+thanhVien);
  if (!Number.isSafeInteger(thanhVien) || thanhVien < 1) return 'Người chơi không hợp lệ.';
  var lm = this.kho.q.lmCuaChu.get(chu);
  if (!lm) return 'Chỉ chủ liên minh mới chuyển được quyền chủ.';
  if (thanhVien === chu) return 'Người này đã là chủ liên minh.';
  var dq = this.kho.q.dqGet.get(thanhVien);
  if (!dq || dq.lm !== lm.ten) return 'Chỉ chuyển quyền cho thành viên cùng liên minh.';
  var tk = this.kho.q.tkTheoId.get(thanhVien);
  this.kho.q.lmDoiChu.run(thanhVien, lm.ten);
  this.kho.q.btThem.run(Math.floor(Date.now() / 1000), 'lm',
    (tk ? tk.hienthi : 'Một thành viên') + ' trở thành chủ mới của ' + lm.ten + '.');
  return null;
};

TheGioi.prototype.lmRa = function (tk) {
  var dq = this.kho.q.dqGet.get(tk);
  var lm = dq && dq.lm ? this.kho.q.lmGet.get(dq.lm) : null;
  if (lm && lm.chu === tk && this.kho.q.dqTheoLM.all(lm.ten).length > 1) {
    var d = this.nap(tk);
    return { loi: 'Chủ liên minh phải chuyển quyền trước khi rời.', st: d ? d.st : null };
  }
  var kq = this.hanhDong(tk, 'lmra', {});
  if (kq.st && !kq.loi) {
    this.kho.q.lmXinXoaCua.run(tk);
    if (lm && this.kho.q.dqTheoLM.all(lm.ten).length === 0) this.kho.q.chatLMXoa.run(lm.ten);
    this.kho.q.lmDonRong.run();
    if (lm) {
      var nguoi = this.kho.q.tkTheoId.get(tk);
      this.kho.q.btThem.run(Math.floor(Date.now() / 1000), 'lm',
        (nguoi ? nguoi.hienthi : 'Một thành viên') + ' rời ' + lm.ten + '.');
    }
  }
  return kq;
};

/* --------------------------------------------------------- vòng lặp scheduler */
TheGioi.prototype.nhip = function (toiDa) {
  var now = Math.floor(Date.now() / 1000);
  var ds = this.kho.q.dqDenHan.all(now, toiDa || 60);
  var n = 0;
  for (var i = 0; i < ds.length; i++) {
    try { if (this.tick(ds[i].tk, now)) n++; }
    catch (e) { console.error('[nhip] lỗi khi tua đế quốc', ds[i].tk, e && e.message); }
  }
  return n;
};

module.exports = { TheGioi: TheGioi, G: G };
