/* UI — lõi + tiện ích hiển thị (tách từ ui.js) */
'use strict';
var G = window.G, U = window.U = {}, APP = window.APP = window.APP || {};

U.man = 'tongquan';
U.pi = 0;
U.gal = null;
U.form = null;
U.moTin = {};
U.cho = {};        // số lượng đang gõ ở Chợ Thiên Hà, giữ qua các lần vẽ lại
U.sigCu = '';

U.esc = function (s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
U.st = function () { return window.ST; };
U.datPi = function (pi, st) {
  st = st || U.st();
  if (!st || !Array.isArray(st.planets) || !st.planets.length) return false;
  pi = Number(pi);
  if (!Number.isInteger(pi) || pi < 0 || pi >= st.planets.length) return false;
  if (pi !== U.pi) { U.pi = pi; U.form = null; }
  return true;
};
U.ht = function () {
  var st = U.st();
  if (!st || !Array.isArray(st.planets) || !st.planets.length) return null;
  if (!Number.isInteger(U.pi) || U.pi < 0 || U.pi >= st.planets.length) U.datPi(0, st);
  return st.planets[U.pi] || null;
};

U.toast = function (s, loai) {
  var d = document.createElement('div');
  d.className = 't' + (loai ? ' ' + loai : '');
  d.innerHTML = U.esc(s);
  document.getElementById('toast').appendChild(d);
  setTimeout(function () { d.style.opacity = 0; setTimeout(function () { d.remove(); }, 250); }, 3600);
};
var _hopEsc, _hopTrigger;
U.hop = function (td, html) {
  _hopTrigger = document.activeElement || null;
  document.getElementById('ht-td').textContent = td;
  document.getElementById('ht-noi').innerHTML = html;
  var hop = document.getElementById('hop-thoai');
  hop.style.display = 'flex';
  if (typeof hop.setAttribute === 'function') hop.setAttribute('aria-hidden', 'false');
  var first = document.querySelector('#ht-noi input:not([disabled]),#ht-noi select:not([disabled]),#ht-noi textarea:not([disabled]),#ht-noi button:not([disabled]),#hop-thoai .ht-dau button');
  if (first) first.focus();
  if (_hopEsc) document.removeEventListener('keydown', _hopEsc);
  _hopEsc = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); U.dongHop(); return; }
    if (e.key !== 'Tab' || typeof document.querySelectorAll !== 'function') return;
    var ds = document.querySelectorAll('#hop-thoai button:not([disabled]),#hop-thoai input:not([disabled]),#hop-thoai select:not([disabled]),#hop-thoai textarea:not([disabled]),#hop-thoai [tabindex]:not([tabindex="-1"])');
    if (!ds.length) return;
    var dau = ds[0], cuoi = ds[ds.length - 1];
    if (e.shiftKey && document.activeElement === dau) { e.preventDefault(); cuoi.focus(); }
    else if (!e.shiftKey && document.activeElement === cuoi) { e.preventDefault(); dau.focus(); }
  };
  document.addEventListener('keydown', _hopEsc);
};
U.dongHop = function () {
  var hop = document.getElementById('hop-thoai');
  hop.style.display = 'none';
  if (typeof hop.setAttribute === 'function') hop.setAttribute('aria-hidden', 'true');
  if (_hopEsc) { document.removeEventListener('keydown', _hopEsc); _hopEsc = null; }
  var ve = _hopTrigger; _hopTrigger = null;
  if (ve && typeof ve.focus === 'function') try { ve.focus(); } catch (e) { }
};

/* ======================================================================
 * TIỆN ÍCH HIỂN THỊ
 * ==================================================================== */
