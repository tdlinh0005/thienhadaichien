/* THIÊN HÀ ĐẠI CHIẾN — lõi mô phỏng
 * Toàn bộ game chạy theo mốc thời gian thực: state chỉ lưu các mốc, mỗi lần
 * tick (hoặc mở lại game sau nhiều giờ) engine tua lại từng sự kiện theo
 * đúng thứ tự thời gian — nên chơi offline vẫn ra kết quả đúng.            */
'use strict';
var G = window.G = window.G || {};

/* Lệch giờ giữa máy người chơi và server (bản nhiều người sẽ gán). */
G.LECH_GIO = 0;
G.giay = function () { return Math.floor(Date.now() / 1000) + G.LECH_GIO; };

/* =======================================================================
 * KHỞI TẠO
 * ===================================================================== */
G.moiGame = function (ten, seedStr, home) {
  var now = G.giay();
  var seed = seedStr || ('THDC-' + Math.floor(Math.random() * 1e9));
  var r = G.rng(G.hash(seed));
  /* home do server chỉ định ở chế độ nhiều người (mỗi người một ô riêng) */
  if (!home) home = G.toaDo(1 + Math.floor(r() * G.C.SO_THIEN_HA), 1 + Math.floor(r() * 60), 4 + Math.floor(r() * 9));

  var st = {
    v: 3, seed: seed, now: now, t0: now, lastTick: now,
    ten: ten || 'Chỉ Huy',
    home: home,
    planets: [],
    tech: {}, ncQueue: null,
    galana: 3000, techPts: 0,
    fleets: [], toi: [], tenLua: [],   // toi = hạm đội địch đang bay tới; tenLua = tên lửa đang bay
    npc: {}, debris: {},
    msgs: [], nk: [],
    nextMaint: now + G.C.CHU_KY_BAO_TRI,
    nextRaid: now + 3600 * 3,
    soChuKy: 0, noBaoTri: 0,
    lm: null,
    stats: { thang: 0, thua: 0, cuop: 0, tauMat: 0, tauDietDich: 0, chuyenBay: 0 },
    fleetIdSeq: 1
  };
  st.planets.push(G.htMoi(st, home, 'Hành Tinh Mẹ', true));
  G.tin(st, 'he', 'Chào mừng tới năm ' + G.NAM_BOI_CANH,
    'Hạm đội thuộc địa đã hạ cánh tại ' + G.tdStr(home) + '. Bộ Chỉ Huy Liên Hành Tinh giao cho ' +
    st.ten + ' quyền toàn quyền phát triển hành tinh này.\n\n' +
    'Nhắc lại quy định: mỗi 6 giờ hành tinh phải qua một CHU KỲ BẢO TRÌ. ' +
    'Không đủ Galana để trả phí bảo trì thì sản lượng sụt và nghiên cứu đứng bánh.\n\n' +
    'Chưa biết bắt đầu từ đâu thì mở màn HƯỚNG DẪN ở cuối menu bên trái.');
  return st;
};

G.htMoi = function (st, c, ten, thuDo) {
  var d = G.dacTinh(st, c);
  return {
    c: { g: c.g, h: c.h, p: c.p }, ten: ten || 'Thuộc Địa', thuDo: !!thuDo,
    temp: d.temp, oDat: d.oDat,
    b: {}, res: { metal: thuDo ? 1500 : 500, crystal: thuDo ? 800 : 300, deut: thuDo ? 200 : 100, food: thuDo ? 1200 : 400 },
    ships: {}, def: {}, mis: {},
    qB: [], qS: [],
    doi: 0                     // số giờ bị bỏ đói cộng dồn
  };
};

/* =======================================================================
 * CHI PHÍ & ĐIỀU KIỆN
 * ===================================================================== */
