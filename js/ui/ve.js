/* UI — vẽ & vòng cập nhật live (tách từ ui.js) */
'use strict';
var G = window.G, U = window.U, APP = window.APP;

/* ======================================================================
 * VẼ & CẬP NHẬT
 * ==================================================================== */
U._nguCanhDaVe = '';
U.nguCanhVe = function () {
  var phu = '';
  if (U.man === 'taichinh') phu = 'tab:' + (U.tabTC || '');
  else if (U.man === 'xephang') phu = 'loai:' + (U.xhLoai || '');
  else if (U.man === 'thienha' && U.gal) phu = 'he:' + U.gal.g + ':' + U.gal.h;
  return [U.man, U.pi, phu].join('|');
};
U.nhoTruongDangNhap = function (root) {
  var el = document.activeElement;
  if (!root || !el || !el.id) return null;
  if (typeof root.contains === 'function' && !root.contains(el)) return null;
  var tag = String(el.tagName || '').toLowerCase();
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return null;
  var type = String(el.type || '').toLowerCase();
  if (el.hidden || (tag === 'input' && (type === 'hidden' || type === 'file'))) return null;
  var o = { id: el.id, tag: tag, type: type };
  if ('value' in el) o.value = el.value;
  if ('checked' in el) o.checked = !!el.checked;
  try {
    if (typeof el.selectionStart === 'number') {
      o.selectionStart = el.selectionStart;
      o.selectionEnd = el.selectionEnd;
      o.selectionDirection = el.selectionDirection || 'none';
    }
  } catch (e) { /* input number/range không hỗ trợ selection */ }
  return o;
};
U.traTruongDangNhap = function (root, o) {
  if (!root || !o) return;
  var el = document.getElementById(o.id);
  if (!el || (typeof root.contains === 'function' && !root.contains(el))) return;
  if (String(el.tagName || '').toLowerCase() !== o.tag || String(el.type || '').toLowerCase() !== o.type) return;
  if (el.disabled || el.hidden || (el.closest && el.closest('[hidden],[inert],[aria-hidden="true"]'))) return;
  if (typeof el.getClientRects === 'function' && !el.getClientRects().length) return;
  if (typeof window.getComputedStyle === 'function') {
    var cs = window.getComputedStyle(el);
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return;
  }
  if (o.tag === 'select' && o.value !== undefined && el.options) {
    var coLuaChon = false;
    for (var i = 0; i < el.options.length; i++) if (el.options[i].value === o.value) { coLuaChon = true; break; }
    if (!coLuaChon) return;
  }
  var daDoi = false;
  if (o.value !== undefined && el.value !== o.value) { el.value = o.value; daDoi = true; }
  if (o.checked !== undefined && el.checked !== o.checked) { el.checked = o.checked; daDoi = true; }
  /* Một số trường có phần xem trước phụ thuộc value; đồng bộ lại nó sau khi
     khôi phục. Không phát lại ở f-mission vì handler của select này chủ động
     render lại toàn màn. */
  if (daDoi && o.id !== 'f-mission' && typeof el.dispatchEvent === 'function' && typeof window.Event === 'function')
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el = document.getElementById(o.id);
  if (!el || (typeof root.contains === 'function' && !root.contains(el))) return;
  if (String(el.tagName || '').toLowerCase() !== o.tag || String(el.type || '').toLowerCase() !== o.type) return;
  if (el.disabled || el.hidden || (el.closest && el.closest('[hidden],[inert],[aria-hidden="true"]'))) return;
  if (typeof el.getClientRects === 'function' && !el.getClientRects().length) return;
  if (typeof window.getComputedStyle === 'function') {
    var csSau = window.getComputedStyle(el);
    if (csSau && (csSau.display === 'none' || csSau.visibility === 'hidden')) return;
  }
  try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { } }
  if (o.selectionStart !== undefined && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(o.selectionStart, o.selectionEnd, o.selectionDirection); } catch (e3) { }
  }
};

