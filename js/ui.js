/* THIÊN HÀ ĐẠI CHIẾN — giao diện */
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

/* ======================================================================
 * MÀN: TỔNG QUAN
 * ==================================================================== */
U.m_tongquan = function () {
  var st = U.st() || {}, planets = Array.isArray(st.planets) ? st.planets : [], p = U.ht();
  var d = null, bt = U.bt(st), dan = p && p.danSu ? p.danSu : null, Lp = null;
  try { d = G.diem(st); } catch (eDiem) { d = null; }
  if (p) try { Lp = G.loaiHT(st, p); } catch (eLoai) { Lp = null; }
  var fleets = Array.isArray(st.fleets) ? st.fleets : [], msgs = Array.isArray(st.msgs) ? st.msgs : [];
  var stats = st.stats || {}, maxThuocDia = null, kheHam = null, dangThamHiem = null;
  try { maxThuocDia = G.maxThuocDia(st); } catch (eMax) { maxThuocDia = null; }
  try { kheHam = G.khe(st); } catch (eKhe) { kheHam = null; }
  try { dangThamHiem = G.dangThamHiem(st); } catch (eTham) { dangThamHiem = null; }
  var alerts = U.tinhViecCanXuLy(st), top = alerts[0] || null, conLai = top ? alerts.slice(1) : alerts.slice();
  var summaries = [], i, j;
  for (i = 0; i < planets.length; i++) summaries.push(U.tomTatHanhTinh(st, planets[i], i, alerts));
  var tongDan = 0, tongUngHo = 0, coDan = 0;
  var coUngHo = 0;
  for (i = 0; i < planets.length; i++) if (planets[i] && planets[i].danSu) {
    var popTong = planets[i].danSu.population, ungHoTong = planets[i].danSu.supportBp;
    if (popTong !== null && popTong !== undefined && popTong !== '' && Number.isFinite(Number(popTong))) {
      tongDan += Number(popTong); coDan++;
    }
    if (ungHoTong !== null && ungHoTong !== undefined && ungHoTong !== '' && Number.isFinite(Number(ungHoTong))) {
      tongUngHo += Number(ungHoTong); coUngHo++;
    }
  }
  var h = '<div class="tongquan-workbench"><div class="tongquan-tren">';

  /* Attention Queue: top alert đã nằm trên strip nên không lặp lại ở đây. */
  h += '<section id="tq-can-xu-ly" class="panel tq-can-xu-ly"><h2>Cần xử lý <span class="tq-dem">' +
    (top ? G.so(conLai.length) + ' còn lại · 1 ở dải' : G.so(conLai.length)) + '</span></h2><div class="noi">';
  if (!conLai.length) {
    h += '<div class="tq-empty"><b>' + (top ? 'Việc ưu tiên nhất đang ở Dải tình hình.' : 'Không có việc cần xử lý.') + '</b>' +
      '<span>' + (top ? 'Không còn việc khác trong hàng đợi.' : 'Các hệ thống đang trong ngưỡng bình thường.') + '</span></div>';
  } else {
    var groups = [], groupByKey = {};
    for (i = 0; i < conLai.length; i++) {
      var a = conLai[i], gk = a.priority + '|' + a.scope;
      if (!groupByKey[gk]) { groupByKey[gk] = { priority: a.priority, scope: a.scope, items: [] }; groups.push(groupByKey[gk]); }
      groupByKey[gk].items.push(a);
    }
    var nhanP = ['Khẩn cấp', 'Cần xử lý', 'Cần chú ý', 'Thông tin'];
    h += '<div class="tq-viec-ds">';
    for (i = 0; i < groups.length; i++) {
      h += '<section class="tq-viec-nhom"><div class="tq-viec-nhom-tieu">P' + groups[i].priority + ' · ' + nhanP[groups[i].priority] + ' · ' + U.esc(groups[i].scope) + '</div>';
      for (j = 0; j < groups[i].items.length; j++) h += U.htmlHangCanXuLy(groups[i].items[j]);
      h += '</section>';
    }
    h += '</div>';
  }
  h += '</div></section>';

  /* Empire Snapshot nhỏ gọn, chỉ dùng dữ liệu thật. */
  var diemTong = d ? G.so(d.tong) : 'Chưa có dữ liệu';
  var diemPhu = d ? ('CT ' + G.so(d.ct) + ' · NC ' + G.so(d.nc)) : 'Chưa có dữ liệu';
  var quickDisabled = p ? '' : ' disabled aria-disabled="true"';
  h += '<section id="tq-snapshot" class="panel tq-snapshot"><h2>Toàn cảnh đế quốc</h2><div class="noi">' +
    '<div class="tq-so-luoi"><div><span>Điểm</span><b class="sz" data-live="empire.points">' + diemTong + '</b><small>' + diemPhu + '</small></div>' +
    '<div><span>Hành tinh</span><b class="sz">' + G.so(planets.length) + ' / ' + (maxThuocDia === null ? 'Chưa có dữ liệu' : G.so(maxThuocDia)) + '</b><small><span data-live="empire.population">' + (coDan ? G.soNgan(tongDan) : 'Chưa có dữ liệu') + '</span> dân</small></div>' +
    '<div><span>Hạm đang bay</span><b class="sz">' + G.so(fleets.length) + ' / ' + (kheHam === null ? 'Chưa có dữ liệu' : G.so(kheHam)) + '</b><small>' + (dangThamHiem === null ? 'Chưa có dữ liệu' : G.so(dangThamHiem) + ' thám hiểm') + '</small></div>' +
    '<div><span>Bảo trì</span><b class="sz">' + U.dem(bt.nextAt) + '</b><small>' + (bt.arrearsGalana > 0 ? 'Nợ ' + G.so(bt.arrearsGalana) + ' Galana' : 'Chu kỳ #' + G.so(bt.cycle + 1)) + '</small></div></div>' +
    '<div class="tq-snapshot-phu"><span>Ủng hộ trung bình <b data-live="empire.support">' + (coUngHo ? U.bp(tongUngHo / coUngHo) : 'Chưa có dữ liệu') + '</b></span>' +
    '<span>Trận <b>' + G.so(stats.thang || 0) + ' thắng / ' + G.so(stats.thua || 0) + ' thua</b></span></div>' +
    '<div class="tq-lenh-nhanh"><button class="nut nho" data-act="den-viec" data-man="congtrinh" data-pi="' + U.pi + '" data-alert-key="quick-build"' + quickDisabled + '>Xây dựng</button>' +
    '<button class="nut nho" data-act="den-viec" data-man="nghiencuu" data-pi="' + U.pi + '" data-alert-key="quick-research"' + quickDisabled + '>Nghiên cứu</button>' +
    '<button class="nut nho" data-act="den-viec" data-man="xuong" data-pi="' + U.pi + '" data-alert-key="quick-shipyard"' + quickDisabled + '>Đóng tàu</button>' +
    '<button class="nut nho" data-act="den-viec" data-man="thienha" data-pi="' + U.pi + '" data-alert-key="quick-galaxy"' + quickDisabled + '>Mở Thiên Hà</button></div>' +
    '</div></section></div>';

  /* Planet Matrix — bảng chỉ đọc, một hàng mỗi hành tinh. */
  h += '<section id="tq-ma-tran" class="panel tq-ma-tran" aria-labelledby="tq-ma-tran-title"><h2 id="tq-ma-tran-title">Ma trận hành tinh <span class="tq-dem">Toàn đế quốc</span></h2><div class="noi ma-tran-wrap"><table>' +
    '<caption class="sr-only">Trạng thái vận hành của từng hành tinh trong đế quốc</caption>' +
    '<thead><tr><th>Hành tinh</th><th>Điện</th><th>Kho</th><th>Dân / ủng hộ</th><th>Xây dựng</th><th>Tàu</th><th>Nghiên cứu</th><th>Cảnh báo</th></tr></thead><tbody>';
  var mobileMatrix = '<div class="tq-ma-tran-mobile">';
  for (i = 0; i < summaries.length; i++) {
    var t = summaries[i];
    h += '<tr class="ma-tran-hanh-tinh" data-pi="' + t.pi + '"><td data-label="Hành tinh"><b>' + U.esc(t.name) + '</b><small>' + U.esc(t.coords) + (t.capital ? ' · Thủ phủ' : '') + '</small></td>' +
      '<td data-label="Điện"><span data-live="planet.' + t.pi + '.power" class="tq-status' + U.lopTrangThai(t.power.state) + '">' + U.esc(t.power.label) + '</span></td>' +
      '<td data-label="Kho"><span class="tq-status' + U.lopTrangThai(t.storage.state) + '">' + U.esc(t.storage.label) + '</span></td>' +
      '<td data-label="Dân / ủng hộ"><span data-live="planet.' + t.pi + '.population">' + U.esc(t.population.label) + '</span><small data-live="planet.' + t.pi + '.support" class="tq-status' + U.lopTrangThai(t.support.state) + '">' + U.esc(t.support.label) + '</small></td>' +
      '<td data-label="Xây dựng"><span>' + U.esc(t.build.label) + '</span>' + (t.build.etaAt ? '<small>Còn ' + U.dem(t.build.etaAt, '', 'matrix.build.' + t.pi) + '</small>' : '') + '</td>' +
      '<td data-label="Tàu"><span data-live="planet.' + t.pi + '.ships">' + U.esc(t.ships.label) + '</span></td>' +
      '<td data-label="Nghiên cứu"><span class="tq-status' + U.lopTrangThai(t.research.state) + '">' + U.esc(t.research.label) + '</span>' +
      (t.research.etaAt && t.research.state !== 'retry' ? '<small>Còn ' + U.dem(t.research.etaAt, '', 'matrix.research.' + t.pi) + '</small>' : '') + '</td>' +
      '<td data-label="Cảnh báo"><span class="tq-status' + U.lopTrangThai(t.alert.state) + '">' + U.esc(t.alert.label) + '</span></td></tr>';
    mobileMatrix += '<details id="tq-planet-details-' + t.pi + '" class="tq-ma-tran-item" data-pi="' + t.pi + '"><summary id="tq-planet-summary-' + t.pi + '"><span><b>' + U.esc(t.name) + '</b><small>' +
      U.esc(t.coords) + (t.capital ? ' · Thủ phủ' : '') + '</small></span><span><b class="tq-status' + U.lopTrangThai(t.alert.state) + '">' + U.esc(t.alert.label) +
      '</b><small data-live="planet.' + t.pi + '.power" class="tq-status' + U.lopTrangThai(t.power.state) + '">' + U.esc(t.power.label) + '</small></span></summary>' +
      '<dl><div><dt>Kho</dt><dd class="tq-status' + U.lopTrangThai(t.storage.state) + '">' + U.esc(t.storage.label) + '</dd></div>' +
      '<div><dt>Dân / ủng hộ</dt><dd><span data-live="planet.' + t.pi + '.population">' + U.esc(t.population.label) + '</span><small data-live="planet.' + t.pi + '.support">' + U.esc(t.support.label) + '</small></dd></div>' +
      '<div><dt>Xây dựng</dt><dd>' + U.esc(t.build.label) + (t.build.etaAt ? '<small>Còn ' + U.dem(t.build.etaAt, '', 'matrix.build.' + t.pi) + '</small>' : '') + '</dd></div>' +
      '<div><dt>Tàu</dt><dd data-live="planet.' + t.pi + '.ships">' + U.esc(t.ships.label) + '</dd></div>' +
      '<div><dt>Nghiên cứu</dt><dd class="tq-status' + U.lopTrangThai(t.research.state) + '">' + U.esc(t.research.label) +
      (t.research.etaAt && t.research.state !== 'retry' ? '<small>Còn ' + U.dem(t.research.etaAt, '', 'matrix.research.' + t.pi) + '</small>' : '') + '</dd></div></dl></details>';
  }
  h += '</tbody></table>' + mobileMatrix + '</div></div></section>';

  /* Operations Queue — aggregate toàn đế quốc, vẫn giữ các nút huỷ hiện hữu. */
  var ops = [];
  for (i = 0; i < planets.length; i++) {
    var opP = planets[i];
    if (!opP) continue;
    var qBuild = Array.isArray(opP.qB) ? opP.qB : [], qShip = Array.isArray(opP.qS) ? opP.qS : [];
    var khoaBuild = U.khoaHangDoi('build', qBuild), khoaShip = U.khoaHangDoi('ship', qShip);
    for (j = 0; j < qBuild.length; j++) {
      var opB = qBuild[j] || {}, defB = G.B(opB.id);
      ops.push({ type: 'build', pi: i, index: j, queueKey: khoaBuild, name: (defB ? defB.ten : opB.id), count: Math.max(0, Number(opB.n) || 0),
        title: (defB ? defB.ten : opB.id) + ' ×' + G.so(opB.n || 0), scope: U.scopeHanhTinh(opP),
        etaAt: j === 0 ? U.mocThoiGian(opB.xong) : null, man: 'congtrinh', openLabel: 'Mở Công Trình' });
    }
    for (j = 0; j < qShip.length; j++) {
      var opS = qShip[j] || {}, defS = G.UNIT(opS.id) || G.M(opS.id);
      ops.push({ type: 'ship', pi: i, index: j, queueKey: khoaShip, name: (defS ? defS.ten : opS.id), count: Math.max(0, Number(opS.n) || 0),
        title: (defS ? defS.ten : opS.id) + ' ×' + G.so(opS.n || 0), scope: U.scopeHanhTinh(opP),
        etaAt: j === 0 ? U.mocThoiGian(st.now + Math.max(0, Number(opS.tLeft) || 0)) : null, man: 'xuong', openLabel: 'Mở Xưởng' });
    }
  }
  if (st.ncQueue) {
    var opNcPi = U.piTheoKey(st, st.ncQueue.planetKey);
    var opNc = G.R(st.ncQueue.id);
    ops.push({ type: 'research', pi: opNcPi >= 0 ? opNcPi : null, index: 0, queueKey: U.khoaNghienCuu(st.ncQueue), name: opNc ? opNc.ten : st.ncQueue.id,
      title: (opNc ? opNc.ten : st.ncQueue.id) + ' → cấp ' + G.so(st.ncQueue.lv || 0),
      scope: opNcPi >= 0 ? U.scopeHanhTinh(st.planets[opNcPi]) : 'Chưa xác định hành tinh chủ trì · Chưa có dữ liệu',
      etaAt: st.ncQueue.status === 'retry' ? null : U.mocThoiGian(st.ncQueue.finishAt), man: 'nghiencuu',
      openLabel: 'Mở Nghiên Cứu', retry: st.ncQueue.status === 'retry' });
  }
  ops.sort(function (a, b) {
    if (a.etaAt && b.etaAt && a.etaAt !== b.etaAt) return a.etaAt - b.etaAt;
    if (!!a.etaAt !== !!b.etaAt) return a.etaAt ? -1 : 1;
    return (Number.isInteger(a.pi) ? a.pi : Infinity) - (Number.isInteger(b.pi) ? b.pi : Infinity);
  });
  h += '<div class="tongquan-duoi"><section id="tq-van-hanh" class="panel tq-van-hanh"><h2>Hàng đợi vận hành <span class="tq-dem">' + G.so(ops.length) + '</span></h2><div class="noi tq-van-hanh-ds">';
  if (!ops.length) h += '<div class="tq-empty"><b>Không có hàng đợi đang chạy.</b><span>Mở Công Trình, Nghiên Cứu hoặc Xưởng Đóng Tàu để lên lịch.</span></div>';
  for (i = 0; i < ops.length; i++) {
    var op = ops[i], opKey = 'operation:' + op.type + ':' + op.pi + ':' + op.queueKey + ':' + op.index;
    var opPiAttr = Number.isInteger(op.pi) && op.pi >= 0 ? ' data-pi="' + op.pi + '"' : '';
    var opTitleHtml = op.type === 'ship' ? U.esc(op.name) + ' ×<span data-live="operation.ship.' + op.pi + '.' + op.index + '.count">' + G.so(op.count) + '</span>' : U.esc(op.title);
    h += '<article class="tq-hang-van-hanh"><div><span class="tq-viec-scope">' + U.esc(op.scope) + '</span><h3>' + opTitleHtml + '</h3>' +
      '<span class="tq-op-state">' + (op.retry ? 'Chờ thử lại ở checkpoint kế tiếp' : (op.etaAt ? 'Còn ' + U.dem(op.etaAt, '', 'operation.' + op.type + '.' + op.pi + '.' + op.index) : 'Đang chờ')) + '</span></div>' +
      '<div class="tq-op-actions"><button type="button" class="nut nho" data-act="den-viec" data-man="' + op.man + '"' + opPiAttr + ' data-alert-key="' + opKey +
      '" aria-label="' + U.esc(op.openLabel + ': ' + op.title + ' — ' + op.scope) + '">' + U.esc(op.openLabel) + '</button>' +
      (op.type === 'build' ? '<button type="button" class="nut nho xoa" data-act="huyxay"' + opPiAttr + ' data-i="' + op.index + '" data-queue-key="' + U.esc(op.queueKey) + '" aria-label="' + U.esc('Huỷ ' + op.title + ' tại ' + op.scope) + '">Huỷ</button>' : '') +
      (op.type === 'ship' ? '<button type="button" class="nut nho xoa" data-act="huydong"' + opPiAttr + ' data-i="' + op.index + '" data-queue-key="' + U.esc(op.queueKey) + '" aria-label="' + U.esc('Huỷ ' + op.title + ' tại ' + op.scope) + '">Huỷ</button>' : '') +
      (op.type === 'research' ? '<button type="button" class="nut nho xoa" data-act="huync" data-queue-key="' + U.esc(op.queueKey) + '" aria-label="' + U.esc('Huỷ đề tài ' + op.title + ' — ' + op.scope) + '">Huỷ đề tài</button>' : '') + '</div></article>';
  }
  h += '</div></section>';

  /* Fleet Watch + Recent Intel dùng chung cột theo dõi. */
  h += '<div id="tq-theo-doi" class="tq-theo-doi"><section class="panel tq-fleet-watch"><h2>Theo dõi hạm đội</h2><div class="noi">';
  if (!fleets.length) h += '<div class="tq-empty"><b>Không có hạm đội đang bay.</b><span>Các đơn vị đang đậu tại hành tinh.</span></div>';
  for (i = 0; i < fleets.length; i++) {
    var f = fleets[i] || {}, mission = G.byId(G.MISSIONS, f.mission), eta = f.pha === 've' ? f.ve_t : (f.pha === 'giu' ? f.giuDen_t : f.den_t);
    h += '<div class="tq-theo-doi-hang"><span><b>#' + U.esc(f.id) + ' · ' + U.esc(mission ? mission.ten : f.mission) + '</b><small>' +
      U.esc(U.toaDoStr(f.tu)) + ' → ' + U.esc(U.toaDoStr(f.den)) + (f.pha === 've' ? ' · đang về' : '') + '</small></span>' +
      (eta ? U.dem(eta, '', 'fleet.' + f.id + '.eta') : '<span class="mo">Chưa có dữ liệu</span>') + '</div>';
  }
  if ((st.pvpGiu || []).length) h += '<p class="tq-ghi-chu">' + G.so(st.pvpGiu.length) + ' hạm đội đồng minh đang giữ quỹ đạo.</p>';
  h += '<button type="button" class="nut nho tq-mo-module" data-act="den-viec" data-man="hamdoi" data-pi="' + U.pi + '" data-alert-key="watch-fleets"' + quickDisabled + '>Mở Hạm Đội</button></div></section>';

  var intel = [], uuTienTin = { canh: 1, tt: 1, tran: 1 };
  for (i = 0; i < msgs.length; i++) if (msgs[i] && uuTienTin[msgs[i].loai]) intel.push(msgs[i]);
  for (i = 0; i < msgs.length && intel.length < 5; i++) if (msgs[i] && intel.indexOf(msgs[i]) < 0) intel.push(msgs[i]);
  h += '<section class="panel tq-intel"><h2>Tin tình báo gần đây</h2><div class="noi">';
  if (!intel.length) h += '<div class="tq-empty"><b>Chưa có tin.</b><span>Chiến báo và báo cáo do thám sẽ xuất hiện ở đây.</span></div>';
  for (i = 0; i < Math.min(5, intel.length); i++) h += '<div class="tq-theo-doi-hang"><span><b>' + U.esc(intel[i].td) + '</b><small>' +
    U.esc(G.gio(intel[i].t * 1000)) + (intel[i].doc ? '' : ' · Chưa đọc') + '</small></span></div>';
  h += '<button type="button" class="nut nho tq-mo-module" data-act="den-viec" data-man="tinnhan" data-alert-key="recent-intel">Mở Tin Nhắn</button></div></section></div></div>';

  /* Quản lý hành tinh giữ đủ các action cũ, nhưng đẩy khỏi first fold. */
  var pQuanLy = !!(p && p.b && dan && dan.taxBp !== null && dan.taxBp !== undefined && dan.taxBp !== '' &&
    Number.isFinite(Number(dan.taxBp)) && Lp && U.toaDoHopLe(p.c));
  if (!pQuanLy) {
    h += '<section id="tq-quan-ly-hanh-tinh" class="panel tq-quan-ly"><h2>Quản lý hành tinh</h2><div class="noi">' +
      '<div class="tq-empty"><b>Chưa có dữ liệu hành tinh.</b><span>Các thao tác quản lý được khoá cho tới khi dữ liệu đầy đủ trở lại.</span></div></div></section>';
  } else {
    var datDung = null, datToiDa = null;
    try { datDung = G.oDaDung(p); datToiDa = G.oToiDa(p); } catch (eDatQL) { datDung = datToiDa = null; }
    h += '<section id="tq-quan-ly-hanh-tinh" class="panel tq-quan-ly"><h2>Quản lý ' + U.esc(U.scopeHanhTinh(p)) + (p.thuDo ? ' · Thủ phủ' : '') + '</h2><div class="noi">' +
      '<div class="tq-quan-ly-luoi"><div><span>Chỉ huy</span><b>' + U.esc(st.ten || 'Chưa có dữ liệu') + (st.lm ? ' · ' + U.esc(st.lm.ten) : '') + '</b></div>' +
      '<div><span>Loại / nhiệt độ</span><b>' + U.esc(Lp.ten) + ' · ' + (Number.isFinite(Number(p.temp)) ? G.so(p.temp) + '°C' : 'Chưa có dữ liệu') + '</b></div>' +
      '<div><span>Ô đất</span><b>' + (datDung === null ? 'Chưa có dữ liệu' : G.so(datDung) + ' / ' + G.so(datToiDa)) + '</b></div>' +
      '<div><span>Quân đổ bộ giữ nhà</span><b data-live="planet.' + U.pi + '.ground.html">' + (p.linh ? U.dsTau(p.linh) : 'Chưa có dữ liệu') + '</b></div></div>' +
      '<div class="tq-quan-ly-actions"><div class="tq-thue"><label for="thue-pct">Thuế hành tinh</label><input id="thue-pct" class="tq-thue-input" aria-label="Thuế phần trăm" type="number" min="0" max="100" step="1" value="' +
      (Number(dan.taxBp) / 100) + '"><span>%</span><button type="button" class="nut nho" data-act="doithue">Đổi thuế</button></div>' +
      '<button type="button" class="nut nho" data-act="doi-ten">Đổi tên</button>' +
      (p.thuDo || U.pi === 0 ? '' : '<button type="button" class="nut nho xoa" data-act="bo-hoang">Bỏ hoang</button>') + '</div></div></section>';
  }
  h += '</div>';
  return h;
};

