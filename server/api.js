/* THIÊN HÀ ĐẠI CHIẾN — API HTTP (JSON) cho bản nhiều người chơi
 * Xác thực: scrypt cho mật khẩu, token phiên gửi qua header x-thdc-token.
 * Nguyên tắc: client KHÔNG được tin. Mọi hành động chạy lại trên server. */
'use strict';
var crypto = require('crypto');
var G = require('./rules.js').G;
var taoClock = require('./clock.js').taoClock;
var releaseVersion = require('../package.json').version;

var PHIEN_HAN = 30 * 86400;
var BODY_MAX = 96 * 1024;
var CHAT_HAN = 30 * 86400;
var CHAT_TOI_DA = 300;
var NHIP_CUA = 10;

/* ------------------------------------------------------------ mật khẩu */
function bam(mk, muoi) { return crypto.scryptSync(String(mk), muoi, 64, { N: 16384, r: 8, p: 1 }).toString('hex'); }
function bangNhau(a, b) {
  var x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/* ------------------------------------------------------------ tiện ích */
function json(res, ma, o) {
  var s = JSON.stringify(o);
  res.writeHead(ma, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(s);
}
function loiKH(msg, ma) { var e = new Error(msg); e.ma = ma || 400; return e; }

function docBody(req) {
  return new Promise(function (ok, loi) {
    var n = 0, buf = [], qua = false;
    req.on('data', function (c) {
      if (qua) return;                       /* vẫn đọc hết để còn trả lời được */
      n += c.length;
      if (n > BODY_MAX) { qua = true; buf = []; return; }
      buf.push(c);
    });
    req.on('end', function () {
      if (qua) return loi(loiKH('Dữ liệu gửi lên quá lớn.', 413));
      if (!buf.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(buf).toString('utf8'))); }
      catch (e) { loi(loiKH('JSON không hợp lệ.', 400)); }
    });
    req.on('error', loi);
  });
}
function chuoi(v, dai) { return String(v === undefined || v === null ? '' : v).slice(0, dai); }
function cloneJson(v) { return G.clone ? G.clone(v) : JSON.parse(JSON.stringify(v)); }
function ketQuaLenh(value) {
  if (value && value.deferred === true && typeof value.code === 'string') {
    var e = new Error(value.code);
    e.code = value.code;
    throw e;
  }
  return value;
}

/* ------------------------------------------------------------------ API */
function API(kho, tg, options) {
  options = options || {};
  var env = options.env || {};
  this.kho = kho;
  this.tg = tg;
  this.clock = options.clock || taoClock();
  this.logger = options.logger;
  this.scheduler = options.scheduler;
  this.gameNow = options.gameNow || function () { return Math.floor(this.clock.nowMs() / 1000); }.bind(this);
  if (!this.scheduler || typeof this.scheduler.runCommand !== 'function')
    throw new TypeError('SCHEDULER_BRIDGE_REQUIRED');
  if (typeof options.getUniverseSeed !== 'function') throw new TypeError('GET_UNIVERSE_SEED_REQUIRED');
  if (typeof options.ensureUniverseBootstrap !== 'function')
    throw new TypeError('ENSURE_UNIVERSE_BOOTSTRAP_REQUIRED');
  this.getUniverseSeed = options.getUniverseSeed;
  this.ensureUniverseBootstrap = options.ensureUniverseBootstrap;
  this.tinProxy = env.THDC_PROXY === '1';
  this.nhipToiDa = parseInt(env.THDC_GIOI_HAN || '40', 10);
  this.nhipXacThuc = parseInt(env.THDC_GIOI_HAN_DN || '8', 10);
  this.nhip = new Map();     // token/ip -> {n, tu}
  this.chatDonLuc = 0;
}

API.prototype.gioiHan = function (khoa, tran) {
  var now = this.clock.nowMs();
  var o = this.nhip.get(khoa);
  if (!o || now - o.tu > NHIP_CUA * 1000) { this.nhip.set(khoa, { n: 1, tu: now }); return true; }
  o.n++;
  if (this.nhip.size > 5000) this.nhip.clear();
  return o.n <= (tran || this.nhipToiDa);
};

