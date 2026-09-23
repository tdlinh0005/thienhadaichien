/* UI — máy tính trận đánh (tách từ ui.js) */
'use strict';
var G = window.G, U = window.U, APP = window.APP;

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
