/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 */
'use strict';

/* Contract test cho lớp UI vanilla. Không cần browser/dependency:
 * - khóa exact destination/hook/renderer/action;
 * - bắt CSS hỏng trước khi browser im lặng bỏ rule;
 * - mô phỏng full render để bảo vệ input đang được người dùng chỉnh. */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
function doc(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

var SRC = {
  ui: doc('js/ui.js'),
  app: doc('js/app.js'),
  solo: doc('js/main.js'),
  mp: doc('web/js/mp.js'),
  design: doc('design.md'),
  tokens: fs.existsSync(path.join(ROOT, 'css', 'tokens.css')) ? doc('css/tokens.css') : '',
  css: doc('css/style.css'),
  build: doc('tools/build.js'),
  visual: doc('tools/test-visual-gate.mjs'),
  serverIndex: doc('server/index.js'),
  index: doc('index.html'),
  webIndex: doc('web/index.html')
};

var ok = 0, fail = 0;
function ktra(dieuKien, ten, chiTiet) {
  if (dieuKien) {
    ok++;
    return;
  }
  fail++;
  console.log('  ✗ ' + ten + (chiTiet ? ': ' + chiTiet : ''));
}
function bangNhau(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
function duyNhat(ds) {
  return Array.from(new Set(ds)).sort();
}

function dongTai(text, index) {
  return text.slice(0, index).split('\n').length;
}

function timNgoacDong(text, openAt) {
  var sau = 0, quote = '', lineComment = false, blockComment = false;
  for (var i = openAt; i < text.length; i++) {
    var c = text[i], n = text[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) {
      if (c === '*' && n === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') sau++;
    if (c === '}' && --sau === 0) return i;
  }
  return -1;
}

function vungObject(text, marker) {
  var at = text.indexOf(marker);
  if (at < 0) return '';
  var open = text.indexOf('{', at + marker.length - 1);
  var close = timNgoacDong(text, open);
  return close < 0 ? '' : text.slice(open + 1, close);
}

function layMenu(text) {
  var at = text.indexOf('U.MAN = [');
  if (at < 0) return [];
  var end = text.indexOf('];', at);
  var block = text.slice(at, end + 2), out = [], m;
  var re = /\{\s*id:\s*'([^']+)'\s*,\s*icon:\s*'([^']+)'\s*,\s*ten:\s*'([^']+)'\s*\}/g;
  while ((m = re.exec(block))) out.push({ id: m[1], icon: m[2], ten: m[3] });
  return out;
}

function layHandler(text, marker) {
  var block = vungObject(text, marker), out = [], m;
  var re = /(?:^|\n)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:\s*function\s*\(/g;
  while ((m = re.exec(block))) out.push(m[1] || m[2] || m[3]);
  return out;
}

function layAttr(files, attr) {
  var out = [];
  var re = new RegExp(attr + '=(?:([\'"])?)' + '([^\'"\\s>]+)' + '\\1', 'g');
  for (var i = 0; i < files.length; i++) {
    var text = files[i], m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) out.push(m[2]);
  }
  return duyNhat(out.filter(function (x) { return x.indexOf("'") < 0 && x.indexOf('"') < 0; }));
}

function taoState() {
  return {
    seed: 'test-seed', t0: 1, ten: 'Chỉ Huy', tech: {},
    planets: [{
      c: { g: 1, h: 1, p: 1 }, ten: 'Hành Tinh Mẹ',
      res: { metal: 10, crystal: 20, deut: 30, food: 40 },
      danSu: { population: 250000, supportBp: 10000, taxBp: 400, foodDemandCycle: 0, foodShortfallCycle: 0 },
      qB: [], qS: [], b: {}, ships: {}, def: {}, linh: {}, thuDo: true, temp: 20, oDat: 150
    }],
    msgs: [], fleets: [], toi: [], pvpToi: [], pvpGiu: [], nk: [], lm: null,
    galana: 50, techPts: 60, now: 100,
    baoTri: { nextAt: 200, cycle: 0, missStreak: 0, arrearsGalana: 0 },
    stats: { thang: 0, thua: 0, cuop: 0, tauMat: 0, tauDietDich: 0, chuyenBay: 0 }
  };
}

function taoG() {
  var res = [
    { id: 'metal', ten: 'Kim Loại', ky: 'KL', mau: '#aaa' },
    { id: 'crystal', ten: 'Tinh Thể', ky: 'TA', mau: '#bbb' },
    { id: 'deut', ten: 'Nhiên Liệu', ky: 'NL', mau: '#ccc' },
    { id: 'food', ten: 'Thực Phẩm', ky: 'TP', mau: '#ddd' },
    { id: 'galana', ten: 'Galana', ky: 'GL', mau: '#eee' },
    { id: 'tech', ten: 'Kỹ Thuật', ky: 'KT', mau: '#fff' }
  ];
  return {
    VERSION: 'test',
    C: { TOC_DO_SERVER: 1, CHU_KY_BAO_TRI: 21600 },
    RES: res,
    RES_HANH_TINH: ['metal', 'crystal', 'deut', 'food'],
    MISSIONS: [{ id: 'attack', ten: 'Tấn Công' }, { id: 'transport', ten: 'Vận Chuyển' }],
    byId: function (ds, id) { return ds.find(function (x) { return x.id === id; }); },
    sanLuong: function () {
      return { r: { metal: 1, crystal: 2, deut: 3, food: 4, galana: 5, tech: 6 }, hs: 1, dienCo: 10, dienDung: 5 };
    },
    dungTich: function () { return { metal: 100, crystal: 100, deut: 100, food: 100 }; },
    soNgan: String,
    so: String,
    tg: String,
    gio: function () { return '00:00'; },
    tdStr: function (c) { return '[' + [c.g, c.h, c.p].join(':') + ']'; },
    tdKey: function (c) { return [c.g, c.h, c.p].join(':'); },
    diem: function () { return { tong: 0, ct: 0, nc: 0, ham: 0, thu: 0 }; },
    khe: function () { return 1; },
    dangThamHiem: function () { return 0; },
    kheThamHiem: function () { return 1; },
    maxThuocDia: function () { return 2; },
    sucChuaDan: function () { return 500000; },
    oDaDung: function () { return 0; },
    oToiDa: function () { return 150; },
    loaiHT: function () { return { ten: 'Ôn Hoà', mau: '#aaa' }; },
    R: function (id) { return { id: id, ten: id === 'laser' ? 'Laser' : id }; },
    B: function (id) { return { id: id, ten: id }; },
    UNIT: function (id) { return { id: id, ten: id }; },
    M: function (id) { return { id: id, ten: id }; }
  };
}

function napUi(document) {
  var window = { G: taoG(), APP: {}, ST: taoState(), scrollTo: function () {} };
  var context = {
    window: window,
    document: document,
    console: console,
    setTimeout: function () { return 0; },
    clearTimeout: function () {}
  };
  vm.createContext(context);
  vm.runInContext(SRC.ui, context, { filename: 'js/ui.js' });
  return context;
}

/* ---------------------------------------------------------------- menu */
var SOLO_EXPECTED = [
  'tongquan', 'tainguyen', 'congtrinh', 'nghiencuu', 'xuong', 'phongthu',
  'taichinh', 'thienha', 'hamdoi', 'mophong', 'tinnhan', 'lienminh',
  'xephang', 'huongdan', 'nhatky'
];
var MP_EXPECTED = [
  'tongquan', 'tainguyen', 'congtrinh', 'nghiencuu', 'xuong', 'phongthu',
  'taichinh', 'thienha', 'hamdoi', 'mophong', 'tinnhan', 'lienminh',
  'xephang', 'bangtin', 'chat', 'huongdan', 'taikhoan'
];
var WORKSPACE_EXPECTED = ['chi_huy', 'phat_trien', 'tac_chien', 'lien_minh', 'he_thong'];
var WORKSPACE_BY_ID = {
  tongquan: 'chi_huy',
  tainguyen: 'phat_trien', congtrinh: 'phat_trien', nghiencuu: 'phat_trien',
  xuong: 'phat_trien', phongthu: 'phat_trien', taichinh: 'phat_trien',
  thienha: 'tac_chien', hamdoi: 'tac_chien', mophong: 'tac_chien', tinnhan: 'tac_chien',
  lienminh: 'lien_minh', xephang: 'lien_minh', bangtin: 'lien_minh', chat: 'lien_minh',
  huongdan: 'he_thong', nhatky: 'he_thong', taikhoan: 'he_thong'
};
var registryCtx = napUi({ addEventListener: function () {}, getElementById: function () { return null; } });
var registryU = registryCtx.window.U;
var soloMenu = typeof registryU.taoMAN === 'function' ? registryU.taoMAN('solo') : [];
var mpMenu = typeof registryU.taoMAN === 'function' ? registryU.taoMAN('mp') : [];
ktra(bangNhau((registryU.WORKSPACES || []).map(function (x) { return x.id; }), WORKSPACE_EXPECTED),
  'workspace registry đúng exact 5 nhóm');
ktra((registryU.DESTINATIONS || []).length === 18 &&
  duyNhat((registryU.DESTINATIONS || []).map(function (x) { return x.id; })).length === 18,
  'destination registry có đúng 18 id duy nhất');
var registrySchemaSai = (registryU.DESTINATIONS || []).filter(function (x) {
  return !x || !x.id || WORKSPACE_EXPECTED.indexOf(x.workspace) < 0 || !Number.isFinite(x.order) ||
    !x.icon || !x.label || !Array.isArray(x.modes) || !Object.prototype.hasOwnProperty.call(x, 'badge') ||
    !Object.prototype.hasOwnProperty.call(x, 'preload') || x.modes.some(function (m) { return m !== 'solo' && m !== 'mp'; });
});
ktra(!registrySchemaSai.length && (registryU.DESTINATIONS || []).length === 18,
  'mọi destination có metadata id/workspace/order/icon/label/modes/badge/preload',
  registrySchemaSai.map(function (x) { return x && x.id; }).join(', '));
var PRELOAD_EXPECTED = {
  taichinh: 'taichinh', thienha: 'thienha', lienminh: 'lienminh',
  xephang: 'xephang', bangtin: 'bangtin', chat: 'chat'
};
ktra((registryU.DESTINATIONS || []).every(function (x) {
  return x.preload === (PRELOAD_EXPECTED[x.id] || null);
}), 'preload metadata chỉ gắn cho sáu destination cần dữ liệu MP');
ktra((registryU.metaMan && registryU.metaMan('hamdoi') || {}).badge === 'ham_dang_bay' &&
  (registryU.metaMan && registryU.metaMan('tinnhan') || {}).badge === 'tin_chua_doc' &&
  (registryU.DESTINATIONS || []).filter(function (x) { return x.badge; }).length === 2,
  'badge metadata chỉ gắn vào hạm đội và tin chưa đọc');
ktra(bangNhau(soloMenu.map(function (x) { return x.id; }), SOLO_EXPECTED),
  'destination solo đúng exact set và thứ tự');
ktra(bangNhau(mpMenu.map(function (x) { return x.id; }), MP_EXPECTED),
  'destination multiplayer đúng exact set và thứ tự');
ktra(soloMenu.concat(mpMenu).every(function (x) { return x.workspace === WORKSPACE_BY_ID[x.id]; }),
  'destination thuộc đúng workspace đã duyệt');
ktra(typeof registryU.taoMAN === 'function' && !registryU.taoMAN('khong-co').length,
  'factory mode lạ trả mảng rỗng');
if (soloMenu.length) soloMenu[0].label = 'đã sửa ở bản clone';
ktra(typeof registryU.taoMAN === 'function' &&
  (registryU.taoMAN('solo')[0] || {}).label === 'Tổng Quan',
  'factory trả bản clone, không làm bẩn canonical registry');
ktra(typeof registryU.metaMan === 'function' &&
  (registryU.metaMan('hamdoi') || {}).workspace === 'tac_chien' && registryU.metaMan('__sai__') === null,
  'metaMan trả canonical destination và null cho id lạ');
ktra(/U\.MAN\s*=\s*U\.taoMAN\(['"]solo['"]\)/.test(SRC.ui) &&
  /U\.MAN\s*=\s*U\.taoMAN\(['"]mp['"]\)/.test(SRC.mp) &&
  !/U\.MAN\s*=\s*\[/.test(SRC.mp),
  'solo và multiplayer cùng dùng factory, MP không còn registry sao chép');

/* Khôi phục clone sau phép thử mutation để các contract render dùng label thật. */
soloMenu = typeof registryU.taoMAN === 'function' ? registryU.taoMAN('solo') : [];
mpMenu = typeof registryU.taoMAN === 'function' ? registryU.taoMAN('mp') : [];

var union = duyNhat(SOLO_EXPECTED.concat(MP_EXPECTED));
var renderers = duyNhat(Array.from((SRC.ui + '\n' + SRC.mp).matchAll(/U\.m_([A-Za-z0-9_]+)\s*=\s*function/g))
  .map(function (m) { return m[1]; }));
ktra(union.every(function (id) { return renderers.indexOf(id) >= 0; }),
  'mọi destination có renderer trực tiếp',
  union.filter(function (id) { return renderers.indexOf(id) < 0; }).join(', '));

var iconBlock = vungObject(SRC.ui, 'var P = {');
var iconKeys = duyNhat(Array.from(iconBlock.matchAll(/(?:^|\n)\s*([A-Za-z][\w-]*)\s*:/g))
  .map(function (m) { return m[1]; }));
var menuIcons = duyNhat(soloMenu.concat(mpMenu).map(function (x) { return x.icon; }));
ktra(menuIcons.every(function (id) { return iconKeys.indexOf(id) >= 0; }),
  'mọi destination có icon riêng',
  menuIcons.filter(function (id) { return iconKeys.indexOf(id) < 0; }).join(', '));

/* ---------------------------------------------------------- rendered hooks */
var menuBox = {
  innerHTML: '',
  classList: { remove: function () {}, add: function () {}, toggle: function () { return false; }, contains: function () { return false; } },
  setAttribute: function () {}
};
var workspaceBox = { innerHTML: '', setAttribute: function () {} };
var domCoBan = {
  addEventListener: function () {},
  getElementById: function (id) {
    if (id === 'menu') return menuBox;
    if (id === 'workspace') return workspaceBox;
    return { innerHTML: '', classList: { remove: function () {} } };
  }
};
var ctx = napUi(domCoBan), U = ctx.window.U;
var fallbackIcon = U.svgIcon('__khong-ton-tai__');
ktra(menuIcons.filter(function (id) { return id !== 'tongquan'; }).every(function (id) {
  return U.svgIcon(id) !== fallbackIcon;
}), 'mọi icon ngoài Tổng Quan khác fallback ở runtime');
function veTatCaWorkspace(ds) {
  U.MAN = ds;
  var html = '';
  for (var wi = 0; wi < WORKSPACE_EXPECTED.length; wi++) {
    U.workspace = WORKSPACE_EXPECTED[wi];
    var trongNhom = ds.filter(function (m) { return m.workspace === U.workspace; });
    U.man = trongNhom.length ? trongNhom[0].id : '';
    menuBox.innerHTML = '';
    U.veMenu();
    html += menuBox.innerHTML;
  }
  return html;
}
var soloMenuHtml = veTatCaWorkspace(soloMenu);
var soloRendered = Array.from(soloMenuHtml.matchAll(/data-man="([^"]+)"/g)).map(function (m) { return m[1]; });
var mpMenuHtml = veTatCaWorkspace(mpMenu);
var mpRendered = Array.from(mpMenuHtml.matchAll(/data-man="([^"]+)"/g)).map(function (m) { return m[1]; });
ktra(bangNhau(soloRendered, SOLO_EXPECTED), 'menu solo render đủ data-man');
ktra(bangNhau(mpRendered, MP_EXPECTED), 'menu multiplayer render đủ data-man');
ktra((soloMenuHtml.match(/data-act="man"/g) || []).length === SOLO_EXPECTED.length &&
  (mpMenuHtml.match(/data-act="man"/g) || []).length === MP_EXPECTED.length,
  'mọi destination render giữ delegated click hook data-act="man"');
ktra(!/<a\b[^>]*data-man=/.test(soloMenuHtml + mpMenuHtml) &&
  (soloMenuHtml.match(/<button\b[^>]*type="button"[^>]*data-man=/g) || []).length === SOLO_EXPECTED.length &&
  (mpMenuHtml.match(/<button\b[^>]*type="button"[^>]*data-man=/g) || []).length === MP_EXPECTED.length,
  'destination nav dùng button semantic cho Enter/Space');
ktra((soloMenuHtml.match(/aria-current="page"/g) || []).length === WORKSPACE_EXPECTED.length &&
  (mpMenuHtml.match(/aria-current="page"/g) || []).length === WORKSPACE_EXPECTED.length,
  'mỗi workspace render đúng một destination aria-current');
U.MAN = soloMenu; U.workspace = 'chi_huy'; U.man = 'tongquan';
if (typeof U.veWorkspace === 'function') U.veWorkspace();
var workspaceRendered = Array.from(workspaceBox.innerHTML.matchAll(/data-workspace="([^"]+)"/g)).map(function (m) { return m[1]; });
ktra(bangNhau(workspaceRendered, WORKSPACE_EXPECTED) &&
  (workspaceBox.innerHTML.match(/<button\b[^>]*type="button"/g) || []).length === 5,
  'workspace rail render đúng 5 button semantic');
ktra((workspaceBox.innerHTML.match(/aria-current="true"/g) || []).length === 1,
  'workspace rail chỉ có một nhóm hiện tại');
ctx.window.ST.fleets = [{}];
if (typeof U.veWorkspace === 'function') U.veWorkspace();
ktra(/aria-label="Tác chiến, 1 việc cần chú ý"/.test(workspaceBox.innerHTML),
  'accessible name của workspace gồm cả badge cần chú ý');
ctx.window.ST.fleets = [];
ktra(['denMan', 'veWorkspace', 'veMenuNhanh', 'veDauMan', 'focusNoiDung', 'datResMo'].every(function (ten) {
  return typeof U[ten] === 'function';
}), 'navigation helpers Phase 2 tồn tại đầy đủ');
U.MAN = soloMenu; U.workspace = 'chi_huy'; U.man = 'tongquan';
var dauManHtml = typeof U.veDauMan === 'function' ? U.veDauMan() : '';
var menuNhanhHtml = typeof U.veMenuNhanh === 'function' ? U.veMenuNhanh('') : '';
ktra((dauManHtml.match(/<h1\b/g) || []).length === 1 && /id="tieu-de-man"/.test(dauManHtml) &&
  /Toàn đế quốc/.test(dauManHtml),
  'page header có đúng một h1 và scope nhìn thấy được');
ktra((menuNhanhHtml.match(/data-act="menu-nhanh-di"/g) || []).length === SOLO_EXPECTED.length,
  'command palette liệt kê đủ destination của mode hiện tại');
ktra(/<button type="button" class="d" data-act="doc-tin"[\s\S]{0,220}?aria-expanded=/.test(SRC.ui) &&
  /aria-controls="tin-noi-/.test(SRC.ui) && !/<div class="d" data-act="doc-tin"/.test(SRC.ui),
  'tin nhắn disclosure dùng button semantic với aria-expanded/controls');
ktra(typeof U.idDonHuy === 'function' &&
  (ctx.window.APP.mp = false, U.idDonHuy({ id: 7, choId: 91 })) === 7 &&
  (ctx.window.APP.mp = true, U.idDonHuy({ id: 7, choId: 91 })) === 91,
  'nút huỷ đơn dùng local id ở solo và global choId ở multiplayer');
ktra(/var idHuy\s*=\s*U\.idDonHuy\(dj\)[\s\S]{0,640}?data-id="' \+ U\.esc\(String\(idHuy\)\)/.test(SRC.ui),
  'renderer nút Huỷ dùng id đã phân giải theo mode');

var liveHtml = U.thanhRes();
var liveActual = duyNhat(Array.from(liveHtml.matchAll(/data-live="([^"]+)"/g)).map(function (m) { return m[1]; }));
var LIVE_EXPECTED = duyNhat([
  'res.metal', 'rate.metal', 'res.crystal', 'rate.crystal',
  'res.deut', 'rate.deut', 'res.food', 'rate.food',
  'galana', 'rate.galana', 'tech', 'rate.tech'
]);
ktra(bangNhau(liveActual, LIVE_EXPECTED), 'thanh tài nguyên giữ đúng 12 data-live key',
  liveActual.join(', '));

/* ----------------------------------------------------------- Phase 3 */
function taoLiveNode() {
  var o = { writes: 0, announcements: [], _text: '' };
  Object.defineProperty(o, 'textContent', {
    get: function () { return o._text; },
    set: function (v) {
      v = String(v || '');
      if (v !== o._text) {
        o._text = v; o.writes++;
        if (v) o.announcements.push(v);
      }
    }
  });
  return o;
}
var phaseEls = {
  'tinh-hinh-noi-dung': { innerHTML: '' },
  'thanh-canh': { innerHTML: '' },
  'tinh-hinh-khan': taoLiveNode(),
  'tinh-hinh-thuong': taoLiveNode(),
  'tt-res': { classList: { contains: function () { return false; } } },
  'nut-res': { setAttribute: function () {} }
};
var phaseTriggers = [{ setAttribute: function (k, v) { this[k] = v; } }, { setAttribute: function (k, v) { this[k] = v; } }];
var phaseDoc = {
  addEventListener: function () {},
  getElementById: function (id) { return phaseEls[id] || null; },
  querySelectorAll: function (q) {
    return q === '[data-act="toggle-res"][aria-controls="tt-res"]' ? phaseTriggers : [];
  }
};
var phaseCtx = napUi(phaseDoc), phaseU = phaseCtx.window.U, phaseG = phaseCtx.window.G;
var phaseSt = taoState();
phaseSt.planets[0].ten = '<Hành Tinh Mẹ>';
phaseSt.planets.push({
  c: { g: 2, h: 2, p: 2 }, ten: 'Tiền Đồn', thuDo: false, temp: -20, oDat: 120,
  res: { metal: 95, crystal: 20, deut: 30, food: 40 }, b: {}, ships: { fighterL: 3 }, def: {}, linh: {},
  danSu: { population: 420000, supportBp: 7200, taxBp: 400, foodDemandCycle: 100, foodShortfallCycle: 10 },
  qB: [
    { id: 'mine', n: 1, xong: 600 }, { id: 'solar', n: 1 }, { id: 'city', n: 1 },
    { id: 'lab', n: 1 }, { id: 'store', n: 1 }
  ],
  qS: [{ id: 'fighterL', n: 2, tLeft: 50, tEach: 50 }]
});
phaseSt.baoTri = { nextAt: 900, cycle: 3, missStreak: 2, arrearsGalana: 1250 };
phaseSt.toi = [
  { id: 'npc-late', ten: 'Kẻ địch', lm: '', pi: 0, tu: { g: 3, h: 3, p: 3 }, den_t: 450 },
  { id: 'npc-late', ten: 'Kẻ địch', lm: '', pi: 0, tu: { g: 3, h: 3, p: 3 }, den_t: 425 },
  { id: 'npc-early', ten: '<script>Hạm đội</script>', lm: 'LM', pi: 1, tu: { g: 4, h: 4, p: 4 }, den_t: 300 }
];
phaseSt.pvpToi = [
  { id: '7:8', nv: 'attack', ten: 'Người thật', lm: '', tu: '5:5:5', den: '2:2:2', den_t: 350 },
  { id: '7:8', nv: 'attack', ten: 'Người thật', lm: '', tu: '5:5:5', den: '2:2:2', den_t: 350 },
  { id: '9:1', nv: 'hold', ten: 'Đồng minh', lm: 'LM', tu: '6:6:6', den: '1:1:1', den_t: 700 }
];
phaseSt.ncQueue = { id: 'laser', lv: 2, status: 'retry', planetKey: '2:2:2', installmentsLeft: 2, installmentsTotal: 4, finishAt: 1200 };
phaseSt.msgs = [{ id: 1, t: 1, td: 'Tin mới', loai: 'tt', doc: false }];
phaseSt.fleets = [{ id: 1, mission: 'attack', pha: 'di', tu: { g: 1, h: 1, p: 1 }, den: { g: 2, h: 2, p: 2 }, den_t: 800, ships: {}, cargo: {} }];
phaseG.sanLuong = function (st, p) {
  var yeu = p && p.c && p.c.p === 2;
  return { r: { metal: 1, crystal: 2, deut: 3, food: 4, galana: 5, tech: 6 }, hs: yeu ? 0.7 : 1, dienCo: yeu ? 7 : 10, dienDung: 10 };
};
phaseU.st = function () { return phaseSt; };
phaseU.pi = 0; phaseU.man = 'tongquan';

var phaseHelpers = ['tinhViecCanXuLy', 'tomTatHanhTinh', 'sigTrangThaiUI', 'veCanh', 'denViec'];
ktra(phaseHelpers.every(function (ten) { return typeof phaseU[ten] === 'function'; }),
  'Phase 3 có đủ alert/planet/signature/routing helpers');
var phaseAlerts = typeof phaseU.tinhViecCanXuLy === 'function' ? phaseU.tinhViecCanXuLy(phaseSt) : [];
var ALERT_KEYS = ['action', 'consequence', 'dedupeKey', 'etaAt', 'id', 'pi', 'priority', 'scope', 'severity', 'source', 'title'];
ktra(phaseAlerts.length > 0 && phaseAlerts.every(function (a) {
  return bangNhau(Object.keys(a).sort(), ALERT_KEYS) && a.action && a.action.label && a.action.man;
}), 'alert view model giữ exact schema thuần text, không mang raw HTML renderer');
var p0 = phaseAlerts.filter(function (a) { return a.priority === 0; });
ktra(bangNhau(p0.map(function (a) { return a.etaAt; }), [300, 350, 425]),
  'P0 tấn công sắp xếp ETA tăng dần, dedupe projection trùng và giữ ETA sớm nhất');
ktra(duyNhat(phaseAlerts.map(function (a) { return a.dedupeKey; })).length === phaseAlerts.length,
  'alert model dedupe theo sự kiện');
var p1Sources = phaseAlerts.filter(function (a) { return a.priority === 1; }).map(function (a) { return a.source; });
ktra(p1Sources.indexOf('maintenance_debt') < p1Sources.indexOf('food_deficit') &&
  p1Sources.indexOf('food_deficit') < p1Sources.indexOf('power_deficit') &&
  p1Sources.indexOf('power_deficit') < p1Sources.indexOf('research_retry'),
  'P1 giữ thứ tự bảo trì → thực phẩm → điện → nghiên cứu retry');
var tomTat2 = typeof phaseU.tomTatHanhTinh === 'function' ? phaseU.tomTatHanhTinh(phaseSt, phaseSt.planets[1], 1, phaseAlerts) : {};
var tomTatTrong = typeof phaseU.tomTatHanhTinh === 'function' ? phaseU.tomTatHanhTinh(phaseSt, null, 9, phaseAlerts) : {};
ktra(tomTat2.power && tomTat2.power.state === 'deficit' && tomTat2.storage.state === 'warning' &&
  tomTat2.alert && tomTat2.alert.count > 0 && /Chưa có dữ liệu/.test(tomTatTrong.name || ''),
  'planet summary phân loại threshold và nói rõ khi thiếu dữ liệu');
var stateThieu = taoState();
stateThieu.planets = [{ ten: 'Mảnh dữ liệu' }, null];
stateThieu.toi = [{ id: 'sai-pi', ten: 'Không rõ', pi: 9, den_t: null }];
stateThieu.pvpToi = [{ id: 'sai-key', nv: 'attack', ten: 'Không rõ', tu: '9:9:9', den: '8:8:8', den_t: null }];
stateThieu.ncQueue = { id: 'laser', lv: 2, status: 'retry', planetKey: '8:8:8' };
var alertThieu = phaseU.tinhViecCanXuLy(stateThieu);
var tomTatThieu = phaseU.tomTatHanhTinh(stateThieu, stateThieu.planets[0], 0, alertThieu);
var scopeSai = alertThieu.filter(function (a) {
  return a.source === 'npc_inbound_attack' || a.source === 'pvp_inbound_attack' || a.source === 'research_retry';
});
ktra(['power', 'storage', 'population', 'support', 'build', 'ships', 'research'].every(function (k) {
  return tomTatThieu[k] && tomTatThieu[k].state === 'missing';
}) && scopeSai.every(function (a) {
  return a.pi === null && a.action.pi === null && /Chưa (?:có dữ liệu|xác định)|chưa xác định/i.test(a.scope) && a.etaAt === null;
}), 'partial planet và scope không resolve trả Chưa có dữ liệu, không bịa/fallback planet 0');
ktra(typeof phaseU.sigTrangThaiUI(stateThieu) === 'string',
  'UI signature chịu được planet null/thiếu field');
var partialEls = {
  'tinh-hinh-noi-dung': { innerHTML: '' }, 'thanh-canh': { innerHTML: '' },
  'tinh-hinh-khan': taoLiveNode(), 'tinh-hinh-thuong': taoLiveNode(),
  'tt-res': { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
  'nut-res': { setAttribute: function () {} }, 'chon-ht': { innerHTML: '' },
  'workspace': { innerHTML: '', setAttribute: function () {} }, 'menu': { innerHTML: '', setAttribute: function () {} },
  'dau-man': { innerHTML: '' }, 'chan-tt': { innerHTML: '' },
  'noidung': { innerHTML: '', querySelectorAll: function () { return []; }, contains: function () { return false; } }
};
var partialDoc = {
  activeElement: null,
  addEventListener: function () {},
  getElementById: function (id) { return partialEls[id] || null; },
  querySelectorAll: function () { return []; }
};
var partialCtx = napUi(partialDoc), partialU = partialCtx.window.U;
partialU.st = function () { return stateThieu; }; partialU.pi = 0; partialU.man = 'tongquan';
var partialOverview = '', partialShellOk = true;
try {
  partialU.ve();
  partialOverview = partialEls.noidung.innerHTML;
  partialU.thanhRes();
} catch (ePartial) { partialShellOk = false; }
ktra(partialShellOk && /Chưa có dữ liệu/.test(partialOverview) &&
  !/undefined:undefined:undefined/.test(partialOverview + partialEls['tinh-hinh-noi-dung'].innerHTML),
  'Overview + shell render xuyên suốt state partial/null và không bịa tọa độ');
var stateStruct = taoState();
delete stateStruct.planets[0].qB; delete stateStruct.planets[0].qS; delete stateStruct.planets[0].ships;
var sigStructThieu = phaseU.sigTrangThaiUI(stateStruct);
stateStruct.planets[0].qB = []; stateStruct.planets[0].qS = []; stateStruct.planets[0].ships = {};
var sigStructRanh = phaseU.sigTrangThaiUI(stateStruct);
ktra(sigStructThieu !== sigStructRanh,
  'signature phân biệt queue/unit thiếu dữ liệu với trạng thái rảnh hợp lệ');
var sigP3a = typeof phaseU.sigTrangThaiUI === 'function' ? phaseU.sigTrangThaiUI(phaseSt) : '';
phaseSt.now += 1; phaseSt.planets[1].res.metal = 96; phaseSt.planets[1].danSu.population += 0.4;
var sigP3b = typeof phaseU.sigTrangThaiUI === 'function' ? phaseU.sigTrangThaiUI(phaseSt) : '!';
phaseSt.planets[1].res.metal = 100;
var sigP3c = typeof phaseU.sigTrangThaiUI === 'function' ? phaseU.sigTrangThaiUI(phaseSt) : '';
ktra(sigP3a === sigP3b && sigP3b !== sigP3c,
  'UI signature bỏ qua raw time/resource trong cùng band nhưng đổi khi vượt threshold');
phaseSt.planets[1].res.metal = 95;
var sigKhoMetal = phaseU.sigTrangThaiUI(phaseSt);
phaseSt.planets[1].res.crystal = 96;
var sigKhoCrystal = phaseU.sigTrangThaiUI(phaseSt);
ktra(sigKhoMetal !== sigKhoCrystal,
  'UI signature đổi khi tài nguyên đầy nhất đổi trong cùng warning band');
phaseSt.planets[1].res.crystal = 20;
phaseSt.planets[1].res.metal = 110; phaseSt.planets[1].res.crystal = 99;
var sigKhoPhuA = phaseU.sigTrangThaiUI(phaseSt);
phaseSt.planets[1].res.crystal = 100;
var sigKhoPhuB = phaseU.sigTrangThaiUI(phaseSt);
ktra(sigKhoPhuA !== sigKhoPhuB,
  'signature đổi khi resource phụ vào/ra trạng thái Đầy dù resource cực đại không đổi');
phaseSt.planets[1].res.metal = 95; phaseSt.planets[1].res.crystal = 20;
var sigTauA = phaseU.sigTrangThaiUI(phaseSt);
phaseSt.planets[1].qS[0].n = 1; phaseSt.planets[1].ships.fighterL = 4;
var sigTauB = phaseU.sigTrangThaiUI(phaseSt);
phaseSt.planets[1].ships.scout = 1;
var sigTauC = phaseU.sigTrangThaiUI(phaseSt);
ktra(sigTauA === sigTauB && sigTauB !== sigTauC,
  'số tàu thay đổi cập nhật live; loại tàu mới 0→1 mới kích hoạt structural rerender');
delete phaseSt.planets[1].ships.scout;
phaseSt.planets[1].qS[0].n = 2; phaseSt.planets[1].ships.fighterL = 3;

if (typeof phaseU.veCanh === 'function') phaseU.veCanh();
var phaseStripHtml = phaseEls['tinh-hinh-noi-dung'].innerHTML;
ktra((phaseStripHtml.match(/class="tinh-hinh-khoi tinh-hinh-canh/g) || []).length === 1 &&
  /data-act="den-viec"/.test(phaseStripHtml) && /data-live="alert\./.test(phaseStripHtml) &&
  /id="nut-tinh-hinh-chinh"/.test(phaseStripHtml) && /id="nut-res-strip"/.test(phaseStripHtml) &&
  /aria-label="Mở [^"]+:/.test(phaseStripHtml) && !/<script>/.test(phaseStripHtml) && /&lt;script&gt;/.test(phaseStripHtml),
  'Situation Strip chỉ render top alert, CTA điều hướng, live countdown và escape hostile text');
var khanThongBao1 = phaseEls['tinh-hinh-khan'].announcements.length;
if (typeof phaseU.veCanh === 'function') phaseU.veCanh();
ktra(phaseEls['tinh-hinh-khan'].announcements.length === khanThongBao1 && !phaseEls['tinh-hinh-thuong'].textContent,
  'tấn công chỉ announce assertive một lần; P1 không chen vào khi P0 đang cao nhất');
phaseSt.toi.push({ id: 'npc-new', ten: 'Mũi tiến công mới', lm: '', pi: 0, tu: { g: 7, h: 7, p: 7 }, den_t: 999 });
if (typeof phaseU.veCanh === 'function') phaseU.veCanh();
ktra(phaseEls['tinh-hinh-khan'].announcements.length === khanThongBao1 + 1 && /Mũi tiến công mới/.test(phaseEls['tinh-hinh-khan'].textContent) &&
  /Phạm vi:/.test(phaseEls['tinh-hinh-khan'].textContent),
  'tấn công mới vẫn assertive dù chưa trở thành top alert');
phaseSt.toi = []; phaseSt.pvpToi = [];
if (typeof phaseU.veCanh === 'function') phaseU.veCanh();
ktra(/Nợ bảo trì/.test(phaseEls['tinh-hinh-thuong'].textContent) &&
  !/Nợ bảo trì/.test(phaseEls['tinh-hinh-khan'].textContent),
  'P1 top alert announce polite, assertive chỉ dùng cho inbound attack');
var thuongThongBao1 = phaseEls['tinh-hinh-thuong'].announcements.length;
if (typeof phaseU.veCanh === 'function') phaseU.veCanh();
ktra(phaseEls['tinh-hinh-thuong'].announcements.length === thuongThongBao1 && !phaseEls['tinh-hinh-thuong'].textContent,
  'P1 top alert không announce lại sau rerender');
phaseSt.toi = [{ id: 'npc-new', ten: 'Mũi tiến công mới', lm: '', pi: 0, tu: { g: 7, h: 7, p: 7 }, den_t: 999 }];
if (typeof phaseU.veCanh === 'function') phaseU.veCanh();
ktra(phaseEls['tinh-hinh-khan'].announcements.length === khanThongBao1 + 2,
  'alert resolve rồi tái xuất cùng event key được announce lại theo cạnh absent → present');
phaseSt.toi.push({ id: 'npc-still', ten: 'Mũi thứ hai', lm: '', pi: 0, tu: { g: 7, h: 7, p: 8 }, den_t: 1000 });
if (typeof phaseU.veCanh === 'function') phaseU.veCanh();
phaseSt.toi.shift();
if (typeof phaseU.veCanh === 'function') phaseU.veCanh();
ktra(!phaseEls['tinh-hinh-khan'].textContent,
  'assertive node không giữ nội dung attack cũ khi một attack hết nhưng attack khác còn active');
ktra(phaseTriggers.every(function (x) { return x['aria-expanded'] === 'false'; }),
  'mọi resource trigger cùng phản chiếu aria-expanded');

function taoNodeLive(attrs, text) {
  return {
    attrs: attrs || {}, textContent: text || '', innerHTML: text || '',
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    setAttribute: function (k, v) { this.attrs[k] = String(v); }
  };
}
var liveDem = taoNodeLive({ 'data-live': 'alert.npc-attack:eta-live.eta', 'data-t': '300' }, '200');
var liveRes = taoNodeLive({ 'data-live': 'res.metal' }, '0');
var liveShips = taoNodeLive({ 'data-live': 'planet.0.ships' }, '3 đậu · 2 đang đóng');
var liveShipCount = taoNodeLive({ 'data-live': 'operation.ship.0.0.count' }, '2');
var liveShipEta = taoNodeLive({ 'data-live': 'operation.ship.0.0', 'data-t': '150' }, '50');
var liveUnit = taoNodeLive({ 'data-live': 'unit.0.ship.fighterL.summary' }, 'có 3 (+2)');
var liveAvailable = taoNodeLive({ 'data-live': 'planet.0.ship.fighterL.available', max: '3' }, '');
var liveCargo = taoNodeLive({ 'data-live': 'fleet.alpha.cargo' }, '');
var liveRefuel = taoNodeLive({ 'data-live': 'fleet.alpha.refuel', 'data-t': '400' }, '300');
var livePoints = taoNodeLive({ 'data-live': 'empire.points' }, '0');
var liveGround = taoNodeLive({ 'data-live': 'planet.0.ground.html' }, '');
var liveNodes = [liveDem, liveRes, liveShips, liveShipCount, liveShipEta, liveUnit, liveAvailable, liveCargo, liveRefuel, livePoints, liveGround];
var liveFocus = {};
var liveDoc = {
  activeElement: liveFocus,
  addEventListener: function () {},
  getElementById: function () { return null; },
  querySelectorAll: function (q) { return q === '[data-live]' ? liveNodes : (q === '.dem' ? [liveDem, liveShipEta, liveRefuel] : []); }
};
var liveCtx = napUi(liveDoc), liveU = liveCtx.window.U, liveSt = taoState(), liveRenders = 0;
liveSt.toi = [{ id: 'eta-live', ten: 'Địch', pi: 0, den_t: 300 }];
liveSt.planets[0].qS = [{ id: 'fighterL', n: 2, tLeft: 50 }];
liveSt.planets[0].ships = { fighterL: 3 };
liveSt.planets[0].linh = { robot: 2 };
liveSt.fleets = [{ id: 'alpha', mission: 'hold', pha: 'giu', giuDen_t: 500, tiepNL_t: 400, cargo: { metal: 2 }, ships: {} }];
liveSt.pvpGiu = [{ id: 'ally', giuDen_t: 700, tiepNL_t: 650 }];
liveU.st = function () { return liveSt; };
liveU.sig = function () { return 'stable'; };
liveU.sigCu = 'stable';
liveU.ve = function () { liveRenders++; };
liveCtx.window.G.diem = function () { return { tong: 77, ct: 0, nc: 0, ham: 0, thu: 0 }; };
var tinhAlertGoc = liveU.tinhViecCanXuLy, soLanTinhAlert = 0;
liveU.tinhViecCanXuLy = function (st) { soLanTinhAlert++; return tinhAlertGoc(st); };
liveSt.now = 101; liveSt.toi[0].den_t = 500;
liveSt.planets[0].qS[0].n = 1; liveSt.planets[0].qS[0].tLeft = 40; liveSt.planets[0].ships.fighterL = 4;
liveSt.fleets[0].tiepNL_t = 450; liveSt.fleets[0].cargo.metal = 7;
liveU.live();
ktra(liveDem.attrs['data-t'] === '500' && liveDem.textContent === '399' && liveShipEta.attrs['data-t'] === '141' &&
  liveShips.textContent === '4 đậu · 1 đang đóng' && liveShipCount.textContent === '1' && liveUnit.textContent === 'có 4' &&
  liveAvailable.attrs.max === '4' && /7/.test(liveCargo.innerHTML) && liveRefuel.attrs['data-t'] === '450' &&
  liveRes.textContent === '10' && livePoints.textContent === '77' && /×2/.test(liveGround.innerHTML) &&
  liveRenders === 0 && liveDoc.activeElement === liveFocus,
  'live tick cập nhật ETA/count/tàu/cargo/resource mà không full rerender hoặc đổi focus');
ktra(soLanTinhAlert === 1,
  'mỗi live tick chỉ lập alert/summary cache một lần, không tăng theo số data-live node');
var giuLive = liveU.giaTriLive(liveSt, 'garrison.ally.refuel', {});
ktra(giuLive && giuLive.kind === 'time' && giuLive.value === 650,
  'live resolver theo dõi mốc tiếp nhiên liệu của hạm đội đồng minh');

phaseU.pi = 1;
var currentAlerts = phaseU.tinhViecCanXuLy(phaseSt), currentTop = currentAlerts[0] || null;
var phaseOverview = typeof phaseU.m_tongquan === 'function' ? phaseU.m_tongquan() : '';
function tagCanBang(html, tag) {
  var mo = (html.match(new RegExp('<' + tag + '(?:\\s|>)', 'g')) || []).length;
  var dong = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  return mo === dong;
}
ktra(['div', 'section', 'article', 'table', 'thead', 'tbody', 'tr', 'details', 'summary', 'dl', 'dt', 'dd'].every(function (tag) {
  return tagCanBang(phaseOverview, tag);
}), 'Tổng Quan render markup container/table cân bằng');
ktra(['tq-can-xu-ly', 'tq-snapshot', 'tq-ma-tran', 'tq-van-hanh', 'tq-theo-doi'].every(function (id) {
  return phaseOverview.indexOf('id="' + id + '"') >= 0;
}), 'Tổng Quan có đủ Attention/Snapshot/Matrix/Operations/Fleet-Intel modules');
ktra((phaseOverview.match(/class="ma-tran-hanh-tinh"/g) || []).length === phaseSt.planets.length &&
  !/type="checkbox"|select-all|chon-tat-ca/.test(phaseOverview),
  'Planet Matrix đủ hành tinh, chỉ đọc và không có bulk control');
ktra((phaseOverview.match(/class="tq-ma-tran-item"/g) || []).length === phaseSt.planets.length &&
  /<caption class="sr-only">/.test(phaseOverview) && /<details id="tq-planet-details-/.test(phaseOverview) &&
  /<summary id="tq-planet-summary-/.test(phaseOverview),
  'Planet Matrix có accessible caption và mobile disclosure theo từng hành tinh');
ktra(!/<section class="tq-viec-nhom"><h3>/.test(phaseOverview) && /class="tq-viec-nhom-tieu"/.test(phaseOverview),
  'Attention Queue giữ hierarchy h1 → h2 → h3, group label không giả heading');
ktra(/Mở Công Trình|Mở Xưởng|Mở Nghiên Cứu/.test(phaseOverview) && /aria-label="Huỷ /.test(phaseOverview),
  'Operations dùng CTA và accessible name cụ thể theo tác vụ/scope');
ktra(/id="thue-pct"/.test(phaseOverview) && /data-act="doi-ten"/.test(phaseOverview) &&
  /data-act="bo-hoang"/.test(phaseOverview) && /data-act="huyxay"/.test(phaseOverview) &&
  /data-act="huydong"/.test(phaseOverview),
  'refactor Tổng Quan không làm mất thuế/đổi tên/bỏ hoang/huỷ hàng đợi');
ktra(!currentTop || phaseOverview.indexOf('data-alert-key="' + currentTop.dedupeKey + '"') < 0,
  'Attention Queue không lặp nguyên top alert đã nằm trên strip');
ktra([SRC.index, SRC.webIndex].every(function (html) {
  return /id="thanh-canh"[^>]*role="region"[^>]*aria-label="Tình hình chiến dịch"[^>]*tabindex="-1"/.test(html) &&
    /id="tinh-hinh-noi-dung"/.test(html) && /id="tinh-hinh-khan"[^>]*role="alert"[^>]*aria-live="assertive"/.test(html) &&
    /id="tinh-hinh-thuong"[^>]*role="status"[^>]*aria-live="polite"/.test(html);
}), 'hai entry có persistent visual strip + assertive/polite announcer tách countdown');

/* ------------------------------------------------------------ data-act */
var handler = duyNhat(
  layHandler(SRC.app, 'var ACT = {')
    .concat(layHandler(SRC.solo, 'APP.themACT({'))
    .concat(layHandler(SRC.mp, 'APP.themACT({'))
);
var actionMarkup = layAttr([SRC.index, SRC.webIndex, SRC.ui, SRC.app, SRC.solo, SRC.mp], 'data-act');
var thieuHandler = actionMarkup.filter(function (x) { return handler.indexOf(x) < 0; });
ktra(!thieuHandler.length, 'mọi data-act tĩnh có handler', thieuHandler.join(', '));
ktra([SRC.index, SRC.webIndex].every(function (html) {
  return /<nav id="workspace"[^>]*aria-label=/.test(html) &&
    /<nav id="menu"[^>]*aria-label=/.test(html) &&
    /<header id="dau-man"/.test(html) &&
    /<main id="noidung"[^>]*tabindex="-1"/.test(html) &&
    /id="nut-menu"[^>]*data-act="toggle-menu"[^>]*aria-expanded="false"[^>]*aria-controls="menu"/.test(html);
}), 'hai entry dùng chung semantic shell và menu disclosure contract');
ktra([SRC.index, SRC.webIndex].every(function (html) {
  return /<button type="button" class="tt-logo"[^>]*data-act="man"[^>]*data-man="tongquan"/.test(html);
}), 'wordmark điều hướng là button semantic');
ktra([SRC.index, SRC.webIndex].every(function (html) {
  return /id="hop-thoai"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html) &&
    /id="toast"[^>]*role="status"[^>]*aria-live="polite"/.test(html);
}), 'overlay và toast có landmark live-region semantic');
ktra([SRC.index, SRC.webIndex].every(function (html) {
  return /id="nut-res"[^>]*data-act="toggle-res"[^>]*aria-expanded="false"[^>]*aria-controls="tt-res"/.test(html) &&
    /id="chon-ht"[^>]*aria-label="Chọn hành tinh"/.test(html);
}), 'mobile resource disclosure và planet selector có accessible contract');
ktra(/<label for="kd-ten">/.test(SRC.index) && /<label for="kd-seed">/.test(SRC.index) &&
  ['dn-ten', 'dn-mk', 'dk-ten', 'dk-hienthi', 'dk-mk', 'cauhinh-tocdo'].every(function (id) {
    return SRC.webIndex.indexOf('<label for="' + id + '">') >= 0;
  }) && /label class="sr-only" for="chat-noi-chung"/.test(SRC.mp) &&
  /label class="sr-only" for="chat-noi-lienminh"/.test(SRC.mp),
  'auth và chat input có label liên kết, không dựa vào placeholder');
var CORE_ARIA_IDS = ['thue-pct', 'tl-g', 'tl-h', 'tl-p', 'tl-n', 'f-g', 'f-h', 'f-p', 'f-mission',
  'f-pct', 'f-giu', 'g-g', 'g-h', 'nh-gui', 'nh-rut', 'st-von', 'ban-gia', 'mp-bc', 'dh-g', 'dh-h', 'dh-p'];
var formCore = SRC.ui + '\n' + SRC.app;
var coreThieuTen = CORE_ARIA_IDS.filter(function (id) {
  return !(new RegExp('id="' + id + '"[^>]*aria-label=')).test(formCore);
});
ktra(!coreThieuTen.length && /id="mua-'[^\n]*aria-label=/.test(SRC.ui) &&
  /id="ban-'[^\n]*aria-label=/.test(SRC.ui) && /id="ft-'[^\n]*aria-label=/.test(SRC.ui),
  'form tác chiến/tài chính cốt lõi có accessible name', coreThieuTen.join(', '));

var SHARED_ACTIONS = ["ban","ban-ten-lua","bo-hoang","bo-hoang-ok","dang-ban","dau-tu-st","den-viec","doc-het","doc-tin","doi-ten","doi-ten-ok","doihuong","doihuong-ok","doithue","dong","dong-ht","gal","gal-di","gal-nha","gal-tu-form","goive","gui","gui-nh","huy-don","huydong","huync","huyxay","lm-ra","lm-vao","luu","man","max-hang","max-linh","max-tau","menu-nhanh-di","mo-menu-nhanh","mp-chay","mp-nap-bc","mp-nap-ham","mp-xoa","mua","mua-diem","mua-don","nc","nv","rut-nh","rut-nh-all","tab-tc","tang-toc","toggle-menu","toggle-res","tra-luong","workspace","xay","xem-tt","xh-loai","xoa-tin"];
var SOLO_ACTIONS = ["nhap","nhap-file","nhap-ok","xoa-game","xoa-that","xuat","xuat-copy","xuat-file"];
var MP_ACTIONS = ["bau-phieu","chat-gui","chuyen-galana","chuyen-galana-ok","dang-ban","dangxuat","doi-mk","doi-mk-ok","gui-thu","gui-thu-ok","huy-don","lm-chuyen","lm-chuyen-ok","lm-duoi","lm-duoi-ok","lm-duyet","lm-ra","lm-tao","lm-tu-choi","lm-vao","mua-don","tab-tc","tuyen-chien","tuyen-chien-ok","xoa-tk","xoa-tk-ok"];
var sharedActual = duyNhat(layHandler(SRC.app, 'var ACT = {'));
var soloActual = duyNhat(layHandler(SRC.solo, 'APP.themACT({'));
var mpActual = duyNhat(layHandler(SRC.mp, 'APP.themACT({'));
ktra(bangNhau(sharedActual, SHARED_ACTIONS), 'exact shared action ownership');
ktra(bangNhau(soloActual, SOLO_ACTIONS), 'exact solo action registrations');
ktra(bangNhau(mpActual, MP_ACTIONS), 'exact multiplayer action registrations');
ktra(handler.indexOf('mo-cauhinh') < 0 && !/data-act="mo-cauhinh"/.test(SRC.mp),
  'UI không expose cấu hình server khi endpoint admin chưa có authorization contract');
ktra(!/api\('\/api\/admin\/tocdo'/.test(SRC.mp),
  'client không gọi endpoint admin chưa có authorization contract');
ktra(!/getElementById\(\s*['"]mo-cauhinh['"]\s*\)\.onclick\s*=/.test(SRC.mp),
  'không bind trực tiếp nút cấu hình trước khi async DOM tồn tại');
ktra(!/getElementById\(\s*['"]nut-menu['"]\s*\)\.onclick\s*=/.test(SRC.solo + '\n' + SRC.mp),
  'toggle menu dùng action delegation chung, không bind trùng ở driver');
ktra(/APP\.preloadMan\s*=\s*function/.test(SRC.mp) && !/\bmanCu\b/.test(SRC.mp) &&
  !/\n\s*man\s*:\s*function\s*\(/.test(vungObject(SRC.mp, 'APP.themACT({')),
  'multiplayer dùng preload dispatcher, không override navigation action');
ktra(/var loaiCho = U\.tabTC;\s*if \(loaiCho !== 'sieuthi' && loaiCho !== 'tudo'\) return;/.test(SRC.mp) &&
  !/U\.tabTC \|\| 'sieuthi'/.test(SRC.mp),
  'preload Tài chính không gửi tab ngân hàng vào API chợ');
ktra(/MP\.cho = null; MP\._choDangTai = null;[\s\S]{0,180}?MP\.tk = null;/.test(SRC.mp) &&
  /U\.tabTC = 'nganhang'; U\.xhLoai = 'tong';/.test(SRC.mp) && /U\.datLaiCanhLive/.test(SRC.mp),
  'logout xoá cache/account/filter và reset live-announcement trước phiên kế tiếp');
ktra(/var phienHe = \(MP\._phienHe \|\| 0\) \+ 1;/.test(SRC.mp) &&
  /if \(MP\._phienHe !== phienHe\) return r;/.test(SRC.mp) &&
  /if \(MP\._phienHe === phienHe\) U\.toast\(e\.message, 'loi'\);/.test(SRC.mp) &&
  /U\.man === 'thienha' && U\.gal && U\.gal\.g === g && U\.gal\.h === h/.test(SRC.mp) &&
  /APP\.taiHe\(g, h\);\s*return \[\];/.test(SRC.mp),
  'preload Thiên Hà dùng generation guard, bỏ response/error cũ và không giữ dữ liệu hệ trước');
ktra(/var phienXh = \(MP\._phienXh \|\| 0\) \+ 1;/.test(SRC.mp) &&
  /if \(MP\._phienXh !== phienXh\) return r;/.test(SRC.mp) &&
  /MP\.xh = r\.ds; MP\.xhLoai = loai;/.test(SRC.mp) &&
  /xepHang: function \(loai\) \{ return MP\.xhLoai === \(loai \|\| 'tong'\)/.test(SRC.mp),
  'xếp hạng dùng generation/category guard, không render response cũ dưới tab mới');
ktra(/var phienCho = \(MP\._phienCho \|\| 0\) \+ 1;/.test(SRC.mp) &&
  /if \(MP\._phienCho !== phienCho\) return r;/.test(SRC.mp) &&
  /choDonNgoai: function \(loai\) \{\s*if \(!MP\.cho \|\| MP\.cho\.loai !== loai\) return \[\];/.test(SRC.mp),
  'chợ dùng generation/category guard, không render dataset cũ khi đổi tab nhanh');
ktra(/(?:ctrlKey|metaKey)[\s\S]{0,180}?['"]k['"]/.test(SRC.app) &&
  /U\.moMenuNhanh\(\)/.test(SRC.app),
  'Ctrl/Cmd+K mở command palette dùng chung');
ktra(
  /api\('\/api\/cho', dl\)\.then\(function \(r\) \{\s*apDung\(r\);/.test(SRC.mp) &&
  /api\('\/api\/cho\/mua',[\s\S]{0,160}?\.then\(function \(r\) \{\s*apDung\(r\);/.test(SRC.mp) &&
  /api\('\/api\/cho\/huy',[\s\S]{0,160}?\.then\(function \(r\) \{\s*apDung\(r\);/.test(SRC.mp),
  'thao tác chợ multiplayer áp dụng state authoritative ngay khi server trả về');
ktra(/'tab-tc'\s*:\s*function[\s\S]{0,320}?taiCho\(loai\)/.test(SRC.mp),
  'chuyển tab chợ multiplayer nạp đúng dataset từ server');

/* Action navigation phải giữ hook, đóng menu và vẽ đúng một lần. */
var thuTuNav = [], daVe = 0, daCuon = 0, daFocus = 0;
ctx.window.scrollTo = function () { daCuon++; thuTuNav.push('scroll'); };
U.MAN = soloMenu; U.man = 'tongquan'; U.workspace = 'chi_huy'; U.pi = 0;
ctx.window.ST.planets.push(JSON.parse(JSON.stringify(ctx.window.ST.planets[0])));
U.form = { den: { g: 9, h: 9, p: 9 }, ships: { scout: 7 }, cargo: { metal: 99 } };
U.ve = function () { daVe++; thuTuNav.push('ve:' + U.pi + ':' + U.workspace + ':' + U.man); };
U.focusNoiDung = function () { daFocus++; thuTuNav.push('focus'); };
if (typeof U.denMan === 'function') U.denMan('hamdoi', { pi: 1, chuDong: true });
ktra(U.man === 'hamdoi' && U.workspace === 'tac_chien' && U.pi === 1 && U.form === null && daVe === 1 && daFocus === 1 && daCuon === 1 &&
  thuTuNav[0] === 've:1:tac_chien:hamdoi',
  'denMan đổi scope trước render và xoá form Hạm Đội thuộc hành tinh cũ');
var truocSai = [U.man, U.workspace, U.pi, daVe, daFocus, daCuon].join('|');
if (typeof U.denMan === 'function') U.denMan('__khong_co__', { pi: 0, chuDong: true });
ktra([U.man, U.workspace, U.pi, daVe, daFocus, daCuon].join('|') === truocSai,
  'denMan bỏ qua destination không có trong mode hiện tại');
if (typeof U.denMan === 'function') U.denMan('tongquan');
ktra(daVe === 2 && daFocus === 1 && daCuon === 1,
  'điều hướng chương trình render nhưng không cướp focus/scroll');
var preloadNhan = [];
ctx.window.APP.preloadMan = function (meta) { preloadNhan.push(meta.id); };
if (typeof U.denMan === 'function') U.denMan('taichinh');
ktra(bangNhau(preloadNhan, ['taichinh']) && daFocus === 1 && daCuon === 1,
  'denMan gọi preload theo metadata mà không biến navigation nền thành chủ động');

var denManNhan = [];
U.denMan = function (id, options) { denManNhan.push({ id: id, options: options }); };
vm.runInContext(SRC.app, ctx, { filename: 'js/app.js' });
ctx.window.APP.ACT.man({ getAttribute: function (ten) { return ten === 'data-man' ? 'thienha' : ''; } });
ktra(denManNhan.length === 1 && denManNhan[0].id === 'thienha' && denManNhan[0].options.chuDong === true,
  'delegated navigation chuyển đúng một lần qua U.denMan');
ctx.window.APP.ACT['den-viec']({ getAttribute: function (ten) {
  if (ten === 'data-man') return 'hamdoi';
  if (ten === 'data-pi') return '1';
  return '';
} });
ktra(denManNhan.length === 2 && denManNhan[1].id === 'hamdoi' &&
  denManNhan[1].options.chuDong === true && denManNhan[1].options.pi === 1,
  'den-viec đổi đúng hành tinh trước khi mở destination');
var cancelNhan = [];
ctx.window.APP.lam = function (ten, dl) { cancelNhan.push({ ten: ten, dl: dl }); };
ctx.window.ST.planets.push(taoState().planets[0]);
ctx.window.ST.planets[1].c = { g: 2, h: 2, p: 2 };
ctx.window.ST.planets[1].qB = [{ id: 'mine', n: 1, tg: 10, cost: { metal: 2 } }];
ctx.window.ST.planets[1].qS = [{ id: 'fighterL', n: 2, tEach: 10, cost1: { metal: 2 } }];
ctx.window.ST.ncQueue = { id: 'laser', lv: 2, planetKey: '1:1:1', startedAt: 100 };
var appBuildKey = ctx.window.U.khoaHangDoi('build', ctx.window.ST.planets[1].qB);
var appShipKey = ctx.window.U.khoaHangDoi('ship', ctx.window.ST.planets[1].qS);
var appResearchKey = ctx.window.U.khoaNghienCuu(ctx.window.ST.ncQueue);
function queueEl(i, key) { return { getAttribute: function (ten) {
  return ten === 'data-pi' ? '1' : (ten === 'data-i' ? String(i) : (ten === 'data-queue-key' ? key : ''));
} }; }
ctx.window.APP.ACT.huyxay(queueEl(0, appBuildKey));
ctx.window.APP.ACT.huydong(queueEl(0, appShipKey));
ctx.window.APP.ACT.huync(queueEl(0, appResearchKey));
ktra(cancelNhan.length === 3 && cancelNhan[0].ten === 'huyxay' && cancelNhan[0].dl.pi === 1 && cancelNhan[0].dl.i === 0 &&
  !Object.prototype.hasOwnProperty.call(cancelNhan[0].dl, 'queueKey') && cancelNhan[1].ten === 'huydong' && cancelNhan[1].dl.pi === 1 &&
  cancelNhan[1].dl.i === 0 && !Object.prototype.hasOwnProperty.call(cancelNhan[1].dl, 'queueKey') &&
  cancelNhan[2].ten === 'huync' && !Object.prototype.hasOwnProperty.call(cancelNhan[2].dl, 'queueKey'),
  'Operations Queue kiểm snapshot ở client nhưng giữ nguyên action payload');
ctx.window.APP.ACT['bo-hoang-ok']({ getAttribute: function (ten) {
  return ten === 'data-pi' ? '0' : (ten === 'data-planet-key' ? '2:2:2' : '');
} });
ktra(cancelNhan.length === 4 && cancelNhan[3].ten === 'boHoang' && cancelNhan[3].dl.pi === 1 &&
  !Object.prototype.hasOwnProperty.call(cancelNhan[3].dl, 'planetKey'),
  'xác nhận bỏ hoang re-resolve planetKey ở client nhưng giữ nguyên action payload');

/* MP boot phải đi hết phần synchronous ngay cả khi /api/thongtin còn pending. */
function napMpRuntime() {
  var ids = Array.from(SRC.webIndex.matchAll(/\bid=(['"])([^'"]+)\1/g)).map(function (m) { return m[2]; });
  var elements = {};
  function el(id) {
    return {
      id: id, value: '', textContent: '', innerHTML: '', disabled: false,
      style: {}, className: '',
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
      addEventListener: function () {}, focus: function () {}, remove: function () {}
    };
  }
  ids.forEach(function (id) { elements[id] = el(id); });
  var document = {
    hidden: false,
    body: el('body'),
    addEventListener: function () {},
    removeEventListener: function () {},
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function (tag) { return el(tag); }
  };
  var localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
  var window = { G: taoG(), APP: {}, ST: null, document: document, localStorage: localStorage, scrollTo: function () {} };
  var context = {
    window: window, document: document, localStorage: localStorage,
    console: console,
    fetch: function () { return new Promise(function () {}); },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {}
  };
  window.window = window;
  vm.createContext(context);
  vm.runInContext(SRC.ui, context, { filename: 'js/ui.js' });
  vm.runInContext(SRC.app, context, { filename: 'js/app.js' });
  vm.runInContext(SRC.mp, context, { filename: 'web/js/mp.js' });
  return context;
}
var mpBoot = null, mpBootError = null;
try { mpBoot = napMpRuntime(); } catch (e) { mpBootError = e; }
ktra(!mpBootError, 'multiplayer boot synchronous không pageerror', mpBootError && mpBootError.message);
if (mpBoot) ktra(bangNhau(mpBoot.window.U.MAN.map(function (x) { return x.id; }), MP_EXPECTED),
  'multiplayer runtime registry giữ exact destination');
if (mpBoot) {
  var giuProjection = mpBoot.window.MP._giuProjection;
  var stCu = { pvpToi: [{ id: 11 }], pvpGiu: [{ id: 22 }] };
  var stMoi = { planets: [] };
  if (typeof giuProjection === 'function') giuProjection(stMoi, stCu);
  ktra(typeof giuProjection === 'function' && stMoi.pvpToi === stCu.pvpToi && stMoi.pvpGiu === stCu.pvpGiu,
    'state response thiếu projection vẫn giữ cảnh báo PvP hiện có');
}

/* --------------------------------------------------------------- CSS */
ktra(!!SRC.tokens, 'tokens.css tồn tại như source semantic độc lập');
var TOKEN_REQUIRED = [
  'color-paper', 'color-paper-2', 'color-paper-3', 'color-surface-active',
  'color-ink', 'color-ink-2', 'color-muted', 'color-rule', 'color-rule-strong',
  'color-control-rule', 'color-accent', 'color-accent-ink', 'color-focus-ring',
  'color-focus-gap', 'color-info', 'color-success', 'color-warning', 'color-danger',
  'color-info-surface', 'color-success-surface', 'color-warning-surface', 'color-danger-surface',
  'font-display', 'font-body', 'text-xs', 'text-sm', 'text-base', 'text-md',
  'text-lg', 'text-xl', 'text-display', 'space-3xs', 'space-2xs', 'space-xs',
  'space-sm', 'space-md', 'space-lg', 'space-xl', 'space-2xl', 'space-3xl',
  'radius-control', 'radius-panel', 'radius-pill', 'rule-thin', 'size-control',
  'size-header', 'size-situation', 'size-workspace-rail', 'size-secondary-nav',
  'size-context-panel', 'size-content-max', 'z-base', 'z-raised', 'z-dropdown',
  'z-sticky', 'z-modal', 'z-toast', 'z-tooltip', 'ease-out', 'ease-in',
  'ease-in-out', 'dur-micro', 'dur-short', 'dur-long'
];
var tokenDefined = duyNhat(Array.from(SRC.tokens.matchAll(/--([A-Za-z][\w-]*)\s*:/g)).map(function (m) { return m[1]; }));
var tokenMissing = TOKEN_REQUIRED.filter(function (x) { return tokenDefined.indexOf(x) < 0; });
ktra(!tokenMissing.length, 'tokens.css đủ Theme/Typography/Spacing/Motion', tokenMissing.join(', '));
function layGiaTriVar(text, ten) {
  var m = new RegExp('--' + ten + '\\s*:\\s*([^;]+);').exec(text);
  return m ? m[1].trim().replace(/\s+/g, ' ') : '';
}
var tokenDrift = TOKEN_REQUIRED.filter(function (x) {
  return layGiaTriVar(SRC.tokens, x) !== layGiaTriVar(SRC.design, x);
});
ktra(!tokenDrift.length, 'giá trị token khớp exact design.md', tokenDrift.join(', '));
var LEGACY_ALIAS = {
  den: 'color-paper', den2: 'color-paper-2', panel: 'color-paper-2', panel2: 'color-paper-3',
  vien: 'color-rule-strong', vien2: 'color-control-rule', chu: 'color-ink', mo: 'color-muted',
  sang: 'color-ink', cam: 'color-accent', cam2: 'color-accent', lam: 'color-info',
  luc: 'color-success', do: 'color-danger', tim: 'color-ink-2', vang: 'color-warning',
  'font-chu': 'font-body', 'font-so': 'font-display'
};
var aliasSai = Object.keys(LEGACY_ALIAS).filter(function (x) {
  return layGiaTriVar(SRC.tokens, x) !== 'var(--' + LEGACY_ALIAS[x] + ')';
});
ktra(!aliasSai.length, 'legacy alias trỏ exact semantic token', aliasSai.join(', '));
function dungThuTuStyle(html, tokenHref, styleHref) {
  var tokenAt = html.indexOf('<link rel="stylesheet" href="' + tokenHref + '">');
  var styleAt = html.indexOf('<link rel="stylesheet" href="' + styleHref + '">');
  return tokenAt >= 0 && styleAt > tokenAt;
}
ktra(dungThuTuStyle(SRC.index, 'css/tokens.css', 'css/style.css') &&
  dungThuTuStyle(SRC.webIndex, '/css/tokens.css', '/css/style.css'),
  'solo và multiplayer nạp tokens trước style');
ktra(/readFileSync\([^\n]*['"]tokens\.css['"]/.test(SRC.build) &&
  SRC.build.indexOf("tokens.css") < SRC.build.indexOf("css', 'style.css"),
  'build inline tokens trước legacy style');
ktra(/var\s+CHO_PHEP\s*=\s*\[[^\]]*['"]css['"]/.test(SRC.serverIndex) &&
  /href="\/css\/tokens\.css"/.test(SRC.webIndex),
  'multiplayer dùng token trong static allowlist hiện hữu');

var styleFiles = [SRC.tokens, SRC.css].filter(Boolean);
var brace = 0, braceAm = false;
for (var si = 0; si < styleFiles.length; si++) {
  var styleSach = styleFiles[si].replace(/\/\*[\s\S]*?\*\//g, '');
  var depth = 0;
  for (var bi = 0; bi < styleSach.length; bi++) {
    if (styleSach[bi] === '{') depth++;
    if (styleSach[bi] === '}' && --depth < 0) braceAm = true;
  }
  brace += depth;
}
ktra(brace === 0 && !braceAm, 'CSS cân bằng ngoặc', 'balance=' + brace);

var styleTong = styleFiles.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
var refTong = [SRC.tokens, SRC.css, SRC.index, SRC.webIndex, SRC.ui, SRC.app, SRC.solo, SRC.mp].join('\n');
var cssVars = duyNhat(Array.from(styleTong.matchAll(/--([A-Za-z][\w-]*)\s*:/g)).map(function (m) { return m[1]; }));
var cssRefs = duyNhat(Array.from(refTong.matchAll(/var\(\s*--([A-Za-z][\w-]*)/g)).map(function (m) { return m[1]; }));
var varsThieu = cssRefs.filter(function (x) { return cssVars.indexOf(x) < 0; });
ktra(!varsThieu.length, 'mọi CSS custom property đã được định nghĩa', varsThieu.join(', '));

function noiDungRule(selector) {
  var escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var match = new RegExp('(?:^|\\n)\\s*' + escaped + '\\s*\\{').exec(SRC.css);
  if (!match) return '';
  var open = SRC.css.indexOf('{', match.index), close = timNgoacDong(SRC.css, open);
  return close < 0 ? '' : SRC.css.slice(open + 1, close);
}
ktra(/font\s*:\s*var\(--text-base\)/.test(noiDungRule('body')),
  'body dùng type floor 16px từ token');
ktra(/min-height\s*:\s*var\(--size-control\)/.test(noiDungRule('.nut.nho')),
  'button nhỏ mặc định vẫn giữ hit target 44px');
ktra(/--color-muted/.test(noiDungRule('.nut')) && /--color-paper-3/.test(noiDungRule('.nut')),
  'button trên raised surface dùng boundary đủ tương phản thay vì control-rule L49');
ktra(!/font-size\s*:\s*(?:9(?:\.\d+)?|10(?:\.\d+)?|11(?:\.\d+)?)px/.test(SRC.css),
  'stylesheet không hạ utility label dưới 12px');
var renderSources = [SRC.index, SRC.webIndex, SRC.ui, SRC.mp].join('\n');
ktra(!/font-size\s*:\s*(?:9(?:\.\d+)?|10(?:\.\d+)?|11(?:\.\d+)?)px/.test(renderSources),
  'renderer và HTML không inline chữ dưới 12px');
ktra(!/style="[^"]*(?:margin|padding|gap)(?:-[a-z]+)?\s*:/.test(
  [SRC.index, SRC.webIndex, SRC.ui, SRC.app, SRC.solo, SRC.mp].join('\n')),
  'renderer và HTML không hard-code spacing inline');
ktra(/U\.chamRes\s*=\s*function/.test(SRC.ui) &&
  !/style="color:'\s*\+\s*(?:r|rr)\.mau/.test(SRC.ui) &&
  !/style="color:'\s*\+\s*G\.byId\(G\.RES/.test(SRC.ui),
  'màu tài nguyên chỉ đi qua dot/swatch thay vì tô chữ UI');
ktra(/overflow-y\s*:\s*auto/.test(noiDungRule('.khoidong')) &&
  /100dvh/.test(noiDungRule('.khoidong')),
  'auth dùng dynamic viewport và cuộn dọc khi form dài');
ktra(!/linear-gradient|text-shadow|animation\s*:[^;}]*infinite/.test(SRC.css) &&
  (SRC.css.match(/radial-gradient/g) || []).length === 2,
  'foundation không gradient action, text glow hay pulse; auth chỉ có hai vùng sáng tĩnh');
var blurSai = SRC.css.split('\n').filter(function (dong) {
  return /backdrop-filter/.test(dong) && dong.indexOf('.hop-thoai') < 0;
});
ktra(!blurSai.length, 'blur chỉ còn ở overlay modal');
ktra(noiDungRule('.nut.lon:hover').indexOf('--color-warning') < 0 &&
  noiDungRule('a').indexOf('--color-info') < 0,
  'accent tương tác không mượn màu trạng thái warning/info');
ktra(/--color-muted\) 75%/.test(noiDungRule('th,td')) && /--color-(?:muted|accent)/.test(noiDungRule('#toast .t')),
  'boundary trên raised/active surface dùng màu đủ tương phản');
ktra(!/float\s*:\s*right/.test(noiDungRule('.the .cap')) &&
  !noiDungRule('.panel>h2::before'),
  'catalogue title không float đè chữ và panel không dùng stripe trang trí');
ktra(noiDungRule('.pill-chiso .bar>i').indexOf('--color-info') < 0 &&
  noiDungRule('.dash-the-lon .bar>i').indexOf('--color-info') < 0,
  'progress trung tính không mượn semantic info');
ktra(/\.khung\s*\{[\s\S]*?grid-template-columns\s*:\s*var\(--size-workspace-rail\)\s+var\(--size-secondary-nav\)\s+minmax\(0,1fr\)/.test(SRC.css) &&
  /\.page-frame\s*\{[^}]*grid-column\s*:\s*3/.test(SRC.css),
  'desktop shell có workspace rail + secondary nav + work area');
ktra(/@media\s*\(max-width:639px\)[\s\S]*?#workspace\s*\{[\s\S]*?position\s*:\s*fixed[\s\S]*?grid-template-columns\s*:\s*repeat\(5/.test(SRC.css) &&
  /@media\s*\(max-width:639px\)[\s\S]*?#menu\s*\{[\s\S]*?bottom\s*:/.test(SRC.css),
  'mobile shell dùng bottom workspace nav và secondary sheet');
ktra(/@media\s*\(max-width:639px\)[\s\S]*?#nut-res\s*\{[^}]*display\s*:\s*none/.test(SRC.css) &&
  /@media\s*\(max-width:639px\)[\s\S]*?\.tinh-hinh-mo-res\s*\{[^}]*display\s*:\s*inline-flex/.test(SRC.css) &&
  /@media\s*\(max-width:639px\)[\s\S]*?\.tt-res\s*\{[^}]*display\s*:\s*none/.test(SRC.css) &&
  /\.tt-res\.mo-ra\s*\{[^}]*display\s*:\s*grid/.test(SRC.css),
  'mobile đưa resource trigger vào Situation Strip, panel chỉ mở theo yêu cầu');
ktra(/\.tinh-hinh\s*\{[\s\S]*?grid-template-columns/.test(SRC.css) &&
  /@media\s*\(max-width:639px\)[\s\S]*?\.tinh-hinh-dang-chay[^}]*display\s*:\s*none/.test(SRC.css) &&
  /@media\s*\(max-width:639px\)[\s\S]*?\.tinh-hinh-tai-nguyen[^}]*display\s*:\s*none/.test(SRC.css),
  'Situation Strip có desktop summary và mobile chỉ giữ scope/top alert/resource trigger');
ktra(/@media\s*\(max-width:959px\)[\s\S]*?\.panel\.tq-ma-tran>\.noi>table\s*\{[^}]*display\s*:\s*none/.test(SRC.css) &&
  /@media\s*\(max-width:959px\)[\s\S]*?\.tq-ma-tran-mobile\s*\{[^}]*display\s*:\s*block/.test(SRC.css) &&
  !/@media\s*\(max-width:959px\)[\s\S]*?\.tq-ma-tran\s+table\s*\{[^}]*display\s*:\s*none/.test(SRC.css) &&
  /min-height\s*:\s*var\(--size-control\)/.test(noiDungRule('.tq-ma-tran-item summary')),
  'Planet Matrix mobile/tablet dùng selector đủ mạnh để chỉ hiện priority disclosure');
ktra(/\.bang-cuon>table\s*\{[^}]*min-width\s*:\s*42rem/.test(SRC.css) &&
  /@media\s*\(max-width:959px\)[\s\S]*?\.panel>\.noi\.bang-cuon>table\s*\{[^}]*display\s*:\s*table/.test(SRC.css),
  'bảng dữ liệu hẹp giữ cột đọc được và cuộn trong panel thay vì ép chữ dọc');
ktra(/@media\s*\(max-width:639px\)[\s\S]*?\.tinh-hinh-hau-qua\s*\{[^}]*-webkit-line-clamp\s*:\s*2/.test(SRC.css),
  'mobile giữ hậu quả cảnh báo cạnh CTA bằng clamp hai dòng');
ktra(['1440', '960', '414', '320'].every(function (w) {
  return (new RegExp('width:\\s*' + w + '\\b')).test(SRC.visual);
}) && ['tongquan', 'thienha', 'tainguyen'].every(function (id) {
  return (new RegExp("id:\\s*'" + id + "'")).test(SRC.visual);
}) && /test:visual/.test(SRC.build + doc('package.json')),
  'Gate B runner khóa exact 4 viewport × 3 màn và có npm command');
ktra(/page\.on\('pageerror'/.test(SRC.visual) && /m\.type\(\) === 'error'/.test(SRC.visual) &&
  /page\.screenshot/.test(SRC.visual) && /alertTrongFold/.test(SRC.visual) && /overflow/.test(SRC.visual),
  'Gate B runner thu lỗi browser, kiểm fold/overflow và sinh screenshot');
ktra(/data-pi/.test(vungObject(SRC.ui, 'U.nhoDieuKhienFocus = function')) &&
  /data-alert-key/.test(vungObject(SRC.ui, 'U.nhoDieuKhienFocus = function')),
  'focus key phân biệt CTA cùng action bằng planet và alert key');
ktra([SRC.index, SRC.webIndex].every(function (html) {
  return /id="tt-res"[^>]*role="region"[^>]*aria-label="Tài nguyên hành tinh"[^>]*tabindex="-1"/.test(html);
}) && /U\.focusRes\s*=\s*function/.test(SRC.ui) && /mo\s*&&\s*U\.focusRes/.test(SRC.app),
  'resource disclosure có region focus đích rõ ràng sau khi kích hoạt');
ktra(/U\.traFocusMenu\s*=\s*function/.test(SRC.ui) &&
  /menuDangMo[\s\S]{0,260}?U\.traFocusMenu/.test(SRC.app) &&
  /resDangMo[\s\S]{0,260}?U\.traFocusRes/.test(SRC.app),
  'Escape đóng disclosure và phục hồi focus qua trigger ổn định');
ktra(/if\s*\(tokenLucGoi\s*!==\s*token\)\s*throw[\s\S]{0,100}?netOK\(true\)/.test(SRC.mp) &&
  /MP\.lienLac\s*===\s*ok\s*&&\s*MP\._nhanLienLac\s*===\s*nhan/.test(SRC.mp) &&
  /Mất kết nối · đang thử lại/.test(SRC.mp) && !/textContent\s*=\s*['"]⚠/.test(SRC.mp),
  'network live status bỏ response phiên cũ, chỉ announce khi state đổi và giữ nhãn đầy đủ');
ktra(!/queueSeq|queueIdsV1/.test(doc('js/engine.js') + '\n' + doc('js/fleet.js')) &&
  /queueConKhop/.test(SRC.app) && /data-queue-key/.test(SRC.ui) && !/queueKey/.test(doc('js/actions.js')),
  'queue guard chỉ ở presentation/client, không đổi action contract hoặc state schema theo Gate A');
ktra(!/<div class="panel"><h3/.test(SRC.ui + '\n' + SRC.mp) &&
  /<div class="panel"><h2/.test(SRC.ui) && /\.panel>h2\s*\{/.test(SRC.css),
  'page heading đi theo h1 rồi section h2, không nhảy thẳng tới h3');
ktra(/display\s*:\s*block/.test(noiDungRule('.dash-the-lon .bar')) &&
  /display\s*:\s*block/.test(noiDungRule('.pill-chiso .bar')),
  'progress bar là block có kích thước ổn định');

/* ------------------------------------------------------- focus/input */
function taoFocusDom() {
  var body = { id: 'body' };
  var elements = {};
  var document = {
    activeElement: body,
    body: body,
    addEventListener: function () {},
    getElementById: function (id) { return elements[id] || null; }
  };
  function input(value) {
    return {
      id: 'focus-field', tagName: 'INPUT', type: 'text', value: value,
      selectionStart: 0, selectionEnd: 0, selectionDirection: 'none',
      disabled: false, hidden: false,
      getAttribute: function () { return null; },
      getClientRects: function () { return [{}]; },
      focus: function () { document.activeElement = this; },
      setSelectionRange: function (a, b, d) {
        this.selectionStart = a; this.selectionEnd = b; this.selectionDirection = d;
      }
    };
  }
  ['tt-res', 'workspace', 'menu', 'thanh-canh', 'chon-ht', 'chan-tt', 'nut-menu'].forEach(function (id) {
    elements[id] = { innerHTML: '', classList: { remove: function () {} }, setAttribute: function () {} };
  });
  var dauMan = {};
  Object.defineProperty(dauMan, 'innerHTML', {
    get: function () { return ''; },
    set: function () {
      elements['tieu-de-man'] = {
        id: 'tieu-de-man', focus: function () { document.activeElement = this; }
      };
    }
  });
  elements['dau-man'] = dauMan;
  var noidung = {};
  noidung.contains = function (el) { return !!(el && elements[el.id] === el); };
  noidung.focus = function () { document.activeElement = noidung; };
  Object.defineProperty(noidung, 'innerHTML', {
    get: function () { return ''; },
    set: function () {
      document.activeElement = body;
      elements['focus-field'] = input('1');
    }
  });
  elements.noidung = noidung;
  return { document: document, elements: elements, body: body };
}

var focusDom = taoFocusDom();
var focusCtx = napUi(focusDom.document), focusU = focusCtx.window.U;
focusCtx.window.Event = function (type, opt) { this.type = type; this.bubbles = !!(opt && opt.bubbles); };
var focusState = taoState();
focusU.st = function () { return focusState; };
focusU.thanhRes = function () { return ''; };
focusU.veWorkspace = focusU.veMenu = focusU.veCanh = focusU.veChonHT = function () {};
focusU.sig = function () { return 'sig'; };
focusU.man = 'congtrinh'; focusU.pi = 0;
focusU.m_congtrinh = function () { return '<input id="focus-field" value="1">'; };
focusU.m_tainguyen = focusU.m_congtrinh;
focusU.ve();
var dangNhap = focusDom.elements['focus-field'];
dangNhap.value = '17'; dangNhap.selectionStart = 1; dangNhap.selectionEnd = 2;
dangNhap.selectionDirection = 'forward'; dangNhap.focus();
focusU.ve();
var sauDongBo = focusDom.elements['focus-field'];
ktra(sauDongBo.value === '17' && focusDom.document.activeElement === sauDongBo &&
  sauDongBo.selectionStart === 1 && sauDongBo.selectionEnd === 2,
  'rerender cùng màn/scope giữ value, selection và focus');

sauDongBo.value = '23'; sauDongBo.focus();
focusU.denMan('tainguyen', { chuDong: true });
var sauDieuHuong = focusDom.elements['focus-field'];
ktra(sauDieuHuong.value === '1' && focusDom.document.activeElement.id === 'tieu-de-man',
  'điều hướng chủ động không phục hồi input cũ và focus page heading');

focusDom.document.activeElement = focusDom.body;
var rootFocus = focusDom.elements.noidung;
sauDieuHuong.hidden = true;
focusU.traTruongDangNhap(rootFocus, { id: 'focus-field', tag: 'input', type: 'text', value: '99' });
ktra(sauDieuHuong.value === '1' && focusDom.document.activeElement === focusDom.body,
  'không phục hồi control hidden');
sauDieuHuong.hidden = false;
sauDieuHuong.type = 'file'; sauDieuHuong.focus();
ktra(focusU.nhoTruongDangNhap(rootFocus) === null, 'không snapshot input file');

var thuocTinhFocus = { 'data-act': 'gal', 'data-dg': '1' };
var nutFocusCu = {
  id: '', tagName: 'BUTTON', disabled: false, hidden: false,
  attributes: [{ name: 'data-act', value: 'gal' }, { name: 'data-dg', value: '1' }],
  getAttribute: function (ten) { return Object.prototype.hasOwnProperty.call(thuocTinhFocus, ten) ? thuocTinhFocus[ten] : null; }
};
var nutFocusSai = {
  id: '', tagName: 'BUTTON', disabled: false, hidden: false,
  getAttribute: function (ten) {
    if (ten === 'data-act') return 'gal';
    if (ten === 'data-dg') return '-1';
    return null;
  },
  closest: function () { return null; }, getClientRects: function () { return [{}]; },
  focus: function () { focusDom.document.activeElement = this; }
};
var nutFocusMoi = {
  id: '', tagName: 'BUTTON', disabled: false, hidden: false,
  getAttribute: nutFocusCu.getAttribute,
  closest: function () { return null; }, getClientRects: function () { return [{}]; },
  focus: function () { focusDom.document.activeElement = this; }
};
var nutFocusAn = {
  id: '', tagName: 'BUTTON', disabled: false, hidden: true,
  getAttribute: nutFocusCu.getAttribute,
  closest: function () { return null; }, getClientRects: function () { return []; },
  focus: function () { focusDom.document.activeElement = this; }
};
focusDom.document.activeElement = nutFocusCu;
var khoaFocus = focusU.nhoDieuKhienFocus();
focusDom.document.activeElement = focusDom.body;
focusDom.document.querySelectorAll = function () { return [nutFocusAn, nutFocusSai, nutFocusMoi]; };
focusU.traDieuKhienFocus(khoaFocus);
ktra(focusDom.document.activeElement === nutFocusMoi,
  'rerender bỏ qua duplicate hidden và phục hồi đúng control cùng focus key');

focusDom.elements['thanh-canh'].id = 'thanh-canh';
focusDom.elements['thanh-canh'].focus = function () { focusDom.document.activeElement = this; };
focusDom.document.activeElement = focusDom.body;
focusU.traDieuKhienFocus({ id: 'nut-tinh-hinh-chinh', tag: 'button' });
ktra(focusDom.document.activeElement === focusDom.elements['thanh-canh'],
  'top alert CTA biến mất thì focus hạ về Situation Strip thay vì rơi về body');

function nutFocus(id, attrs) {
  return {
    id: id, tagName: 'BUTTON', disabled: false, hidden: false,
    getAttribute: function (ten) {
      return Object.prototype.hasOwnProperty.call(attrs || {}, ten) ? attrs[ten] : null;
    },
    closest: function () { return null; }, getClientRects: function () { return [{}]; },
    focus: function () { focusDom.document.activeElement = this; }
  };
}
var topAttrsCu = {
  'data-act': 'den-viec', 'data-alert-key': 'attack:old', 'data-man': 'hamdoi', 'data-pi': '1'
};
var topCu = nutFocus('nut-tinh-hinh-chinh', topAttrsCu);
focusDom.document.activeElement = topCu;
var khoaTopCu = focusU.nhoDieuKhienFocus();
var topMoi = nutFocus('nut-tinh-hinh-chinh', {
  'data-act': 'den-viec', 'data-alert-key': 'attack:new', 'data-man': 'hamdoi', 'data-pi': '0'
});
focusDom.elements['nut-tinh-hinh-chinh'] = topMoi;
focusDom.document.querySelectorAll = function () { return [topMoi]; };
focusDom.document.activeElement = focusDom.body;
focusU.traDieuKhienFocus(khoaTopCu);
ktra(khoaTopCu.attrs['data-man'] === 'hamdoi' && khoaTopCu.attrs['data-pi'] === '1' &&
  focusDom.document.activeElement === focusDom.elements['thanh-canh'],
  'top alert đổi danh tính sau rerender thì focus về strip, không nhảy sang cảnh báo mới');

var resRegion = focusDom.elements['tt-res'] = {
  id: 'tt-res', tagName: 'DIV', disabled: false, hidden: false,
  closest: function () { return null; }, getClientRects: function () { return [{}]; },
  focus: function () { focusDom.document.activeElement = this; }
};
var resTriggerCu = nutFocus('nut-res-strip', { 'data-act': 'toggle-res' });
focusDom.elements['nut-res-strip'] = resTriggerCu;
focusU.focusRes(resTriggerCu);
var resTriggerMoi = nutFocus('nut-res-strip', { 'data-act': 'toggle-res' });
focusDom.elements['nut-res-strip'] = resTriggerMoi;
focusU.traFocusRes();
ktra(focusDom.document.activeElement === resTriggerMoi && focusDom.document.activeElement !== resTriggerCu,
  'resource disclosure resolve lại trigger theo id sau full render');

var workspaceCu = nutFocus('', { 'data-act': 'workspace', 'data-workspace': 'tac_chien' });
var workspaceMoi = nutFocus('', { 'data-act': 'workspace', 'data-workspace': 'tac_chien' });
focusU.nhoTriggerMenu(workspaceCu);
focusDom.document.querySelectorAll = function (q) { return q === '[data-act="workspace"]' ? [workspaceMoi] : []; };
focusDom.document.activeElement = focusDom.body;
focusU.traFocusMenu();
ktra(focusDom.document.activeElement === workspaceMoi,
  'menu disclosure resolve lại workspace trigger sau full render');

var nutMenuMoi = focusDom.elements['nut-menu'] = nutFocus('nut-menu', { 'data-act': 'toggle-menu' });
focusU.nhoTriggerMenu(workspaceCu);
focusDom.document.querySelectorAll = function () { return []; };
focusDom.document.activeElement = focusDom.body;
focusU.traFocusMenu();
ktra(focusDom.document.activeElement === nutMenuMoi,
  'menu disclosure dùng nút menu làm focus fallback khi workspace trigger không còn');

function napDisclosureRuntime(width) {
  var listeners = {}, elements = {}, body = { id: 'body' };
  function lop(initial) {
    var map = {};
    (initial || []).forEach(function (x) { map[x] = true; });
    return {
      add: function (x) { map[x] = true; },
      remove: function (x) { delete map[x]; },
      contains: function (x) { return !!map[x]; }
    };
  }
  var document = {
    activeElement: body, body: body, hidden: false,
    addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: function () {},
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function (q) {
      if (q === '[data-act="workspace"]') return [elements['workspace-trigger']];
      if (q === '[data-act="toggle-res"][aria-controls="tt-res"]') return [elements['nut-res-strip']];
      return [];
    },
    createElement: function () { return { style: {}, remove: function () {} }; }
  };
  function nut(id, attrs) {
    return {
      id: id, tagName: 'BUTTON', disabled: false, hidden: false, attrs: attrs || {},
      getAttribute: function (ten) { return Object.prototype.hasOwnProperty.call(this.attrs, ten) ? this.attrs[ten] : null; },
      setAttribute: function (ten, value) { this.attrs[ten] = value; },
      closest: function () { return null; }, getClientRects: function () { return [{}]; },
      focus: function () { document.activeElement = this; }
    };
  }
  elements.menu = { id: 'menu', innerHTML: '', classList: lop(), setAttribute: function () {} };
  elements['tt-res'] = {
    id: 'tt-res', tagName: 'DIV', innerHTML: '', classList: lop(),
    closest: function () { return null; }, getClientRects: function () { return [{}]; },
    focus: function () { document.activeElement = this; }
  };
  elements['nut-menu'] = nut('nut-menu', { 'data-act': 'toggle-menu' });
  elements['nut-res'] = nut('nut-res', { 'data-act': 'toggle-res' });
  elements['nut-res-strip'] = nut('nut-res-strip', { 'data-act': 'toggle-res', 'aria-controls': 'tt-res' });
  elements['workspace-trigger'] = nut('', { 'data-act': 'workspace', 'data-workspace': 'tac_chien' });
  elements['thanh-canh'] = {
    id: 'thanh-canh', tagName: 'DIV', hidden: false, disabled: false,
    closest: function () { return null; }, getClientRects: function () { return [{}]; },
    focus: function () { document.activeElement = this; }
  };
  var window = {
    G: taoG(), APP: {}, ST: taoState(), scrollTo: function () {},
    matchMedia: function (query) {
      var m = /max-width:\s*(\d+)px/.exec(query);
      return { matches: !!m && width <= Number(m[1]) };
    }
  };
  var context = {
    window: window, document: document, console: console,
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {}
  };
  vm.createContext(context);
  vm.runInContext(SRC.ui, context, { filename: 'js/ui.js' });
  vm.runInContext(SRC.app, context, { filename: 'js/app.js' });
  var U = window.U;
  U.man = 'thienha'; U.workspace = 'tac_chien';
  U.veWorkspace = U.veMenu = function () {};
  return {
    U: U, ACT: window.APP.ACT, document: document, elements: elements,
    keydown: function (event) {
      (listeners.keydown || []).forEach(function (fn) { fn(event); });
    }
  };
}

var desktopDisclosure = napDisclosureRuntime(1200);
desktopDisclosure.ACT.workspace(desktopDisclosure.elements['workspace-trigger']);
var desktopControl = {
  id: 'desktop-control', focus: function () { desktopDisclosure.document.activeElement = this; }
};
desktopControl.focus();
var desktopEsc = { key: 'Escape', target: desktopControl, defaultPrevented: false,
  preventDefault: function () { this.defaultPrevented = true; } };
desktopDisclosure.keydown(desktopEsc);
ktra(!desktopDisclosure.elements.menu.classList.contains('mo-ra') && !desktopEsc.defaultPrevented &&
  desktopDisclosure.document.activeElement === desktopControl,
  'desktop workspace giữ menu cố định; Escape trong nội dung không cướp focus');

var mobileDisclosure = napDisclosureRuntime(414);
mobileDisclosure.elements['tt-res'].classList.add('mo-ra');
mobileDisclosure.U._resTriggerId = 'nut-res-strip';
mobileDisclosure.ACT.workspace(mobileDisclosure.elements['workspace-trigger']);
var mobileEsc = { key: 'Escape', target: mobileDisclosure.elements.menu, defaultPrevented: false,
  preventDefault: function () { this.defaultPrevented = true; } };
mobileDisclosure.keydown(mobileEsc);
ktra(!mobileDisclosure.elements['tt-res'].classList.contains('mo-ra') &&
  !mobileDisclosure.elements.menu.classList.contains('mo-ra') && mobileEsc.defaultPrevented &&
  mobileDisclosure.document.activeElement === mobileDisclosure.elements['workspace-trigger'],
  'mobile workspace đóng resource trước khi mở menu; Escape trả focus đúng workspace');

var chiTietCu = { id: 'tq-planet-details-1', open: true };
var chiTietMoi = { id: 'tq-planet-details-1', open: false };
var rootDisclosure = {
  querySelectorAll: function () { return [chiTietCu]; },
  contains: function (el) { return el === chiTietMoi; }
};
var idsDisclosure = focusU.nhoChiTietMo(rootDisclosure);
focusDom.elements['tq-planet-details-1'] = chiTietMoi;
focusU.traChiTietMo(rootDisclosure, idsDisclosure);
ktra(chiTietMoi.open === true,
  'full render giữ trạng thái mở của mobile Planet Matrix disclosure');

var soInputEvent = 0, inputEventCuoi = null;
var ctInput = focusDom.elements['ct-sl-metalMine'] = {
  id: 'ct-sl-metalMine', tagName: 'INPUT', type: 'number', value: '1',
  disabled: false, hidden: false,
  getClientRects: function () { return [{}]; },
  closest: function () { return null; },
  dispatchEvent: function (e) { soInputEvent++; inputEventCuoi = e; return true; },
  focus: function () { focusDom.document.activeElement = this; }
};
focusU.traTruongDangNhap(rootFocus,
  { id: 'ct-sl-metalMine', tag: 'input', type: 'number', value: '5' });
ktra(ctInput.value === '5' && soInputEvent === 1 && inputEventCuoi.type === 'input' && inputEventCuoi.bubbles,
  'khôi phục #ct-sl-* phát input một lần để cập nhật giá/thời gian phụ thuộc');

var soMissionEvent = 0;
var missionInput = focusDom.elements['f-mission'] = {
  id: 'f-mission', tagName: 'SELECT', type: 'select-one', value: 'attack',
  options: [{ value: 'attack' }, { value: 'hold' }], disabled: false, hidden: false,
  getClientRects: function () { return [{}]; },
  closest: function () { return null; },
  dispatchEvent: function () { soMissionEvent++; return true; },
  focus: function () { focusDom.document.activeElement = this; }
};
focusU.traTruongDangNhap(rootFocus,
  { id: 'f-mission', tag: 'select', type: 'select-one', value: 'hold' });
ktra(missionInput.value === 'hold' && soMissionEvent === 0,
  'khôi phục #f-mission không phát input gây render đệ quy');

console.log('\nUI contracts: ' + ok + ' đạt, ' + fail + ' lỗi.');
if (fail) process.exit(1);
