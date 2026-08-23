/* THIÊN HÀ ĐẠI CHIẾN — lõi mô phỏng
 * Toàn bộ game chạy theo mốc thời gian thực: state chỉ lưu các mốc, mỗi lần
 * tick (hoặc mở lại game sau nhiều giờ) engine tua lại từng sự kiện theo
 * đúng thứ tự thời gian — nên chơi offline vẫn ra kết quả đúng.            */
'use strict';
var G = window.G = window.G || {};
G.STATE_VERSION = 6;

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
    v: G.STATE_VERSION, moHinhCT: 'so-luong-v1', moHinhNhip: G.NHIP_V1.marker,
    moHinhQuyDao: G.QUY_DAO_V1.marker,
    seed: seed, now: now, t0: now, lastTick: now,
    ten: ten || 'Chỉ Huy',
    home: home,
    planets: [],
    tech: {}, ncQueue: null,
    galana: 3000, techPts: 0,
    fleets: [], toi: [], tenLua: [],   // toi = hạm đội địch đang bay tới; tenLua = tên lửa đang bay
    npc: {}, debris: {},
    msgs: [], nk: [],
    baoTri: {
      nextAt: now + G.NHIP_V1.cycleSeconds,
      cycle: 0,
      missStreak: 0,
      arrearsGalana: 0,
      activatedAt: now,
      rules: G.NHIP_V1.maintenanceRules
    },
    /* Alias state v4: chỉ giữ để client cũ đọc được trong một vòng nâng cấp. */
    nextMaint: now + G.NHIP_V1.cycleSeconds,
    nextRaid: now + 3600 * 3,
    soChuKy: 0, noBaoTri: 0,
    lm: null,
    stats: { thang: 0, thua: 0, cuop: 0, tauMat: 0, tauDietDich: 0, chuyenBay: 0 },
    fleetIdSeq: 1
  };
  var htMe = G.htMoi(st, home, 'Hành Tinh Mẹ', true);
  /* Hành tinh mẹ luôn là Ôn Hoà — nơi loài người khởi đầu được */
  htMe.loai = 'onhoa';
  var Lme = G.LHT('onhoa');
  htMe.temp = Math.round((Lme.temp[0] + Lme.temp[1]) / 2);
  htMe.oDat = Math.max(150, htMe.oDat);
  st.planets.push(htMe);
  G.tin(st, 'he', 'Chào mừng tới kỷ nguyên liên ngân hà',
    'Hạm đội thuộc địa đã hạ cánh tại ' + G.tdStr(home) + '. Bộ Chỉ Huy Liên Hành Tinh giao cho ' +
    st.ten + ' quyền toàn quyền phát triển hành tinh này. Bối cảnh: ' + G.BOI_CANH + '.\n\n' +
    'Nhắc lại quy định: mỗi 6 giờ hành tinh phải qua một CHU KỲ BẢO TRÌ. ' +
    'Không đủ Galana để trả phí bảo trì thì sản lượng sụt và nghiên cứu đứng bánh.\n\n' +
    'Chưa biết bắt đầu từ đâu thì mở màn HƯỚNG DẪN ở cuối menu bên trái.');
  return st;
};

G.htMoi = function (st, c, ten, thuDo) {
  var d = G.dacTinh(st, c);
  return {
    c: { g: c.g, h: c.h, p: c.p }, ten: ten || 'Thuộc Địa', thuDo: !!thuDo,
    loai: d.loai, temp: d.temp, oDat: d.oDat,
    b: {}, res: { metal: thuDo ? 1500 : 500, crystal: thuDo ? 800 : 300, deut: thuDo ? 200 : 100, food: thuDo ? 1200 : 400 },
    ships: {}, def: {}, mis: {}, linh: {},
    qB: [], qS: [],
    doi: 0,                    // alias cảnh báo đói của state cũ
    danSu: G.danSuMacDinh()
  };
};

/* =======================================================================
 * MIGRATION V3 -> V4: CẤP CÔNG TRÌNH -> SỐ LƯỢNG
 * -----------------------------------------------------------------------
 * Một level L cũ đã tiêu tốn xấp xỉ cost0 * (1 + f + ... + f^(L-1)).
 * V4 lấy cost0 là giá một công trình, nên quy đổi tổng vốn ấy
 * thành số lượng. Công thức kín giữ migration O(1) cho mỗi loại. */
G.slTuCap = function (def, lv) {
  lv = Math.max(0, Math.floor(Number(lv) || 0));
  if (!lv) return 0;
  var f = (def && def.factor) || 1;
  var n = f === 1 ? lv : (Math.pow(f, lv) - 1) / (f - 1);
  if (!isFinite(n) || n >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.round(n));
};

/* Mốc level cũ cao nhất đã đầu tư không quá n công trình. Chỉ dùng
 * cho giao diện/API cũ "xây tiếp"; mô phỏng v4 không phụ thuộc level này. */
