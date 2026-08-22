/* THIÊN HÀ ĐẠI CHIẾN — thế giới dùng chung (server là bên quyết định)
 * Nhiệm vụ:
 *   - nạp/lưu đế quốc của từng tài khoản (state JSON trong SQLite)
 *   - tua thời gian cho đế quốc, xử lý sự kiện tới hạn
 *   - đấu PvP thật giữa hai tài khoản: tua cả hai bên tới mốc hạm đội tới,
 *     đánh nhau, cướp tài nguyên, ghi báo cáo cho cả hai
 *   - NPC và bãi phế liệu là TÀI SẢN CHUNG của server (bảng npc / pl)      */
'use strict';
var G = require('./rules.js').G;

var CACH_LAU_MOI_VAO = 7 * 86400;   // quá 7 ngày không vào -> hiện "lâu không vào"
var ONLINE = 300;                   // 5 phút

function TheGioi(kho) {
  this.kho = kho;
  this.dangTick = new Set();
  this.chuStack = [];
  this.ctx = null;
  this.sau = 0;
  this._seed = null;
  G.HOOK = this.veHook();
}

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

/* -------------------------------------------------- bộ đệm NPC & phế liệu */
TheGioi.prototype.batDau = function () {
  if (!this.ctx) this.ctx = { npc: new Map(), npcBan: new Set(), pl: new Map(), plBan: new Set() };
  this.sau++;
};
TheGioi.prototype.ketThuc = function () {
  if (--this.sau > 0) return;
  var c = this.ctx; this.ctx = null;
  if (!c) return;
  var kho = this.kho, now = Math.floor(Date.now() / 1000);
  var self = this;
  kho.giaoDich(function () {
    c.npcBan.forEach(function (k) {
      var n = c.npc.get(k);
      if (n) kho.q.npcSet.run(k, JSON.stringify(n), now);
    });
    c.plBan.forEach(function (td) {
      var p = c.pl.get(td);
      if (p) kho.q.plSet.run(td, Math.max(0, p.metal || 0), Math.max(0, p.crystal || 0));
    });
  });
  void self;
};

TheGioi.prototype.npcLay = function (key) {
  this.batDau();
  var c = this.ctx;
  if (c.npc.has(key)) { c.npcBan.add(key); this.ketThuc(); return c.npc.get(key); }
  var r = this.kho.q.npcGet.get(key);
  var n = null;
  if (r) { try { n = JSON.parse(r.data); } catch (e) { n = null; } }
  if (n) { c.npc.set(key, n); c.npcBan.add(key); }
  this.ketThuc();
  return n;
};
TheGioi.prototype.npcGhi = function (n) {
  this.batDau();
  this.ctx.npc.set(n.key, n);
  this.ctx.npcBan.add(n.key);
  this.ketThuc();
};
TheGioi.prototype.plLay = function (td) {
  this.batDau();
  var c = this.ctx;
  if (!c.pl.has(td)) {
    var r = this.kho.q.plGet.get(td);
    c.pl.set(td, { metal: r ? r.kl : 0, crystal: r ? r.tt : 0 });
  }
  c.plBan.add(td);
  var o = c.pl.get(td);
  this.ketThuc();
  return o;
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
    danhNguoi: function (st, f, o, veNha) { W.danhNguoi(st, f, o, veNha); },
    doThamNguoi: function (st, f, o) { W.doThamNguoi(st, f, o); },
    tangNguoi: function (st, f, o, veNha) { W.tangNguoi(st, f, o, veNha); }
  };
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
  var r = this.kho.q.dqGet.get(tk);
  if (!r) return null;
  var st;
  try { st = JSON.parse(r.state); } catch (e) { return null; }
  st.npc = {}; st.debris = {};        // hai thứ này là của chung, không giữ trong state
  return { row: r, st: st };
};

