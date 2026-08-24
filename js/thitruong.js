/* =========================================================================
 * THIÊN HÀ ĐẠI CHIẾN — Thị trường v7 (Siêu Thị Thiên Hà & Thị Trường Tự Do)
 * -------------------------------------------------------------------------
 * Tư liệu gốc [XÁC NHẬN]:
 *   - Siêu Thị Thiên Hà: chỉ bán giá GỐC, chỉ có hàng khi có người bán vào,
 *     thuế 10% mỗi lượt.
 *   - Thị Trường Tự Do: người chơi tự định giá, thuế 5%, hàng về sau 6 giờ,
 *     giao dịch trực tiếp giữa hai người chơi.
 * Mọi con số tinh chỉnh khác (độ sâu NPC solo, trần đơn) là [TÁI DỰNG].
 *
 * Nguồn sự thật của đơn:
 *   - Solo: st.choDon trong state người chơi (đơn NPC sinh tất định).
 *   - Multiplayer: bảng SQLite `cho` là nguồn chéo đế quốc; st.choDon chỉ là
 *     projection hiển thị cho chủ đơn, được world.js dựng lại khi lưu.
 * File này chỉ chứa LUẬT dùng chung cả hai chế độ.                          */
'use strict';
var G = window.G = window.G || {};

/* Độ sâu thị trường NPC ở bản một người [TÁI DỨNG]: mỗi loại có lượng sẵn
 * bán, hồi dần theo giờ (tỉ lệ/giờ) lên trần. Multiplayer bỏ qua. */
G.CHO_NPC = {
  TRAN: { metal: 2000000, crystal: 1000000, deut: 400000, food: 1500000 },
  HOI_GIO: 0.02          // mỗi giờ hồi 2% trần
};

function donKeTiep(st) {
  var maxId = 0, i;
  for (i = 0; i < st.choDon.length; i++) maxId = Math.max(maxId, st.choDon[i].id || 0);
  return maxId + 1;
}

/* Giá gốc GL/đơn vị [XÁC NHẬN]; loại lạ trả NaN để caller chặn. */
G.giaGoc = function (res) {
  var g = G.KINH_TE_V1 && G.KINH_TE_V1.giaGoc[res];
  return g === undefined ? NaN : g;
};

G.donChoCua = function (st) { return st.choDon || (st.choDon = []); };

/* Đăng bán: TRỪ tài nguyên ngay lúc đặt lệnh — hàng bị khoá trong đơn tới khi
 * mua hết hoặc huỷ. Siêu thị ép đúng giá gốc; Tự Do nhận giá nguyên dương bất kỳ. */
G.dangBan = function (st, pi, loai, res, so, gia) {
  var p = st.planets[pi];
  if (!p) return 'Hành tinh không tồn tại.';
  if (loai !== 'sieuthi' && loai !== 'tudo') return 'Loại chợ không hợp lệ.';
  if (G.RES_HANH_TINH.indexOf(res) < 0) return 'Không đăng bán được loại này.';
  so = Math.floor(+so);
  if (!isFinite(so) || so <= 0) return 'Nhập số lượng cần bán.';
  if ((p.res[res] || 0) < so) return 'Không đủ ' + G.byId(G.RES, res).ten + '.';
  gia = Math.floor(+gia);
  if (loai === 'sieuthi') gia = G.giaGoc(res);           // giá gốc là luật của siêu thị
  else {
    if (!isFinite(gia) || gia <= 0) return 'Giá phải là số Galana dương.';
    if (gia > 1e12) return 'Giá quá lớn.';
  }
  var don = st.choDon.filter(function (x) { return !x.npc; });
  if (don.length >= G.KINH_TE_V1.donToiDaMo)
    return 'Đã mở tối đa ' + G.KINH_TE_V1.donToiDaMo + ' đơn; hãy huỷ bớt.';
  p.res[res] -= so;
  st.choDon.push({ id: donKeTiep(st), loai: loai, res: res, soConLai: so, gia: gia, taoAt: st.now });
  G.ghi(st, 'Đăng bán ' + G.so(so) + ' ' + G.byId(G.RES, res).ten + ' (' +
    (loai === 'sieuthi' ? 'Siêu Thị' : 'Thị Trường Tự Do') + ') giá ' + G.so(gia) + ' GL/đơn vị.');
  return null;
};

/* Huỷ đơn của mình: hoàn phần tài nguyên còn khoá trong đơn. */
G.huyDon = function (st, donId) {
  var i;
  for (i = 0; i < st.choDon.length; i++) if (st.choDon[i].id === donId) break;
  if (i >= st.choDon.length) return 'Không có đơn này.';
  var d = st.choDon[i];
  if (d.npc) return 'Đơn của thị trường không thể huỷ.';
  /* Hoàn vào hành tinh có ô toạ độ lưu cùng đơn nếu có, không thì hành tinh đầu. */
  var p = st.planets[Math.min(Math.max(0, d.pi | 0), st.planets.length - 1)] || st.planets[0];
  p.res[d.res] = (p.res[d.res] || 0) + d.soConLai;
  st.choDon.splice(i, 1);
  G.ghi(st, 'Huỷ đơn bán ' + G.byId(G.RES, d.res).ten + ', hoàn ' + G.so(d.soConLai) + ' vào kho.');
  return null;
};

