/* THIÊN HÀ ĐẠI CHIẾN — migration state (v3 → v7)
 * Tách khỏi js/engine.js theo review hội đồng: toàn bộ phép nâng cấp
 * save cũ + quy đổi vốn công trình (slTuCap/capTuSL) nằm ở đây để
 * engine.js chỉ còn luật mô phỏng thuần. Thứ tự nạp: sau combat, trước
 * engine (engine gọi G.nangCapState tại G.diem). */
'use strict';
var G = window.G = window.G || {};

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


function chuanHoaNen(st) {
  st.planets = Array.isArray(st.planets) ? st.planets : [];
  st.fleets = Array.isArray(st.fleets) ? st.fleets : [];
  st.toi = Array.isArray(st.toi) ? st.toi : [];
  st.tenLua = Array.isArray(st.tenLua) ? st.tenLua : [];
  st.msgs = Array.isArray(st.msgs) ? st.msgs : [];
  st.nk = Array.isArray(st.nk) ? st.nk : [];
  st.tech = st.tech && typeof st.tech === 'object' ? st.tech : {};
}

/* vectorChiPhi/vectorCong: bản sao cục bộ của helper ở js/engine.js
 * (file nạp sau) — migration phải tự chủ, không phụ thuộc thứ tự ngoài
 * việc G đã tồn tại. */
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

/* STATE V7: KINH TẾ THẬT — thuần additive. Ngân hàng, đầu tư siêu thị, Uranium
 * và lương gián điệp chỉ được GẮN DEFAULT; tuyệt đối không đụng số liệu cũ.
 * LM/chính thể không nằm trong state đế quốc nên không thuộc bước này. */
function nangV6LenV7(st) {
  if (!st.nganHang) st.nganHang = { soDu: 0, laiLuc: 0 };
  else {
    if (!isFinite(Number(st.nganHang.soDu))) st.nganHang.soDu = 0;
    if (!isFinite(Number(st.nganHang.laiLuc))) st.nganHang.laiLuc = 0;
  }
  if (!st.dauTuST || !isFinite(Number(st.dauTuST.ketThucAt)))
    st.dauTuST = { von: 0, ketThucAt: 0 };
  if (!isFinite(Number(st.uranium))) st.uranium = 0;
  if (!st.luongGD) st.luongGD = { muc: 0, traLuc: 0, phanBoi: false };
  /* đơn chợ là projection: thiếu thì coi như không có đơn nào đang mở */
  if (!Array.isArray(st.choDon)) st.choDon = [];
  st.moHinhKT = G.KINH_TE_V1.marker;
  st.v = 7;
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
  if (phienBan === 5) { nangV5LenV6(st, moc); phienBan = 6; }
  if (phienBan === 6) nangV6LenV7(st);
  return st;
};
