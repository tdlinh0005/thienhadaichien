/* UI — khung: thanh tài nguyên, menu, cảnh báo (tách từ ui.js) */
'use strict';
var G = window.G, U = window.U, APP = window.APP;

/* ======================================================================
 * KHUNG: thanh trên, menu, cảnh báo
 * ==================================================================== */
U.thanhRes = function () {
  var st = U.st(), p = U.ht(), s = null, cap = null;
  function chip(mauDot, ten, vHtml, rHtml, clsThem) {
    return '<div class="chip' + (clsThem ? ' ' + clsThem : '') + '">' +
      '<i class="dot" style="background:' + mauDot + ';color:' + mauDot + '"></i>' +
      '<span class="n">' + ten + '</span>' + vHtml + rHtml +
      (clsThem === 'day' ? '<span class="chip-state">Đầy</span>' : '') + '</div>';
  }
  if (p && p.res && p.b) {
    try { s = G.sanLuong(st, p); } catch (eSan) { s = null; }
    try { cap = G.dungTich(p); } catch (eCap) { cap = null; }
  }
  if (!p || !p.res || !s || !s.r || !cap)
    return chip('var(--color-muted)', 'Tài nguyên', '<span class="v">Chưa có dữ liệu</span>', '', '');
  var h = '';
  for (var i = 0; i < G.RES_HANH_TINH.length; i++) {
    var id = G.RES_HANH_TINH[i], r = G.byId(G.RES, id);
    var v = Number(p.res[id]) || 0, c = Number(cap[id]) || 0, day = c > 0 && v >= c;
    h += chip(r.mau, r.ky,
      '<span class="v sz ' + (day ? 'do' : 'sang') + '" data-live="res.' + id + '">' + G.soNgan(v) + '</span>',
      '<span class="r sz" data-live="rate.' + id + '">' + (s.r[id] >= 0 ? '+' : '') + G.soNgan(s.r[id]) + '/g</span>',
      day ? 'day' : '');
  }
  h += chip(G.byId(G.RES, 'galana').mau, 'GL',
    '<span class="v sz" data-live="galana">' + G.soNgan(st.galana) + '</span>',
    '<span class="r sz" data-live="rate.galana">+' + G.soNgan(s.r.galana) + '/g</span>');
  h += chip(G.byId(G.RES, 'tech').mau, 'KT',
    '<span class="v sz" data-live="tech">' + G.soNgan(st.techPts) + '</span>',
    '<span class="r sz" data-live="rate.tech">+' + G.soNgan(s.r.tech) + '/g</span>');
  h += chip(s.hs < 1 ? 'var(--do)' : 'var(--vang)', 'Điện',
    '<span class="v sz">' + (s.hs < 1 ? 'Thiếu · ' : '') + G.so(s.dienCo) + ' / ' + G.so(s.dienDung) + '</span>',
    '<span class="r">HS ' + Math.round(s.hs * 100) + '%</span>',
    s.hs < 1 ? 'thieu-dien' : '');
  var bt = U.bt(st);
  h += chip('var(--cam)', 'Bảo trì',
    '<span class="v sz">' + U.dem(bt.nextAt) + '</span>',
    '<span class="r">#' + (bt.cycle + 1) + '</span>');
  return h;
};