U.nhoDieuKhienFocus = function () {
  var el = document.activeElement;
  if (!el || el === document.body) return null;
  var tag = String(el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return null;
  if (el.id) {
    var theoId = { id: el.id, tag: tag };
    if (el.id === 'nut-tinh-hinh-chinh' && typeof el.getAttribute === 'function')
      theoId.attrs = {
        'data-act': el.getAttribute('data-act'),
        'data-alert-key': el.getAttribute('data-alert-key'),
        'data-man': el.getAttribute('data-man'),
        'data-pi': el.getAttribute('data-pi')
      };
    return theoId;
  }
  if (typeof el.getAttribute !== 'function') return null;
  var act = el.getAttribute('data-act');
  if (!act) return null;
  var attrs = {};
  if (el.attributes && typeof el.attributes.length === 'number') {
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a && a.name && a.name.indexOf('data-') === 0) attrs[a.name] = a.value;
    }
  }
  if (!Object.keys(attrs).length) {
    var ds = ['data-act', 'data-man', 'data-workspace', 'data-id', 'data-tab', 'data-loai', 'data-fid', 'data-i',
      'data-dg', 'data-dh', 'data-td', 'data-m', 'data-tk', 'data-kenh', 'data-pi', 'data-alert-key',
      'data-queue-key', 'data-planet-key'];
    for (var j = 0; j < ds.length; j++) {
      var v = el.getAttribute(ds[j]);
      if (v !== null && v !== '') attrs[ds[j]] = v;
    }
  }
  return { tag: tag, attrs: attrs };
};
U.coTheFocus = function (el, tag) {
  if (!el || String(el.tagName || '').toLowerCase() !== tag || el.disabled || el.hidden) return false;
  if (el.closest && el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  if (typeof el.getClientRects === 'function' && !el.getClientRects().length) return false;
  if (typeof window.getComputedStyle === 'function') {
    var cs = window.getComputedStyle(el);
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
  }
  return true;
};
U.traDieuKhienFocus = function (o) {
  if (!o) return;
  var el = o.id ? document.getElementById(o.id) : null;
  if (el && o.attrs && typeof el.getAttribute === 'function')
    for (var ak in o.attrs) if (el.getAttribute(ak) !== o.attrs[ak]) { el = null; break; }
  if (el && !U.coTheFocus(el, o.tag)) el = null;
  if (!el && o.attrs && typeof document.querySelectorAll === 'function') {
    var ds = document.querySelectorAll('[data-act]');
    for (var i = 0; i < ds.length; i++) {
      var dung = String(ds[i].tagName || '').toLowerCase() === o.tag;
      for (var k in o.attrs) if (ds[i].getAttribute(k) !== o.attrs[k]) { dung = false; break; }
      if (dung && U.coTheFocus(ds[i], o.tag)) { el = ds[i]; break; }
    }
  }
  if (!el && o.id === 'nut-tinh-hinh-chinh') {
    el = document.getElementById('thanh-canh');
    if (!el || typeof el.focus !== 'function') return;
  }
  if (!el || (el.id !== 'thanh-canh' && !U.coTheFocus(el, o.tag))) return;
  try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { } }
};
U.nhoChiTietMo = function (root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  var ds = root.querySelectorAll('details[open][id]'), ids = [];
  for (var i = 0; i < ds.length; i++) ids.push(ds[i].id);
  return ids;
};
U.traChiTietMo = function (root, ids) {
  if (!root || !ids || !ids.length || typeof document.getElementById !== 'function') return;
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el && (!root.contains || root.contains(el))) el.open = true;
  }
};

U.sig = function () { return U.sigTrangThaiUI(U.st()); };

U.ve = function () {
  var st = U.st();
  if (!st) return;
  var root = document.getElementById('noidung');
  var nguCanh = U.nguCanhVe();
  var cungNguCanh = U._nguCanhDaVe === nguCanh;
  var truong = cungNguCanh ? U.nhoTruongDangNhap(root) : null;
  var dieuKhien = cungNguCanh && !truong ? U.nhoDieuKhienFocus() : null;
  var chiTietMo = cungNguCanh ? U.nhoChiTietMo(root) : [];
  document.getElementById('tt-res').innerHTML = U.thanhRes();
  U.veWorkspace(); U.veMenu(); U.veCanh(); U.veChonHT();
  var dauMan = document.getElementById('dau-man'), dauHtml = U.veDauMan();
  if (dauMan && dauMan.innerHTML !== dauHtml) dauMan.innerHTML = dauHtml;
  var f = U['m_' + U.man] || U.m_tongquan;
  root.innerHTML = f();
  document.getElementById('chan-tt').innerHTML =
    'Thiên Hà Đại Chiến — bản phục dựng ' + G.VERSION + ' · nguyên tác: Trần Châu Quốc Bình &amp; nhóm 3 người (phát triển từ 2004) · ' +
    'máy chủ tốc độ x' + G.C.TOC_DO_SERVER + ' · chu kỳ bảo trì 6 giờ';
  U.sigCu = U.sig();
  U._nguCanhDaVe = nguCanh;
  U.traChiTietMo(root, chiTietMo);
  U.traTruongDangNhap(root, truong);
  if (!truong) U.traDieuKhienFocus(dieuKhien);
};

