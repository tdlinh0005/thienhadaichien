/* THIÊN HÀ ĐẠI CHIẾN — bảng hành động luật game cốt lõi dùng chung
 * Đây là nơi thực thi xây dựng, nghiên cứu, hạm đội và các mutation state mô phỏng.
 * Chat, quản trị liên minh, tuyên chiến và chuyển Galana multiplayer đi qua
 * các phương thức server chuyên biệt vì chúng tác động dữ liệu dùng chung.
 *   - Chế độ một người: client gọi trực tiếp trên state trong máy.
 *   - Chế độ nhiều người: server gọi trên state trong database (client chỉ gửi
 *     yêu cầu). Vì vậy mọi kiểm tra ở đây phải coi dữ liệu vào là KHÔNG TIN ĐƯỢC.
 * Mỗi hành động trả về null nếu xong, hoặc chuỗi mô tả lỗi.               */
'use strict';
var G = window.G = window.G || {};

function ht(st, pi) {
  pi = Math.floor(+pi || 0);
  if (pi < 0 || pi >= st.planets.length) return null;
  return st.planets[pi];
}
function soDuong(v, toiDa) {
  v = Math.floor(+v || 0);
  if (!isFinite(v) || v <= 0) return 0;
  return toiDa !== undefined ? Math.min(v, toiDa) : v;
}
function chuoi(v, dai) { return String(v === undefined || v === null ? '' : v).slice(0, dai || 40); }