/* [v7 UI] icon SVG inline cho nav — stroke currentColor, không thư viện ngoài */
U.svgIcon = function (id) {
  var P = {
    tongquan: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>',
    tainguyen: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.8 2M9.5 2.5h5"/>',
    congtrinh: '<path d="M4 21V10l8-6 8 6v11"/><path d="M4 21h16M9.5 21v-6h5v6M12 4v3"/>',
    nghiencuu: '<path d="M12 3l2.6 5.4L20 9.2l-4 3.9.9 5.6L12 16l-4.9 2.7.9-5.6-4-3.9 5.4-.8z"/>',
    xuong: '<path d="M3 21V11l5 3v-3l5 3v-3l8 4v6zM3 21h18"/><circle cx="17.5" cy="17.5" r="1"/>',
    phongthu: '<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"/><path d="M9 11.5l2 2 4-4.5"/>',
    hamdoi: '<path d="M4 13.5L7 8h10l3 5.5M4 13.5h16M4 13.5V18h16v-4.5"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/>',
    thienha: '<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="9.5" ry="3.2" transform="rotate(-22 12 12)"/><circle cx="19.5" cy="6" r="1"/>',
    lienminh: '<path d="M6 21V4M6 5h11l-2.5 3.5L17 12H6"/>',
    taichinh: '<path d="M4 10h16M5 10l7-6 7 6M6 10v8M10 10v8M14 10v8M18 10v8M3.5 21h17"/>',
    xephang: '<path d="M8 21h8M12 15v6M6 3h12v5a6 6 0 01-12 0zM6 5H3.5A3 3 0 006 11M18 5h2.5A3 3 0 0118 11"/>',
    mophong: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M8 21h8M12 16v5M8 9.5l2 2-2 2M12.5 14h4"/>',
    tinnhan: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    huongdan: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 20.5V5.5M20 18H6.5A2.5 2.5 0 004 20.5"/>',
    nhatky: '<path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"/><path d="M14.5 6.5l3 3"/>',
    bangtin: '<path d="M3 10v4h4l6 5V5l-6 5zM16.5 9a4.5 4.5 0 010 6M19 6.5a8 8 0 010 11"/>',
    chat: '<path d="M20 12a8 8 0 01-8 8H4l2-3.5A8 8 0 1120 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
    taikhoan: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0114 0v2"/>'
  };
  return '<svg class="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (P[id] || P.tongquan) + '</svg>';
};

U.WORKSPACES = [
  { id: 'chi_huy', order: 10, icon: 'tongquan', label: 'Chỉ huy' },
  { id: 'phat_trien', order: 20, icon: 'congtrinh', label: 'Phát triển' },
  { id: 'tac_chien', order: 30, icon: 'thienha', label: 'Tác chiến' },
  { id: 'lien_minh', order: 40, icon: 'lienminh', label: 'Liên minh' },
  { id: 'he_thong', order: 50, icon: 'huongdan', label: 'Hệ thống' }
];

/* Registry canonical cho cả hai mode. Preload chỉ là identifier; driver MP giữ
   quyền ánh xạ identifier sang API private của nó. */
U.DESTINATIONS = [
  { id: 'tongquan', workspace: 'chi_huy', order: 10, icon: 'tongquan', label: 'Tổng Quan', modes: ['solo', 'mp'], badge: null, preload: null },
  { id: 'tainguyen', workspace: 'phat_trien', order: 10, icon: 'tainguyen', label: 'Tài Nguyên', modes: ['solo', 'mp'], badge: null, preload: null },
  { id: 'congtrinh', workspace: 'phat_trien', order: 20, icon: 'congtrinh', label: 'Công Trình', modes: ['solo', 'mp'], badge: null, preload: null },
  { id: 'nghiencuu', workspace: 'phat_trien', order: 30, icon: 'nghiencuu', label: 'Nghiên Cứu', modes: ['solo', 'mp'], badge: null, preload: null },
  { id: 'xuong', workspace: 'phat_trien', order: 40, icon: 'xuong', label: 'Xưởng Đóng Tàu', modes: ['solo', 'mp'], badge: null, preload: null },
  { id: 'phongthu', workspace: 'phat_trien', order: 50, icon: 'phongthu', label: 'Phòng Thủ', modes: ['solo', 'mp'], badge: null, preload: null },
  { id: 'taichinh', workspace: 'phat_trien', order: 60, icon: 'taichinh', label: 'Ngân Hàng & Thị Trường', modes: ['solo', 'mp'], badge: null, preload: 'taichinh' },
  { id: 'thienha', workspace: 'tac_chien', order: 10, icon: 'thienha', label: 'Thiên Hà', modes: ['solo', 'mp'], badge: null, preload: 'thienha' },
  { id: 'hamdoi', workspace: 'tac_chien', order: 20, icon: 'hamdoi', label: 'Hạm Đội', modes: ['solo', 'mp'], badge: 'ham_dang_bay', preload: null },
  { id: 'mophong', workspace: 'tac_chien', order: 30, icon: 'mophong', label: 'Máy Tính Trận', modes: ['solo', 'mp'], badge: null, preload: null },
  { id: 'tinnhan', workspace: 'tac_chien', order: 40, icon: 'tinnhan', label: 'Tin Nhắn', modes: ['solo', 'mp'], badge: 'tin_chua_doc', preload: null },
  { id: 'lienminh', workspace: 'lien_minh', order: 10, icon: 'lienminh', label: 'Liên Minh', modes: ['solo', 'mp'], badge: null, preload: 'lienminh' },
  { id: 'xephang', workspace: 'lien_minh', order: 20, icon: 'xephang', label: 'Bảng Xếp Hạng', modes: ['solo', 'mp'], badge: null, preload: 'xephang' },
  { id: 'bangtin', workspace: 'lien_minh', order: 30, icon: 'bangtin', label: 'Bảng Tin Vũ Trụ', modes: ['mp'], badge: null, preload: 'bangtin' },
  { id: 'chat', workspace: 'lien_minh', order: 40, icon: 'chat', label: 'Phòng Chat', modes: ['mp'], badge: null, preload: 'chat' },
  { id: 'huongdan', workspace: 'he_thong', order: 10, icon: 'huongdan', label: 'Hướng Dẫn', modes: ['solo', 'mp'], badge: null, preload: null },
  { id: 'nhatky', workspace: 'he_thong', order: 20, icon: 'nhatky', label: 'Nhật Ký & Lưu', modes: ['solo'], badge: null, preload: null },
  { id: 'taikhoan', workspace: 'he_thong', order: 30, icon: 'taikhoan', label: 'Tài Khoản', modes: ['mp'], badge: null, preload: null }
];