/* Chat được đọc liên tục bởi mọi client. Luôn lọc TTL trong SELECT, còn DELETE
   chỉ chạy tối đa mỗi giờ để không biến polling 8 giây thành chuỗi write-lock. */
API.prototype.donChat = function (now) {
  if (now - this.chatDonLuc < 3600) return;
  this.kho.q.chatDonRac.run(now - CHAT_HAN);
  this.chatDonLuc = now;
};

API.prototype.phien = function (req) {
  var t = req.headers['x-thdc-token'];
  if (!t) return null;
  var r = this.kho.q.phienGet.get(String(t).slice(0, 80));
  if (!r) return null;
  var now = this.gameNow();
  if (r.hetHan < now) return { expiredToken: r.token, tk: r.tk };
  var tk = this.kho.q.tkTheoId.get(r.tk);
  if (!tk) return null;
  return { token: r.token, tk: tk.id, tkRow: tk };
};

API.prototype.thongTin = function () {
  return {
    seed: this.getUniverseSeed(),
    soNguoi: this.kho.q.tkDem.get().n,
    soHT: this.kho.q.htDem.get().n,
    tocDo: G.C.TOC_DO_SERVER,
    tocDoBay: G.C.TOC_DO_BAY,
    chuKy: G.C.CHU_KY_BAO_TRI,
    releaseVersion: releaseVersion,
    phienBanLichSu: G.PHIEN_BAN_LICH_SU,
    stateVersion: G.STATE_VERSION,
    phienBan: G.VERSION,
    now: this.gameNow()
  };
};

API.prototype.commandFor = function (p, name, run) {
  var self = this;
  return Promise.resolve(self.scheduler.runCommand({
    name: name,
    accountId: p ? p.tk : undefined,
    run: run
  })).then(ketQuaLenh);
};

API.prototype.schedulerDurable = function () {
  if (!this.scheduler || typeof this.scheduler.getStatus !== 'function') return false;
  try {
    var status = this.scheduler.getStatus() || {};
    return status.mode === 'durable';
  } catch (e) { return false; }
};

API.prototype.markLastSeen = function (p) {
  var self = this;
  return self.commandFor(p, 'last-seen', function () { return self.kho.q.tkVao.run(self.gameNow(), p.tk); });
};

API.prototype.tuyChonMutationScheduler = function () {
  return this.tg && this.tg._schedulerMutation ? {mutation: this.tg._schedulerMutation} : undefined;
};

async function xuLyPhienExpired(self, p, res) {
  await self.commandFor(p, 'session-expiry', function () {
    self.kho.q.phienXoa.run(p.expiredToken);
    return null;
  });
  return json(res, 401, {loi: 'Chưa đăng nhập.'});
}

async function xuLyHeDaXacThuc(self, p, truyVan, res) {
  await self.markLastSeen(p);
  var he = await self.commandFor(p, 'system-read', function () {
    return self.tg.xemHe(p.tk, truyVan.get('g'), truyVan.get('h'));
  });
  return json(res, 200, he);
}

API.prototype.goiState = function (p) {
  var st = this.tg.layStateNoiBo(p.tk);
  if (!st) return null;
  st = cloneJson(st);
  /* gắn thêm thông tin chỉ có server biết (không nằm trong state đã lưu) */
  st.pvpToi = this.tg.hamDangToi(p.tk);
  st.pvpGiu = this.tg.hamGiuTai(p.tk);
  return {
    st: st,
    sv: this.thongTin(),
    toi: { ten: p.tkRow.hienthi, tk: p.tk }
  };
};