G.giaXay = function (def, lv) {
  var out = {}, f = Math.pow(def.factor || 2, Math.max(0, lv - 1));
  for (var k in def.cost) out[k] = Math.floor(def.cost[k] * f);
  return out;
};
G.giaDonVi = function (def, n) {
  var out = {};
  for (var k in def.cost) out[k] = def.cost[k] * (n || 1);
  return out;
};
G.duTien = function (st, p, cost) {
  for (var k in cost) {
    if (k === 'galana') { if (st.galana < cost[k]) return false; }
    else if (k === 'tech') { if (st.techPts < cost[k]) return false; }
    else if ((p.res[k] || 0) < cost[k]) return false;
  }
  return true;
};
G.truTien = function (st, p, cost) {
  for (var k in cost) {
    if (k === 'galana') st.galana -= cost[k];
    else if (k === 'tech') st.techPts -= cost[k];
    else p.res[k] = (p.res[k] || 0) - cost[k];
  }
};
G.hoanTien = function (st, p, cost, tyLe) {
  tyLe = (tyLe === undefined) ? 1 : tyLe;
  for (var k in cost) {
    if (k === 'galana') st.galana += cost[k] * tyLe;
    else if (k === 'tech') st.techPts += cost[k] * tyLe;
    else p.res[k] = (p.res[k] || 0) + cost[k] * tyLe;
  }
};
G.thoaDK = function (st, p, def) {
  if (!def.req) return true;
  var k;
  if (def.req.b) for (k in def.req.b) if ((p.b[k] || 0) < def.req.b[k]) return false;
  if (def.req.r) for (k in def.req.r) if ((st.tech[k] || 0) < def.req.r[k]) return false;
  return true;
};
G.thieuDK = function (st, p, def) {
  var out = [], k;
  if (!def.req) return out;
  if (def.req.b) for (k in def.req.b) if ((p.b[k] || 0) < def.req.b[k]) out.push(G.B(k).ten + ' cấp ' + def.req.b[k]);
  if (def.req.r) for (k in def.req.r) if ((st.tech[k] || 0) < def.req.r[k]) out.push(G.R(k).ten + ' cấp ' + def.req.r[k]);
  return out;
};

/* =======================================================================
 * SẢN LƯỢNG
 * ===================================================================== */
G.tongCapCT = function (p) { var t = 0; for (var k in p.b) t += p.b[k]; return t; };

G.dungTich = function (p) {
  return {
    metal: G.B('metalStore').cap(p.b.metalStore || 0),
    crystal: G.B('crystalStore').cap(p.b.crystalStore || 0),
    deut: G.B('deutStore').cap(p.b.deutStore || 0),
    food: G.B('silo').cap(p.b.silo || 0)
  };
};

