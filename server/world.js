/* THIÊN HÀ ĐẠI CHIẾN — thế giới dùng chung (server là bên quyết định)
 * Nhiệm vụ:
 *   - nạp/lưu đế quốc của từng tài khoản (state JSON trong SQLite)
 *   - tua thời gian cho đế quốc, xử lý sự kiện tới hạn
 *   - đấu PvP thật giữa nhiều chủ hạm: tua bên đánh, host và các đội hỗ trợ,
 *     đánh nhau, cướp tài nguyên, ghi báo cáo cho các bên
 *   - NPC và bãi phế liệu là TÀI SẢN CHUNG của server (bảng npc / pl)      */
'use strict';
var G = require('./rules.js').G;
var taoClock = require('./clock.js').taoClock;
var schedulerEvents = require('./scheduler/events.js');

var CACH_LAU_MOI_VAO = 7 * 86400;   // quá 7 ngày không vào -> hiện "lâu không vào"
var ONLINE = 300;                   // 5 phút
var CHIEN_CHO = 24 * 3600;          // Hội Đồng Bảo An chỉ cho đánh sau 24 giờ

function TheGioi(kho, options) {
  options = options || {};
  this.kho = kho;
  this.clock = options.clock || taoClock();
  this.gameNow = function () { return Math.floor(this.clock.nowMs() / 1000); };
  this.scheduler = null;
  this._scheduler = null;
  this._advanceService = null;
  this._schedulerMutation = null;
  this.dangTick = new Set();
  this.chuStack = [];
  this.mocTick = [];                 // horizon cố định của TheGioi.tick ngoài cùng
  this.ctx = null;
  this.sau = 0;
  this._seed = null;
  this.rulesHook = this.veHook();
  if (options.scheduler) this.datScheduler(options.scheduler);
}

/* Nâng toàn bộ state đã lưu trước khi server bắt đầu nhận request. Mọi bản
   ghi được chuẩn bị trong bộ nhớ trước rồi mới COMMIT cùng lúc: nếu một JSON
   hỏng hoặc thuộc phiên bản mới hơn code hiện tại, database không bị nâng
   nửa chừng. Không tick thời gian tại đây; scheduler sẽ làm việc đó sau. */
TheGioi.prototype.nangCapDuLieu = function () {
  var rows = this.kho.db.prepare('SELECT tk,state FROM dq ORDER BY tk').all();
  var tatCa = [], canLuu = new Set(), soNangCap = 0;
  var now = this.gameNow(), i;
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
    this.kho.cauhinh('moLuc', String(this.gameNow()));
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
    states: new Map(), dirty: new Map(), bangTin: [], tran: [], huy: false,
    schedulerLuu: new Map(), schedulerCreations: new Map()
  };
  this.sau++;
};
TheGioi.prototype.ketThuc = function (thanhCong) {
  if (this.ctx && thanhCong === false) this.ctx.huy = true;
  if (--this.sau > 0) return;
  var c = this.ctx; this.ctx = null;
  if (!c || c.huy) return;
  var kho = this.kho, mutation = c.schedulerMutation,
    now = mutation ? Math.floor(mutation.effectiveNowMs / 1000) : this.gameNow();
  var self = this;
  var joined = kho.transactionDepth > 0;
  kho.trongGiaoDich(function () {
    var revisions = self._ghiNhieu(Array.from(c.dirty, function (x) { return { tk: x[0], st: x[1] }; }), now,
      c.schedulerLuu);
    if (mutation) self._dongBoSchedulerCreations(c, now);
    if (mutation) self._dongBoSchedulerLuu(c, revisions);
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
    if (mutation) {
      if (joined) kho.dangKySchedulerFinalizer(function () { self._assertSchedulerFinalFence(mutation); });
      else self._assertSchedulerFinalFence(mutation);
    }
  }, {immediate: true});
  if (!c.schedulerLuu.size && !c.schedulerCreations.size) return;
  var receipts = new Map();
  c.schedulerLuu.forEach(function (item, accountId) { receipts.set(accountId, item.receipt); });
  c.schedulerCreations.forEach(function (item, accountId) { receipts.set(accountId, item.receipt); });
  return receipts;
};