G.capTuSL = function (def, n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (!n) return 0;
  var f = (def && def.factor) || 1;
  if (f === 1) return n;
  var lv = Math.max(0, Math.floor(Math.log(1 + n * (f - 1)) / Math.log(f)));
  while (lv > 0 && G.slTuCap(def, lv) > n) lv--;
  while (G.slTuCap(def, lv + 1) <= n && lv < 1024) lv++;
  return lv;
};

/* =======================================================================
 * STATE V5: NHỊP BẢO TRÌ, DÂN SỐ VÀ NGHIÊN CỨU TRẢ GÓP
 * -----------------------------------------------------------------------
 * Tư liệu xác nhận nhịp toàn đế quốc 6 giờ, dân số sàn 250.000 và chi phí
 * nghiên cứu bị rút theo từng nhịp. Các tỷ lệ cụ thể nằm trong G.NHIP_V1
 * và đều được đánh dấu [TÁI DỰNG] tại data.js. */
G.danSuMacDinh = function () {
  return {
    population: G.NHIP_V1.populationStart,
    supportBp: G.NHIP_V1.defaultSupportBp,
    taxBp: G.NHIP_V1.defaultTaxBp,
    foodDemandCycle: 0,
    foodShortfallCycle: 0,
    decayRemainder: 0
  };
};

G.sucChuaDan = function (p) {
  var city = G.B('city');
  var moiTP = city && isFinite(city.housing) ? city.housing : G.NHIP_V1.cityHousing;
  return Math.max(G.NHIP_V1.populationFloor,
    Math.floor(G.NHIP_V1.baseHousing + Math.max(0, Number((p.b || {}).city) || 0) * moiTP));
};

G.nhuCauTPChuKy = function (st, p) {
  var ds = p && p.danSu;
  var population = Math.max(G.NHIP_V1.populationFloor, Math.floor(Number(ds && ds.population) || 0));
  var soCT = 0, soThu = 0, k;
  for (k in ((p && p.b) || {})) soCT += Math.max(0, Number(p.b[k]) || 0);
  for (k in ((p && p.def) || {})) soThu += Math.max(0, Number(p.def[k]) || 0);
  var thuyThu = G.thuyThu && p ? G.thuyThu(p.ships || {}) : 0;
  return population * G.NHIP_V1.foodPerPersonCycle +
    (0.05 * thuyThu + 0.5 * soCT + 0.01 * soThu) *
      (G.NHIP_V1.cycleSeconds / 3600) * G.C.TOC_DO_SERVER;
};

/* Civil v4 chỉ dùng khi tua phần thời gian nằm trước activatedAt. Đây là
 * compatibility bridge, không phải luật dân số mới. */
G.danSuV4Gio = function (st, p) {
  var soThu = 0, k;
  for (k in ((p && p.def) || {})) soThu += Math.max(0, Number(p.def[k]) || 0);
  var anUong = (0.05 * G.thuyThu((p && p.ships) || {}) +
    0.5 * G.tongSoCT(p) + 0.01 * soThu) * G.C.TOC_DO_SERVER;
  var thue = G.C.THUE_CO_BAN * G.tongSoCT(p) * G.C.TOC_DO_SERVER * (p.doi > 0 ? 0.5 : 1);
  return { anUong: anUong, thue: thue };
};

/* Thuế chạy liên tục để đổi thuế giữa chu kỳ được chia đúng theo thời gian. */
G.thueDanSuGio = function (st, p) {
  var ds = p && p.danSu;
  if (!ds) return 0;
  var population = Math.max(G.NHIP_V1.populationFloor, Math.floor(Number(ds.population) || 0));
  var tax = Math.max(G.NHIP_V1.minTaxBp, Math.min(G.NHIP_V1.maxTaxBp, Math.floor(Number(ds.taxBp) || 0)));
  var support = Math.max(0, Math.min(G.NHIP_V1.maxSupportBp, Math.floor(Number(ds.supportBp) || 0)));
  return population * G.NHIP_V1.taxGalanaPerPersonHour *
    G.C.TOC_DO_SERVER * tax / 10000 * support / 10000;
};
G.thueDanSuChuKy = function (st, p) {
  return G.thueDanSuGio(st, p) * (G.NHIP_V1.cycleSeconds / 3600);
};

G.timHanhTinh = function (st, planetKey) {
  var ps = st && Array.isArray(st.planets) ? st.planets : [];
  for (var i = 0; i < ps.length; i++) if (ps[i].c && G.tdKey(ps[i].c) === planetKey) return ps[i];
  return null;
};

G.dongBoBaoTriCu = function (st) {
  if (!st || !st.baoTri) return st;
  st.nextMaint = st.baoTri.nextAt;
  st.soChuKy = st.baoTri.cycle;
  st.noBaoTri = st.baoTri.arrearsGalana;
  return st;
};

