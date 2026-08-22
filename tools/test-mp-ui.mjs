/* Kiểm thử GIAO DIỆN bản nhiều người bằng trình duyệt thật (Playwright).
 * Mở hai người chơi trong hai browser context riêng, làm mọi việc qua giao
 * diện đúng như người thật: đăng ký, bấm menu, xây, bán, xem thiên hà, lập
 * và xin vào liên minh, xếp hạng, bảng tin, và cả bản mobile.
 * Chạy: node tools/test-mp-ui.mjs                                          */
'use strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

var THUMUC = path.dirname(fileURLToPath(import.meta.url));
var GOC = path.join(THUMUC, '..');
var CONG = 8300 + Math.floor(Math.random() * 100);
var DB = path.join(os.tmpdir(), 'thdc-ui-' + process.pid + '.db');
var URL = 'http://127.0.0.1:' + CONG;
var ANH = os.tmpdir();
var HAU = '-' + process.pid + '.png';

var loi = 0, ok = 0;
function ktra(dk, ten) { if (dk) ok++; else { loi++; console.log('  ✗ ' + ten); } }
function log(s) { console.log('  · ' + s); }
function nghi(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ------------------------------------------------------- gom lỗi trình duyệt */
var soLoi = [];                    // {ai, kieu, noi}
function theoDoi(ai, page) {
  page.on('pageerror', function (e) { soLoi.push({ ai: ai, kieu: 'pageerror', noi: String(e && e.message || e) }); });
  page.on('console', function (m) {
    if (m.type() !== 'error') return;
    var s = m.text();
    if (/favicon/i.test(s)) return;                 // trình duyệt tự xin /favicon.ico
    soLoi.push({ ai: ai, kieu: 'console', noi: s });
  });
}

/* --------------------------------------------------------------- tiện ích DOM */
async function chup(page, ten) {
  try { await page.screenshot({ path: path.join(ANH, 'thdc-' + ten + HAU), fullPage: true }); } catch (e) { }
}
/* bấm một nút, nếu cần thì chờ đúng lời đáp của máy chủ rồi chờ vẽ lại */
async function nhan(page, sel, cho) {
  var p = cho ? page.waitForResponse(function (r) { return r.url().indexOf(cho) >= 0; }, { timeout: 20000 }) : null;
  await page.click(sel);
  if (p) await p;
  await nghi(cho ? 350 : 200);
}
async function chuNoiDung(page) {
  return await page.$eval('#noidung', function (e) { return (e.innerText || e.textContent || '').trim(); });
}
async function vaoMan(page, man, cho) {
  await nhan(page, '#menu [data-man="' + man + '"]', cho);
}

/* ------------------------------------------------------------- đăng ký / nhập */
async function moTrang(ctx, ai) {
  var page = await ctx.newPage();
  theoDoi(ai, page);
  await page.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.MP && window.APP && window.APP.mp === true', null, { timeout: 20000 });
  await page.waitForSelector('#tab-dk', { state: 'visible' });
  return page;
}
async function dangKy(page, ten, hienthi, mk) {
  await page.click('#tab-dk');
  await page.fill('#dk-ten', ten);
  await page.fill('#dk-hienthi', hienthi);
  await page.fill('#dk-mk', mk);
  var cho = page.waitForResponse(function (r) { return r.url().indexOf('/api/dangky') >= 0; }, { timeout: 20000 });
  await page.click('#nut-dk');
  var dap = await cho;
  var o = await dap.json().catch(function () { return {}; });
  await page.waitForSelector('#thanh-tren', { state: 'visible', timeout: 20000 });
  await page.waitForFunction('window.ST && window.ST.planets && window.ST.planets.length > 0', null, { timeout: 20000 });
  await nghi(400);
  return o;
}
async function dangNhap(page, ten, mk) {
  await page.click('#tab-dn');
  await page.fill('#dn-ten', ten);
  await page.fill('#dn-mk', mk);
  await page.click('#nut-dn');
  await page.waitForSelector('#thanh-tren', { state: 'visible', timeout: 20000 });
  await page.waitForFunction('window.ST && window.ST.planets && window.ST.planets.length > 0', null, { timeout: 20000 });
  await nghi(300);
}

/* đưa bản đồ thiên hà tới đúng hệ cần xem */
async function diTuiHe(page, g, h) {
  var dang = await page.evaluate('U.gal ? [U.gal.g, U.gal.h] : null');
  if (dang && dang[0] === g && dang[1] === h) return false;
  await page.fill('#g-g', String(g));
  await page.fill('#g-h', String(h));
  await nhan(page, '[data-act="gal-di"]', '/api/he');
  return true;
}
function soHang(page) {
  return page.$$eval('#noidung table tr', function (rs) {
    return rs.filter(function (r) { return r.querySelector('td'); }).length;
  });
}

/* ==========================================================================
 * CHẠY BÀI
 * ======================================================================== */
var sv = null, browser = null;

async function chay() {
  /* ---------- 1. dựng máy chủ riêng cho bài test ---------- */
  sv = spawn(process.execPath, [path.join(GOC, 'server', 'index.js')], {
    env: Object.assign({}, process.env, { PORT: String(CONG), THDC_DB: DB, THDC_NHIP: '60000', THDC_GIOI_HAN: '5000' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  var raSV = '';
  sv.stdout.on('data', function (d) { raSV += d; });
  sv.stderr.on('data', function (d) { raSV += d; });

  var san = false;
  for (var i = 0; i < 80 && !san; i++) {
    await nghi(150);
    try {
      var r = await fetch(URL + '/api/thongtin');
      var o = await r.json();
      san = !!o.seed;
    } catch (e) { }
  }
  if (!san) { console.log('SERVER KHÔNG LÊN:\n' + raSV); throw new Error('không dựng được máy chủ'); }
  ktra(san, 'máy chủ lên và trả lời /api/thongtin');
  log('máy chủ ' + URL + ', database ' + DB);

  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* ---------- 2. hai người chơi, hai browser context ---------- */
  var ctx1 = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'vi-VN' });
  var ctx2 = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'vi-VN' });
  var p1 = await moTrang(ctx1, 'người 1');
  var p2 = await moTrang(ctx2, 'người 2');

  var svTxt = await p1.$eval('#kd-sv', function (e) { return e.textContent; });
  ktra(/vũ trụ/i.test(svTxt), 'màn khởi động hiện thông tin máy chủ');
  await chup(p1, 'khoidong');

  var dk1 = await dangKy(p1, 'quocbinh', 'Quốc Bình', 'matkhau123');
  ktra(!!dk1.token && !!dk1.nha, 'người 1 đăng ký được qua giao diện' + (dk1.loi ? ': ' + dk1.loi : ''));
  var dk2 = await dangKy(p2, 'levu', 'Lê Vũ', 'matkhau456');
  ktra(!!dk2.token && !!dk2.nha, 'người 2 đăng ký được qua giao diện' + (dk2.loi ? ': ' + dk2.loi : ''));

  var nha1 = dk1.nha || await p1.evaluate('window.ST.planets[0].c');
  var nha2 = dk2.nha || await p2.evaluate('window.ST.planets[0].c');
  log('người 1 ở [' + nha1.g + ':' + nha1.h + ':' + nha1.p + '], người 2 ở [' + nha2.g + ':' + nha2.h + ':' + nha2.p + ']');

  ktra(await p1.isVisible('#thanh-tren'), 'người 1 vào được game (thanh trên hiện ra)');
  ktra(await p1.isHidden('#man-khoidong'), 'màn đăng nhập đã tắt sau khi vào game');
  var res1 = await p1.$eval('#tt-res', function (e) { return e.textContent; });
  ktra(/Kim Loại/.test(res1) && /Galana/.test(res1), 'thanh tài nguyên hiện đủ các mục');
  var ten1 = await p1.evaluate('window.MP.ten');
  ktra(ten1 === 'Quốc Bình', 'giao diện nhận đúng tên chỉ huy từ máy chủ (' + ten1 + ')');
  await chup(p1, 'tongquan');

  /* ---------- 3. bấm đủ các mục menu ---------- */
  var dsMan = await p1.$$eval('#menu [data-man]', function (els) {
    return els.map(function (e) { return e.getAttribute('data-man'); });
  });
  ktra(dsMan.length === 15, 'menu có đủ 15 mục (' + dsMan.length + ')');
  ktra(dsMan.indexOf('huongdan') >= 0, 'menu có mục Hướng Dẫn');
  ktra(dsMan.indexOf('mophong') >= 0, 'menu có mục Máy Tính Trận');
  var CHO_API = { thienha: '/api/he', xephang: '/api/xephang', lienminh: '/api/lm', bangtin: '/api/bangtin' };
  for (var j = 0; j < dsMan.length; j++) {
    var m = dsMan[j];
    var truoc = soLoi.length;
    await vaoMan(p1, m, CHO_API[m]);
    var nd = await chuNoiDung(p1);
    var manHT = await p1.evaluate('U.man');
    ktra(manHT === m, 'mục "' + m + '" đổi được màn');
    ktra(nd.length > 40, 'mục "' + m + '" vẽ ra nội dung (' + nd.length + ' ký tự)');
    ktra(soLoi.length === truoc, 'mục "' + m + '" không sinh lỗi JS' +
      (soLoi.length > truoc ? ': ' + soLoi[truoc].noi : ''));
  }
  await chup(p1, 'man-cuoi');

  /* ---------- 4. thao tác thật: xây, bán, xem thiên hà ---------- */
  await vaoMan(p1, 'congtrinh');
  ktra(await p1.isVisible('[data-act="xay"][data-id="metalMine"]'), 'màn Công Trình có nút xây Mỏ Kim Loại');
  await nhan(p1, '[data-act="xay"][data-id="metalMine"]', '/api/lam');
  var qB = await p1.evaluate('window.ST.planets[0].qB.length');
  ktra(qB === 1, 'lệnh xây đi tới máy chủ và vào hàng đợi (qB=' + qB + ')');
  await chup(p1, 'congtrinh');

  await vaoMan(p1, 'tongquan');
  var ndTQ = await chuNoiDung(p1);
  ktra(/Mỏ Kim Loại/.test(ndTQ), 'màn Tổng Quan hiện hàng đợi có Mỏ Kim Loại');
  ktra(await p1.isVisible('[data-act="huyxay"]'), 'hàng đợi có nút Huỷ');

  await vaoMan(p1, 'tainguyen');
  ktra(await p1.isVisible('#cho-metal'), 'màn Tài Nguyên có Chợ Thiên Hà');
  var gal0 = await p1.evaluate('window.ST.galana');
  await p1.fill('#cho-metal', '900');
  await nhan(p1, '[data-act="ban"][data-res="metal"]', '/api/lam');
  var nk = await p1.evaluate('window.ST.nk.map(function(x){return x.s;}).join(" | ")');
  ktra(/Bán .*Kim Loại/.test(nk), 'bán tài nguyên xong, nhật ký ghi lại giao dịch');
  var gal1 = await p1.evaluate('window.ST.galana');
  ktra(gal1 > gal0, 'Galana tăng lên sau khi bán (' + Math.round(gal0) + ' → ' + Math.round(gal1) + ')');
  await chup(p1, 'tainguyen');

  await vaoMan(p1, 'thienha', '/api/he');
  var n15 = await soHang(p1);
  ktra(n15 === 16, 'bảng thiên hà hiện 15 ô hành tinh + 1 ô không gian sâu (' + n15 + ')');
  var nhaCuaToi = await p1.$$eval('#noidung table tr.toi td', function (ts) { return ts.map(function (t) { return t.textContent; }); });
  ktra(nhaCuaToi.length > 0 && /\(ta\)/.test(nhaCuaToi.join(' ')), 'hàng hành tinh của chính ta được đánh dấu "(ta)"');
  await chup(p1, 'thienha');

  /* ---------- 5. nhiều người: người 2 thấy người 1 trên bản đồ ---------- */
  await vaoMan(p2, 'thienha', '/api/he');
  var daDi = await diTuiHe(p2, nha1.g, nha1.h);
  log(daDi ? 'người 2 điều hướng tới hệ [' + nha1.g + ':' + nha1.h + ']' : 'hai người ở cùng hệ, không cần điều hướng');
  var gal = await p2.evaluate('[U.gal.g, U.gal.h]');
  ktra(gal[0] === nha1.g && gal[1] === nha1.h, 'bản đồ của người 2 đang ở hệ của người 1');
  ktra((await soHang(p2)) === 16, 'bảng thiên hà của người 2 cũng đủ 16 dòng');

  var hangNguoi = await p2.$$eval('#noidung table tr.nguoi', function (rs) {
    return rs.map(function (r) {
      return {
        o: (r.querySelector('td') || {}).textContent,
        cam: (r.querySelector('td.cam') || {}).textContent || '',
        danh: !!r.querySelector('[data-act="nv"][data-m="attack"]'),
        tham: !!r.querySelector('[data-act="nv"][data-m="spy"]')
      };
    });
  });
  ktra(hangNguoi.length >= 1, 'người 2 thấy ít nhất một hành tinh loại "nguoi" trong hệ này');
  var cua1 = hangNguoi.filter(function (r) { return r.cam.indexOf('Quốc Bình') >= 0; })[0];
  ktra(!!cua1, 'người 2 thấy đúng dòng của người 1 với tên chỉ huy màu cam');
  if (cua1) {
    ktra(String(cua1.o).trim() === String(nha1.p), 'dòng đó nằm đúng ô ' + nha1.p + ' (thấy ' + String(cua1.o).trim() + ')');
    ktra(cua1.danh && cua1.tham, 'dòng người chơi thật có cả nút "Tấn công" và "Do thám"');
  }
  var loaiTuServer = await p2.evaluate(
    'MP.he.o.filter(function(o){return o.loai==="nguoi" && o.ten==="Quốc Bình";}).length');
  ktra(loaiTuServer === 1, 'máy chủ trả về loai="nguoi" cho hành tinh của người 1');
  await chup(p2, 'thienha-nguoi2');

  /* ---------- 6. liên minh ---------- */
  await vaoMan(p1, 'lienminh', '/api/lm');
  ktra(await p1.isVisible('#lm-tag'), 'màn Liên Minh có ô lập liên minh mới');
  /* thẻ/tên KHÔNG nằm trong danh sách liên minh NPC (js/galaxy.js) — để chắc chắn
     đây là liên minh do người chơi lập ra, không phải tên có sẵn */
  await p1.fill('#lm-tag', 'DNV');
  await p1.fill('#lm-ten', 'Đại Nam Vệ');
  await nhan(p1, '[data-act="lm-tao"]', '/api/lm');
  await nghi(400);
  var TEN_LM = '[DNV] Đại Nam Vệ';
  var ndLM1 = await chuNoiDung(p1);
  ktra(ndLM1.indexOf(TEN_LM) >= 0, 'người 1 lập được liên minh và giao diện hiện tên liên minh');
  var tv1 = await p1.$$eval('#noidung table tr', function (rs) {
    return rs.filter(function (r) { return /\(ta\)/.test(r.textContent); }).length;
  });
  ktra(tv1 >= 1, 'bảng thành viên hiện chính ta');
  await chup(p1, 'lienminh1');

  await vaoMan(p2, 'lienminh', '/api/lm');
  var nutVao = '[data-act="lm-vao"][data-ten="' + TEN_LM + '"]';
  ktra(await p2.isVisible(nutVao), 'người 2 thấy liên minh mới trong danh sách kèm nút "Xin vào"');
  await nhan(p2, nutVao, '/api/lam');
  var lmCua2 = await p2.evaluate('window.ST.lm ? window.ST.lm.ten : null');
  ktra(lmCua2 === TEN_LM, 'người 2 vào được liên minh (' + lmCua2 + ')');
  var tvNgay = await p2.evaluate('(MP.lm && MP.lm.tv || []).length');
  if (!tvNgay) log('lưu ý: vừa vào liên minh xong, MP.lm.tv vẫn rỗng — bảng thành viên chỉ hiện ' +
    'sau khi mở lại màn Liên Minh (js/app.js ACT["lm-vao"] không nạp lại /api/lm như "lm-tao" trong web/js/mp.js)');
  /* mở lại màn để lấy danh sách thành viên mới nhất từ máy chủ */
  await vaoMan(p2, 'lienminh', '/api/lm');
  var tv2 = await p2.$$eval('#noidung table tr', function (rs) {
    return rs.filter(function (r) { return r.querySelector('td'); }).map(function (r) { return r.textContent; });
  });
  var chuoiTV = tv2.join(' | ');
  ktra(/Quốc Bình/.test(chuoiTV) && /Lê Vũ/.test(chuoiTV),
    'bảng thành viên của người 2 hiện cả hai người (' + tv2.length + ' hàng)');
  await chup(p2, 'lienminh2');

  /* ---------- 7. xếp hạng & bảng tin ---------- */
  await vaoMan(p1, 'xephang', '/api/xephang');
  var ndXH = await chuNoiDung(p1);
  ktra(/Quốc Bình/.test(ndXH) && /Lê Vũ/.test(ndXH), 'bảng xếp hạng có cả hai người chơi');
  ktra(/\(ta\)/.test(ndXH), 'bảng xếp hạng đánh dấu chính ta');
  ktra((await soHang(p1)) >= 2, 'bảng xếp hạng có từ 2 hàng');
  await chup(p1, 'xephang');

  await vaoMan(p1, 'bangtin', '/api/bangtin');
  var soTin = await p1.evaluate('(MP.bt && MP.bt.bt || []).length');
  var ndBT = await chuNoiDung(p1);
  ktra(soTin >= 2, 'bảng tin vũ trụ có tin từ máy chủ (' + soTin + ' tin)');
  ktra(/Quốc Bình|Lê Vũ|Đại Nam Vệ/.test(ndBT), 'bảng tin nhắc tới sự kiện vừa xảy ra');
  ktra(ndBT.indexOf('Chưa có gì') < 0, 'bảng tin không còn rỗng');
  await chup(p1, 'bangtin');

  /* ---------- 8. giao diện mobile ---------- */
  var ctx3 = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'vi-VN',
    deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  var p3 = await moTrang(ctx3, 'mobile');
  await dangNhap(p3, 'quocbinh', 'matkhau123');
  ktra(await p3.isVisible('#thanh-tren'), 'mobile: đăng nhập lại tài khoản 1 vào được game');
  ktra(await p3.isVisible('#nut-menu'), 'mobile: nút ☰ hiện ra ở khổ hẹp');
  ktra(await p3.isHidden('#menu'), 'mobile: menu ẩn khi chưa bấm');
  await p3.click('#nut-menu');
  await nghi(250);
  var moRa = await p3.$eval('#menu', function (e) { return e.classList.contains('mo-ra'); });
  ktra(moRa, 'mobile: bấm ☰ thì menu nhận class mo-ra');
  ktra(await p3.isVisible('#menu'), 'mobile: menu mở ra và nhìn thấy được');
  var hopMenu = await p3.$eval('#menu', function (e) { var b = e.getBoundingClientRect(); return [b.width, b.height]; });
  ktra(hopMenu[0] > 100 && hopMenu[1] > 40, 'mobile: menu chiếm chỗ thật trên trang (' +
    Math.round(hopMenu[0]) + '×' + Math.round(hopMenu[1]) + ')');
  await chup(p3, 'mobile-menu');
  await vaoMan(p3, 'tongquan');
  ktra((await chuNoiDung(p3)).length > 40, 'mobile: chọn mục trong menu vẫn vẽ được màn');
  var conMo = await p3.$eval('#menu', function (e) { return e.classList.contains('mo-ra'); });
  ktra(!conMo, 'mobile: menu tự đóng sau khi chọn một mục');
  await chup(p3, 'mobile-tongquan');

  /* ---------- 9. máy chủ không ghi lỗi ---------- */
  var xau = raSV.match(/\[(api|nhip)\][^\n]*/g);
  ktra(!xau, 'máy chủ không ghi lỗi nào ra log' + (xau ? ': ' + xau[0] : ''));
}

/* ==========================================================================
 * VỎ NGOÀI: dọn dẹp & tổng kết
 * ======================================================================== */
(async function () {
  try {
    await chay();
  } catch (e) {
    loi++;
    console.log('  ✗ NGOẠI LỆ: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (e) { }
    try { if (sv) sv.kill('SIGKILL'); } catch (e) { }
    await nghi(200);
    ['', '-wal', '-shm'].forEach(function (h) { try { fs.unlinkSync(DB + h); } catch (e) { } });
  }

  console.log('\n  ── lỗi JS thu được trong trình duyệt ──');
  if (!soLoi.length) console.log('  · không có lỗi nào');
  else for (var i = 0; i < soLoi.length; i++)
    console.log('  ! [' + soLoi[i].ai + '] ' + soLoi[i].kieu + ': ' + soLoi[i].noi);
  ktra(!soLoi.length, 'không có lỗi JS/console nào trong cả ba context');

  console.log('  · ảnh chụp màn hình: ' + path.join(ANH, 'thdc-*' + HAU));
  console.log('\n' + (loi ? '✗ ' + loi + ' lỗi / ' : '✓ ') + ok + ' kiểm tra đạt');
  process.exit(loi ? 1 : 0);
})();