/* Mua một đơn. Trả {loi} hoặc null. Luật:
 *   - không được tự mua đơn của chính mình;
 *   - siêu thị: giao NGAY vào kho hành tinh `pi` của người mua;
 *   - tự do: hàng lên đường, tới sau giaoHangGiay (tickCho nhập kho).
 * Ở multiplayer, đơn đối tác nằm trên đế quốc khác nên server gọi hàm này sau
 * khi đã tua và kiểm tra cả hai bên; bên đây chỉ thấy đơn qua tham số. */
G.muaDon = function (st, pi, don, so) {
  var p = st.planets[pi];
  if (!p) return 'Hành tinh không tồn tại.';
  if (!don || don.soConLai <= 0) return 'Đơn này vừa hết hàng hoặc đã bị huỷ.';
  /* Đơn thường nằm trong st.choDon của chủ đơn; đơn NPC thì được mua thoải mái. */
  if (!don.npc && st.choDon.indexOf(don) >= 0)
    return 'Không thể tự mua đơn của chính mình.';
  so = Math.floor(+so);
  if (!isFinite(so) || so <= 0) return 'Nhập số lượng cần mua.';
  if (so > don.soConLai) so = don.soConLai;
  var tongGL = Math.ceil(so * don.gia);
  var thue = don.loai === 'sieuthi' ? G.KINH_TE_V1.thueSieuThi : G.KINH_TE_V1.thueTuDo;
  if (st.galana < tongGL) return 'Cần ' + G.so(tongGL) + ' Galana.';
  st.galana -= tongGL;
  /* đơn NPC: trừ thẳng vào kho hàng hồi dần của thị trường */
  if (don.npc && st.npcCho && st.npcCho[don.res]) {
    st.npcCho[don.res].con = Math.max(0, st.npcCho[don.res].con - so);
    don.soConLai = Math.floor(st.npcCho[don.res].con);
  }
  don.daBan = (don.daBan || 0) + so;
  don.thuNhap = (don.thuNhap || 0) + Math.floor(tongGL * (1 - thue));
  if (don.loai === 'sieuthi') {
    p.res[don.res] = (p.res[don.res] || 0) + so;
  } else {
    p.giaoHang = p.giaoHang || [];
    p.giaoHang.push({ res: don.res, so: so, xongAt: st.now + G.KINH_TE_V1.giaoHangGiay });
  }
  G.ghi(st, 'Mua ' + G.so(so) + ' ' + G.byId(G.RES, don.res).ten + ' hết ' +
    G.so(tongGL) + ' Galana' + (don.loai === 'tudo' ? '; hàng về sau 6 giờ.' : '.'));
  return null;
};

/* Đơn NPC cho bản solo [TÁI DỨNG]: sinh tất định từ id đế quốc, lượng sẵn
 * giảm dần theo lần mua (lưu trong st.npcCho), hồi dần theo giờ trong tickCho. */
G.npcCho = function (st) {
  if (!st.npcCho) st.npcCho = {};
  var r = G.rng(G.hash('cho-npc:' + (st.seed || ''))), out = [], i;
  var ds = G.RES_HANH_TINH;
  for (i = 0; i < ds.length; i++) {
    var res = ds[i];
    var tran = G.CHO_NPC.TRAN[res] || 0;
    if (!st.npcCho[res]) st.npcCho[res] = { con: tran * (0.4 + 0.3 * r()), luc: st.now };
    out.push({
      id: 'npc-' + res, npc: true, loai: 'sieuthi', res: res, gia: G.giaGoc(res),
      soConLai: Math.floor(st.npcCho[res].con), tran: tran
    });
  }
  return out;
};

/* Tick thị trường: nhập hàng Tự Do tới hạn + hồi hàng NPC (solo). */
G.tickCho = function (st, t) {
  var i, j;
  for (i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    if (!p.giaoHang || !p.giaoHang.length) continue;
    for (j = p.giaoHang.length - 1; j >= 0; j--) {
      if (p.giaoHang[j].xongAt <= t) {
        var hang = p.giaoHang.splice(j, 1)[0];
        p.res[hang.res] = (p.res[hang.res] || 0) + hang.so;
        G.ghi(st, p.ten + ': nhận ' + G.so(hang.so) + ' ' + G.byId(G.RES, hang.res).ten +
          ' từ Thị Trường Tự Do.');
      }
    }
  }
  /* hồi NPC */
  if (st.npcCho) {
    for (var res in st.npcCho) {
      var s = st.npcCho[res], tran = G.CHO_NPC.TRAN[res] || 0;
      var gio = (t - Number(s.luc || t)) / 3600;
      if (gio > 0 && s.con < tran) {
        s.con = Math.min(tran, s.con + tran * G.CHO_NPC.HOI_GIO * gio);
        s.luc = t;
      }
    }
  }
};