function schedulerMutationError(mutation) {
  if (!mutation || typeof mutation !== 'object' || !mutation.leaseToken) return 'SCHEDULER_MUTATION_TOKEN_REQUIRED';
  if (!mutation.remainingBudget || typeof mutation.remainingBudget !== 'object' ||
      !Number.isSafeInteger(mutation.remainingBudget.value) || mutation.remainingBudget.value < 0 ||
      mutation.remainingBudget.value > 50000 || !Number.isSafeInteger(mutation.effectiveNowMs) ||
      mutation.effectiveNowMs < 0) return 'SCHEDULER_MUTATION_INVALID';
  return null;
}
TheGioi.prototype.datScheduler = function (store) {
  var required = ['assertLiveLease','replaceAccountAdvance','listDerivedJobsForAccount','schedule',
    'invalidateGlobalJob','prepareDeletedAccountJobResolution'];
  if (!store || required.some(function (name) { return typeof store[name] !== 'function'; })) {
    throw new Error('SCHEDULER_STORE_INVALID');
  }
  if (!this._scheduler) { this._scheduler = this.scheduler = store; return; }
  if (this._scheduler !== store) throw new Error('SCHEDULER_STORE_ALREADY_INSTALLED');
};
TheGioi.prototype.datAdvanceService = function (service) {
  if (!service || typeof service.advanceTo !== 'function' || service.advanceTo.length !== 4) {
    throw new Error('SCHEDULER_ADVANCE_SERVICE_INVALID');
  }
  if (!this._advanceService) { this._advanceService = service; return; }
  if (this._advanceService !== service) throw new Error('SCHEDULER_ADVANCE_SERVICE_ALREADY_INSTALLED');
};
TheGioi.prototype.trongMutationScheduler = function (mutation, fn) {
  var error = schedulerMutationError(mutation);
  if (error) throw new Error(error);
  if (typeof fn !== 'function') throw new Error('SCHEDULER_MUTATION_INVALID');
  if (this._schedulerMutation && this._schedulerMutation !== mutation) {
    throw new Error('SCHEDULER_MUTATION_TOKEN_CONFLICT');
  }
  var outer = !this._schedulerMutation;
  this._schedulerMutation = mutation;
  try { return fn(); }
  finally { if (outer) this._schedulerMutation = null; }
};
TheGioi.prototype._schedulerActive = function (mutation) {
  var error = schedulerMutationError(mutation);
  if (error) throw new Error(error);
  if (!this._schedulerMutation) throw new Error('SCHEDULER_MUTATION_TOKEN_REQUIRED');
  if (this._schedulerMutation !== mutation) throw new Error('SCHEDULER_MUTATION_TOKEN_CONFLICT');
  return mutation;
};
TheGioi.prototype.advanceAccountNoiBo = function (mutation, accountId, targetS, saveOptions) {
  // Scheduler ABI: advanceTo(mutation,accountId,targetS,saveOptions).
  this._schedulerActive(mutation);
  if (!this._advanceService) throw new Error('SCHEDULER_ADVANCE_SERVICE_INVALID');
  return this._advanceService.advanceTo(mutation, accountId, targetS, saveOptions);
};
TheGioi.prototype._assertSchedulerFinalFence = function (mutation) {
  var error = schedulerMutationError(mutation);
  if (error) throw new Error(error);
  this._scheduler.assertLiveLease(mutation.leaseToken, mutation.effectiveNowMs);
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

TheGioi.prototype.withRulesHook = function (fn) {
  var prior = G.HOOK;
  G.HOOK = this.rulesHook;
  try {
    var value = fn();
    if (value && typeof value.then === 'function') {
      var error = new TypeError('WORLD_RULES_HOOK_ASYNC');
      error.code = 'WORLD_RULES_HOOK_ASYNC';
      throw error;
    }
    return value;
  } finally {
    G.HOOK = prior;
  }
};

/* ----------------------------------------------------- chiến tranh / đồng minh */
TheGioi.prototype.laDongMinh = function (tkA, tkD) {
  var a = this.kho.q.dqGet.get(tkA), d = this.kho.q.dqGet.get(tkD);
  return !!(a && d && a.lm && d.lm && a.lm === d.lm);
};

/* Luật nguồn 2006: lệnh chiến tranh nhắm tới một người chơi; nếu bên tuyên
   đang ở liên minh thì quyền đánh thuộc về liên minh và thành viên hiện tại. */
TheGioi.prototype.quyenDanh = function (tkA, tkD, now) {
  now = Math.floor(+now || this.gameNow());
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
  var now = this.gameNow();
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
TheGioi.prototype.layStateNoiBo = function (tk) {
  var r = this.nap(tk);
  return r ? r.st : null;
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
TheGioi.prototype._ghiNhieu = function (ds, now, schedulerLuu) {
  if (!ds || !ds.length) return new Map();
  var kho = this.kho, self = this;
  var revisions = new Map();
  ds.sort(function (a, b) { return a.tk - b.tk; });
  var p = ds.map(function (x) { return self._chuanBiLuu(x.tk, x.st, now); });
  p.forEach(function (x) {
    var item = schedulerLuu && schedulerLuu.get(x.tk), row;
    if (item) {
      row = kho.schedulerStatements().dqLuu.get(x.js, x.diem, x.ct, x.nc, x.ham, x.thu,
        x.lastTick, x.ke, x.lm, x.soHT, x.now, x.tk);
      if (!row) throw new Error('SCHEDULER_DQ_SAVE_CONFLICT');
      var revision = Number(row.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('SCHEDULER_DQ_REVISION_INVALID');
      revisions.set(x.tk, revision);
    } else kho.q.dqLuu.run(x.js, x.diem, x.ct, x.nc, x.ham, x.thu,
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
  return revisions;
};

TheGioi.prototype.luu = function (tk, st, options) {
  options = options || {};
  var mutation = options.mutation;
  if (this._scheduler) {
    this._schedulerActive(mutation);
    if (!this.ctx) {
      var self = this, ownBatch = true, value, complete = false;
      this.batDau();
      try { value = this.luu(tk, st, options); complete = true; return value; }
      finally { if (ownBatch) this.ketThuc(complete); }
    }
    var old = this.ctx.schedulerLuu.get(tk), supplied = options.protectedRecoveryRootIds;
    if (supplied !== undefined && !(supplied instanceof Set)) throw new Error('SCHEDULER_PROTECTED_ROOTS_INVALID');
    if (old && old.mutation !== mutation) throw new Error('SCHEDULER_MUTATION_TOKEN_CONFLICT');
    if (!old) {
      old = {tk: tk, st: st, mutation: mutation, receipt: {revision: null, nextLocalAtS: null},
        options: {currentAccountAdvanceJobId: null, deferAccountWake: false, protectedRecoveryRootIds: new Set()}};
      this.ctx.schedulerLuu.set(tk, old);
    } else if (Object.isFrozen(old.receipt)) {
      old.receipt = {revision: null, nextLocalAtS: null};
    }
    if (options.currentAccountAdvanceJobId !== undefined && options.currentAccountAdvanceJobId !== null) {
      if (old.options.currentAccountAdvanceJobId !== null &&
        old.options.currentAccountAdvanceJobId !== options.currentAccountAdvanceJobId) {
        throw new Error('SCHEDULER_ACCOUNT_JOB_CONFLICT');
      }
      old.options.currentAccountAdvanceJobId = options.currentAccountAdvanceJobId;
    }
    old.options.deferAccountWake = old.options.deferAccountWake || options.deferAccountWake === true;
    if (supplied) supplied.forEach(function (id) { old.options.protectedRecoveryRootIds.add(id); });
    old.st = st;
    this.ctx.dirty.set(tk, st);
    if (!this.ctx.states.has(tk)) this.ctx.states.set(tk, { row: this.kho.q.dqGet.get(tk), st: st });
    this.ctx.schedulerMutation = mutation;
    return old.receipt;
  }
  var now = this.gameNow();
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

TheGioi.prototype._dongBoSchedulerLuu = function (ctx, revisions) {
  var self = this, store = this._scheduler, mutation = ctx.schedulerMutation;
  this._schedulerActive(mutation);
  store.assertLiveLease(mutation.leaseToken, mutation.effectiveNowMs);
  var all = this.kho.db.prepare('SELECT tk,state FROM dq ORDER BY tk').all(), owners = new Map();
  all.forEach(function (row) {
    var state = JSON.parse(row.state);
    (state.planets || []).forEach(function (planet) { owners.set(G.tdKey(planet.c), Number(row.tk)); });
  });
  function ownerFor(key) { return owners.get(key) || null; }
  ctx.schedulerLuu.forEach(function (item, accountId) {
    var revision = revisions.get(accountId);
    if (!Number.isSafeInteger(revision)) throw new Error('SCHEDULER_DQ_SAVE_CONFLICT');
    var derived = schedulerEvents.deriveExternalJobs(accountId, item.st, ownerFor), live =
      store.listDerivedJobsForAccount(mutation.leaseToken, accountId, mutation.effectiveNowMs), keys = new Set();
    var protectedEntities = new Set();
    live.forEach(function (row) {
      if (!item.options.protectedRecoveryRootIds.has(row.logical_root_id)) return;
      var ref = row.canonical_ref || {};
      protectedEntities.add(String(ref.kind) + ':' + String(ref.fleetId || ref.missileId));
    });
    derived.forEach(function (job) {
      var ref = job.payload && job.payload.ref || {};
      var entity = String(ref.kind) + ':' + String(ref.fleetId || ref.missileId);
      if (protectedEntities.has(entity)) return;
      keys.add(job.idempotencyKey);
      store.schedule(mutation.leaseToken, job, mutation.effectiveNowMs);
    });
    live.forEach(function (row) {
      if (keys.has(row.logical_key) || item.options.protectedRecoveryRootIds.has(row.logical_root_id)) return;
      var status = schedulerEvents.canonicalExternalStatus(self.kho, row.canonical_ref);
      if (status === 'ALREADY_ABSENT' || status === 'REF_MISMATCH') {
        store.invalidateGlobalJob(mutation.leaseToken, row.logical_root_id, status,
          Number(row.logical_scheduled_at_s), mutation.effectiveNowMs);
      }
    });
    var next = G.phanLoaiSuKienNoiBoKe(item.st, accountId, ownerFor);
    var nextAtS = next ? next.atS : null;
    if (!item.options.currentAccountAdvanceJobId && !item.options.deferAccountWake) {
      store.replaceAccountAdvance(mutation.leaseToken, accountId, revision, nextAtS, mutation.effectiveNowMs);
    }
    if (Object.isFrozen(item.receipt)) {
      item.receipt = {revision: null, nextLocalAtS: null};
    }
    item.receipt.revision = revision;
    item.receipt.nextLocalAtS = nextAtS;
  });
  return ctx.schedulerLuu;
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

TheGioi.prototype._chiMucTuCanonical = function (states) {
  var accountIds = new Set(states.map(function (entry) { return Number(entry.tk); }));
  var owners = new Map();
  var out = {ht: [], hamdang: [], hamgiu: []};
  var ordered = states.slice().sort(function (a, b) {
    return Number(a.tk) - Number(b.tk);
  });
  ordered.forEach(function (entry) {
    (entry.st.planets || []).forEach(function (planet, pi) {
      var td = G.tdKey(planet.c);
      if (owners.has(td) && owners.get(td) !== Number(entry.tk)) {
        throw new Error('CANONICAL_TARGET_OWNER_CONFLICT');
      }
      owners.set(td, Number(entry.tk));
      out.ht.push({td: td, tk: Number(entry.tk), ten: planet.ten, pi: pi,
        thuDo: planet.thuDo ? 1 : 0});
    });
  });
  ordered.forEach(function (entry) {
    (entry.st.fleets || []).forEach(function (fleet) {
      var td = G.tdKey(fleet.den);
      var owner = owners.get(td);
      if (fleet.pha === 'di' &&
          ['attack', 'transport', 'hold'].indexOf(fleet.mission) >= 0 &&
          Number.isSafeInteger(owner) &&
          (owner !== Number(entry.tk) || fleet.mission === 'hold')) {
        out.hamdang.push({tkA: Number(entry.tk), fid: Number(fleet.id), tkD: owner,
          tu: G.tdKey(fleet.tu), den: td, nv: fleet.mission,
          denT: Math.round(fleet.den_t), tenA: entry.st.ten,
          lmA: entry.st.lm ? entry.st.lm.ten : null});
      }
      if (fleet.mission === 'hold' && fleet.pha === 'giu' &&
          Number.isSafeInteger(Number(fleet.giuTaiTk)) &&
          accountIds.has(Number(fleet.giuTaiTk)) &&
          Number(fleet.giuLuc) >= 0 && Number(fleet.giuDen_t) > Number(fleet.giuLuc)) {
        out.hamgiu.push({tkA: Number(entry.tk), fid: Number(fleet.id),
          tkD: Number(fleet.giuTaiTk), tu: G.tdKey(fleet.tu), td: td,
          giuLuc: Math.floor(fleet.giuLuc), giuDenT: Math.floor(fleet.giuDen_t),
          tiepNLT: Math.floor(Number(fleet.tiepNL_t) || Number(fleet.giuDen_t))});
      }
    });
  });
  out.ht.sort(function (a, b) { return a.td.localeCompare(b.td); });
  out.hamdang.sort(function (a, b) { return a.tkA - b.tkA || a.fid - b.fid; });
  out.hamgiu.sort(function (a, b) { return a.tkA - b.tkA || a.fid - b.fid; });
  return out;
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
  var mutation = this._schedulerMutation;
  var now = this._scheduler && mutation ?
    Math.floor(mutation.effectiveNowMs / 1000) : this.gameNow();
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
  var now = this.gameNow();
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

/* Tua nội bộ một đế quốc tới mốc `now` (mặc định: bây giờ). */
TheGioi.prototype._tickNoiBo = function (tk, now, dl) {
  if (this.dangTick.has(tk)) return null;
  now = now || this.gameNow();
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
  var mutation = this._scheduler ? this._schedulerActive(this._schedulerMutation) : null;
  if (!G.HANHDONG[ten]) return {loi: 'Hành động không tồn tại.', st: null};
  var loaded = this.nap(Number(tk));
  if (!loaded) return {loi: 'Đế quốc không tồn tại.', st: null};
  var state = loaded.st;
  var loi = G.HANHDONG[ten](state, dl || {}) || null;
  this.luu(Number(tk), state, mutation ? {mutation: mutation} : undefined);
  return {loi: loi, st: state};
};

/* ------------------------------------------------------------- PvP: tấn công */
TheGioi.prototype.danhNguoi = function (st, f, o, veNha) {
  var W = this, kho = this.kho;
  var dTk = Number(o.tk), aTk = this.chuHienTai(), tTran = Math.floor(st.now);

  /* Một DB latest-state không thể quay lại snapshot lịch sử. Mọi PvP due trong
     quãng offline được dời tới horizon CỐ ĐỊNH của tick request (không đọc
     đồng hồ tường ở đây, tránh mốc chạy mãi qua ranh giới giây), rồi chính vòng
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
      G.tin(
        st,
        'tt',
        'Mục tiêu đã biến mất',
        G.tdStr(f.den) + ' không còn là hành tinh của ' + o.ten + '. Hạm đội quay về.'
      );
      veNha(null); return;
    }
    var dp = d.st.planets[pi];

    /* bảo vệ người chơi mới: hai chiều */
    var diemA = G.diem(st).tong, diemD = G.diem(d.st).tong;
    var chan = null;
    if (diemD < G.C.BAO_VE_MOI_DIEM && diemA > diemD * G.C.BAO_VE_MOI_TY_LE)
      chan = 'Đối phương đang được bảo vệ người chơi mới (' + G.so(diemD) +
        ' điểm so với ' + G.so(diemA) + ' điểm của ta).';
    else if (diemA < G.C.BAO_VE_MOI_DIEM && diemD > diemA * G.C.BAO_VE_MOI_TY_LE)
      chan = 'Ta đang trong diện bảo vệ người chơi mới nên không được đánh đối thủ mạnh hơn ' +
        G.C.BAO_VE_MOI_TY_LE + ' lần.';
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
    G.tin(
      d.st,
      'tran',
      (doBo && doBo.thang ? 'BỊ ĐỔ BỘ tại ' : 'BỊ TẤN CÔNG tại ') +
        G.tdStr(dp.c) + ' — ' + st.ten,
      null,
      { kq: kq, cuop: cuop, pl: kq.pheLieu, td: dp.c, ben: 'dich', pvp: true,
        doiThu: st.ten, doBo: doBo, hoTro: hoTroBC });
    for (i = 0; i < hoTroBC.length; i++) {
      var bcH = hoTroBC[i], nH = benD.get(bcH.tk);
      if (!nH) continue;
      G.tin(nH.st, 'tran', 'Hỗ trợ phòng thủ tại ' + G.tdStr(dp.c) + ' — ' + st.ten, null,
        { kq: kq, cuop: cuop, pl: kq.pheLieu, td: dp.c, ben: 'hotro', pvp: true,
          doiThu: st.ten, chuNha: o.ten, mat: bcH.mat, doBo: doBo, hoTro: hoTroBC });
    }

    var now = this.gameNow();
    this.ghiTran(now, aTk || null, dTk, o.key, kq.kq, Math.round(G.tongRes(cuop)), matA, matTauD);
    this.ghiBangTin(now, 'tran',
      st.ten + ' đánh ' + o.ten + ' tại ' + G.tdStr(f.den) + ' — ' +
      (kq.kq === 'thang' ? 'bên tấn công thắng, cướp ' + G.so(G.tongRes(cuop)) + ' tài nguyên'
        : (kq.kq === 'thua' ? 'bên phòng thủ đứng vững' : 'hai bên cầm cự')) +
      (doBo && doBo.thang && doBo.phaCT && (doBo.phaCT.soLuong || doBo.phaCT.soCap)
        ? ' — quân đổ bộ san phẳng ' + G.so(doBo.phaCT.soLuong || doBo.phaCT.soCap) + ' công trình' : ''));

    benD.forEach(function (n4, tkChu3) { W.luu(tkChu3, n4.st); });

    if (G.trong(f.ships)) {
      G.ghi(st, 'Hạm đội #' + f.id + ' bị xoá sổ tại ' + G.tdStr(f.den) + '.');
      G.xoaHam(st, f);
      return;
    }
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
      res: {
        metal: Math.floor(dp.res.metal || 0),
        crystal: Math.floor(dp.res.crystal || 0),
        deut: Math.floor(dp.res.deut || 0),
        food: Math.floor(dp.res.food || 0)
      },
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
      (mat > 0
        ? '\nTrung Tâm Tình Báo bắn hạ được ' + mat + ' chiếc.'
        : '\nKhông bắn hạ được chiếc nào — nên nâng Trung Tâm Tình Báo.')
    );
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
      G.tin(
        st,
        'ham',
        'Không giao được hàng',
        G.tdStr(f.den) + ' không còn là hành tinh của ' + o.ten + '. Hàng được mang về.'
      );
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
      this.ghiBangTin(this.gameNow(), 'tiepte',
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
    var now = this.gameNow();
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
    out.push({
      loai: 'sau',
      key: g + ':' + h + ':' + G.C.O_THAM_HIEM,
      c: G.toaDo(g, h, G.C.O_THAM_HIEM),
      debris: null
    });
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

TheGioi.prototype.taoDeQuoc = function (tk, hienthi, options) {
  options = options || {};
  var mutation = options.mutation || this._schedulerMutation;
  if (this._scheduler) {
    this._schedulerActive(mutation);
    if (!this.ctx) {
      var self = this, value, complete = false;
      this.batDau();
      try { value = this.taoDeQuoc(tk, hienthi, options); complete = true; return value; }
      finally { self.ketThuc(complete); }
    }
  }
  var nha = this.timNha();
  if (!nha) return { loi: 'Vũ trụ đã hết chỗ trống.' };
  var now = this._scheduler ? Math.floor(mutation.effectiveNowMs / 1000) : this.gameNow();
  var st = G.moiGame(hienthi, this.seed(), nha, now);
  G.tin(
    st,
    'he',
    'Vũ trụ này có người thật',
    'Đây là máy chủ nhiều người chơi: những hành tinh màu cam trên bản đồ là người chơi khác. ' +
    'Muốn đánh một chỉ huy phải tuyên chiến và chờ Hội Đồng Bảo An 24 giờ; ' +
    'chỉ đồng minh mới tiếp tế cho nhau. Dưới ' + G.so(G.C.BAO_VE_MOI_DIEM) +
    ' điểm thì ta được bảo vệ người chơi mới.\n\n' +
    'Chưa biết bắt đầu từ đâu thì mở màn HƯỚNG DẪN ở cuối menu bên trái.'
  );
  var kho = this.kho;
  var dd0 = G.diem(st);
  var ke = G.sukienKe(st);
  if (!isFinite(ke)) ke = now + 3600;
  if (this._scheduler) {
    var receipt = {revision: null, nextLocalAtS: null};
    this.ctx.schedulerCreations.set(tk, {tk: tk, st: st, hienthi: hienthi, nha: nha,
      receipt: receipt, mutation: mutation, diem: dd0, ke: ke});
    this.ctx.schedulerMutation = mutation;
    this.ctx.bangTin.push([Math.floor(mutation.effectiveNowMs / 1000), 'tk',
      hienthi + ' vừa nhận quyền chỉ huy hành tinh tại ' + G.tdStr(nha) + '.']);
    return {st: st, nha: nha, receipt: receipt};
  }
  kho.giaoDich(function () {
    kho.q.dqThem.run(tk, JSON.stringify(st), Math.round(dd0.tong), Math.round(dd0.ct), Math.round(dd0.nc),
      Math.round(dd0.ham), Math.round(dd0.thu), st.lastTick,
      Math.round(Math.min(ke, now + 3600)), null, st.planets.length, now
    );
    for (var i = 0; i < st.planets.length; i++)
      kho.q.htThem.run(G.tdKey(st.planets[i].c), tk, st.planets[i].ten, i, st.planets[i].thuDo ? 1 : 0);
    kho.q.btThem.run(now, 'tk', hienthi + ' vừa nhận quyền chỉ huy hành tinh tại ' + G.tdStr(nha) + '.');
  });
  return { st: st, nha: nha };
};

TheGioi.prototype._dongBoSchedulerCreations = function (ctx, now) {
  var self = this, kho = this.kho, mutation = ctx.schedulerMutation;
  ctx.schedulerCreations.forEach(function (item, accountId) {
    var dd = item.diem, st = item.st, ke = item.ke;
    kho.q.dqThem.run(accountId, JSON.stringify(st), Math.round(dd.tong), Math.round(dd.ct), Math.round(dd.nc),
      Math.round(dd.ham), Math.round(dd.thu), st.lastTick, Math.round(Math.min(ke, now + 3600)),
      null, st.planets.length, now);
    for (var i = 0; i < st.planets.length; i++) {
      kho.q.htThem.run(G.tdKey(st.planets[i].c), accountId, st.planets[i].ten, i, st.planets[i].thuDo ? 1 : 0);
    }
  });
  var owners = new Map();
  kho.db.prepare('SELECT tk,state FROM dq ORDER BY tk').all().forEach(function (row) {
    JSON.parse(row.state).planets.forEach(function (planet) { owners.set(G.tdKey(planet.c), Number(row.tk)); });
  });
  ctx.schedulerCreations.forEach(function (item, accountId) {
    var ownerFor = function (key) { return owners.get(key) || null; };
    var next = G.phanLoaiSuKienNoiBoKe(item.st, accountId, ownerFor);
    var atS = next ? next.atS : null;
    self._scheduler.replaceAccountAdvance(mutation.leaseToken, accountId, 0, atS, mutation.effectiveNowMs);
    item.receipt.revision = 0;
    item.receipt.nextLocalAtS = atS;
  });
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

    var now = this.gameNow();
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
TheGioi.prototype.xoaTaiKhoan = function (tk, tenHienThi, options) {
  if (this.dangTick.has(tk)) return 'Đế quốc đang được xử lý, thử lại sau một nhịp.';
  options = options || {};
  if (this._scheduler) {
    var mutation = this._schedulerActive(options.mutation || this._schedulerMutation),
      self = this, scheduler = this._scheduler;
    var joined = this.kho.transactionDepth > 0;
    function removeInCurrentUow() {
      var stateRow = self.kho.q.dqGet.get(tk), targetKeys = new Set();
      if (stateRow) {
        try { JSON.parse(stateRow.state).planets.forEach(function (planet) { targetKeys.add(G.tdKey(planet.c)); }); }
        catch (error) { throw new Error('SCHEDULER_DELETE_STATE_INVALID'); }
      }
      scheduler.assertLiveLease(mutation.leaseToken, mutation.effectiveNowMs);
      var resolution = scheduler.prepareDeletedAccountJobResolution(mutation.leaseToken, tk, targetKeys,
        mutation.effectiveNowMs);
      var before = resolution.invalidatable.map(function (entry) {
        return {entry: entry, status: schedulerEvents.canonicalExternalStatus(self.kho, entry.canonicalRef)};
      });
      var lmChu = self.kho.q.lmCuaChu.get(tk), lmGiaiTan = null;
      if (lmChu) {
        var keNhi = self.kho.q.lmKeNhi.get(lmChu.ten, tk);
        if (keNhi) {
          self.kho.q.lmDoiChu.run(keNhi.tk, lmChu.ten);
          var chuMoi = self.kho.q.tkTheoId.get(keNhi.tk);
          self.kho.q.btThem.run(Math.floor(mutation.effectiveNowMs / 1000), 'lm',
            (chuMoi ? chuMoi.hienthi : 'Một thành viên') + ' tiếp quản ' + lmChu.ten + ' sau khi chủ cũ rời vũ trụ.');
        } else lmGiaiTan = lmChu.ten;
      }
      self.kho.q.phienXoaCua.run(tk);
      self.kho.q.tkXoa.run(tk);
      if (lmGiaiTan) self.kho.q.chatLMXoa.run(lmGiaiTan);
      self.kho.q.lmDonRong.run();
      before.forEach(function (candidate) {
        var entry = candidate.entry, reason;
        if (entry.referencedAsTarget && candidate.status === 'EXACT') {
          scheduler.invalidateGlobalJob(mutation.leaseToken, entry.root.id, 'EXACT', Number(entry.root.scheduled_at_s),
            mutation.effectiveNowMs, {targetRemovedKey: entry.canonicalRef.targetKey});
          return;
        }
        reason = schedulerEvents.canonicalExternalStatus(self.kho, entry.canonicalRef);
        if (reason === 'ALREADY_ABSENT' || reason === 'REF_MISMATCH') {
          scheduler.invalidateGlobalJob(mutation.leaseToken, entry.root.id, reason,
            Number(entry.root.scheduled_at_s), mutation.effectiveNowMs);
        }
      });
      self.kho.q.btThem.run(Math.floor(mutation.effectiveNowMs / 1000), 'tk',
        tenHienThi + ' đã rời khỏi vũ trụ, các hành tinh trở về trạng thái trống.');
      if (joined) self.kho.dangKySchedulerFinalizer(function () { self._assertSchedulerFinalFence(mutation); });
      else self._assertSchedulerFinalFence(mutation);
    }
    this.kho.trongGiaoDich(removeInCurrentUow, {immediate: true});
    return null;
  }
  var kho = this.kho, now = this.gameNow();
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
  var mutation = this._scheduler ? this._schedulerActive(this._schedulerMutation) : null;
  var d = this.nap(nhan.id);
  if (!d) return 'Người nhận chưa có đế quốc.';
  G.tin(d.st, 'thu', 'Thư từ ' + tenGui, noi);
  this.luu(nhan.id, d.st, mutation ? {mutation: mutation} : undefined);
  return null;
};

/* ----------------------------------------------------------- tuyên chiến */
TheGioi.prototype.tuyenChien = function (tkA, tkD) {
  tkD = Math.floor(+tkD);
  if (!Number.isSafeInteger(tkD) || tkD < 1) return 'Chỉ huy mục tiêu không hợp lệ.';
  if (tkA === tkD) return 'Không thể tuyên chiến với chính mình.';
  var kho = this.kho;
  var mutation = this._scheduler ? this._schedulerActive(this._schedulerMutation) : null;
  var a = kho.q.dqGet.get(tkA), d = kho.q.dqGet.get(tkD), tenD = kho.q.tkTheoId.get(tkD);
  if (!a || !d || !tenD) return 'Chỉ huy mục tiêu không còn trong vũ trụ.';
  if (a.lm && d.lm && a.lm === d.lm) return 'Không thể tuyên chiến với thành viên cùng liên minh.';

  var now = mutation ? Math.floor(mutation.effectiveNowMs / 1000) : this.gameNow(), ben;
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
        G.tin(nd.st, 'canh', 'BỊ TUYÊN CHIẾN bởi ' + ben,
          'Lệnh được đặt lúc ' + G.gio(now * 1000) + '. Sau 24 giờ, ' + ben +
          ' được phép tấn công các hành tinh của ta.');
        this.luu(tkD, nd.st, mutation ? {mutation: mutation} : undefined);
      }
    } catch (e) { /* bảng chiến + bảng tin chung vẫn là nguồn sự thật */ }
  }
  return null;
};

TheGioi.prototype.chienCua = function (tk) {
  var dq = this.kho.q.dqGet.get(tk), now = this.gameNow(), self = this;
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
  var mutation = this._scheduler ? this._schedulerActive(this._schedulerMutation) : null;
  var now = mutation ? Math.floor(mutation.effectiveNowMs / 1000) : this.gameNow();
  /* Thành viên có thể vừa bị loại/rời trong một request sát cạnh; xác nhận lại
     ngay trước lúc ghi tiền. */
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
  var opened = !this.ctx, complete = false;
  if (opened) this.batDau();
  try {
    this.luu(tkA, a.st, mutation ? {mutation: mutation} : undefined);
    this.luu(tkD, d.st, mutation ? {mutation: mutation} : undefined);
    this.ghiBangTin(now, 'tiepte', (tenA ? tenA.hienthi : 'Một chỉ huy') + ' chuyển ' +
      G.so(so) + ' Galana cho ' + (tenD ? tenD.hienthi : 'một đồng minh') + '.');
    complete = true;
  } finally {
    if (opened) this.ketThuc(complete);
  }
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
    if (G.LIEN_MINH[i].toLowerCase() === day.toLowerCase()) {
      return thatBai('Tên này đã có liên minh NPC dùng, chọn tên khác.');
    }
    if (G.LIEN_MINH[i].indexOf('[' + tag + ']') === 0) {
      return thatBai('Thẻ ' + tag + ' đã có liên minh NPC dùng, chọn thẻ khác.');
    }
  }
  var now = this.gameNow(), kho = this.kho;
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
  this.kho.q.lmXinThem.run(ten, tk, this.gameNow());
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
  this.kho.q.btThem.run(this.gameNow(), 'lm', tk.hienthi + ' được duyệt vào ' + lm.ten + '.');
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
  this.kho.q.btThem.run(this.gameNow(), 'lm',
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
  this.kho.q.btThem.run(this.gameNow(), 'lm',
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
      this.kho.q.btThem.run(this.gameNow(), 'lm',
        (nguoi ? nguoi.hienthi : 'Một thành viên') + ' rời ' + lm.ten + '.');
    }
  }
  return kq;
};

/* --------------------------------------------------------- vòng lặp scheduler */
TheGioi.prototype.nhip = function (toiDa) {
  var now = this.gameNow();
  var ds = this.kho.q.dqDenHan.all(now, toiDa || 60);
  var n = 0;
  for (var i = 0; i < ds.length; i++) {
    try { if (this._tickNoiBo(ds[i].tk, now)) n++; }
    catch (e) { console.error('[nhip] lỗi khi tua đế quốc', ds[i].tk, e && e.message); }
  }
  return n;
};

function reducerWorldError(code) {
  var error = new Error(code);
  error.code = code;
  return error;
}

function reducerWorldContext(world, effectiveAtS, canonicalTarget) {
  if (!world._schedulerMutation) throw reducerWorldError('SCHEDULER_MUTATION_TOKEN_REQUIRED');
  if (!canonicalTarget || typeof canonicalTarget !== 'object' ||
      canonicalTarget.mutation !== world._schedulerMutation ||
      !Number.isSafeInteger(effectiveAtS) || effectiveAtS < 0 ||
      canonicalTarget.effectiveAtS !== effectiveAtS ||
      typeof canonicalTarget.targetKey !== 'string' ||
      typeof canonicalTarget.logicalRootId !== 'string') {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  world._schedulerActive(canonicalTarget.mutation);
  return canonicalTarget;
}

function reducerEntity(world, ref) {
  var loaded = world.nap(Number(ref && ref.ownerAccountId));
  var list = ref && ref.kind === 'missile' ? loaded && loaded.st.tenLua : loaded && loaded.st.fleets;
  var id = ref && ref.kind === 'missile' ? ref.missileId : ref && ref.fleetId;
  var entity = list && list.find(function (candidate) {
    return Number(candidate.id) === Number(id);
  });
  if (!loaded || !entity) throw reducerWorldError('PAYLOAD_INTEGRITY');
  var current;
  try {
    current = ref.kind === 'missile' ?
      schedulerEvents.stableMissileRef(Number(ref.ownerAccountId), entity) :
      schedulerEvents.stableFleetRef(Number(ref.ownerAccountId), entity);
  } catch (error) { throw reducerWorldError('PAYLOAD_INTEGRITY'); }
  if (!schedulerEvents.sameExternalRef(current, ref)) throw reducerWorldError('PAYLOAD_INTEGRITY');
  return {loaded: loaded, entity: entity};
}

function reducerTarget(world, ref, context) {
  if (!Number.isSafeInteger(context.accountId) || context.accountId < 1) {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  var loaded = world.nap(context.accountId);
  var planet = loaded && loaded.st.planets.find(function (candidate) {
    return G.tdKey(candidate.c) === ref.targetKey;
  });
  if (!loaded || !planet || context.accountId === Number(ref.ownerAccountId)) {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  return {loaded: loaded, planet: planet};
}

function reducerSave(world, context, entries, buildEffect) {
  var success = false, effect;
  var protectedRoots = new Set([context.logicalRootId]);
  world.batDau();
  try {
    effect = buildEffect();
    var seen = new Set();
    entries.forEach(function (entry) {
      var accountId = Number(entry.row.tk);
      if (seen.has(accountId)) return;
      seen.add(accountId);
      var receipt = world.luu(accountId, entry.st, {mutation: context.mutation,
        deferAccountWake: true, protectedRecoveryRootIds: protectedRoots});
      if (!effect.saveReceipts) effect.saveReceipts = [];
      effect.saveReceipts.push(receipt);
    });
    success = true;
  } finally {
    world.ketThuc(success);
  }
  return Object.freeze(effect);
}

function reducerReturnOrRemove(world, ref, effectiveAtS, context) {
  var source = reducerEntity(world, ref);
  source.loaded.st.now = effectiveAtS;
  return reducerSave(world, context, [source.loaded], function () {
    if (context.neutralization === 'MISSILE_REMOVED') {
      source.loaded.st.tenLua.splice(source.loaded.st.tenLua.indexOf(source.entity), 1);
    } else {
      G.batDauVe(source.loaded.st, source.entity, true, null);
    }
    return {applied: true, atS: effectiveAtS, neutralization: context.neutralization};
  });
}

function reducerResourceKeys() {
  return ['metal', 'crystal', 'deut', 'food'];
}

function reducerCanonicalWorld(world) {
  var states = new Map(), owners = new Map();
  world.kho.db.prepare('SELECT tk,state FROM dq ORDER BY tk').all().forEach(function (row) {
    var accountId = Number(row.tk), state;
    if (!Number.isSafeInteger(accountId) || accountId < 1) {
      throw reducerWorldError('PAYLOAD_INTEGRITY');
    }
    try { state = JSON.parse(row.state); }
    catch (error) { throw reducerWorldError('PAYLOAD_INTEGRITY'); }
    if (!state || !Array.isArray(state.planets) || !Array.isArray(state.fleets) ||
        !Array.isArray(state.tenLua || [])) throw reducerWorldError('PAYLOAD_INTEGRITY');
    states.set(accountId, state);
    state.planets.forEach(function (planet) {
      var key = G.tdKey(planet && planet.c);
      if (typeof key !== 'string' || owners.has(key)) {
        throw reducerWorldError('PAYLOAD_INTEGRITY');
      }
      owners.set(key, {accountId: accountId, state: state, planet: planet});
    });
  });
  return {states: states, owners: owners};
}

function reducerCanonicalContext(world, ref) {
  var canonical = reducerCanonicalWorld(world);
  return {states: canonical.states,
    sourceState: canonical.states.get(Number(ref.ownerAccountId)) || null,
    target: canonical.owners.get(ref.targetKey) || null};
}

function reducerAllianceName(state) {
  var name = state && state.lm && state.lm.ten;
  return typeof name === 'string' && name ? name : null;
}

function reducerCanonicalAllies(sourceState, targetState) {
  var sourceAlliance = reducerAllianceName(sourceState);
  return !!sourceAlliance && sourceAlliance === reducerAllianceName(targetState);
}

function reducerCanonicalAttackAllowed(world, sourceAccountId, sourceState,
  targetAccountId, targetState, effectiveAtS) {
  if (sourceAccountId === targetAccountId ||
      reducerCanonicalAllies(sourceState, targetState)) return false;
  var sourceAlliance = reducerAllianceName(sourceState);
  var war = sourceAlliance ? world.kho.q.chienGetLM.get(sourceAlliance, targetAccountId) :
    world.kho.q.chienGetTK.get(sourceAccountId, targetAccountId);
  return !!war && effectiveAtS >= Number(war.khi) + CHIEN_CHO;
}

function reducerCanonicalHoldAllowed(sourceAccountId, sourceState, fleet, target) {
  if (!target || (fleet.giuTaiTk !== null && fleet.giuTaiTk !== undefined &&
      Number(fleet.giuTaiTk) !== target.accountId)) return false;
  return sourceAccountId === target.accountId ||
    reducerCanonicalAllies(sourceState, target.state);
}

TheGioi.prototype.resolveTransportAt = function (ref, effectiveAtS, canonicalTarget) {
  var context = reducerWorldContext(this, effectiveAtS, canonicalTarget);
  if (context.neutralization) return reducerReturnOrRemove(this, ref, effectiveAtS, context);
  var source = reducerEntity(this, ref);
  if (source.entity.mission !== 'transport' || source.entity.pha !== 'di') {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  source.loaded.st.now = effectiveAtS;
  var canonical = reducerCanonicalContext(this, ref), currentTarget = canonical.target;
  if (!currentTarget || currentTarget.accountId !== context.accountId ||
      !canonical.sourceState ||
      !reducerCanonicalAllies(canonical.sourceState, currentTarget.state)) {
    return reducerSave(this, context, [source.loaded], function () {
      G.tin(source.loaded.st, 'ham', 'Tiếp tế bị Hội Đồng Bảo An chặn',
        'Quan hệ liên minh đã thay đổi. Toàn bộ hàng được mang về.');
      G.batDauVe(source.loaded.st, source.entity, true, null);
      return {kind: 'transport', applied: true, authorized: false, atS: effectiveAtS,
        delivered: {metal: 0, crystal: 0, deut: 0, food: 0}};
    });
  }
  var target = reducerTarget(this, ref, context);
  target.loaded.st.now = effectiveAtS;
  var world = this;
  return reducerSave(this, context, [source.loaded, target.loaded], function () {
    var delivered = {}, capacity = G.dungTich(target.planet);
    reducerResourceKeys().forEach(function (resource) {
      var held = Number(source.entity.cargo && source.entity.cargo[resource] || 0);
      if (!Number.isFinite(held) || held < 0) throw reducerWorldError('PAYLOAD_INTEGRITY');
      var room = Math.max(0, Math.floor(Number(capacity[resource]) * 1.5 -
        Number(target.planet.res[resource] || 0)));
      var moved = Math.min(held, room);
      target.planet.res[resource] = Number(target.planet.res[resource] || 0) + moved;
      source.entity.cargo[resource] = held - moved;
      delivered[resource] = moved;
    });
    if (G.tongRes(delivered) > 0) {
      G.tin(source.loaded.st, 'ham', 'Đã tiếp tế ' + target.loaded.st.ten, null,
        {res: delivered, t: effectiveAtS});
      G.tin(target.loaded.st, 'ham', 'Được tiếp tế từ ' + source.loaded.st.ten, null,
        {res: delivered, t: effectiveAtS});
      world.ghiBangTin(effectiveAtS, 'tiepte', source.loaded.st.ten + ' tiếp tế ' +
        G.so(G.tongRes(delivered)) + ' tài nguyên cho ' + target.loaded.st.ten +
        ' tại ' + G.tdStr(target.planet.c) + '.');
    } else {
      G.tin(source.loaded.st, 'ham', 'Kho bên nhận đã đầy',
        target.loaded.st.ten + ' không còn chỗ chứa. Hàng được mang về.');
    }
    G.batDauVe(source.loaded.st, source.entity, true, null);
    return {kind: 'transport', applied: true, authorized: true,
      atS: effectiveAtS, delivered: delivered};
  });
};

TheGioi.prototype.resolveSpyAt = function (ref, effectiveAtS, canonicalTarget) {
  var context = reducerWorldContext(this, effectiveAtS, canonicalTarget);
  if (context.neutralization) return reducerReturnOrRemove(this, ref, effectiveAtS, context);
  var source = reducerEntity(this, ref), currentTarget =
    reducerCanonicalContext(this, ref).target;
  if (source.entity.mission !== 'spy' || source.entity.pha !== 'di') {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  source.loaded.st.now = effectiveAtS;
  if (!currentTarget || currentTarget.accountId !== context.accountId) {
    return reducerSave(this, context, [source.loaded], function () {
      G.tin(source.loaded.st, 'tt', 'Mục tiêu do thám đã đổi chủ',
        'Hạm đội do thám quay về mà không thu thập dữ liệu.');
      G.batDauVe(source.loaded.st, source.entity, true, null);
      return {kind: 'spy', applied: true, authorized: false, atS: effectiveAtS};
    });
  }
  var target = reducerTarget(this, ref, context);
  var targetIdentity = this.kho.q.tkTheoId.get(currentTarget.accountId);
  if (!targetIdentity || !Number.isFinite(Number(targetIdentity.vaoCuoi))) {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  target.loaded.st.now = effectiveAtS;
  return reducerSave(this, context, [source.loaded, target.loaded], function () {
    var probes = Number(source.entity.ships && source.entity.ships.probe);
    if (!Number.isSafeInteger(probes) || probes < 1) {
      throw reducerWorldError('PAYLOAD_INTEGRITY');
    }
    var difference = Number(source.loaded.st.tech.spy || 0) -
      Number(target.loaded.st.tech.spy || 0);
    var level = Math.max(1, Math.min(5, 1 + Math.floor(difference / 2) +
      Math.floor(Math.log(probes + 1) / Math.log(3))));
    var probability = Math.min(0.9,
      0.05 * Number(target.planet.b && target.planet.b.intel || 0) +
      0.03 * Math.max(0, -difference));
    var random = G.rng(G.hash('spy' + source.entity.id + effectiveAtS + ref.targetKey));
    var lost = 0;
    for (var i = 0; i < probes; i++) if (random() < probability) lost++;
    if (lost > 0) {
      source.entity.ships.probe -= lost;
      if (!source.entity.ships.probe) delete source.entity.ships.probe;
    }
    var report = {td: source.entity.den, ten: targetIdentity.hienthi,
      ht: target.planet.ten, lm: reducerAllianceName(target.loaded.st) || '',
      diem: Math.round(G.diem(target.loaded.st).tong),
      bo: effectiveAtS - Number(targetIdentity.vaoCuoi) > CACH_LAU_MOI_VAO,
      mucDo: level, t: effectiveAtS, mat: lost, pvp: true,
      res: reducerResourceKeys().reduce(function (value, resource) {
        value[resource] = Math.floor(Number(target.planet.res[resource] || 0));
        return value;
      }, {}),
      ships: level >= 2 ? G.clone(target.planet.ships) : null,
      danSu: level >= 2 && target.planet.danSu ? {
        population: Math.floor(Number(target.planet.danSu.population || 0)),
        supportBp: Math.floor(Number(target.planet.danSu.supportBp || 0)),
        taxBp: Math.floor(Number(target.planet.danSu.taxBp || 0))
      } : null,
      def: level >= 3 ? G.clone(target.planet.def) : null,
      tech: level >= 4 ? G.clone(target.loaded.st.tech) : null,
      ct: level >= 5 ? G.clone(target.planet.b) : null,
      ctMode: level >= 5 ? 'quantity' : null};
    source.loaded.st.spy = source.loaded.st.spy || {};
    source.loaded.st.spy[ref.targetKey] = report;
    G.tin(source.loaded.st, 'tt', 'Báo cáo do thám', null, {bc: report});
    G.tin(target.loaded.st, 'tt', 'Bị do thám tại ' + G.tdStr(target.planet.c),
      source.loaded.st.ten + ' đã gửi ' + G.so(probes) + ' tàu do thám tới ' +
      target.planet.ten + ' ' + G.tdStr(target.planet.c) + '.' +
      (lost > 0 ? '\nTrung Tâm Tình Báo bắn hạ được ' + lost + ' chiếc.' :
        '\nKhông bắn hạ được chiếc nào — nên nâng Trung Tâm Tình Báo.'));
    if (reducerUnitCount(source.entity.ships)) {
      G.batDauVe(source.loaded.st, source.entity, true, null);
    } else {
      source.loaded.st.fleets.splice(source.loaded.st.fleets.indexOf(source.entity), 1);
    }
    return {kind: 'spy', applied: true, atS: effectiveAtS, report: report};
  });
};

TheGioi.prototype.resolveHoldAt = function (ref, effectiveAtS, canonicalTarget) {
  var context = reducerWorldContext(this, effectiveAtS, canonicalTarget);
  if (context.neutralization) return reducerReturnOrRemove(this, ref, effectiveAtS, context);
  var source = reducerEntity(this, ref), canonical = reducerCanonicalContext(this, ref),
    currentTarget = canonical.target;
  if (source.entity.mission !== 'hold' || source.entity.pha !== 'di') {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  source.loaded.st.now = effectiveAtS;
  var canonicalFleet = canonical.sourceState && canonical.sourceState.fleets.find(
    function (candidate) { return Number(candidate.id) === Number(ref.fleetId); }
  );
  var holdAuthorized = currentTarget && currentTarget.accountId === context.accountId &&
    canonicalFleet && reducerCanonicalHoldAllowed(Number(ref.ownerAccountId),
      canonical.sourceState,
      canonicalFleet, currentTarget);
  if (!holdAuthorized) {
    return reducerSave(this, context, [source.loaded], function () {
      G.tin(source.loaded.st, 'ham', 'Giữ quỹ đạo không còn hợp lệ',
        'Quyền sở hữu hoặc quan hệ liên minh đã thay đổi.');
      G.batDauVe(source.loaded.st, source.entity, true, null);
      return {kind: 'hold', applied: true, authorized: false, atS: effectiveAtS,
      chargedDeut: 0};
    });
  }
  return reducerSave(this, context, [source.loaded], function () {
    var duration = Math.max(1, Math.floor(Number(source.entity.giu) || 3600));
    var segment = Math.min(duration, G.QUY_DAO_V1.segmentSeconds);
    var charge = Math.max(0,
      Math.floor(G.nhienLieuGiu(source.loaded.st, source.entity.ships, segment)));
    var available = Number(source.entity.cargo && source.entity.cargo.deut || 0);
    if (!Number.isFinite(available) || available < charge) {
      throw reducerWorldError('PAYLOAD_INTEGRITY');
    }
    source.entity.cargo.deut = available - charge;
    if (!source.entity.cargo.deut) delete source.entity.cargo.deut;
    source.entity.pha = 'giu';
    source.entity.giuLuc = effectiveAtS;
    source.entity.giuDen_t = effectiveAtS + duration;
    source.entity.tiepNL_t = effectiveAtS + segment;
    source.entity.giuTaiTk = context.accountId;
    source.entity.giuRules = G.QUY_DAO_V1.holdRules;
    source.entity.dangGiu = true;
    return {kind: 'hold', applied: true, authorized: true,
      atS: effectiveAtS, chargedDeut: charge,
      holdUntilS: source.entity.giuDen_t, nextFuelAtS: source.entity.tiepNL_t};
  });
};

TheGioi.prototype.resolveMissileAt = function (ref, effectiveAtS, canonicalTarget) {
  var context = reducerWorldContext(this, effectiveAtS, canonicalTarget);
  if (context.neutralization) return reducerReturnOrRemove(this, ref, effectiveAtS, context);
  var source = reducerEntity(this, ref);
  source.loaded.st.now = effectiveAtS;
  var canonical = reducerCanonicalContext(this, ref), currentTarget = canonical.target;
  if (!currentTarget || currentTarget.accountId !== context.accountId ||
      !canonical.sourceState ||
      !reducerCanonicalAttackAllowed(this, Number(ref.ownerAccountId), canonical.sourceState,
        currentTarget.accountId, currentTarget.state, effectiveAtS)) {
    return reducerSave(this, context, [source.loaded], function () {
      source.loaded.st.tenLua.splice(source.loaded.st.tenLua.indexOf(source.entity), 1);
      G.tin(source.loaded.st, 'tran', 'Tên lửa bị Hội Đồng Bảo An chặn',
        'Quyền tấn công không còn hợp lệ khi tên lửa tới mục tiêu.');
      return {kind: 'missile', applied: true, authorized: false, atS: effectiveAtS};
    });
  }
  var target = reducerTarget(this, ref, context);
  target.loaded.st.now = effectiveAtS;
  var world = this;
  return reducerSave(this, context, [source.loaded, target.loaded], function () {
    var interceptors = Number(target.planet.mis && target.planet.mis.interceptor || 0);
    var result = G.noTenLua(source.entity.n, target.planet.def, interceptors,
      source.loaded.st.tech, target.loaded.st.tech,
      String(effectiveAtS) + ':' + source.entity.id + ':' + ref.targetKey);
    target.planet.mis.interceptor = Math.max(0, interceptors - result.chan);
    source.loaded.st.tenLua.splice(source.loaded.st.tenLua.indexOf(source.entity), 1);
    G.tin(source.loaded.st, 'tran', 'Kết quả bắn tên lửa', null,
      {tl: result, t: effectiveAtS});
    G.tin(target.loaded.st, 'tran', 'BỊ TẤN CÔNG BẰNG TÊN LỬA tại ' +
      G.tdStr(target.planet.c), null, {tl: result, t: effectiveAtS});
    world.ghiBangTin(effectiveAtS, 'tran', source.loaded.st.ten + ' bắn ' +
      source.entity.n + ' tên lửa vào ' + target.loaded.st.ten + ' tại ' +
      G.tdStr(target.planet.c) + '.');
    return {kind: 'missile', applied: true, authorized: true,
      atS: effectiveAtS, result: result};
  });
};

function reducerUnitCount(value) {
  return Object.keys(value || {}).reduce(function (sum, key) {
    return sum + Math.max(0, Math.floor(Number(value[key]) || 0));
  }, 0);
}

function reducerCombatStats(state) {
  state.stats = state.stats && typeof state.stats === 'object' ? state.stats : {};
  ['thang', 'thua', 'cuop', 'tauMat', 'tauDietDich', 'chuyenBay'].forEach(function (key) {
    if (!Number.isFinite(Number(state.stats[key]))) state.stats[key] = 0;
  });
  return state.stats;
}

TheGioi.prototype.resolvePvpAt = function (
  ref, effectiveAtS, seed, snapshot, canonicalTarget
) {
  var context = reducerWorldContext(this, effectiveAtS, canonicalTarget);
  if (context.neutralization) return reducerReturnOrRemove(this, ref, effectiveAtS, context);
  if (!snapshot || snapshot.seed !== seed || snapshot.arrivalAtS !== effectiveAtS) {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  var source = reducerEntity(this, ref);
  if (source.entity.mission !== 'attack' || source.entity.pha !== 'di') {
    throw reducerWorldError('PAYLOAD_INTEGRITY');
  }
  source.loaded.st.now = effectiveAtS;
  var canonical = reducerCanonicalContext(this, ref), currentTarget = canonical.target;
  if (!currentTarget || currentTarget.accountId !== context.accountId ||
      !canonical.sourceState ||
      !reducerCanonicalAttackAllowed(this, Number(ref.ownerAccountId), canonical.sourceState,
        currentTarget.accountId, currentTarget.state, effectiveAtS)) {
    return reducerSave(this, context, [source.loaded], function () {
      G.tin(source.loaded.st, 'he', 'Cuộc tấn công bị Hội Đồng Bảo An chặn',
        'Quyền tấn công không còn hợp lệ khi hạm đội tới mục tiêu.');
      G.batDauVe(source.loaded.st, source.entity, true, null);
      return {kind: 'pvp', applied: true, authorized: false, protected: false,
        atS: effectiveAtS};
    });
  }
  var target = reducerTarget(this, ref, context);
  var attackerPoints = G.diem(canonical.sourceState).tong;
  var defenderPoints = G.diem(currentTarget.state).tong;
  var newPlayerProtected =
    defenderPoints < G.C.BAO_VE_MOI_DIEM &&
      attackerPoints > defenderPoints * G.C.BAO_VE_MOI_TY_LE ||
    attackerPoints < G.C.BAO_VE_MOI_DIEM &&
      defenderPoints > attackerPoints * G.C.BAO_VE_MOI_TY_LE;
  if (newPlayerProtected) {
    return reducerSave(this, context, [source.loaded], function () {
      G.tin(source.loaded.st, 'he', 'Cuộc tấn công bị chặn',
        'Bảo vệ người chơi mới vẫn còn hiệu lực khi hạm đội tới mục tiêu.');
      G.batDauVe(source.loaded.st, source.entity, true, null);
      return {kind: 'pvp', applied: true, authorized: true, protected: true,
        atS: effectiveAtS};
    });
  }
  var supporterAccounts = new Map();
  function supporterFleetIndex(state) {
    if (!state || !Array.isArray(state.fleets)) throw reducerWorldError('PAYLOAD_INTEGRITY');
    var index = new Map();
    state.fleets.forEach(function (fleet) {
      if (!fleet || fleet.mission !== 'hold' || fleet.pha !== 'giu') return;
      var fleetId = Number(fleet.id);
      if (!Number.isSafeInteger(fleetId) || fleetId < 1 || index.has(fleetId)) {
        throw reducerWorldError('PAYLOAD_INTEGRITY');
      }
      index.set(fleetId, fleet);
    });
    return index;
  }
  function cacheSupporterAccount(accountId, loaded, canonicalState) {
    if (!loaded || !canonicalState) throw reducerWorldError('PAYLOAD_INTEGRITY');
    var cached = supporterAccounts.get(accountId);
    if (cached) {
      if (cached.loaded !== loaded || cached.canonicalState !== canonicalState) {
        throw reducerWorldError('PAYLOAD_INTEGRITY');
      }
      return cached;
    }
    cached = {loaded: loaded, canonicalState: canonicalState,
      fleets: supporterFleetIndex(loaded.st),
      canonicalFleets: supporterFleetIndex(canonicalState)};
    supporterAccounts.set(accountId, cached);
    return cached;
  }
  cacheSupporterAccount(Number(ref.ownerAccountId), source.loaded, canonical.sourceState);
  cacheSupporterAccount(context.accountId, target.loaded, currentTarget.state);
  var excludedSupporters = [];
  var supporters = snapshot.supporters.map(function (entry) {
    var account = supporterAccounts.get(entry.accountId);
    if (!account) {
      account = cacheSupporterAccount(entry.accountId, this.nap(entry.accountId),
        canonical.states.get(entry.accountId));
    }
    var loaded = account.loaded, fleet = account.fleets.get(entry.fleetId);
    if (!loaded || !fleet || Number(loaded.row.revision) !== entry.revision) {
      throw reducerWorldError('PAYLOAD_INTEGRITY');
    }
    var canonicalSupporterState = canonical.states.get(entry.accountId);
    var canonicalSupporterFleet = account.canonicalFleets.get(entry.fleetId);
    if (!canonicalSupporterFleet ||
        !reducerCanonicalHoldAllowed(entry.accountId, canonicalSupporterState,
          canonicalSupporterFleet, currentTarget)) {
      G.batDauVe(loaded.st, fleet, true,
        'Quyền hỗ trợ tại mục tiêu không còn hợp lệ; hạm đội quay về.');
      excludedSupporters.push({loaded: loaded, fleet: fleet, snapshot: entry});
      return null;
    }
    return {loaded: loaded, fleet: fleet, snapshot: entry};
  }, this).filter(Boolean);
  var supportersByAccount = new Map();
  supporters.forEach(function (supporter) {
    if (!supportersByAccount.has(supporter.snapshot.accountId)) {
      supportersByAccount.set(supporter.snapshot.accountId, supporter);
    }
  });
  target.loaded.st.now = effectiveAtS;
  var world = this;
  return reducerSave(this, context,
    [source.loaded, target.loaded].concat(supporters.concat(excludedSupporters)
      .map(function (item) { return item.loaded; })),
  function () {
    var groups = [{ships: snapshot.defender.ships, tech: snapshot.defender.tech}]
      .concat(supporters.map(function (entry) {
        return {ships: entry.snapshot.ships, tech: entry.snapshot.tech};
      }));
    var result = G.danhTran({ten: source.loaded.st.ten, tech: snapshot.attacker.tech,
      ships: snapshot.attacker.ships}, {ten: target.loaded.st.ten + ' — ' + target.planet.ten,
      tech: snapshot.defender.tech, nhomTau: groups, def: snapshot.defender.def,
      thuDat: snapshot.defender.terrain.thuDat,
      loaiHT: snapshot.defender.terrain.loaiHT}, String(seed));
    source.entity.ships = result.conShipsA || {};
    source.entity.linh = G.clone(snapshot.attacker.linh || {});
    target.planet.ships = result.conNhomD && result.conNhomD[0] || {};
    target.planet.def = G.clone(result.conDefD || {});
    target.planet.linh = G.clone(snapshot.defender.linh || {});
    supporters.forEach(function (supporter, index) {
      supporter.fleet.ships = result.conNhomD && result.conNhomD[index + 1] || {};
      if (!reducerUnitCount(supporter.fleet.ships)) {
        supporter.loaded.st.fleets.splice(supporter.loaded.st.fleets.indexOf(supporter.fleet), 1);
      }
    });
    var ground = null;
    if (result.kq === 'thang' && reducerUnitCount(source.entity.linh)) {
      var groundDefense = G.thuMatDat(target.planet.def);
      ground = G.doBoXuong(source.loaded.st, source.entity, {
        ten: target.loaded.st.ten + ' — ' + target.planet.ten,
        tech: snapshot.defender.tech, linh: target.planet.linh,
        def: groundDefense, thuDat: snapshot.defender.terrain.thuDat,
        p: target.planet
      });
      G.gopThuMatDat(target.planet.def, groundDefense);
      reducerCombatStats(source.loaded.st).doBo =
        Number(reducerCombatStats(source.loaded.st).doBo || 0) + 1;
    }
    var loot = {metal: 0, crystal: 0, deut: 0, food: 0};
    if (result.kq === 'thang') {
      loot = G.chiaHang(target.planet.res,
        Math.max(0, G.khoangHang(source.entity.ships) - G.tongRes(source.entity.cargo)),
        ground && ground.thang ? Math.min(0.85, G.C.CUOP_TOI_DA + G.C.CUOP_DO_BO) :
          G.C.CUOP_TOI_DA);
      reducerResourceKeys().forEach(function (resource) {
        target.planet.res[resource] = Number(target.planet.res[resource] || 0) -
          Number(loot[resource] || 0);
        source.entity.cargo[resource] = Number(source.entity.cargo[resource] || 0) +
          Number(loot[resource] || 0);
      });
    }
    var debris = world.plLay(ref.targetKey);
    debris.metal += Number(result.pheLieu && result.pheLieu.metal || 0);
    debris.crystal += Number(result.pheLieu && result.pheLieu.crystal || 0);
    var attackerStats = reducerCombatStats(source.loaded.st);
    var defenderStats = reducerCombatStats(target.loaded.st);
    var attackerLosses = reducerUnitCount(result.matA);
    var defenderLosses = 0, lossesByOwner = new Map();
    (result.matNhomD || []).forEach(function (losses, index) {
      var lost = reducerUnitCount(losses), ownerId = index === 0 ? context.accountId :
        supporters[index - 1].snapshot.accountId;
      defenderLosses += lost;
      lossesByOwner.set(ownerId, Number(lossesByOwner.get(ownerId) || 0) + lost);
    });
    if (result.kq === 'thang') {
      attackerStats.thang += 1;
      attackerStats.cuop += G.tongRes(loot);
      defenderStats.thua += 1;
    } else {
      attackerStats.thua += 1;
      defenderStats.thang += 1;
    }
    attackerStats.tauMat += attackerLosses;
    attackerStats.tauDietDich += defenderLosses;
    defenderStats.tauDietDich += attackerLosses;
    lossesByOwner.forEach(function (lost, ownerId) {
      var participant = ownerId === context.accountId ? target.loaded :
        supportersByAccount.get(ownerId).loaded;
      reducerCombatStats(participant.st).tauMat += lost;
    });
    var supporterReports = [];
    supportersByAccount.forEach(function (supporter, ownerId) {
      if (ownerId === context.accountId) return;
      var account = world.kho.q.tkTheoId.get(ownerId);
      var name = account ? account.hienthi : supporter.loaded.st.ten;
      supporterReports.push({tk: ownerId, ten: name,
        mat: Number(lossesByOwner.get(ownerId) || 0)});
    });
    var sourceDetail = {kq: result, cuop: loot, pl: result.pheLieu,
      td: target.planet.c, ben: 'ta', pvp: true, doiThu: target.loaded.st.ten,
      doBo: ground, hoTro: supporterReports};
    var targetDetail = {kq: result, cuop: loot, pl: result.pheLieu,
      td: target.planet.c, ben: 'dich', pvp: true, doiThu: source.loaded.st.ten,
      doBo: ground, hoTro: supporterReports};
    G.tin(source.loaded.st, 'tran', 'Báo cáo chiến đấu ' + G.tdStr(target.planet.c),
      null, sourceDetail);
    G.tin(target.loaded.st, 'tran',
      ground && ground.thang ? 'BỊ ĐỔ BỘ tại ' + G.tdStr(target.planet.c) :
        'BỊ TẤN CÔNG tại ' + G.tdStr(target.planet.c), null, targetDetail);
    supporterReports.forEach(function (supporterReport) {
      var participant = supportersByAccount.get(supporterReport.tk);
      G.tin(participant.loaded.st, 'tran', 'Hỗ trợ phòng thủ tại ' +
        G.tdStr(target.planet.c) + ' — ' + source.loaded.st.ten, null,
      {kq: result, cuop: loot, pl: result.pheLieu, td: target.planet.c,
        ben: 'hotro', pvp: true, doiThu: source.loaded.st.ten,
        chuNha: target.loaded.st.ten, mat: supporterReport.mat,
        doBo: ground, hoTro: supporterReports});
    });
    world.ghiTran(effectiveAtS, Number(ref.ownerAccountId), context.accountId,
      ref.targetKey, result.kq, Math.round(G.tongRes(loot)),
      reducerUnitCount(result.matA),
      (result.matNhomD || []).reduce(function (sum, map) { return sum + reducerUnitCount(map); }, 0));
    world.ghiBangTin(effectiveAtS, 'tran', source.loaded.st.ten + ' đánh ' +
      target.loaded.st.ten + ' tại ' + G.tdStr(target.planet.c));
    if (!reducerUnitCount(source.entity.ships)) {
      source.loaded.st.fleets.splice(source.loaded.st.fleets.indexOf(source.entity), 1);
    } else G.batDauVe(source.loaded.st, source.entity, true, null);
    return {kind: 'pvp', applied: true, authorized: true, protected: false,
      atS: effectiveAtS, result: result,
      ground: ground,
      loot: loot, debris: {metal: Number(result.pheLieu && result.pheLieu.metal || 0),
        crystal: Number(result.pheLieu && result.pheLieu.crystal || 0)},
      supporterCount: supporters.length, excludedSupporterCount: excludedSupporters.length};
  });
};

var RULES_HOOK_METHODS = Object.freeze([
  'nangCapDuLieu', 'seed', 'batDau', 'ketThuc', 'ghiBangTin', 'ghiTran',
  'npcLay', 'npcGhi', 'plLay', 'laDongMinh', 'quyenDanh', 'kiemTraGui',
  'kiemTraGiu', 'chuHienTai', 'oNguoi', 'nap', 'layStateNoiBo', '_chuanBiLuu',
  '_ghiChiMucHam', '_ghiNhieu', 'luu', '_dongBoChiMucTrongGD', '_chiMucTuCanonical',
  'dongBoChiMuc', 'hamDangToi', 'hamGiuTai', 'hanhDong',
  'danhNguoi', 'doThamNguoi', 'tangNguoi', 'xepHangCho', 'xemHe',
  'oTrong', 'timNha', 'taoDeQuoc', 'tenLuaNguoi', 'xoaTaiKhoan',
  'guiThu', 'tuyenChien', 'chienCua', 'chuyenGalana', 'lmDS', 'lmTao',
  'lmThanhVien', 'lmXin', 'lmDuyet', 'lmDuoi', 'lmChuyenChu', 'lmRa',
  'nhip', 'resolvePvpAt', 'resolveTransportAt', 'resolveSpyAt',
  'resolveHoldAt', 'resolveMissileAt'
]);

function sameNames(left, right) {
  return left.length === right.length && left.every(function (name, index) {
    return name === right[index];
  });
}

function bindRulesHooks() {
  var ignored = new Set(['constructor', 'veHook', 'withRulesHook', 'datScheduler',
    'datAdvanceService', 'trongMutationScheduler', '_schedulerActive',
    '_tickNoiBo',
    'advanceAccountNoiBo', '_assertSchedulerFinalFence', 'tick',
    '_dongBoSchedulerLuu', '_dongBoSchedulerCreations']);
  var actual = Object.getOwnPropertyNames(TheGioi.prototype)
    .filter(function (name) { return !ignored.has(name); })
    .sort();
  var expected = RULES_HOOK_METHODS.slice().sort();
  if (!sameNames(actual, expected)) throw new Error('WORLD_RULES_HOOK_METHODS_OUT_OF_DATE');
  RULES_HOOK_METHODS.forEach(function (name) {
    var raw = TheGioi.prototype[name];
    var wrapped = function () {
      var self = this;
      var args = arguments;
      return self.withRulesHook(function () { return raw.apply(self, args); });
    };
    if (/^resolve(?:Pvp|Transport|Spy|Hold|Missile)At$/.test(name)) {
      Object.defineProperty(wrapped, 'length', {value: raw.length});
    }
    Object.defineProperty(TheGioi.prototype, name, {
      configurable: true,
      enumerable: true,
      value: wrapped,
      writable: true
    });
  });
}

bindRulesHooks();
module.exports = {TheGioi: TheGioi, G: G, RULES_HOOK_METHODS: RULES_HOOK_METHODS};
