/* THIÊN HÀ ĐẠI CHIẾN — hạm đội, nhiệm vụ, bảo trì, dòng thời gian
 * Hai cơ chế lấy nguyên từ bản gốc:
 *   1) Hạm đội được ĐỔI MỤC TIÊU NGAY KHI ĐANG BAY (trả phí Galana).
 *   2) Mỗi 6 giờ có một CHU KỲ BẢO TRÌ: bảo trì được xét trước, rồi từng
 *      vector nghiên cứu được trả nguyên khối tại đúng checkpoint. */
'use strict';
var G = window.G = window.G || {};

/* --- Tốc độ & nhiên liệu ---------------------------------------------- */
G.bonusDC = function (st, dc) {
  if (dc === 'combustion') return 1 + 0.1 * (st.tech.combustion || 0);
  if (dc === 'impulse') return 1 + 0.2 * (st.tech.impulse || 0);
  return 1 + 0.3 * (st.tech.hyperdrive || 0);
};
G.tocDoHam = function (st, ships) {
  var min = Infinity;
  for (var id in ships) {
    if (!ships[id]) continue;
    var s = G.S(id); if (!s) continue;
    var v = s.speed * G.bonusDC(st, s.dc);
    if (v < min) min = v;
  }
  return min === Infinity ? 0 : min;
};
G.tgBay = function (st, ships, kc, pct) {
  pct = pct || 100;
  var v = G.tocDoHam(st, ships);
  if (!v) return 0;
  var t = (35000 / pct * Math.sqrt(kc * 10 / v) + 10) / G.C.TOC_DO_BAY;
  return Math.max(2, Math.round(t));
};
/* [SUY LUẬN] nhiên liệu: tỷ lệ khoảng cách, bay càng nhanh càng tốn */
G.nhienLieu = function (st, ships, kc, pct) {
  pct = pct || 100;
  var base = 0;
  for (var id in ships) { var s = G.S(id); if (s) base += s.fuel * ships[id]; }
  var m = 1 + Math.pow(pct / 100, 2);
  var can = Math.ceil(base * kc / 35000 * m) + 1;
  /* Tàu Dầu tiếp nhiên liệu giữa đường — giảm tối đa 60% tiêu hao */
  var bu = (ships.tauDau || 0) * G.C.TAU_DAU_BU;
  return Math.max(Math.ceil(can * 0.4), can - bu);
};

/* [TÁI DỰNG] Nhiên liệu giữ quỹ đạo tính theo tổng định mức động cơ và số
 * giờ đậu. Hàm thuần để UI, server và kiểm thử dùng đúng cùng một con số. */
G.nhienLieuGiu = function (st, ships, seconds) {
  var base = 0;
  seconds = Number(seconds);
  if (!isFinite(seconds) || seconds <= 0) return 0;
  ships = ships || {};
  for (var id in ships) {
    var raw = Number(ships[id]);
    var s = G.S(id), n = isFinite(raw) ? Math.max(0, Math.floor(raw || 0)) : 0;
    if (s && n) base += s.fuel * n;
  }
  void st;
  return seconds > 0 && base > 0
    ? Math.ceil(base * G.QUY_DAO_V1.fuelPerBaseHour * seconds / 3600)
    : 0;
};

/* Tổng dự kiến phải cộng theo từng đoạn vì mỗi lần trả được làm tròn riêng. */
G.nhienLieuGiuTong = function (st, ships, totalSeconds) {
  totalSeconds = Number(totalSeconds);
  if (!isFinite(totalSeconds) || totalSeconds <= 0) return 0;
  var tongGiay = Math.floor(totalSeconds), doan = G.QUY_DAO_V1.segmentSeconds;
  var dayDu = Math.floor(tongGiay / doan), le = tongGiay % doan;
  return dayDu * G.nhienLieuGiu(st, ships, doan) + G.nhienLieuGiu(st, ships, le);
};

/* Mốc kế tiếp theo pha thật. Trả Infinity cho object hỏng thay vì để undefined
 * làm cả scheduler thành NaN. */
G.mocHamKe = function (f) {
  if (!f) return Infinity;
  var t = Infinity;
  if (f.pha === 'di') t = Number(f.den_t);
  else if (f.pha === 've') t = Number(f.ve_t);
  else if (f.pha === 'giu') {
    var het = Number(f.giuDen_t), nl = Number(f.tiepNL_t);
    if (isFinite(het)) t = Math.min(t, het);
    if (isFinite(nl)) t = Math.min(t, nl);
  }
  return isFinite(t) ? t : Infinity;
};

G.xoaTrangThaiGiu = function (f) {
  f.dangGiu = false;                       // alias v5
  delete f.giuLuc;
  delete f.giuDen_t;
  delete f.tiepNL_t;
  delete f.giuTaiTk;
  delete f.giuRules;
};

/* Một đường duy nhất để bắt đầu lượt về. `daToiDich` đúng khi hạm đã tới đích
 * (kể cả đang giữ quỹ đạo); recall giữa đường dùng chính quãng đã bay. */
G.batDauVe = function (st, f, daToiDich, ghi) {
  var tg;
  if (daToiDich || f.pha === 'giu')
    tg = G.tgBay(st, f.ships, G.khoangCach(f.den, f.tu), f.pct);
  else
    tg = Math.max(2, st.now - (Number(f.diLuc) || st.now));
  G.xoaTrangThaiGiu(f);
  f.pha = 've';
  f.veLuc = st.now;
  f.ve_t = st.now + Math.max(2, Math.round(tg || 0));
  if (ghi) G.ghi(st, ghi);
  return f.ve_t;
};

/* Hook server có thể trả chuỗi lỗi, `{loi}` hoặc `{tk}`. Ở bản một người,
 * Giữ Chỗ chỉ hợp lệ trên một hành tinh khác của chính đế quốc. */
G.kiemTraGiu = function (st, f, o) {
  o = o || G.oHanhTinh(st, f.den);
  if (!o || (o.loai !== 'toi' && o.loai !== 'nguoi'))
    return 'Giữ quỹ đạo chỉ dùng được tại hành tinh của ta hoặc đồng minh.';
  if (G.HOOK && G.HOOK.kiemTraGiu) {
    var kq = G.HOOK.kiemTraGiu(st, f, o);
    var loi = typeof kq === 'string' ? kq : (kq && kq.loi);
    if (loi) return loi;
    if (kq && kq.tk !== undefined && kq.tk !== null) {
      if (f.giuTaiTk !== undefined && f.giuTaiTk !== null && f.giuTaiTk !== kq.tk)
        return 'Hành tinh giữ quỹ đạo đã đổi chủ.';
      f.giuTaiTk = kq.tk;
    }
    return null;
  }
  if (G.HOOK) {
    /* Bridge ngắn cho server đang nâng song song: quan hệ vẫn do hook phát
     * lệnh quyết định; hook arrival mới sẽ thay nhánh này. */
    var pGoc = st.planets[f.pi] || st.planets[0];
    var loiCu = G.HOOK.kiemTraGui && G.HOOK.kiemTraGui(st, pGoc, f.den, 'hold');
    if (loiCu) return typeof loiCu === 'string' ? loiCu : loiCu.loi;
    /* Nếu server chưa cung cấp bất kỳ hook quyền nào thì fail closed cho
     * hành tinh người khác; hành tinh của chính state vẫn xác minh được. */
    return o.loai === 'toi' ? null : 'Máy chủ chưa xác minh được quyền giữ quỹ đạo tại hành tinh này.';
  }
  return o.loai === 'toi' ? null : 'Chế độ một người chỉ giữ được quỹ đạo hành tinh của mình.';
};

/* Trả trước đoạn đầu rồi mới hiện diện trên quỹ đạo. */
G.batDauGiu = function (st, f, o) {
  var loi = G.kiemTraGiu(st, f, o);
  if (loi) return loi;
  f.cargo = f.cargo && typeof f.cargo === 'object' ? f.cargo : {};
  var giu = Math.max(1, Math.floor(Number(f.giu) || 3600));
  var het = st.now + giu;
  var mocNL = Math.min(het, st.now + G.QUY_DAO_V1.segmentSeconds);
  var can = G.nhienLieuGiu(st, f.ships, mocNL - st.now);
  if ((f.cargo.deut || 0) < can)
    return 'Không đủ Nhiên Liệu trong khoang để trả đoạn giữ quỹ đạo đầu tiên (cần ' + G.so(can) + ').';
  f.cargo.deut = (f.cargo.deut || 0) - can;
  if (!f.cargo.deut) delete f.cargo.deut;
  f.pha = 'giu';
  f.giuLuc = st.now;
  f.giuDen_t = het;
  f.tiepNL_t = mocNL;
  if (f.giuTaiTk === undefined) f.giuTaiTk = null;
  f.giuRules = G.QUY_DAO_V1.holdRules;
  f.dangGiu = true;                       // alias v5
  G.ghi(st, 'Hạm đội #' + f.id + ' đã neo quỹ đạo tại ' + G.tdStr(f.den) +
    ', trả trước ' + G.so(can) + ' Nhiên Liệu tới ' + G.tg(mocNL - st.now) + ' tiếp theo.');
  return null;
};

G.hamThanhPheLieu = function (st, f, noi) {
  var pl = G.pheLieu(st, G.tdKey(f.den));
  var kl = 0, tt = 0, mat = 0;
  for (var id in f.ships) {
    var s = G.S(id), n = Math.max(0, Math.floor(Number(f.ships[id]) || 0));
    if (!s || !n) continue;
    kl += (s.cost.metal || 0) * n * G.C.PHE_LIEU;
    tt += (s.cost.crystal || 0) * n * G.C.PHE_LIEU;
    mat += n;
  }
  kl = Math.round(kl); tt = Math.round(tt);
  pl.metal = (Number(pl.metal) || 0) + kl;
  pl.crystal = (Number(pl.crystal) || 0) + tt;
  st.stats = st.stats && typeof st.stats === 'object' ? st.stats : {};
  st.stats.tauMat = (st.stats.tauMat || 0) + mat;
  G.tin(st, 'ham', 'Hạm đội #' + f.id + ' tan rã trên quỹ đạo',
    noi + '\nXác tàu tạo thành ' + G.so(kl) + ' Kim Loại và ' + G.so(tt) + ' Thạch Anh phế liệu tại ' + G.tdStr(f.den) + '.');
  G.xoaHam(st, f);
};

