/* Gate B browser-native cho bản standalone, không cần socket/backend.
 * Chạy: THDC_PLAYWRIGHT=/path/playwright/index.mjs \
 *       THDC_CHROMIUM=/path/to/chrome npm run test:visual */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function napChromium() {
  var ds = [];
  if (process.env.THDC_PLAYWRIGHT) ds.push(process.env.THDC_PLAYWRIGHT);
  ds.push('playwright', 'playwright-core');
  var loiCuoi = null;
  for (var i = 0; i < ds.length; i++) {
    try {
      var m = await import(ds[i]);
      if (m.chromium) return m.chromium;
      if (m.default && m.default.chromium) return m.default.chromium;
    } catch (e) { loiCuoi = e; }
  }
  throw new Error('Không tìm thấy Playwright; đặt THDC_PLAYWRIGHT tới index.mjs.' +
    (loiCuoi && loiCuoi.code ? ' (' + loiCuoi.code + ')' : ''));
}

var THUMUC = path.dirname(fileURLToPath(import.meta.url));
var GOC = path.join(THUMUC, '..');
var HTML = path.join(GOC, 'dist', 'thien-ha-dai-chien.html');
var ANH = path.join(GOC, 'docs', 'superpowers', 'evidence', '2026-08-26-gate-b');
var ok = 0, loi = 0, loiTrinhDuyet = [], anhDaChup = [];

function ktra(dk, ten, chiTiet) {
  if (dk) { ok++; return; }
  loi++;
  console.log('  ✗ ' + ten + (chiTiet ? ': ' + chiTiet : ''));
}