/* ======================================================================
 * MÀN: TÀI NGUYÊN
 * ==================================================================== */
U.m_tainguyen = function () {
  var st = U.st(), p = U.ht(), s = G.sanLuong(st, p), cap = G.dungTich(p);
  var h = '<div class="panel"><h2>Sản lượng ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) + '</h2><div class="noi bang-cuon">';
  h += '<table><tr><th>Tài nguyên</th><th class="r">Đang có</th><th class="r">Dung tích</th><th class="r">Mỗi giờ</th><th class="r">Mỗi chu kỳ 6g</th><th>Đầy sau</th></tr>';
  for (var i = 0; i < G.RES_HANH_TINH.length; i++) {
    var id = G.RES_HANH_TINH[i], r = G.byId(G.RES, id), v = p.res[id] || 0, rate = s.r[id];
    var day = rate > 0 && v < cap[id] ? G.tg((cap[id] - v) / rate * 3600) : (rate <= 0 ? '—' : 'đã đầy');
    h += '<tr><td><span class="res-nhan">' + U.chamRes(r) + U.esc(r.ten) + '</span></td><td class="r sz">' + G.so(v) + '</td><td class="r sz">' +
      G.so(cap[id]) + '</td><td class="r sz ' + (rate < 0 ? 'do' : '') + '">' + (rate >= 0 ? '+' : '') + G.so(rate) +
      '</td><td class="r sz">' + (rate >= 0 ? '+' : '') + G.so(rate * 6) + '</td><td class="sz">' + day + '</td></tr>';
  }
  h += '<tr><td><span class="res-nhan">' + U.chamRes(G.byId(G.RES, 'galana')) + 'Galana</span> <span class="mo">(toàn đế quốc)</span></td><td class="r sz">' +
    G.so(st.galana) + '</td><td class="r mo">không giới hạn</td><td class="r sz">+' + G.so(s.r.galana) +
    '</td><td class="r sz">+' + G.so(s.r.galana * 6) + '</td><td class="mo">—</td></tr>';
  h += '<tr><td><span class="res-nhan">' + U.chamRes(G.byId(G.RES, 'tech')) + 'Kỹ Thuật</span> <span class="mo">(toàn đế quốc)</span></td><td class="r sz">' +
    G.so(st.techPts) + '</td><td class="r mo">không giới hạn</td><td class="r sz">+' + G.so(s.r.tech) +
    '</td><td class="r sz">+' + G.so(s.r.tech * 6) + '</td><td class="mo">—</td></tr>';
  h += '</table></div></div>';

  var Lr = s.loai || G.loaiHT(st, p);
  h += '<div class="panel"><h2>Hành tinh loại ' + U.esc(Lr.ten) + '</h2><div class="noi">' +
    '<p class="mo">' + U.esc(Lr.mota) + '</p>' +
    '<div class="bang-cuon"><table><tr><th>Ô đất</th><th class="r">Kim Loại</th><th class="r">Thạch Anh</th>' +
    '<th class="r">Nhiên Liệu</th><th class="r">Thực Phẩm</th><th class="r">Điện mặt trời</th><th class="r">Phòng thủ mặt đất</th></tr><tr>' +
    ['oDat', 'kl', 'tt', 'dt', 'lt', 'dien', 'thuDat'].map(function (k) {
      var v = Lr[k];
      return '<td class="r sz ' + (v > 1 ? 'luc' : (v < 1 ? 'do' : 'mo')) + '">×' + v + '</td>';
    }).join('') + '</tr></table></div></div></div>';
  h += '<div class="luoi2">';
  h += '<div class="panel"><h2>Cân bằng điện</h2><div class="noi">';
  h += '<table><tr><td>Sản xuất</td><td class="r sz luc">' + G.so(s.dienCo) + '</td></tr>' +
    '<tr><td>Tiêu thụ</td><td class="r sz do">' + G.so(s.dienDung) + '</td></tr>' +
    '<tr><td>Hiệu suất mỏ</td><td class="r sz">' + Math.round(s.hs * 100) + '%</td></tr>' +
    '<tr><td>Lò nhiệt hạch đốt</td><td class="r sz">' + G.so(s.dotDT) + ' NL/giờ</td></tr></table>';
  if (s.hs < 1) h += '<div class="canh bt">Thiếu điện: mỏ chỉ chạy ' + Math.round(s.hs * 100) +
    '%. Xây thêm Nhà Máy Điện Mặt Trời, Lò Phản Ứng Nhiệt Hạch hoặc Vệ Tinh Phòng Thủ.</div>';
  h += '</div></div>';

  var soThu = 0; for (var kk in p.def) soThu += p.def[kk];
  var ds = U.ds(p), sucChua = G.sucChuaDan ? G.sucChuaDan(p) : 250000;
  h += '<div class="panel"><h2>Thực phẩm &amp; dân cư</h2><div class="noi">';
  h += '<table><tr><td>Dân số / sức chứa</td><td class="r sz">' + G.so(ds.population) + ' / ' + G.so(sucChua) + '</td></tr>' +
    '<tr><td>Ủng hộ / thuế</td><td class="r sz">' + U.bp(ds.supportBp) + ' / ' + U.bp(ds.taxBp) + '</td></tr>' +
    '<tr><td>Thủy thủ đoàn đang đậu</td><td class="r sz">' + G.so(G.thuyThu(p.ships)) + ' người</td></tr>' +
    '<tr><td>Tổng số công trình</td><td class="r sz">' + G.so(G.tongSoCT(p)) + '</td></tr>' +
    '<tr><td>Công sự phải nuôi</td><td class="r sz">' + G.so(soThu) + '</td></tr>' +
    '<tr><td>Tiêu thụ Thực Phẩm</td><td class="r sz do">' + G.so(s.anUong) + '/giờ</td></tr>' +
    '<tr><td>Đã cần / thiếu trong chu kỳ</td><td class="r sz">' + G.so(ds.foodDemandCycle) + ' / <span class="' +
      (ds.foodShortfallCycle > 0 ? 'do' : 'luc') + '">' + G.so(ds.foodShortfallCycle) + '</span></td></tr>' +
    '<tr><td>Thuế thu về</td><td class="r sz tim">' + G.so(s.r.galana) + ' Galana/giờ</td></tr></table>';
  if (ds.foodShortfallCycle > 0) h += '<div class="canh">Thực Phẩm đang thiếu. Ở checkpoint kế tiếp, phần dân trên sàn 250.000 có thể rời đi và ủng hộ sẽ giảm.</div>';
  h += '</div></div>';
  h += '</div>';

  /* [v7] Chợ cũ đã đóng — nav tới Ngân Hàng & Thị Trường */
  h += '<div class="panel"><h2>Ngân Hàng & Thị Trường</h2><div class="noi">';
  h += '<p class="mo">Chợ Thiên Hà cũ đã đóng từ bản v7. Sử dụng màn <b>Ngân Hàng & Thị Trường</b> để quản lý tài chính, gửi tiết kiệm, và giao dịch trên thị trường.</p>';
  h += '<button class="nut oke" data-act="man" data-man="taichinh">Mở Ngân Hàng & Thị Trường</button>';
  h += '</div></div>';
  return h;
};


/* ======================================================================
 * MÀN: CÔNG TRÌNH / NGHIÊN CỨU / XƯỞNG / PHÒNG THỦ
 * ==================================================================== */
U.theCT = function (st, p, b) {
  var co = p.b[b.id] || 0, dangXay = G.soDangXay(p, b.id);
  var n = G.loMacDinhXay(p, b.id);
  var cost = G.giaCongTrinh(b, n);
  var thieuDK = G.thieuDK(st, p, b);
  var du = G.duTien(st, p, cost);
  var tg = G.tgXay(st, p, cost);
  var s = G.sanLuong(st, p);

  var h = '<div class="the' + (thieuDK.length ? ' tat' : '') + '">';
  h += '<span class="cap">có ' + G.so(co) + (dangXay ? ' (+' + G.so(dangXay) + ')' : '') + '</span>';
  h += '<h4>' + U.esc(b.ten) + '</h4>';
  h += '<div class="mt">' + U.esc(b.mota) + '</div>';

  /* hiệu quả của cả lô đang nhập mặc định */
  var ctx = { temp: p.temp, tech: st.tech };
  if (b.prod) {
    var a = b.prod(co, ctx), c = b.prod(co + n, ctx), lines = [];
    for (var k in c) {
      var mo = (a[k] || 0), mo2 = c[k];
      var sp = (k === 'energy') ? 1 : G.C.TOC_DO_SERVER;
      lines.push((k === 'energy' ? 'Điện' : G.byId(G.RES, k).ten) + ': ' + G.so(mo * sp) + ' → <b>' + G.so(mo2 * sp) + '</b>');
    }
    h += '<div class="chi-tiet">' + lines.join('<br>') + '</div>';
  }
  if (b.cap) h += '<div class="chi-tiet">Dung tích: ' + G.so(b.cap(co)) + ' → <b>' + G.so(b.cap(co + n)) + '</b></div>';
  if (b.id === 'robot' || b.id === 'nanite' || b.id === 'shipyard' || b.id === 'lab')
    h += '<div class="mo chi-tiet">Nhiều cơ sở hơn = công suất lớn hơn.</div>';
  if (b.id === 'fleetHQ') h += '<div class="chi-tiet">Khe hạm đội: ' + G.khe(st) + ' → <b>' + (G.khe(st) + n) + '</b></div>';
  if (b.id === 'maintDepot') h += '<div class="chi-tiet">Giảm phí bảo trì: ' +
    Math.min(60, 6 * G.tongB(st, 'maintDepot')) + '% → <b>' + Math.min(60, 6 * (G.tongB(st, 'maintDepot') + n)) + '%</b></div>';
  if (b.id === 'terraform') h += '<div class="chi-tiet">Khu đất tối đa: ' +
    G.oToiDa(p) + ' → <b>' + (G.oToiDa(p) + 6 * n) + '</b></div>';

  if (thieuDK.length) h += '<div class="dk">Cần: ' + U.esc(thieuDK.join(', ')) + '</div>';
  h += '<div class="gia" id="ct-gia-' + b.id + '">' + U.gia(cost, p, st) + '</div>';
  h += '<div class="ct"><label class="mo sz">Lô <input id="ct-sl-' + b.id + '" type="number" min="1" max="10000000" value="' +
    n + '" style="width:92px"></label><button class="nut nho ' + (du && !thieuDK.length ? 'oke' : '') +
    '" data-act="xay" data-id="' + b.id + '"' + (thieuDK.length ? ' disabled' : '') + '>Xây ×' + G.so(n) + '</button>' +
    '<span class="mo sz" id="ct-tg-' + b.id + '">' + G.tg(tg) + '</span></div>';
  h += '</div>';
  return h;
};

U.m_congtrinh = function () {
  var st = U.st(), p = U.ht();
  var nhom = [['kt', 'Khai thác'], ['ds', 'Dân cư'], ['nl', 'Năng lượng'], ['kho', 'Kho chứa'], ['cn', 'Công nghiệp &amp; hạ tầng']];
  var h = '<div class="panel"><h2>Ô đất: ' + G.oDaDung(p) + ' / ' + G.oToiDa(p) + ' — ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) +
    '</h2><div class="noi"><span class="mo">Mỗi loại công trình chiếm một ô đất. Hàng đợi tối đa 5 mục.</span></div></div>';
  for (var n = 0; n < nhom.length; n++) {
    h += '<div class="panel"><h2>' + nhom[n][1] + '</h2><div class="noi luoi">';
    for (var i = 0; i < G.BUILDINGS.length; i++) if (G.BUILDINGS[i].nhom === nhom[n][0]) h += U.theCT(st, p, G.BUILDINGS[i]);
    h += '</div></div>';
  }
  return h;
};