/* ---------------------------------------------------------- các đường dẫn */
API.prototype.xuLy = async function (req, res, duong, truyVan) {
  var self = this;
  var ip = self.tinProxy
    ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0].trim()
    : String(req.socket.remoteAddress || '?');

  /* ---- công khai ---- */
  if (duong === '/api/thongtin') {
    await self.ensureUniverseBootstrap();
    return json(res, 200, self.thongTin());
  }

  if (duong === '/api/dangky' && req.method === 'POST') {
    if (!self.gioiHan('dk:' + ip, self.nhipXacThuc)) return json(res, 429, { loi: 'Thao tác quá nhanh, chờ một lát.' });
    var b = await docBody(req);
    var ten = chuoi(b.ten, 24).trim();
    var mk = chuoi(b.mk, 200);
    var hienthi = chuoi(b.hienthi, 24).trim() || ten;
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(ten)) return json(res, 400, { loi: 'Tên đăng nhập 3–24 ký tự, chỉ chữ/số/._-' });
    if (mk.length < 6) return json(res, 400, { loi: 'Mật khẩu phải từ 6 ký tự.' });
    if (!/^[^<>&"]{2,24}$/.test(hienthi)) return json(res, 400, { loi: 'Tên chỉ huy 2–24 ký tự, không chứa < > & "' });
    var khoa = ten.toLowerCase();
    if (self.kho.q.tkTheoTen.get(khoa)) return json(res, 409, { loi: 'Tên đăng nhập đã có người dùng.' });
    await self.ensureUniverseBootstrap();
    var muoi = crypto.randomBytes(16).toString('hex');
    var mkBam = bam(mk, muoi);
    var now = self.gameNow();
    var registration = await self.commandFor(null, 'register', function () {
      self.kho.q.tkThem.run(khoa, hienthi, mkBam, muoi, now, now);
      var tk = self.kho.q.tkTheoTen.get(khoa);
      var kq = self.tg.taoDeQuoc(tk.id, hienthi, self.tuyChonMutationScheduler());
      if (kq.loi) return {loi: kq.loi};
      var token = crypto.randomBytes(24).toString('hex');
      self.kho.q.phienThem.run(token, tk.id, now, now + PHIEN_HAN);
      return {token: token, ten: hienthi, nha: kq.nha};
    });
    if (registration.loi) return json(res, 500, { loi: registration.loi });
    return json(res, 200, registration);
  }

  if (duong === '/api/dangnhap' && req.method === 'POST') {
    if (!self.gioiHan('dn:' + ip, self.nhipXacThuc)) return json(res, 429, { loi: 'Thao tác quá nhanh, chờ một lát.' });
    var b2 = await docBody(req);
    var ten2 = chuoi(b2.ten, 24).trim().toLowerCase();
    var tk2 = self.kho.q.tkTheoTen.get(ten2);
    if (!tk2 || !bangNhau(bam(chuoi(b2.mk, 200), tk2.muoi), tk2.mk))
      return json(res, 401, { loi: 'Sai tên đăng nhập hoặc mật khẩu.' });
    await self.ensureUniverseBootstrap();
    var now2 = self.gameNow();
    var login = await self.commandFor({tk: tk2.id}, 'login', function () {
      var token2 = crypto.randomBytes(24).toString('hex');
      self.kho.q.phienThem.run(token2, tk2.id, now2, now2 + PHIEN_HAN);
      self.kho.q.tkVao.run(now2, tk2.id);
      self.kho.q.phienDonRac.run(now2);
      if (!self.kho.q.dqGet.get(tk2.id))
        self.tg.taoDeQuoc(tk2.id, tk2.hienthi, self.tuyChonMutationScheduler());
      return {token: token2, ten: tk2.hienthi};
    });
    return json(res, 200, login);
  }

  /* ---- cần đăng nhập ---- */
  var p = self.phien(req);
  if (p && p.expiredToken) return xuLyPhienExpired(self, p, res);
  if (!p) return json(res, 401, { loi: 'Chưa đăng nhập.' });
  if (!self.gioiHan('t:' + p.token)) return json(res, 429, { loi: 'Thao tác quá nhanh, chờ một nhịp.' });

  /* Đọc body là một điểm `await`: trong lúc client gửi chậm, một request khác
     có thể đổi mật khẩu/đăng xuất và thu hồi phiên này. Luôn xác thực lại sau
     khi body đã tới đủ, đồng thời nạp tkRow mới nhất trước thao tác nhạy cảm. */
  async function docBodyDaXacThuc() {
    var b = await docBody(req);
    var pMoi = self.phien(req);
    if (pMoi && pMoi.expiredToken) {
      await self.commandFor(pMoi, 'session-expiry', function () {
        self.kho.q.phienXoa.run(pMoi.expiredToken);
        return null;
      });
      throw loiKH('Phiên đăng nhập đã hết hạn.', 401);
    }
    if (!pMoi || pMoi.token !== p.token || pMoi.tk !== p.tk)
      throw loiKH('Phiên đăng nhập đã hết hạn.', 401);
    p = pMoi;
    return b;
  }

  if (duong === '/api/dangxuat') {
    await self.commandFor(p, 'logout', function () {
      self.kho.q.tkVao.run(self.gameNow(), p.tk);
      self.kho.q.phienXoa.run(p.token);
      return null;
    });
    return json(res, 200, { ok: true });
  }

  if (duong === '/api/state') {
    await self.markLastSeen(p);
    var g = await self.commandFor(p, 'state-read', function () {
      return self.goiState(p);
    });
    if (!g) return json(res, 500, { loi: 'Không nạp được đế quốc.' });
    return json(res, 200, g);
  }

  if (duong === '/api/lam' && req.method === 'POST') {
    await self.markLastSeen(p);
    var b3 = await docBodyDaXacThuc();
    var ten3 = chuoi(b3.ten, 24);
    if (!G.HANHDONG[ten3]) return json(res, 400, { loi: 'Hành động không tồn tại.' });
    /* Multiplayer phải qua đơn xin + chủ duyệt; không cho gọi thẳng luật dùng
       chung để lách bộ máy điều hành liên minh. */
    if (ten3 === 'lmvao') return json(res, 400, { loi: 'Hãy gửi đơn xin gia nhập và chờ chủ liên minh duyệt.' });
    var kq3 = await self.commandFor(p, 'action', function () {
      return ten3 === 'lmra' ? self.tg.lmRa(p.tk) : self.tg.hanhDong(p.tk, ten3, b3.dl || {});
    });
    if (!kq3.st) return json(res, 503, { loi: kq3.loi || 'Server đang xử lý, thử lại.' });
    /* lỗi luật chơi (không đủ tài nguyên, chưa đủ điều kiện...) không phải lỗi
       HTTP: vẫn trả 200 kèm state mới nhất để client vẽ lại cho khớp server. */
    kq3.st.pvpToi = self.tg.hamDangToi(p.tk);
    kq3.st.pvpGiu = self.tg.hamGiuTai(p.tk);
    return json(res, 200, { loi: kq3.loi, st: kq3.st, sv: self.thongTin() });
  }

  if (duong === '/api/he') {
    return xuLyHeDaXacThuc(self, p, truyVan, res);
  }

  if (duong === '/api/xephang') {
    await self.markLastSeen(p);
    var r4 = self.tg.nap(p.tk);
    var loai4 = chuoi(truyVan.get('loai') || 'tong', 8);
    return json(res, 200, { loai: loai4, ds: self.tg.xepHangCho(r4 ? r4.st : null, loai4) });
  }

  if (duong === '/api/lm') {
    await self.markLastSeen(p);
    var r5 = self.tg.nap(p.tk);
    var cua = r5 && r5.st.lm ? r5.st.lm.ten : null;
    var lmHienTai = cua ? self.kho.q.lmGet.get(cua) : null;
    var laChu = !!lmHienTai && lmHienTai.chu === p.tk;
    return json(res, 200, {
      ds: self.tg.lmDS(),
      tv: cua ? self.tg.lmThanhVien(cua, p.tk) : [],
      xin: self.kho.q.lmXinCua.all(p.tk),
      don: laChu ? self.kho.q.lmXinDS.all(cua) : [],
      laChu: laChu,
      chien: self.tg.chienCua(p.tk)
    });
  }

  if (duong === '/api/tuyenchien' && req.method === 'POST') {
    await self.markLastSeen(p);
    var bChien = await docBodyDaXacThuc();
    var loiChien = await self.commandFor(p, 'war', function () {
      return self.tg.tuyenChien(p.tk, bChien.tk);
    });
    if (loiChien) return json(res, 400, { loi: loiChien });
    return json(res, 200, { ok: true, chien: self.tg.chienCua(p.tk) });
  }

  if (duong === '/api/chuyengalana' && req.method === 'POST') {
    await self.markLastSeen(p);
    var bGalana = await docBodyDaXacThuc();
    var transfer = await self.commandFor(p, 'transfer-galana', function () {
      var loiGalana = self.tg.chuyenGalana(p.tk, bGalana.tk, bGalana.so);
      if (loiGalana) return {loi: loiGalana, game: null};
      return {loi: null, game: self.goiState(p)};
    });
    if (transfer.loi) return json(res, 400, { loi: transfer.loi });
    var gGalana = transfer.game;
    return json(res, 200, { ok: true, st: gGalana && gGalana.st, sv: self.thongTin() });
  }

  if (duong === '/api/lmtao' && req.method === 'POST') {
    await self.markLastSeen(p);
    var b6 = await docBodyDaXacThuc();
    var kq6 = await self.commandFor(p, 'alliance', function () {
      return self.tg.lmTao(p.tk, b6.ten, b6.tag);
    });
    if (kq6.loi) return json(res, kq6.ma || 400, { loi: kq6.loi, st: kq6.st, sv: self.thongTin() });
    return json(res, 200, { loi: kq6.loi, st: kq6.st, sv: self.thongTin() });
  }

  if (duong === '/api/lmxin' && req.method === 'POST') {
    await self.markLastSeen(p);
    var bXin = await docBodyDaXacThuc();
    var loiXin = await self.commandFor(p, 'alliance', function () {
      return self.tg.lmXin(p.tk, bXin.ten);
    });
    if (loiXin) return json(res, 400, { loi: loiXin });
    return json(res, 200, { ok: true });
  }

  if ((duong === '/api/lmduyet' || duong === '/api/lmtuchoi') && req.method === 'POST') {
    await self.markLastSeen(p);
    var bDuyet = await docBodyDaXacThuc();
    var loiDuyet = await self.commandFor(p, 'alliance', function () {
      return self.tg.lmDuyet(p.tk, bDuyet.tk, duong === '/api/lmduyet');
    });
    if (loiDuyet) return json(res, 400, { loi: loiDuyet });
    return json(res, 200, { ok: true });
  }

  if (duong === '/api/lmduoi' && req.method === 'POST') {
    await self.markLastSeen(p);
    var bDuoi = await docBodyDaXacThuc();
    var loiDuoi = await self.commandFor(p, 'alliance', function () {
      return self.tg.lmDuoi(p.tk, bDuoi.tk);
    });
    if (loiDuoi) return json(res, 400, { loi: loiDuoi });
    return json(res, 200, { ok: true });
  }

  if (duong === '/api/lmchuyen' && req.method === 'POST') {
    await self.markLastSeen(p);
    var bChuyen = await docBodyDaXacThuc();
    var loiChuyen = await self.commandFor(p, 'alliance', function () {
      return self.tg.lmChuyenChu(p.tk, bChuyen.tk);
    });
    if (loiChuyen) return json(res, 400, { loi: loiChuyen });
    return json(res, 200, { ok: true });
  }

  if (duong === '/api/bangtin') {
    await self.markLastSeen(p);
    return json(res, 200, {
      bt: self.kho.q.btDS.all(40),
      tran: self.kho.q.tranDS.all(20)
    });
  }

  if (duong === '/api/chat' && req.method === 'GET') {
    await self.markLastSeen(p);
    var chat = await self.commandFor(p, 'chat', function () {
      var dqChat = self.kho.q.dqGet.get(p.tk);
      var lmChat = dqChat && dqChat.lm ? dqChat.lm : null;
      var khiDocChat = self.gameNow(), tuChat = khiDocChat - CHAT_HAN;
      self.donChat(khiDocChat);
      /* SQL lấy mới nhất trước để LIMIT đúng, API đảo lại cho giao diện đọc từ
         cũ tới mới. Người không ở liên minh không bao giờ nhận được kênh riêng. */
      return {
        chung: self.kho.q.chatChung.all(tuChat, 60).reverse(),
        lienminh: lmChat ? self.kho.q.chatLM.all(lmChat, tuChat, 60).reverse() : [],
        lm: lmChat
      };
    });
    return json(res, 200, chat);
  }

  if (duong === '/api/chat' && req.method === 'POST') {
    await self.markLastSeen(p);
    var bChat = await docBodyDaXacThuc();
    var kenhChat = chuoi(bChat.kenh, 12);
    if (kenhChat !== 'chung' && kenhChat !== 'lienminh')
      return json(res, 400, { loi: 'Kênh chat không hợp lệ.' });
    var noiTho = String(bChat.noi === undefined || bChat.noi === null ? '' : bChat.noi);
    if (noiTho.length > CHAT_TOI_DA)
      return json(res, 400, { loi: 'Tin chat dài tối đa ' + CHAT_TOI_DA + ' ký tự.' });
    var noiChat = noiTho.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!noiChat) return json(res, 400, { loi: 'Không gửi được tin chat trống.' });
    var dqChat2 = self.kho.q.dqGet.get(p.tk);
    var lmChat2 = dqChat2 && dqChat2.lm ? dqChat2.lm : null;
    if (kenhChat === 'lienminh' && !lmChat2)
      return json(res, 403, { loi: 'Phải ở trong liên minh mới dùng được kênh này.' });
    /* Tách giới hạn chat khỏi hạn mức API chung: tối đa 3 tin trong 10 giây. */
    if (!self.gioiHan('chat:' + p.tk, 3))
      return json(res, 429, { loi: 'Gửi chat chậm thôi — chờ vài giây.' });
    var khiChat = self.gameNow();
    await self.commandFor(p, 'chat', function () {
      self.kho.q.chatThem.run(khiChat, p.tk, p.tkRow.hienthi, lmChat2, kenhChat, noiChat);
      self.donChat(khiChat);
      return null;
    });
    return json(res, 200, { ok: true });
  }

  if (duong === '/api/guithu' && req.method === 'POST') {
    await self.markLastSeen(p);
    var b9 = await docBodyDaXacThuc();
    /* chống spam: mỗi người gửi tối đa 1 thư / cửa sổ giới hạn 10 giây */
    if (!self.gioiHan('thu:' + p.tk, 1)) return json(res, 429, { loi: 'Gửi thư chậm thôi — chờ vài giây.' });
    var loi9 = await self.commandFor(p, 'mail', function () {
      return self.tg.guiThu(p.tk, p.tkRow.hienthi, b9.den, b9.noi);
    });
    if (loi9) return json(res, 400, { loi: loi9 });
    return json(res, 200, { ok: true });
  }

  if (duong === '/api/xoatk' && req.method === 'POST') {
    await self.markLastSeen(p);
    var b8 = await docBodyDaXacThuc();
    if (!bangNhau(bam(chuoi(b8.mk, 200), p.tkRow.muoi), p.tkRow.mk))
      return json(res, 401, { loi: 'Mật khẩu không đúng.' });
    if (chuoi(b8.xacnhan, 40) !== 'XOA')
      return json(res, 400, { loi: 'Cần gõ đúng chữ XOA để xác nhận.' });
    var loiX = await self.commandFor(p, 'account-delete', function () {
      return self.tg.xoaTaiKhoan(p.tk, p.tkRow.hienthi);
    });
    if (loiX) return json(res, 503, { loi: loiX });
    return json(res, 200, { ok: true });
  }

  if (duong === '/api/doimk' && req.method === 'POST') {
    await self.markLastSeen(p);
    var b7 = await docBodyDaXacThuc();
    if (!bangNhau(bam(chuoi(b7.cu, 200), p.tkRow.muoi), p.tkRow.mk))
      return json(res, 401, { loi: 'Mật khẩu hiện tại không đúng.' });
    var moi = chuoi(b7.moi, 200);
    if (moi.length < 6) return json(res, 400, { loi: 'Mật khẩu mới phải từ 6 ký tự.' });
    var muoi7 = crypto.randomBytes(16).toString('hex');
    var mkMoiBam = bam(moi, muoi7);
    await self.commandFor(p, 'password-change', function () {
      self.kho.q.tkDoiMK.run(mkMoiBam, muoi7, p.tk);
      /* đổi mật khẩu = đá mọi phiên khác ra, chỉ giữ lại phiên đang thao tác */
      self.kho.q.phienXoaKhac.run(p.tk, p.token);
      return null;
    });
    return json(res, 200, { ok: true, thuHoiPhien: true });
  }

  return json(res, 404, { loi: 'Không có đường dẫn này.' });
};

module.exports = { API: API, bam: bam, loiKH: loiKH };