function vectorChiPhi(o) {
  var out = {};
  o = o && typeof o === 'object' ? o : {};
  for (var k in o) {
    var n = Number(o[k]);
    if (isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}
function vectorCong(a, b) {
  var out = vectorChiPhi(a), k;
  b = vectorChiPhi(b);
  for (k in b) out[k] = (out[k] || 0) + b[k];
  return out;
}

G.chiPhiConLai = function (q) {
  var out = {}, tong = vectorChiPhi(q && q.totalCost), da = vectorChiPhi(q && q.paidCost);
  for (var k in tong) {
    var con = Math.max(0, tong[k] - (da[k] || 0));
    if (con > 0) out[k] = con;
  }
  return out;
};

/* Mỗi kỳ lấy ceil(phần còn lại / số kỳ còn lại), nên kỳ cuối khép đúng
 * totalCost và không tích luỹ sai số ở các vector tài nguyên khác nhau. */
G.kyNghienCuu = function (q) {
  var out = {}, con = G.chiPhiConLai(q);
  var soKy = Math.max(0, Math.floor(Number(q && q.installmentsLeft) || 0));
  if (!soKy) return out;
  for (var k in con) out[k] = Math.ceil(con[k] / soKy);
  return out;
};

G.conLaiNghienCuu = function (st, q) {
  q = q || (st && st.ncQueue);
  return q ? Math.max(0, Math.floor(Number(q.finishAt) || 0) - Math.floor(Number(st && st.now) || 0)) : 0;
};

function chuanHoaNen(st) {
  st.planets = Array.isArray(st.planets) ? st.planets : [];
  st.fleets = Array.isArray(st.fleets) ? st.fleets : [];
  st.toi = Array.isArray(st.toi) ? st.toi : [];
  st.tenLua = Array.isArray(st.tenLua) ? st.tenLua : [];
  st.msgs = Array.isArray(st.msgs) ? st.msgs : [];
  st.nk = Array.isArray(st.nk) ? st.nk : [];
  st.tech = st.tech && typeof st.tech === 'object' ? st.tech : {};
}

function nangV3LenV4(st) {
  var ps = st.planets;
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i], cu = p.b && typeof p.b === 'object' ? p.b : {}, moi = {}, k;
    for (k in cu) {
      var d = G.B(k), lv = Math.max(0, Math.floor(Number(cu[k]) || 0));
      if (lv) moi[k] = d ? G.slTuCap(d, lv) : lv;
    }
    p.b = moi;
    p.qB = Array.isArray(p.qB) ? p.qB : [];
    p.qS = Array.isArray(p.qS) ? p.qS : [];
    p.res = p.res && typeof p.res === 'object' ? p.res : {};
    p.ships = p.ships && typeof p.ships === 'object' ? p.ships : {};
    p.def = p.def && typeof p.def === 'object' ? p.def : {};
    p.mis = p.mis && typeof p.mis === 'object' ? p.mis : {};
    p.linh = p.linh && typeof p.linh === 'object' ? p.linh : {};
    var truoc = {};
    for (k in cu) truoc[k] = Math.max(0, Math.floor(Number(cu[k]) || 0));
    for (var q = 0; q < p.qB.length; q++) {
      var m = p.qB[q], bd = G.B(m.id);
      if (!bd) continue;
      if (m.n === undefined) {
        var lvTruoc = truoc[m.id] || 0;
        var lvDich = Math.max(lvTruoc + 1, Math.floor(Number(m.lv) || 0));
        m.n = Math.max(1, G.slTuCap(bd, lvDich) - G.slTuCap(bd, lvTruoc));
        truoc[m.id] = lvDich;
      } else {
        m.n = Math.max(1, Math.floor(Number(m.n) || 1));
      }
      delete m.lv;
    }
  }
  st.v = 4;
  st.moHinhCT = 'so-luong-v1';
}