U.m_nghiencuu = function () {
  var st = U.st(), p = U.ht();
  var h = '<div class="panel"><h2>Phòng nghiên cứu: ' + G.so(p.b.lab || 0) + ' cơ sở</h2><div class="noi">';
  h += '<p class="mo">Chi phí đề tài không bị trừ ngay: hệ thống chia toàn bộ tài nguyên thành các khoản cấp vốn ở nhịp ' +
    '<b>6 giờ</b>. Mỗi đề tài kéo dài ít nhất 12 giờ. Thiếu chỉ một loại tài nguyên thì kỳ đó không trừ gì, đề tài trễ thêm 6 giờ.</p>';
  if (st.ncQueue) {
    var q = st.ncQueue, qDef = G.R(q.id);
    h += '<div class="canh ' + (q.status === 'retry' ? '' : 'ok') + '"><b>' + U.esc(qDef ? qDef.ten : q.id) + ' → cấp ' + q.lv + '</b> — ' +
      (q.status === 'retry' ? 'CHỜ THỬ LẠI ở nhịp kế tiếp' : 'dự kiến xong sau ' + U.dem(q.finishAt)) + '.<br>' +
      'Khoản kỳ tới: ' + U.dsRes(U.ncKyTiep(q)) + ' · còn ' + G.so(q.installmentsLeft || 0) + '/' +
      G.so(q.installmentsTotal || 0) + ' kỳ · tổng còn lại: ' + U.dsRes(U.ncConLai(q)) + '. ' +
      '<button class="nut nho xoa" data-act="huync" data-queue-key="' + U.esc(U.khoaNghienCuu(q)) + '">Huỷ</button></div>';
  }
  h += '</div></div>';

  h += '<div class="panel"><h2>Đề tài</h2><div class="noi luoi">';
  for (var i = 0; i < G.RESEARCH.length; i++) {
    var d = G.RESEARCH[i], lv = st.tech[d.id] || 0, lvT = lv + 1;
    var cost = G.giaXay(d, lvT), thieuDK = G.thieuDK(st, p, d);
    var tg = G.tgNC(st, p, cost);
    var soKy = Math.max(2, Math.ceil(tg / G.C.CHU_KY_BAO_TRI));
    var kyDau = U.ncKyTiep({ totalCost: cost, paidCost: {}, installmentsLeft: soKy });
    h += '<div class="the' + (thieuDK.length ? ' tat' : '') + '"><span class="cap">cấp ' + lv + '</span>' +
      '<h4>' + U.esc(d.ten) + '</h4><div class="mt">' + U.esc(d.mota) + '</div>';
    if (thieuDK.length) h += '<div class="dk">Cần: ' + U.esc(thieuDK.join(', ')) + '</div>';
    h += '<div class="gia">Tổng: ' + U.dsRes(cost) + '</div>';
    h += '<div class="tim chi-tiet">' + soKy + ' kỳ cấp vốn · kỳ đầu: ' + U.dsRes(kyDau) + '</div>';
    h += '<div class="ct"><button class="nut nho ' + (!thieuDK.length && !st.ncQueue ? 'oke' : '') +
      '" data-act="nc" data-id="' + d.id + '"' + (thieuDK.length || st.ncQueue ? ' disabled' : '') + '>Nghiên cứu cấp ' + lvT + '</button>' +
      '<span class="mo sz">' + G.tg(tg) + '</span></div></div>';
  }
  h += '</div></div>';
  return h;
};

U.theDonVi = function (st, p, u, loai) {
  var pi = st && Array.isArray(st.planets) ? st.planets.indexOf(p) : -1;
  var co = (loai === 'ship') ? ((p.ships || {})[u.id] || 0)
    : (loai === 'mis' ? ((p.mis || {})[u.id] || 0)
    : (loai === 'bo' ? ((p.linh || {})[u.id] || 0) : ((p.def || {})[u.id] || 0)));
  var dang = G.dangDong(p, u.id);
  var thieuDK = G.thieuDK(st, p, u), du = G.duTien(st, p, u.cost);
  var tg = G.tgTau(st, p, u.cost);
  var h = '<div class="the' + (thieuDK.length ? ' tat' : '') + '">';
  h += '<span class="cap"' + (pi >= 0 ? ' data-live="unit.' + pi + '.' + loai + '.' + U.esc(u.id) + '.summary"' : '') + '>có ' +
    G.so(co) + (dang ? ' (+' + G.so(dang) + ')' : '') + '</span>';
  h += '<h4>' + U.esc(u.ten) + '</h4><div class="mt">' + U.esc(u.mota) + '</div>';
  if (loai === 'bo') {
    var w0 = 1 + 0.1 * (st.tech.weapon || 0), a0 = 1 + 0.1 * (st.tech.armor || 0);
    h += '<table class="bang-phu">' +
      '<tr><td>Công</td><td class="r sz">' + G.so(u.atk * w0) + '</td><td>Vỏ</td><td class="r sz">' + G.so(u.hull * a0) + '</td></tr>' +
      '<tr><td>Chiếm chỗ</td><td class="r sz">' + u.cho + '</td><td>Lớp</td><td class="r">mặt đất</td></tr></table>';
  }
  if (loai !== 'mis' && loai !== 'bo') {
    var w = 1 + 0.1 * (st.tech.weapon || 0), sh = 1 + 0.1 * (st.tech.shield || 0), ar = 1 + 0.1 * (st.tech.armor || 0);
    h += '<table class="bang-phu">' +
      '<tr><td>Công</td><td class="r sz">' + G.so(u.atk * w) + '</td><td>Khiên</td><td class="r sz">' + G.so(u.shield * sh) + '</td></tr>' +
      '<tr><td>Vỏ</td><td class="r sz">' + G.so(u.hull * ar) + '</td>' +
      (loai === 'ship'
        ? '<td>Tốc độ</td><td class="r sz">' + G.so(u.speed * G.bonusDC(st, u.dc)) + '</td></tr>' +
          '<tr><td>Khoang</td><td class="r sz">' + G.so(u.cargo) + '</td><td>Thủy thủ</td><td class="r sz">' + G.so(u.crew) + '</td></tr>'
        : '<td>Lớp</td><td class="r">' + (u.lop === 'quydao' ? 'quỹ đạo' : 'mặt đất') + '</td></tr>') +
      '</table>';
  }
  if (thieuDK.length) h += '<div class="dk">Cần: ' + U.esc(thieuDK.join(', ')) + '</div>';
  h += '<div class="gia">' + U.gia(u.cost, p, st) + '</div>';
  h += '<div class="ct"><input type="number" min="1" value="1" id="sl-' + u.id + '" aria-label="Số lượng ' + U.esc(u.ten) + '" style="width:80px">' +
    '<button class="nut nho ' + (du && !thieuDK.length ? 'oke' : '') + '" data-act="dong" data-id="' + u.id + '"' +
    (thieuDK.length ? ' disabled' : '') + '>Đóng</button><span class="mo sz">' + G.tg(tg) + '/chiếc</span></div>';
  h += '</div>';
  return h;
};

U.m_xuong = function () {
  var st = U.st(), p = U.ht();
  var h = '<div class="panel"><h2>Xưởng Đóng Tàu: ' + G.so(p.b.shipyard || 0) + ' nhà máy — ' + U.esc(p.ten) + '</h2><div class="noi">';
  h += '<b>Hạm đội đang đậu:</b> ' + U.dsTau(p.ships);
  h += '<br><span class="mo">Thủy thủ đoàn: ' + G.so(G.thuyThu(p.ships)) + ' người · khoang hàng tổng ' +
    G.so(G.khoangHang(p.ships)) + '</span></div></div>';
  h += '<div class="panel"><h2>Đóng tàu</h2><div class="noi luoi">';
  for (var i = 0; i < G.SHIPS.length; i++) h += U.theDonVi(st, p, G.SHIPS[i], 'ship');
  h += '</div></div>';

  h += '<div class="panel"><h2>Quân đổ bộ</h2><div class="noi">';
  h += '<p class="mo">Cơ chế đặc trưng của bản gốc: <b>phá vỡ quỹ đạo trước</b>, rồi Đại Chiến Hạm mới thả ' +
    'Robot và Tank xuống. Thắng dưới mặt đất thì <b>san phẳng công trình</b> của đối phương và vét thêm kho. ' +
    'Quân đổ bộ không đánh được trên quỹ đạo, nhưng đứng ở nhà thì chống được quân đổ bộ của địch.</p>';
  h += '<table class="bang-kho-quan"><tr><th>Đang có</th><th class="r">Số lượng</th><th class="r">Chiếm chỗ</th></tr>';
  for (var b2 = 0; b2 < G.BOBINH.length; b2++) {
    var bb = G.BOBINH[b2];
    h += '<tr><td>' + U.esc(bb.ten) + '</td><td class="r sz">' + G.so((p.linh || {})[bb.id] || 0) +
      '</td><td class="r sz">' + bb.cho + ' chỗ/đơn vị</td></tr>';
  }
  h += '<tr><td>Tổng chỗ đang cần</td><td class="r sz">' + G.so(G.choLinhCan(p.linh || {})) +
    '</td><td class="r sz mo">hạm đội ở đây chở được ' + G.so(G.sucChoLinh(p.ships)) + '</td></tr></table>';
  h += '<div class="luoi cach-tren-sm">';
  for (var b3 = 0; b3 < G.BOBINH.length; b3++) h += U.theDonVi(st, p, G.BOBINH[b3], 'bo');
  h += '</div></div></div>';
  return h;
};

U.m_phongthu = function () {
  var st = U.st(), p = U.ht();
  var h = '<div class="panel"><h2>Phòng thủ hai lớp — ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) + '</h2><div class="noi">';
  h += '<p class="mo">Đặc trưng của Thiên Hà Đại Chiến: phòng thủ chia làm <b>lớp quỹ đạo</b> và <b>lớp mặt đất</b>. ' +
    'Lớp quỹ đạo giao chiến ngay từ vòng 1; hạm đội địch chỉ xuống tới tầng khí quyển và đụng phòng thủ mặt đất ' +
    'từ vòng ' + G.VONG_XUONG_DAT + '. Công sự bị phá có 70% cơ hội được sửa lại sau trận.</p>';
  h += '<b>Đang có:</b> ' + U.dsTau(p.def) + '<br><b>Tên lửa:</b> ' + U.dsTau(p.mis);
  h += '</div></div>';
  var nhom = [['quydao', 'Lớp quỹ đạo'], ['dat', 'Lớp mặt đất']];
  for (var n = 0; n < nhom.length; n++) {
    h += '<div class="panel"><h2>' + nhom[n][1] + '</h2><div class="noi luoi">';
    for (var i = 0; i < G.DEFENSES.length; i++) if (G.DEFENSES[i].lop === nhom[n][0]) h += U.theDonVi(st, p, G.DEFENSES[i], 'def');
    h += '</div></div>';
  }
  h += '<div class="panel"><h2>Tên lửa (' + G.so(p.b.missileSilo || 0) + ' hầm, chứa ' + ((p.b.missileSilo || 0) * 10) +
    ' đơn vị)</h2><div class="noi luoi">';
  for (var m = 0; m < G.MISSILES.length; m++) h += U.theDonVi(st, p, G.MISSILES[m], 'mis');
  h += '</div></div>';

  /* --- bắn tên lửa liên hành tinh --- */
  var tam = G.tamTenLua(st);
  h += '<div class="panel"><h2>Bắn tên lửa liên hành tinh</h2><div class="noi">';
  h += '<p class="mo">Tên lửa bay thẳng, không quay về, và chỉ phá <b>phòng thủ mặt đất</b> — lớp quỹ đạo ' +
    'không hề hấn gì. Bên bị bắn dùng Tên Lửa Đánh Chặn hạ 1 đổi 1. Tầm bắn = (cấp Động Cơ Xung × 5) − 1 hệ, ' +
    'chỉ trong cùng thiên hà.</p>';
  h += '<table class="bang-ten-lua"><tr><td>Đang có</td><td class="r sz">' +
    G.so(p.mis.icbm || 0) + ' quả</td></tr>' +
    '<tr><td>Tầm bắn</td><td class="r sz ' + (tam ? '' : 'do') + '">' + tam + ' hệ ' +
    '<span class="mo">(Động Cơ Xung cấp ' + (st.tech.impulse || 0) + ')</span></td></tr>' +
    '<tr><td>Sát thương mỗi quả</td><td class="r sz">' +
    G.so(G.C.SAT_THUONG_ICBM * (1 + 0.1 * (st.tech.weapon || 0))) + '</td></tr>' +
    '<tr><td>Đánh chặn của ta</td><td class="r sz">' + G.so(p.mis.interceptor || 0) + ' quả</td></tr></table>';
  if (p.mis.icbm) {
    h += '<div class="hd-td cach-tren-xs">Mục tiêu ' +
      '<input id="tl-g" aria-label="Thiên hà mục tiêu tên lửa" type="number" min="1" max="' + G.C.SO_THIEN_HA + '" value="' + p.c.g + '" readonly title="chỉ bắn được trong cùng thiên hà">:' +
      '<input id="tl-h" aria-label="Hệ mục tiêu tên lửa" type="number" min="1" max="' + G.C.SO_HE + '" value="' + p.c.h + '">:' +
      '<input id="tl-p" aria-label="Ô mục tiêu tên lửa" type="number" min="1" max="' + G.C.SO_HANH_TINH + '" value="1">' +
      ' Số quả <input id="tl-n" aria-label="Số tên lửa" type="number" min="1" max="' + (p.mis.icbm || 1) + '" value="' + (p.mis.icbm || 1) + '" style="width:70px">' +
      ' <button class="nut xoa" data-act="ban-ten-lua">PHÓNG</button></div>';
  } else {
    h += '<p class="do">Chưa có quả nào — đóng Tên Lửa Liên Hành Tinh ở trên (cần ' +
      G.so(G.slYeuCau('missileSilo', 4)) + ' Hầm Tên Lửa).</p>';
  }
  if (st.tenLua && st.tenLua.length) {
    h += '<div class="bang-cuon cach-tren-sm"><table><tr><th>Loạt</th><th>Từ</th><th>Tới</th><th class="r">Số quả</th><th>Nổ sau</th></tr>';
    for (var z = 0; z < st.tenLua.length; z++) {
      var q3 = st.tenLua[z];
      h += '<tr><td class="sz">#' + q3.id + '</td><td class="sz">' + G.tdStr(q3.tu) + '</td><td class="sz">' +
        G.tdStr(q3.den) + '</td><td class="r sz">' + G.so(q3.n) + '</td><td class="sz cam">' + U.dem(q3.khi) + '</td></tr>';
    }
    h += '</table></div>';
  }
  h += '</div></div>';
  return h;
};

/* ======================================================================
 * MÀN: HẠM ĐỘI
 * ==================================================================== */
U.formMoi = function () {
  var p = U.ht();
  return { den: { g: p.c.g, h: p.c.h, p: p.c.p }, mission: 'attack', pct: 100, ships: {}, linh: {}, cargo: {}, giu: 1 };
};
U.capNhatForm = function () {
  var f = U.form; if (!f) return;
  var g = document.getElementById('f-g'), h = document.getElementById('f-h'), pp = document.getElementById('f-p');
  if (g) f.den = { g: +g.value || 1, h: +h.value || 1, p: +pp.value || 1 };
  var ms = document.getElementById('f-mission'); if (ms) f.mission = ms.value;
  var pc = document.getElementById('f-pct'); if (pc) f.pct = +pc.value || 100;
  var gi = document.getElementById('f-giu'); if (gi) f.giu = Math.max(1, +gi.value || 1);
  var i, el;
  for (i = 0; i < G.SHIPS.length; i++) {
    el = document.getElementById('ft-' + G.SHIPS[i].id);
    if (el) { var n = Math.max(0, Math.floor(+el.value || 0)); if (n) f.ships[G.SHIPS[i].id] = n; else delete f.ships[G.SHIPS[i].id]; }
  }
  if (!f.linh) f.linh = {};
  for (i = 0; i < G.BOBINH.length; i++) {
    el = document.getElementById('fl-' + G.BOBINH[i].id);
    if (el) { var nb = Math.max(0, Math.floor(+el.value || 0)); if (nb) f.linh[G.BOBINH[i].id] = nb; else delete f.linh[G.BOBINH[i].id]; }
  }
  for (i = 0; i < G.RES_HANH_TINH.length; i++) {
    el = document.getElementById('fc-' + G.RES_HANH_TINH[i]);
    if (el) { var v = Math.max(0, Math.floor(+el.value || 0)); if (v) f.cargo[G.RES_HANH_TINH[i]] = v; else delete f.cargo[G.RES_HANH_TINH[i]]; }
  }
};
U.ttBay = function () {
  var st = U.st(), p = U.ht(), f = U.form;
  if (G.trong(f.ships)) return '<span class="mo">Chọn ít nhất một tàu để xem thông số chuyến bay.</span>';
  var kc = G.khoangCach(p.c, f.den);
  var tg = G.tgBay(st, f.ships, kc, f.pct);
  var nl = G.nhienLieu(st, f.ships, kc, f.pct);
  var suc = G.khoangHang(f.ships);
  var hang = 0; for (var k in f.cargo) hang += f.cargo[k];
  var ttGiu = '';
  if (f.mission === 'hold' && G.QUY_DAO_V1 && G.nhienLieuGiu) {
    var giuGiay = Math.max(1, Math.min(24, Math.floor(+f.giu || 1))) * 3600;
    var doan = Math.max(1, G.QUY_DAO_V1.segmentSeconds);
    var dau = G.nhienLieuGiu(st, f.ships, Math.min(giuGiay, doan));
    var tong;
    if (G.nhienLieuGiuTong) tong = G.nhienLieuGiuTong(st, f.ships, giuGiay);
    else {
      tong = 0;
      for (var con = giuGiay; con > 0; con -= doan)
        tong += G.nhienLieuGiu(st, f.ships, Math.min(con, doan));
    }
    var mang = Math.max(0, Math.floor((f.cargo && f.cargo.deut) || 0));
    var lop = mang < dau ? 'do' : (mang < tong ? 'vang' : 'luc');
    ttGiu = '<tr><td>NL kỳ quỹ đạo đầu</td><td class="r sz ' + lop + '">' + G.so(dau) + '</td>' +
      '<td>NL giữ đủ ' + Math.round(giuGiay / 3600) + ' giờ</td><td class="r sz ' + lop + '">' +
      G.so(tong) + ' <span class="mo">(đang chở ' + G.so(mang) + ')</span></td></tr>' +
      '<tr><td colspan="4" class="' + lop + '">Nhiên liệu giữ quỹ đạo phải nằm trong khoang hàng. ' +
      (mang < dau
        ? 'Chưa đủ kỳ đầu nên máy chủ sẽ không cho xuất kích.'
        : (mang < tong
          ? 'Đủ vào quỹ đạo, nhưng nếu không đủ một kỳ trả trước kế tiếp thì toàn bộ tàu còn lại sẽ bị phá huỷ thành phế liệu.'
          : 'Đủ theo kế hoạch hiện tại; gọi về sớm không hoàn lại phần đã trả.')) + '</td></tr>';
  }
  return '<table><tr>' +
    '<td>Khoảng cách</td><td class="r sz">' + G.so(kc) + '</td>' +
    '<td>Tốc độ hạm đội</td><td class="r sz">' + G.so(G.tocDoHam(st, f.ships)) + '</td></tr>' +
    '<tr><td>Thời gian bay</td><td class="r sz cam">' + G.tg(tg) + '</td>' +
    '<td>Cả đi lẫn về</td><td class="r sz">' + G.tg(tg * 2) + '</td></tr>' +
    '<tr><td>Nhiên liệu</td><td class="r sz ' + ((p.res.deut || 0) < nl ? 'do' : 'luc') + '">' + G.so(nl) + ' NL</td>' +
    '<td>Khoang hàng</td><td class="r sz ' + (hang > suc ? 'do' : '') + '">' + G.so(hang) + ' / ' + G.so(suc) + '</td></tr>' +
    '<tr><td>Thủy thủ đoàn</td><td class="r sz">' + G.so(G.thuyThu(f.ships)) + '</td>' +
    '<td>Khe hạm đội</td><td class="r sz">' + st.fleets.length + ' / ' + G.khe(st) + '</td></tr>' +
    ttGiu +
    (G.trong(f.linh || {}) ? '' :
      '<tr><td>Quân đổ bộ</td><td class="r sz">' + G.so(G.choLinhCan(f.linh)) + ' chỗ</td>' +
      '<td>Hạm đội chở được</td><td class="r sz ' + (G.choLinhCan(f.linh) > G.sucChoLinh(f.ships) ? 'do' : 'luc') + '">' +
      G.so(G.sucChoLinh(f.ships)) + '</td></tr>') +
    '</table>';
};