TheGioi.prototype.luu = function (tk, st) {
  var kho = this.kho;
  var now = Math.floor(Date.now() / 1000);
  var diem = Math.round(G.diem(st).tong);
  var ke = G.sukienKe(st);
  if (!isFinite(ke)) ke = st.lastTick + 3600;
  ke = Math.min(ke, st.lastTick + 3600);           // tick định kỳ ít nhất 1 giờ/lần
  st.npc = {}; st.debris = {};
  var js = JSON.stringify(st);
  var self = this;
  kho.giaoDich(function () {
    kho.q.dqLuu.run(js, diem, st.lastTick, Math.round(ke), st.lm ? st.lm.ten : null, st.planets.length, now, tk);
    kho.q.htXoaCua.run(tk);
    for (var i = 0; i < st.planets.length; i++) {
      var p = st.planets[i];
      kho.q.htThem.run(G.tdKey(p.c), tk, p.ten, i, p.thuDo ? 1 : 0);
    }
    /* chỉ mục hạm đội đang bay tới người khác, để họ được báo động trước */
    kho.q.hdXoaCua.run(tk);
    for (var j = 0; j < st.fleets.length; j++) {
      var f = st.fleets[j];
      if (f.pha !== 'di') continue;
      if (f.mission !== 'attack' && f.mission !== 'transport') continue;   // do thám vẫn là đi lén
      var chu = kho.q.htGet.get(G.tdKey(f.den));
      if (!chu || chu.tk === tk) continue;
      kho.q.hdThem.run(tk, f.id, chu.tk, G.tdKey(f.tu), G.tdKey(f.den), f.mission,
        Math.round(f.den_t), st.ten, st.lm ? st.lm.ten : null);
    }
  });
  void self;
  return diem;
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

/* Tua một đế quốc tới mốc `now` (mặc định: bây giờ) */
TheGioi.prototype.tick = function (tk, now, dl) {
  if (this.dangTick.has(tk)) return null;
  now = now || Math.floor(Date.now() / 1000);
  var r = this.nap(tk);
  if (!r) return null;
  this.dangTick.add(tk);
  this.chuStack.push(tk);
  this.batDau();
  try {
    if (dl && dl.truoc) dl.truoc(r.st);
    G.tick(r.st, now);
    if (dl && dl.sau) dl.ketQua = dl.sau(r.st);
    this.luu(tk, r.st);
  } finally {
    this.chuStack.pop();
    this.dangTick.delete(tk);
    this.ketThuc();
  }
  return r.st;
};

/* Chạy một hành động của người chơi (server là bên quyết định) */
TheGioi.prototype.hanhDong = function (tk, ten, dl) {
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
  var dTk = o.tk;

  /* đang xử lý đế quốc kia (đệ quy) -> hoãn 20 giây, hạm đội vẫn bay */
  if (this.dangTick.has(dTk)) { f.den_t = st.now + 20; return; }

  var d = this.nap(dTk);
  if (!d) { veNha(null); return; }

  this.dangTick.add(dTk);
  this.chuStack.push(dTk);
  try {
    G.tick(d.st, st.now);

    var pi = -1;
    for (var i = 0; i < d.st.planets.length; i++) if (G.tdKey(d.st.planets[i].c) === o.key) pi = i;
    if (pi < 0) {                       /* đối phương đã rời toạ độ này */
      G.tin(st, 'tt', 'Mục tiêu đã biến mất', G.tdStr(f.den) + ' không còn là hành tinh của ' + o.ten + '. Hạm đội quay về.');
      this.luu(dTk, d.st);
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
      this.luu(dTk, d.st);
      veNha(null); return;
    }

    var kq = G.danhTran(
      { ten: st.ten, tech: st.tech, ships: f.ships },
      { ten: o.ten + ' — ' + dp.ten, tech: d.st.tech, ships: dp.ships, def: dp.def },
      G.hash(f.id + ':' + st.now + ':' + o.key));

    f.ships = kq.conShipsA;
    dp.ships = kq.conShipsD;
    dp.def = kq.conDefD;

    /* cướp */
    var cuop = { metal: 0, crystal: 0, deut: 0, food: 0 };
    if (kq.kq === 'thang') {
      cuop = G.chiaHang(dp.res, G.khoangHang(f.ships) - G.tongRes(f.cargo), G.C.CUOP_TOI_DA);
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

    var matA = 0, matD = 0, k2;
    for (k2 in kq.matA) matA += kq.matA[k2];
    for (k2 in kq.matD) matD += kq.matD[k2];
    st.stats.tauMat += matA; st.stats.tauDietDich += matD;
    d.st.stats.tauMat += matD; d.st.stats.tauDietDich += matA;

    /* báo cáo cho cả hai bên */
    G.tin(st, 'tran', 'Báo cáo chiến đấu ' + G.tdStr(f.den) + ' — ' + o.ten, null,
      { kq: kq, cuop: cuop, pl: kq.pheLieu, td: f.den, ben: 'ta', pvp: true, doiThu: o.ten });
    G.tin(d.st, 'tran', 'BỊ TẤN CÔNG tại ' + G.tdStr(dp.c) + ' — ' + st.ten, null,
      { kq: kq, cuop: cuop, pl: kq.pheLieu, td: dp.c, ben: 'dich', pvp: true, doiThu: st.ten });

    var now = Math.floor(Date.now() / 1000);
    kho.q.tranThem.run(now, this.chuStack[0] || null, dTk, o.key, kq.kq, Math.round(G.tongRes(cuop)), matA, matD);
    kho.q.btThem.run(now, 'tran',
      st.ten + ' đánh ' + o.ten + ' tại ' + G.tdStr(f.den) + ' — ' +
      (kq.kq === 'thang' ? 'bên tấn công thắng, cướp ' + G.so(G.tongRes(cuop)) + ' tài nguyên'
        : (kq.kq === 'thua' ? 'bên phòng thủ đứng vững' : 'hai bên cầm cự')));

    this.luu(dTk, d.st);

    if (G.trong(f.ships)) { G.ghi(st, 'Hạm đội #' + f.id + ' bị xoá sổ tại ' + G.tdStr(f.den) + '.'); G.xoaHam(st, f); return; }
    veNha(null);
  } finally {
    this.chuStack.pop();
    this.dangTick.delete(dTk);
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
      def: mucDo >= 3 ? G.clone(dp.def) : null,
      tech: mucDo >= 4 ? G.clone(d.st.tech) : null,
      ct: mucDo >= 5 ? G.clone(dp.b) : null,
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
  var dTk = o.tk;
  if (this.dangTick.has(dTk)) { f.den_t = st.now + 20; return; }
  if (G.trong(f.cargo)) {
    G.tin(st, 'ham', 'Không có gì để giao', 'Hạm đội #' + f.id + ' tới ' + G.tdStr(f.den) +
      ' nhưng khoang hàng trống. Quay về.');
    veNha(null); return;
  }
  var d = this.nap(dTk);
  if (!d) { veNha(null); return; }

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
      this.kho.q.btThem.run(Math.floor(Date.now() / 1000), 'tiepte',
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
TheGioi.prototype.xepHangCho = function (st) {
  var ds = this.kho.q.dqXepHang.all(200), out = [];
  for (var i = 0; i < ds.length; i++) {
    out.push({
      hang: i + 1, ten: ds[i].hienthi, lm: ds[i].lm || '', diem: ds[i].diem,
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
  try {
    var now = Math.floor(Date.now() / 1000);
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
        o = {
          loai: 'nguoi', key: td, c: c, tk: row.tk, htTen: row.ten, ten: row.hienthi,
          lm: row.lm || '', diem: row.diem, online: (now - row.vaoCuoi) < ONLINE,
          bo: (now - row.vaoCuoi) > CACH_LAU_MOI_VAO
        };
      } else if (G.coNPC(r.st.seed, c)) {
        o = { loai: 'npc', key: td, c: c, npc: G.npc(r.st, c) };
      } else {
        o = { loai: 'trong', key: td, c: c };
      }
      o.debris = plMap[td] && (plMap[td].metal > 0 || plMap[td].crystal > 0) ? plMap[td] : null;
      out.push(o);
    }
    return { g: g, h: h, o: out };
  } finally {
    this.chuStack.pop();
    this.ketThuc();
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
    'Họ đánh được ta và ta đánh được họ. Dưới ' + G.so(G.C.BAO_VE_MOI_DIEM) +
    ' điểm thì ta được bảo vệ người chơi mới.');
  var now = Math.floor(Date.now() / 1000);
  var kho = this.kho;
  var diem = Math.round(G.diem(st).tong);
  var ke = G.sukienKe(st);
  if (!isFinite(ke)) ke = now + 3600;
  kho.giaoDich(function () {
    kho.q.dqThem.run(tk, JSON.stringify(st), diem, st.lastTick, Math.round(Math.min(ke, now + 3600)), null, st.planets.length, now);
    for (var i = 0; i < st.planets.length; i++)
      kho.q.htThem.run(G.tdKey(st.planets[i].c), tk, st.planets[i].ten, i, st.planets[i].thuDo ? 1 : 0);
    kho.q.btThem.run(now, 'tk', hienthi + ' vừa nhận quyền chỉ huy hành tinh tại ' + G.tdStr(nha) + '.');
  });
  return { st: st, nha: nha };
};

/* --------------------------------------------------------------- liên minh */
TheGioi.prototype.lmDS = function () {
  return this.kho.q.lmDS.all().map(function (r) {
    return { ten: r.ten, tag: r.tag, sl: r.sl, diem: r.diem, chu: r.chu, mota: r.mota || '' };
  });
};
TheGioi.prototype.lmTao = function (tk, ten, tag) {
  ten = String(ten || '').trim().slice(0, 32);
  tag = String(tag || '').trim().slice(0, 6).toUpperCase();
  if (ten.length < 3) return 'Tên liên minh phải từ 3 ký tự.';
  if (!/^[A-Z0-9]{2,6}$/.test(tag)) return 'Thẻ liên minh phải là 2–6 chữ/số.';
  var day = '[' + tag + '] ' + ten;
  if (this.kho.q.lmGet.get(day)) return 'Liên minh này đã tồn tại.';
  /* tránh trùng tên với các liên minh NPC đang hiện trên bản đồ */
  for (var i = 0; i < G.LIEN_MINH.length; i++) {
    if (!G.LIEN_MINH[i]) continue;
    if (G.LIEN_MINH[i].toLowerCase() === day.toLowerCase()) return 'Tên này đã có liên minh NPC dùng, chọn tên khác.';
    if (G.LIEN_MINH[i].indexOf('[' + tag + ']') === 0) return 'Thẻ ' + tag + ' đã có liên minh NPC dùng, chọn thẻ khác.';
  }
  var now = Math.floor(Date.now() / 1000), kho = this.kho;
  kho.giaoDich(function () {
    kho.q.lmThem.run(day, tag, tk, now, null);
    kho.q.btThem.run(now, 'lm', 'Liên minh ' + day + ' được thành lập.');
  });
  return null;
};
TheGioi.prototype.lmThanhVien = function (ten, tk) {
  return this.kho.q.dqTheoLM.all(ten).map(function (r) {
    return { ten: r.hienthi, diem: r.diem, ht: r.soHT, ta: r.tk === tk };
  });
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