function nangV4LenV5(st, activatedAt) {
  var mocState = Math.max(0, Math.floor(Number(st.lastTick || st.now) || 0));
  activatedAt = Math.max(mocState, Math.floor(Number(activatedAt) || 0));
  var btCu = Math.max(0, Number(st.noBaoTri) || 0);
  /* Giữ pha đồng hồ đế quốc neo từ lúc đăng ký. Bỏ qua các checkpoint cũ
   * trước biên kích hoạt, nhưng không đổi phút/giây kết toán quen thuộc. */
  var nextAt = Math.floor(Number(st.nextMaint) || 0);
  if (!(nextAt > 0)) nextAt = Math.floor(Number(st.t0) || 0) + G.NHIP_V1.cycleSeconds;
  if (!(nextAt > 0)) nextAt = activatedAt + G.NHIP_V1.cycleSeconds;
  if (nextAt <= activatedAt) nextAt +=
    (Math.floor((activatedAt - nextAt) / G.NHIP_V1.cycleSeconds) + 1) * G.NHIP_V1.cycleSeconds;
  st.moHinhNhip = G.NHIP_V1.marker;
  st.baoTri = {
    nextAt: nextAt,
    cycle: Math.max(0, Math.floor(Number(st.soChuKy) || 0)),
    missStreak: btCu > 0 ? 1 : 0,
    arrearsGalana: btCu,
    activatedAt: activatedAt,
    rules: G.NHIP_V1.maintenanceRules
  };

  for (var i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    p.b = p.b && typeof p.b === 'object' ? p.b : {};
    p.qB = Array.isArray(p.qB) ? p.qB : [];
    p.qS = Array.isArray(p.qS) ? p.qS : [];
    p.res = p.res && typeof p.res === 'object' ? p.res : {};
    p.ships = p.ships && typeof p.ships === 'object' ? p.ships : {};
    p.def = p.def && typeof p.def === 'object' ? p.def : {};
    p.mis = p.mis && typeof p.mis === 'object' ? p.mis : {};
    p.linh = p.linh && typeof p.linh === 'object' ? p.linh : {};
    p.danSu = G.danSuMacDinh();
  }

  /* Queue v4 đã trừ toàn bộ cost ngay lúc xếp. Đánh dấu phần ấy là paidCost
   * để v5 không thu lần hai; vốn Galana còn lại tiếp tục chia theo checkpoint
   * mới, bắt đầu sau activatedAt — tuyệt đối không gây thất bại hồi tố. */
  if (st.ncQueue) {
    var cu = st.ncQueue;
    var tongTG = Math.max(1, Math.floor(Number(cu.tong) || Number(cu.conLai) || G.NHIP_V1.minResearchSeconds));
    var conTG = Math.max(0, Math.floor(Number(cu.conLai) || 0));
    var totalCost = vectorChiPhi(cu.cost);
    var von = Math.max(0, Number(cu.von) || 0);
    var vonCon = Math.max(0, Math.min(von, Number(cu.vonConLai) || 0));
    if (von > 0) totalCost.galana = (totalCost.galana || 0) + von;
    var paidCost = vectorChiPhi(cu.cost);
    if (von > vonCon) paidCost.galana = von - vonCon;
    var conVector = vectorCong({}, totalCost), k;
    for (k in paidCost) conVector[k] = Math.max(0, (conVector[k] || 0) - paidCost[k]);
    var coCon = false; for (k in conVector) if (conVector[k] > 0) { coCon = true; break; }
    var installmentsTotal = Math.max(2, Math.ceil(tongTG / G.NHIP_V1.cycleSeconds));
    var installmentsLeft = coCon ? Math.max(1, Math.min(installmentsTotal,
      Math.ceil(Math.max(1, conTG) / G.NHIP_V1.cycleSeconds))) : 0;
    var planet = st.planets[Math.max(0, Math.floor(Number(cu.pi) || 0))] || st.planets[0];
    st.ncQueue = {
      id: cu.id,
      lv: Math.max(1, Math.floor(Number(cu.lv) || ((st.tech[cu.id] || 0) + 1))),
      planetKey: planet && planet.c ? G.tdKey(planet.c) : (st.home ? G.tdKey(st.home) : ''),
      startedAt: activatedAt - Math.max(0, tongTG - conTG),
      finishAt: activatedAt + conTG,
      totalCost: totalCost,
      paidCost: paidCost,
      installmentsTotal: installmentsTotal,
      installmentsLeft: installmentsLeft,
      failures: cu.treo ? 1 : 0,
      status: cu.treo ? 'retry' : 'active',
      rules: G.NHIP_V1.researchRules,
      refundPolicy: G.NHIP_V1.legacyRefundPolicy
    };
  }

  st.v = 5;
  G.dongBoBaoTriCu(st);
}

/* STATE V6: `pha:'giu'` là một vị trí thật trên quỹ đạo, không còn mượn pha
 * bay đi với cờ `dangGiu`. Save v5 đang đậu được một đoạn ân hạn bắt đầu tại
 * activatedAt: không thu hồi tố quãng offline trước lúc luật này xuất hiện. */
function nangV5LenV6(st, activatedAt) {
  var mocState = Math.max(0, Math.floor(Number(st.lastTick || st.now) || 0));
  activatedAt = Math.max(mocState, Math.floor(Number(activatedAt) || 0));
  var qd = G.QUY_DAO_V1;
  for (var i = 0; i < st.fleets.length; i++) {
    var f = st.fleets[i];
    if (!f || f.mission !== 'hold') continue;
    if (f.pha === 'di' && f.dangGiu) {
      var hetCu = Math.floor(Number(f.den_t) || activatedAt);
      var giu = Math.max(1, Math.floor(Number(f.giu) || qd.segmentSeconds));
      f.pha = 'giu';
      /* V5 đã thay den_t bằng mốc hết lượt ngay lúc tới nơi, nên có thể suy
       * ngược thời điểm neo thật từ den_t - giu. Ân hạn nhiên liệu vẫn bắt
       * đầu riêng tại activatedAt, không được làm sai lịch sử giuLuc. */
      f.giuLuc = Math.min(activatedAt, Math.max(0, hetCu - giu));
      f.giuDen_t = Math.max(hetCu, activatedAt);
      f.tiepNL_t = Math.min(f.giuDen_t, activatedAt + qd.segmentSeconds);
      f.giuTaiTk = f.giuTaiTk === undefined ? null : f.giuTaiTk;
      f.giuRules = qd.legacyRules;
      f.dangGiu = true;                 // alias cho client v5 trong một vòng nâng cấp
    } else {
      /* Outbound/return không được biến thành đang đậu chỉ vì mission=hold. */
      f.dangGiu = false;
      delete f.giuLuc;
      delete f.giuDen_t;
      delete f.tiepNL_t;
      delete f.giuTaiTk;
      delete f.giuRules;
    }
  }
  st.v = 6;
  st.moHinhQuyDao = qd.marker;
}