U.m_hamdoi = function () {
  var st = U.st(), p = U.ht();
  if (!U.form) U.form = U.formMoi();
  var f = U.form, i, h = '';

  h += '<div class="panel"><h2>Hạm đội đang hoạt động (' + st.fleets.length + '/' + G.khe(st) + ')</h2><div class="noi">';
  if (!st.fleets.length) h += '<span class="mo">Không có hạm đội nào đang hoạt động.</span>';
  else {
    h += '<div class="bang-cuon"><table><tr><th>#</th><th>Nhiệm vụ</th><th>Hạm đội</th><th>Từ → Tới</th><th>Còn</th><th>Hàng</th><th></th></tr>';
    for (i = 0; i < st.fleets.length; i++) {
      var fl = st.fleets[i];
      var dangGiu = fl.pha === 'giu';
      var khoaHam = 'fleet.' + U.esc(fl.id);
      var conLai = fl.pha === 've' ? U.dem(fl.ve_t, '', khoaHam + '.eta') : (dangGiu
        ? 'Rời quỹ đạo ' + U.dem(fl.giuDen_t, '', khoaHam + '.eta') +
          (fl.tiepNL_t && fl.tiepNL_t < fl.giuDen_t ? '<br><span class="mo">Tiếp NL ' + U.dem(fl.tiepNL_t, '', khoaHam + '.refuel') + '</span>' : '')
        : U.dem(fl.den_t, '', khoaHam + '.eta'));
      h += '<tr><td class="sz">' + fl.id + '</td><td>' + U.esc(G.byId(G.MISSIONS, fl.mission).ten) +
        (fl.pha === 've' ? ' <span class="mo">(đang về)</span>' :
          (dangGiu ? ' <span class="luc">(đang đóng quân quỹ đạo)</span>' : ' <span class="mo">(đang bay tới)</span>')) +
        (fl.doiHuong ? ' <span class="vang">↷' + fl.doiHuong + '</span>' : '') + '</td>' +
        '<td>' + U.dsTau(fl.ships) + '</td>' +
        '<td class="sz">' + G.tdStr(fl.tu) + ' → ' + G.tdStr(fl.den) + '</td>' +
        '<td class="sz">' + conLai + '</td>' +
        '<td><span data-live="' + khoaHam + '.cargo">' + U.dsRes(fl.cargo) + '</span></td>' +
        '<td class="r khong-xuong-dong">' +
        (dangGiu ? '' : '<button class="nut nho" data-act="doihuong" data-fid="' + fl.id + '">Đổi mục tiêu</button> ') +
        (fl.pha === 'di' || dangGiu ? '<button class="nut nho xoa" data-act="goive" data-fid="' + fl.id + '">Gọi về</button>' : '') +
        '</td></tr>';
    }
    h += '</table></div>';
  h += '<p class="mo cach-tren-xs">Đổi mục tiêu giữa đường là cơ chế riêng của Thiên Hà Đại Chiến: ' +
      'dùng được cả lúc đi lẫn lúc về, mất ' + G.C.DOI_MUC_TIEU_GALANA +
      ' Galana cộng phí nhiên liệu phụ trội, thời gian bay tính lại từ vị trí hiện tại.</p>';
  }
  h += '</div></div>';

  var pvGiu = Array.isArray(st.pvpGiu) ? st.pvpGiu : [];
  if (pvGiu.length) {
    h += '<div class="panel"><h2>Hạm đội đồng minh đóng quân quỹ đạo</h2><div class="noi bang-cuon"><table>' +
      '<tr><th>Chỉ huy</th><th>Hành tinh</th><th>Hạm đội</th><th>Rời quỹ đạo</th><th>Tiếp nhiên liệu</th></tr>';
    for (i = 0; i < pvGiu.length; i++) {
      var qg = pvGiu[i], keyGiu = qg.den || qg.planetKey || '', pGiu = U.htTheoKey(keyGiu);
      var khoaGiu = 'garrison.' + U.esc(qg.id);
      h += '<tr><td><b class="luc">' + U.esc(qg.ten || qg.tenA || 'Đồng minh') + '</b> ' +
        '<span class="tag-lm">' + U.esc(qg.lm || qg.lmA || '') + '</span></td>' +
        '<td>' + U.esc(pGiu ? pGiu.ten : '') + ' <span class="sz">[' + U.esc(keyGiu) + ']</span></td>' +
        '<td>' + U.dsTau(qg.ships || {}) + '</td>' +
        '<td class="sz">' + U.dem(qg.giuDen_t, '', khoaGiu + '.leave') + '</td>' +
        '<td class="sz">' + (qg.tiepNL_t && qg.tiepNL_t < qg.giuDen_t ? U.dem(qg.tiepNL_t, '', khoaGiu + '.refuel') : 'đã trả đủ') + '</td></tr>';
    }
    h += '</table><p class="mo">Các đội này vẫn thuộc quyền chỉ huy của đồng minh nhưng cùng tham chiến ở lớp quỹ đạo. ' +
      'Mỗi đội dùng công nghệ của chính chủ sở hữu; thiệt hại được ghi lại đúng vào đội đó.</p></div></div>';
  }

  var pvToi = st.pvpToi || [];
  if (st.toi.length || pvToi.length) {
    h += '<div class="panel"><h2>Hạm đội đang bay tới hành tinh của ta</h2><div class="noi bang-cuon"><table>' +
      '<tr><th>Chỉ huy</th><th>Từ</th><th>Nhiệm vụ</th><th>Tới</th><th>Còn</th></tr>';
    for (i = 0; i < st.toi.length; i++) {
      var w = st.toi[i], pt = Number.isInteger(w.pi) && w.pi >= 0 && w.pi < st.planets.length ? st.planets[w.pi] : null;
      h += '<tr><td>' + U.esc(w.ten) + ' <span class="tag-lm">' + U.esc(w.lm || '') + '</span> <span class="mo">(NPC)</span></td>' +
        '<td class="sz">' + G.tdStr(w.tu) + '</td><td class="do">Tấn Công</td><td>' + (pt ? U.esc(U.scopeHanhTinh(pt)) : 'Mục tiêu chưa xác định · Chưa có dữ liệu') +
        '</td><td class="sz do">' + U.dem(w.den_t, '', 'alert.npc-attack:' + U.esc(w.id !== undefined ? w.id : i) + '.eta') + '</td></tr>';
    }
    for (i = 0; i < pvToi.length; i++) {
      var q2 = pvToi[i], p2 = U.htTheoKey(q2.den);
      var tenNV = q2.nv === 'attack' ? 'Tấn Công' : (q2.nv === 'hold' ? 'Giữ Chỗ' : 'Vận Chuyển');
      var lopNV = q2.nv === 'attack' ? 'do' : 'luc';
      h += '<tr><td><b class="' + (q2.nv === 'attack' ? 'cam' : 'luc') + '">' + U.esc(q2.ten) + '</b> ' +
        '<span class="tag-lm">' + U.esc(q2.lm || '') + '</span></td>' +
        '<td class="sz">[' + U.esc(q2.tu) + ']</td><td class="' + lopNV + '">' + tenNV + '</td><td>' +
        (p2 ? U.esc(p2.ten) + ' [' + U.esc(q2.den) + ']' : 'Mục tiêu chưa xác định · Chưa có dữ liệu [' + U.esc(q2.den) + ']') +
        '</td><td class="sz ' + lopNV + '">' + U.dem(q2.den_t, '', 'alert.' + U.esc(q2.nv === 'attack' ? 'pvp-attack:' + q2.id : 'friendly-inbound:' + q2.id) + '.eta') + '</td></tr>';
    }
    h += '</table><p class="mo">Trong mô phỏng hiện tại, hạm đội đang bay không bị chặn giữa đường — nếu không đỡ được, hãy cho hạm đội của mình ' +
      'bay đi trước khi địch tới. Đoàn Giữ Chỗ của đồng minh sẽ đóng quân và chi viện lớp quỹ đạo sau khi tới nơi. ' +
      'Muốn biết địch mang những gì thì phải gửi tàu do thám. Nhiệm vụ do thám của đối phương thì không hiện ở đây.</p>' +
      '</div></div>';
  }

  /* --- form điều hạm --- */
  h += '<div class="panel"><h2>Điều hạm đội từ ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) + '</h2><div class="noi">';
  h += '<div class="luoi2"><div>';
  h += '<div class="nhom-truong"><b>Mục tiêu</b><div class="hd-td cach-tren-2xs">' +
    '<input id="f-g" aria-label="Thiên hà mục tiêu" type="number" min="1" max="' + G.C.SO_THIEN_HA + '" value="' + f.den.g + '">:' +
    '<input id="f-h" aria-label="Hệ mục tiêu" type="number" min="1" max="' + G.C.SO_HE + '" value="' + f.den.h + '">:' +
    '<input id="f-p" aria-label="Ô mục tiêu" type="number" min="1" max="' + G.C.O_THAM_HIEM + '" value="' + f.den.p + '">' +
    '<button class="nut nho" data-act="gal-tu-form">Xem hệ này</button></div></div>';
  h += '<div class="nhom-truong"><b>Nhiệm vụ</b><br><select id="f-mission" aria-label="Nhiệm vụ hạm đội" class="cach-tren-2xs" style="width:100%">';
  for (i = 0; i < G.MISSIONS.length; i++)
    h += '<option value="' + G.MISSIONS[i].id + '"' + (f.mission === G.MISSIONS[i].id ? ' selected' : '') + '>' +
      G.MISSIONS[i].ten + '</option>';
  h += '</select><div class="mo ghi-chu">' +
    U.esc(G.byId(G.MISSIONS, f.mission).mota) + '</div></div>';
  h += '<div class="nhom-truong"><b>Tốc độ: <span id="f-pct-v">' + f.pct + '%</span></b><br>' +
    '<input id="f-pct" aria-label="Tốc độ hạm đội phần trăm" type="range" min="10" max="100" step="10" value="' + f.pct + '" style="width:100%"></div>';
  if (f.mission === 'hold')
    h += '<div class="nhom-truong"><b>Đóng quân quỹ đạo (giờ)</b><br><input id="f-giu" aria-label="Số giờ đóng quân quỹ đạo" type="number" min="1" max="24" value="' + f.giu + '">' +
      '<div class="mo ghi-chu">Chỉ dùng tại hành tinh của mình hoặc đồng minh. ' +
      'Nhiên liệu trả trước theo từng đoạn 6 giờ từ khoang hàng; thiếu một kỳ sau khi đã đậu thì hạm đội bị phá huỷ.</div></div>';
  h += '<div id="hd-tt">' + U.ttBay() + '</div>';
  h += '<button class="nut lon" data-act="gui">PHÁT LỆNH XUẤT KÍCH</button>';
  h += '</div><div>';

  h += '<b>Chọn tàu</b><div class="hd-luoi cach-tren-xs">';
  var coTau = false;
  for (i = 0; i < G.SHIPS.length; i++) {
    var s = G.SHIPS[i], co = p.ships[s.id] || 0;
    if (!co) continue;
    coTau = true;
    h += '<div class="hd-tau"><span>' + U.esc(s.ten) + '<br><span class="mo sz" data-live="unit.' + U.pi + '.ship.' + U.esc(s.id) + '.summary">có ' + G.so(co) + '</span></span>' +
      '<span><input id="ft-' + s.id + '" data-live="planet.' + U.pi + '.ship.' + U.esc(s.id) + '.available" aria-label="Số tàu ' + U.esc(s.ten) + '" type="number" min="0" max="' + co + '" value="' + (f.ships[s.id] || 0) + '">' +
      '<button class="nut nho" data-act="max-tau" data-id="' + s.id + '">Tất cả</button></span></div>';
  }
  if (!coTau) h += '<span class="mo">Chưa có tàu nào ở hành tinh này.</span>';
  h += '</div>';

  var choCo = G.sucChoLinh(f.ships), choCan = G.choLinhCan(f.linh || {});
  if (['attack', 'deploy', 'transport'].indexOf(f.mission) >= 0 && !G.trong(p.linh || {})) {
    h += '<b class="khoi-cach-tren-sm">Quân đổ bộ ' +
      '<span class="' + (choCan > choCo ? 'do' : 'mo') + ' sz">(' + G.so(choCan) + ' / ' + G.so(choCo) + ' chỗ)</span></b>' +
      '<div class="hd-luoi cach-tren-xs">';
    for (i = 0; i < G.BOBINH.length; i++) {
      var bb2 = G.BOBINH[i], coBB = (p.linh || {})[bb2.id] || 0;
      if (!coBB) continue;
      h += '<div class="hd-tau"><span>' + U.esc(bb2.ten) + '<br><span class="mo sz">có ' + G.so(coBB) +
        ' · ' + bb2.cho + ' chỗ</span></span>' +
        '<span><input id="fl-' + bb2.id + '" aria-label="Số quân ' + U.esc(bb2.ten) + '" type="number" min="0" max="' + coBB + '" value="' +
        ((f.linh || {})[bb2.id] || 0) + '">' +
        '<button class="nut nho" data-act="max-linh" data-id="' + bb2.id + '">Tất cả</button></span></div>';
    }
    h += '</div>';
  }
  h += '<b class="khoi-cach-tren-sm">Xếp hàng lên tàu</b><div class="hd-luoi cach-tren-xs">';
  for (i = 0; i < G.RES_HANH_TINH.length; i++) {
    var rid = G.RES_HANH_TINH[i], rr = G.byId(G.RES, rid);
    h += '<div class="hd-tau"><span><span class="res-nhan">' + U.chamRes(rr) + U.esc(rr.ten) + '</span><br><span class="mo sz">' +
      G.so(p.res[rid] || 0) + '</span></span><input id="fc-' + rid + '" aria-label="Lượng ' + U.esc(rr.ten) + ' xếp lên tàu" type="number" min="0" step="1000" value="' +
      (f.cargo[rid] || 0) + '"></div>';
  }
  h += '</div><button class="nut nho cach-tren-xs" data-act="max-hang">Xếp đầy khoang</button>';
  h += '</div></div></div></div>';
  return h;
};

/* ======================================================================
 * MÀN: THIÊN HÀ
 * ==================================================================== */