/* Hết một đoạn đã trả: xác minh quyền đậu trước, rồi mới trả trước đoạn kế. */
G.nhipGiu = function (st, f) {
  if (st.now >= f.giuDen_t) {
    G.batDauVe(st, f, true, 'Hạm đội #' + f.id + ' hết ca giữ quỹ đạo, quay về.');
    return;
  }
  var loi = G.kiemTraGiu(st, f);
  if (loi) {
    G.batDauVe(st, f, true, 'Hạm đội #' + f.id + ' rời quỹ đạo ' + G.tdStr(f.den) + ': ' + loi);
    return;
  }
  f.cargo = f.cargo && typeof f.cargo === 'object' ? f.cargo : {};
  var mocMoi = Math.min(f.giuDen_t, st.now + G.QUY_DAO_V1.segmentSeconds);
  var can = G.nhienLieuGiu(st, f.ships, mocMoi - st.now);
  /* Đoạn đầu của save v5 là ân hạn; từ ranh giới này trở đi cùng một luật. */
  f.giuRules = G.QUY_DAO_V1.holdRules;
  if ((f.cargo.deut || 0) < can) {
    G.hamThanhPheLieu(st, f, 'Khoang nhiên liệu không đủ ' + G.so(can) +
      ' đơn vị để duy trì đoạn quỹ đạo kế tiếp; đội hình mất ổn định và bị phá huỷ.');
    return;
  }
  f.cargo.deut = (f.cargo.deut || 0) - can;
  if (!f.cargo.deut) delete f.cargo.deut;
  f.tiepNL_t = mocMoi;
  G.ghi(st, 'Hạm đội #' + f.id + ' tiếp nhiên liệu quỹ đạo ' + G.so(can) +
    ', đủ hoạt động thêm ' + G.tg(mocMoi - st.now) + '.');
};

G.hamGiuTai = function (st, c) {
  var key = G.tdKey(c), out = [];
  for (var i = 0; i < st.fleets.length; i++) {
    var f = st.fleets[i];
    if (f.mission === 'hold' && f.pha === 'giu' && G.tdKey(f.den) === key &&
        Number(f.giuDen_t) > st.now && !G.trong(f.ships)) out.push(f);
  }
  return out;
};

/* --- Gửi hạm đội ------------------------------------------------------- */
G.guiHam = function (st, pi, ships, den, mission, cargo, pct, giuGio, linh) {
  var p = st.planets[pi];
  if (!p) return 'Hành tinh không tồn tại.';
  if (G.trong(ships)) return 'Chưa chọn tàu nào.';
  if (st.fleets.length >= G.khe(st)) return 'Hết khe hạm đội (' + G.khe(st) + '). Nâng Công Nghệ Máy Tính hoặc Đài Chỉ Huy.';
  if (G.bang(den, p.c) ) return 'Mục tiêu trùng với hành tinh xuất phát.';
  var id, sach = {};
  for (id in ships) {
    var n = Math.floor(ships[id] || 0);
    if (n <= 0 || !G.S(id)) continue;
    if ((p.ships[id] || 0) < n) return 'Không đủ ' + G.S(id).ten + '.';
    sach[id] = n;
  }
  ships = sach;
  if (G.trong(ships)) return 'Chưa chọn tàu nào.';
  if (mission === 'spy' && !ships.probe) return 'Nhiệm vụ do thám cần Tàu Do Thám.';
  if (mission === 'thamhiem') {
    if (den.p !== G.C.O_THAM_HIEM) return 'Thám hiểm chỉ bay tới ô ' + G.C.O_THAM_HIEM + ' — vùng không gian sâu ở rìa hệ.';
    if (G.dangThamHiem(st) >= G.kheThamHiem(st))
      return 'Chỉ điều được ' + G.kheThamHiem(st) + ' đoàn thám hiểm cùng lúc (nâng Công Nghệ Liên Hành Tinh để thêm).';
  } else if (den.p === G.C.O_THAM_HIEM) {
    return 'Ô ' + G.C.O_THAM_HIEM + ' là vùng không gian sâu, chỉ nhận nhiệm vụ Thám Hiểm.';
  }
  if (mission === 'colonize' && !ships.colony) return 'Nhiệm vụ thực dân cần Tàu Thực Dân.';
  if (mission === 'recycle' && !ships.recycler) return 'Nhiệm vụ thu hồi cần Tàu Thu Hồi.';
  /* Bản một người không có khái niệm NPC đồng minh: chỉ một hành tinh khác
   * của chính đế quốc là điểm neo hợp lệ. Server kiểm tra quan hệ bằng hook. */
  if (mission === 'hold' && !G.HOOK && G.oHanhTinh(st, den).loai !== 'toi')
    return 'Chế độ một người chỉ giữ được quỹ đạo hành tinh của mình.';
  if (G.HOOK && G.HOOK.kiemTraGui) {
    var loiQuyen = G.HOOK.kiemTraGui(st, p, den, mission);
    var noiQuyen = typeof loiQuyen === 'string' ? loiQuyen : (loiQuyen && loiQuyen.loi);
    if (noiQuyen) return noiQuyen;
  }

  var kc = G.khoangCach(p.c, den);
  var tg = G.tgBay(st, ships, kc, pct);
  var nl = G.nhienLieu(st, ships, kc, pct);
  if ((p.res.deut || 0) < nl) return 'Không đủ Nhiên Liệu (cần ' + G.so(nl) + ').';

  /* quân đổ bộ: chỉ theo nhiệm vụ Tấn Công / Triển Khai / Vận Chuyển, cần chỗ chở */
  linh = linh || {};
  var sachLinh = {}, idL;
  for (idL in linh) {
    var nL = Math.max(0, Math.floor(linh[idL] || 0));
    if (!nL || !G.BB(idL)) continue;
    if ((p.linh && p.linh[idL] ? p.linh[idL] : 0) < nL) return 'Không đủ ' + G.BB(idL).ten + '.';
    sachLinh[idL] = nL;
  }
  linh = sachLinh;
  if (!G.trong(linh)) {
    if (['attack', 'deploy', 'transport'].indexOf(mission) < 0)
      return 'Chỉ nhiệm vụ Tấn Công, Triển Khai hoặc Vận Chuyển mới chở được quân đổ bộ.';
    var canCho = G.choLinhCan(linh), coCho = G.sucChoLinh(ships);
    if (canCho > coCho)
      return 'Không đủ chỗ chở quân: cần ' + G.so(canCho) + ', hạm đội chở được ' + G.so(coCho) +
        ' (Đại Chiến Hạm chở được nhiều nhất).';
  }

  cargo = cargo || {};
  var suc = G.khoangHang(ships);
  var tongHang = 0;
  for (id in cargo) { cargo[id] = Math.max(0, Math.floor(cargo[id] || 0)); tongHang += cargo[id]; }
  if (tongHang > suc - (mission === 'attack' ? 0 : 0)) return 'Khoang hàng chỉ chứa được ' + G.so(suc) + '.';
  if (mission === 'hold') {
    var giuGiay = Math.max(1, Math.floor(Number(giuGio) || 1) * 3600);
    var nlDoanDau = G.nhienLieuGiu(st, ships, Math.min(giuGiay, G.QUY_DAO_V1.segmentSeconds));
    if ((cargo.deut || 0) < nlDoanDau)
      return 'Giữ quỹ đạo cần chở ít nhất ' + G.so(nlDoanDau) +
        ' Nhiên Liệu cho đoạn đầu (' + G.tg(Math.min(giuGiay, G.QUY_DAO_V1.segmentSeconds)) + ').';
  }
  for (id in cargo) if ((p.res[id] || 0) < cargo[id] + (id === 'deut' ? nl : 0)) return 'Không đủ ' + G.byId(G.RES, id).ten + ' để xếp hàng.';

  /* trừ tàu, quân, hàng, nhiên liệu */
  for (id in ships) p.ships[id] -= ships[id];
  if (!p.linh) p.linh = {};
  for (idL in linh) { p.linh[idL] -= linh[idL]; if (!p.linh[idL]) delete p.linh[idL]; }
  p.res.deut -= nl;
  for (id in cargo) if (cargo[id] > 0) p.res[id] -= cargo[id];

  var f = {
    id: st.fleetIdSeq++, pi: pi, tu: { g: p.c.g, h: p.c.h, p: p.c.p }, den: { g: den.g, h: den.h, p: den.p },
    mission: mission, ships: ships, linh: linh, cargo: cargo, pct: pct || 100,
    diLuc: st.now, den_t: st.now + tg, veLuc: null, ve_t: null, pha: 'di',
    giu: (mission === 'hold') ? Math.max(1, Math.floor(Number(giuGio) || 1) * 3600) : 0,
    nl: nl, kc: kc, doiHuong: 0
  };
  st.fleets.push(f);
  st.stats.chuyenBay++;
  G.ghi(st, 'Hạm đội #' + f.id + ' rời ' + G.tdStr(p.c) + ' → ' + G.tdStr(den) + ' (' + G.byId(G.MISSIONS, mission).ten + '), tới sau ' + G.tg(tg) + '.');
  return null;
};