U.giaTriLive = function (st, key, cache) {
  cache = cache || {};
  var m, p, q, i, t;
  function ketQua(kind, value) { return value === undefined || value === null ? null : { kind: kind, value: value }; }
  function hanhTinh(pi) { return Number.isInteger(pi) && pi >= 0 && pi < (st.planets || []).length ? st.planets[pi] : null; }
  function ham(id) {
    if (!cache.fleets) {
      cache.fleets = {};
      for (var fi = 0; fi < (st.fleets || []).length; fi++) cache.fleets[String(st.fleets[fi].id)] = st.fleets[fi];
    }
    return cache.fleets[String(id)] || null;
  }
  function giu(id) {
    if (!cache.garrisons) {
      cache.garrisons = {};
      for (var gi = 0; gi < (st.pvpGiu || []).length; gi++) cache.garrisons[String(st.pvpGiu[gi].id)] = st.pvpGiu[gi];
    }
    return cache.garrisons[String(id)] || null;
  }
  function summary(pi) {
    cache.alerts = cache.alerts || U.tinhViecCanXuLy(st);
    cache.summaries = cache.summaries || {};
    if (!cache.summaries[pi]) cache.summaries[pi] = U.tomTatHanhTinh(st, hanhTinh(pi), pi, cache.alerts);
    return cache.summaries[pi];
  }
  if ((m = /^alert\.(.+)\.eta$/.exec(key))) {
    cache.alerts = cache.alerts || U.tinhViecCanXuLy(st);
    cache.alertsById = cache.alertsById || {};
    if (!cache.alertsByIdDaTao) {
      for (i = 0; i < cache.alerts.length; i++) cache.alertsById[String(cache.alerts[i].id)] = cache.alerts[i];
      cache.alertsByIdDaTao = true;
    }
    return ketQua('time', cache.alertsById[m[1]] && cache.alertsById[m[1]].etaAt);
  }
  if ((m = /^matrix\.(build|research)\.(\d+)$/.exec(key))) {
    p = hanhTinh(+m[2]); if (!p) return null;
    t = summary(+m[2]);
    return ketQua('time', m[1] === 'build' ? t.build.etaAt : t.research.etaAt);
  }
  if ((m = /^operation\.(build|ship|research)\.(-?\d+|null)\.(\d+)(?:\.(count))?$/.exec(key))) {
    var piOp = m[2] === 'null' ? -1 : +m[2], idx = +m[3];
    if (m[1] === 'research') return ketQua('time', st.ncQueue && st.ncQueue.status !== 'retry' ? U.mocThoiGian(st.ncQueue.finishAt) : null);
    p = hanhTinh(piOp); if (!p) return null;
    q = m[1] === 'build' ? (p.qB || [])[idx] : (p.qS || [])[idx];
    if (!q) return null;
    if (m[4] === 'count') return ketQua('text', G.so(Math.max(0, Number(q.n) || 0)));
    return ketQua('time', m[1] === 'build' ? U.mocThoiGian(q.xong) : U.mocThoiGian(st.now + Math.max(0, Number(q.tLeft) || 0)));
  }
  if ((m = /^planet\.(\d+)\.(power|population|support|ships)$/.exec(key))) {
    p = hanhTinh(+m[1]); if (!p) return null;
    t = summary(+m[1]);
    return ketQua('text', t[m[2]].label);
  }
  if ((m = /^planet\.(\d+)\.ground\.html$/.exec(key))) {
    p = hanhTinh(+m[1]);
    return p && p.linh && typeof p.linh === 'object' ? ketQua('html', U.dsTau(p.linh)) : null;
  }
  if ((m = /^unit\.(\d+)\.(ship|mis|bo|def)\.(.+)\.summary$/.exec(key))) {
    p = hanhTinh(+m[1]); if (!p) return null;
    var loai = m[2], idDv = m[3], co = loai === 'ship' ? ((p.ships || {})[idDv] || 0) :
      (loai === 'mis' ? ((p.mis || {})[idDv] || 0) : (loai === 'bo' ? ((p.linh || {})[idDv] || 0) : ((p.def || {})[idDv] || 0)));
    var dang = G.dangDong ? G.dangDong(p, idDv) : 0;
    return ketQua('text', 'có ' + G.so(co) + (dang ? ' (+' + G.so(dang) + ')' : ''));
  }
  if ((m = /^planet\.(\d+)\.ship\.(.+)\.available$/.exec(key))) {
    p = hanhTinh(+m[1]);
    return p ? ketQua('number', Math.max(0, Number((p.ships || {})[m[2]]) || 0)) : null;
  }
  if (key === 'empire.points') {
    try { return ketQua('text', G.so(G.diem(st).tong)); } catch (eDiem) { return ketQua('text', 'Chưa có dữ liệu'); }
  }
  if (key === 'empire.population' || key === 'empire.support') {
    var tong = 0, dem = 0;
    for (i = 0; i < (st.planets || []).length; i++) if (st.planets[i] && st.planets[i].danSu) {
      var raw = key === 'empire.population' ? st.planets[i].danSu.population : st.planets[i].danSu.supportBp;
      if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) { tong += Number(raw); dem++; }
    }
    return ketQua('text', dem ? (key === 'empire.population' ? G.soNgan(tong) : U.bp(tong / dem)) : 'Chưa có dữ liệu');
  }
  if ((m = /^fleet\.(.+)\.(eta|refuel|cargo)$/.exec(key))) {
    var fl = ham(m[1]); if (!fl) return null;
    if (m[2] === 'cargo') return ketQua('html', U.dsRes(fl.cargo || {}));
    if (m[2] === 'refuel') return ketQua('time', U.mocThoiGian(fl.tiepNL_t));
    return ketQua('time', fl.pha === 've' ? U.mocThoiGian(fl.ve_t) : (fl.pha === 'giu' ? U.mocThoiGian(fl.giuDen_t) : U.mocThoiGian(fl.den_t)));
  }
  if ((m = /^garrison\.(.+)\.(leave|refuel)$/.exec(key))) {
    var qg = giu(m[1]); if (!qg) return null;
    return ketQua('time', U.mocThoiGian(m[2] === 'leave' ? qg.giuDen_t : qg.tiepNL_t));
  }
  return null;
};