U.m_thienha = function () {
  var st = U.st(), p = U.ht();
  if (!U.gal) U.gal = { g: p.c.g, h: p.c.h };
  var g = U.gal.g, hh = U.gal.h;
  var ds = U.nguon.xemHe(g, hh);
  var d = G.diem(st);

  var h = '<div class="panel"><h2>Bản đồ thiên hà</h2><div class="noi">';
  h += '<div class="gal-dh">' +
    '<button class="nut nho" data-act="gal" data-dg="-1">◀ Thiên hà</button>' +
    'Thiên hà <input id="g-g" aria-label="Số thiên hà" type="number" min="1" max="' + G.C.SO_THIEN_HA + '" value="' + g + '" style="width:60px">' +
    '<button class="nut nho" data-act="gal" data-dg="1">▶</button>' +
    '<button class="nut nho" data-act="gal" data-dh="-1">◀ Hệ</button>' +
    'Hệ <input id="g-h" aria-label="Số hệ" type="number" min="1" max="' + G.C.SO_HE + '" value="' + hh + '" style="width:76px">' +
    '<button class="nut nho" data-act="gal" data-dh="1">▶</button>' +
    '<button class="nut nho oke" data-act="gal-di">Đi</button>' +
    '<button class="nut nho" data-act="gal-nha">Về hành tinh mẹ</button>' +
    '</div>';
  h += '<div class="bang-cuon"><table><tr><th>Ô</th><th>Hành tinh</th><th>Chỉ huy</th><th>Liên minh</th>' +
    '<th class="r">Điểm</th><th>Phế liệu</th><th>Hành động</th></tr>';
  if (APP.mp && !ds.length)
    h += '<tr><td colspan="7" class="mo">Đang tải dữ liệu hệ ' + g + ':' + hh + '…</td></tr>';
  for (var i = 0; i < ds.length; i++) {
    var o = ds[i], c = o.c;
    var cls = '';
    if (o.loai === 'trong' || o.loai === 'sau') cls = 'trong';
    else if (o.loai === 'toi') cls = 'toi';
    else if (o.loai === 'nguoi') cls = 'nguoi';
    else if (o.npc && o.npc.bo) cls = 'npc-bo';
    h += '<tr class="' + cls + '"><td class="sz">' + (o.loai === 'sau' ? '<span class="tim">' + c.p + '</span>' : c.p) + '</td>';
    if (o.loai === 'sau') {
      h += '<td class="tim">— vùng không gian sâu —</td><td class="mo">chỉ nhận nhiệm vụ Thám Hiểm</td><td></td><td class="r"></td>';
    } else if (o.loai === 'trong') {
      var Lt = G.LHT(G.loaiTheoViTri(st.seed, c));
      h += '<td class="mo">— trống — <span style="color:' + Lt.mau + '">' + U.esc(Lt.ten) + '</span></td><td></td><td></td><td class="r"></td>';
    } else if (o.loai === 'toi') {
      h += '<td><b>' + U.esc(o.p.ten) + '</b></td><td class="luc">' + U.esc(st.ten) + ' (ta)</td><td class="tag-lm">' +
        U.esc(st.lm ? st.lm.ten : '') + '</td><td class="r sz">' + G.so(d.tong) + '</td>';
    } else if (o.loai === 'nguoi') {
      h += '<td>' + U.esc(o.htTen) + '</td><td class="cam"><b>' + U.esc(o.ten) + '</b>' +
        (o.online ? ' <span class="luc" title="đang chơi">●</span>' : '') +
        (o.bo ? ' <span class="vang">(lâu không vào)</span>' : '') +
        '</td><td class="tag-lm">' + U.esc(o.lm || '') + '</td><td class="r sz">' + G.so(o.diem) + '</td>';
    } else {
      var n = o.npc;
      var Ln = G.LHT(G.loaiTheoViTri(st.seed, c));
      h += '<td>' + U.esc(n.htTen) + ' <span class="mo" style="color:' + Ln.mau + '">' + U.esc(Ln.ten) + '</span></td><td>' +
        U.esc(n.ten) + (n.bo ? ' <span class="vang">(bỏ hoang)</span>' : '') +
        '</td><td class="tag-lm">' + U.esc(n.lm) + '</td><td class="r sz">' + G.so(n.diem) + '</td>';
    }
    h += '<td class="pl">' + (o.debris ? G.soNgan(o.debris.metal) + ' KL / ' + G.soNgan(o.debris.crystal) + ' TA' : '') + '</td>';
    h += '<td class="khong-xuong-dong">';
    var td = c.g + ',' + c.h + ',' + c.p;
    if (o.loai === 'npc' || o.loai === 'nguoi') {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="spy">Do thám</button> ';
      if (o.loai === 'npc' || !APP.mp || (o.chien && o.chien.duoc))
        h += '<button class="nut nho xoa" data-act="nv" data-td="' + td + '" data-m="attack">Tấn công</button> ';
      else if (o.chien && o.chien.trang === 'dongminh')
        h += '<span class="luc sz">Đồng minh</span> ';
      else if (o.chien && o.chien.trang === 'cho')
        h += '<span class="vang sz">Được đánh sau ' + U.dem(o.chien.hieuLuc) + '</span> ';
      else if (!o.chien || o.chien.coQuyenTuyen !== false)
        h += '<button class="nut nho xoa" data-act="tuyen-chien" data-tk="' + o.tk + '" data-ten="' +
          U.esc(o.ten) + '">Tuyên chiến</button> ';
      else
        h += '<span class="mo sz">Chủ liên minh mới được tuyên chiến</span> ';
      if (st.spy && st.spy[o.key]) h += '<button class="nut nho" data-act="xem-tt" data-key="' + o.key + '">Tin tình báo</button> ';
    } else if (o.loai === 'sau') {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="thamhiem">Thám hiểm</button> ';
    } else if (o.loai === 'trong') {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="colonize">Thực dân</button> ';
    } else {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="transport">Vận chuyển</button> ';
    }
    if (o.loai === 'nguoi') {
      if (!APP.mp || (o.chien && o.chien.trang === 'dongminh')) {
        h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="transport">Tiếp tế</button> ';
        h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="hold">Đóng quân</button> ';
      }
      if (APP.mp) h += '<button class="nut nho" data-act="gui-thu" data-ten="' + U.esc(o.ten) + '">Gửi thư</button> ';
    }
    if (o.loai === 'toi' && !G.bang(c, p.c))
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="hold">Đóng quân</button> ';
    if (o.debris) h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="recycle">Thu hồi</button>';
    h += '</td></tr>';
  }
  h += '</table></div>';
  h += '<p class="mo">Vũ trụ có ' + G.C.SO_THIEN_HA + ' thiên hà × ' + G.C.SO_HE + ' hệ × ' + G.C.SO_HANH_TINH +
    ' hành tinh, sinh tất định từ hạt giống <b>' + U.esc(st.seed) + '</b>. ' +
    (APP.mp ? 'Ô màu <span class="cam">cam</span> là hành tinh của người chơi khác. Phải tuyên chiến và chờ Hội Đồng Bảo An 24 giờ trước khi đánh; chỉ đồng minh mới tiếp tế được cho nhau. '
            : 'Hành tinh <span class="vang">bỏ hoang</span> ít phòng thủ nhưng nhiều tài nguyên.') + '</p>';
  h += '</div></div>';
  return h;
};

/* ======================================================================
 * MÀN: LIÊN MINH / XẾP HẠNG
 * ==================================================================== */
U.m_lienminh = function () {
  var st = U.st();
  var h = '<div class="panel"><h2>Liên minh</h2><div class="noi">';
  if (st.lm) {
    h += '<h3>' + U.esc(st.lm.ten) + '</h3>';
    h += '<p>Gia nhập ngày ' + G.gio(st.lm.t * 1000) + '. Quyền lợi: <b>+5% sản lượng</b> toàn đế quốc, ' +
      'được đứng tên liên minh trên bảng xếp hạng' + (APP.mp ? ' và dùng kênh chat riêng' : '') + '.</p>';
    /* [v7] chính thể & phiếu — chỉ bản nhiều người có bảng phiếu thật */
    if (APP.mp && U.nguon.chinhThe) {
      var ctTen = { docTai: 'Độc Tài', danChu: 'Dân Chủ', congHoa: 'Cộng Hoà' };
      h += '<p>Chính thể: <b class="vang">' + (ctTen[U.nguon.chinhThe()] || 'Độc Tài') + '</b>' +
        (U.nguon.duocBau ? ' · ta là <b>đại biểu/bỏ phiếu được</b>' : '') + '</p>';
      var phieu = U.nguon.phieuDS ? U.nguon.phieuDS() : [];
      if (phieu.length) {
        h += '<div class="bang-cuon"><table><tr><th>Phiếu</th><th class="r">Tán thành / Chống</th>' +
          '<th class="r">Hạn</th><th class="r">Kết quả</th><th></th></tr>';
        for (var pv = 0; pv < phieu.length; pv++) {
          var P = phieu[pv];
          var mo = P.dangMo;
          h += '<tr><td>' + P.loai + ' #' + P.id + (P.doiTuong ? ' → #' + P.doiTuong : '') + '</td>' +
            '<td class="r sz luc">' + P.ung + '</td><td class="r sz do">' + P.chong + '</td>' +
            '<td class="r sz">' + (mo ? G.tg(P.hetHan - U.st().now) : (P.ketQua === 'dat' ? 'ĐẠT' : 'Không đạt')) + '</td>' +
            '<td class="r">' + (mo && U.nguon.duocBau ?
              '<button class="nut nho oke" data-act="bau-phieu" data-id="' + P.id + '" data-giatri="1">Tán thành</button> ' +
              '<button class="nut nho xoa" data-act="bau-phieu" data-id="' + P.id + '" data-giatri="0">Chống</button>' : '') +
            '</td></tr>';
        }
        h += '</table></div>';
      }
    }
    if (U.nguon.thanhVien) {
      var tv = U.nguon.thanhVien(st.lm.ten);
      if (tv && tv.length) {
        h += '<div class="bang-cuon"><table><tr><th>Thành viên</th><th class="r">Điểm</th><th class="r">Hành tinh</th>' +
          (APP.mp ? '<th></th>' : '') + '</tr>';
        for (var t = 0; t < tv.length; t++)
          h += '<tr' + (tv[t].ta ? ' class="toi"' : '') + '><td>' + U.esc(tv[t].ten) +
            (tv[t].chu ? ' <b class="vang">[Chủ]</b>' : '') + (tv[t].ta ? ' <b class="luc">(ta)</b>' : '') +
            '</td><td class="r sz">' + G.so(tv[t].diem) + '</td><td class="r sz">' + tv[t].ht + '</td>' +
            (APP.mp ? '<td class="r">' + (tv[t].ta ? '' : '<button class="nut nho" data-act="chuyen-galana" data-tk="' +
              tv[t].tk + '" data-ten="' + U.esc(tv[t].ten) + '">Chuyển Galana</button>') + '</td>' : '') + '</tr>';
        h += '</table></div>';
      }
    }
    h += '<button class="nut xoa cach-tren-xs" data-act="lm-ra">Rời liên minh</button>';
  } else {
    h += '<p class="mo">Gia nhập liên minh để nhận <b>+5% sản lượng</b> và danh nghĩa trên bảng xếp hạng. ' +
      (APP.mp ? 'Bản nhiều người còn có kênh chat riêng; chủ liên minh phải duyệt đơn trước khi thành viên được vào.' : '') + '</p>';
    var ds = U.nguon.dsLM();
    h += '<div class="bang-cuon"><table><tr><th>Liên minh</th><th class="r">Thành viên</th><th class="r">Tổng điểm</th><th></th></tr>';
    for (var i = 0; i < ds.length; i++) {
      var e = ds[i];
      var daXin = U.nguon.daXin && U.nguon.daXin(e.ten);
      var sl = e.sl, dm = e.diem;
      if (sl === undefined) {
        sl = 0; dm = 0;
        var xh = U.nguon.xepHang();
        for (var j = 0; j < xh.length; j++) if (xh[j].lm === e.ten) { sl++; dm += xh[j].diem; }
      }
      h += '<tr><td class="tag-lm">' + U.esc(e.ten) + '</td><td class="r sz">' + G.so(sl) + '</td><td class="r sz">' + G.so(dm) +
        '</td><td class="r"><button class="nut nho oke" data-act="lm-vao" data-ten="' + U.esc(e.ten) + '"' +
        (daXin ? ' disabled' : '') + '>' + (daXin ? 'Đã gửi đơn' : 'Xin vào') + '</button></td></tr>';
    }
    h += '</table></div>';
  }
  h += '</div></div>';
  return h;
};

/* [v7] Ngân Hàng & Thị Trường — bộ ba tài chính của bản gốc:
 * ngân hàng lãi 0,07–2%/ngày, siêu thị giá gốc thuế 10%, tự do thuế 5% giao 6h. */
U.tabTC = 'nganhang';
U.idDonHuy = function (don) {
  if (APP.mp && don && don.choId !== undefined && don.choId !== null) return don.choId;
  return don ? don.id : '';
};

U.m_taichinh = function () {
  var st = U.st(), p = U.ht();
  var tab = U.tabTC || 'nganhang';
  var tenTab = { nganhang: 'Ngân Hàng Vũ Trụ', sieuthi: 'Siêu Thị Thiên Hà', tudo: 'Thị Trường Tự Do' };
  var h = '<div class="panel"><h2>Tài Chính Đế Quốc</h2><div class="noi">';
  h += '<div class="gal-dh">';
  for (var tb in tenTab)
    h += '<button class="nut nho' + (tab === tb ? ' oke' : '') + '" data-act="tab-tc" data-tab="' + tb + '">' + tenTab[tb] + '</button> ';
  h += '</div>';

  if (tab === 'nganhang') {
    var laiNgay = G.laiNganHangNgay(st.nganHang.soDu);
    h += '<table class="cach-tren-xs"><tr><td>Số dư gửi</td><td class="r sz">' + G.so(st.nganHang.soDu) + ' Galana</td></tr>' +
      '<tr><td>Lãi hiện tại</td><td class="r sz luc">' + (laiNgay * 100).toFixed(2) + '%/ngày' +
      (st.nganHang.laiLuc >= 1 ? ' (+' + G.so(Math.floor(st.nganHang.laiLuc)) + ' chờ kết toán)' : '') + '</td></tr>' +
      '<tr><td>Uranium</td><td class="r sz">' + G.so(st.uranium || 0) + '</td></tr>' +
      '<tr><td>Lương gián điệp</td><td class="r sz ' +
      ((Number(st.luongGD.traLuc) || 0) > 0 || st.luongGD.phanBoi ? 'do' : 'luc') + '">' +
      (st.luongGD.phanBoi ? 'PHẢN BỘI! Nợ ' + G.so(Math.ceil(st.luongGD.traLuc)) + ' NL' :
        (Number(st.luongGD.traLuc) > 0 ? 'Nợ ' + G.so(Math.ceil(st.luongGD.traLuc)) + ' NL — trả ngay!' : 'Đang trả đúng hạn')) +
      '</td></tr></table>';
    if ((Number(st.luongGD.traLuc) || 0) > 0)
      h += '<button class="nut nho oke" data-act="tra-luong">Trả lương gián điệp ngay</button>';
    h += '<div>Gửi <input id="nh-gui" aria-label="Số Galana gửi ngân hàng" type="number" min="1" style="width:120px"> Galana ' +
      '<button class="nut nho oke" data-act="gui-nh">Gửi</button> ' +
      '<button class="nut nho" data-act="rut-nh-all">Rút hết</button></div>';
    h += '<div class="cach-tren-xs">Rút <input id="nh-rut" aria-label="Số Galana rút ngân hàng" type="number" min="1" style="width:120px"> Galana ' +
      '<button class="nut nho" data-act="rut-nh">Rút</button></div>';
    /* đầu tư siêu thị */
    h += '<h3 class="cach-tren-sm">Đầu Tư Siêu Thị Thiên Hà</h3>';
    if ((st.dauTuST.ketThucAt || 0) > st.now) {
      h += '<p>Đang đầu tư <b>' + G.so(st.dauTuST.von) + '</b> Galana — đáo hạn ' + G.tg(st.dauTuST.ketThucAt - st.now) +
        '. Không rút giữa kỳ được [XÁC NHẬN].</p>';
    } else {
      h += '<div>Đầu tư <input id="st-von" aria-label="Số Galana đầu tư siêu thị" type="number" min="1" style="width:120px"> Galana (khoá 7 ngày, chia lợi nhuận thuế) ' +
        '<button class="nut nho oke" data-act="dau-tu-st">Đầu tư</button></div>';
    }
    /* uranium */
    h += '<h3 class="cach-tren-sm">Uranium: <b>' + G.so(st.uranium || 0) + '</b></h3>';
    h += '<div><button class="nut nho" data-act="tang-toc"' + (p.qB.length && p.qB[0].xong ? '' : ' disabled') + '>Tăng tốc lô đang xây (' +
      G.KINH_TE_V1.uraniumTangToc + ' Ur)</button> ' +
      '<button class="nut nho" data-act="mua-diem">Mua 1 điểm Kỹ Thuật (' + G.KINH_TE_V1.uraniumMotDiem + ' Ur)</button></div>';
  } else {
    /* thị trường: đơn đối tác */
    var donNgoai = [];
    if (!APP.mp) donNgoai = G.npcCho(st);
    else if (U.nguon.choDonNgoai) donNgoai = U.nguon.choDonNgoai(tab);
    h += '<h4 class="cach-tren-sm">' + (tab === 'sieuthi' ? 'Hàng đang bán (giá gốc, giao ngay)' : 'Đơn chào bán (tự định giá, hàng về sau 6 giờ)') + '</h4>';
    h += '<div class="bang-cuon"><table><tr><th>Tài nguyên</th><th class="r">Còn</th><th class="r">Giá GL/đơn vị</th><th class="r">Mua số lượng</th><th></th></tr>';
    for (var i = 0; i < donNgoai.length; i++) {
      var d = donNgoai[i];
      if (d.loai !== tab && !(d.npc && tab === 'sieuthi')) continue;
      h += '<tr><td><span class="res-nhan">' + U.chamRes(G.byId(G.RES, d.res)) + U.esc(G.byId(G.RES, d.res).ten) + '</span></td>' +
        '<td class="r sz">' + G.so(d.soConLai) + '</td><td class="r sz">' + G.so(d.gia) + '</td>' +
        '<td class="r"><input id="mua-' + d.id + '" aria-label="Số lượng ' + U.esc(G.byId(G.RES, d.res).ten) + ' cần mua" type="number" min="1" style="width:100px"></td>' +
        '<td class="r"><button class="nut nho oke" data-act="mua-don" data-id="' + d.id + '">Mua</button></td></tr>';
    }
    h += '</table></div>';
    /* đơn của ta */
    var donTa = (st.choDon || []).filter(function (x) { return !x.npc; });
    if (donTa.length) {
      h += '<h4 class="cach-tren-sm">Đơn đang mở của ta</h4><div class="bang-cuon"><table>' +
        '<tr><th>Tài nguyên</th><th class="r">Còn</th><th class="r">Giá</th><th class="r">' +
        (donTa[0].daBan ? 'Đã bán / Thu nhập sau thuế' : '') + '</th><th></th></tr>';
      for (var j = 0; j < donTa.length; j++) {
        var dj = donTa[j];
        if (dj.loai !== tab) continue;
        var idHuy = U.idDonHuy(dj);
        h += '<tr><td><span class="res-nhan">' + U.chamRes(G.byId(G.RES, dj.res)) + U.esc(G.byId(G.RES, dj.res).ten) + '</span></td>' +
          '<td class="r sz">' + G.so(dj.soConLai) + '</td><td class="r sz">' + G.so(dj.gia) + '</td>' +
          '<td class="r sz">' + (dj.daBan ? G.so(dj.daBan) + ' / ' + G.so(dj.thuNhap || 0) : '') + '</td>' +
          '<td class="r"><button class="nut nho xoa" data-act="huy-don" data-id="' + U.esc(String(idHuy)) + '">Huỷ</button></td></tr>';
      }
      h += '</table></div>';
    }
    /* đăng bán */
    h += '<h4 class="cach-tren-sm">Đăng bán từ ' + U.esc(p.ten) + '</h4><table><tr>';
    for (var r2 = 0; r2 < G.RES_HANH_TINH.length; r2++) {
      var resId = G.RES_HANH_TINH[r2];
      h += '<td><span class="res-nhan">' + U.chamRes(G.byId(G.RES, resId)) + U.esc(G.byId(G.RES, resId).ky) +
        '</span>: <input id="ban-' + resId + '" aria-label="Số lượng ' + U.esc(G.byId(G.RES, resId).ten) + ' đăng bán" type="number" min="0" style="width:90px"></td>';
    }
    if (tab === 'tudo') h += '<td>Giá GL: <input id="ban-gia" aria-label="Giá Galana mỗi đơn vị" type="number" min="1" style="width:90px"></td>';
    h += '<td><button class="nut nho oke" data-act="dang-ban" data-loai="' + tab + '">Đăng bán</button></td></tr></table>';
    if (tab === 'tudo') {
      h += '<p class="mo">Thuế 5%. Hàng đến tay người mua sau 6 giờ — đúng nhịp bảo trì của bản gốc.</p>';
    }
    /* hàng đang về */
    var dangVe = [];
    for (var pi = 0; pi < st.planets.length; pi++)
      for (var g2 = 0; g2 < (st.planets[pi].giaoHang || []).length; g2++)
        dangVe.push({ p: st.planets[pi].ten, hang: st.planets[pi].giaoHang[g2] });
    if (dangVe.length) {
      h += '<h4 class="cach-tren-sm">Hàng đang về</h4><ul>';
      for (var v3 = 0; v3 < dangVe.length; v3++)
        h += '<li>' + G.so(dangVe[v3].hang.so) + ' ' + G.byId(G.RES, dangVe[v3].hang.res).ten + ' → ' +
          U.esc(dangVe[v3].p) + ' (còn ' + G.tg(dangVe[v3].hang.xongAt - st.now) + ')</li>';
      h += '</ul>';
    }
  }
  h += '</div></div>';
  return h;
};