/* --- ĐỔI MỤC TIÊU GIỮA ĐƯỜNG (đặc trưng của bản gốc) ------------------ */
G.doiMucTieu = function (st, fid, den) {
  var f = null, i;
  for (i = 0; i < st.fleets.length; i++) if (st.fleets[i].id === fid) f = st.fleets[i];
  if (!f) return 'Không tìm thấy hạm đội.';
  if (st.galana < G.C.DOI_MUC_TIEU_GALANA) return 'Cần ' + G.C.DOI_MUC_TIEU_GALANA + ' Galana để phát lệnh đổi hướng.';
  var dangVe = f.pha === 've';
  var dangGiu = f.pha === 'giu' || (f.mission === 'thamhiem' && f.dangGiu);
  var dau = dangGiu ? f.den : (dangVe ? f.den : f.tu);
  var cuoi = dangGiu ? f.den : (dangVe ? f.tu : f.den);
  if (G.bang(den, cuoi)) return 'Đã đang bay tới đó rồi.';
  if (f.mission === 'hold' && !G.HOOK && G.oHanhTinh(st, den).loai !== 'toi')
    return 'Chế độ một người chỉ giữ được quỹ đạo hành tinh của mình.';
  if (G.HOOK && G.HOOK.kiemTraGui) {
    var pGoc = st.planets[f.pi] || st.planets[0];
    var loiQuyen = G.HOOK.kiemTraGui(st, pGoc, den, f.mission);
    var noiQuyen = typeof loiQuyen === 'string' ? loiQuyen : (loiQuyen && loiQuyen.loi);
    if (noiQuyen) return noiQuyen;
  }

  var ketThuc = dangGiu ? st.now : (dangVe ? f.ve_t : f.den_t);
  var batDau = dangGiu ? st.now : (dangVe ? f.veLuc : f.diLuc);
  if (!(batDau >= 0)) {
    /* save cũ chưa có veLuc: suy ngược từ thời gian bay đầy đủ */
    batDau = ketThuc - G.tgBay(st, f.ships, G.khoangCach(dau, cuoi), f.pct);
  }
  var tong = ketThuc - batDau;
  var fr = dangGiu ? 1 : (tong > 0 ? Math.min(1, Math.max(0, (st.now - batDau) / tong)) : 1);
  /* vị trí hiện tại nội suy trên đường bay -> khoảng cách tới mục tiêu mới */
  var kcMoi = (1 - fr) * G.khoangCach(dau, den) + fr * G.khoangCach(cuoi, den);
  kcMoi = Math.max(5, Math.round(kcMoi));
  var tg = G.tgBay(st, f.ships, kcMoi, f.pct);
  var nlThem = G.nhienLieu(st, f.ships, kcMoi, f.pct);
  f.cargo = f.cargo || {};
  var dt = f.cargo.deut || 0;
  /* nhiên liệu phụ trội lấy từ khoang hàng nếu có, thiếu thì trả bằng Galana */
  var traGalana = G.C.DOI_MUC_TIEU_GALANA;
  var deutCon = Math.max(0, dt - nlThem);
  if (dt < nlThem) traGalana += Math.ceil((nlThem - dt) * 3);
  if (f.mission === 'hold') {
    var nlGiuDau = G.nhienLieuGiu(st, f.ships,
      Math.min(Math.max(1, Number(f.giu) || 3600), G.QUY_DAO_V1.segmentSeconds));
    if (deutCon < nlGiuDau)
      return 'Sau khi đổi hướng phải còn ' + G.so(nlGiuDau) +
        ' Nhiên Liệu trong khoang cho đoạn giữ quỹ đạo đầu tiên.';
  }
  if (st.galana < traGalana) return 'Cần ' + G.so(traGalana) + ' Galana (gồm phí nhiên liệu phụ trội).';
  f.cargo.deut = deutCon;
  if (!f.cargo.deut) delete f.cargo.deut;
  st.galana -= traGalana;

  f.den = { g: den.g, h: den.h, p: den.p };
  G.xoaTrangThaiGiu(f);
  f.pha = 'di'; f.veLuc = null; f.ve_t = null;
  f.diLuc = st.now; f.den_t = st.now + tg; f.kc = kcMoi; f.doiHuong++;
  G.ghi(st, 'Hạm đội #' + f.id + ' đổi hướng giữa đường → ' + G.tdStr(den) + ' (phí ' + G.so(traGalana) + ' Galana).');
  return null;
};

G.goiVe = function (st, fid) {
  for (var i = 0; i < st.fleets.length; i++) {
    var f = st.fleets[i];
    if (f.id !== fid) continue;
    if (f.pha === 've') return 'Hạm đội đã đang về.';
    G.batDauVe(st, f, f.pha === 'giu' || !!f.dangGiu, null);
    G.ghi(st, 'Hạm đội #' + f.id + ' được gọi về, tới sau ' + G.tg(f.ve_t - st.now) + '.');
    return null;
  }
  return 'Không tìm thấy hạm đội.';
};

/* --- Xử lý hạm đội tới đích ------------------------------------------- */
G.hamToiDich = function (st, f) {
  var o = G.oHanhTinh(st, f.den);
  var veNha = function (ghi) {
    G.batDauVe(st, f, true, ghi);
  };

  if (f.mission === 'thamhiem') {
    if (!f.dangGiu) {                     /* dừng lại lùng sục một lúc rồi mới có kết quả */
      f.dangGiu = true;
      f.den_t = st.now + Math.max(60, Math.round(1800 / G.C.TOC_DO_BAY));
      return;
    }
    f.dangGiu = false;
    G.thamHiem(st, f);
    return;
  }

  if (f.mission === 'hold') {
    var loiGiu = G.batDauGiu(st, f, o);
    if (loiGiu) veNha('Hạm đội #' + f.id + ' không thể neo quỹ đạo: ' + loiGiu + ' Hạm đội quay về.');
    return;
  }

  if (f.mission === 'deploy' || f.mission === 'transport') {
    /* Tiếp tế cho người chơi khác: chỉ nhiệm vụ Vận Chuyển, và chỉ ở bản nhiều người */
    if (f.mission === 'transport' && o.loai === 'nguoi' && G.HOOK && G.HOOK.tangNguoi) {
      G.HOOK.tangNguoi(st, f, o, veNha); return;
    }
    if (o.loai !== 'toi') { veNha('Hạm đội #' + f.id + ': ' + G.tdStr(f.den) + ' không phải hành tinh của ta, hàng được mang về.'); return; }
    var pt = o.p, k;
    for (k in f.cargo) if (f.cargo[k] > 0) pt.res[k] = (pt.res[k] || 0) + f.cargo[k];
    if (f.linh && !G.trong(f.linh)) {
      if (!pt.linh) pt.linh = {};
      for (k in f.linh) pt.linh[k] = (pt.linh[k] || 0) + f.linh[k];
      f.linh = {};
    }
    if (f.mission === 'deploy') {
      for (k in f.ships) pt.ships[k] = (pt.ships[k] || 0) + f.ships[k];
      G.tin(st, 'ham', 'Triển khai xong', 'Hạm đội #' + f.id + ' đã nhập biên chế tại ' + pt.ten + ' ' + G.tdStr(pt.c) + '.');
      G.xoaHam(st, f); return;
    }
    G.tin(st, 'ham', 'Giao hàng xong', 'Hạm đội #' + f.id + ' đã giao hàng tại ' + pt.ten + ' ' + G.tdStr(pt.c) + '.');
    f.cargo = {}; veNha(null); return;
  }

  if (f.mission === 'spy') {
    if (o.loai === 'nguoi' && G.HOOK && G.HOOK.doThamNguoi) { G.HOOK.doThamNguoi(st, f, o); veNha(null); return; }
    if (o.loai === 'npc') G.doThamNPC(st, f, o.npc);
    else if (o.loai === 'trong') G.tin(st, 'tt', 'Báo cáo do thám ' + G.tdStr(f.den), 'Ô toạ độ trống, không có hành tinh nào ở đây.');
    else G.tin(st, 'tt', 'Báo cáo do thám', 'Đây là hành tinh của chính ta.');
    veNha(null); return;
  }

  if (f.mission === 'recycle') {
    var pl = G.pheLieu(st, o.key);
    var suc = G.khoangHang(f.ships), lay = { metal: 0, crystal: 0 };
    var conCho = suc;
    lay.metal = Math.min(pl.metal, conCho); conCho -= lay.metal;
    lay.crystal = Math.min(pl.crystal, conCho);
    pl.metal -= lay.metal; pl.crystal -= lay.crystal;
    f.cargo.metal = (f.cargo.metal || 0) + Math.floor(lay.metal);
    f.cargo.crystal = (f.cargo.crystal || 0) + Math.floor(lay.crystal);
    G.tin(st, 'ham', 'Thu hồi phế liệu ' + G.tdStr(f.den),
      'Đã vét được ' + G.so(lay.metal) + ' Kim Loại và ' + G.so(lay.crystal) + ' Thạch Anh từ bãi phế liệu.');
    veNha(null); return;
  }

  if (f.mission === 'colonize') {
    if (o.loai !== 'trong') { veNha('Hạm đội #' + f.id + ': ' + G.tdStr(f.den) + ' đã có chủ, tàu thực dân quay về.'); return; }
    if (st.planets.length >= G.maxThuocDia(st)) {
      veNha(null);
      G.tin(st, 'he', 'Không thể thực dân hoá', 'Đã đạt giới hạn ' + G.maxThuocDia(st) + ' hành tinh. Nâng Công Nghệ Liên Hành Tinh để mở thêm.');
      return;
    }
    var np = G.htMoi(st, f.den, 'Thuộc Địa ' + st.planets.length, false);
    for (var kk in f.cargo) if (f.cargo[kk] > 0) np.res[kk] = (np.res[kk] || 0) + f.cargo[kk];
    f.ships.colony--; if (!f.ships.colony) delete f.ships.colony;
    st.planets.push(np);
    G.tin(st, 'he', 'Thuộc địa mới!', 'Đã dựng thuộc địa tại ' + G.tdStr(f.den) + ' — nhiệt độ ' + np.temp + '°C, ' + np.oDat + ' ô đất.');
    if (G.trong(f.ships)) { G.xoaHam(st, f); return; }
    veNha(null); return;
  }

  /* --- TẤN CÔNG --- */
  if (f.mission === 'attack') {
    if (o.loai === 'trong') { veNha(null); G.tin(st, 'tt', 'Không tìm thấy mục tiêu', G.tdStr(f.den) + ' là ô trống — hạm đội quay về.'); return; }
    if (o.loai === 'toi') { veNha(null); return; }
    if (o.loai === 'nguoi') {
      /* Đánh người chơi khác: server xử lý (cần state của đối phương) */
      if (G.HOOK && G.HOOK.danhNguoi) { G.HOOK.danhNguoi(st, f, o, veNha); return; }
      veNha(null); return;
    }
    var n = o.npc;
    var diemTa = G.diem(st).tong;
    if (diemTa < G.C.BAO_VE_MOI_DIEM && n.diem > diemTa * G.C.BAO_VE_MOI_TY_LE) {
      veNha(null);
      G.tin(st, 'he', 'Bảo vệ người chơi mới', 'Mục tiêu mạnh hơn ta quá ' + G.C.BAO_VE_MOI_TY_LE + ' lần, hệ thống chặn cuộc tấn công. Hạm đội quay về.');
      return;
    }
    var Lmuc = G.LHT(G.loaiTheoViTri(st.seed, f.den));
    var kq = G.danhTran(
      { ten: st.ten, tech: st.tech, ships: f.ships },
      { ten: n.ten + ' — ' + n.htTen, tech: n.tech, ships: n.ships, def: n.def,
        thuDat: Lmuc.thuDat, loaiHT: Lmuc.ten },
      G.hash(f.id + ':' + st.now + ':' + o.key));

    f.ships = kq.conShipsA;
    n.ships = kq.conShipsD; n.def = kq.conDefD;

    var cuop = { metal: 0, crystal: 0, deut: 0, food: 0 };
    if (kq.kq === 'thang') {
      cuop = G.chiaHang(n.res, G.khoangHang(f.ships) - G.tongRes(f.cargo), G.C.CUOP_TOI_DA);
      for (var rk in cuop) {
        n.res[rk] -= cuop[rk];
        f.cargo[rk] = (f.cargo[rk] || 0) + cuop[rk];
      }
      st.stats.thang++; st.stats.cuop += G.tongRes(cuop);
    } else if (kq.kq === 'thua' || kq.kq === 'huyDiet') st.stats.thua++;

    /* --- ĐỔ BỘ: quỹ đạo vỡ rồi mới thả quân xuống --- */
    var doBo = null;
    if (kq.kq === 'thang' && f.linh && !G.trong(f.linh)) {
      if (!n.linh) n.linh = { robot: Math.round(n.diem * (n.bo ? 0.6 : 3)), tank: Math.round(n.diem * (n.bo ? 0.08 : 0.4)) };
      var thuDat0 = G.thuMatDat(n.def);
      doBo = G.doBoXuong(st, f, { ten: n.ten, tech: n.tech, linh: n.linh, def: thuDat0, thuDat: Lmuc.thuDat });
      G.gopThuMatDat(n.def, thuDat0);
      if (doBo.thang) {
        /* vét thêm phần kho mà đánh từ quỹ đạo không với tới — CỘNG THÊM vào
           chỗ đã cướp được, không ghi đè */
        var themCuop = G.chiaHang(n.res, G.khoangHang(f.ships) - G.tongRes(f.cargo), G.C.CUOP_DO_BO);
        for (var rk2 in themCuop) {
          if (!themCuop[rk2]) continue;
          n.res[rk2] -= themCuop[rk2];
          f.cargo[rk2] = (f.cargo[rk2] || 0) + themCuop[rk2];
          cuop[rk2] = (cuop[rk2] || 0) + themCuop[rk2];
          st.stats.cuop += themCuop[rk2];
        }
      }
      st.stats.doBo = (st.stats.doBo || 0) + 1;
    }

    var pl = G.pheLieu(st, o.key);
    pl.metal += kq.pheLieu.metal; pl.crystal += kq.pheLieu.crystal;
    for (var kx in kq.matA) st.stats.tauMat += kq.matA[kx];
    for (var ky in kq.matD) st.stats.tauDietDich += kq.matD[ky];

    G.tin(st, 'tran', 'Báo cáo chiến đấu ' + G.tdStr(f.den), null,
      { kq: kq, cuop: cuop, pl: kq.pheLieu, td: f.den, ben: 'ta', doBo: doBo });
    n.cuopLuc = st.now;
    if (!st.hanThu) st.hanThu = [];
    if (st.hanThu.indexOf(o.key) < 0) st.hanThu.push(o.key);
    if (st.hanThu.length > 8) st.hanThu.shift();

    if (G.trong(f.ships)) { G.ghi(st, 'Hạm đội #' + f.id + ' bị xoá sổ hoàn toàn tại ' + G.tdStr(f.den) + '.'); G.xoaHam(st, f); return; }
    veNha(null); return;
  }

  veNha(null);
};