/* Nâng tuần tự, không nhảy thẳng: save v3 luôn đi qua đúng phép quy đổi vốn
 * công trình v4, schema nhịp v5 rồi schema quỹ đạo v6. `activatedAt` là
 * wall-clock do loader/server truyền vào; mặc định dùng giờ hiện tại. */
G.nangCapState = function (st, activatedAt) {
  if (!st) return st;
  var phienBan = Number(st.v) || 0;
  if (phienBan > G.STATE_VERSION)
    throw new Error('Save state v' + phienBan + ' mới hơn engine v' + G.STATE_VERSION + '; từ chối hạ cấp dữ liệu.');
  if (phienBan === G.STATE_VERSION) return st; // idempotent byte-for-byte
  if (phienBan === 4 && st.moHinhCT && st.moHinhCT !== 'so-luong-v1')
    throw new Error('Save state v4 không có marker mô hình số lượng hợp lệ.');
  chuanHoaNen(st);
  var moc = activatedAt === undefined || activatedAt === null ? G.giay() : Number(activatedAt);
  if (!isFinite(moc)) moc = G.giay();
  moc = Math.floor(moc);
  if (phienBan < 4) { nangV3LenV4(st); phienBan = 4; }
  if (phienBan === 4) {
    nangV4LenV5(st, moc);
    phienBan = 5;
  }
  if (phienBan === 5) nangV5LenV6(st, moc);
  return st;
};

/* =======================================================================
 * CHI PHÍ & ĐIỀU KIỆN
 * ===================================================================== */
G.giaXay = function (def, lv) {
  var out = {}, f = Math.pow(def.factor || 2, Math.max(0, lv - 1));
  for (var k in def.cost) out[k] = Math.floor(def.cost[k] * f);
  return out;
};
/* Công trình v4 mua theo lô: giá đơn vị không phụ thuộc số đã có. */
G.giaCongTrinh = function (def, n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  var out = {};
  for (var k in def.cost) out[k] = def.cost[k] * n;
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
  if (def.req.b) for (k in def.req.b) if ((p.b[k] || 0) < G.slYeuCau(k, def.req.b[k])) return false;
  if (def.req.r) for (k in def.req.r) if ((st.tech[k] || 0) < def.req.r[k]) return false;
  return true;
};
/* req.b trong data cũ là mốc level; chuyển một lần ở biên so sánh để
 * không phải viết lại hàng trăm điều kiện tàu/công sự/nghiên cứu. */
G.slYeuCau = function (id, mucCapCu) {
  var d = G.B(id);
  return d ? G.slTuCap(d, mucCapCu) : Math.max(0, Math.floor(mucCapCu || 0));
};
G.thieuDK = function (st, p, def) {
  var out = [], k;
  if (!def.req) return out;
  if (def.req.b) for (k in def.req.b) {
    var can = G.slYeuCau(k, def.req.b[k]);
    if ((p.b[k] || 0) < can) out.push(G.B(k).ten + ' × ' + can);
  }
  if (def.req.r) for (k in def.req.r) if ((st.tech[k] || 0) < def.req.r[k]) out.push(G.R(k).ten + ' cấp ' + def.req.r[k]);
  return out;
};

/* =======================================================================
 * SẢN LƯỢNG
 * ===================================================================== */
G.tongSoCT = function (p) { var t = 0; for (var k in p.b) t += Math.max(0, p.b[k] || 0); return t; };
/* Alias tương thích tạm thời; UI cũ còn gọi tên này. */
G.tongCapCT = G.tongSoCT;
/* Primitive mutation dùng chung cho queue, combat và các degradation sau này. */
G.themCongTrinh = function (p, id, n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (!n) return 0;
  p.b[id] = Math.max(0, Math.floor(Number(p.b[id]) || 0)) + n;
  return n;
};
G.giamCongTrinh = function (p, id, n) {
  var co = Math.max(0, Math.floor(Number(p.b[id]) || 0));
  n = Math.min(co, Math.max(0, Math.floor(Number(n) || 0)));
  if (!n) return 0;
  p.b[id] = co - n;
  if (!p.b[id]) delete p.b[id];
  return n;
};

G.dungTich = function (p) {
  return {
    metal: G.B('metalStore').cap(p.b.metalStore || 0),
    crystal: G.B('crystalStore').cap(p.b.crystalStore || 0),
    deut: G.B('deutStore').cap(p.b.deutStore || 0),
    food: G.B('silo').cap(p.b.silo || 0)
  };
};

