/* THIÊN HÀ ĐẠI CHIẾN — API HTTP (JSON) cho bản nhiều người chơi
 * Xác thực: scrypt cho mật khẩu, token phiên gửi qua header x-thdc-token.
 * Nguyên tắc: client KHÔNG được tin. Mọi hành động chạy lại trên server. */
'use strict';
var crypto = require('crypto');
var G = require('./rules.js').G;

var PHIEN_HAN = 30 * 86400;
var BODY_MAX = 96 * 1024;
var NHIP_TOI_DA = 40;          // số yêu cầu tối đa trong NHIP_CUA giây
var NHIP_CUA = 10;
var NHIP_XAC_THUC = 8;         // đăng nhập/đăng ký nặng CPU (scrypt) -> siết chặt hơn

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

/* ------------------------------------------------------------------ API */
function API(kho, tg) {
  this.kho = kho;
  this.tg = tg;
  this.nhip = new Map();     // token/ip -> {n, tu}
}

API.prototype.gioiHan = function (khoa, tran) {
  var now = Date.now();
  var o = this.nhip.get(khoa);
  if (!o || now - o.tu > NHIP_CUA * 1000) { this.nhip.set(khoa, { n: 1, tu: now }); return true; }
  o.n++;
  if (this.nhip.size > 5000) this.nhip.clear();
  return o.n <= (tran || NHIP_TOI_DA);
};

API.prototype.phien = function (req) {
  var t = req.headers['x-thdc-token'];
  if (!t) return null;
  var r = this.kho.q.phienGet.get(String(t).slice(0, 80));
  if (!r) return null;
  var now = Math.floor(Date.now() / 1000);
  if (r.hetHan < now) { this.kho.q.phienXoa.run(r.token); return null; }
  var tk = this.kho.q.tkTheoId.get(r.tk);
  if (!tk) return null;
  return { token: r.token, tk: tk.id, tkRow: tk };
};

API.prototype.thongTin = function () {
  return {
    seed: this.tg.seed(),
    soNguoi: this.kho.q.tkDem.get().n,
    soHT: this.kho.q.htDem.get().n,
    tocDo: G.C.TOC_DO_SERVER,
    tocDoBay: G.C.TOC_DO_BAY,
    chuKy: G.C.CHU_KY_BAO_TRI,
    phienBan: G.VERSION,
    now: Math.floor(Date.now() / 1000)
  };
};

API.prototype.goiState = function (p) {
  var st = this.tg.tick(p.tk, null);
  if (!st) {
    var r = this.tg.nap(p.tk);
    st = r ? r.st : null;
  }
  if (!st) return null;
  return {
    st: st,
    sv: this.thongTin(),
    toi: { ten: p.tkRow.hienthi, tk: p.tk }
  };
};