U.metaMan = function (id) {
  for (var i = 0; i < U.DESTINATIONS.length; i++) if (U.DESTINATIONS[i].id === id) return U.DESTINATIONS[i];
  return null;
};
U.taoMAN = function (mode) {
  if (mode !== 'solo' && mode !== 'mp') return [];
  var thuTuWorkspace = {};
  for (var w = 0; w < U.WORKSPACES.length; w++) thuTuWorkspace[U.WORKSPACES[w].id] = U.WORKSPACES[w].order;
  return U.DESTINATIONS.filter(function (m) { return m.modes.indexOf(mode) >= 0; })
    .slice().sort(function (a, b) {
      return (thuTuWorkspace[a.workspace] - thuTuWorkspace[b.workspace]) || (a.order - b.order);
    }).map(function (m) {
      return {
        id: m.id, workspace: m.workspace, order: m.order, icon: m.icon, label: m.label,
        modes: m.modes.slice(), badge: m.badge, preload: m.preload
      };
    });
};
U.MAN = U.taoMAN('solo');
U.workspace = 'chi_huy';

U.metaWorkspace = function (id) {
  for (var i = 0; i < U.WORKSPACES.length; i++) if (U.WORKSPACES[i].id === id) return U.WORKSPACES[i];
  return null;
};
U.soBadgeMan = function (m, st) {
  if (!m || !m.badge || !st) return 0;
  if (m.badge === 'ham_dang_bay') return (st.fleets || []).length;
  if (m.badge === 'tin_chua_doc') {
    var n = 0;
    for (var i = 0; i < (st.msgs || []).length; i++) if (!st.msgs[i].doc) n++;
    return n;
  }
  return 0;
};
U.veWorkspace = function () {
  var box = document.getElementById('workspace');
  if (!box) return;
  var st = U.st(), h = '';
  for (var i = 0; i < U.WORKSPACES.length; i++) {
    var w = U.WORKSPACES[i], dem = 0;
    for (var j = 0; j < U.MAN.length; j++) if (U.MAN[j].workspace === w.id) dem += U.soBadgeMan(U.MAN[j], st);
    h += '<button type="button" class="workspace-nut' + (U.workspace === w.id ? ' on' : '') + '" data-act="workspace" data-workspace="' +
      w.id + '"' + (U.workspace === w.id ? ' aria-current="true"' : '') + ' aria-label="' +
      U.esc(w.label + (dem ? ', ' + dem + ' việc cần chú ý' : '')) + '">' +
      U.svgIcon(w.icon) + '<span>' + U.esc(w.label) + '</span>' +
      (dem ? '<span class="dem-nho" aria-label="' + dem + ' việc cần chú ý">' + dem + '</span>' : '') + '</button>';
  }
  if (box.innerHTML !== h) box.innerHTML = h;
};
U.veMenu = function () {
  var box = document.getElementById('menu');
  if (!box) return;
  var st = U.st(), h = '', w = U.metaWorkspace(U.workspace);
  for (var j = 0; j < U.MAN.length; j++) {
    var m = U.MAN[j];
    if (m.workspace !== U.workspace) continue;
    var dem = U.soBadgeMan(m, st);
    h += '<button type="button" class="nav-dich' + (U.man === m.id ? ' on' : '') + '" data-act="man" data-man="' + m.id + '"' +
      (U.man === m.id ? ' aria-current="page"' : '') + '>' + U.svgIcon(m.icon) +
      '<span>' + U.esc(m.label) + '</span>' + (dem ? '<span class="dem-nho">' + dem + '</span>' : '') + '</button>';
  }
  if (typeof box.setAttribute === 'function') box.setAttribute('aria-label', 'Mục trong ' + (w ? w.label : 'workspace'));
  if (box.innerHTML !== h) box.innerHTML = h;
};
U.laDisclosureTaiViewport = function (query, triggerId) {
  if (typeof window.matchMedia === 'function') return window.matchMedia(query).matches;
  var trigger = document.getElementById(triggerId);
  if (!trigger) return false;
  return typeof trigger.getClientRects !== 'function' || !!trigger.getClientRects().length;
};
U.menuLaDisclosure = function () {
  return U.laDisclosureTaiViewport('(max-width: 959px)', 'nut-menu');
};
U.resLaDisclosure = function () {
  return U.laDisclosureTaiViewport('(max-width: 639px)', 'nut-res-strip');
};
U.datMenuMo = function (mo) {
  var menu = document.getElementById('menu'), nut = document.getElementById('nut-menu');
  if (menu && menu.classList) {
    if (mo && menu.classList.add) menu.classList.add('mo-ra');
    if (!mo && menu.classList.remove) menu.classList.remove('mo-ra');
  }
  if (nut && typeof nut.setAttribute === 'function') nut.setAttribute('aria-expanded', mo ? 'true' : 'false');
};
U.datResMo = function (mo) {
  var res = document.getElementById('tt-res'), nut = document.getElementById('nut-res');
  if (res && res.classList) {
    if (mo && res.classList.add) res.classList.add('mo-ra');
    if (!mo && res.classList.remove) res.classList.remove('mo-ra');
  }
  if (nut && typeof nut.setAttribute === 'function') nut.setAttribute('aria-expanded', mo ? 'true' : 'false');
  if (typeof document.querySelectorAll === 'function') {
    var triggers = document.querySelectorAll('[data-act="toggle-res"][aria-controls="tt-res"]');
    for (var i = 0; i < triggers.length; i++)
      if (typeof triggers[i].setAttribute === 'function') triggers[i].setAttribute('aria-expanded', mo ? 'true' : 'false');
  }
};
U.focusRes = function (trigger) {
  var res = document.getElementById('tt-res');
  if (!res || typeof res.focus !== 'function') return;
  trigger = trigger || document.activeElement || null;
  U._resTriggerId = trigger && trigger.id ? trigger.id : '';
  try { res.focus({ preventScroll: true }); } catch (e) { try { res.focus(); } catch (e2) { } }
};
U.traFocusRes = function () {
  var id = U._resTriggerId || '';
  U._resTriggerId = '';
  var trigger = id ? document.getElementById(id) : null;
  if (!trigger || !U.coTheFocus(trigger, String(trigger.tagName || '').toLowerCase())) {
    var ids = ['nut-res-strip', 'nut-res'];
    trigger = null;
    for (var i = 0; i < ids.length; i++) {
      var nut = document.getElementById(ids[i]);
      if (nut && U.coTheFocus(nut, String(nut.tagName || '').toLowerCase())) { trigger = nut; break; }
    }
  }
  if (!trigger) trigger = document.getElementById('thanh-canh');
  if (!trigger || typeof trigger.focus !== 'function') return;
  try { trigger.focus({ preventScroll: true }); } catch (e) { try { trigger.focus(); } catch (e2) { } }
};
U.nhoTriggerMenu = function (trigger) {
  U._menuTriggerId = trigger && trigger.id ? trigger.id : '';
  U._menuTriggerWorkspace = trigger && typeof trigger.getAttribute === 'function'
    ? (trigger.getAttribute('data-workspace') || '') : '';
};
U.xoaTriggerMenu = function () {
  U._menuTriggerId = '';
  U._menuTriggerWorkspace = '';
};
U.traFocusMenu = function () {
  var id = U._menuTriggerId || '', workspace = U._menuTriggerWorkspace || '';
  U.xoaTriggerMenu();
  var trigger = id ? document.getElementById(id) : null;
  if ((!trigger || !U.coTheFocus(trigger, String(trigger.tagName || '').toLowerCase())) &&
      workspace && typeof document.querySelectorAll === 'function') {
    var ds = document.querySelectorAll('[data-act="workspace"]');
    trigger = null;
    for (var i = 0; i < ds.length; i++) {
      if (ds[i].getAttribute('data-workspace') === workspace &&
          U.coTheFocus(ds[i], String(ds[i].tagName || '').toLowerCase())) { trigger = ds[i]; break; }
    }
  }
  if (!trigger || !U.coTheFocus(trigger, String(trigger.tagName || '').toLowerCase()))
    trigger = document.getElementById('nut-menu');
  if (!trigger || !U.coTheFocus(trigger, String(trigger.tagName || '').toLowerCase()))
    trigger = document.getElementById('thanh-canh');
  if (!trigger || typeof trigger.focus !== 'function') return;
  try { trigger.focus({ preventScroll: true }); } catch (e) { try { trigger.focus(); } catch (e2) { } }
};
U.focusNoiDung = function () {
  var dich = document.getElementById('tieu-de-man') || document.getElementById('noidung');
  if (!dich || typeof dich.focus !== 'function') return;
  try { dich.focus({ preventScroll: true }); } catch (e) { try { dich.focus(); } catch (e2) { } }
};
U.denMan = function (id, options) {
  options = options || {};
  var meta = null;
  for (var i = 0; i < U.MAN.length; i++) if (U.MAN[i].id === id) { meta = U.MAN[i]; break; }
  if (!meta) return false;
  var st = U.st();
  if (Number.isInteger(options.pi) && options.pi >= 0 && st && options.pi < st.planets.length) U.datPi(options.pi, st);
  U.workspace = meta.workspace;
  U.man = meta.id;
  U.datMenuMo(false);
  U.datResMo(false);
  U.xoaTriggerMenu();
  U._resTriggerId = '';
  U.ve();
  if (APP.preloadMan && meta.preload) APP.preloadMan(meta, options);
  if (options.chuDong) {
    if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    U.focusNoiDung();
  }
  return true;
};
U.denViec = function (man, pi) {
  var options = { chuDong: true };
  if (Number.isInteger(pi) && pi >= 0) options.pi = pi;
  return U.denMan(man, options);
};

