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
/* Tên tài nguyên đến từ client. Tra thẳng G.C.TY_GIA[r] là bẫy: r = '__proto__'
   trả về Object.prototype (truthy) nên lọt qua mọi kiểm tra rồi ném ở dòng sau.
   Chỉ nhận khoá do CHÍNH object sở hữu và phải có trong bảng tài nguyên. */
function resGiaoDich(v) {
  var r = chuoi(v, 10);
  if (!Object.prototype.hasOwnProperty.call(G.C.TY_GIA, r)) return null;
  return G.byId(G.RES, r) ? r : null;
}

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

  /* --- Siêu Thị Thiên Hà --------------------------------------------
   * [XÁC NHẬN] Siêu thị chỉ bán hàng đã có trong kho, lấy thuế 10%, hàng mua
   * tới hành tinh sau 6 giờ, và có thể HẾT TIỀN MẶT — không phải bộ đổi vô hạn. */
  ban: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var r = resGiaoDich(d.res);
    if (!r) return 'Không bán được loại này.';
    var n = soDuong(d.n);
    if (!n) return 'Nhập số lượng cần bán.';
    if ((p.res[r] || 0) < n) return 'Không đủ ' + G.byId(G.RES, r).ten + '.';
    var s = G.sieuThi(st);
    var tho = Math.floor(n / G.C.TY_GIA[r]);
    if (tho <= 0) return 'Lượng quá nhỏ, không đủ 1 Galana.';
    var thue = Math.ceil(tho * G.C.ST_THUE);
    var g = tho - thue;
    if (g <= 0) return 'Lượng quá nhỏ, thuế ăn hết tiền bán.';
    if (s.quy < tho)
      return 'Siêu Thị Thiên Hà chỉ còn ' + G.so(Math.floor(s.quy)) +
        ' Galana tiền mặt — hãy bán ít hơn hoặc chờ đoàn buôn tới.';
    var cho = (s.tran && s.tran.kho[r] !== undefined) ? s.tran.kho[r] : Infinity;
    if (s.kho[r] + n > cho)
      return 'Kho ' + G.byId(G.RES, r).ten + ' của siêu thị đã gần đầy (còn nhận ' +
        G.so(Math.max(0, Math.floor(cho - s.kho[r]))) + ').';
    p.res[r] -= n;
    s.kho[r] += n;
    s.quy -= tho;
    st.galana += g;
    G.ghi(st, 'Bán ' + G.so(n) + ' ' + G.byId(G.RES, r).ten + ' cho Siêu Thị: nhận ' + G.so(g) +
      ' Galana (thuế ' + G.so(thue) + ').');
    return null;
  },
  mua: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var r = resGiaoDich(d.res);
    if (!r) return 'Không mua được loại này.';
    var n = soDuong(d.n);
    if (!n) return 'Nhập số lượng cần mua.';
    var s = G.sieuThi(st);
    if (s.kho[r] < n)
      return 'Siêu Thị chỉ còn ' + G.so(Math.floor(s.kho[r])) + ' ' + G.byId(G.RES, r).ten + '.';
    var tho = Math.ceil(n / G.C.TY_GIA[r] * G.C.HE_SO_MUA);
    var g = tho + Math.ceil(tho * G.C.ST_THUE);
    if (st.galana < g) return 'Cần ' + G.so(g) + ' Galana (đã gồm thuế ' +
      Math.round(G.C.ST_THUE * 100) + '%).';
    st.galana -= g;
    s.kho[r] -= n;
    s.quy += tho;
    G.giaoHang(st).push({
      pi: st.planets.indexOf(p), res: r, n: n, den_t: st.now + G.C.GIAO_HANG
    });
    G.ghi(st, 'Mua ' + G.so(n) + ' ' + G.byId(G.RES, r).ten + ' hết ' + G.so(g) +
      ' Galana; hàng tới sau ' + G.tg(G.C.GIAO_HANG) + '.');
    return null;
  },

  /* --- Ngân Hàng Thiên Hà --------------------------------------------
   * [XÁC NHẬN] cho gửi lấy lãi khoảng 2%/ngày, và có khoản đầu tư vào Siêu Thị
   * KHÔNG rút được giữa kỳ. */
  nhGui: function (st, d) {
    var n = soDuong(d.n);
    if (!n) return 'Nhập số Galana cần gửi.';
    if (st.galana < n) return 'Không đủ Galana.';
    var nh = G.nganHang(st);
    st.galana -= n; nh.gui += n;
    G.ghi(st, 'Gửi ' + G.so(n) + ' Galana vào ngân hàng; số dư gửi ' + G.so(nh.gui) + '.');
    return null;
  },
  nhRut: function (st, d) {
    var nh = G.nganHang(st);
    var n = soDuong(d.n);
    if (!n) return 'Nhập số Galana cần rút.';
    if (nh.gui < n) return 'Số dư gửi chỉ có ' + G.so(Math.floor(nh.gui)) + ' Galana.';
    nh.gui -= n; st.galana += n;
    G.ghi(st, 'Rút ' + G.so(n) + ' Galana khỏi ngân hàng.');
    return null;
  },
  nhDauTu: function (st, d) {
    var n = soDuong(d.n);
    if (!n) return 'Nhập số Galana cần đầu tư.';
    var ngay = Math.floor(Number(d.ngay) || 0);
    if (!Number.isSafeInteger(ngay) || ngay < G.C.NH_DT_NGAY_MIN || ngay > G.C.NH_DT_NGAY_MAX)
      return 'Kỳ đầu tư phải từ ' + G.C.NH_DT_NGAY_MIN + ' tới ' + G.C.NH_DT_NGAY_MAX + ' ngày.';
    if (st.galana < n) return 'Không đủ Galana.';
    var nh = G.nganHang(st);
    if (nh.dauTu.length >= 8) return 'Chỉ giữ được 8 khoản đầu tư cùng lúc.';
    st.galana -= n;
    nh.dauTu.push({
      so: n,
      lai: Math.pow(1 + G.C.NH_DT_LAI_NGAY, ngay) - 1,
      dao_t: st.now + ngay * 86400
    });
    G.ghi(st, 'Đầu tư ' + G.so(n) + ' Galana vào Siêu Thị Thiên Hà, khoá ' + ngay +
      ' ngày — không rút được giữa kỳ.');
    return null;
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
  docancu: function (st, d) {
    return G.doiCanCu(st, Math.floor(+d.fid), d.pi);
  },
  tachham: function (st, d) {
    return G.tachHam(st, Math.floor(+d.fid), d.ships, d.linh, d.cargo);
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
    var i = Math.floor(+d.i);
    if (st.msgs[i]) st.msgs[i].doc = true;
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