G.hamVeNha = function (st, f) {
  var p = st.planets[f.pi] || st.planets[0];
  var k;
  for (k in f.ships) p.ships[k] = (p.ships[k] || 0) + f.ships[k];
  if (f.linh) { if (!p.linh) p.linh = {}; for (k in f.linh) p.linh[k] = (p.linh[k] || 0) + f.linh[k]; }
  /* Hàng trên tàu luôn được dỡ HẾT, kể cả khi vượt dung tích kho: dung tích chỉ
     chặn phần SẢN XUẤT (xem G.sanXuat), không được ăn mất chiến lợi phẩm. */
  for (k in f.cargo) if (f.cargo[k] > 0) p.res[k] = (p.res[k] || 0) + f.cargo[k];
  G.ghi(st, 'Hạm đội #' + f.id + ' đã về ' + p.ten + ' ' + G.tdStr(p.c) + '.');
  G.xoaHam(st, f);
};
G.xoaHam = function (st, f) {
  var i = st.fleets.indexOf(f);
  if (i >= 0) st.fleets.splice(i, 1);
};

/* --- Do thám ----------------------------------------------------------- */
G.doThamNPC = function (st, f, n) {
  var soTau = f.ships.probe || 1;
  var chenh = (st.tech.spy || 0) - (n.tech.spy || 0);
  var mucDo = Math.max(1, Math.min(5, 1 + Math.floor(chenh / 2) + Math.floor(Math.log(soTau + 1) / Math.log(3))));
  var banHa = Math.max(0, Math.min(0.85, 0.06 * Math.max(0, (n.tech.spy || 0) - (st.tech.spy || 0)) + (n.bo ? 0 : 0.04)));
  var mat = 0;
  var r = G.rng(G.hash('spy' + f.id + st.now));
  for (var i = 0; i < soTau; i++) if (r() < banHa) mat++;
  if (mat > 0) {
    f.ships.probe -= mat;
    if (!f.ships.probe) delete f.ships.probe;
  }
  var bc = {
    td: f.den, ten: n.ten, ht: n.htTen, lm: n.lm, diem: n.diem, bo: n.bo, mucDo: mucDo, mat: mat,
    res: { metal: Math.floor(n.res.metal), crystal: Math.floor(n.res.crystal), deut: Math.floor(n.res.deut), food: Math.floor(n.res.food) },
    ships: mucDo >= 2 ? G.clone(n.ships) : null,
    def: mucDo >= 3 ? G.clone(n.def) : null,
    tech: mucDo >= 4 ? G.clone(n.tech) : null,
    t: st.now
  };
  /* xác suất thắng nếu đánh bằng hạm đội đang có ở hành tinh gốc */
  G.tin(st, 'tt', 'Báo cáo do thám ' + G.tdStr(f.den), null, { bc: bc });
  if (!st.spy) st.spy = {};
  st.spy[G.tdKey(f.den)] = bc;
};

/* --- Nhịp đế quốc 6 giờ: bảo trì -> nghiên cứu -> dân sự ---------------
 * Mọi phép kết toán chỉ chạy ở checkpoint của tài khoản. Không tự trả nợ
 * giữa hai checkpoint: cùng một save và cùng một mốc thời gian phải luôn cho
 * cùng một kết quả, dù người chơi có mở game nhiều lần hay không.          */
G.phiBaoTriNhip = function (st) {
  var c = G.NHIP_V1 || {};
  /* Giữ đúng công thức cân bằng đã phát hành trước v5; schema mới chỉ đổi
   * thời điểm/giao dịch và hậu quả, không âm thầm đổi hoá đơn người chơi. */
  var d = G.diem(st);
  var raw = (c.maintenanceMilitaryPointRate === undefined ? 0.015 : c.maintenanceMilitaryPointRate) *
      (d.ham + d.thu) +
    (c.maintenanceBuildingPointRate === undefined ? 0.008 : c.maintenanceBuildingPointRate) * d.ct;
  var giamBp = Math.min(c.maintenanceDepotMaxReductionBp === undefined ? 6000 : c.maintenanceDepotMaxReductionBp,
    G.tongB(st, 'maintDepot') * (c.maintenanceDepotReductionBp === undefined ? 600 : c.maintenanceDepotReductionBp));
  return { raw: raw, giamBp: giamBp, phi: Math.round(raw * (10000 - giamBp) / 10000 * 10) / 10 };
};

G.timHanhTinhNhip = function (st, key) {
  for (var i = 0; i < st.planets.length; i++) if (G.tdKey(st.planets[i].c) === key) return st.planets[i];
  return null;
};

G.moTaVectorNhip = function (cost) {
  var ra = [], k;
  for (k in cost) if (cost[k] > 0) {
    var r = G.byId(G.RES, k);
    ra.push((r ? r.ten : k) + ' ' + G.so(cost[k]));
  }
  return ra.length ? ra.join(', ') : '0';
};

/* Một lần thất bại chỉ được dời đúng một nhịp, kể cả nguyên nhân đồng thời là
 * thiếu bảo trì và thiếu vector tài nguyên của đề tài. */
G.thatBaiNCNhip = function (st, q, lyDo, dong) {
  if (!q) return;
  var c = G.NHIP_V1 || {}, chuKy = c.cycleSeconds || G.C.CHU_KY_BAO_TRI;
  q.failures = Math.max(0, Math.floor(Number(q.failures) || 0)) + 1;
  q.status = 'retry';
  q.treo = true;                    // alias cho UI/save v4
  q.finishAt = (Number(q.finishAt) || st.now) + chuKy;
  q.conLai = Math.max(0, q.finishAt - st.now);
  if (dong) dong.push('NGHIÊN CỨU THẤT BẠI KỲ NÀY: ' + lyDo + '. Hoãn đúng 6 giờ, thử lại ở checkpoint kế tiếp.');
};

/* Trả một vector kỳ nghiên cứu theo nguyên tắc tất-cả-hoặc-không-gì. */
G.thanhToanNCNhip = function (st, dong) {
  var q = st.ncQueue;
  if (!q) return true;
  if (Math.max(0, Math.floor(Number(q.installmentsLeft) || 0)) <= 0) {
    /* Có thể đã trả đủ nhưng checkpoint trước thiếu bảo trì nên status=retry.
     * Một checkpoint thành công phải mở lại đồng hồ, dù không còn vector. */
    q.status = 'active'; q.treo = false;
    return true;
  }
  var p = G.timHanhTinhNhip(st, q.planetKey);
  if (!p) {
    G.thatBaiNCNhip(st, q, 'không còn hành tinh chủ trì ' + q.planetKey, dong);
    return false;
  }
  var ky = G.kyNghienCuu ? G.kyNghienCuu(q) : (G.phanKyNC ? G.phanKyNC(q) : {});
  if (!G.duTien(st, p, ky)) {
    G.thatBaiNCNhip(st, q, 'không đủ nguyên liệu cho kỳ trả góp (' + G.moTaVectorNhip(ky) + ')', dong);
    return false;
  }
  G.truTien(st, p, ky);             // chỉ mutate sau khi cả vector đã qua kiểm tra
  if (!q.paidCost || typeof q.paidCost !== 'object') q.paidCost = {};
  for (var k in ky) q.paidCost[k] = (Number(q.paidCost[k]) || 0) + ky[k];
  q.installmentsLeft = Math.max(0, Math.floor(Number(q.installmentsLeft) || 0) - 1);
  q.status = 'active'; q.treo = false;
  q.conLai = Math.max(0, (Number(q.finishAt) || st.now) - st.now);
  dong.push('Đã trả nguyên kỳ nghiên cứu "' + G.R(q.id).ten + '": ' + G.moTaVectorNhip(ky) +
    ' (còn ' + q.installmentsLeft + '/' + q.installmentsTotal + ' kỳ).');
  return true;
};

G.gioiHanBpNhip = function (n, toiDa) {
  return Math.max(0, Math.min(toiDa === undefined ? 10000 : toiDa, Math.round(Number(n) || 0)));
};

/* Phá tỷ lệ công trình nhưng chỉ quét một lần qua mỗi loại. Phân bổ theo
 * tổng tích luỹ giúp kết quả tỷ lệ, xác định và không lặp theo từng đơn vị. */