/* Trả về sản lượng/giờ đã tính hiệu suất điện, đói ăn, thuế... */
G.sanLuong = function (st, p) {
  var sp = G.C.TOC_DO_SERVER;
  var ctx = { temp: p.temp, tech: st.tech };
  var dienCo = 0, dienDung = 0, i, b, lv;

  for (i = 0; i < G.BUILDINGS.length; i++) {
    b = G.BUILDINGS[i]; lv = p.b[b.id] || 0;
    if (!lv) continue;
    if (b.prod) { var pr = b.prod(lv, ctx); if (pr.energy) dienCo += pr.energy; }
    if (b.use) dienDung += b.use(lv);
  }
  /* vệ tinh phòng thủ vừa bắn vừa phát điện [SUY LUẬN] */
  var vt = p.def.satellite || 0;
  if (vt) dienCo += vt * Math.max(6, Math.floor((p.temp + 160) / 5));

  var hs = dienDung > 0 ? Math.min(1, dienCo / dienDung) : 1;
  /* Hệ số ảnh hưởng: nợ bảo trì -30%, liên minh +5%. Riêng cái đói phạt -50%
     nhưng KHÔNG phạt lên chính lương thực, nếu không hành tinh sẽ không bao giờ
     tự thoát ra được khỏi cảnh đói. */
  var chung = (st.noBaoTri > 0 ? 0.7 : 1) * (st.lm ? 1.05 : 1);
  var doi = chung * (p.doi > 0 ? 0.5 : 1);

  var r = { metal: 30 * sp, crystal: 15 * sp, deut: 0, food: 10 * sp, tech: 0, galana: 0 };
  for (i = 0; i < G.BUILDINGS.length; i++) {
    b = G.BUILDINGS[i]; lv = p.b[b.id] || 0;
    if (!lv || !b.prod) continue;
    var o = b.prod(lv, ctx);
    if (o.metal) r.metal += o.metal * hs * sp * doi;
    if (o.crystal) r.crystal += o.crystal * hs * sp * doi;
    if (o.deut) r.deut += o.deut * hs * sp * doi;
    if (o.food) r.food += o.food * hs * sp * chung;
    if (o.tech) r.tech += o.tech * hs * sp * doi;
  }
  /* lò nhiệt hạch đốt deuterium */
  var fu = p.b.fusion || 0;
  var dotDT = fu ? G.B('fusion').deutUse(fu) * sp : 0;
  r.deut -= dotDT;

  /* Lương thực bị tiêu thụ: thủy thủ đoàn + dân cư + công sự */
  var soThu = 0; for (var k in p.def) soThu += p.def[k];
  var anUong = (0.05 * G.thuyThu(p.ships) + 0.5 * G.tongCapCT(p) + 0.01 * soThu) * sp;
  r.food -= anUong;

  /* Thuế: Galana chảy về từ dân cư trên hành tinh */
  r.galana = G.C.THUE_CO_BAN * G.tongCapCT(p) * sp * (p.doi > 0 ? 0.5 : 1);

  return { r: r, dienCo: dienCo, dienDung: dienDung, hs: hs, dotDT: dotDT, anUong: anUong, doi: p.doi > 0 };
};

/* Cộng tài nguyên trong dt giây */
G.sanXuat = function (st, p, dt) {
  var s = G.sanLuong(st, p), cap = G.dungTich(p), h = dt / 3600, k;
  for (k = 0; k < G.RES_HANH_TINH.length; k++) {
    var id = G.RES_HANH_TINH[k];
    var v = (p.res[id] || 0) + s.r[id] * h;
    if (v < 0) v = 0;
    /* vượt kho thì tràn ra ngoài, chỉ chặn phần sản xuất chứ không xoá hàng có sẵn */
    if (v > cap[id] && v > (p.res[id] || 0)) v = Math.max(p.res[id] || 0, cap[id]);
    p.res[id] = v;
  }
  st.galana += s.r.galana * h;
  st.techPts += s.r.tech * h;

  /* Đói: khi hết lương thực mà nhu cầu vẫn âm */
  if (p.res.food <= 0 && s.r.food < 0) p.doi = Math.min(48, (p.doi || 0) + h);
  else if (p.doi > 0) p.doi = Math.max(0, p.doi - h * 2);
};

/* =======================================================================
 * THỜI GIAN SẢN XUẤT
 * ===================================================================== */
G.tgXay = function (st, p, cost) {
  var mc = (cost.metal || 0) + (cost.crystal || 0);
  var h = mc / 2500 / (1 + (p.b.robot || 0)) * Math.pow(0.5, p.b.nanite || 0) / G.C.TOC_DO_SERVER;
  return Math.max(1, Math.round(h * 3600));
};
G.tgTau = function (st, p, cost) {
  var mc = (cost.metal || 0) + (cost.crystal || 0);
  var h = mc / 2500 / (1 + (p.b.shipyard || 0)) * Math.pow(0.5, p.b.nanite || 0) / G.C.TOC_DO_SERVER;
  return Math.max(1, Math.round(h * 3600));
};
G.tgNC = function (st, p, cost) {
  var mc = (cost.metal || 0) + (cost.crystal || 0) + (cost.tech || 0) * 0.5;
  var h = mc / 1000 / (1 + (p.b.lab || 0)) / G.C.TOC_DO_SERVER;
  return Math.max(1, Math.round(h * 3600));
};