U.dem = function (ts, hau, liveKey) {
  var moc = U.mocThoiGian ? U.mocThoiGian(ts) : (Number.isFinite(Number(ts)) && Number(ts) > 0 ? Number(ts) : null);
  if (moc === null) return '<span class="mo">Chưa có dữ liệu</span>' + (hau || '');
  return '<time class="dem sz" data-t="' + Math.round(moc) + '"' +
    (liveKey ? ' data-live="' + U.esc(liveKey) + '" aria-live="off"' : '') + '>' +
    G.tg(moc - U.st().now) + '</time>' + (hau || '');
};
U.chamRes = function (r) {
  return '<i class="res-dot" aria-hidden="true" style="background:' + r.mau + '"></i>';
};
U.gia = function (cost, p, st) {
  var out = [], k;
  for (k in cost) {
    if (!cost[k]) continue;
    var r = G.byId(G.RES, k);
    var co = (k === 'galana') ? st.galana : (k === 'tech' ? st.techPts : (p.res[k] || 0));
    var thieu = co < cost[k];
    out.push('<span class="res-nhan ' + (thieu ? 'thieu' : '') + '">' + U.chamRes(r) +
      U.esc(r.ten) + ': ' + G.so(cost[k]) + '</span>');
  }
  return out.join(' &middot; ');
};
U.dsRes = function (o, chiSo) {
  var out = [], k;
  for (k in o) {
    if (!o[k]) continue;
    var r = G.byId(G.RES, k);
    if (!r) continue;
    out.push('<span class="res-nhan">' + U.chamRes(r) + (chiSo ? '' : U.esc(r.ten) + ' ') + G.so(o[k]) + '</span>');
  }
  return out.length ? out.join(' &middot; ') : '<span class="mo">—</span>';
};
U.htTheoKey = function (key) {
  var st = U.st();
  for (var i = 0; st && i < (st.planets || []).length; i++)
    if (U.keyHanhTinh(st.planets[i]) === key) return st.planets[i];
  return null;
};
U.bt = function (st) { return st.baoTri || {
  nextAt: st.nextMaint, cycle: st.soChuKy || 0,
  missStreak: st.noBaoTri > 0 ? 1 : 0, arrearsGalana: st.noBaoTri || 0
}; };
U.ds = function (p) { return p.danSu || {
  population: 250000, supportBp: 10000, taxBp: 400,
  foodDemandCycle: 0, foodShortfallCycle: 0
}; };
U.bp = function (n) {
  n = Math.round(Number(n) || 0) / 100;
  return (Math.round(n * 100) / 100).toLocaleString('vi-VN') + '%';
};
U.ncConLai = function (q) {
  var out = {}, tong = q.totalCost || {}, da = q.paidCost || {};
  for (var k in tong) if ((tong[k] || 0) > (da[k] || 0)) out[k] = (tong[k] || 0) - (da[k] || 0);
  return out;
};
U.ncKyTiep = function (q) {
  var out = {}, con = U.ncConLai(q), n = Math.max(1, q.installmentsLeft || 0);
  for (var k in con) out[k] = Math.ceil(con[k] / n);
  return out;
};
U.dsTau = function (o) {
  var out = [], k;
  for (k in o) if (o[k]) { var u = G.UNIT(k); out.push(U.esc(u ? u.ten : k) + ' <b>×' + G.so(o[k]) + '</b>'); }
  return out.length ? out.join(', ') : '<span class="mo">không có</span>';
};
U.tongDonVi = function (o) {
  var n = 0;
  o = o && typeof o === 'object' ? o : {};
  for (var k in o) n += Math.max(0, Number(o[k]) || 0);
  return n;
};
/* Fingerprint chỉ thuộc presentation state: giữ focus đúng operation và nhận
 * ra control cũ trong snapshot client, không ghi vào save hoặc action payload. */