G.suyThoaiCongTrinhNhip = function (p, bp) {
  var ds = [], tong = 0, k, i;
  for (k in p.b) if (G.B(k) && p.b[k] > 0) { ds.push(k); tong += p.b[k]; }
  ds.sort();
  if (!tong || bp <= 0) return 0;
  var raw = tong * bp / 10000 + (Number(p.danSu.decayRemainder) || 0);
  var canPha = Math.min(tong, Math.floor(raw));
  p.danSu.decayRemainder = raw - canPha;
  var daPha = 0, daXet = 0, mocTruoc = 0;
  for (i = 0; i < ds.length && daPha < canPha; i++) {
    var co = Math.max(0, Math.floor(Number(p.b[ds[i]]) || 0));
    daXet += co;
    var moc = Math.floor(daXet * canPha / tong);
    var n = Math.min(co, moc - mocTruoc);
    if (n > 0) daPha += G.giamCongTrinh(p, ds[i], n);
    mocTruoc = moc;
  }
  return daPha;
};

G.nhipDanSu = function (st, p, baoTriDat, muc, dong) {
  var c = G.NHIP_V1 || {}, ds = p.danSu;
  var loai = G.loaiHT(st, p);
  var san = c.populationFloor === undefined ? 250000 : c.populationFloor;
  var dan = Math.max(san, Math.floor(Number(ds.population) || san));
  /* sanXuat cộng nhu cầu THỰC của từng đoạn dt; nhờ vậy một kỳ bị chia bởi
   * chuyến bay/xây dựng vẫn có cùng kết quả như một đoạn 6 giờ liền. */
  var nhuCau = Math.max(0, Number(ds.foodDemandCycle) || 0);
  var thieu = Math.max(0, Number(ds.foodShortfallCycle) || 0);
  var tyLeThieu = nhuCau > 0 ? Math.min(1, thieu / nhuCau) : 0;
  var matDoi = Math.floor(Math.max(0, dan - san) *
    (c.foodShortfallMaxLossBp === undefined ? 500 : c.foodShortfallMaxLossBp) * tyLeThieu / 10000);
  var matBaoTri = muc >= (c.populationLossMissStreak || 2)
    ? Math.floor(Math.max(0, dan - san) * (c.maintenancePopulationLossBp === undefined ? 250 : c.maintenancePopulationLossBp) / 10000)
    : 0;
  if (matDoi || matBaoTri) dan = Math.max(san, dan - matDoi - matBaoTri);
  else if (!tyLeThieu && baoTriDat) {
    var sucChua = G.sucChuaDan ? G.sucChuaDan(p) : san;
    var tangBp = (c.populationGrowthBp === undefined ? 25 : c.populationGrowthBp) *
      (loai.dan === undefined ? 1 : loai.dan);
    dan += Math.floor(Math.max(0, sucChua - dan) * tangBp / 10000);
  }
  ds.population = Math.max(san, dan);

  /* Mốc tư liệu cho thấy thuế 0% và 4% cùng nhánh không gây áp lực. Support
   * có thể vượt 100% (đã thấy 140%), nên không được clamp về 10.000 bp. */
  var thueSo = Number(ds.taxBp);
  if (!isFinite(thueSo)) thueSo = c.defaultTaxBp || 0;
  ds.taxBp = Math.max(c.minTaxBp || 0, Math.min(c.maxTaxBp === undefined ? 10000 : c.maxTaxBp,
    Math.round(thueSo)));
  var toiDaUngHo = c.maxSupportBp === undefined ? 20000 : c.maxSupportBp;
  var ungHo = G.gioiHanBpNhip(ds.supportBp === undefined ? c.defaultSupportBp : ds.supportBp, toiDaUngHo);
  var hoi = c.supportRecoverBp === undefined ? 100 : c.supportRecoverBp;
  var apLucThue = Math.max(0, ds.taxBp - 400);
  var dichUngHo = G.gioiHanBpNhip(10000 - 3 * apLucThue + (Number(loai.ungHoBp) || 0), toiDaUngHo);
  /* `hoi` là tốc độ hội tụ theo bp, không phải một bước cộng cứng. Nhờ vậy
   * offset loại hành tinh có tác dụng ngay từ checkpoint đầu mà không khiến
   * support nhảy đột ngột hàng trăm điểm phần trăm. */
  var lechUngHo = dichUngHo - ungHo;
  if (lechUngHo) {
    var buocUngHo = Math.round(Math.abs(lechUngHo) * hoi / 10000);
    if (!buocUngHo) buocUngHo = 1;
    ungHo += lechUngHo > 0 ? buocUngHo : -buocUngHo;
  }
  ungHo -= Math.round((c.supportFoodPenaltyBp === undefined ? 400 : c.supportFoodPenaltyBp) * tyLeThieu);
  if (!baoTriDat) ungHo -= (c.supportMaintenancePenaltyBp === undefined ? 200 : c.supportMaintenancePenaltyBp) * Math.max(1, muc);
  ds.supportBp = G.gioiHanBpNhip(ungHo, toiDaUngHo);

  var pha = muc >= (c.infrastructureDecayMissStreak || 3)
    ? G.suyThoaiCongTrinhNhip(p, c.infrastructureDecayBp === undefined ? 100 : c.infrastructureDecayBp) : 0;
  ds.foodDemandCycle = 0;
  ds.foodShortfallCycle = 0;
  p.doi = tyLeThieu > 0 ? 6 : 0;       // alias hình phạt/UI v4
  if (thieu > 0 || matBaoTri > 0 || pha > 0) {
    dong.push(p.ten + ' ' + G.tdStr(p.c) + ': thiếu ' + G.so(thieu) + ' Thực Phẩm; dân −' +
      G.so(matDoi + matBaoTri) + ', ủng hộ ' + (ds.supportBp / 100).toFixed(1) + '%' +
      (pha ? ', cơ sở vật chất −' + G.so(pha) : '') + '.');
  }
  return { foodShortfall: thieu, populationLost: matDoi + matBaoTri, buildingsLost: pha };
};

G.baoTri = function (st) {
  var c = G.NHIP_V1 || {}, chuKy = c.cycleSeconds || G.C.CHU_KY_BAO_TRI;
  var bt = st.baoTri;
  if (!bt) return;                    // migration v5 là chủ sở hữu schema
  /* Giữ pha đồng hồ tài khoản (từ lúc đăng ký), nhưng tuyệt đối không áp hậu
   * quả ở checkpoint trước/đúng biên kích hoạt luật v5. Migration thường đã
   * đẩy nextAt tới bội 6 giờ đầu tiên > activatedAt; nhánh này là hàng rào cho
   * save thủ công/hỏng mà không reset pha thành activatedAt + 6 giờ. */
  if (st.now <= bt.activatedAt || bt.nextAt <= bt.activatedAt) {
    var moc = Number(bt.nextAt);
    if (!isFinite(moc)) moc = Number(st.t0) || Number(bt.activatedAt) || st.now;
    var soNhip = Math.floor((bt.activatedAt - moc) / chuKy) + 1;
    bt.nextAt = moc + Math.max(1, soNhip) * chuKy;
    if (G.dongBoBaoTriCu) G.dongBoBaoTriCu(st);
    return;
  }
  bt.cycle = Math.max(0, Math.floor(Number(bt.cycle) || 0)) + 1;
  var tinhPhi = G.phiBaoTriNhip(st);
  var noCu = Math.max(0, Number(bt.arrearsGalana) || 0);
  var can = noCu + tinhPhi.phi;
  var dat = st.galana >= can;
  var dong = ['Checkpoint đế quốc #' + bt.cycle + ' — ' + G.gio(st.now * 1000),
    'Phí bảo trì kỳ này: ' + G.so(tinhPhi.phi) + ' Galana' +
    (tinhPhi.giamBp ? ' (giảm ' + (tinhPhi.giamBp / 100).toFixed(1) + '%)' : '') +
    (noCu ? '; nợ cũ ' + G.so(noCu) : '') + '.'];
  if (dat) {
    st.galana -= can;
    bt.arrearsGalana = 0; bt.missStreak = 0;
    dong.push('Bảo trì đã thanh toán nguyên khoản ' + G.so(can) + ' Galana.');
    G.thanhToanNCNhip(st, dong);
  } else {
    /* [TÁI DỰNG] Không trừ lẻ: khoản tiền hiện có được giữ nguyên, hoá đơn kỳ
     * này nhập vào nợ để checkpoint sau xét lại như một giao dịch duy nhất. */
    bt.arrearsGalana = noCu + tinhPhi.phi;
    bt.missStreak = Math.max(0, Math.floor(Number(bt.missStreak) || 0)) + 1;
    var muc0 = Math.min(3, bt.missStreak);
    dong.push('KHÔNG ĐỦ GALANA: không trừ một phần; tổng nợ thành ' + G.so(bt.arrearsGalana) +
      '. Mức suy thoái ' + muc0 + '/3. [TÁI DỰNG]');
    if (st.ncQueue && bt.missStreak >= (c.researchFailureMissStreak || 1))
      G.thatBaiNCNhip(st, st.ncQueue, 'bảo trì đế quốc thất bại', dong);
  }
  var muc = dat ? 0 : Math.min(3, bt.missStreak);
  for (var i = 0; i < st.planets.length; i++) G.nhipDanSu(st, st.planets[i], dat, muc, dong);
  var mocKeTiep = Number(bt.nextAt);
  if (!isFinite(mocKeTiep)) mocKeTiep = st.now;
  bt.nextAt = mocKeTiep + chuKy;       // giữ nguyên pha đồng hồ tài khoản
  if (G.dongBoBaoTriCu) G.dongBoBaoTriCu(st);
  else { st.nextMaint = bt.nextAt; st.soChuKy = bt.cycle; st.noBaoTri = bt.arrearsGalana; }
  G.tin(st, 'bt', 'Nhịp đế quốc 6 giờ (chu kỳ #' + bt.cycle + ')', dong.join('\n'));
};