U.MO_WORKSPACE = {
  chi_huy: 'Ưu tiên việc cần xử lý trước khi mở rộng chiến dịch.',
  phat_trien: 'Sản xuất, công nghệ và năng lực của hành tinh đang chọn.',
  tac_chien: 'Tình báo, hạm đội và quyết định chiến đấu trong cùng một hành lang.',
  lien_minh: 'Ngoại giao, thứ hạng và liên lạc trong vũ trụ chung.',
  he_thong: 'Hướng dẫn, dữ liệu bàn chơi và thiết lập tài khoản.'
};
U.laManToanDeQuoc = function (id) {
  return ['tongquan', 'mophong', 'tinnhan', 'lienminh', 'xephang', 'bangtin', 'chat', 'huongdan', 'nhatky', 'taikhoan'].indexOf(id) >= 0;
};
U.veDauMan = function () {
  var meta = U.metaMan(U.man) || U.metaMan('tongquan'), w = U.metaWorkspace(meta.workspace);
  var scope = 'Toàn đế quốc';
  if (!U.laManToanDeQuoc(meta.id)) {
    var p = U.ht();
    scope = p ? U.scopeHanhTinh(p) : 'Chưa chọn hành tinh';
  }
  return '<div class="dau-man-tren"><span class="dau-man-nhom">' + U.esc(w ? w.label : '') + '</span>' +
    '<span class="dau-man-scope sz">' + scope + '</span></div>' +
    '<h1 id="tieu-de-man" tabindex="-1">' + U.esc(meta.label) + '</h1>' +
    '<p>' + U.esc(U.MO_WORKSPACE[meta.workspace] || '') + '</p>';
};

