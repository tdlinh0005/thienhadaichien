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
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

/* Playwright là công cụ kiểm thử tuỳ chọn, không phải dependency lúc chạy game.
 * Tìm package cục bộ/global trước; CI có thể chỉ rõ file qua THDC_PLAYWRIGHT. */
async function napChromium() {
  var ds = [];
  if (process.env.THDC_PLAYWRIGHT) ds.push(process.env.THDC_PLAYWRIGHT);
  ds.push('playwright', 'playwright-core');
  ds.push(path.resolve(path.dirname(process.execPath), '../lib/node_modules/playwright/index.mjs'));
  ds.push('/opt/node22/lib/node_modules/playwright/index.mjs');
  var loiCuoi = null;
  for (var i = 0; i < ds.length; i++) {
    try {
      var m = await import(ds[i]);
      if (m.chromium) return m.chromium;
      if (m.default && m.default.chromium) return m.default.chromium;
    } catch (e) { loiCuoi = e; }
  }
  throw new Error('Không tìm thấy Playwright. Cài package playwright hoặc đặt THDC_PLAYWRIGHT tới index.mjs.' +
    (loiCuoi && loiCuoi.code ? ' (' + loiCuoi.code + ')' : ''));
}
var chromium = await napChromium();

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
function suaStateUI(hienThi, f) {
  var db = new DatabaseSync(DB);
  var row = db.prepare(`SELECT dq.tk,dq.state FROM dq JOIN tk ON tk.id=dq.tk WHERE tk.hienthi=?`).get(hienThi);
  var st = JSON.parse(row.state);
  f(st);
  db.prepare('UPDATE dq SET state=?,keTiep=0 WHERE tk=?').run(JSON.stringify(st), row.tk);
  db.close();
  return st;
}

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

  var tuyChonChrome = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (process.env.THDC_CHROMIUM) tuyChonChrome.executablePath = process.env.THDC_CHROMIUM;
  browser = await chromium.launch(tuyChonChrome);

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
  var tqDanSu = await chuNoiDung(p1);
  ktra(/Dân số/.test(tqDanSu) && /Ủng hộ/.test(tqDanSu) && /Thuế/.test(tqDanSu),
    'tổng quan hiện đủ dân số, ủng hộ và thuế');
  await p1.fill('#thue-pct', '19');
  await nhan(p1, '[data-act="doithue"]', '/api/lam');
  ktra(await p1.evaluate('window.ST.planets[0].danSu.taxBp === 1900'),
    'đổi thuế 19% qua UI được máy chủ lưu thành 1.900 bp');
  await chup(p1, 'tongquan');

  /* ---------- 3. bấm đủ các mục menu ---------- */
  var dsMan = await p1.$$eval('#menu [data-man]', function (els) {
    return els.map(function (e) { return e.getAttribute('data-man'); });
  });
  ktra(dsMan.length === 16, 'menu có đủ 16 mục (' + dsMan.length + ')');
  ktra(dsMan.indexOf('huongdan') >= 0, 'menu có mục Hướng Dẫn');
  ktra(dsMan.indexOf('mophong') >= 0, 'menu có mục Máy Tính Trận');
  var CHO_API = { thienha: '/api/he', xephang: '/api/xephang', lienminh: '/api/lm', bangtin: '/api/bangtin', chat: '/api/chat' };
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
  ktra(await p1.isVisible('[data-act="xay"][data-id="city"]'), 'màn Công Trình có Thành Phố mở sức chứa dân cư');
  ktra(await p1.isVisible('#ct-sl-metalMine'), 'công trình có ô nhập số lượng lô');
  await p1.fill('#ct-sl-metalMine', '5');
  await p1.waitForFunction(function () {
    return (document.querySelector('[data-act="xay"][data-id="metalMine"]') || {}).textContent.indexOf('×5') >= 0;
  });
  await nhan(p1, '[data-act="xay"][data-id="metalMine"]', '/api/lam');
  var qB = await p1.evaluate('({len:window.ST.planets[0].qB.length,n:window.ST.planets[0].qB[0].n})');
  ktra(qB.len === 1 && qB.n === 5,
    'lệnh xây lô ×5 đi tới máy chủ với schema quantity (qB=' + qB.len + ', n=' + qB.n + ')');
  await chup(p1, 'congtrinh');

  await vaoMan(p1, 'tongquan');
  var ndTQ = await chuNoiDung(p1);
  ktra(/Mỏ Kim Loại/.test(ndTQ) && /\+5/.test(ndTQ), 'màn Tổng Quan hiện Mỏ Kim Loại và đúng số lượng +5');
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
        tham: !!r.querySelector('[data-act="nv"][data-m="spy"]'),
        tuyen: !!r.querySelector('[data-act="tuyen-chien"]')
      };
    });
  });
  ktra(hangNguoi.length >= 1, 'người 2 thấy ít nhất một hành tinh loại "nguoi" trong hệ này');
  var cua1 = hangNguoi.filter(function (r) { return r.cam.indexOf('Quốc Bình') >= 0; })[0];
  ktra(!!cua1, 'người 2 thấy đúng dòng của người 1 với tên chỉ huy màu cam');
  if (cua1) {
    ktra(String(cua1.o).trim() === String(nha1.p), 'dòng đó nằm đúng ô ' + nha1.p + ' (thấy ' + String(cua1.o).trim() + ')');
    ktra(!cua1.danh && cua1.tham && cua1.tuyen,
      'chưa tuyên chiến: chỉ có Do thám + Tuyên chiến, chưa lộ nút Tấn công');
  }
  var loaiTuServer = await p2.evaluate(
    'MP.he.o.filter(function(o){return o.loai==="nguoi" && o.ten==="Quốc Bình";}).length');
  ktra(loaiTuServer === 1, 'máy chủ trả về loai="nguoi" cho hành tinh của người 1');

  /* Luật gốc yêu cầu chờ đúng 24 giờ. Đi qua đủ modal + API, kiểm countdown,
     rồi chỉ backdate dữ liệu thử nghiệm để không phải ngủ một ngày thật. */
  var nutTuyen = '[data-act="tuyen-chien"][data-ten="Quốc Bình"]';
  ktra(await p2.isVisible(nutTuyen), 'người 2 có thể mở xác nhận tuyên chiến với đúng chỉ huy');
  await p2.click(nutTuyen);
  var ndHopChien = await p2.$eval('#ht-noi', function (e) { return e.textContent; });
  ktra(/đúng 24 giờ/i.test(ndHopChien) && /Quốc Bình/.test(ndHopChien),
    'modal nói rõ mục tiêu và thời gian chờ đúng 24 giờ');
  await nhan(p2, '#ht-noi [data-act="tuyen-chien-ok"]', '/api/tuyenchien');
  await p2.waitForFunction(function () {
    var rs = Array.from(document.querySelectorAll('#noidung tr.nguoi'));
    var r = rs.filter(function (x) { return x.textContent.indexOf('Quốc Bình') >= 0; })[0];
    return r && /Được đánh sau/.test(r.textContent) && !r.querySelector('[data-act="nv"][data-m="attack"]');
  }, null, { timeout: 20000 });
  ktra((await chuNoiDung(p2)).indexOf('Được đánh sau') >= 0,
    'sau khi tuyên, bản đồ hiện countdown và vẫn chặn Tấn công');

  await vaoMan(p1, 'lienminh', '/api/lm');
  var ndChienDen = await chuNoiDung(p1);
  ktra(/Bên tuyên chiến với ta/.test(ndChienDen) && /Lê Vũ/.test(ndChienDen) && /Còn/.test(ndChienDen),
    'mục Liên Minh của bên bị tuyên hiện lệnh đến và countdown');

  var dbUI = new DatabaseSync(DB);
  dbUI.prepare(`UPDATE chien SET khi=?
                WHERE tkA=(SELECT id FROM tk WHERE hienthi=?)
                  AND tkD=(SELECT id FROM tk WHERE hienthi=?)`)
    .run(Math.floor(Date.now() / 1000) - 86401, 'Lê Vũ', 'Quốc Bình');
  dbUI.close();
  var choHeHieuLuc = p2.waitForResponse(function (r) { return r.url().indexOf('/api/he') >= 0; }, { timeout: 20000 });
  await p2.evaluate('APP.taiHe(U.gal.g,U.gal.h)');
  await choHeHieuLuc;
  await p2.waitForFunction(function () {
    var rs = Array.from(document.querySelectorAll('#noidung tr.nguoi'));
    var r = rs.filter(function (x) { return x.textContent.indexOf('Quốc Bình') >= 0; })[0];
    return !!(r && r.querySelector('[data-act="nv"][data-m="attack"]'));
  }, null, { timeout: 20000 });
  var danhQuocBinh = await p2.$$eval('#noidung tr.nguoi', function (rs) {
    var r = rs.filter(function (x) { return x.textContent.indexOf('Quốc Bình') >= 0; })[0];
    return !!(r && r.querySelector('[data-act="nv"][data-m="attack"]'));
  });
  ktra(danhQuocBinh,
    'qua mốc 24 giờ: bản đồ đổi sang nút Tấn công');
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
  await nhan(p2, nutVao, '/api/lmxin');
  var lmCua2TruocDuyet = await p2.evaluate('window.ST.lm ? window.ST.lm.ten : null');
  ktra(lmCua2TruocDuyet === null, 'gửi đơn chưa tự ý cho người 2 vào liên minh');
  ktra(await p2.isDisabled(nutVao), 'nút đổi thành trạng thái đã gửi đơn');

  await vaoMan(p1, 'lienminh', '/api/lm');
  /* ID tài khoản không cần đoán: lấy trực tiếp từ data-tk của hàng đơn xin. */
  var nutDuyet = await p1.$('[data-act="lm-duyet"]');
  ktra(!!nutDuyet, 'chủ liên minh thấy đơn xin của người 2');
  var ndDon = await chuNoiDung(p1);
  ktra(/Lê Vũ/.test(ndDon), 'đơn xin ghi đúng tên người nộp');
  if (nutDuyet) await nhan(p1, '[data-act="lm-duyet"]', '/api/lmduyet');

  /* Client người xin tự nhận membership qua nhịp đồng bộ 8 giây. */
  await p2.waitForFunction('window.ST && window.ST.lm && window.ST.lm.ten === "' + TEN_LM + '"', null, { timeout: 15000 });
  var lmCua2 = await p2.evaluate('window.ST.lm ? window.ST.lm.ten : null');
  ktra(lmCua2 === TEN_LM, 'người 2 vào liên minh sau khi chủ duyệt (' + lmCua2 + ')');
  await p2.waitForFunction(function (tenLM) {
    return window.U && U.man === 'lienminh' && !document.querySelector('#lm-tag') &&
      (document.querySelector('#noidung') || {}).textContent.indexOf(tenLM) >= 0;
  }, TEN_LM, { timeout: 15000 });
  ktra(await p2.isHidden('#lm-tag'), 'màn Liên Minh đang mở tự đổi khỏi trạng thái chờ sau khi được duyệt');

  /* dữ liệu thành viên cũng được nhịp nền lấy lại từ máy chủ */
  var tv2 = await p2.$$eval('#noidung table tr', function (rs) {
    return rs.filter(function (r) { return r.querySelector('td'); }).map(function (r) { return r.textContent; });
  });
  var chuoiTV = tv2.join(' | ');
  ktra(/Quốc Bình/.test(chuoiTV) && /Lê Vũ/.test(chuoiTV),
    'bảng thành viên của người 2 hiện cả hai người (' + tv2.length + ' hàng)');

  /* Giữ Chỗ đi trọn journey qua UI: nút đồng minh → preview dùng helper
     chung → inbound thân thiện → đóng quân thật → gọi về. */
  suaStateUI('Lê Vũ', function (st) {
    var p = st.planets[0];
    p.ships.fighterL = 10; p.res.deut = 1000000;
    st.baoTri.nextAt = st.now + 1e9; st.nextRaid = st.now + 1e9;
  });
  var taiTau2 = p2.waitForResponse(function (r) { return r.url().indexOf('/api/state') >= 0; }, { timeout: 20000 });
  await p2.evaluate('APP.hienLai()'); await taiTau2;
  await p2.waitForFunction('window.ST && ST.planets[0].ships.fighterL === 10', null, { timeout: 20000 });
  await vaoMan(p2, 'thienha', '/api/he');
  await diTuiHe(p2, nha1.g, nha1.h);
  var nutDongQuan = p2.locator('#noidung tr.nguoi', { hasText: 'Quốc Bình' }).locator('[data-act="nv"][data-m="hold"]');
  ktra(await nutDongQuan.isVisible(), 'bản đồ đồng minh có nút Đóng quân thật');
  await nutDongQuan.click();
  await p2.waitForSelector('#f-giu', { state: 'visible', timeout: 20000 });
  await p2.fill('#ft-fighterL', '10');
  await p2.fill('#f-giu', '18');
  var xemThieuNL = await chuNoiDung(p2);
  ktra(/NL kỳ quỹ đạo đầu/.test(xemThieuNL) && /NL giữ đủ 18 giờ/.test(xemThieuNL) &&
    /Chưa đủ kỳ đầu/.test(xemThieuNL),
    'form preview cùng lúc hiện phí đoạn đầu, tổng kế hoạch và cảnh báo thiếu cargo');
  var tongNLGiuUI = await p2.evaluate('G.nhienLieuGiuTong(ST,{fighterL:10},18*3600)');
  await p2.fill('#fc-deut', String(tongNLGiuUI));
  ktra(/Đủ theo kế hoạch hiện tại/.test(await chuNoiDung(p2)),
    'nạp đủ cargo làm preview chuyển sang trạng thái đủ toàn kế hoạch');
  await nhan(p2, '[data-act="gui"]', '/api/lam');
  ktra(await p2.evaluate('ST.fleets.length === 1 && ST.fleets[0].mission === "hold" && ST.fleets[0].pha === "di"'),
    'phát lệnh Giữ Chỗ qua UI tạo fleet outbound authoritative');
  ktra(/đang bay tới/.test(await chuNoiDung(p2)) && await p2.isVisible('[data-act="goive"]'),
    'chủ thấy hold outbound và có thể gọi về ngay');

  var taiInbound1 = p1.waitForResponse(function (r) { return r.url().indexOf('/api/state') >= 0; }, { timeout: 20000 });
  await p1.evaluate('APP.hienLai()'); await taiInbound1;
  await p1.waitForFunction(function () {
    return window.ST && Array.isArray(ST.pvpToi) && ST.pvpToi.some(function (x) { return x.nv === 'hold'; });
  }, null, { timeout: 20000 });
  await vaoMan(p1, 'hamdoi');
  var thayInboundUI = await p1.waitForFunction(function () {
    var n = document.querySelector('#noidung'), s = n ? n.textContent : '';
    return window.U && U.man === 'hamdoi' && window.ST && Array.isArray(ST.pvpToi) &&
      ST.pvpToi.some(function (x) { return x.nv === 'hold'; }) &&
      s.indexOf('Giữ Chỗ') >= 0 && s.indexOf('Hạm đội đang bay tới') >= 0;
  }, null, { timeout: 12000 }).then(function () { return true; }, function () { return false; });
  var cdInboundUI = thayInboundUI ? null : await p1.evaluate(function () {
    return { man: window.U && U.man, pvpToi: window.ST && ST.pvpToi,
      noi: ((document.querySelector('#noidung') || {}).textContent || '').slice(0, 500) };
  });
  ktra(thayInboundUI, 'host thấy đoàn hold đang tới như lực lượng thân thiện, không giả làm tấn công' +
    (cdInboundUI ? ' ' + JSON.stringify(cdInboundUI) : ''));

  suaStateUI('Lê Vũ', function (st) {
    st.lastTick = st.now - 5;
    st.fleets.forEach(function (f) { if (f.mission === 'hold' && f.pha === 'di') f.den_t = st.now - 2; });
  });
  var taiDen2 = p2.waitForResponse(function (r) { return r.url().indexOf('/api/state') >= 0; }, { timeout: 20000 });
  await p2.evaluate('APP.hienLai()'); await taiDen2;
  await p2.waitForFunction('ST.fleets[0] && ST.fleets[0].pha === "giu"', null, { timeout: 20000 });
  await vaoMan(p2, 'hamdoi');
  ktra(/đang đóng quân quỹ đạo/.test(await chuNoiDung(p2)) &&
    /Rời quỹ đạo/.test(await chuNoiDung(p2)) && /Tiếp NL/.test(await chuNoiDung(p2)) &&
    await p2.isVisible('[data-act="goive"]'),
    'chủ thấy trạng thái đóng quân, mốc hết hạn/tiếp nhiên liệu và nút Gọi Về');
  var taiGiu1 = p1.waitForResponse(function (r) { return r.url().indexOf('/api/state') >= 0; }, { timeout: 20000 });
  await p1.evaluate('APP.hienLai()'); await taiGiu1;
  await p1.waitForFunction('window.ST && ST.pvpGiu && ST.pvpGiu.length === 1', null, { timeout: 20000 });
  await vaoMan(p1, 'hamdoi');
  var thayGiuUI = await p1.waitForFunction(function () {
    var n = document.querySelector('#noidung'), s = n ? n.textContent : '';
    return window.U && U.man === 'hamdoi' && window.ST && Array.isArray(ST.pvpGiu) && ST.pvpGiu.length === 1 &&
      s.indexOf('Hạm đội đồng minh đóng quân quỹ đạo') >= 0 && s.indexOf('Lê Vũ') >= 0 &&
      s.indexOf('Máy Bay Chiến Đấu') >= 0;
  }, null, { timeout: 12000 }).then(function () { return true; }, function () { return false; });
  var cdGiuUI = thayGiuUI ? null : await p1.evaluate(function () {
    return { man: window.U && U.man, pvpGiu: window.ST && ST.pvpGiu,
      noi: ((document.querySelector('#noidung') || {}).textContent || '').slice(0, 500) };
  });
  ktra(thayGiuUI, 'host thấy đúng chủ và đội hình đồng minh đã đóng quân' +
    (cdGiuUI ? ' ' + JSON.stringify(cdGiuUI) : ''));
  await nhan(p2, '[data-act="goive"]', '/api/lam');
  ktra(await p2.evaluate('ST.fleets[0] && ST.fleets[0].pha === "ve"'),
    'Gọi Về từ UI chuyển stationed fleet sang pha ve');
  var taiRoi1 = p1.waitForResponse(function (r) { return r.url().indexOf('/api/state') >= 0; }, { timeout: 20000 });
  await p1.evaluate('APP.hienLai()'); await taiRoi1;
  ktra(await p1.evaluate('Array.isArray(ST.pvpGiu) && ST.pvpGiu.length === 0'),
    'host mất projection garrison ngay khi chủ gọi fleet về');

  /* Chuyển Galana phải có hành động thật trong UI và cập nhật nguyên tử hai
     đế quốc. Người nhận nhận state mới qua nhịp đồng bộ nền. */
  await vaoMan(p1, 'lienminh', '/api/lm');
  var nutGalana = '[data-act="chuyen-galana"][data-ten="Lê Vũ"]';
  ktra(await p1.isVisible(nutGalana), 'chủ liên minh thấy nút Chuyển Galana cho đồng minh');
  /* Khoá thuế ở 0 trong riêng phép đo này: từ v5 thuế chạy liên tục nên nếu
     giữ mức thuế gameplay, số dư hai phía có thể đổi giữa hai lần đọc UI. */
  await Promise.all([p1, p2].map(function (page) {
    return page.evaluate(function () {
      return new Promise(function (resolve) {
        APP.lam('doithue', { pi: 0, thue: 0 }, function () { resolve(); });
      });
    });
  }));
  var galChoA0 = await p1.evaluate('window.ST.galana');
  var galChoB0 = await p2.evaluate('window.ST.galana');
  await p1.click(nutGalana);
  await p1.fill('#galana-so', '123');
  await nhan(p1, '#ht-noi [data-act="chuyen-galana-ok"]', '/api/chuyengalana');
  var galChoA1 = await p1.evaluate('window.ST.galana');
  ktra(galChoA1 === galChoA0 - 123, 'người gửi bị trừ đúng 123 Galana');
  await p2.waitForFunction(function (truoc) { return window.ST && window.ST.galana === truoc + 123; }, galChoB0,
    { timeout: 18000 });
  ktra((await p2.evaluate('window.ST.galana')) === galChoB0 + 123,
    'người nhận được cộng đúng 123 Galana qua đồng bộ');
  await chup(p2, 'lienminh2');

  /* Một thành viên thường không được thấy nút tuyên chiến thay cho chủ LM. */
  var ctxNgoai = await browser.newContext({ viewport: { width: 1100, height: 800 }, locale: 'vi-VN' });
  var pNgoai = await moTrang(ctxNgoai, 'người ngoài');
  var dkNgoai = await dangKy(pNgoai, 'trinhnghiem', 'Trinh Nghiệm', 'matkhau789');
  var nhaNgoai = dkNgoai.nha || await pNgoai.evaluate('window.ST.planets[0].c');
  await vaoMan(p2, 'thienha', '/api/he');
  await diTuiHe(p2, nhaNgoai.g, nhaNgoai.h);
  await p2.waitForFunction(function () {
    var n = document.querySelector('#noidung');
    return n && n.textContent.indexOf('Trinh Nghiệm') >= 0;
  }, null, { timeout: 20000 });
  var dongNgoai = await p2.$$eval('#noidung tr.nguoi', function (rs) {
    var r = rs.filter(function (x) { return x.textContent.indexOf('Trinh Nghiệm') >= 0; })[0];
    return r ? { chu: r.textContent, tuyen: !!r.querySelector('[data-act="tuyen-chien"]') } : null;
  });
  ktra(!!dongNgoai && !dongNgoai.tuyen && /Chủ liên minh mới được tuyên chiến/.test(dongNgoai.chu),
    'thành viên thường chỉ thấy giải thích, không thấy nút tuyên chiến');
  await ctxNgoai.close();

  /* ---------- 6b. phòng chat chung & liên minh ---------- */
  await vaoMan(p1, 'chat', '/api/chat');
  ktra(await p1.isVisible('#chat-noi-chung'), 'màn Chat có ô gửi vào kênh chung');
  var CHAT_CHUNG = 'Chào <b>toàn vũ trụ</b>!';
  await p1.fill('#chat-noi-chung', CHAT_CHUNG);
  await nhan(p1, '[data-act="chat-gui"][data-kenh="chung"]', '/api/chat');
  await p1.waitForFunction(function (noi) {
    return (document.querySelector('#chat-ds-chung') || {}).textContent.indexOf(noi) >= 0;
  }, CHAT_CHUNG, { timeout: 20000 });
  ktra(!(await p1.isDisabled('[data-act="chat-gui"][data-kenh="chung"]')),
    'nút Gửi được mở lại sau khi máy chủ nhận tin');
  ktra((await p1.$$('#chat-ds-chung .chat-noi b')).length === 0,
    'nội dung HTML trong chat được hiển thị như chữ, không chèn DOM');
  for (var chatThem = 1; chatThem <= 2; chatThem++) {
    await p1.fill('#chat-noi-chung', 'Tin dài ' + chatThem + ': ' + 'x'.repeat(270));
    await nhan(p1, '[data-act="chat-gui"][data-kenh="chung"]', '/api/chat');
  }

  await vaoMan(p2, 'chat', '/api/chat');
  var ndChat2 = await chuNoiDung(p2);
  ktra(ndChat2.indexOf(CHAT_CHUNG) >= 0 && /Quốc Bình/.test(ndChat2),
    'người 2 thấy tin kênh chung của người 1');
  var chatODay = await p2.$eval('#chat-ds-chung', function (e) {
    return e.scrollHeight > e.clientHeight && e.scrollHeight - e.scrollTop - e.clientHeight < 3;
  });
  ktra(chatODay, 'lần đầu mở phòng chat tự cuộn tới các tin mới nhất');
  ktra(await p2.isVisible('#chat-noi-lienminh'), 'thành viên có ô chat riêng liên minh');
  var CHAT_LM = 'Tập kết hạm đội tại hệ 4.';
  await p2.fill('#chat-noi-lienminh', CHAT_LM);
  await nhan(p2, '[data-act="chat-gui"][data-kenh="lienminh"]', '/api/chat');
  await p2.waitForFunction(function (noi) {
    return (document.querySelector('#chat-ds-lienminh') || {}).textContent.indexOf(noi) >= 0;
  }, CHAT_LM, { timeout: 20000 });

  await vaoMan(p1, 'chat', '/api/chat');
  var ndChat1 = await chuNoiDung(p1);
  ktra(ndChat1.indexOf(CHAT_LM) >= 0 && /Lê Vũ/.test(ndChat1),
    'đồng minh thấy tin kênh riêng của nhau');
  await chup(p1, 'chat');

  /* Người 2 vẫn đứng ở Chat khi bị loại: nhịp đồng bộ phải đổi toàn bộ khung
     liên minh, không để lại ô nhập cũ chỉ chờ server trả 403. */
  await vaoMan(p1, 'lienminh', '/api/lm');
  var nutLoai2 = '[data-act="lm-duoi"][data-ten="Lê Vũ"]';
  ktra(await p1.isVisible(nutLoai2), 'chủ thấy nút loại thành viên trong Bộ Chỉ Huy');
  await p1.click(nutLoai2);
  await nhan(p1, '#ht-noi [data-act="lm-duoi-ok"]', '/api/lmduoi');
  await p2.waitForFunction(function () {
    return window.ST && !window.ST.lm && !document.querySelector('#chat-noi-lienminh');
  }, null, { timeout: 18000 });
  ktra(await p2.isHidden('#chat-noi-lienminh'), 'màn Chat tự bỏ ô liên minh ngay sau khi membership đổi');

  /* Đổi tài khoản trong cùng tab không được mang cache chat riêng của A sang B. */
  await vaoMan(p1, 'chat', '/api/chat');
  ktra((await chuNoiDung(p1)).indexOf(CHAT_LM) >= 0, 'xác lập tài khoản A đang giữ lịch sử chat riêng trong cache');
  await vaoMan(p1, 'taikhoan');
  /* Giữ một response chat A đã lấy thành công từ server, chỉ giao về client
     sau khi B đăng nhập để bắt đúng race response cũ về muộn. */
  var nhaChatCu, daGiuChat;
  var chatCuDaVeServer = new Promise(function (ok) { daGiuChat = ok; });
  var moChatCu = new Promise(function (ok) { nhaChatCu = ok; });
  await p1.route('**/api/chat', async function (route) {
    var responseA = await route.fetch();
    daGiuChat();
    await moChatCu;
    await route.fulfill({ response: responseA });
  });
  await p1.click('[data-man="chat"]');
  await chatCuDaVeServer;
  await p1.click('[data-man="taikhoan"]');
  await nhan(p1, '[data-act="dangxuat"]', '/api/dangxuat');
  var daDonCache = await p1.evaluate('MP.chat === null && MP.lm === null && U.mp === null && U.man === "tongquan" && ' +
    '!document.querySelector("#noidung").textContent && !document.querySelector("#dn-mk").value && ' +
    '!document.querySelector("#dk-mk").value && getComputedStyle(document.querySelector("#form-dn")).display !== "none"');
  ktra(daDonCache, 'đăng xuất xoá cache, mật khẩu DOM và reset về form đăng nhập');
  await dangNhap(p1, 'levu', 'matkhau456');
  nhaChatCu();
  await nghi(500);
  await p1.unroute('**/api/chat');
  var roChat = await p1.evaluate(function (biMat) {
    return MP.chat === null && U.man === 'tongquan' &&
      (document.querySelector('#noidung') || {}).textContent.indexOf(biMat) < 0;
  }, CHAT_LM);
  ktra(roChat, 'response chat A về muộn không rò sang tài khoản B trong cùng tab');

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

  /* ---------- 9. save một người: migration localStorage v3 → v6 ---------- */
  var ctxSolo = await browser.newContext({ viewport: { width: 1100, height: 800 }, locale: 'vi-VN' });
  var pSolo = await ctxSolo.newPage();
  theoDoi('một người', pSolo);
  await pSolo.goto(URL + '/motnguoi', { waitUntil: 'domcontentloaded' });
  await pSolo.waitForFunction('window.G && G.STATE_VERSION === 6', null, { timeout: 20000 });
  await pSolo.evaluate(function () {
    var s = G.moiGame('Cựu Chỉ Huy', 'THDC-LOCAL-V3');
    s.v = 3; delete s.moHinhCT;
    s.planets[0].b = { metalMine: 4, robot: 2 };
    s.planets[0].qB = [{ id: 'metalMine', lv: 5, cost: { metal: 777, crystal: 333 }, tg: 321, xong: s.now + 9999 }];
    localStorage.removeItem('thdc_save_v6');
    localStorage.removeItem('thdc_save_v5');
    localStorage.removeItem('thdc_save_v4');
    localStorage.setItem('thdc_save_v3', JSON.stringify(s));
  });
  await pSolo.reload({ waitUntil: 'domcontentloaded' });
  await pSolo.waitForSelector('#kd-tieptuc', { state: 'visible', timeout: 20000 });
  var saveLocal = await pSolo.evaluate(function () {
    return { cu: JSON.parse(localStorage.getItem('thdc_save_v3')),
      moi: JSON.parse(localStorage.getItem('thdc_save_v6')) };
  });
  ktra(saveLocal.cu.v === 3 && saveLocal.moi.v === 6 &&
    saveLocal.moi.moHinhNhip === 'bao-tri-dan-su-v1' &&
    saveLocal.moi.moHinhQuyDao === 'giu-quy-dao-v1' && saveLocal.moi.planets[0].b.metalMine === 8,
    'solo tự tạo save v6 đã migrate nhưng vẫn giữ nguyên bản raw v3');
  ktra(saveLocal.moi.planets[0].qB[0].n === 5 && saveLocal.moi.planets[0].qB[0].lv === undefined,
    'solo đổi hàng đợi v3 sang số lượng đúng trước khi hiện nút Tiếp tục');
  await pSolo.click('#kd-tieptuc');
  await pSolo.waitForSelector('#game', { state: 'visible', timeout: 20000 });
  ktra(await pSolo.evaluate('ST.v === 6 && ST.moHinhCT === "so-luong-v1" && ' +
    'ST.moHinhNhip === "bao-tri-dan-su-v1" && ST.moHinhQuyDao === "giu-quy-dao-v1"'),
    'bàn solo tiếp tục bằng state v6');

  /* Xoá thật phải vô hiệu state trước khi reload; nếu không beforeunload sẽ
     ghi lại đúng save v6 vừa xoá. */
  await pSolo.evaluate(function () {
    localStorage.setItem('thdc_save_v5', '{}');
    localStorage.setItem('thdc_save_v4', '{}');
    localStorage.setItem('thdc_save_v3', '{}');
  });
  await pSolo.evaluate(function () { APP.ACT['xoa-that'](); }).catch(function () { /* reload huỷ context cũ */ });
  await pSolo.waitForSelector('#man-khoidong', { state: 'visible', timeout: 20000 });
  ktra(await pSolo.evaluate(function () {
    return ['v6', 'v5', 'v4', 'v3'].every(function (x) { return !localStorage.getItem('thdc_save_' + x); });
  }), 'xoá bàn dọn sạch v6/v5/v4/v3, beforeunload không phục hồi state');

  /* Khi chưa có key v6, key gần nhất thắng; mọi raw fallback vẫn được giữ. */
  await pSolo.evaluate(function () {
    ['v3', 'v4', 'v5'].forEach(function (x, i) {
      var s = G.moiGame('Nguồn ' + x, 'THDC-FALLBACK-' + x);
      s.v = Number(x.slice(1));
      if (s.v < 6) delete s.moHinhQuyDao;
      if (s.v < 5) { delete s.moHinhNhip; delete s.baoTri; delete s.planets[0].danSu; }
      if (s.v < 4) delete s.moHinhCT;
      localStorage.setItem('thdc_save_' + x, JSON.stringify(s));
    });
    localStorage.removeItem('thdc_save_v6');
  });
  await pSolo.reload({ waitUntil: 'domcontentloaded' });
  await pSolo.waitForSelector('#kd-tieptuc', { state: 'visible', timeout: 20000 });
  var uuTien = await pSolo.evaluate(function () {
    return { ten: JSON.parse(localStorage.getItem('thdc_save_v6')).ten,
      raws: ['v3', 'v4', 'v5'].map(function (x) { return !!localStorage.getItem('thdc_save_' + x); }) };
  });
  ktra(uuTien.ten === 'Nguồn v5' && uuTien.raws.every(Boolean),
    'solo ưu tiên fallback v5 trước v4/v3 và giữ nguyên cả ba bản raw');
  await ctxSolo.close();

  /* Một context sạch giữ ST=null, nên beforeunload không thể ghi đè fixture tương lai. */
  var ctxFuture = await browser.newContext({ viewport: { width: 1100, height: 800 }, locale: 'vi-VN' });
  var pFuture = await ctxFuture.newPage();
  theoDoi('save tương lai', pFuture);
  await pFuture.goto(URL + '/motnguoi', { waitUntil: 'domcontentloaded' });
  await pFuture.waitForFunction('window.G && G.STATE_VERSION === 6', null, { timeout: 20000 });
  await pFuture.evaluate(function () {
    var s = G.moiGame('Từ Tương Lai', 'THDC-FUTURE');
    s.v = 999; s.moHinhCT = 'future';
    localStorage.setItem('thdc_save_v6', JSON.stringify(s));
  });
  await pFuture.reload({ waitUntil: 'domcontentloaded' });
  await pFuture.waitForFunction(function () {
    return /mới hơn engine v6/.test((document.querySelector('.kd-form') || {}).textContent || '');
  }, null, { timeout: 20000 });
  ktra(await pFuture.isHidden('#kd-tieptuc') &&
    (await pFuture.evaluate('JSON.parse(localStorage.getItem("thdc_save_v6")).v')) === 999,
    'solo từ chối state tương lai, báo rõ và không ghi đè dữ liệu');
  await ctxFuture.close();

  /* ---------- 10. máy chủ không ghi lỗi ---------- */
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