U.live = function () {
  var st = U.st();
  if (!st) return;
  if (U.sig() !== U.sigCu) { U.ve(); return; }
  var p = U.ht(), s = null, i;
  if (p && p.res && p.b) try { s = G.sanLuong(st, p); } catch (eSan) { s = null; }
  var liveCache = {};
  var els = document.querySelectorAll('[data-live]');
  for (i = 0; i < els.length; i++) {
    var k = els[i].getAttribute('data-live'), v;
    if (k.indexOf('res.') === 0 && p && p.res) v = G.soNgan(p.res[k.slice(4)] || 0);
    else if (k.indexOf('rate.') === 0 && s && s.r) { var rk = k.slice(5); v = (s.r[rk] >= 0 ? '+' : '') + G.soNgan(s.r[rk]) + '/g'; }
    else if (k === 'galana') v = G.soNgan(st.galana);
    else if (k === 'tech') v = G.soNgan(st.techPts);
    else {
      var live = U.giaTriLive(st, k, liveCache);
      if (live && live.kind === 'time') {
        if (typeof els[i].setAttribute === 'function') els[i].setAttribute('data-t', Math.round(live.value));
      } else if (live && live.kind === 'html') {
        if (els[i].innerHTML !== live.value) els[i].innerHTML = live.value;
      } else if (live && live.kind === 'number') {
        var maxMoi = String(live.value);
        if (typeof els[i].setAttribute === 'function' && els[i].getAttribute('max') !== maxMoi) els[i].setAttribute('max', maxMoi);
      } else if (live) v = String(live.value);
    }
    if (v !== undefined && els[i].textContent !== v) els[i].textContent = v;
  }
  var ds = document.querySelectorAll('.dem');
  for (i = 0; i < ds.length; i++) {
    var t = +ds[i].getAttribute('data-t');
    if (Number.isFinite(t)) ds[i].textContent = G.tg(t - st.now);
  }
};

