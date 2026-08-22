/* THIÊN HÀ ĐẠI CHIẾN — hạm đội, nhiệm vụ, bảo trì, dòng thời gian
 * Hai cơ chế lấy nguyên từ bản gốc:
 *   1) Hạm đội được ĐỔI MỤC TIÊU NGAY KHI ĐANG BAY (trả phí Galana).
 *   2) Mỗi 6 giờ có một CHU KỲ BẢO TRÌ: trừ phí Galana + trả góp vốn
 *      nghiên cứu. Không trả nổi thì nợ, sản lượng sụt, nghiên cứu treo. */
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
  return Math.ceil(base * kc / 35000 * m) + 1;
};

/* --- Gửi hạm đội ------------------------------------------------------- */
G.guiHam = function (st, pi, ships, den, mission, cargo, pct, giuGio) {
  var p = st.planets[pi];
  if (!p) return 'Hành tinh không tồn tại.';
  if (G.trong(ships)) return 'Chưa chọn tàu nào.';
  if (st.fleets.length >= G.khe(st)) return 'Hết khe hạm đội (' + G.khe(st) + '). Nâng Công Nghệ Máy Tính hoặc Đài Chỉ Huy.';
  if (p.doi > 0) return 'Hành tinh đang bị bỏ đói — không đủ lương thực cho thủy thủ đoàn xuất phát.';
  if (st.noBaoTri > 0 && mission === 'attack') return 'Đang nợ phí bảo trì: hạm đội bị niêm phong, không được xuất kích tấn công.';
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
  if (mission === 'colonize' && !ships.colony) return 'Nhiệm vụ thực dân cần Tàu Thực Dân.';
  if (mission === 'recycle' && !ships.recycler) return 'Nhiệm vụ thu hồi cần Tàu Thu Hồi.';

  var kc = G.khoangCach(p.c, den);
  var tg = G.tgBay(st, ships, kc, pct);
  var nl = G.nhienLieu(st, ships, kc, pct);
  if ((p.res.deut || 0) < nl) return 'Không đủ deuterium (cần ' + G.so(nl) + ').';

  cargo = cargo || {};
  var suc = G.khoangHang(ships);
  var tongHang = 0;
  for (id in cargo) { cargo[id] = Math.max(0, Math.floor(cargo[id] || 0)); tongHang += cargo[id]; }
  if (tongHang > suc - (mission === 'attack' ? 0 : 0)) return 'Khoang hàng chỉ chứa được ' + G.so(suc) + '.';
  for (id in cargo) if ((p.res[id] || 0) < cargo[id] + (id === 'deut' ? nl : 0)) return 'Không đủ ' + G.byId(G.RES, id).ten + ' để xếp hàng.';

  /* trừ tàu, hàng, nhiên liệu */
  for (id in ships) p.ships[id] -= ships[id];
  p.res.deut -= nl;
  for (id in cargo) if (cargo[id] > 0) p.res[id] -= cargo[id];

  var f = {
    id: st.fleetIdSeq++, pi: pi, tu: { g: p.c.g, h: p.c.h, p: p.c.p }, den: { g: den.g, h: den.h, p: den.p },
    mission: mission, ships: ships, cargo: cargo, pct: pct || 100,
    diLuc: st.now, den_t: st.now + tg, ve_t: null, pha: 'di',
    giu: (mission === 'hold') ? (giuGio || 1) * 3600 : 0,
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
  if (f.pha !== 'di') return 'Hạm đội đang trên đường về, không đổi được mục tiêu.';
  if (st.galana < G.C.DOI_MUC_TIEU_GALANA) return 'Cần ' + G.C.DOI_MUC_TIEU_GALANA + ' Galana để phát lệnh đổi hướng.';
  if (G.bang(den, f.den)) return 'Đã đang bay tới đó rồi.';

  var tong = f.den_t - f.diLuc;
  var fr = tong > 0 ? Math.min(1, Math.max(0, (st.now - f.diLuc) / tong)) : 1;
  /* vị trí hiện tại nội suy trên đường bay -> khoảng cách tới mục tiêu mới */
  var kcMoi = (1 - fr) * G.khoangCach(f.tu, den) + fr * G.khoangCach(f.den, den);
  kcMoi = Math.max(5, Math.round(kcMoi));
  var tg = G.tgBay(st, f.ships, kcMoi, f.pct);
  var nlThem = G.nhienLieu(st, f.ships, kcMoi, f.pct);
  var dt = f.cargo.deut || 0;
  /* nhiên liệu phụ trội lấy từ khoang hàng nếu có, thiếu thì trả bằng Galana */
  var traGalana = G.C.DOI_MUC_TIEU_GALANA;
  if (dt >= nlThem) f.cargo.deut = dt - nlThem;
  else { traGalana += Math.ceil((nlThem - dt) * 3); f.cargo.deut = 0; }
  if (st.galana < traGalana) return 'Cần ' + G.so(traGalana) + ' Galana (gồm phí nhiên liệu phụ trội).';
  st.galana -= traGalana;

  f.den = { g: den.g, h: den.h, p: den.p };
  f.diLuc = st.now; f.den_t = st.now + tg; f.kc = kcMoi; f.doiHuong++;
  G.ghi(st, 'Hạm đội #' + f.id + ' đổi hướng giữa đường → ' + G.tdStr(den) + ' (phí ' + G.so(traGalana) + ' Galana).');
  return null;
};

G.goiVe = function (st, fid) {
  for (var i = 0; i < st.fleets.length; i++) {
    var f = st.fleets[i];
    if (f.id !== fid) continue;
    if (f.pha === 've') return 'Hạm đội đã đang về.';
    var daBay = st.now - f.diLuc;
    f.pha = 've'; f.ve_t = st.now + Math.max(2, daBay);
    G.ghi(st, 'Hạm đội #' + f.id + ' được gọi về, tới sau ' + G.tg(f.ve_t - st.now) + '.');
    return null;
  }
  return 'Không tìm thấy hạm đội.';
};

/* --- Xử lý hạm đội tới đích ------------------------------------------- */
G.hamToiDich = function (st, f) {
  var o = G.oHanhTinh(st, f.den);
  var veNha = function (ghi) {
    f.pha = 've';
    f.ve_t = st.now + G.tgBay(st, f.ships, G.khoangCach(f.den, f.tu), f.pct);
    if (ghi) G.ghi(st, ghi);
  };

  if (f.mission === 'hold') {
    if (!f.dangGiu) { f.dangGiu = true; f.den_t = st.now + f.giu; return; }
    f.dangGiu = false; veNha('Hạm đội #' + f.id + ' hết giờ giữ chỗ, quay về.'); return;
  }

  if (f.mission === 'deploy' || f.mission === 'transport') {
    /* Tiếp tế cho người chơi khác: chỉ nhiệm vụ Vận Chuyển, và chỉ ở bản nhiều người */
    if (f.mission === 'transport' && o.loai === 'nguoi' && G.HOOK && G.HOOK.tangNguoi) {
      G.HOOK.tangNguoi(st, f, o, veNha); return;
    }
    if (o.loai !== 'toi') { veNha('Hạm đội #' + f.id + ': ' + G.tdStr(f.den) + ' không phải hành tinh của ta, hàng được mang về.'); return; }
    var pt = o.p, k;
    for (k in f.cargo) if (f.cargo[k] > 0) pt.res[k] = (pt.res[k] || 0) + f.cargo[k];
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
      'Đã vét được ' + G.so(lay.metal) + ' Kim Loại và ' + G.so(lay.crystal) + ' Tinh Thể từ bãi phế liệu.');
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
    var kq = G.danhTran(
      { ten: st.ten, tech: st.tech, ships: f.ships },
      { ten: n.ten + ' — ' + n.htTen, tech: n.tech, ships: n.ships, def: n.def },
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

    var pl = G.pheLieu(st, o.key);
    pl.metal += kq.pheLieu.metal; pl.crystal += kq.pheLieu.crystal;
    for (var kx in kq.matA) st.stats.tauMat += kq.matA[kx];
    for (var ky in kq.matD) st.stats.tauDietDich += kq.matD[ky];

    G.tin(st, 'tran', 'Báo cáo chiến đấu ' + G.tdStr(f.den), null,
      { kq: kq, cuop: cuop, pl: kq.pheLieu, td: f.den, ben: 'ta' });
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

/* --- Chu kỳ bảo trì 6 giờ --------------------------------------------- */
G.baoTri = function (st) {
  st.soChuKy++;
  var d = G.diem(st);
  var tho = 0.015 * (d.ham + d.thu) + 0.008 * d.ct;
  var giam = Math.min(0.6, 0.06 * G.tongB(st, 'maintDepot'));
  var phi = Math.round((tho * (1 - giam)) * 10) / 10;
  var vonNC = 0, ncTen = null;

  if (st.ncQueue && st.ncQueue.vonConLai > 0) {
    vonNC = Math.min(st.ncQueue.vonConLai, st.ncQueue.vonMoiKy);
    ncTen = G.R(st.ncQueue.id).ten;
  }
  var can = phi + vonNC + st.noBaoTri;
  var tra = Math.min(st.galana, can);
  st.galana -= tra;
  var thieu = can - tra;

  var dong = [];
  dong.push('Chu kỳ bảo trì #' + st.soChuKy + ' — ' + G.gio(st.now * 1000));
  dong.push('Phí bảo trì hạ tầng & hạm đội: ' + G.so(phi) + ' Galana' + (giam > 0 ? ' (đã giảm ' + Math.round(giam * 100) + '% nhờ Trung Tâm Bảo Trì)' : ''));
  if (st.noBaoTri > 0) dong.push('Nợ kỳ trước: ' + G.so(st.noBaoTri) + ' Galana');

  /* ưu tiên trả phí bảo trì trước, còn lại mới rót vào nghiên cứu */
  var conTra = tra;
  var traNo = Math.min(conTra, st.noBaoTri); conTra -= traNo; st.noBaoTri -= traNo;
  var traPhi = Math.min(conTra, phi); conTra -= traPhi;
  var traVon = Math.min(conTra, vonNC);

  if (vonNC > 0) {
    if (traVon >= vonNC) {
      st.ncQueue.vonConLai -= vonNC;
      st.ncQueue.treo = false;
      dong.push('Rót vốn nghiên cứu "' + ncTen + '": ' + G.so(vonNC) + ' Galana (còn lại ' + G.so(st.ncQueue.vonConLai) + ')');
    } else {
      st.ncQueue.vonConLai -= traVon;
      st.ncQueue.treo = true;
      dong.push('THIẾU VỐN nghiên cứu "' + ncTen + '" — đề tài BỊ TREO cho tới khi có đủ Galana.');
    }
  }
  if (thieu > 0) {
    st.noBaoTri = thieu;
    dong.push('KHÔNG ĐỦ GALANA: nợ lại ' + G.so(thieu) + '. Sản lượng toàn đế quốc giảm 30% và hạm đội bị niêm phong (không tấn công được) cho tới khi trả xong.');
  } else {
    dong.push('Đã thanh toán đủ. Hành tinh hoạt động bình thường.');
  }

  /* đói ăn: cảnh báo */
  for (var i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    if (p.doi > 0) dong.push('CẢNH BÁO: ' + p.ten + ' ' + G.tdStr(p.c) + ' đang thiếu Lương Thực — sản lượng còn một nửa.');
  }
  G.tin(st, 'bt', 'Bảo trì hành tinh (chu kỳ #' + st.soChuKy + ')', dong.join('\n'));
  st.nextMaint = st.now + G.C.CHU_KY_BAO_TRI;
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
  var kq = G.danhTran(
    { ten: w.ten, tech: w.tech, ships: w.ships },
    { ten: st.ten + ' — ' + p.ten, tech: st.tech, ships: p.ships, def: p.def },
    G.hash('def' + w.id + st.now));

  p.ships = kq.conShipsD; p.def = kq.conDefD;
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

/* =======================================================================
 * DÒNG THỜI GIAN — tua lại toàn bộ sự kiện theo đúng thứ tự
 * ===================================================================== */
G.sukienKe = function (st) {
  var t = Infinity, i;
  for (i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    if (p.qB.length && p.qB[0].xong) t = Math.min(t, p.qB[0].xong);
    if (p.qS.length) t = Math.min(t, st.lastTick + p.qS[0].tLeft);
  }
  if (st.ncQueue && !st.ncQueue.treo) t = Math.min(t, st.lastTick + st.ncQueue.conLai);
  for (i = 0; i < st.fleets.length; i++) {
    var f = st.fleets[i];
    t = Math.min(t, f.pha === 'di' ? f.den_t : f.ve_t);
  }
  for (i = 0; i < st.toi.length; i++) t = Math.min(t, st.toi[i].den_t);
  if (st.tenLua) for (i = 0; i < st.tenLua.length; i++) t = Math.min(t, st.tenLua[i].khi);
  t = Math.min(t, st.nextMaint, st.nextRaid);
  return t;
};

/* Ở client của bản nhiều người, server mới là bên xử lý sự kiện: client chỉ
 * chạy phần sản xuất cho các con số nhảy êm, không tự kết luận trận đánh. */
G.MO_PHONG_NHE = false;

G.tick = function (st, now) {
  now = now || G.giay();
  if (now <= st.lastTick) { st.now = st.lastTick; return; }
  if (G.MO_PHONG_NHE) {
    var dtn = now - st.lastTick;
    for (var i0 = 0; i0 < st.planets.length; i0++) {
      G.sanXuat(st, st.planets[i0], dtn);
      if (st.planets[i0].qS.length) st.planets[i0].qS[0].tLeft -= dtn;
    }
    if (st.ncQueue && !st.ncQueue.treo) st.ncQueue.conLai -= dtn;
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
        if (st.planets[i].qS.length) st.planets[i].qS[0].tLeft -= dt;
      }
      if (st.ncQueue && !st.ncQueue.treo) st.ncQueue.conLai -= dt;
      st.lastTick = t; st.now = t;
    }
    if (ke <= t) {
      var truoc = G.sukienKe(st);
      G.xuLySuKien(st, t);
      if (dt <= 0 && G.sukienKe(st) <= truoc && G.sukienKe(st) <= st.lastTick) break;  // chống lặp vô hạn
    } else break;
  }
  st.lastTick = now; st.now = now;

  /* Có Galana thì tự trả nợ bảo trì ngay, không cần chờ hết chu kỳ */
  if (st.noBaoTri > 0 && st.galana >= st.noBaoTri) {
    var tra = st.noBaoTri;
    st.galana -= tra; st.noBaoTri = 0;
    G.tin(st, 'bt', 'Đã trả xong nợ bảo trì',
      'Nợ ' + G.so(tra) + ' Galana đã thanh toán. Sản lượng và hạm đội trở lại bình thường.');
  }
  if (st.ncQueue && st.ncQueue.treo && st.galana >= Math.min(st.ncQueue.vonConLai, st.ncQueue.vonMoiKy)) {
    var v = Math.min(st.ncQueue.vonConLai, st.ncQueue.vonMoiKy);
    st.galana -= v; st.ncQueue.vonConLai -= v; st.ncQueue.treo = false;
    G.tin(st, 'bt', 'Nghiên cứu chạy lại', 'Đã rót đủ vốn, đề tài "' + G.R(st.ncQueue.id).ten + '" tiếp tục.');
  }
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
  /* công trình */
  for (i = 0; i < st.planets.length; i++) {
    p = st.planets[i];
    while (p.qB.length && p.qB[0].xong && p.qB[0].xong <= t) {
      var m = p.qB.shift();
      p.b[m.id] = m.lv;
      G.ghi(st, p.ten + ': ' + G.B(m.id).ten + ' hoàn thành cấp ' + m.lv + '.');
      if (p.qB.length) p.qB[0].xong = t + p.qB[0].tg;
    }
    /* xưởng đóng tàu */
    var an = 0;
    while (p.qS.length && p.qS[0].tLeft <= 0 && an++ < 100000) {
      var q = p.qS[0];
      if (G.M(q.id)) p.mis[q.id] = (p.mis[q.id] || 0) + 1;
      else if (G.S(q.id)) p.ships[q.id] = (p.ships[q.id] || 0) + 1;
      else p.def[q.id] = (p.def[q.id] || 0) + 1;
      q.n--;
      if (q.n <= 0) {
        p.qS.shift();
        G.ghi(st, p.ten + ': hoàn thành lô ' + (G.S(q.id) || G.D(q.id) || G.M(q.id)).ten + '.');
        if (p.qS.length) p.qS[0].tLeft = p.qS[0].tEach;
      } else {
        q.tLeft += q.tEach;
      }
    }
  }
  /* nghiên cứu */
  if (st.ncQueue && !st.ncQueue.treo && st.ncQueue.conLai <= 0) {
    var q2 = st.ncQueue;
    st.tech[q2.id] = q2.lv;
    var thuong = Math.round(G.giaTriDiem(q2.cost) * 12);
    st.techPts += thuong;
    G.tin(st, 'nc', 'Nghiên cứu hoàn thành', G.R(q2.id).ten + ' đã đạt cấp ' + q2.lv +
      '.\nThu được ' + G.so(thuong) + ' điểm Công Nghệ.' +
      (q2.vonConLai > 0 ? '\nVốn đầu tư còn lại ' + G.so(q2.vonConLai) + ' Galana được hoàn về ngân khố.' : ''));
    if (q2.vonConLai > 0) st.galana += q2.vonConLai;
    st.ncQueue = null;
  }
  /* hạm đội */
  for (i = st.fleets.length - 1; i >= 0; i--) {
    var f = st.fleets[i];
    if (f.pha === 'di' && f.den_t <= t) G.hamToiDich(st, f);
    else if (f.pha === 've' && f.ve_t <= t) G.hamVeNha(st, f);
  }
  /* tên lửa tới đích */
  if (st.tenLua) for (i = st.tenLua.length - 1; i >= 0; i--) {
    if (st.tenLua[i].khi <= t) { var tl = st.tenLua.splice(i, 1)[0]; G.tenLuaToiDich(st, tl); }
  }
  /* địch tới */
  for (i = st.toi.length - 1; i >= 0; i--) if (st.toi[i].den_t <= t) G.dichToi(st, st.toi[i]);
  /* bảo trì & đợt đánh */
  if (st.nextMaint <= t) G.baoTri(st);
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
  if (st.noBaoTri > 0) return 'Đang nợ phí bảo trì: hầm tên lửa bị niêm phong.';

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