function slug(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

var chromium = await napChromium();
if (!fs.existsSync(HTML)) throw new Error('Thiếu artifact. Chạy npm run build trước.');
fs.mkdirSync(ANH, { recursive: true });

var tuyChon = {
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files']
};
if (process.env.THDC_BROWSER_RESTRICTED === '1') tuyChon.args.push(
  '--single-process', '--no-zygote', '--disable-gpu', '--disable-crash-reporter', '--disable-crashpad'
);
if (process.env.THDC_CHROMIUM) tuyChon.executablePath = process.env.THDC_CHROMIUM;

var browser = await chromium.launch(tuyChon);
try {
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  await context.route('https://fonts.googleapis.com/**', function (route) {
    return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' });
  });
  await context.route('https://fonts.gstatic.com/**', function (route) {
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
  });
  var page = await context.newPage();
  page.on('pageerror', function (e) {
    loiTrinhDuyet.push('pageerror: ' + String(e && e.message || e));
  });
  page.on('console', function (m) {
    if (m.type() === 'error' && !/favicon/i.test(m.text())) loiTrinhDuyet.push('console: ' + m.text());
  });

  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(function () { return !!(window.G && window.U && window.APP); });
  await page.fill('#kd-ten', 'Gate B');
  await page.fill('#kd-seed', 'THDC-GATE-B');
  await page.click('#kd-batdau');
  await page.waitForSelector('#game', { state: 'visible' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });

  await page.evaluate(function () {
    ST.toi = [{ id: 'gate-b-old', pi: 0, ten: 'Hạm Đội Đột Kích', den_t: G.giay() + 1800 }];
    U.denMan('tongquan');
    U.ve();
  });

  /* Alert CTA đổi identity không được hút focus sang cảnh báo mới. */
  await page.focus('#nut-tinh-hinh-chinh');
  await page.evaluate(function () {
    ST.toi = [{ id: 'gate-b-new', pi: 0, ten: 'Biên Đội Xâm Nhập', den_t: G.giay() + 1500 }];
    U.ve();
  });
  ktra(await page.evaluate(function () { return document.activeElement && document.activeElement.id === 'thanh-canh'; }),
    'browser: alert đổi identity trả focus về Situation Strip');

  /* Desktop: menu là rail cố định, Escape không được cướp focus. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(function () { U.denMan('tongquan'); });
  await page.click('#workspace [data-workspace="phat_trien"]');
  var coDesktopProbe = await page.evaluate(function () {
    var el = document.querySelector('#noidung button:not([disabled]),#noidung input:not([disabled]),#noidung select:not([disabled])');
    if (!el) return false;
    window.__gateFocusProbe = el;
    el.focus();
    return true;
  });
  await page.keyboard.press('Escape');
  ktra(coDesktopProbe && await page.evaluate(function () {
    return document.activeElement === window.__gateFocusProbe && !document.getElementById('menu').classList.contains('mo-ra');
  }), 'browser 1440px: Escape không cướp focus trong menu cố định');

  /* Mobile: resource/menu không chồng nhau và restore đúng node sau render. */
  await page.setViewportSize({ width: 414, height: 896 });
  await page.evaluate(function () { U.denMan('tongquan'); });
  await page.click('#nut-res-strip');
  await page.evaluate(function () { U.ve(); });
  await page.keyboard.press('Escape');
  ktra(await page.evaluate(function () {
    return document.activeElement && document.activeElement.id === 'nut-res-strip' &&
      !document.getElementById('tt-res').classList.contains('mo-ra');
  }), 'browser 414px: resource restore trigger mới sau full render');

  await page.click('#nut-res-strip');
  await page.click('#workspace [data-workspace="chi_huy"]');
  await page.evaluate(function () {
    ST.msgs.unshift({ id: 'gate-b-message', doc: false, t: G.giay(), td: 'Tình báo mới', noi: 'Kiểm thử badge' });
    U.ve();
  });
  var mobileTruocEsc = await page.evaluate(function () {
    return document.getElementById('menu').classList.contains('mo-ra') &&
      !document.getElementById('tt-res').classList.contains('mo-ra');
  });
  await page.keyboard.press('Escape');
  ktra(mobileTruocEsc && await page.evaluate(function () {
    var el = document.activeElement;
    return el && el.getAttribute('data-workspace') === 'chi_huy' &&
      !document.getElementById('menu').classList.contains('mo-ra') &&
      !document.getElementById('tt-res').classList.contains('mo-ra');
  }), 'browser 414px: workspace đóng resource và Escape restore đúng opener');

  var viewports = [
    { width: 1440, height: 900 },
    { width: 960, height: 900 },
    { width: 414, height: 896 },
    { width: 320, height: 568 }
  ];
  var screens = [
    { id: 'tongquan', ten: 'Tổng Quan' },
    { id: 'thienha', ten: 'Thiên Hà' },
    { id: 'tainguyen', ten: 'Tài Nguyên' }
  ];

  for (var vi = 0; vi < viewports.length; vi++) {
    var vp = viewports[vi];
    await page.setViewportSize(vp);
    for (var si = 0; si < screens.length; si++) {
      var man = screens[si];
      await page.evaluate(function (id) { U.denMan(id); window.scrollTo(0, 0); }, man.id);
      await page.waitForTimeout(60);
      var m = await page.evaluate(function () {
        function thay(el) {
          if (!el) return false;
          var cs = getComputedStyle(el), r = el.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        }
        var alert = document.querySelector('.tinh-hinh-canh');
        var alertRect = alert && alert.getBoundingClientRect();
        var main = document.getElementById('noidung'), mainRect = main.getBoundingClientRect();
        var matrixTable = document.querySelector('.tq-ma-tran table');
        var matrixMobile = document.querySelector('.tq-ma-tran-mobile');
        var dataTable = document.querySelector('#noidung .bang-cuon>table');
        var dataScroller = dataTable && dataTable.parentElement;
        var dataRect = dataTable && dataTable.getBoundingClientRect();
        var w = window.innerWidth;
        return {
          man: U.man,
          title: (document.getElementById('tieu-de-man') || {}).textContent || '',
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - w,
          mainTrongKhung: mainRect.width > 0 && mainRect.left >= -1 && mainRect.right <= w + 1,
          alertTrongFold: !!alertRect && alertRect.top >= 0 && alertRect.bottom <= window.innerHeight,
          menuDung: w >= 960
            ? thay(document.getElementById('menu')) && !thay(document.getElementById('nut-menu'))
            : !thay(document.getElementById('menu')) && thay(document.getElementById('nut-menu')),
          resDung: w <= 639
            ? !thay(document.getElementById('tt-res')) && thay(document.getElementById('nut-res-strip'))
            : thay(document.getElementById('tt-res')),
          matrixDung: U.man !== 'tongquan' ? true : (w >= 960 ? thay(matrixTable) && !thay(matrixMobile) : !thay(matrixTable) && thay(matrixMobile)),
          bangDuLieuDung: U.man === 'tongquan' || w > 960 ? true : !!(dataRect &&
            dataRect.width >= 670 && dataScroller.scrollWidth > dataScroller.clientWidth)
        };
      });
      var nhan = vp.width + 'px · ' + man.ten;
      ktra(m.man === man.id && !!m.title.trim(), nhan + ': render đúng destination/heading');
      ktra(m.overflow <= 1 && m.mainTrongKhung, nhan + ': không tràn ngang');
      ktra(m.alertTrongFold, nhan + ': cảnh báo nằm trong viewport đầu');
      ktra(m.menuDung && m.resDung && m.matrixDung && m.bangDuLieuDung,
        nhan + ': đúng disclosure/matrix/data-table breakpoint');
      var file = path.join(ANH, vp.width + '-' + slug(man.ten) + '.png');
      await page.screenshot({ path: file, fullPage: false });
      anhDaChup.push(file);
    }
  }

  ktra(!loiTrinhDuyet.length, 'không có pageerror/console error', loiTrinhDuyet.join(' | '));
  ktra(anhDaChup.length === 12 && anhDaChup.every(function (file) { return fs.existsSync(file); }),
    'đã sinh đủ 12 screenshot Gate B');
  console.log('  · ảnh Gate B: ' + ANH);
} finally {
  await browser.close();
}

console.log('\n' + (loi ? '✗ ' + loi + ' lỗi / ' : '✓ ') + ok + ' kiểm tra Gate B đạt');
if (loi) process.exitCode = 1;