U.XH_LOAI = [
  { id: 'tong', ten: 'Tổng điểm' },
  { id: 'ct', ten: 'Công trình' },
  { id: 'nc', ten: 'Nghiên cứu' },
  { id: 'ham', ten: 'Hạm đội' },
  { id: 'thu', ten: 'Phòng thủ' }
];
U.xhLoai = 'tong';

U.m_xephang = function () {
  var st = U.st(), xh = U.nguon.xepHang(U.xhLoai) || [];
  var h = '<div class="panel"><h2>Bảng xếp hạng vũ trụ</h2><div class="noi">';
  h += '<div class="gal-dh">Xếp theo: ';
  for (var t = 0; t < U.XH_LOAI.length; t++) {
    var L = U.XH_LOAI[t];
    h += '<button class="nut nho ' + (U.xhLoai === L.id ? 'oke' : '') + '" data-act="xh-loai" data-loai="' + L.id + '">' +
      L.ten + '</button>';
  }
  h += '</div>';
  var ta = null;
  for (var z = 0; z < xh.length; z++) if (xh[z].ta) ta = xh[z];
  if (ta) h += '<p>Ta đang đứng <b class="cam">hạng ' + ta.hang + '</b> / ' + xh.length +
    ' ở hạng mục <b>' + U.esc(G.byId(U.XH_LOAI, U.xhLoai).ten) + '</b>.</p>';
  h += '<div class="bang-cuon"><table><tr><th class="r">Hạng</th><th>Chỉ huy</th><th>Liên minh</th>' +
    '<th class="r">Điểm</th><th class="r">Tổng</th><th class="r">Hành tinh</th></tr>';
  for (var i = 0; i < xh.length; i++) {
    var e = xh[i];
    h += '<tr' + (e.ta ? ' class="toi"' : '') + '><td class="r sz">' + e.hang + '</td><td>' +
      U.esc(e.ten) + (e.ta ? ' <b class="luc">(ta)</b>' : '') + '</td><td class="tag-lm">' + U.esc(e.lm) +
      '</td><td class="r sz"><b>' + G.so(e.diem) + '</b></td><td class="r sz mo">' + G.so(e.tong === undefined ? e.diem : e.tong) +
      '</td><td class="r sz">' + e.ht + '</td></tr>';
  }
  h += '</table></div>';
  if (!xh.length) h += '<span class="mo">Chưa có dữ liệu xếp hạng.</span>';
  h += '</div></div>';
  void st;
  return h;
};

/* ======================================================================
 * MÀN: TIN NHẮN (kèm báo cáo chiến đấu / tình báo)
 * ==================================================================== */
U.veBaoCao = function (d) {
  var kq = d.kq, h = '<div class="bc">';
  var nhan = { thang: 'BÊN TẤN CÔNG THẮNG', thua: 'BÊN PHÒNG THỦ THẮNG', hoa: 'HAI BÊN CẦM CỰ — KHÔNG PHÂN THẮNG BẠI', huyDiet: 'CẢ HAI BÊN BỊ XOÁ SỔ' };
  var taThang = (d.ben === 'ta' && kq.kq === 'thang') || (d.ben === 'dich' && (kq.kq === 'thua' || kq.kq === 'huyDiet'));
  h += '<div class="kq ' + (taThang ? 'thang' : (kq.kq === 'hoa' ? 'hoa' : 'thua')) + '"><b>' + nhan[kq.kq] + '</b><br>' +
    'Tấn công: ' + U.esc(kq.tenA) + ' &nbsp;·&nbsp; Phòng thủ: ' + U.esc(kq.tenD) + ' &nbsp;·&nbsp; Toạ độ ' + G.tdStr(d.td) +
    (kq.loaiHT ? ' &nbsp;·&nbsp; hành tinh <b>' + U.esc(kq.loaiHT) + '</b>' +
      (kq.thuDat && kq.thuDat !== 1 ? ' <span class="mo">(phòng thủ mặt đất ×' + kq.thuDat + ')</span>' : '') : '') +
    '</div>';

  h += '<table><tr><th>Vòng</th><th class="r">Lực tấn công</th><th class="r">Lực phòng thủ</th><th class="r">Đơn vị còn (A)</th><th class="r">Đơn vị còn (D)</th><th>Ghi chú</th></tr>';
  for (var i = 0; i < kq.vongDanh.length; i++) {
    var v = kq.vongDanh[i];
    h += '<tr><td class="c">' + v.vong + '</td><td class="r sz">' + G.soNgan(v.lucA) + '</td><td class="r sz">' + G.soNgan(v.lucD) +
      '</td><td class="r sz">' + G.so(v.conA) + '</td><td class="r sz">' + G.so(v.conD) + '</td><td class="mo">' +
      (v.haDoCao ? 'lớp quỹ đạo đã bị dẹp — hạm đội hạ độ cao'
        : (v.matDat ? 'hạm đội đã xuống tầng khí quyển — phòng thủ mặt đất tham chiến' : 'giao chiến trên quỹ đạo')) + '</td></tr>';
  }
  h += '</table>';

  h += '<div class="luoi"><div><b>Bên tấn công mất</b><br>' + U.dsTau(kq.matA) +
    '<br><b>Còn lại</b><br>' + U.dsTau(kq.conShipsA) + '</div>';
  h += '<div><b>Bên phòng thủ mất</b><br>' + U.dsTau(kq.matD) +
    '<br><b>Còn lại</b><br>' + U.dsTau(kq.conShipsD) + ' ' + U.dsTau(kq.conDefD);
  if (kq.matDPha && !G.trong(kq.matDPha))
    h += '<br><span class="mo">Công sự bị phá trong trận: ' + U.dsTau(kq.matDPha) +
      ' — ' + Math.round(G.C.SUA_CONG_SU * 100) + '% trong số đó được dựng lại sau trận.</span>';
  h += '</div></div>';

  if (d.doBo) {
    var db = d.doBo, kb = db.kq;
    h += '<div class="kq ' + (db.thang ? (d.ben === 'ta' ? 'thang' : 'thua') : (d.ben === 'ta' ? 'thua' : 'thang')) + '">' +
      '<b>PHA ĐỔ BỘ — ' + (db.thang ? 'QUÂN ĐỔ BỘ LÀM CHỦ MẶT ĐẤT' : 'CUỘC ĐỔ BỘ BỊ ĐẨY LÙI') + '</b>' +
      '<br><span class="mo">Quỹ đạo vỡ rồi, Đại Chiến Hạm mới thả quân xuống.</span></div>';
    h += '<div class="luoi"><div><b>Quân đổ bộ mất</b><br>' + U.dsTau(kb.matA) +
      '<br><b>Còn lại</b><br>' + U.dsTau(kb.conBoA) + '</div>' +
      '<div><b>Bên giữ đất mất</b><br>' + U.dsTau(kb.matD) +
      '<br><b>Còn lại</b><br>' + U.dsTau(kb.conBoD) + ' ' + U.dsTau(kb.conDefD) + '</div></div>';
    var soCTPha = db.phaCT && (db.phaCT.soLuong !== undefined ? db.phaCT.soLuong : db.phaCT.soCap);
    if (db.phaCT && soCTPha)
      h += '<p><b class="do">Công trình bị san phẳng:</b> ' + U.esc(G.moTaPhaCT(db.phaCT.pha)) +
        ' <span class="mo">(tổng ' + G.so(soCTPha) + (db.phaCT.soLuong !== undefined ? ' công trình' : ' cấp') +
        (db.phaCT.chamTran ? ', đã chạm trần ' + Math.round(G.C.PHA_CT_TOI_DA * 100) + '% mỗi trận' : '') + ')</span></p>';
    else if (db.thang)
      h += '<p class="mo">Làm chủ mặt đất nhưng không đủ sức phá công trình nào — cần nhiều Robot/Tank hơn.</p>';
  }
  h += '<p><b>Cướp được:</b> ' + U.dsRes(d.cuop) + '<br>' +
    '<b>Bãi phế liệu tạo ra:</b> ' + G.so(d.pl.metal) + ' Kim Loại, ' + G.so(d.pl.crystal) + ' Thạch Anh ' +
    '<span class="mo">(dùng Tàu Thu Hồi để vét)</span></p>';
  h += '</div>';
  return h;
};

U.veDoTham = function (bc) {
  var h = '<div class="bc">';
  h += '<p><b>' + U.esc(bc.ten) + '</b> ' + (bc.lm ? '<span class="tag-lm">' + U.esc(bc.lm) + '</span>' : '') +
    ' — hành tinh <b>' + U.esc(bc.ht) + '</b> ' + G.tdStr(bc.td) +
    '<br>Điểm: <span class="sz">' + G.so(bc.diem) + '</span>' + (bc.bo ? ' <span class="vang">· bỏ hoang</span>' : '') +
    '<br><span class="mo">Độ chi tiết báo cáo: mức ' + bc.mucDo + '/5' +
    (bc.mat ? ' · mất ' + bc.mat + ' tàu do thám vì bị phản tình báo' : '') + '</span></p>';
  h += '<b>Tài nguyên</b><br>' + U.dsRes(bc.res) + '<br><br>';
  if (bc.danSu) h += '<b>Dân sự</b><br>Dân số <span class="sz">' + G.so(bc.danSu.population) +
    '</span> · Ủng hộ ' + U.bp(bc.danSu.supportBp) + ' · Thuế ' + U.bp(bc.danSu.taxBp) + '<br><br>';
  else if (bc.pvp) h += '<b>Dân sự</b><br><span class="mo">không đủ cấp Công Nghệ Tình Báo để thấy</span><br><br>';
  h += '<b>Hạm đội</b><br>' + (bc.ships ? U.dsTau(bc.ships) : '<span class="mo">không đủ cấp Công Nghệ Tình Báo để thấy</span>') + '<br><br>';
  h += '<b>Phòng thủ</b><br>' + (bc.def ? U.dsTau(bc.def) : '<span class="mo">không đủ cấp Công Nghệ Tình Báo để thấy</span>') + '<br><br>';
  h += '<b>Công nghệ</b><br>';
  if (bc.tech) {
    var out = [];
    for (var k in bc.tech) { var r = G.R(k); out.push((r ? r.ten : k) + ' cấp ' + bc.tech[k]); }
    h += out.join(', ');
  } else h += '<span class="mo">không đủ cấp Công Nghệ Tình Báo để thấy</span>';
  h += '<br><br><b>Công trình</b><br>';
  if (bc.ct) {
    var ct = [];
    for (var kc in bc.ct) {
      var bd = G.B(kc);
      ct.push((bd ? bd.ten : kc) + (bc.ctMode === 'quantity' ? ' ×' : ' đơn vị cấp từ báo cáo cũ ') + G.so(bc.ct[kc]));
    }
    h += ct.length ? ct.join(', ') : '<span class="mo">không có</span>';
  } else h += '<span class="mo">không đủ cấp Công Nghệ Tình Báo để thấy</span>';
  h += '<p class="mo">Báo cáo lúc ' + G.gio(bc.t * 1000) + '. Càng gửi nhiều tàu do thám và cấp Công Nghệ Tình Báo càng cao thì càng thấy nhiều.</p>';
  h += '</div>';
  return h;
};

U.veBaoCaoTenLua = function (d) {
  var t = d.tl, h = '<div class="bc">';
  var taBan = d.ben === 'ta';
  var soPha = 0, k;
  for (k in t.pha) soPha += t.pha[k];
  h += '<div class="kq ' + (taBan ? (soPha ? 'thang' : 'hoa') : (soPha ? 'thua' : 'thang')) + '"><b>' +
    (taBan ? 'TA BẮN ' + G.so(d.soBan) + ' TÊN LỬA VÀO ' + U.esc(d.ten)
           : U.esc(d.ten) + ' BẮN ' + G.so(d.soBan) + ' TÊN LỬA VÀO TA') +
    '</b><br>Toạ độ ' + G.tdStr(d.td) + '</div>';
  h += '<table><tr><td>Số quả phóng đi</td><td class="r sz">' + G.so(d.soBan) + '</td></tr>' +
    '<tr><td>Bị Tên Lửa Đánh Chặn hạ</td><td class="r sz ' + (t.chan ? 'luc' : '') + '">' + G.so(t.chan) + '</td></tr>' +
    '<tr><td>Nổ trúng mục tiêu</td><td class="r sz">' + G.so(t.no) + '</td></tr></table>';
  h += '<p><b>Phòng thủ mặt đất bị phá:</b> ' + U.esc(G.moTaPha(t.pha)) + '</p>';
  h += '<p class="mo">Tên lửa không đụng tới lớp quỹ đạo, không phá công trình, không cướp tài nguyên, ' +
    'và công sự bị tên lửa phá thì mất hẳn — không được dựng lại như sau một trận đánh thường.</p></div>';
  return h;
};

U.HU = { he: 'Hệ thống', tran: 'Chiến báo', tt: 'Tình báo', bt: 'Bảo trì', ham: 'Hạm đội',
  nc: 'Nghiên cứu', canh: 'Báo động', thu: 'Thư' };

U.m_tinnhan = function () {
  var st = U.st();
  var h = '<div class="panel"><h2>Hộp tin (' + st.msgs.length + ')</h2><div class="noi">' +
    '<button class="nut nho" data-act="doc-het">Đánh dấu đã đọc</button> ' +
    '<button class="nut nho xoa" data-act="xoa-tin">Xoá hết tin</button></div></div>';
  if (!st.msgs.length) return h + '<div class="panel"><div class="noi mo">Chưa có tin nào.</div></div>';
  for (var i = 0; i < st.msgs.length; i++) {
    var m = st.msgs[i], mo = !!U.moTin[m.id], idTin = U.esc(String(m.id));
    h += '<div class="tn' + (m.doc ? '' : ' moi') + '"><button type="button" class="d" data-act="doc-tin" data-id="' + idTin +
      '" aria-expanded="' + (mo ? 'true' : 'false') + '" aria-controls="tin-noi-' + idTin + '">' +
      '<span><span class="hu">' + U.esc(U.HU[m.loai] || m.loai) + '</span> ' + U.esc(m.td) + '</span>' +
      '<span class="mo sz">' + G.gio(m.t * 1000) + '</span></button>';
    if (mo) {
      h += '<div class="n" id="tin-noi-' + idTin + '">';
      if (m.data && m.data.tl) h += U.veBaoCaoTenLua(m.data);
      else if (m.data && m.data.kq) h += U.veBaoCao(m.data);
      else if (m.data && m.data.bc) h += U.veDoTham(m.data.bc);
      else h += '<pre class="nd">' + U.esc(m.nd) + '</pre>';
      h += '</div>';
    }
    h += '</div>';
  }
  return h;
};

/* ======================================================================
 * MÀN: NHẬT KÝ & LƯU
 * ==================================================================== */
