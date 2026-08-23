/* THIÊN HÀ ĐẠI CHIẾN — máy chủ nhiều người chơi
 *   node server/index.js            (mặc định cổng 8080, DB server/data/thdc.db)
 *   PORT=3000 THDC_DB=/tmp/a.db node server/index.js
 * Không phụ thuộc gói ngoài: chỉ dùng node:http + node:sqlite.            */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var Kho = require('./db.js').Kho;
var TheGioi = require('./world.js').TheGioi;
var API = require('./api.js').API;
var G = require('./rules.js').G;

var CONG = parseInt(process.env.PORT || '8080', 10);
var GOC = path.join(__dirname, '..');

var kho = new Kho();
var tg = new TheGioi(kho);
var SO_NANG_CAP = tg.nangCapDuLieu();
var api = new API(kho, tg);
tg.seed();

/* ------------------------------------------------------------ file tĩnh */
var LOAI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};
/* chỉ mở đúng những thư mục cần thiết */
var CHO_PHEP = ['web', 'js', 'css', 'docs', 'dist'];

function traFile(res, tep) {
  try {
    if (typeof tep !== 'string' || tep.indexOf('\0') >= 0) throw new Error('đường dẫn không hợp lệ');
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Đường dẫn không hợp lệ.');
  }
  fs.readFile(tep, function (e, d) {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không có file.'); }
    res.writeHead(200, {
      'Content-Type': LOAI[path.extname(tep).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(d);
  });
}

function tinhTep(duong) {
  if (duong.indexOf('\0') >= 0) return null;
  if (duong === '/' || duong === '/index.html') return path.join(GOC, 'web', 'index.html');
  if (duong === '/motnguoi' || duong === '/solo') return path.join(GOC, 'index.html');
  var sach = path.normalize(duong).replace(/^([/\\])+/, '');
  if (sach.indexOf('..') >= 0) return null;
  var goc0 = sach.split(/[/\\]/)[0];
  if (CHO_PHEP.indexOf(goc0) < 0) return null;
  return path.join(GOC, sach);
}

/* ---------------------------------------------------------------- server */
var server = http.createServer(function (req, res) {
  var u = url.parse(req.url);
  var duong;
  try { duong = decodeURIComponent(u.pathname || '/'); }
  catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Đường dẫn không hợp lệ.');
  }
  var tv = new URLSearchParams(u.query || '');

  if (duong.indexOf('/api/') === 0) {
    Promise.resolve()
      .then(function () { return api.xuLy(req, res, duong, tv); })
      .catch(function (e) {
        var ma = (e && e.ma) || 500;
        /* lỗi do client gửi sai thì không coi là sự cố server */
        if (ma >= 500) console.error('[api]', duong, e && e.stack || e);
        if (!res.headersSent) {
          res.writeHead(ma, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ loi: (e && e.message) || 'Lỗi server.' }));
        }
      });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); return res.end();
  }
  var tep = tinhTep(duong);
  if (!tep) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không có file.'); }
  traFile(res, tep);
});

/* -------------------------------------------------------------- scheduler */
var NHIP_MS = parseInt(process.env.THDC_NHIP || '3000', 10);
var dangNhip = false;
var boDem = setInterval(function () {
  if (dangNhip) return;
  dangNhip = true;
  try {
    var n = tg.nhip();
    if (n > 0 && process.env.THDC_AM === '1') console.log('[nhip] đã tua ' + n + ' đế quốc');
  } catch (e) { console.error('[nhip]', e && e.stack || e); }
  dangNhip = false;
}, NHIP_MS);

/* dọn phiên hết hạn mỗi giờ */
var boDon = setInterval(function () {
  try {
    var gio = Math.floor(Date.now() / 1000);
    kho.q.phienDonRac.run(gio);
    kho.q.hdDonRac.run(gio - 86400);
  } catch (e) { }
}, 3600 * 1000);

function tat() {
  clearInterval(boDem); clearInterval(boDon);
  try { server.close(); } catch (e) { }
  try { kho.dong(); } catch (e) { }
  process.exit(0);
}
process.on('SIGINT', tat);
process.on('SIGTERM', tat);

server.listen(CONG, function () {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  THIÊN HÀ ĐẠI CHIẾN — máy chủ nhiều người chơi        ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('  Địa chỉ      : http://localhost:' + CONG + '/');
  console.log('  Bản một người: http://localhost:' + CONG + '/motnguoi');
  console.log('  Database     : ' + (process.env.THDC_DB || path.join(__dirname, 'data', 'thdc.db')));
  console.log('  Hạt giống    : ' + tg.seed());
  console.log('  Tài khoản    : ' + kho.q.tkDem.get().n + ' · hành tinh đã có chủ: ' + kho.q.htDem.get().n);
  if (SO_NANG_CAP) console.log('  Migration    : đã nâng ' + SO_NANG_CAP + ' đế quốc lên state v' + G.STATE_VERSION);
  console.log('  Tốc độ       : sản xuất x' + G.C.TOC_DO_SERVER + ' · bay x' + G.C.TOC_DO_BAY +
    ' · bảo trì mỗi ' + (G.C.CHU_KY_BAO_TRI / 3600) + ' giờ');
  console.log('  Nhịp tua     : ' + NHIP_MS + 'ms');
});

module.exports = { server: server, kho: kho, tg: tg, api: api };