/* --- NPC tấn công người chơi ----------------------------------------- */
G.hepRaid = function (st) {
  var d = G.diem(st);
  st.nextRaid = st.now + Math.round((6 + Math.random() * 8) * 3600);
  if (d.tong < G.C.BAO_VE_MOI_DIEM) return;                    // bảo vệ người chơi mới
  if (st.toi.length >= 2) return;

  var key = null;
  if (st.hanThu && st.hanThu.length && Math.random() < 0.6) key = st.hanThu[Math.floor(Math.random() * st.hanThu.length)];
  var n;
  if (key) {
    var cKey = G.tdParse(key);
    if (cKey) { var oKey = G.oHanhTinh(st, cKey); if (oKey.loai === 'npc') n = oKey.npc; }
  }
  if (!n) {
    var home = st.planets[0].c;
    for (var t = 0; t < 40 && !n; t++) {
      var c = G.toaDo(home.g, Math.max(1, Math.min(G.C.SO_HE, home.h + Math.floor(Math.random() * 30) - 15)), 1 + Math.floor(Math.random() * G.C.SO_HANH_TINH));
      var o = G.oHanhTinh(st, c);
      if (o.loai === 'npc' && !o.npc.bo) n = o.npc;
    }
  }
  if (!n) return;

  /* Quy mô đợt đánh theo sức phòng thủ của người chơi để luôn có thể đỡ được */
  var pi = Math.floor(Math.random() * st.planets.length);
  var p = st.planets[pi];
  var sucThu = 0, k;
  for (k in p.def) sucThu += G.giaTriDiem(G.D(k).cost, p.def[k]);
  for (k in p.ships) sucThu += G.giaTriDiem(G.S(k).cost, p.ships[k]);
  var quyMo = Math.max(60, (sucThu * (0.3 + Math.random() * 0.45)));
  quyMo = Math.min(quyMo, n.diem * 0.7);
  if (quyMo < 40) return;

  var r = G.rng(G.hash('raid' + st.now + n.key));
  var ships = G.npcHam(quyMo, Math.min(1, n.diem / 50000), r);
  if (G.trong(ships)) return;

  var kc = G.khoangCach(n.c, p.c);
  var tg = Math.max(600, Math.round(kc * 1.2 / G.C.TOC_DO_SERVER)) + 600;
  st.toi.push({
    id: st.fleetIdSeq++, tu: n.c, npcKey: n.key, ten: n.ten, lm: n.lm,
    pi: pi, ships: ships, tech: n.tech, den_t: st.now + tg
  });
  G.tin(st, 'canh', 'BÁO ĐỘNG: hạm đội địch đang bay tới!',
    n.ten + (n.lm ? ' ' + n.lm : '') + ' từ ' + G.tdStr(n.c) + ' đang tiến về ' + p.ten + ' ' + G.tdStr(p.c) + '.\n' +
    'Dự kiến tới sau ' + G.tg(tg) + '. Hãy dựng thêm phòng thủ, hoặc cho hạm đội bay đi để tránh bị bắn hạ (hạm đội đang bay thì an toàn).');
};

G.dichToi = function (st, w) {
  var p = st.planets[w.pi] || st.planets[0];
  var Lp = G.loaiHT(st, p);
  var hoTro = G.hamGiuTai(st, p.c);
  var nhomTau = [{ ships: p.ships, tech: st.tech }];
  for (var hg = 0; hg < hoTro.length; hg++)
    nhomTau.push({ ships: hoTro[hg].ships, tech: st.tech });
  var kq = G.danhTran(
    { ten: w.ten, tech: w.tech, ships: w.ships },
    { ten: st.ten + ' — ' + p.ten, tech: st.tech, nhomTau: nhomTau, def: p.def,
      thuDat: Lp.thuDat, loaiHT: Lp.ten },
    G.hash('def' + w.id + st.now));

  /* Chỉ đếm tàu: matD tổng hợp còn chứa cả công sự, còn các mảng nhóm là
   * nguồn chuẩn để cộng thiệt hại hạm hành tinh + mọi đội giữ quỹ đạo. */
  st.stats = st.stats && typeof st.stats === 'object' ? st.stats : {};
  var matTauTa = 0, dietTauDich = 0, mi, mid;
  for (mi = 0; mi < kq.matNhomD.length; mi++)
    for (mid in kq.matNhomD[mi]) matTauTa += kq.matNhomD[mi][mid] || 0;
  for (mid in kq.matA) dietTauDich += kq.matA[mid] || 0;
  st.stats.tauMat = (st.stats.tauMat || 0) + matTauTa;
  st.stats.tauDietDich = (st.stats.tauDietDich || 0) + dietTauDich;

  p.ships = kq.conNhomD[0]; p.def = kq.conDefD;
  for (var hi = hoTro.length - 1; hi >= 0; hi--) {
    var hf = hoTro[hi], matH = kq.matNhomD[hi + 1] || {}, soMatH = 0;
    hf.ships = kq.conNhomD[hi + 1] || {};
    for (var hm in matH) soMatH += matH[hm];
    if (soMatH) G.tin(st, 'ham', 'Hạm đội #' + hf.id + ' tham chiến phòng thủ',
      'Đội hình giữ quỹ đạo tại ' + G.tdStr(p.c) + ' mất ' + G.so(soMatH) + ' tàu trong trận đánh của ' + w.ten + '.');
    if (G.trong(hf.ships)) G.xoaHam(st, hf);
  }
  var cuop = { metal: 0, crystal: 0, deut: 0, food: 0 };
  if (kq.kq === 'thang') {      /* địch thắng */
    cuop = G.chiaHang(p.res, G.khoangHang(kq.conShipsA), G.C.CUOP_TOI_DA);
    for (var rk2 in cuop) p.res[rk2] -= cuop[rk2];
    st.stats.thua++;
  } else st.stats.thang++;

  var pl = G.pheLieu(st, G.tdKey(p.c));
  pl.metal += kq.pheLieu.metal; pl.crystal += kq.pheLieu.crystal;

  G.tin(st, 'tran', 'Bị tấn công tại ' + G.tdStr(p.c), null,
    { kq: kq, cuop: cuop, pl: kq.pheLieu, td: p.c, ben: 'dich' });
  var j = st.toi.indexOf(w);
  if (j >= 0) st.toi.splice(j, 1);
};

/* Xưởng đóng tàu chạy liên tục theo LÔ: bản gốc đếm quân bằng hàng triệu,
 * nếu cộng từng chiếc một thì vòng lặp sự kiện không kham nổi.            */
G.congDonVi = function (st, p, id, n) {
  if (n <= 0) return;
  if (G.M(id)) p.mis[id] = (p.mis[id] || 0) + n;
  else if (G.S(id)) p.ships[id] = (p.ships[id] || 0) + n;
  else if (G.BB(id)) { if (!p.linh) p.linh = {}; p.linh[id] = (p.linh[id] || 0) + n; }
  else p.def[id] = (p.def[id] || 0) + n;
};

G.chayXuong = function (st, p, dt) {
  var guard = 0;
  while (dt > 0 && p.qS.length && guard++ < 200) {
    var q = p.qS[0];
    if (dt < q.tLeft) { q.tLeft -= dt; return; }
    dt -= q.tLeft;                       /* chiếc kế tiếp xong */
    G.congDonVi(st, p, q.id, 1);
    q.n--;
    if (q.n > 0) {
      var them = Math.min(q.n, Math.floor(dt / q.tEach));
      if (them > 0) { G.congDonVi(st, p, q.id, them); q.n -= them; dt -= them * q.tEach; }
    }
    if (q.n > 0) { q.tLeft = q.tEach - dt; return; }
    G.ghi(st, p.ten + ': hoàn thành lô ' + (G.UNIT(q.id) || G.M(q.id)).ten + '.');
    p.qS.shift();
    if (p.qS.length) p.qS[0].tLeft = p.qS[0].tEach;
  }
};

/* =======================================================================
 * DÒNG THỜI GIAN — tua lại toàn bộ sự kiện theo đúng thứ tự
 * ===================================================================== */
G.sukienKe = function (st) {
  var t = Infinity, i;
  for (i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    if (p.qB.length && p.qB[0].xong) t = Math.min(t, p.qB[0].xong);
    if (p.qS.length) t = Math.min(t, st.lastTick + p.qS[0].tLeft + (p.qS[0].n - 1) * p.qS[0].tEach);
  }
  /* Chỉ lịch hoàn thành khi mọi kỳ đã trả và đề tài không chờ retry. Nếu
   * chưa đủ vốn, checkpoint bảo trì kế tiếp là sự kiện duy nhất có thể mở
   * khoá; đưa finishAt cũ vào đây sẽ tạo vòng lặp tại một timestamp đã qua. */
  if (st.ncQueue && st.ncQueue.status === 'active' && st.ncQueue.installmentsLeft <= 0)
    t = Math.min(t, st.ncQueue.finishAt);
  for (i = 0; i < st.fleets.length; i++) {
    var f = st.fleets[i];
    t = Math.min(t, G.mocHamKe(f));
  }
  for (i = 0; i < st.toi.length; i++) t = Math.min(t, st.toi[i].den_t);
  if (st.tenLua) for (i = 0; i < st.tenLua.length; i++) t = Math.min(t, st.tenLua[i].khi);
  var nextNhip = st.baoTri ? st.baoTri.nextAt : st.nextMaint;
  t = Math.min(t, nextNhip, st.nextRaid);
  return t;
};

/* Ở client của bản nhiều người, server mới là bên xử lý sự kiện: client chỉ
 * chạy phần sản xuất cho các con số nhảy êm, không tự kết luận trận đánh. */
G.MO_PHONG_NHE = false;

G.tick = function (st, now) {
  /* Server/client cũ có thể nạp thẳng save v3; tick là biên chung an toàn
   * để migration chạy đúng một lần trước mọi phép tính. */
  now = now || G.giay();
  G.nangCapState(st, now);
  if (now <= st.lastTick) { st.now = st.lastTick; return; }
  if (G.MO_PHONG_NHE) {
    var dtn = now - st.lastTick;
    for (var i0 = 0; i0 < st.planets.length; i0++) {
      G.sanXuat(st, st.planets[i0], dtn);
      G.chayXuong(st, st.planets[i0], dtn);
    }
    /* Client nhiều người chỉ hiển thị countdown tuyệt đối. Mọi khoản trừ,
     * retry và hoàn thành nghiên cứu đều thuộc quyền server. */
    if (st.ncQueue) st.ncQueue.conLai = Math.max(0, (Number(st.ncQueue.finishAt) || now) - now);
    st.lastTick = now; st.now = now;
    return;
  }
  var guard = 0;
  while (st.lastTick < now && guard++ < 50000) {
    var ke = G.sukienKe(st);
    var t = Math.min(ke, now);
    var dt = t - st.lastTick;
    if (dt > 0) {
      for (var i = 0; i < st.planets.length; i++) {
        G.sanXuat(st, st.planets[i], dt);
        G.chayXuong(st, st.planets[i], dt);
      }
      if (st.ncQueue) st.ncQueue.conLai = Math.max(0, (Number(st.ncQueue.finishAt) || t) - t);
      st.lastTick = t; st.now = t;
    }
    if (ke <= t) {
      var truoc = G.sukienKe(st);
      G.xuLySuKien(st, t);
      if (dt <= 0 && G.sukienKe(st) <= truoc && G.sukienKe(st) <= st.lastTick) break;  // chống lặp vô hạn
    } else break;
  }
  st.lastTick = now; st.now = now;
  if (st.ncQueue) st.ncQueue.conLai = Math.max(0, (Number(st.ncQueue.finishAt) || now) - now);
};