U.m_nhatky = function () {
  var st = U.st(), d = G.diem(st), bt = U.bt(st);
  var h = '<div class="luoi2">';
  h += '<div class="panel"><h2>Thống kê chiến dịch</h2><div class="noi"><table>' +
    '<tr><td>Chỉ huy</td><td class="r">' + U.esc(st.ten) + '</td></tr>' +
    '<tr><td>Hạt giống vũ trụ</td><td class="r sz">' + U.esc(st.seed) + '</td></tr>' +
    '<tr><td>Bắt đầu</td><td class="r">' + G.gio(st.t0 * 1000) + '</td></tr>' +
    '<tr><td>Thời gian chơi</td><td class="r sz">' + G.tg(st.now - st.t0) + '</td></tr>' +
    '<tr><td>Chu kỳ bảo trì đã qua</td><td class="r sz">' + bt.cycle + '</td></tr>' +
    '<tr><td>Kỳ bảo trì lỡ liên tiếp</td><td class="r sz">' + bt.missStreak + '</td></tr>' +
    '<tr><td>Tổng điểm</td><td class="r sz">' + G.so(d.tong) + '</td></tr>' +
    '<tr><td>Trận thắng / thua</td><td class="r sz">' + st.stats.thang + ' / ' + st.stats.thua + '</td></tr>' +
    '<tr><td>Tài nguyên cướp được</td><td class="r sz">' + G.so(st.stats.cuop) + '</td></tr>' +
    '<tr><td>Tàu địch bắn hạ</td><td class="r sz">' + G.so(st.stats.tauDietDich) + '</td></tr>' +
    '<tr><td>Tàu của ta bị mất</td><td class="r sz">' + G.so(st.stats.tauMat) + '</td></tr>' +
    '<tr><td>Chuyến bay đã điều</td><td class="r sz">' + G.so(st.stats.chuyenBay) + '</td></tr>' +
    '</table></div></div>';

  h += '<div class="panel"><h2>Lưu &amp; nạp</h2><div class="noi">' +
    '<p class="mo">Bàn chơi tự lưu vào bộ nhớ trình duyệt mỗi 15 giây. Thời gian vẫn chạy khi đóng game: ' +
    'mở lại là engine tua lại toàn bộ sản xuất, chuyến bay và chu kỳ bảo trì đã diễn ra.</p>' +
    '<button class="nut nho" data-act="luu">Lưu ngay</button> ' +
    '<button class="nut nho" data-act="xuat">Xuất file</button> ' +
    '<button class="nut nho" data-act="nhap">Nạp file</button> ' +
    '<button class="nut nho xoa" data-act="xoa-game">Xoá bàn &amp; chơi lại</button>' +
    '<input type="file" id="file-nhap" accept=".json" style="display:none">' +
    '</div></div>';
  h += '</div>';

  h += '<div class="panel"><h2>Nhật ký</h2><div class="noi">';
  if (!st.nk.length) h += '<span class="mo">Chưa có gì.</span>';
  else for (var i = 0; i < st.nk.length; i++)
    h += '<div><span class="hu sz">' + G.gio(st.nk[i].t * 1000) + '</span> ' + U.esc(st.nk[i].s) + '</div>';
  h += '</div></div>';
  return h;
};

/* ======================================================================
 * MÀN: HƯỚNG DẪN
 * ==================================================================== */
U.m_huongdan = function () {
  var st = U.st(), p = U.ht();
  var h = '';

  h += '<div class="panel"><h2>Bắt đầu từ đâu</h2><div class="noi">';
  h += '<p class="mo">Người chỉ huy không có level riêng. Sức mạnh hiện tại = số lượng công trình, cấp nghiên cứu và số tàu. ' +
    'Đúng với tư liệu gốc, công trình được xây theo lô và có thể lên tới hàng nghìn; các hệ số cân bằng cụ thể là phần tái dựng.</p>';
  h += '<table><tr><th style="width:34px">#</th><th>Việc</th><th>Vì sao</th></tr>' +
    '<tr><td class="c">1</td><td>Dựng những lô đầu tiên của <b>Mỏ Kim Loại</b> và <b>Mỏ Thạch Anh</b></td>' +
    '<td class="mo">Mọi thứ khác đều cần hai thứ này.</td></tr>' +
    '<tr><td class="c">2</td><td>Xây đủ <b>Nhà Máy Điện Mặt Trời</b> theo số mỏ</td>' +
    '<td class="mo">Thiếu điện thì mỏ chỉ chạy cầm chừng — xem ô "Điện" trên thanh trên, phải đạt 100%.</td></tr>' +
    '<tr><td class="c">3</td><td><b>Trang Trại Sinh Quyển</b> lên sớm</td>' +
    '<td class="mo">Hết Thực Phẩm là hành tinh bị đói: sản lượng còn một nửa và hạm đội không xuất kích được.</td></tr>' +
    '<tr><td class="c">4</td><td><b>Nhà Máy Robot</b> → <b>Xưởng Đóng Tàu</b> → <b>Phòng Nghiên Cứu</b></td>' +
    '<td class="mo">Robot làm mọi thứ xây nhanh hơn; xưởng mở ra hạm đội; phòng nghiên cứu mở ra công nghệ.</td></tr>' +
    '<tr><td class="c">5</td><td>Nghiên cứu <b>Động Cơ Đốt</b>, đóng vài <b>Tàu Do Thám</b></td>' +
    '<td class="mo">Do thám trước khi đánh — đây là thói quen sống còn của thể loại này.</td></tr>' +
    '<tr><td class="c">6</td><td>Xây <b>Kho</b> khi thấy tài nguyên chạm trần</td>' +
    '<td class="mo">Kho đầy thì phần sản xuất thêm bị mất trắng.</td></tr>' +
    '</table></div></div>';

  /* 5 loại hành tinh — lấy nguyên từ tư liệu bản gốc */
  h += '<div class="panel"><h2>Năm loại hành tinh</h2><div class="noi">';
  h += '<p class="mo">Đây là mô tả có thật của bản gốc: "sau nhiều năm nghiên cứu, các nhà khoa học đã xác định ' +
    'được 5 loại hành tinh". Vị trí trong hệ quyết định loại: gần Mặt Trời là Sa Mạc, xa là Băng Hà.</p>';
  h += '<div class="bang-cuon"><table><tr><th>Loại</th><th>Đặc điểm</th><th class="r">Ô đất</th>' +
    '<th class="r">KL</th><th class="r">TA</th><th class="r">NL</th><th class="r">TP</th>' +
    '<th class="r">Điện</th><th class="r">Thủ đất</th></tr>';
  for (var li = 0; li < G.LOAI_HT.length; li++) {
    var L2 = G.LOAI_HT[li];
    h += '<tr><td><b style="color:' + L2.mau + '">' + U.esc(L2.ten) + '</b></td><td class="mo">' +
      U.esc(L2.mota) + '</td>' +
      ['oDat', 'kl', 'tt', 'dt', 'lt', 'dien', 'thuDat'].map(function (k) {
        var v = L2[k];
        return '<td class="r sz ' + (v > 1 ? 'luc' : (v < 1 ? 'do' : 'mo')) + '">×' + v + '</td>';
      }).join('') + '</tr>';
  }
  h += '</table></div><p class="mo">Hành tinh mẹ luôn là Ôn Hoà. Đi thực dân thì chọn loại hợp với thứ mình thiếu: ' +
    'Sa Mạc để lấy Kim Loại, Nước – Đầm Lầy để lấy Nhiên Liệu, Băng Hà để lấy Thạch Anh và thủ mặt đất, Rừng Già để nuôi quân.</p>';
  h += '</div></div>';

  h += '<div class="luoi2">';
  h += '<div class="panel"><h2>Các cơ chế riêng của Thiên Hà Đại Chiến</h2><div class="noi">' +
    '<p><b class="cam">1. Chu kỳ bảo trì 6 giờ.</b> Cứ 6 giờ thực, đế quốc bị trừ phí bảo trì bằng <b>Galana</b>, ' +
    'tính theo quy mô hạm đội + phòng thủ + công trình. Phải đủ nguyên khoản; lỡ nhiều kỳ liên tiếp sẽ lần lượt ' +
    'làm nghiên cứu trễ, dân rời đi rồi công trình xuống cấp. Xem đồng hồ "Bảo trì sau" ở thanh trên. ' +
    'Bí tiền thì gửi tiết kiệm sớm ở <b>Ngân Hàng Vũ Trụ</b> (màn Ngân Hàng &amp; Thị Trường) hoặc đăng bán tài nguyên. ' +
    '<i>Trung Tâm Bảo Trì</i> giảm tới 60% khoản phí này.</p>' +
    '<p><b class="cam">2. Nghiên cứu trả dần.</b> Không trừ chi phí lúc xếp đề tài. Toàn bộ Kim Loại, Thạch Anh, ' +
    'Nhiên Liệu, Kỹ Thuật… được chia thành các khoản ở nhịp 6 giờ. Thiếu một loại thì kỳ đó không trừ gì và ' +
    'mốc hoàn thành trễ đúng 6 giờ.</p>' +
    '<p><b class="cam">3. Dân số, ủng hộ và thuế.</b> Thành Phố mở sức chứa. Thiếu Thực Phẩm làm giảm ủng hộ và ' +
    'khiến phần dân trên sàn 250.000 rời đi ở checkpoint; thuế cao kiếm Galana nhanh hơn nhưng gây áp lực ủng hộ.</p>' +
    '<p><b class="cam">4. Phòng thủ hai lớp.</b> Lớp <b>quỹ đạo</b> (vệ tinh, trạm phòng không, khiên) đánh ngay từ ' +
    'vòng 1. Hạm đội địch chỉ hạ xuống tầng khí quyển và đụng lớp <b>mặt đất</b> (tên lửa, laser, gauss, plasma) ' +
    'từ vòng ' + G.VONG_XUONG_DAT + '. Muốn thủ chắc thì phải có cả hai lớp.</p>' +
    '<p><b class="cam">Tên lửa liên hành tinh.</b> Đóng ở màn Phòng Thủ rồi bắn thẳng sang hành tinh khác trong ' +
    'cùng thiên hà: phá <b>phòng thủ mặt đất</b> mà không cần cho hạm đội bay, nhưng không đụng được lớp quỹ đạo ' +
    'và không cướp được gì. Tầm bắn = (cấp Động Cơ Xung × 5) − 1 hệ. Đối phương có Tên Lửa Đánh Chặn thì hạ ' +
    'được 1 đổi 1 — nên nhớ đóng đánh chặn cho mình.</p>' +
    '<p><b class="cam">Đổ bộ — cách bản gốc kết liễu một hành tinh.</b> Hạm đội chỉ giành được ' +
    '<b>quỹ đạo</b>; muốn động tới hành tinh thì phải chở <b>Robot</b> và <b>Tank</b> theo (Đại Chiến Hạm chở ' +
    'được nhiều nhất). Quỹ đạo vỡ rồi quân mới đổ xuống, đánh nhau với quân giữ nhà và phòng thủ mặt đất của ' +
    'đối phương; thắng thì <b>san phẳng công trình</b> của họ và vét thêm kho. Quân đổ bộ đứng ở nhà thì chính ' +
    'là lực lượng chống đổ bộ — đừng để hành tinh trống trơn.</p>' +
    '<p><b class="cam">Giữ Chỗ — đóng quân quỹ đạo.</b> Có thể đưa hạm đội tới một thuộc địa khác của mình hoặc ' +
    'hành tinh đồng minh để cùng phòng thủ lớp quỹ đạo. Nhiên liệu phải chở theo và được trả trước từng đoạn 6 giờ; ' +
    'thiếu một kỳ sau khi đã đậu thì số tàu còn lại biến thành phế liệu tại đó. Gọi về sớm không hoàn lại nhiên liệu đã trả.</p>' +
    '<p><b class="cam">Thám hiểm.</b> Ô số 16 của mỗi hệ là <b>vùng không gian sâu</b>. Gửi hạm đội ra đó ' +
    'để tìm tài nguyên trôi nổi, tàu bỏ hoang còn dùng được hay một trạm giao dịch cũ — nhưng cũng có thể ' +
    'đụng sinh vật ngoài hành tinh, lạc đường, hoặc bay vào vành đai thiên thạch. Số đoàn đi cùng lúc ' +
    'phụ thuộc Công Nghệ Liên Hành Tinh. Đừng gửi thứ mình tiếc.</p>' +
    '<p><b class="cam">Máy tính trận đánh.</b> Trước khi xuất kích, mở màn <b>Máy Tính Trận</b>: nạp đội hình ' +
    'đối phương từ báo cáo do thám rồi chạy thử ' + U.MP_LAN + ' lần để biết tỷ lệ thắng và lãi/lỗ kỳ vọng. ' +
    'Đây là thói quen của mọi người chơi lâu năm thể loại này.</p>' +
    '<p><b class="cam">5. Đổi mục tiêu giữa đường.</b> Hạm đội đang bay vẫn đổi được đích: vào màn Hạm Đội bấm ' +
    '"Đổi mục tiêu", mất ' + G.so(G.C.DOI_MUC_TIEU_GALANA) + ' Galana cộng nhiên liệu phụ trội, thời gian bay ' +
    'tính lại từ vị trí hiện tại. Dùng để đánh úp, hoặc để né khi đối phương kịp dựng phòng thủ.</p>' +
    '<p><b class="cam">Kinh tế thật — Ngân Hàng &amp; Thị Trường.</b> Gửi Galana vào <b>Ngân Hàng Vũ Trụ</b> ăn lãi ' +
    '(dải 0,07–2%/ngày, tiền càng nhiều lãi càng thấp); <b>Siêu Thị Thiên Hà</b> chỉ bán giá gốc KL=1, TA=2, NL=4, ' +
    'TP=1 Galana và chỉ có hàng khi có người bán vào (thuế 10%); <b>Thị Trường Tự Do</b> tự định giá, thuế 5%, ' +
    'hàng về sau 6 giờ. Đầu tư vào siêu thị thì khoá 7 ngày không rút giữa kỳ — đúng luật bản gốc.</p>' +
    '<p><b class="cam">Địa hình tác động trận đất.</b> Tank vô địch Sa Mạc nhưng chìm ở Rừng; Robot luồn lách Rừng; ' +
    'máy bay thuận gió ẩm Nước mà dễ bị hạ ở Băng; hoả tiễn đạn đạo mạnh Sa Mạc, rừng dày chặn bom. Trận quỹ đạo ' +
    'không chịu địa hình — chỉ trận mặt đất và trận đổ bộ mới tính.</p>' +
    '<p><b class="cam">Lương gián điệp.</b> Mỗi Tàu Do Thám tốn Nhiên Liệu mỗi giờ. Thiếu lương qua một kỳ là ' +
    '<b>gián điệp phản bội</b>: lần do thám tới bị lộ ngược, đối phương nhận báo cáo về đế quốc mình và tàu bị bắt ' +
    'một nửa. Theo dõi trạng thái lương và trả ngay ở màn tài chính.</p>' +
    '<p><b class="cam">Ba chính thể liên minh.</b> Lập liên minh chọn <b>Độc Tài</b> (chủ quyết mọi thứ), ' +
    '<b>Dân Chủ</b> (mọi quyết định lớn qua phiếu toàn thành viên) hay <b>Cộng Hoà</b> (chỉ đại biểu top 5 điểm ' +
    'được bỏ phiếu). Tuyên chiến của liên minh có phiếu phải đạt đa số trước; phiếu hạn 24 giờ, chủ mới bầu theo kỳ 14 ngày.</p>' +
    '</div></div>';

  h += '<div class="panel"><h2>Đánh nhau</h2><div class="noi">' +
    '<p>Trận đánh chạy <b>' + G.C.VONG_DANH + ' vòng</b>. Mỗi vòng hai bên bắn đồng thời; khiên hồi đầu mỗi vòng; ' +
    'phát bắn yếu hơn 1% khiên đối phương thì <b>dội ra</b> không gây sát thương. Một số tàu có <b>bắn nhanh</b>: ' +
    'hạ được mục tiêu nhỏ thì được bắn tiếp ngay trong vòng đó.</p>' +
    '<p><b>' + Math.round(G.C.PHE_LIEU * 100) + '% xác tàu</b> đọng lại thành <b>bãi phế liệu</b> trên quỹ đạo — ' +
    'ai đưa <i>Tàu Thu Hồi</i> tới trước thì vét được, kể cả xác tàu của chính mình. ' +
    'Công sự bị phá có <b>70%</b> cơ hội được sửa lại sau trận, nên đánh vào chỗ nhiều pháo thường lỗ.</p>' +
    '<p>Bên thắng cướp tối đa <b>' + Math.round(G.C.CUOP_TOI_DA * 100) + '%</b> tài nguyên trong kho đối phương, ' +
    'nhưng chỉ chở về được đúng sức chứa khoang hàng — nhớ mang theo tàu vận tải.</p>' +
    '<p class="mo">Kinh nghiệm: trên mỗi đồng bỏ ra, phòng thủ mặt đất bền hơn hạm đội rất nhiều. Hạm đội để đi ' +
    'cướp mục tiêu giàu mà mỏng, đừng lao vào chỗ có nhiều Pháo Plasma.</p>' +
    '</div></div>';
  h += '</div>';

  h += '<div class="luoi2">';
  h += '<div class="panel"><h2>Hạm đội &amp; toạ độ</h2><div class="noi">' +
    '<p>Toạ độ có dạng <b class="sz">[thiên hà : hệ : hành tinh]</b> — vũ trụ có ' + G.C.SO_THIEN_HA + ' × ' +
    G.C.SO_HE + ' × ' + G.C.SO_HANH_TINH + ' ô. Càng xa bay càng lâu và càng tốn Nhiên Liệu; ' +
    'hạ tốc độ xuống 10–50% thì tốn ít nhiên liệu hơn nhiều.</p>' +
    '<p>Số chuyến bay cùng lúc = <b>' + G.khe(st) + ' khe</b> (tăng bằng <i>Công Nghệ Máy Tính</i> và ' +
    '<i>Đài Chỉ Huy Hạm Đội</i>). Tám nhiệm vụ: Tấn Công, Vận Chuyển, Triển Khai, Do Thám, Thực Dân, ' +
    'Thu Hồi, Giữ Chỗ và Thám Hiểm ở ô 16.</p>' +
    '<p><b>Hạm đội đang bay không bị bắn hạ giữa đường.</b> Khi đoàn Giữ Chỗ tới nơi, nó trở thành lực lượng ' +
    'đóng quân có thể chịu thiệt hại thật khi bảo vệ quỹ đạo. Chủ hạm đội có thể gọi về trước hạn.</p>' +
    '</div></div>';

  h += '<div class="panel"><h2>' + (APP.mp ? 'Chơi với người thật' : 'Mở rộng đế quốc') + '</h2><div class="noi">';
  if (APP.mp) {
    h += '<p>Hành tinh <b class="cam">màu cam</b> trên bản đồ là người chơi thật. Đánh nhau với họ là thật: ' +
      'tài nguyên bị cướp khỏi kho của họ, phòng thủ của họ vỡ thật, và họ đánh lại được.</p>' +
      '<p><b>Bảo vệ người chơi mới:</b> dưới ' + G.so(G.C.BAO_VE_MOI_DIEM) + ' điểm thì hai bên lệch nhau quá ' +
      G.C.BAO_VE_MOI_TY_LE + ' lần là không đánh được nhau.</p>' +
      '<p>Khi có người thật cho hạm đội tấn công tới, ta <b>được báo động trước</b> kèm đồng hồ đếm ngược — ' +
      'nhưng không thấy họ mang gì, muốn biết thì phải do thám ngược lại. Nhiệm vụ do thám của đối phương ' +
      'thì đi lén, không báo trước.</p>' +
      '<p>Vào <b>liên minh</b> để được +5% sản lượng, và dùng nhiệm vụ <b>Vận Chuyển</b> chở tài nguyên tiếp tế ' +
      'cho đồng minh. Hàng bên nhận không chứa nổi sẽ được mang về, không mất.</p>' +
      '<p class="mo">Đế quốc của ta chạy trên máy chủ 24/7: thoát ra thì mỏ vẫn đào, bảo trì vẫn trừ tiền, ' +
      'và người khác vẫn đánh vào được.</p>';
  } else {
    h += '<p>Nghiên cứu <b>Công Nghệ Liên Hành Tinh</b>: cứ 2 cấp cho phép giữ thêm một hành tinh. ' +
      'Đóng <b>Tàu Thực Dân</b>, mở màn Thiên Hà, tìm ô <span class="mo">— trống —</span> rồi bấm "Thực dân". ' +
      'Hành tinh ở vị trí 4–12 thường nhiều ô đất và mát hơn; hành tinh xa mặt trời cho nhiều Nhiên Liệu hơn.</p>' +
      '<p>Hành tinh <span class="vang">bỏ hoang</span> của NPC ít phòng thủ nhưng nhiều tài nguyên — đó là chỗ ' +
      'kiếm vốn tốt nhất lúc đầu.</p>' +
      '<p class="mo">Thời gian vẫn chạy khi ta đóng game: mở lại là toàn bộ sản xuất, chuyến bay và các chu kỳ ' +
      'bảo trì đã diễn ra được tua lại đúng thứ tự.</p>';
  }
  h += '</div></div></div>';

  h += '<div class="panel"><h2>Về bản phục dựng này</h2><div class="noi mo">' +
    '<p>Nguyên tác <b>Thiên Hà Đại Chiến</b> là webgame chiến thuật vũ trụ của <b>Trần Châu Quốc Bình</b> ' +
    'cùng nhóm 3 người, phát triển từ khoảng 2004, đoạt giải VietGames 2006 (VINASA), và còn được ghi nhận ' +
    'hoạt động tại thienhadaichien.com tới tháng 11/2010. Website nay không còn hoạt động; chưa xác minh được ngày đóng cửa.</p>' +
    '<p>Server gốc đã mất, nên bản này dựng lại từ tư liệu báo game và diễn đàn còn sót: các cơ chế đặc trưng ' +
    '(chu kỳ bảo trì 6 giờ, nghiên cứu trả góp, phòng thủ hai lớp, đổi mục tiêu giữa đường, 6 loại tài nguyên) ' +
    'là thật; mọi con số cân bằng là suy luận theo khung OGame.</p>' +
    '<p>Hành tinh hiện tại: <b>' + U.esc(p.ten) + '</b> ' + G.tdStr(p.c) + ' · nhiệt độ ' + p.temp + '°C · ' +
    G.oDaDung(p) + '/' + G.oToiDa(p) + ' ô đất.</p>' +
    '</div></div>';
  return h;
};

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