/* Trả về sản lượng/giờ đã tính hiệu suất điện, đói ăn, thuế... */
G.loaiHT = function (st, p) {
  if (!p.loai) p.loai = G.loaiTheoViTri(st.seed, p.c);   /* bàn chơi cũ chưa có loại */
  return G.LHT(p.loai);
};

G.sanLuong = function (st, p) {
  var sp = G.C.TOC_DO_SERVER;
  var L = G.loaiHT(st, p);
  var ctx = { temp: p.temp, tech: st.tech };
  var dienCo = 0, dienDung = 0, i, b, n;

  for (i = 0; i < G.BUILDINGS.length; i++) {
    b = G.BUILDINGS[i]; n = p.b[b.id] || 0;
    if (!n) continue;
    if (b.prod) { var pr = b.prod(n, ctx); if (pr.energy) dienCo += pr.energy * (b.id === 'solar' ? L.dien : 1); }
    if (b.use) dienDung += b.use(n);
  }
  /* vệ tinh phòng thủ vừa bắn vừa phát điện [SUY LUẬN] */
  var vt = p.def.satellite || 0;
  if (vt) dienCo += vt * Math.max(6, Math.floor((p.temp + 160) / 5));

  var hs = dienDung > 0 ? Math.min(1, dienCo / dienDung) : 1;
  /* V5 không còn hệ số phạt mơ hồ từ alias noBaoTri/p.doi. Hậu quả của một
   * checkpoint hụt được thể hiện trực tiếp bằng dân rời đi/công trình hỏng. */
  var chung = st.lm ? 1.05 : 1;
  var doi = chung;

  var r = { metal: 30 * sp, crystal: 15 * sp, deut: 0, food: 10 * sp, tech: 0, galana: 0 };
  for (i = 0; i < G.BUILDINGS.length; i++) {
    b = G.BUILDINGS[i]; n = p.b[b.id] || 0;
    if (!n || !b.prod) continue;
    var o = b.prod(n, ctx);
    if (o.metal) r.metal += o.metal * hs * sp * doi * L.kl;
    if (o.crystal) r.crystal += o.crystal * hs * sp * doi * L.tt;
    if (o.deut) r.deut += o.deut * hs * sp * doi * L.dt;
    if (o.food) r.food += o.food * hs * sp * chung * L.lt;
    if (o.tech) r.tech += o.tech * hs * sp * doi;
  }
  /* lò nhiệt hạch đốt Nhiên Liệu */
  var fu = p.b.fusion || 0;
  var dotDT = fu ? G.B('fusion').deutUse(fu) * sp : 0;
  r.deut -= dotDT;

  /* Thực Phẩm bị tiêu thụ liên tục; checkpoint chỉ đọc phần thiếu hụt đã
   * tích luỹ, không trừ nhu cầu thêm lần nữa. */
  var anUong = G.nhuCauTPChuKy(st, p) / (G.NHIP_V1.cycleSeconds / 3600);
  r.food -= anUong;

  r.galana = G.thueDanSuGio(st, p);

  return { r: r, dienCo: dienCo, dienDung: dienDung, hs: hs, dotDT: dotDT, anUong: anUong,
    doi: !!(p.danSu && p.danSu.foodShortfallCycle > 0), loai: L };
};

/* Cộng tài nguyên trong dt giây */
G.sanXuat = function (st, p, dt) {
  var s = G.sanLuong(st, p), cap = G.dungTich(p), h = dt / 3600, k;
  if (!p.danSu) p.danSu = G.danSuMacDinh();
  /* Một tick ngay sau migration có thể gồm nhiều ngày thuộc luật v4. Chỉ
   * đoạn sau activatedAt được tính dân số/thuế v5; nếu không, checkpoint đầu
   * sẽ phạt đói hồi tố dù migration đã đặt counter về 0. */
  var batDau = Math.floor(Number(st.lastTick) || Number(st.now) || 0);
  var active = st.baoTri ? Math.floor(Number(st.baoTri.activatedAt) || 0) : batDau;
  var giayDanSu = Math.max(0, batDau + dt - Math.max(batDau, active));
  var hDanSu = Math.min(h, giayDanSu / 3600);
  var hV4 = Math.max(0, h - hDanSu);
  var danSuV4 = hV4 > 0 ? G.danSuV4Gio(st, p) : { anUong: s.anUong, thue: 0 };
  p.danSu.foodDemandCycle = Math.max(0, Number(p.danSu.foodDemandCycle) || 0) + s.anUong * hDanSu;
  function congKho(v0, toc, gio, gioiHan) {
    var v1 = v0 + toc * gio;
    if (v1 < 0) v1 = 0;
    if (v1 > gioiHan && v1 > v0) v1 = Math.max(v0, gioiHan);
    return v1;
  }
  for (k = 0; k < G.RES_HANH_TINH.length; k++) {
    var id = G.RES_HANH_TINH[k];
    var co = p.res[id] || 0, v;
    if (id === 'food' && hDanSu < h) {
      /* Thay nhu cầu dân số v5 bằng civil v4 trên phần trước activatedAt. */
      var tocFoodV4 = s.r.food + s.anUong - danSuV4.anUong;
      var truocPost = congKho(co, tocFoodV4, hV4, cap.food);
      var rawPost = truocPost + s.r.food * hDanSu;
      if (rawPost < 0)
        p.danSu.foodShortfallCycle = Math.max(0, Number(p.danSu.foodShortfallCycle) || 0) - rawPost;
      v = congKho(truocPost, s.r.food, hDanSu, cap.food);
    } else {
      var raw = co + s.r[id] * h;
      if (id === 'food' && raw < 0)
        p.danSu.foodShortfallCycle = Math.max(0, Number(p.danSu.foodShortfallCycle) || 0) - raw;
      v = congKho(co, s.r[id], h, cap[id]);
    }
    p.res[id] = v;
  }
  st.galana += danSuV4.thue * hV4 + s.r.galana * hDanSu;
  st.techPts += s.r.tech * h;

  /* Đói: khi hết Thực Phẩm mà nhu cầu vẫn âm */
  if (p.res.food <= 0 && s.r.food < 0) p.doi = Math.min(48, (p.doi || 0) + hDanSu);
  else if (p.doi > 0) p.doi = Math.max(0, p.doi - hDanSu * 2);
};

