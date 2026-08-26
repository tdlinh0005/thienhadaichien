/* THIÊN HÀ ĐẠI CHIẾN — tiện ích chung */
'use strict';
var G = window.G = window.G || {};

/* --- Số ---------------------------------------------------------------- */
G.so = function (n) {
  n = Math.floor(n || 0);
  var am = n < 0; n = Math.abs(n);
  var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (am ? '-' : '') + s;
};
G.soNgan = function (n) {
  n = Math.floor(n || 0);
  var a = Math.abs(n), s;
  if (a >= 1e12) s = (n / 1e12).toFixed(2) + ' NTy';     // nghìn tỷ
  else if (a >= 1e9) s = (n / 1e9).toFixed(2) + ' Ty';   // tỷ
  else if (a >= 1e6) s = (n / 1e6).toFixed(2) + ' Tr';   // triệu
  else if (a >= 1e4) s = (n / 1e3).toFixed(1) + ' N';    // nghìn
  else s = G.so(n);
  return s;
};
G.tocDoText = function (n) { return G.so(Math.round(n)); };

/* --- Thời gian --------------------------------------------------------- */
G.tg = function (giay) {
  giay = Math.max(0, Math.round(giay));
  var ng = Math.floor(giay / 86400); giay -= ng * 86400;
  var h = Math.floor(giay / 3600); giay -= h * 3600;
  var p = Math.floor(giay / 60); var s = giay - p * 60;
  var out = [];
  if (ng) out.push(ng + 'n');
  if (ng || h) out.push(h + 'h');
  if (ng || h || p) out.push(p + 'p');
  out.push(s + 's');
  return out.join(' ');
};
G.gio = function (ts) {
  var d = new Date(ts);
  var p = function (x) { return (x < 10 ? '0' : '') + x; };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
};

/* --- Đối tượng --------------------------------------------------------- */
G.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
G.cong = function (a, b, k) {
  k = (k === undefined) ? 1 : k;
  for (var p in b) if (b[p]) a[p] = (a[p] || 0) + b[p] * k;
  return a;
};
G.tongRes = function (r) {
  var t = 0;
  for (var i = 0; i < G.RES_HANH_TINH.length; i++) t += (r[G.RES_HANH_TINH[i]] || 0);
  return t;
};
G.trong = function (o) { for (var k in o) if (o[k] > 0) return false; return true; };

/* --- PRNG tất định (mulberry32) --------------------------------------- */
G.rng = function (seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
G.hash = function (str) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};

/* --- Toạ độ ------------------------------------------------------------ */
G.toaDo = function (g, h, p) { return { g: g, h: h, p: p }; };
G.tdStr = function (c) { return '[' + c.g + ':' + c.h + ':' + c.p + ']'; };
G.tdKey = function (c) { return c.g + ':' + c.h + ':' + c.p; };
G.tdParse = function (s) {
  var m = String(s).replace(/[\[\]]/g, '').split(':');
  if (m.length !== 3) return null;
  var c = G.toaDo(parseInt(m[0], 10), parseInt(m[1], 10), parseInt(m[2], 10));
  if (!(c.g >= 1 && c.g <= G.C.SO_THIEN_HA)) return null;
  if (!(c.h >= 1 && c.h <= G.C.SO_HE)) return null;
  /* ô 16 là vùng không gian sâu — hợp lệ để thám hiểm, không phải hành tinh */
  if (!(c.p >= 1 && c.p <= G.C.O_THAM_HIEM)) return null;
  return c;
};
G.bang = function (a, b) { return a && b && a.g === b.g && a.h === b.h && a.p === b.p; };

/* Khoảng cách kiểu OGame [SUY LUẬN] */
G.khoangCach = function (a, b) {
  if (a.g !== b.g) return 20000 * Math.abs(a.g - b.g);
  if (a.h !== b.h) return 2700 + 95 * Math.abs(a.h - b.h);
  if (a.p !== b.p) return 1000 + 5 * Math.abs(a.p - b.p);
  return 5;
};