U.locMenuNhanh = function (q) {
  q = String(q || '').trim().toLocaleLowerCase('vi');
  if (q.normalize) q = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!q) return U.MAN.slice();
  return U.MAN.filter(function (m) {
    var s = (m.label + ' ' + (U.metaWorkspace(m.workspace) || {}).label).toLocaleLowerCase('vi');
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.indexOf(q) >= 0;
  });
};
U.veMenuNhanh = function (q) {
  var ds = U.locMenuNhanh(q), h = '';
  for (var i = 0; i < ds.length; i++) {
    var m = ds[i], w = U.metaWorkspace(m.workspace);
    h += '<button type="button" class="lenh-dich" data-act="menu-nhanh-di" data-man="' + m.id + '">' +
      U.svgIcon(m.icon) + '<span><b>' + U.esc(m.label) + '</b><small>' + U.esc(w ? w.label : '') + '</small></span></button>';
  }
  if (!h) h = '<p class="mo">Không có màn phù hợp.</p>';
  var box = document.getElementById('menu-nhanh-ds');
  if (box) box.innerHTML = h;
  return h;
};
U.moMenuNhanh = function () {
  U.hop('Đi tới màn', '<label for="menu-nhanh-tim">Tìm theo tên màn hoặc nhóm</label>' +
    '<input id="menu-nhanh-tim" type="search" autocomplete="off" placeholder="Ví dụ: Hạm Đội">' +
    '<div id="menu-nhanh-ds" class="menu-nhanh-ds">' + U.veMenuNhanh('') + '</div>');
  var o = document.getElementById('menu-nhanh-tim');
  if (o && typeof o.focus === 'function') o.focus();
};

