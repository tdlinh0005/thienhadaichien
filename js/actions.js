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
  ban: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var r = chuoi(d.res, 10);
    if (!G.C.TY_GIA[r]) return 'Không bán được loại này.';
    var n = soDuong(d.n);
    if (!n) return 'Nhập số lượng cần bán.';
    if ((p.res[r] || 0) < n) return 'Không đủ ' + G.byId(G.RES, r).ten + '.';
    var g = Math.floor(n / G.C.TY_GIA[r]);
    if (g <= 0) return 'Lượng quá nhỏ, không đủ 1 Galana.';
    p.res[r] -= n; st.galana += g;
    G.ghi(st, 'Bán ' + G.so(n) + ' ' + G.byId(G.RES, r).ten + ' lấy ' + G.so(g) + ' Galana.');
    return null;
  },
  mua: function (st, d) {
    var p = ht(st, d.pi); if (!p) return 'Hành tinh không tồn tại.';
    var r = chuoi(d.res, 10);
    if (!G.C.TY_GIA[r]) return 'Không mua được loại này.';
    var n = soDuong(d.n);
    if (!n) return 'Nhập số lượng cần mua.';
    var g = Math.ceil(n / G.C.TY_GIA[r] * G.C.HE_SO_MUA);
    if (st.galana < g) return 'Cần ' + G.so(g) + ' Galana.';
    st.galana -= g; p.res[r] = (p.res[r] || 0) + n;
    G.ghi(st, 'Mua ' + G.so(n) + ' ' + G.byId(G.RES, r).ten + ' hết ' + G.so(g) + ' Galana.');
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