U.bamKhoa = function (s) {
  s = String(s || '');
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + '-' + s.length.toString(36);
};
U.vectorKhoa = function (o) {
  var out = [], keys = Object.keys(o && typeof o === 'object' ? o : {}).sort();
  for (var i = 0; i < keys.length; i++) out.push([keys[i], Number(o[keys[i]]) || 0]);
  return out;
};
U.khoaHangDoi = function (loai, q) {
  q = Array.isArray(q) ? q : [];
  return U.bamKhoa(JSON.stringify(q.map(function (m) {
    m = m || {};
    return loai === 'build'
      ? [String(m.id || ''), Math.max(0, Number(m.n) || 0), Math.max(0, Number(m.tg) || 0), U.vectorKhoa(m.cost)]
      : [String(m.id || ''), Math.max(0, Number(m.tEach) || 0), U.vectorKhoa(m.cost1)];
  })));
};
U.khoaNghienCuu = function (q) {
  if (!q) return '';
  return U.bamKhoa(JSON.stringify([String(q.id || ''), Math.max(0, Number(q.lv) || 0), String(q.planetKey || ''),
    Math.max(0, Number(q.startedAt) || 0)]));
};
U.toaDoHopLe = function (c) {
  return !!c && ['g', 'h', 'p'].every(function (k) {
    var n = Number(c[k]); return Number.isFinite(n) && n > 0;
  });
};
U.keyHanhTinh = function (p) {
  if (!p || !U.toaDoHopLe(p.c)) return null;
  try { return String(G.tdKey ? G.tdKey(p.c) : [p.c.g, p.c.h, p.c.p].join(':')); }
  catch (e) { return null; }
};
U.toaDoStr = function (c) {
  if (!U.toaDoHopLe(c)) return 'Chưa có dữ liệu tọa độ';
  try { return G.tdStr(c); } catch (e) { return 'Chưa có dữ liệu tọa độ'; }
};
U.piTheoKey = function (st, key) {
  var ps = st && Array.isArray(st.planets) ? st.planets : [];
  key = String(key || '').replace(/^\[|\]$/g, '');
  for (var i = 0; i < ps.length; i++) {
    var pKey = U.keyHanhTinh(ps[i]);
    if (!pKey) continue;
    if (String(pKey) === key) return i;
  }
  return -1;
};
U.scopeHanhTinh = function (p) {
  if (!p) return 'Chưa có dữ liệu';
  var ten = String(p.ten || 'Hành tinh chưa đặt tên');
  return U.toaDoHopLe(p.c) ? ten + ' ' + U.toaDoStr(p.c) : ten + ' · Chưa có dữ liệu tọa độ';
};
U.mocThoiGian = function (v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
U.alertLaTanCong = function (a) {
  return !!a && (a.source === 'npc_inbound_attack' || a.source === 'pvp_inbound_attack');
};

/* Presentation model thuần text. Renderer là nơi duy nhất được escape/ghép HTML. */
U.tinhViecCanXuLy = function (st) {
  st = st || U.st();
  if (!st) return [];
  var ps = Array.isArray(st.planets) ? st.planets : [];
  var out = [], seen = Object.create(null);
  function pTai(pi) { return Number.isInteger(pi) && pi >= 0 && pi < ps.length ? ps[pi] : null; }
  function them(a) {
    if (!a || !a.dedupeKey || !a.action) return;
    var normalized = {
      id: String(a.id), source: String(a.source), priority: a.priority,
      severity: String(a.severity), scope: String(a.scope),
      pi: Number.isInteger(a.pi) && a.pi >= 0 ? a.pi : null,
      title: String(a.title), consequence: String(a.consequence),
      etaAt: U.mocThoiGian(a.etaAt),
      action: {
        label: String(a.action.label), man: String(a.action.man),
        pi: Number.isInteger(a.action.pi) && a.action.pi >= 0 ? a.action.pi : null
      },
      dedupeKey: String(a.dedupeKey)
    };
    if (seen[normalized.dedupeKey] !== undefined) {
      var old = out[seen[normalized.dedupeKey]];
      var etaMoi = Number.isFinite(normalized.etaAt) ? normalized.etaAt : Infinity;
      var etaCu = Number.isFinite(old.etaAt) ? old.etaAt : Infinity;
      if (normalized.priority < old.priority || (normalized.priority === old.priority && etaMoi < etaCu))
        out[seen[normalized.dedupeKey]] = normalized;
      return;
    }
    seen[normalized.dedupeKey] = out.length;
    out.push(normalized);
  }
  function khoaSuKien(prefix, x, fallback) {
    return prefix + ':' + String(x && x.id !== undefined && x.id !== null ? x.id : fallback);
  }
  var i;

  /* P0 — tấn công thật, sort theo ETA ở cuối hàm. */
  var npc = Array.isArray(st.toi) ? st.toi : [];
  for (i = 0; i < npc.length; i++) {
    var w = npc[i], piNpc = Number.isInteger(w.pi) && w.pi >= 0 && w.pi < ps.length ? w.pi : -1;
    var pNpc = pTai(piNpc), tenNpc = w.ten || 'Hạm đội không rõ danh tính';
    them({
      id: khoaSuKien('npc-attack', w, i), source: 'npc_inbound_attack', priority: 0, severity: 'danger',
      scope: pNpc ? U.scopeHanhTinh(pNpc) : 'Mục tiêu chưa xác định · Chưa có dữ liệu', pi: piNpc,
      title: tenNpc + ' đang tấn công ' + (pNpc ? pNpc.ten : 'một mục tiêu chưa xác định'),
      consequence: 'Hạm đội phòng thủ và tài nguyên tại mục tiêu có thể bị tổn thất khi đối phương tới.',
      etaAt: Number(w.den_t), action: { label: 'Mở Hạm Đội', man: 'hamdoi', pi: piNpc },
      dedupeKey: khoaSuKien('npc-attack', w, i)
    });
  }
  var pvp = Array.isArray(st.pvpToi) ? st.pvpToi : [];
  for (i = 0; i < pvp.length; i++) {
    var q = pvp[i], piPvp = U.piTheoKey(st, q.den), pPvp = pTai(piPvp);
    if (q.nv === 'attack') {
      var khoaPvp = khoaSuKien('pvp-attack', q, [q.tu, q.den, q.ten, i].join(':'));
      them({
        id: khoaPvp, source: 'pvp_inbound_attack', priority: 0, severity: 'danger',
        scope: piPvp >= 0 ? U.scopeHanhTinh(pPvp) : 'Mục tiêu chưa xác định · Chưa có dữ liệu', pi: piPvp,
        title: (q.ten || 'Một chỉ huy') + ' đang tấn công ' + (piPvp >= 0 && pPvp ? pPvp.ten : 'một mục tiêu chưa xác định'),
        consequence: 'Trận đánh sẽ xử lý khi hạm đội tới; hãy kiểm tra lực lượng đang đậu và phương án rút hạm.',
        etaAt: Number(q.den_t), action: { label: 'Mở Hạm Đội', man: 'hamdoi', pi: piPvp },
        dedupeKey: khoaPvp
      });
    }
  }

  /* P1 — bảo trì, thực phẩm, điện, nghiên cứu retry. */
  var bt = U.bt(st);
  if (bt.arrearsGalana > 0) them({
    id: 'maintenance-debt', source: 'maintenance_debt', priority: 1, severity: 'warning',
    scope: 'Toàn đế quốc', pi: null, title: 'Nợ bảo trì đế quốc',
    consequence: 'Cần đủ ' + G.so(bt.arrearsGalana) + ' Galana ở checkpoint kế tiếp; nghiên cứu, dân số và công trình có thể chịu hậu quả.',
    etaAt: null, action: { label: 'Mở Tài Chính', man: 'taichinh', pi: null }, dedupeKey: 'maintenance-debt'
  });
  for (i = 0; i < ps.length; i++) {
    var p = ps[i], dan = p && p.danSu, scope = U.scopeHanhTinh(p);
    var pKey = U.keyHanhTinh(p) || 'pi-' + i;
    if (dan && dan.foodShortfallCycle > 0) them({
      id: 'food-deficit:' + pKey, source: 'food_deficit', priority: 1, severity: 'warning', scope: scope, pi: i,
      title: p.ten + ' đang thiếu Thực Phẩm trong chu kỳ',
      consequence: 'Dân số và mức ủng hộ sẽ chịu ảnh hưởng ở checkpoint kế tiếp nếu thiếu hụt tiếp diễn.',
      etaAt: null, action: { label: 'Mở Tài Nguyên', man: 'tainguyen', pi: i }, dedupeKey: 'food-deficit:' + pKey
    });
    var san = null;
    if (p && p.res && p.b) try { san = G.sanLuong(st, p); } catch (eSan) { san = null; }
    if (san && san.hs < 1) them({
      id: 'power-deficit:' + pKey, source: 'power_deficit', priority: 1, severity: 'warning', scope: scope, pi: i,
      title: p.ten + ' không đủ điện',
      consequence: 'Hệ số sản xuất hiện chỉ đạt ' + Math.max(0, Math.round(san.hs * 100)) + '%; các công trình khai thác đang chạy dưới công suất.',
      etaAt: null, action: { label: 'Mở Tài Nguyên', man: 'tainguyen', pi: i }, dedupeKey: 'power-deficit:' + pKey
    });
  }
  if (st.ncQueue && st.ncQueue.status === 'retry') {
    var piNc = U.piTheoKey(st, st.ncQueue.planetKey), nc = G.R(st.ncQueue.id);
    var khoaNc = 'research-retry:' + String(st.ncQueue.planetKey || 'empire') + ':' + st.ncQueue.id;
    them({
      id: khoaNc, source: 'research_retry', priority: 1, severity: 'warning',
      scope: piNc >= 0 ? U.scopeHanhTinh(pTai(piNc)) : 'Chưa xác định hành tinh chủ trì · Chưa có dữ liệu', pi: piNc,
      title: 'Nghiên cứu ' + (nc ? nc.ten : st.ncQueue.id) + ' đang chờ thử lại',
      consequence: 'Đề tài đã lỡ một kỳ cấp vốn và chỉ tiếp tục ở nhịp bảo trì kế tiếp.',
      etaAt: null, action: { label: 'Mở Nghiên Cứu', man: 'nghiencuu', pi: piNc },
      dedupeKey: khoaNc
    });
  }

  /* P2 — ngưỡng sức chứa và hàng đợi. */
  for (i = 0; i < ps.length; i++) {
    var p2 = ps[i], key2 = U.keyHanhTinh(p2) || 'pi-' + i;
    var cap = null, maxRatio = 0, maxRes = null;
    if (p2 && p2.res) try { cap = G.dungTich(p2); } catch (eCap) { cap = null; }
    if (cap) for (var ri = 0; ri < G.RES_HANH_TINH.length; ri++) {
      var rid = G.RES_HANH_TINH[ri], ratio = Number(cap[rid]) > 0 ? Number(p2.res[rid] || 0) / Number(cap[rid]) : 0;
      if (ratio > maxRatio) { maxRatio = ratio; maxRes = G.byId(G.RES, rid); }
    }
    if (maxRatio >= 0.9) them({
      id: 'storage-capacity:' + key2, source: 'storage_capacity', priority: 2, severity: 'warning',
      scope: U.scopeHanhTinh(p2), pi: i,
      title: 'Kho ' + (maxRes ? maxRes.ten : 'tài nguyên') + ' tại ' + p2.ten + (maxRatio >= 1 ? ' đã đầy' : ' sắp đầy'),
      consequence: 'Sản lượng tiếp theo có thể không được tích trữ nếu không mở rộng kho hoặc sử dụng bớt tài nguyên.',
      etaAt: null, action: { label: 'Mở Tài Nguyên', man: 'tainguyen', pi: i }, dedupeKey: 'storage-capacity:' + key2
    });
    if (p2 && Array.isArray(p2.qB) && p2.qB.length >= 5) them({
      id: 'build-queue-capacity:' + key2, source: 'build_queue_capacity', priority: 2, severity: 'info',
      scope: U.scopeHanhTinh(p2), pi: i, title: 'Hàng đợi xây dựng tại ' + p2.ten + ' đã đầy',
      consequence: 'Không thể thêm công trình cho tới khi một lô hoàn tất hoặc được huỷ.',
      etaAt: null, action: { label: 'Mở Công Trình', man: 'congtrinh', pi: i }, dedupeKey: 'build-queue-capacity:' + key2
    });
    var datDaDung = 0, datToiDa = 0;
    try {
      datDaDung = G.oDaDungDuKien ? G.oDaDungDuKien(p2) : (G.oDaDung ? G.oDaDung(p2) : 0);
      datToiDa = G.oToiDa ? G.oToiDa(p2) : 0;
    } catch (eDat) { datDaDung = datToiDa = 0; }
    if (datToiDa > 0 && datDaDung >= datToiDa) them({
      id: 'land-capacity:' + key2, source: 'land_capacity', priority: 2, severity: 'info',
      scope: U.scopeHanhTinh(p2), pi: i, title: p2.ten + ' đã dùng hết ô đất',
      consequence: 'Không thể mở rộng thêm công trình nếu chưa tăng giới hạn đất hoặc giải phóng kế hoạch xây.',
      etaAt: null, action: { label: 'Mở Công Trình', man: 'congtrinh', pi: i }, dedupeKey: 'land-capacity:' + key2
    });
    var dan2 = p2 && p2.danSu, danToiDa = 0;
    try { danToiDa = G.sucChuaDan ? G.sucChuaDan(p2) : 0; } catch (eDan) { danToiDa = 0; }
    if (dan2 && danToiDa > 0 && Number(dan2.population) >= danToiDa) them({
      id: 'population-capacity:' + key2, source: 'population_capacity', priority: 2, severity: 'info',
      scope: U.scopeHanhTinh(p2), pi: i, title: 'Dân số ' + p2.ten + ' đã chạm sức chứa',
      consequence: 'Tăng sức chứa trước khi chu kỳ tiếp theo làm dân số ngừng phát triển.',
      etaAt: null, action: { label: 'Mở Công Trình', man: 'congtrinh', pi: i }, dedupeKey: 'population-capacity:' + key2
    });
  }
  var khe = 0;
  try { khe = G.khe ? G.khe(st) : 0; } catch (eKhe) { khe = 0; }
  if (khe > 0 && (st.fleets || []).length >= khe) them({
    id: 'fleet-capacity', source: 'fleet_capacity', priority: 2, severity: 'info', scope: 'Toàn đế quốc', pi: null,
    title: 'Toàn bộ khe hạm đội đang được sử dụng',
    consequence: 'Cần chờ một hạm đội trở về trước khi phát thêm nhiệm vụ.',
    etaAt: null, action: { label: 'Mở Hạm Đội', man: 'hamdoi', pi: null }, dedupeKey: 'fleet-capacity'
  });

  /* P3 — thông tin có ích nhưng không chen lên việc khẩn. */
  for (i = 0; i < pvp.length; i++) {
    var q3 = pvp[i];
    if (q3.nv === 'attack') continue;
    var piThan = U.piTheoKey(st, q3.den), pThan = pTai(piThan);
    var khoaThan = khoaSuKien('friendly-inbound', q3, [q3.tu, q3.den, q3.ten, i].join(':'));
    them({
      id: khoaThan, source: 'friendly_inbound', priority: 3, severity: 'info',
      scope: piThan >= 0 ? U.scopeHanhTinh(pThan) : 'Mục tiêu chưa xác định · Chưa có dữ liệu', pi: piThan,
      title: (q3.ten || 'Đồng minh') + (q3.nv === 'hold' ? ' đang tới đóng quân quỹ đạo' : ' đang chuyển hàng tới'),
      consequence: q3.nv === 'hold' ? 'Lực lượng này sẽ chi viện lớp quỹ đạo sau khi tới.' : 'Tài nguyên sẽ được bàn giao khi đoàn vận chuyển tới.',
      etaAt: Number(q3.den_t), action: { label: 'Mở Hạm Đội', man: 'hamdoi', pi: piThan }, dedupeKey: khoaThan
    });
  }
  var chuaDoc = 0;
  for (i = 0; i < (st.msgs || []).length; i++) if (!st.msgs[i].doc) chuaDoc++;
  if (chuaDoc) them({
    id: 'unread-messages', source: 'unread_messages', priority: 3, severity: 'info', scope: 'Toàn đế quốc', pi: null,
    title: G.so(chuaDoc) + ' tin chưa đọc', consequence: 'Chiến báo hoặc tin tình báo mới có thể thay đổi quyết định tiếp theo.',
    etaAt: null, action: { label: 'Mở Tin Nhắn', man: 'tinnhan', pi: null }, dedupeKey: 'unread-messages'
  });

  var thuTu = {
    npc_inbound_attack: 0, pvp_inbound_attack: 0,
    maintenance_debt: 10, food_deficit: 20, power_deficit: 30, research_retry: 40,
    storage_capacity: 50, build_queue_capacity: 60, land_capacity: 65, population_capacity: 66, fleet_capacity: 70,
    friendly_inbound: 80, unread_messages: 90
  };
  out.sort(function (a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.priority === 0 && a.etaAt !== b.etaAt) {
      var etaA = Number.isFinite(a.etaAt) ? a.etaAt : Infinity;
      var etaB = Number.isFinite(b.etaAt) ? b.etaAt : Infinity;
      if (etaA !== etaB) return etaA - etaB;
    }
    var sa = thuTu[a.source] === undefined ? 999 : thuTu[a.source];
    var sb = thuTu[b.source] === undefined ? 999 : thuTu[b.source];
    if (sa !== sb) return sa - sb;
    if (a.scope !== b.scope) return a.scope < b.scope ? -1 : 1;
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
  return out;
};

U.tomTatHanhTinh = function (st, p, pi, alerts) {
  var chua = 'Chưa có dữ liệu';
  function thieu() { return { state: 'missing', label: chua }; }
  if (!st || !p) return {
    pi: Number.isInteger(pi) ? pi : null, key: '', name: chua, coords: '', capital: false,
    power: thieu(), storage: thieu(),
    population: thieu(), support: thieu(),
    build: { state: 'missing', label: chua, count: 0, etaAt: null },
    ships: { state: 'missing', label: chua, stationed: 0, queued: 0 },
    research: { state: 'missing', label: chua, etaAt: null },
    alert: { state: 'missing', label: chua, count: 0, priority: null }
  };
  var key = 'pi-' + pi, coords = '';
  var keyToaDo = U.keyHanhTinh(p);
  if (keyToaDo) { key = keyToaDo; coords = U.toaDoStr(p.c); }
  else coords = chua + ' tọa độ';

  var power = thieu(), storage = thieu(), san = null, cap = null, maxRatio = 0, maxRes = null;
  if (p.res && p.b) {
    try { san = G.sanLuong(st, p); } catch (eSan) { san = null; }
    if (san && Number.isFinite(Number(san.hs))) {
      var powerState = Number(san.hs) < 1 ? 'deficit' : 'ok';
      power = {
        state: powerState,
        label: (powerState === 'deficit' ? 'Thiếu điện · ' : 'Đủ điện · ') + Math.max(0, Math.round(Number(san.hs) * 100)) + '%'
      };
    }
    try { cap = G.dungTich(p); } catch (eCap) { cap = null; }
    if (cap) {
      for (var i = 0; i < G.RES_HANH_TINH.length; i++) {
        var rid = G.RES_HANH_TINH[i], muc = Number(cap[rid]);
        var ratio = muc > 0 ? Number(p.res[rid] || 0) / muc : 0;
        if (ratio > maxRatio) { maxRatio = ratio; maxRes = G.byId(G.RES, rid); }
      }
      var storageState = maxRatio >= 1 ? 'danger' : (maxRatio >= 0.9 ? 'warning' : 'ok');
      var storageLabel = storageState === 'danger' ? 'Đã đầy' : (storageState === 'warning' ? 'Sắp đầy' : 'Ổn định');
      if (maxRes && storageState !== 'ok') storageLabel += ' · ' + maxRes.ten;
      storage = { state: storageState, label: storageLabel, id: maxRes ? maxRes.id : null };
    }
  }

  var population = thieu(), support = thieu(), dan = p.danSu;
  if (dan && typeof dan === 'object') {
    var sucChua = 0;
    try { sucChua = G.sucChuaDan ? Number(G.sucChuaDan(p)) : 0; } catch (eDan) { sucChua = 0; }
    if (sucChua > 0 && Number.isFinite(Number(dan.population))) {
      var popRatio = Number(dan.population) / sucChua;
      var popState = popRatio >= 1 ? 'capacity' : (popRatio >= 0.9 ? 'warning' : 'ok');
      population = { state: popState, label: G.soNgan(dan.population) + ' / ' + G.soNgan(sucChua) };
    }
    if (Number.isFinite(Number(dan.supportBp))) {
      var supportState = Number(dan.supportBp) < 5000 ? 'danger' : (Number(dan.supportBp) < 8000 ? 'warning' : 'ok');
      support = { state: supportState, label: U.bp(dan.supportBp) + ' ủng hộ' };
    }
  }

  var qBHopLe = Array.isArray(p.qB), qB = qBHopLe ? p.qB : [], firstB = qB[0] || null;
  var tenB = firstB && G.B(firstB.id), build = qBHopLe ? {
    state: firstB ? 'active' : 'idle',
    label: firstB ? ((tenB ? tenB.ten : firstB.id) + ' ×' + G.so(firstB.n || 0)) : 'Rảnh',
    count: qB.length, etaAt: firstB ? U.mocThoiGian(firstB.xong) : null
  } : { state: 'missing', label: chua, count: 0, etaAt: null };

  var qSHopLe = Array.isArray(p.qS), shipsHopLe = p.ships && typeof p.ships === 'object';
  var qS = qSHopLe ? p.qS : [], queued = 0, stationed = shipsHopLe ? U.tongDonVi(p.ships) : 0;
  for (i = 0; i < qS.length; i++) queued += Math.max(0, Number(qS[i].n) || 0);
  var ships = qSHopLe && shipsHopLe ? {
    state: qS.length ? 'building' : (stationed ? 'ready' : 'idle'),
    label: G.so(stationed) + ' đậu · ' + G.so(queued) + ' đang đóng', stationed: stationed, queued: queued
  } : { state: 'missing', label: chua, stationed: 0, queued: 0 };

  var nc = st.ncQueue || null, ncPi = nc ? U.piTheoKey(st, nc.planetKey) : -1;
  var ncTaiDay = !!nc && ncPi >= 0 && ncPi === pi, defNc = ncTaiDay ? G.R(nc.id) : null;
  var research;
  if (!nc) research = { state: 'idle', label: 'Không chủ trì', etaAt: null };
  else if (ncPi < 0) research = { state: 'missing', label: 'Chưa xác định hành tinh chủ trì', etaAt: null };
  else if (!ncTaiDay) research = { state: 'idle', label: 'Không chủ trì', etaAt: null };
  else research = {
    state: String(nc.status || 'active'),
    label: (defNc ? defNc.ten : nc.id) + ' → cấp ' + G.so(nc.lv || 0),
    etaAt: U.mocThoiGian(nc.finishAt)
  };
  var dsAlert = alerts || U.tinhViecCanXuLy(st), taiDay = [];
  for (i = 0; i < dsAlert.length; i++) if (dsAlert[i].pi === pi) taiDay.push(dsAlert[i]);
  return {
    pi: pi, key: key, name: String(p.ten || 'Hành tinh chưa đặt tên'), coords: coords, capital: !!p.thuDo,
    power: power, storage: storage, population: population, support: support,
    build: build, ships: ships, research: research,
    alert: {
      state: taiDay.length ? taiDay[0].severity : 'ok',
      label: taiDay.length ? ('P' + taiDay[0].priority + ' · ' + G.so(taiDay.length) + ' việc') : 'Bình thường',
      count: taiDay.length, priority: taiDay.length ? taiDay[0].priority : null
    }
  };
};

U.sigTrangThaiUI = function (st) {
  st = st || U.st();
  if (!st) return '';
  var alerts = U.tinhViecCanXuLy(st), bt = U.bt(st), ps = st.planets || [];
  var tongQuanLive = U.man === 'tongquan';
  var sig = {
    nav: [U.man, U.workspace, U.pi, APP.mp ? 'mp' : 'solo'],
    empire: [ps.length, (st.msgs || []).length, (st.fleets || []).length, (st.toi || []).length,
      bt.cycle || 0, bt.missStreak || 0, bt.arrearsGalana > 0, (st.nk || []).length,
      (st.nk && st.nk[0]) ? [st.nk[0].t || 0, st.nk[0].s || ''] : null, st.lm ? st.lm.ten : ''],
    alerts: alerts.map(function (a) {
      return [a.dedupeKey, a.priority, a.severity, a.scope, a.pi, a.title, a.consequence,
        Number.isFinite(a.etaAt), a.action.man, a.action.label];
    }),
    planets: [], fleets: [], inbound: [], garrisons: [], messages: [],
    research: st.ncQueue ? [st.ncQueue.id, st.ncQueue.status, st.ncQueue.planetKey || '',
      st.ncQueue.installmentsLeft || 0, U.khoaNghienCuu(st.ncQueue)] : null,
    stats: st.stats ? [st.stats.thang || 0, st.stats.thua || 0, st.stats.chuyenBay || 0] : []
  };
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i] || {}, t = U.tomTatHanhTinh(st, p, i, alerts), qb = [], qs = [];
    for (var j = 0; j < (Array.isArray(p.qB) ? p.qB : []).length; j++) qb.push([(p.qB[j] || {}).id, (p.qB[j] || {}).n || 0]);
    for (j = 0; j < (Array.isArray(p.qS) ? p.qS : []).length; j++) qs.push([
      (p.qS[j] || {}).id, tongQuanLive ? null : ((p.qS[j] || {}).n || 0)
    ]);
    var resDay = [];
    if (p.res && p.b) try {
      var capSig = G.dungTich(p);
      for (j = 0; j < G.RES_HANH_TINH.length; j++) {
        var ridSig = G.RES_HANH_TINH[j], mucSig = Number(capSig && capSig[ridSig]);
        resDay.push([ridSig, mucSig > 0 ? Number(p.res[ridSig] || 0) >= mucSig : null]);
      }
    } catch (eCapSig) { resDay = []; }
    function loaiCoSan(o) {
      var ds = [];
      for (var idDv in (o || {})) if (Number(o[idDv]) > 0) ds.push(idDv);
      return ds.sort();
    }
    function loaiSoLuong(o) {
      if (tongQuanLive) return [];
      var ds = [];
      for (var idDv in (o || {})) if (Number(o[idDv]) > 0) ds.push([idDv, Number(o[idDv])]);
      return ds.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
    }
    sig.planets.push([
      t.key, t.name, t.capital, t.power.state, t.storage.state, t.population.state, t.support.state,
      t.build.state, t.ships.state, t.research.state, t.storage.id || '', resDay,
      t.alert.priority, t.alert.count, qb, qs,
      loaiCoSan(p.ships), loaiCoSan(p.def), loaiCoSan(p.mis), loaiCoSan(p.linh),
      loaiSoLuong(p.ships), loaiSoLuong(p.def), loaiSoLuong(p.mis), loaiSoLuong(p.linh)
    ]);
  }
  for (i = 0; i < (st.fleets || []).length; i++) {
    var f = st.fleets[i];
    sig.fleets.push([f.id, f.mission, f.pha, f.doiHuong || 0,
      f.tu ? U.toaDoStr(f.tu) : '', f.den ? U.toaDoStr(f.den) : '', U.tongDonVi(f.ships || {}),
      !!(f.pha === 'giu' && f.tiepNL_t && f.giuDen_t && f.tiepNL_t < f.giuDen_t)]);
  }
  for (i = 0; i < (st.pvpToi || []).length; i++) {
    var q = st.pvpToi[i]; sig.inbound.push([q.id, q.nv, q.tu, q.den]);
  }
  for (i = 0; i < (st.pvpGiu || []).length; i++) {
    var g = st.pvpGiu[i]; sig.garrisons.push([g.id, g.den || g.planetKey || '', U.tongDonVi(g.ships || {}),
      !!(g.tiepNL_t && g.giuDen_t && g.tiepNL_t < g.giuDen_t)]);
  }
  for (i = 0; i < Math.min(8, (st.msgs || []).length); i++) sig.messages.push([st.msgs[i].id, !!st.msgs[i].doc]);
  return JSON.stringify(sig);
};