U.htmlNutDenViec = function (a, themClass) {
  if (!a || !a.action || !a.action.man) return '';
  var pi = Number.isInteger(a.action.pi) && a.action.pi >= 0 ? a.action.pi : a.pi;
  var laNutDau = String(themClass || '').indexOf('tinh-hinh-cta') >= 0;
  var tenDayDu = a.action.label + ': ' + a.title + ' — ' + a.scope;
  return '<button type="button" class="nut nho' + (themClass ? ' ' + themClass : '') + '" data-act="den-viec"' +
    (laNutDau ? ' id="nut-tinh-hinh-chinh" data-focus-slot="situation-primary"' : '') +
    ' data-man="' + U.esc(a.action.man) + '"' + (Number.isInteger(pi) && pi >= 0 ? ' data-pi="' + pi + '"' : '') +
    ' data-alert-key="' + U.esc(a.dedupeKey) + '" aria-label="' + U.esc(tenDayDu) + '">' + U.esc(a.action.label) + '</button>';
};
U.htmlEtaViec = function (a) {
  return a && Number.isFinite(a.etaAt)
    ? '<span class="tinh-hinh-eta">Còn ' + U.dem(a.etaAt, '', 'alert.' + a.id + '.eta') + '</span>' : '';
};
U.nhanUuTien = function (priority) {
  return ['Khẩn cấp', 'Cần xử lý', 'Cần chú ý', 'Thông tin'][priority] || 'Thông tin';
};
U.capNhatCanhLive = function (st, alerts) {
  var phien = [st.seed || '', st.t0 || '', st.ten || ''].join('|');
  if (U._canhPhien !== phien) {
    U._canhPhien = phien; U._canhTanCongTruoc = {}; U._canhThuongHienTai = '';
  }
  var khan = document.getElementById('tinh-hinh-khan');
  var thuong = document.getElementById('tinh-hinh-thuong');
  var moi = [], dangCo = {};
  for (var i = 0; i < alerts.length; i++) if (U.alertLaTanCong(alerts[i])) {
    dangCo[alerts[i].dedupeKey] = true;
    if (!U._canhTanCongTruoc[alerts[i].dedupeKey]) moi.push(alerts[i]);
  }
  U._canhTanCongTruoc = dangCo;
  if (khan) {
    if (moi.length) khan.textContent = moi.map(function (a) {
      return 'Báo động. ' + a.title + '. Phạm vi: ' + a.scope + '. ' + a.consequence;
    }).join(' ');
    else if (khan.textContent) khan.textContent = '';
  }
  var top = alerts[0] || null;
  if (thuong) {
    var khoaThuong = top && !U.alertLaTanCong(top) && top.priority < 3 ? top.dedupeKey : '';
    if (khoaThuong && U._canhThuongHienTai !== khoaThuong) {
      thuong.textContent = top.title + '. Phạm vi: ' + top.scope + '. ' + top.consequence;
      U._canhThuongHienTai = khoaThuong;
    } else {
      if (thuong.textContent) thuong.textContent = '';
      U._canhThuongHienTai = khoaThuong;
    }
  }
};
U.datLaiCanhLive = function () {
  U._canhPhien = ''; U._canhTanCongTruoc = {}; U._canhThuongHienTai = '';
  var khan = document.getElementById('tinh-hinh-khan'), thuong = document.getElementById('tinh-hinh-thuong');
  if (khan) khan.textContent = '';
  if (thuong) thuong.textContent = '';
};
U.veCanh = function () {
  var st = U.st();
  if (!st) return;
  var planets = Array.isArray(st.planets) ? st.planets : [];
  var alerts = U.tinhViecCanXuLy(st), top = alerts[0] || null, p = U.ht();
  var tomTatHienTai = U.tomTatHanhTinh(st, p, U.pi, alerts);
  U._viecDaTinh = alerts; U._viecDau = top;
  U.capNhatCanhLive(st, alerts);
  var scope = U.laManToanDeQuoc(U.man) ? 'Toàn đế quốc' : U.scopeHanhTinh(p);
  var planet = U.scopeHanhTinh(p), buildJobs = 0, shipJobs = 0;
  for (var i = 0; i < planets.length; i++) {
    var piCanh = planets[i] || {};
    buildJobs += (Array.isArray(piCanh.qB) ? piCanh.qB : []).length;
    shipJobs += (Array.isArray(piCanh.qS) ? piCanh.qS : []).length;
  }
  var res = document.getElementById('tt-res');
  var resMo = !!(res && res.classList && res.classList.contains('mo-ra'));
  var h = '<div class="tinh-hinh">' +
    '<div class="tinh-hinh-khoi tinh-hinh-scope"><span class="tinh-hinh-nhan">Phạm vi</span>' +
    '<b class="tinh-hinh-pham-vi">' + U.esc(scope) + '</b>' +
    '<span class="tinh-hinh-hanh-tinh">' + U.esc(planet) + '</span></div>';
  if (top) {
    h += '<div class="tinh-hinh-khoi tinh-hinh-canh muc-' + U.esc(top.severity) + '" data-alert-key="' + U.esc(top.dedupeKey) + '">' +
      '<div class="tinh-hinh-canh-chu"><span class="tinh-hinh-nhan"><i class="muc-dau" aria-hidden="true"></i>P' + top.priority + ' · ' + U.nhanUuTien(top.priority) + ' · ' + U.esc(top.scope) + '</span>' +
      '<b>' + U.esc(top.title) + '</b><span class="tinh-hinh-hau-qua">' + U.esc(top.consequence) + '</span>' +
      '<span class="tinh-hinh-meta">' + U.htmlEtaViec(top) + (alerts.length > 1 ? '<span>' + G.so(alerts.length - 1) + ' việc khác</span>' : '') + '</span></div>' +
      U.htmlNutDenViec(top, 'tinh-hinh-cta') + '</div>';
  } else {
    h += '<div class="tinh-hinh-khoi tinh-hinh-canh muc-ok" data-alert-key="none">' +
      '<div class="tinh-hinh-canh-chu"><span class="tinh-hinh-nhan">Trạng thái</span>' +
      '<b>Không có việc cần xử lý</b><span class="tinh-hinh-hau-qua">Các hệ thống đang vận hành trong ngưỡng bình thường.</span></div></div>';
  }
  h += '<div class="tinh-hinh-khoi tinh-hinh-dang-chay"><span class="tinh-hinh-nhan">Đang diễn ra</span>' +
    '<b>' + G.so(buildJobs) + ' xây · ' + G.so(shipJobs) + ' xưởng · ' + G.so((st.fleets || []).length) + ' hạm</b>' +
    '<span>' + (st.ncQueue ? (st.ncQueue.status === 'retry' ? 'Nghiên cứu chờ thử lại' : 'Nghiên cứu đang chạy') : 'Phòng nghiên cứu rảnh') + '</span></div>';
  h += '<div class="tinh-hinh-khoi tinh-hinh-tai-nguyen"><span class="tinh-hinh-nhan">Năng lực hiện tại</span>' +
    '<span class="tinh-hinh-nang-luc"><b data-live="planet.' + U.pi + '.power" class="tq-status' + U.lopTrangThai(tomTatHienTai.power.state) + '">' +
    U.esc(tomTatHienTai.power.label) + '</b><span class="tq-status' + U.lopTrangThai(tomTatHienTai.storage.state) + '">Kho · ' +
    U.esc(tomTatHienTai.storage.label) + '</span></span></div><button type="button" id="nut-res-strip" class="nut nho tinh-hinh-mo-res" data-act="toggle-res" aria-expanded="' +
    (resMo ? 'true' : 'false') + '" aria-controls="tt-res">Tài nguyên</button></div>';
  var box = document.getElementById('tinh-hinh-noi-dung') || document.getElementById('thanh-canh');
  if (box) box.innerHTML = h;
  U.datResMo(resMo);
};