/* Chia lượng cướp/giao vào khoang hàng: chia đều rồi dồn phần dư */
G.chiaHang = function (nguon, cho, tyLe) {
  var ds = ['metal', 'crystal', 'deut', 'food'];
  var toiDa = {}, lay = {}, i;
  for (i = 0; i < ds.length; i++) {
    toiDa[ds[i]] = Math.max(0, Math.floor((nguon[ds[i]] || 0) * tyLe));
    lay[ds[i]] = 0;
  }
  cho = Math.max(0, Math.floor(cho));
  var guard = 0;
  while (cho > 0 && guard++ < 8) {
    var conDs = [];
    for (i = 0; i < ds.length; i++) if (toiDa[ds[i]] - lay[ds[i]] > 0) conDs.push(ds[i]);
    if (!conDs.length) break;
    var phan = Math.max(1, Math.floor(cho / conDs.length));
    for (i = 0; i < conDs.length && cho > 0; i++) {
      var k = conDs[i];
      var v = Math.min(phan, toiDa[k] - lay[k], cho);
      lay[k] += v; cho -= v;
    }
  }
  return lay;
};

G.xuLySuKien = function (st, t) {
  var i, p;
  /* Checkpoint là biên giao dịch của cả đế quốc. Bảo trì luôn được kết toán
   * trước installment/hoàn thành nghiên cứu và trước các sự kiện cùng giây. */
  var nextNhip = st.baoTri ? st.baoTri.nextAt : st.nextMaint;
  if (nextNhip <= t) G.baoTri(st);
  /* công trình */
  for (i = 0; i < st.planets.length; i++) {
    p = st.planets[i];
    while (p.qB.length && p.qB[0].xong && p.qB[0].xong <= t) {
      var m = p.qB.shift();
      var nXong = Math.max(1, Math.floor(Number(m.n) || 1));
      G.themCongTrinh(p, m.id, nXong);
      G.ghi(st, p.ten + ': hoàn thành ' + G.so(nXong) + ' ' + G.B(m.id).ten +
        ' (hiện có ' + G.so(p.b[m.id]) + ').');
      if (p.qB.length) p.qB[0].xong = t + p.qB[0].tg;
    }
  }
  /* nghiên cứu */
  if (st.ncQueue && st.ncQueue.status === 'active' && st.ncQueue.installmentsLeft <= 0 &&
      st.ncQueue.finishAt <= t) {
    var q2 = st.ncQueue;
    st.tech[q2.id] = q2.lv;
    var thuong = Math.round(G.giaTriDiem(q2.totalCost || q2.cost || {}) * 12);
    st.techPts += thuong;
    G.tin(st, 'nc', 'Nghiên cứu hoàn thành', G.R(q2.id).ten + ' đã đạt cấp ' + q2.lv +
      '.\nThu được ' + G.so(thuong) + ' điểm Kỹ Thuật. Toàn bộ ' + q2.installmentsTotal +
      ' kỳ tài nguyên đã được thanh toán nguyên khối.');
    st.ncQueue = null;
  }
  /* hạm đội */
  for (i = st.fleets.length - 1; i >= 0; i--) {
    var f = st.fleets[i];
    if (f.pha === 'di' && f.den_t <= t) G.hamToiDich(st, f);
    else if (f.pha === 'giu' && G.mocHamKe(f) <= t) G.nhipGiu(st, f);
    else if (f.pha === 've' && f.ve_t <= t) G.hamVeNha(st, f);
  }
  /* tên lửa tới đích */
  if (st.tenLua) for (i = st.tenLua.length - 1; i >= 0; i--) {
    if (st.tenLua[i].khi <= t) { var tl = st.tenLua.splice(i, 1)[0]; G.tenLuaToiDich(st, tl); }
  }
  /* địch tới */
  for (i = st.toi.length - 1; i >= 0; i--) if (st.toi[i].den_t <= t) G.dichToi(st, st.toi[i]);
  /* đợt đánh NPC (checkpoint bảo trì đã chạy ở đầu hàm) */
  if (st.nextRaid <= t) G.hepRaid(st);
};

/* =======================================================================
 * TÊN LỬA LIÊN HÀNH TINH
 * Không phải hạm đội: bắn thẳng, không quay về, chỉ phá phòng thủ MẶT ĐẤT.
 * Bên bị bắn dùng Tên Lửa Đánh Chặn để hạ 1 đổi 1.
 * ===================================================================== */
G.tamTenLua = function (st) {
  var c = (st.tech.impulse || 0) * 5 - 1;
  return c > 0 ? c : 0;
};
G.tgTenLua = function (soHe) {
  return Math.max(20, Math.round(Math.max(1, soHe) * G.C.TOC_TEN_LUA / G.C.TOC_DO_BAY));
};

G.banTenLua = function (st, pi, den, n) {
  var p = st.planets[pi];
  if (!p) return 'Hành tinh không tồn tại.';
  n = Math.max(0, Math.floor(n || 0));
  if (!n) return 'Chưa chọn số tên lửa.';
  if ((p.mis.icbm || 0) < n) return 'Chỉ có ' + G.so(p.mis.icbm || 0) + ' Tên Lửa Liên Hành Tinh.';
  if (den.g !== p.c.g) return 'Tên lửa chỉ bay được trong cùng thiên hà.';
  if (G.bang(den, p.c)) return 'Không bắn vào chính hành tinh của mình.';
  var tam = G.tamTenLua(st);
  if (!tam) return 'Cần Động Cơ Xung cấp 1 trở lên mới có tầm bắn.';
  var soHe = Math.abs(den.h - p.c.h);
  if (soHe > tam) return 'Ngoài tầm: xa ' + soHe + ' hệ, tầm bắn hiện tại ' + tam + ' hệ (nâng Động Cơ Xung).';
  if (G.HOOK && G.HOOK.kiemTraGui) {
    var loiQuyen = G.HOOK.kiemTraGui(st, p, den, 'attack');
    if (loiQuyen) return loiQuyen;
  }

  p.mis.icbm -= n;
  if (!p.mis.icbm) delete p.mis.icbm;
  if (!st.tenLua) st.tenLua = [];
  var tl = {
    id: st.fleetIdSeq++, pi: pi, tu: { g: p.c.g, h: p.c.h, p: p.c.p },
    den: { g: den.g, h: den.h, p: den.p }, n: n, khi: st.now + G.tgTenLua(soHe)
  };
  st.tenLua.push(tl);
  G.ghi(st, 'Phóng ' + n + ' Tên Lửa Liên Hành Tinh từ ' + G.tdStr(p.c) + ' → ' + G.tdStr(den) +
    ', tới sau ' + G.tg(tl.khi - st.now) + '.');
  return null;
};

/* Tính kết quả một loạt tên lửa lên phòng thủ mặt đất */
G.noTenLua = function (soBan, def, soChan, techBan, techThu, seed) {
  var rnd = G.rng(seed || 1);
  var chan = Math.min(soBan, Math.max(0, Math.floor(soChan || 0)));
  var con = soBan - chan;
  var dmg = con * G.C.SAT_THUONG_ICBM * (1 + 0.1 * ((techBan || {}).weapon || 0));
  var giapThu = 1 + 0.1 * ((techThu || {}).armor || 0);
  var ds = [], k;
  for (k in def) {
    var u = G.D(k);
    if (!u || u.lop !== 'dat' || !def[k]) continue;
    ds.push({ id: k, vo: u.hull * giapThu, n: def[k] });
  }
  ds.sort(function (a, b) { return a.vo - b.vo; });          /* phá cái yếu trước */
  var pha = {};
  for (var i = 0; i < ds.length && dmg > 0; i++) {
    var so = Math.min(ds[i].n, Math.floor(dmg / ds[i].vo));
    if (so > 0) { pha[ds[i].id] = so; dmg -= so * ds[i].vo; def[ds[i].id] -= so; if (!def[ds[i].id]) delete def[ds[i].id]; }
  }
  void rnd;
  return { chan: chan, no: con, pha: pha, duSatThuong: Math.round(dmg) };
};

G.moTaPha = function (o) {
  var ra = [];
  for (var k in o) if (o[k]) { var u = G.UNIT(k); ra.push((u ? u.ten : k) + ' ×' + G.so(o[k])); }
  return ra.length ? ra.join(', ') : 'không phá được gì';
};

G.tenLuaToiDich = function (st, tl) {
  var o = G.oHanhTinh(st, tl.den);

  if (o.loai === 'nguoi' && G.HOOK && G.HOOK.tenLuaNguoi) { G.HOOK.tenLuaNguoi(st, tl, o); return; }

  if (o.loai === 'trong') {
    G.tin(st, 'he', 'Tên lửa bắn trượt', G.tdStr(tl.den) + ' là ô trống — ' + tl.n + ' quả tên lửa nổ trong chân không.');
    return;
  }
  if (o.loai === 'toi') return;

  var n = o.npc;
  /* NPC cũng có tên lửa đánh chặn, tỷ lệ theo quy mô [SUY LUẬN] */
  var soChan = n.bo ? 0 : Math.floor(n.diem / 2500);
  var kq = G.noTenLua(tl.n, n.def, soChan, st.tech, n.tech, G.hash('tl' + tl.id + st.now));
  G.tin(st, 'tran', 'Kết quả bắn tên lửa ' + G.tdStr(tl.den), null, { tl: kq, soBan: tl.n, td: tl.den, ten: n.ten, ben: 'ta' });
  if (!st.hanThu) st.hanThu = [];
  if (st.hanThu.indexOf(o.key) < 0) st.hanThu.push(o.key);
};

/* =======================================================================
 * THÁM HIỂM VÙNG KHÔNG GIAN SÂU (ô 16)
 * Bay ra rìa hệ tìm vận may: tài nguyên, tàu trôi dạt, Galana — hoặc gặp
 * sinh vật ngoài hành tinh, lạc trong không gian, mất tàu vì thiên thạch.
 * [SUY LUẬN] — thể loại này game nào cũng có, bản gốc không còn tư liệu.
 * ===================================================================== */
G.kheThamHiem = function (st) { return 1 + Math.floor((st.tech.astro || 0) / 4); };
G.dangThamHiem = function (st) {
  var n = 0;
  for (var i = 0; i < st.fleets.length; i++) if (st.fleets[i].mission === 'thamhiem') n++;
  return n;
};