/* =======================================================================
 * HÀNG ĐỢI
 * ===================================================================== */
G.capDangXay = function (p, id) {
  var n = 0;
  for (var i = 0; i < p.qB.length; i++) if (p.qB[i].id === id) n++;
  return n;
};
G.xepXay = function (st, p, id) {
  var d = G.B(id);
  if (!d) return 'Không có công trình này.';
  if (p.qB.length >= 5) return 'Hàng đợi xây dựng đã đầy (5 mục).';
  if (!G.thoaDK(st, p, d)) return 'Chưa đủ điều kiện: ' + G.thieuDK(st, p, d).join(', ') + '.';
  var lv = (p.b[id] || 0) + G.capDangXay(p, id) + 1;
  var oDung = G.oDaDung(p);
  if (d.nhom !== undefined || true) {
    if (!p.b[id] && oDung >= G.oToiDa(p)) return 'Hành tinh đã hết ô đất. Xây Cải Tạo Hành Tinh để mở thêm.';
  }
  var cost = G.giaXay(d, lv);
  if (!G.duTien(st, p, cost)) return 'Không đủ tài nguyên.';
  G.truTien(st, p, cost);
  var tg = G.tgXay(st, p, cost);
  var m = { id: id, lv: lv, cost: cost, tg: tg, xong: null };
  p.qB.push(m);
  if (p.qB.length === 1) m.xong = st.now + tg;
  return null;
};
G.huyXay = function (st, p, i) {
  if (i < 0 || i >= p.qB.length) return;
  var m = p.qB.splice(i, 1)[0];
  G.hoanTien(st, p, m.cost, 1);
  if (i === 0 && p.qB.length) p.qB[0].xong = st.now + p.qB[0].tg;
};

G.oToiDa = function (p) { return p.oDat + 6 * (p.b.terraform || 0); };
G.oDaDung = function (p) { var n = 0; for (var k in p.b) if (p.b[k] > 0) n++; return n; };

G.xepTau = function (st, p, id, n) {
  n = Math.max(1, Math.floor(n));
  var d = G.S(id) || G.D(id) || G.M(id);
  if (!d) return 'Không có đơn vị này.';
  if (!p.b.shipyard && !G.M(id)) return 'Cần Xưởng Đóng Tàu.';
  if (!G.thoaDK(st, p, d)) return 'Chưa đủ điều kiện: ' + G.thieuDK(st, p, d).join(', ') + '.';
  if (d.max) {
    var dang = (p.def[id] || 0) + G.dangDong(p, id);
    if (dang + n > d.max) return 'Chỉ được có tối đa ' + d.max + ' công trình loại này.';
  }
  if (G.M(id)) {
    var chua = (p.b.missileSilo || 0) * 10;
    var dungRoi = (p.mis.interceptor || 0) + (p.mis.icbm || 0) * 2 + G.dangDong(p, id) * G.M(id).o;
    if (dungRoi + n * G.M(id).o > chua) return 'Hầm tên lửa không đủ chỗ.';
  }
  var cost = G.giaDonVi(d, n);
  if (!G.duTien(st, p, cost)) return 'Không đủ tài nguyên.';
  G.truTien(st, p, cost);
  var tEach = G.tgTau(st, p, G.giaDonVi(d, 1));
  p.qS.push({ id: id, n: n, tEach: tEach, tLeft: p.qS.length === 0 ? tEach : tEach, cost1: G.giaDonVi(d, 1) });
  return null;
};
G.dangDong = function (p, id) {
  var n = 0;
  for (var i = 0; i < p.qS.length; i++) if (p.qS[i].id === id) n += p.qS[i].n;
  return n;
};
G.huyDong = function (st, p, i) {
  if (i < 0 || i >= p.qS.length) return;
  var m = p.qS.splice(i, 1)[0];
  G.hoanTien(st, p, G.giaDonVi(G.S(m.id) || G.D(m.id) || G.M(m.id), m.n), 1);
};