/* ---------------------------------------------------------- các đường dẫn */
API.prototype.xuLy = async function (req, res, duong, truyVan) {
  var self = this;
  var ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0].trim();

  /* ---- công khai ---- */
  if (duong === '/api/thongtin') return json(res, 200, self.thongTin());

  if (duong === '/api/dangky' && req.method === 'POST') {
    if (!self.gioiHan('dk:' + ip, NHIP_XAC_THUC)) return json(res, 429, { loi: 'Thao tác quá nhanh, chờ một lát.' });
    var b = await docBody(req);
    var ten = chuoi(b.ten, 24).trim();
    var mk = chuoi(b.mk, 200);
    var hienthi = chuoi(b.hienthi, 24).trim() || ten;
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(ten)) return json(res, 400, { loi: 'Tên đăng nhập 3–24 ký tự, chỉ chữ/số/._-' });
    if (mk.length < 6) return json(res, 400, { loi: 'Mật khẩu phải từ 6 ký tự.' });
    if (!/^[^<>&"]{2,24}$/.test(hienthi)) return json(res, 400, { loi: 'Tên chỉ huy 2–24 ký tự, không chứa < > & "' });
    var khoa = ten.toLowerCase();
    if (self.kho.q.tkTheoTen.get(khoa)) return json(res, 409, { loi: 'Tên đăng nhập đã có người dùng.' });
    var muoi = crypto.randomBytes(16).toString('hex');
    var now = Math.floor(Date.now() / 1000);
    self.kho.q.tkThem.run(khoa, hienthi, bam(mk, muoi), muoi, now, now);
    var tk = self.kho.q.tkTheoTen.get(khoa);
    var kq = self.tg.taoDeQuoc(tk.id, hienthi);
    if (kq.loi) return json(res, 500, { loi: kq.loi });
    var token = crypto.randomBytes(24).toString('hex');
    self.kho.q.phienThem.run(token, tk.id, now, now + PHIEN_HAN);
    return json(res, 200, { token: token, ten: hienthi, nha: kq.nha });
  }

  if (duong === '/api/dangnhap' && req.method === 'POST') {
    if (!self.gioiHan('dn:' + ip, NHIP_XAC_THUC)) return json(res, 429, { loi: 'Thao tác quá nhanh, chờ một lát.' });
    var b2 = await docBody(req);
    var ten2 = chuoi(b2.ten, 24).trim().toLowerCase();
    var tk2 = self.kho.q.tkTheoTen.get(ten2);
    if (!tk2 || !bangNhau(bam(chuoi(b2.mk, 200), tk2.muoi), tk2.mk))
      return json(res, 401, { loi: 'Sai tên đăng nhập hoặc mật khẩu.' });
    var now2 = Math.floor(Date.now() / 1000);
    var token2 = crypto.randomBytes(24).toString('hex');
    self.kho.q.phienThem.run(token2, tk2.id, now2, now2 + PHIEN_HAN);
    self.kho.q.tkVao.run(now2, tk2.id);
    self.kho.q.phienDonRac.run(now2);
    if (!self.kho.q.dqGet.get(tk2.id)) self.tg.taoDeQuoc(tk2.id, tk2.hienthi);
    return json(res, 200, { token: token2, ten: tk2.hienthi });
  }

  /* ---- cần đăng nhập ---- */
  var p = self.phien(req);
  if (!p) return json(res, 401, { loi: 'Chưa đăng nhập.' });
  if (!self.gioiHan('t:' + p.token)) return json(res, 429, { loi: 'Thao tác quá nhanh, chờ một nhịp.' });
  self.kho.q.tkVao.run(Math.floor(Date.now() / 1000), p.tk);

  if (duong === '/api/dangxuat') {
    self.kho.q.phienXoa.run(p.token);
    return json(res, 200, { ok: true });
  }

  if (duong === '/api/state') {
    var g = self.goiState(p);
    if (!g) return json(res, 500, { loi: 'Không nạp được đế quốc.' });
    return json(res, 200, g);
  }

  if (duong === '/api/lam' && req.method === 'POST') {
    var b3 = await docBody(req);
    var ten3 = chuoi(b3.ten, 24);
    if (!G.HANHDONG[ten3]) return json(res, 400, { loi: 'Hành động không tồn tại.' });
    var kq3 = self.tg.hanhDong(p.tk, ten3, b3.dl || {});
    if (!kq3.st) return json(res, 503, { loi: kq3.loi || 'Server đang xử lý, thử lại.' });
    /* đồng bộ cột liên minh + kiểm tra liên minh có thật */
    if (ten3 === 'lmvao' && !kq3.loi) {
      var co = self.kho.q.lmGet.get(kq3.st.lm ? kq3.st.lm.ten : '');
      if (!co) {
        kq3.st.lm = null;
        self.tg.luu(p.tk, kq3.st);
        return json(res, 400, { loi: 'Liên minh này không tồn tại.', st: kq3.st, sv: self.thongTin() });
      }
      self.kho.q.btThem.run(Math.floor(Date.now() / 1000), 'lm', p.tkRow.hienthi + ' gia nhập ' + kq3.st.lm.ten + '.');
    }
    return json(res, kq3.loi ? 200 : 200, { loi: kq3.loi, st: kq3.st, sv: self.thongTin() });
  }

  if (duong === '/api/he') {
    return json(res, 200, self.tg.xemHe(p.tk, truyVan.get('g'), truyVan.get('h')));
  }

  if (duong === '/api/xephang') {
    var r4 = self.tg.nap(p.tk);
    return json(res, 200, { ds: self.tg.xepHangCho(r4 ? r4.st : null) });
  }

  if (duong === '/api/lm') {
    var r5 = self.tg.nap(p.tk);
    var cua = r5 && r5.st.lm ? r5.st.lm.ten : null;
    return json(res, 200, { ds: self.tg.lmDS(), tv: cua ? self.tg.lmThanhVien(cua, p.tk) : [] });
  }

  if (duong === '/api/lmtao' && req.method === 'POST') {
    var b6 = await docBody(req);
    var loi6 = self.tg.lmTao(p.tk, b6.ten, b6.tag);
    if (loi6) return json(res, 400, { loi: loi6 });
    var kq6 = self.tg.hanhDong(p.tk, 'lmvao', { ten: '[' + chuoi(b6.tag, 6).toUpperCase().trim() + '] ' + chuoi(b6.ten, 32).trim() });
    return json(res, 200, { loi: kq6.loi, st: kq6.st, sv: self.thongTin() });
  }

  if (duong === '/api/bangtin') {
    return json(res, 200, {
      bt: self.kho.q.btDS.all(40),
      tran: self.kho.q.tranDS.all(20)
    });
  }

  if (duong === '/api/doimk' && req.method === 'POST') {
    var b7 = await docBody(req);
    if (!bangNhau(bam(chuoi(b7.cu, 200), p.tkRow.muoi), p.tkRow.mk))
      return json(res, 401, { loi: 'Mật khẩu hiện tại không đúng.' });
    var moi = chuoi(b7.moi, 200);
    if (moi.length < 6) return json(res, 400, { loi: 'Mật khẩu mới phải từ 6 ký tự.' });
    var muoi7 = crypto.randomBytes(16).toString('hex');
    self.kho.q.tkDoiMK.run(bam(moi, muoi7), muoi7, p.tk);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { loi: 'Không có đường dẫn này.' });
};

module.exports = { API: API, bam: bam, loiKH: loiKH };