/* ======================================================================
 * MÀN: MÁY TÍNH TRẬN ĐÁNH (mô phỏng trước khi xuất kích)
 * ==================================================================== */
U.MP_LAN = 60;                 // số lần mô phỏng cho mỗi lượt tính

U.mpMoi = function () {
  var st = U.st(), p = U.ht();
  return {
    A: { ships: G.clone(p.ships || {}), tech: { weapon: st.tech.weapon || 0, shield: st.tech.shield || 0, armor: st.tech.armor || 0 } },
    D: { ships: {}, def: {}, tech: { weapon: 0, shield: 0, armor: 0 }, res: null },
    nguon: '', kq: null
  };
};

U.mpNapDoTham = function (key) {
  var st = U.st();
  var bc = st.spy && st.spy[key];
  if (!bc) return;
  U.mp.D.ships = G.clone(bc.ships || {});
  U.mp.D.def = G.clone(bc.def || {});
  U.mp.D.res = bc.res ? G.clone(bc.res) : null;
  var t = bc.tech || {};
  U.mp.D.tech = { weapon: t.weapon || 0, shield: t.shield || 0, armor: t.armor || 0 };
  U.mp.nguon = (bc.ten || '') + ' ' + G.tdStr(bc.td);
};

U.mpDoc = function () {
  var m = U.mp, i, el, id;
  for (i = 0; i < G.SHIPS.length; i++) {
    id = G.SHIPS[i].id;
    el = document.getElementById('mpa-' + id);
    if (el) { var n = Math.max(0, Math.floor(+el.value || 0)); if (n) m.A.ships[id] = n; else delete m.A.ships[id]; }
    el = document.getElementById('mpd-' + id);
    if (el) { var n2 = Math.max(0, Math.floor(+el.value || 0)); if (n2) m.D.ships[id] = n2; else delete m.D.ships[id]; }
  }
  for (i = 0; i < G.DEFENSES.length; i++) {
    id = G.DEFENSES[i].id;
    el = document.getElementById('mpf-' + id);
    if (el) { var n3 = Math.max(0, Math.floor(+el.value || 0)); if (n3) m.D.def[id] = n3; else delete m.D.def[id]; }
  }
  ['weapon', 'shield', 'armor'].forEach(function (k) {
    var a = document.getElementById('mpta-' + k), d = document.getElementById('mptd-' + k);
    if (a) m.A.tech[k] = Math.max(0, Math.min(50, Math.floor(+a.value || 0)));
    if (d) m.D.tech[k] = Math.max(0, Math.min(50, Math.floor(+d.value || 0)));
  });
};

U.mpChay = function () {
  var m = U.mp, i, k;
  if (G.trong(m.A.ships)) { U.toast('Nhập hạm đội bên tấn công đã.', 'loi'); return; }
  var thang = 0, hoa = 0, thua = 0;
  var matA = {}, matD = {}, pl = { metal: 0, crystal: 0 }, vongTB = 0;
  var sucChua = G.khoangHang(m.A.ships);
  for (i = 0; i < U.MP_LAN; i++) {
    var kq = G.danhTran(
      { ten: 'Ta', tech: m.A.tech, ships: G.clone(m.A.ships) },
      { ten: 'Đối phương', tech: m.D.tech, ships: G.clone(m.D.ships), def: G.clone(m.D.def) },
      G.hash('mp' + i + ':' + G.giay()));
    if (kq.kq === 'thang') thang++;
    else if (kq.kq === 'hoa') hoa++;
    else thua++;
    for (k in kq.matA) matA[k] = (matA[k] || 0) + kq.matA[k];
    for (k in kq.matD) matD[k] = (matD[k] || 0) + kq.matD[k];
    pl.metal += kq.pheLieu.metal; pl.crystal += kq.pheLieu.crystal;
    vongTB += kq.vongDanh.length;
  }
  var chia = function (o) { var r = {}; for (var k2 in o) { var v = Math.round(o[k2] / U.MP_LAN); if (v) r[k2] = v; } return r; };
  var giaTri = function (o) { var t = 0; for (var k3 in o) { var u = G.UNIT(k3); if (u) t += G.giaTriDiem(u.cost, o[k3]) * 1000; } return t; };
  var tbMatA = chia(matA), tbMatD = chia(matD);
  var cuop = m.D.res ? G.chiaHang(m.D.res, sucChua, G.C.CUOP_TOI_DA) : null;
  m.kq = {
    thang: thang, hoa: hoa, thua: thua, lan: U.MP_LAN,
    matA: tbMatA, matD: tbMatD,
    giaA: giaTri(tbMatA), giaD: giaTri(tbMatD),
    pl: { metal: Math.round(pl.metal / U.MP_LAN), crystal: Math.round(pl.crystal / U.MP_LAN) },
    vong: Math.round(vongTB / U.MP_LAN * 10) / 10,
    cuop: cuop, sucChua: sucChua
  };
};

function mpO(tienTo, u, giaTri, coSan) {
  return '<div class="hd-tau"><span>' + U.esc(u.ten) +
    (coSan ? '<br><span class="mo sz">có ' + G.so(coSan) + '</span>' : '') +
    '</span><input id="' + tienTo + '-' + u.id + '" aria-label="Số lượng ' + U.esc(u.ten) + '" type="number" min="0" value="' + (giaTri || 0) + '"></div>';
}

U.m_mophong = function () {
  var st = U.st(), p = U.ht();
  if (!U.mp) U.mp = U.mpMoi();
  var m = U.mp, i, h = '';

  h += '<div class="panel"><h2>Máy tính trận đánh</h2><div class="noi">';
  h += '<p class="mo">Chạy thử ' + U.MP_LAN + ' lần cùng một trận rồi lấy trung bình, để biết trước ' +
    'đánh có lãi không. Dùng đúng bộ luật của game: ' + G.C.VONG_DANH + ' vòng, bắn nhanh, dội khiên, ' +
    'phòng thủ mặt đất chỉ tham chiến từ vòng ' + G.VONG_XUONG_DAT + ', công sự tự sửa ' +
    Math.round(G.C.SUA_CONG_SU * 100) + '%.</p>';
  h += '<div class="gal-dh">' +
    '<button class="nut oke" data-act="mp-chay">TÍNH THỬ</button>' +
    '<button class="nut nho" data-act="mp-nap-ham">Lấy hạm đội của ta</button>' +
    '<button class="nut nho" data-act="mp-xoa">Xoá hết</button>';
  var ds = [];
  if (st.spy) for (var kk in st.spy) ds.push(kk);
  if (ds.length) {
    h += '<select id="mp-bc" aria-label="Báo cáo do thám"><option value="">— nạp từ báo cáo do thám —</option>';
    for (i = 0; i < ds.length; i++) {
      var bc = st.spy[ds[i]];
      h += '<option value="' + U.esc(ds[i]) + '">' + U.esc(bc.ten) + ' ' + G.tdStr(bc.td) + '</option>';
    }
    h += '</select><button class="nut nho" data-act="mp-nap-bc">Nạp</button>';
  }
  h += '</div>';
  if (m.nguon) h += '<div class="mo cach-tren-xs">Bên phòng thủ lấy từ báo cáo do thám: <b>' + U.esc(m.nguon) + '</b></div>';
  h += '</div></div>';

  /* kết quả */
  if (m.kq) {
    var k = m.kq;
    var tyLe = Math.round(k.thang / k.lan * 100);
    var pThang = k.thang / k.lan;
    var tongCuop = k.cuop ? G.tongRes(k.cuop) : 0;
    /* kỳ vọng: chỉ thắng mới cướp và mới yên tâm vét phế liệu */
    var lai = Math.round(pThang * (tongCuop + k.pl.metal + k.pl.crystal) - k.giaA);
    h += '<div class="panel"><h2>Kết quả mô phỏng (' + k.lan + ' lần)</h2><div class="noi">';
    h += '<div class="kq kq-tomtat ' + (tyLe >= 80 ? 'thang' : (tyLe >= 30 ? 'hoa' : 'thua')) + '">' +
      '<b>Thắng ' + tyLe + '%</b> — thắng ' + k.thang + ' · cầm cự ' + k.hoa + ' · thua ' + k.thua +
      ' &nbsp;·&nbsp; trung bình ' + k.vong + ' vòng</div>';
    h += '<div class="luoi2"><div><table>' +
      '<tr><th colspan="2">Bên ta (trung bình mỗi trận)</th></tr>' +
      '<tr><td>Tàu mất</td><td class="r">' + U.dsTau(k.matA) + '</td></tr>' +
      '<tr><td>Quy ra tài nguyên</td><td class="r sz do">' + G.so(k.giaA) + '</td></tr>' +
      '<tr><td>Khoang hàng mang theo</td><td class="r sz">' + G.so(k.sucChua) + '</td></tr>' +
      '</table></div><div><table>' +
      '<tr><th colspan="2">Đối phương</th></tr>' +
      '<tr><td>Mất</td><td class="r">' + U.dsTau(k.matD) + '</td></tr>' +
      '<tr><td>Quy ra tài nguyên</td><td class="r sz">' + G.so(k.giaD) + '</td></tr>' +
      '<tr><td>Bãi phế liệu tạo ra</td><td class="r sz vang">' + G.so(k.pl.metal) + ' KL · ' + G.so(k.pl.crystal) + ' TA</td></tr>' +
      '</table></div></div>';
    if (k.cuop) {
      h += '<p><b>Nếu thắng thì cướp được:</b> ' + U.dsRes(k.cuop) +
        ' <span class="mo">(giới hạn bởi khoang hàng ' + G.so(k.sucChua) + ')</span></p>';
      if (tyLe === 0) {
        h += '<div class="kq thua"><b>Không lần nào thắng — đừng đánh.</b> ' +
          '<span class="mo">Hạm đội hiện tại không phá nổi bên kia, đánh vào chỉ mất tàu mà không cướp được gì.</span></div>';
      } else {
        h += '<div class="kq ' + (lai > 0 ? 'thang' : 'thua') + '"><b>Kỳ vọng ' + (lai > 0 ? 'LÃI' : 'LỖ') + ' ' +
          G.so(Math.abs(lai)) + ' tài nguyên</b> <span class="mo">= ' + tyLe + '% × (cướp ' + G.so(tongCuop) +
          ' + phế liệu ' + G.so(k.pl.metal + k.pl.crystal) + ') − tàu mất ' + G.so(k.giaA) +
          '. Chưa trừ nhiên liệu, và phế liệu chỉ về tay ta nếu mang Tàu Thu Hồi tới.</span></div>';
      }
    } else {
      h += '<p class="mo">Chưa biết đối phương có bao nhiêu tài nguyên — do thám rồi nạp báo cáo vào đây để ước tính lãi/lỗ.</p>';
    }
    h += '</div></div>';
  }

  /* bảng nhập */
  h += '<div class="luoi2">';
  h += '<div class="panel"><h2>Bên tấn công (ta)</h2><div class="noi">';
  h += '<div class="hd-luoi">';
  for (i = 0; i < G.SHIPS.length; i++) h += mpO('mpa', G.SHIPS[i], m.A.ships[G.SHIPS[i].id], p.ships[G.SHIPS[i].id]);
  h += '</div><div class="hd-luoi cach-tren-xs">' +
    '<div class="hd-tau"><span>Công Nghệ Vũ Khí</span><input id="mpta-weapon" aria-label="Công nghệ vũ khí bên tấn công" type="number" min="0" max="50" value="' + m.A.tech.weapon + '"></div>' +
    '<div class="hd-tau"><span>Công Nghệ Khiên</span><input id="mpta-shield" aria-label="Công nghệ khiên bên tấn công" type="number" min="0" max="50" value="' + m.A.tech.shield + '"></div>' +
    '<div class="hd-tau"><span>Công Nghệ Giáp</span><input id="mpta-armor" aria-label="Công nghệ giáp bên tấn công" type="number" min="0" max="50" value="' + m.A.tech.armor + '"></div>' +
    '</div></div></div>';

  h += '<div class="panel"><h2>Bên phòng thủ</h2><div class="noi">';
  h += '<b>Hạm đội</b><div class="hd-luoi cach-tren-xs">';
  for (i = 0; i < G.SHIPS.length; i++) h += mpO('mpd', G.SHIPS[i], m.D.ships[G.SHIPS[i].id], 0);
  h += '</div><b class="khoi-cach-tren-sm">Phòng thủ</b><div class="hd-luoi cach-tren-xs">';
  for (i = 0; i < G.DEFENSES.length; i++) h += mpO('mpf', G.DEFENSES[i], m.D.def[G.DEFENSES[i].id], 0);
  h += '</div><div class="hd-luoi cach-tren-xs">' +
    '<div class="hd-tau"><span>Công Nghệ Vũ Khí</span><input id="mptd-weapon" aria-label="Công nghệ vũ khí bên phòng thủ" type="number" min="0" max="50" value="' + m.D.tech.weapon + '"></div>' +
    '<div class="hd-tau"><span>Công Nghệ Khiên</span><input id="mptd-shield" aria-label="Công nghệ khiên bên phòng thủ" type="number" min="0" max="50" value="' + m.D.tech.shield + '"></div>' +
    '<div class="hd-tau"><span>Công Nghệ Giáp</span><input id="mptd-armor" aria-label="Công nghệ giáp bên phòng thủ" type="number" min="0" max="50" value="' + m.D.tech.armor + '"></div>' +
    '</div></div></div>';
  h += '</div>';
  return h;
};