/* --- Nghiên cứu: chi phí trả ngay + VỐN ĐẦU TƯ trừ dần mỗi chu kỳ ----- */
G.xepNC = function (st, p, id) {
  if (st.ncQueue) return 'Phòng nghiên cứu đang làm việc khác.';
  var d = G.R(id);
  if (!d) return 'Không có đề tài này.';
  if (!p.b.lab) return 'Cần Phòng Nghiên Cứu.';
  if (!G.thoaDK(st, p, d)) return 'Chưa đủ điều kiện: ' + G.thieuDK(st, p, d).join(', ') + '.';
  var lv = (st.tech[id] || 0) + 1;
  var cost = G.giaXay(d, lv);
  if (!G.duTien(st, p, cost)) return 'Không đủ tài nguyên.';
  G.truTien(st, p, cost);
  var tg = G.tgNC(st, p, cost);
  var von = Math.round(((cost.metal || 0) + (cost.crystal || 0) + (cost.deut || 0)) * 0.15 + (cost.tech || 0) * 0.05);
  var soKy = Math.max(1, Math.ceil(tg / G.C.CHU_KY_BAO_TRI));
  st.ncQueue = {
    id: id, lv: lv, cost: cost, tong: tg, conLai: tg,
    von: von, vonConLai: von, vonMoiKy: Math.ceil(von / soKy),
    treo: false, pi: st.planets.indexOf(p)
  };
  return null;
};
G.huyNC = function (st) {
  if (!st.ncQueue) return;
  var q = st.ncQueue, p = st.planets[q.pi] || st.planets[0];
  G.hoanTien(st, p, q.cost, 1);
  st.galana += (q.von - q.vonConLai);
  st.ncQueue = null;
};

/* =======================================================================
 * ĐIỂM & XẾP HẠNG
 * ===================================================================== */
G.diem = function (st) {
  var d = { ct: 0, nc: 0, ham: 0, thu: 0 }, i, j, k;
  for (i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    for (k in p.b) for (j = 1; j <= p.b[k]; j++) d.ct += G.giaTriDiem(G.giaXay(G.B(k), j));
    for (k in p.ships) d.ham += G.giaTriDiem(G.S(k).cost, p.ships[k]);
    for (k in p.def) d.thu += G.giaTriDiem(G.D(k).cost, p.def[k]);
  }
  for (i = 0; i < st.fleets.length; i++) for (k in st.fleets[i].ships) d.ham += G.giaTriDiem(G.S(k).cost, st.fleets[i].ships[k]);
  for (k in st.tech) for (j = 1; j <= st.tech[k]; j++) d.nc += G.giaTriDiem(G.giaXay(G.R(k), j));
  d.tong = d.ct + d.nc + d.ham + d.thu;
  return d;
};

G.khe = function (st) { return 1 + (st.tech.computer || 0) + G.tongB(st, 'fleetHQ'); };
G.tongB = function (st, id) { var n = 0; for (var i = 0; i < st.planets.length; i++) n += (st.planets[i].b[id] || 0); return n; };
G.maxThuocDia = function (st) { return 1 + Math.floor((st.tech.astro || 0) / 2) + 1; };

/* =======================================================================
 * TIN NHẮN & NHẬT KÝ
 * ===================================================================== */
G.tin = function (st, loai, tieuDe, noiDung, data) {
  st.msgs.unshift({ t: st.now, loai: loai, td: tieuDe, nd: noiDung, data: data || null, doc: false });
  if (st.msgs.length > 150) st.msgs.length = 150;
};
G.ghi = function (st, s) {
  st.nk.unshift({ t: st.now, s: s });
  if (st.nk.length > 120) st.nk.length = 120;
};