/* =======================================================================
 * THỜI GIAN SẢN XUẤT
 * ===================================================================== */
G.tgXay = function (st, p, cost) {
  var mc = (cost.metal || 0) + (cost.crystal || 0);
  var congSuat = 1 + (p.b.robot || 0) + 10 * (p.b.nanite || 0);
  var h = mc / 2500 / congSuat / G.C.TOC_DO_SERVER;
  return Math.max(1, Math.round(h * 3600));
};
G.tgTau = function (st, p, cost) {
  var mc = (cost.metal || 0) + (cost.crystal || 0);
  var congSuat = Math.max(1, p.b.shipyard || 0) * G.hsNhaXuong(st.tech) + 10 * (p.b.nanite || 0);
  var h = mc / 2500 / congSuat / G.C.TOC_DO_SERVER;
  return Math.max(1, Math.round(h * 3600));
};
G.tgNC = function (st, p, cost) {
  var mc = (cost.metal || 0) + (cost.crystal || 0) + (cost.tech || 0) * 0.5;
  var h = mc / 1000 / Math.max(1, p.b.lab || 0) / G.C.TOC_DO_SERVER;
  return Math.max(G.NHIP_V1.minResearchSeconds, Math.round(h * 3600));
};

/* =======================================================================
 * HÀNG ĐỢI
 * ===================================================================== */