G.thamHiem = function (st, f) {
  var r = G.rng(G.hash('th' + f.id + ':' + st.now + ':' + G.tdKey(f.den)));
  var diem = G.diem(st).tong;
  var suc = G.khoangHang(f.ships);
  var tran = Math.min(suc, 3000 + Math.round(diem * 8));
  var lan = r();
  var noi = '', loai = 'trong';

  var veNha = function (heSo) {
    f.pha = 've';
    f.veLuc = st.now;
    var tg = G.tgBay(st, f.ships, G.khoangCach(f.den, f.tu), f.pct);
    f.ve_t = st.now + Math.round(tg * (heSo || 1));
  };

  if (lan < 0.30) {                                   /* tài nguyên trôi nổi */
    loai = 'res';
    var lay = Math.round(tran * (0.35 + r() * 0.65));
    var chia = { metal: Math.round(lay * 0.5), crystal: Math.round(lay * 0.33), deut: Math.round(lay * 0.17) };
    var k;
    for (k in chia) if (chia[k] > 0) f.cargo[k] = (f.cargo[k] || 0) + chia[k];
    noi = 'Tìm thấy một đám mây vật chất chưa ai khai thác:\n' +
      '  Kim Loại: ' + G.so(chia.metal) + '\n  Thạch Anh: ' + G.so(chia.crystal) + '\n  Nhiên Liệu: ' + G.so(chia.deut);
    veNha(); 
  } else if (lan < 0.42) {                            /* tàu trôi dạt */
    loai = 'tau';
    var duocPhep = [];
    for (var i = 0; i < G.SHIPS.length; i++) {
      var s = G.SHIPS[i];
      if (s.id === 'fortress' || s.id === 'colony') continue;
      if (G.thoaDK(st, st.planets[f.pi] || st.planets[0], s)) duocPhep.push(s);
    }
    if (!duocPhep.length) { noi = 'Gặp một xác tàu cổ nhưng công nghệ của ta chưa đủ để phục hồi thứ gì.'; veNha(); }
    else {
      var chon = duocPhep[Math.floor(r() * duocPhep.length)];
      var giaTri = (chon.cost.metal || 0) + (chon.cost.crystal || 0) + (chon.cost.deut || 0);
      var soTau = Math.max(1, Math.floor(tran * (0.3 + r() * 0.5) / Math.max(1, giaTri)));
      f.ships[chon.id] = (f.ships[chon.id] || 0) + soTau;
      noi = 'Tìm thấy một hạm đội bỏ hoang còn dùng được. Đội sửa chữa kéo về ' +
        G.so(soTau) + ' ' + chon.ten + '.';
      veNha();
    }
  } else if (lan < 0.52) {                            /* Galana */
    loai = 'galana';
    var gl = Math.round((200 + diem * 0.6) * (0.5 + r()));
    st.galana += gl;
    noi = 'Bắt được tín hiệu của một trạm giao dịch bỏ hoang. Bán lại số hàng còn trong kho được ' +
      G.so(gl) + ' Galana.';
    veNha();
  } else if (lan < 0.66) {                            /* sinh vật ngoài hành tinh */
    loai = 'quai';
    var lucTa = 0, kk;
    for (kk in f.ships) lucTa += G.giaTriDiem(G.S(kk).cost, f.ships[kk]);
    var rq = G.rng(G.hash('quai' + f.id + st.now));
    var quai = G.npcHam(Math.max(60, lucTa * (0.35 + rq() * 0.75)), Math.min(1, diem / 40000), rq);
    var kq = G.danhTran(
      { ten: st.ten, tech: st.tech, ships: f.ships },
      { ten: 'Sinh vật ngoài hành tinh', tech: { weapon: 4, shield: 4, armor: 4 }, ships: quai, def: {} },
      G.hash('thq' + f.id + st.now));
    f.ships = kq.conShipsA;
    var matT = 0, matQ = 0;
    for (kk in kq.matA) matT += kq.matA[kk];
    for (kk in kq.matD) matQ += kq.matD[kk];
    st.stats.tauMat += matT; st.stats.tauDietDich += matQ;
    G.tin(st, 'tran', 'Chạm trán ở vùng không gian sâu ' + G.tdStr(f.den), null,
      { kq: kq, cuop: { metal: 0, crystal: 0, deut: 0, food: 0 }, pl: { metal: 0, crystal: 0 }, td: f.den, ben: 'ta' });
    if (G.trong(f.ships)) {
      G.tin(st, 'he', 'Mất trắng đoàn thám hiểm',
        'Hạm đội thám hiểm ở ' + G.tdStr(f.den) + ' bị sinh vật ngoài hành tinh xoá sổ hoàn toàn.');
      G.xoaHam(st, f);
      return;
    }
    noi = 'Đụng độ một bầy sinh vật ngoài hành tinh. Ta mất ' + G.so(matT) + ' tàu, diệt ' + G.so(matQ) +
      ' con. Xem chiến báo để biết chi tiết.';
    veNha();
  } else if (lan < 0.76) {                            /* lạc trong không gian */
    loai = 'lac';
    var he = 2 + Math.round(r() * 2);
    noi = 'Máy tính dẫn đường tính sai một hằng số hấp dẫn. Hạm đội lạc ra ngoài rìa hệ và mất gấp ' +
      he + ' lần thời gian để mò đường về.';
    veNha(he);
  } else if (lan < 0.84) {                            /* thiên thạch */
    loai = 'mat';
    var kkk, matTh = {};
    for (kkk in f.ships) {
      var mat = Math.floor(f.ships[kkk] * (0.05 + r() * 0.2));
      if (mat > 0) { matTh[kkk] = mat; f.ships[kkk] -= mat; if (!f.ships[kkk]) delete f.ships[kkk]; }
    }
    if (G.trong(f.ships)) {
      G.tin(st, 'he', 'Mất trắng đoàn thám hiểm', 'Cả hạm đội thám hiểm tan trong một trận mưa thiên thạch tại ' + G.tdStr(f.den) + '.');
      G.xoaHam(st, f);
      return;
    }
    noi = G.trong(matTh) ? 'Bay xuyên một vành đai thiên thạch, may là không mất tàu nào.'
      : 'Bay xuyên một vành đai thiên thạch, mất: ' + G.moTaPha(matTh) + '.';
    veNha();
  } else {                                            /* không thấy gì */
    loai = 'trong';
    var cau = [
      'Quét sạch cả vùng, không có gì ngoài bụi và bức xạ nền.',
      'Bắt được một tín hiệu lạ, đuổi theo ba tiếng đồng hồ thì nó tắt.',
      'Vùng này đã có người tới trước — chỉ còn lại vết đốt động cơ đã nguội.'
    ];
    noi = cau[Math.floor(r() * cau.length)];
    veNha();
  }

  st.stats.thamHiem = (st.stats.thamHiem || 0) + 1;
  if (loai !== 'quai' || noi) {
    G.tin(st, 'ham', 'Nhật ký thám hiểm ' + G.tdStr(f.den), noi);
  }
};

/* =======================================================================
 * ĐỔ BỘ — cơ chế đặc trưng nhất của bản gốc
 * Quỹ đạo vỡ rồi thì Đại Chiến Hạm mới thả Robot/Tank xuống. Thắng trận
 * dưới mặt đất thì PHÁ CÔNG TRÌNH của đối phương (trận Start War III:
 * "phá hủy toàn bộ những công trình… chỉ chừa lại đúng 1.000 Nhà Máy Tàu Bay").
 * ===================================================================== */
G.sucChoLinh = function (ships) {
  var t = 0;
  for (var id in ships) { var s = G.S(id); if (s && s.choLinh) t += s.choLinh * ships[id]; }
  return t;
};
G.choLinhCan = function (linh) {
  var t = 0;
  for (var id in linh) { var b = G.BB(id); if (b) t += b.cho * linh[id]; }
  return t;
};
G.sucPhaCT = function (linh) {
  var t = 0;
  for (var id in linh) { var b = G.BB(id); if (b) t += (b.atk + b.hull * 0.05) * linh[id]; }
  return t;
};

/* Phá công trình bằng sức đổ bộ còn lại. Mỗi loại được xử lý
 * theo lô, nên thời gian là O(số loại), không phụ thuộc hàng triệu nhà máy. */
G.phaCongTrinh = function (st, p, suc) {
  var tong = G.tongSoCT(p);
  var conPha = tong > 0 ? Math.max(1, Math.floor(tong * G.C.PHA_CT_TOI_DA)) : 0;
  var pha = {}, soPha = 0, ds = [], k;
  for (k in p.b) {
    var d = G.B(k);
    if (d && p.b[k] > 0) ds.push({ id: k, gia: G.giaTriDiem(d.cost) * 1000 });
  }
  ds.sort(function (a, b) { return b.gia - a.gia || (a.id < b.id ? -1 : 1); });
  for (var i = 0; i < ds.length && suc > 0 && soPha < conPha; i++) {
    var x = ds[i];
    var canSuc = Math.max(1, x.gia * G.C.SUC_PHA_MOI_TAI_NGUYEN);
    var n = Math.min(p.b[x.id] || 0, conPha - soPha, Math.floor(suc / canSuc));
    if (n < 1) continue;
    suc -= n * canSuc;
    var mat = G.giamCongTrinh(p, x.id, n);
    pha[x.id] = mat;
    soPha += mat;
  }
  /* soCap giữ tạm cho server/báo cáo v3; giá trị nay là số lượng. */
  return { pha: pha, soLuong: soPha, soCap: soPha, chamTran: soPha >= conPha && conPha > 0 };
};

G.moTaPhaCT = function (o) {
  var ra = [];
  for (var k in o) if (o[k]) ra.push(G.B(k).ten + ' −' + G.so(o[k]));
  return ra.length ? ra.join(', ') : 'không phá được công trình nào';
};

/* Chạy pha đổ bộ. Trả về mô tả kết quả (hoặc null nếu không có quân đổ bộ). */
/* tách phần phòng thủ MẶT ĐẤT ra khỏi bảng phòng thủ chung */
G.thuMatDat = function (def) {
  var ra = {};
  for (var k in def) { var d = G.D(k); if (d && d.lop === 'dat' && def[k] > 0) ra[k] = def[k]; }
  return ra;
};
G.gopThuMatDat = function (def, con) {
  for (var k in def) { var d = G.D(k); if (d && d.lop === 'dat') delete def[k]; }
  G.cong(def, con);
};

G.doBoXuong = function (st, f, ben) {
  if (!f.linh || G.trong(f.linh)) return null;
  var kq = G.danhTran(
    { ten: st.ten + ' (quân đổ bộ)', tech: st.tech, bo: f.linh, doBo: true },
    { ten: ben.ten, tech: ben.tech || {}, bo: ben.linh || {}, def: ben.def || {}, thuDat: ben.thuDat || 1 },
    G.hash('dobo' + f.id + ':' + st.now));
  f.linh = kq.conBoA;
  if (ben.linh) { for (var k in ben.linh) delete ben.linh[k]; G.cong(ben.linh, kq.conBoD); }
  if (ben.def) { for (var k2 in ben.def) delete ben.def[k2]; G.cong(ben.def, kq.conDefD); }
  var thang = kq.kq === 'thang';
  var phaCT = null;
  if (thang && ben.p) phaCT = G.phaCongTrinh(st, ben.p, G.sucPhaCT(f.linh));
  return { kq: kq, thang: thang, phaCT: phaCT };
};