U.veChonHT = function () {
  var st = U.st(), h = '', planets = st && Array.isArray(st.planets) ? st.planets : [];
  for (var i = 0; i < planets.length; i++) {
    var p = planets[i];
    h += '<option value="' + i + '"' + (i === U.pi ? ' selected' : '') + '>' +
      (p ? U.esc(p.ten || 'Hành tinh chưa đặt tên') + ' ' + U.esc(U.toaDoStr(p.c)) : 'Chưa có dữ liệu · #' + (i + 1)) + '</option>';
  }
  var select = document.getElementById('chon-ht');
  if (select) select.innerHTML = h;
};

U.lopTrangThai = function (state) {
  return ['danger', 'warning', 'deficit', 'retry', 'capacity'].indexOf(state) >= 0 ? ' can-chu-y' :
    (state === 'missing' ? ' thieu-du-lieu' : (state === 'ok' || state === 'ready' ? ' on-dinh' : ''));
};
U.htmlHangCanXuLy = function (a) {
  return '<article class="tq-viec muc-' + U.esc(a.severity) + '" data-alert-key="' + U.esc(a.dedupeKey) + '">' +
    '<div class="tq-viec-noi"><span class="tq-viec-scope"><i class="muc-dau" aria-hidden="true"></i>P' + a.priority + ' · ' + U.nhanUuTien(a.priority) + ' · ' + U.esc(a.scope) + '</span><h3>' + U.esc(a.title) + '</h3>' +
    '<p>' + U.esc(a.consequence) + '</p><div class="tq-viec-meta">' + U.htmlEtaViec(a) + '</div></div>' +
    U.htmlNutDenViec(a, 'tq-viec-cta') + '</article>';
};