G.HANHDONG = {
  /* --- xây dựng --- */
  xay: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    if (!G.B(chuoi(d.id, 30))) return 'Không có công trình này.';
    var n;
    if (d.n !== undefined && d.n !== null) {
      n = Number(d.n);
      if (!Number.isSafeInteger(n) || n < 1 || n > 10000000)
        return 'Số lượng xây phải là số nguyên từ 1 tới 10.000.000.';
    }
    return G.xepXay(st, p, d.id, n);
  },
  huyxay: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var i = Math.floor(+d.i);
    if (!(i >= 0 && i < p.qB.length)) return 'Mục hàng đợi không tồn tại.';
    G.huyXay(st, p, i); return null;
  },

  /* --- nghiên cứu --- */
  nc: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    if (!G.R(chuoi(d.id, 30))) return 'Không có đề tài này.';
    return G.xepNC(st, p, d.id);
  },
  huync: function (st) {
    if (!st.ncQueue) return 'Không có đề tài nào đang chạy.';
    G.huyNC(st); return null;
  },

  /* --- dân sự -------------------------------------------------------- */
  doithue: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var taxBp;
    if (d.thue !== undefined) {
      if (d.thue === null || (typeof d.thue === 'string' && !d.thue.trim()))
        return 'Thuế phải nằm trong khoảng 0% tới 100%.';
      var thue = Number(d.thue);
      if (!isFinite(thue) || thue < 0 || thue > 100) return 'Thuế phải nằm trong khoảng 0% tới 100%.';
      taxBp = Math.round(thue * 100);
    } else {
      var rawBp = d.taxBp !== undefined ? d.taxBp : d.bp;
      if (rawBp === null || rawBp === undefined || (typeof rawBp === 'string' && !rawBp.trim()))
        return 'Thuế phải là số nguyên từ 0 tới 10.000 bp.';
      taxBp = Number(rawBp);
      if (!Number.isSafeInteger(taxBp) || taxBp < G.NHIP_V1.minTaxBp || taxBp > G.NHIP_V1.maxTaxBp)
        return 'Thuế phải là số nguyên từ 0 tới 10.000 bp.';
    }
    if (!p.danSu) p.danSu = G.danSuMacDinh();
    p.danSu.taxBp = taxBp;
    G.ghi(st, 'Đổi thuế tại ' + p.ten + ' ' + G.tdStr(p.c) + ' thành ' + (taxBp / 100).toFixed(2) + '%.');
    return null;
  },

  /* --- đóng tàu / phòng thủ / tên lửa --- */
  dong: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var id = chuoi(d.id, 30);
    if (!(G.S(id) || G.D(id) || G.M(id) || G.BB(id))) return 'Không có đơn vị này.';
    var n = soDuong(d.n, 100000);
    if (!n) return 'Số lượng không hợp lệ.';
    return G.xepTau(st, p, id, n);
  },
  huydong: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var i = Math.floor(+d.i);
    if (!(i >= 0 && i < p.qS.length)) return 'Mục hàng đợi không tồn tại.';
    G.huyDong(st, p, i); return null;
  },

  /* --- chợ Thiên Hà --- */
  /* [v7] Bộ đổi vô hạn đã đóng: tư liệu gốc xác nhận siêu thị chỉ có hàng khi
   * có người bán vào. Hai tên này giữ lại chỉ để client cũ nhận thông báo rõ. */
  ban: function () {
    return 'Chợ cũ đã đóng. Dùng màn Ngân Hàng & Thị Trường để đăng bán hoặc mua.';
  },
  mua: function () {
    return 'Chợ cũ đã đóng. Dùng màn Ngân Hàng & Thị Trường để đăng bán hoặc mua.';
  },

  /* --- tài chính v7: ngân hàng / đầu tư siêu thị / uranium --------------- */
  guiNH: function (st, d) {
    var so = soDuong(d.so);
    if (!so) return 'Nhập số Galana cần gửi.';
    if (st.galana < so) return 'Chỉ có ' + G.so(Math.floor(st.galana)) + ' Galana.';
    st.galana -= so;
    st.nganHang.soDu += so;
    G.ghi(st, 'Gửi Ngân Hàng Vũ Trụ ' + G.so(so) + ' Galana (số dư ' + G.so(Math.floor(st.nganHang.soDu)) + ').');
    return null;
  },
  rutNH: function (st, d) {
    var so = soDuong(d.so);
    if (!so) return 'Nhập số Galana cần rút.';
    if (st.nganHang.soDu < so) return 'Trong ngân hàng chỉ có ' + G.so(Math.floor(st.nganHang.soDu)) + ' Galana.';
    st.nganHang.soDu -= so;
    st.galana += so;
    /* lãi lũy đang treo thuộc kỳ trước — giữ nguyên, checkpoint sau kết toán */
    G.ghi(st, 'Rút ' + G.so(so) + ' Galana từ Ngân Hàng Vũ Trụ.');
    return null;
  },
  dauTuST: function (st, d) {
    var so = soDuong(d.so);
    if (!so) return 'Nhập số Galana cần đầu tư.';
    if ((Number(st.dauTuST.ketThucAt) || 0) > st.now)
      return 'Đang có ' + G.so(st.dauTuST.von) + ' Galana trong kỳ đầu tư tới ' +
        G.gio(st.dauTuST.ketThucAt * 1000) + ' — không rút giữa kỳ được [XÁC NHẬN].';
    if (st.galana < so) return 'Chỉ có ' + G.so(Math.floor(st.galana)) + ' Galana.';
    st.galana -= so;
    st.dauTuST = { von: so, ketThucAt: st.now + G.KINH_TE_V1.kyDauTuGiay };
    G.ghi(st, 'Đầu tư Siêu Thị Thiên Hà ' + G.so(so) + ' Galana, đáo hạn sau 7 ngày.');
    return null;
  },
  tangTocXay: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    if (!p.qB.length || !p.qB[0].xong) return 'Không có lô xây dựng nào đang chạy.';
    var gia = G.KINH_TE_V1.uraniumTangToc;
    if ((Number(st.uranium) || 0) < gia) return 'Cần ' + gia + ' Uranium để tăng tốc.';
    st.uranium -= gia;
    var m = p.qB.shift();
    G.themCongTrinh(p, m.id, Math.max(1, Math.floor(Number(m.n) || 1)));
    if (p.qB.length && p.qB[0].tg) p.qB[0].xong = st.now + p.qB[0].tg;
    G.ghi(st, p.ten + ': tăng tốc hoàn thành ' + G.B(m.id).ten + ' bằng ' + gia + ' Uranium.');
    return null;
  },
  muaDiemNC: function (st, d) {
    var diem = soDuong(d.diem, 100000);
    if (!diem) return 'Nhập số điểm Kỹ Thuật cần mua.';
    var gia = diem * G.KINH_TE_V1.uraniumMotDiem;
    if ((Number(st.uranium) || 0) < gia) return 'Cần ' + gia + ' Uranium (' + G.KINH_TE_V1.uraniumMotDiem + '/điểm).';
    st.uranium -= gia;
    st.techPts += diem;
    G.ghi(st, 'Mua ' + G.so(diem) + ' điểm Kỹ Thuật bằng ' + gia + ' Uranium.');
    return null;
  },
  traLuongGD: function (st) {
    /* Trả ngay toàn bộ lương gián điệp treo bằng Nhiên Liệu kho đế quốc. */
    var can = Math.ceil(Number(st.luongGD.traLuc) || 0);
    if (can <= 0) return 'Không có lương nào treo.';
    var co = 0, i;
    for (i = 0; i < st.planets.length; i++) co += Math.max(0, st.planets[i].res.deut || 0);
    if (co < can) return 'Thiếu Nhiên Liệu: cần ' + G.so(can) + ', kho có ' + G.so(co) + '.';
    for (i = 0; i < st.planets.length && can > 0; i++) {
      var p = st.planets[i], tru = Math.min(p.res.deut || 0, can);
      p.res.deut -= tru; can -= tru;
    }
    st.luongGD.traLuc = 0;
    G.ghi(st, 'Đã trả lương gián điệp.');
    return null;
  },

  /* --- thị trường v7 ------------------------------------------------------ */
  dangBan: function (st, d) {
    return G.dangBan(st, Math.floor(+d.pi), d.loai === 'tudo' ? 'tudo' : chuoi(d.loai, 10),
      chuoi(d.res, 10), d.so, d.gia);
  },
  huyDon: function (st, d) {
    var id = Math.floor(+d.donId);
    if (!id) return 'Đơn không hợp lệ.';
    return G.huyDon(st, id);
  },
  muaDon: function (st, d) {
    var don = null, i, id = String(d.donId === undefined ? '' : d.donId);
    for (i = 0; i < st.choDon.length; i++) {
      if (String(st.choDon[i].id) === id ||
          st.choDon[i].id === 'npc-' + id.replace(/^npc-/, '')) { don = st.choDon[i]; break; }
    }
    /* solo: đơn NPC sinh lười khi cần — bộ luật chạy cả server nên chỉ tra khi có npcCho */
    if (!don && st.npcCho) {
      var dsNpc = G.npcCho(st);
      for (i = 0; i < dsNpc.length; i++) if (String(dsNpc[i].id) === id) { don = dsNpc[i]; break; }
    }
    if (!don) return 'Không có đơn này trên thị trường của ta (đơn đối tác đi qua server).';
    return G.muaDon(st, Math.floor(+d.pi), don, d.so);
  },

  /* --- hạm đội --- */
  gui: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var den = G.tdParse((d.den || {}).g + ':' + (d.den || {}).h + ':' + (d.den || {}).p);
    if (!den) return 'Toạ độ mục tiêu không hợp lệ.';
    if (!G.byId(G.MISSIONS, chuoi(d.mission, 20))) return 'Nhiệm vụ không hợp lệ.';
    var ships = {}, cargo = {}, linh = {}, k;
    for (k in (d.ships || {})) if (G.S(k)) { var n = soDuong(d.ships[k]); if (n) ships[k] = n; }
    for (k in (d.linh || {})) if (G.BB(k)) { var nb = soDuong(d.linh[k]); if (nb) linh[k] = nb; }
    for (k in (d.cargo || {})) {
      if (G.RES_HANH_TINH.indexOf(k) >= 0) {
        var v = soDuong(d.cargo[k]);
        if (v) cargo[k] = v;
      }
    }
    var pct = Math.max(10, Math.min(100, Math.round((+d.pct || 100) / 10) * 10));
    var giu = Math.max(1, Math.min(24, Math.floor(+d.giu || 1)));
    return G.guiHam(st, st.planets.indexOf(p), ships, den, d.mission, cargo, pct, giu, linh);
  },
  goive: function (st, d) { return G.goiVe(st, Math.floor(+d.fid)); },
  banTenLua: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var den = G.tdParse((d.den || {}).g + ':' + (d.den || {}).h + ':' + (d.den || {}).p);
    if (!den) return 'Toạ độ mục tiêu không hợp lệ.';
    return G.banTenLua(st, st.planets.indexOf(p), den, soDuong(d.n, 100000));
  },
  doihuong: function (st, d) {
    var den = G.tdParse((d.den || {}).g + ':' + (d.den || {}).h + ':' + (d.den || {}).p);
    if (!den) return 'Toạ độ không hợp lệ.';
    return G.doiMucTieu(st, Math.floor(+d.fid), den);
  },

  /* --- liên minh --- */
  lmvao: function (st, d) {
    /* [THẺ 6 KÝ TỰ] + dấu cách + tên 32 ký tự có thể dài 41 ký tự. */
    var ten = chuoi(d.ten, 48);
    if (!ten) return 'Thiếu tên liên minh.';
    if (st.lm) return 'Đang ở trong một liên minh khác.';
    if (!G.HOOK && G.LIEN_MINH.indexOf(ten) < 0) return 'Không có liên minh này.';
    st.lm = { ten: ten, t: st.now };
    G.tin(
      st,
      'he',
      'Đã gia nhập liên minh',
      'Ta chính thức là thành viên của ' + ten + '. Sản lượng toàn đế quốc +5%.'
    );
    return null;
  },
  lmra: function (st) {
    if (!st.lm) return 'Chưa ở trong liên minh nào.';
    G.ghi(st, 'Rời liên minh ' + st.lm.ten + '.');
    st.lm = null; return null;
  },

  /* --- tin nhắn & khác --- */
  doctin: function (st, d) {
    var id = Math.floor(+d.i);
    for (var i = 0; i < st.msgs.length; i++) { if (st.msgs[i].id === id) { st.msgs[i].doc = true; break; } }
    return null;
  },
  docHet: function (st) { for (var i = 0; i < st.msgs.length; i++) st.msgs[i].doc = true; return null; },
  xoatin: function (st) { st.msgs = []; return null; },
  boHoang: function (st, d) {
    if (chuoi(d.xacnhan, 10) !== 'BO') return 'Cần xác nhận trước khi bỏ hoang.';
    return G.boHoang(st, Math.floor(+d.pi));
  },
  doiTenHT: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var ten = chuoi(d.ten, 24).replace(/[<>&"]/g, '').trim();
    if (!ten) return 'Tên không hợp lệ.';
    p.ten = ten; return null;
  }
};

/* Chạy một hành động: tua thời gian trước, rồi thực thi. */
G.chay = function (st, ten, dl) {
  var f = G.HANHDONG[ten];
  if (!f) return 'Hành động không tồn tại.';
  var tick = G.tick(st, G.giay());
  if (G.laTickPartial(tick)) throw new Error('TICK_SENTINEL_FROM_TICK_INVALID');
  if (G.tickOutcomeNeedsDeferral(tick)) return G.TICK_PARTIAL;
  return f(st, dl || {}) || null;
};