G.capDangXay = function (p, id) {
  var n = 0;
  for (var i = 0; i < p.qB.length; i++) if (p.qB[i].id === id) n++;
  return n;
};
G.soDangXay = function (p, id) {
  var n = 0;
  for (var i = 0; i < p.qB.length; i++) if (!id || p.qB[i].id === id) n += Math.max(0, p.qB[i].n || 0);
  return n;
};
G.loMacDinhXay = function (p, id) {
  var d = G.B(id), co = (p.b[id] || 0) + G.soDangXay(p, id);
  if (!d) return 1;
  var dich = G.slTuCap(d, G.capTuSL(d, co) + 1);
  return Math.max(1, dich - co);
};
G.xepXay = function (st, p, id, n) {
  var d = G.B(id);
  if (!d) return 'Không có công trình này.';
  if (p.qB.length >= 5) return 'Hàng đợi xây dựng đã đầy (5 mục).';
  if (!G.thoaDK(st, p, d)) return 'Chưa đủ điều kiện: ' + G.thieuDK(st, p, d).join(', ') + '.';
  n = n === undefined || n === null ? G.loMacDinhXay(p, id) : Math.floor(Number(n));
  if (!isFinite(n) || n < 1 || n > Number.MAX_SAFE_INTEGER) return 'Số lượng xây không hợp lệ.';
  var daCoLoai = (p.b[id] || 0) > 0 || G.soDangXay(p, id) > 0;
  if (id !== 'terraform' && !daCoLoai && G.oDaDungDuKien(p) >= G.oToiDa(p))
    return 'Hành tinh đã hết khu đất. Xây Cải Tạo Hành Tinh để mở thêm.';
  var cost = G.giaCongTrinh(d, n);
  if (!G.duTien(st, p, cost)) return 'Không đủ tài nguyên.';
  G.truTien(st, p, cost);
  var tg = G.tgXay(st, p, cost);
  var m = { id: id, n: n, cost: cost, tg: tg, xong: null };
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
G.oDaDungDuKien = function (p) {
  var co = {}, n = 0, k, i;
  for (k in p.b) if (p.b[k] > 0) co[k] = true;
  for (i = 0; i < p.qB.length; i++) if ((p.qB[i].n || 0) > 0) co[p.qB[i].id] = true;
  for (k in co) n++;
  return n;
};

G.xepTau = function (st, p, id, n) {
  n = Math.max(1, Math.floor(n));
  var d = G.S(id) || G.D(id) || G.M(id) || G.BB(id);
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
  G.hoanTien(st, p, G.giaDonVi(G.UNIT(m.id) || G.M(m.id), m.n), 1);
};

/* --- Nghiên cứu v5: tổng chi phí chia đều qua checkpoint 6 giờ ---------
 * Không trừ hay giữ chỗ tài nguyên lúc xếp; fleet.js là nơi duy nhất kết
 * toán từng installment tại checkpoint và ghi nhận lần thất bại. */
G.xepNC = function (st, p, id) {
  if (st.ncQueue) return 'Phòng nghiên cứu đang làm việc khác.';
  var d = G.R(id);
  if (!d) return 'Không có đề tài này.';
  if (!p.b.lab) return 'Cần Phòng Nghiên Cứu.';
  if (!G.thoaDK(st, p, d)) return 'Chưa đủ điều kiện: ' + G.thieuDK(st, p, d).join(', ') + '.';
  var lv = (st.tech[id] || 0) + 1;
  var totalCost = G.giaXay(d, lv);
  var tg = G.tgNC(st, p, totalCost);
  var soKy = Math.max(2, Math.ceil(tg / G.NHIP_V1.cycleSeconds));
  var q = {
    id: id,
    lv: lv,
    planetKey: G.tdKey(p.c),
    startedAt: st.now,
    finishAt: st.now + tg,
    totalCost: totalCost,
    paidCost: {},
    installmentsTotal: soKy,
    installmentsLeft: soKy,
    failures: 0,
    status: 'active',
    rules: G.NHIP_V1.researchRules,
    refundPolicy: G.NHIP_V1.refundPolicy
  };
  st.ncQueue = q;
  return null;
};
G.huyNC = function (st) {
  if (!st.ncQueue) return;
  var q = st.ncQueue, p = G.timHanhTinh(st, q.planetKey) || st.planets[0];
  if (p && q.refundPolicy === G.NHIP_V1.legacyRefundPolicy) G.hoanTien(st, p, q.paidCost || {}, 1);
  st.ncQueue = null;
};

/* Bỏ hoang một thuộc địa. Xoá hành tinh khỏi danh sách thì mọi chỉ số hành
 * tinh (hạm đội, nghiên cứu, đợt tấn công đang tới) phải được dời theo. */
G.boHoang = function (st, pi) {
  pi = Math.floor(pi);
  var p = st.planets[pi];
  if (!p) return 'Hành tinh không tồn tại.';
  if (p.thuDo || pi === 0) return 'Không bỏ được hành tinh mẹ.';
  if (st.planets.length <= 1) return 'Đây là hành tinh cuối cùng.';
  if (st.ncQueue && st.ncQueue.planetKey === G.tdKey(p.c))
    return 'Không thể bỏ hành tinh đang chủ trì đề tài nghiên cứu — hãy huỷ đề tài trước.';
  var i;
  for (i = 0; i < st.fleets.length; i++) {
    if (st.fleets[i].pi === pi) return 'Còn hạm đội xuất phát từ hành tinh này đang hoạt động — gọi về đã.';
    if (st.fleets[i].mission === 'hold' && st.fleets[i].pha === 'giu' &&
        G.tdKey(st.fleets[i].den) === G.tdKey(p.c))
      return 'Còn hạm đội đang giữ quỹ đạo hành tinh này — gọi về đã.';
  }
  for (i = 0; i < (st.tenLua || []).length; i++)
    if (st.tenLua[i].pi === pi) return 'Còn tên lửa phóng từ hành tinh này đang bay.';
  for (i = 0; i < st.toi.length; i++)
    if (st.toi[i].pi === pi) return 'Đang có hạm đội địch bay tới hành tinh này — không bỏ chạy giữa chừng được.';

  var ten = p.ten;
  st.planets.splice(pi, 1);
  var doi = function (o) { if (o && o.pi > pi) o.pi--; };
  for (i = 0; i < st.fleets.length; i++) doi(st.fleets[i]);
  for (i = 0; i < (st.tenLua || []).length; i++) doi(st.tenLua[i]);
  for (i = 0; i < st.toi.length; i++) doi(st.toi[i]);
  G.tin(st, 'he', 'Đã bỏ hoang ' + ten,
    'Toàn bộ công trình, tàu và tài nguyên trên ' + ten + ' ' + G.tdStr(p.c) + ' bị bỏ lại. ' +
    'Ô toạ độ này giờ trống, ai cũng có thể tới chiếm.');
  return null;
};

/* =======================================================================
 * ĐIỂM & XẾP HẠNG
 * ===================================================================== */
G.diem = function (st) {
  G.nangCapState(st);
  var d = { ct: 0, nc: 0, ham: 0, thu: 0 }, i, j, k;
  for (i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    for (k in p.b) {
      var bd = G.B(k);
      if (bd && p.b[k] > 0) d.ct += G.giaTriDiem(bd.cost, p.b[k]);
    }
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
