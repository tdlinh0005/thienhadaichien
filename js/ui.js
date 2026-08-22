/* THIÊN HÀ ĐẠI CHIẾN — giao diện */
'use strict';
var G = window.G, U = window.U = {}, APP = window.APP = window.APP || {};

U.man = 'tongquan';
U.pi = 0;
U.gal = null;
U.form = null;
U.moTin = {};
U.cho = {};        // số lượng đang gõ ở Chợ Thiên Hà, giữ qua các lần vẽ lại
U.sigCu = '';

U.esc = function (s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
U.st = function () { return window.ST; };
U.ht = function () { var st = U.st(); if (U.pi >= st.planets.length) U.pi = 0; return st.planets[U.pi]; };

U.toast = function (s, loai) {
  var d = document.createElement('div');
  d.className = 't' + (loai ? ' ' + loai : '');
  d.innerHTML = U.esc(s);
  document.getElementById('toast').appendChild(d);
  setTimeout(function () { d.style.opacity = 0; setTimeout(function () { d.remove(); }, 250); }, 3600);
};
U.hop = function (td, html) {
  document.getElementById('ht-td').textContent = td;
  document.getElementById('ht-noi').innerHTML = html;
  document.getElementById('hop-thoai').style.display = 'flex';
};
U.dongHop = function () { document.getElementById('hop-thoai').style.display = 'none'; };

/* ======================================================================
 * TIỆN ÍCH HIỂN THỊ
 * ==================================================================== */
U.dem = function (ts, hau) {
  return '<span class="dem sz" data-t="' + Math.round(ts) + '">' + G.tg(ts - U.st().now) + '</span>' + (hau || '');
};
U.gia = function (cost, p, st) {
  var out = [], k;
  for (k in cost) {
    if (!cost[k]) continue;
    var r = G.byId(G.RES, k);
    var co = (k === 'galana') ? st.galana : (k === 'tech' ? st.techPts : (p.res[k] || 0));
    var thieu = co < cost[k];
    out.push('<span class="' + (thieu ? 'thieu' : '') + '" style="color:' + (thieu ? '' : r.mau) + '">' +
      r.ten + ': ' + G.so(cost[k]) + '</span>');
  }
  return out.join(' &middot; ');
};
U.dsRes = function (o, chiSo) {
  var out = [], k;
  for (k in o) {
    if (!o[k]) continue;
    var r = G.byId(G.RES, k);
    if (!r) continue;
    out.push('<span style="color:' + r.mau + '">' + (chiSo ? '' : r.ten + ' ') + G.so(o[k]) + '</span>');
  }
  return out.length ? out.join(' &middot; ') : '<span class="mo">—</span>';
};
U.htTheoKey = function (key) {
  var st = U.st();
  for (var i = 0; i < st.planets.length; i++) if (G.tdKey(st.planets[i].c) === key) return st.planets[i];
  return null;
};
U.dsTau = function (o) {
  var out = [], k;
  for (k in o) if (o[k]) { var u = G.UNIT(k); out.push(U.esc(u ? u.ten : k) + ' <b>×' + G.so(o[k]) + '</b>'); }
  return out.length ? out.join(', ') : '<span class="mo">không có</span>';
};

/* ======================================================================
 * KHUNG: thanh trên, menu, cảnh báo
 * ==================================================================== */
U.thanhRes = function () {
  var st = U.st(), p = U.ht(), s = G.sanLuong(st, p), cap = G.dungTich(p);
  var h = '';
  for (var i = 0; i < G.RES_HANH_TINH.length; i++) {
    var id = G.RES_HANH_TINH[i], r = G.byId(G.RES, id);
    var v = p.res[id] || 0, c = cap[id];
    var mau = v >= c ? 'var(--do)' : r.mau;
    h += '<div class="o"><span class="n">' + r.ten + '</span>' +
      '<span class="v sz" style="color:' + mau + '" data-live="res.' + id + '">' + G.soNgan(v) + '</span>' +
      '<span class="r sz" data-live="rate.' + id + '">' + (s.r[id] >= 0 ? '+' : '') + G.soNgan(s.r[id]) + '/g</span></div>';
  }
  h += '<div class="o"><span class="n">Galana</span><span class="v sz" style="color:' + G.byId(G.RES, 'galana').mau +
    '" data-live="galana">' + G.soNgan(st.galana) + '</span><span class="r sz" data-live="rate.galana">+' + G.soNgan(s.r.galana) + '/g</span></div>';
  h += '<div class="o"><span class="n">Công Nghệ</span><span class="v sz" style="color:' + G.byId(G.RES, 'tech').mau +
    '" data-live="tech">' + G.soNgan(st.techPts) + '</span><span class="r sz" data-live="rate.tech">+' + G.soNgan(s.r.tech) + '/g</span></div>';
  h += '<div class="o"><span class="n">Điện</span><span class="v sz" style="color:' + (s.hs < 1 ? 'var(--do)' : 'var(--luc)') + '">' +
    G.so(s.dienCo) + ' / ' + G.so(s.dienDung) + '</span><span class="r">hiệu suất ' + Math.round(s.hs * 100) + '%</span></div>';
  h += '<div class="o"><span class="n">Bảo trì sau</span><span class="v sz">' + U.dem(st.nextMaint) +
    '</span><span class="r">chu kỳ #' + (st.soChuKy + 1) + '</span></div>';
  return h;
};

U.MAN = [
  { id: 'tongquan', ten: 'Tổng Quan' },
  { id: 'tainguyen', ten: 'Tài Nguyên' },
  { id: 'congtrinh', ten: 'Công Trình' },
  { id: 'nghiencuu', ten: 'Nghiên Cứu' },
  { id: 'xuong', ten: 'Xưởng Đóng Tàu' },
  { id: 'phongthu', ten: 'Phòng Thủ' },
  { id: 'hamdoi', ten: 'Hạm Đội' },
  { id: 'thienha', ten: 'Thiên Hà' },
  { id: 'lienminh', ten: 'Liên Minh' },
  { id: 'xephang', ten: 'Bảng Xếp Hạng' },
  { id: 'mophong', ten: 'Máy Tính Trận' },
  { id: 'tinnhan', ten: 'Tin Nhắn' },
  { id: 'huongdan', ten: 'Hướng Dẫn' },
  { id: 'nhatky', ten: 'Nhật Ký & Lưu' }
];

U.veMenu = function () {
  var st = U.st(), h = '';
  var moi = 0;
  for (var i = 0; i < st.msgs.length; i++) if (!st.msgs[i].doc) moi++;
  for (var j = 0; j < U.MAN.length; j++) {
    var m = U.MAN[j], d = '';
    if (m.id === 'tinnhan' && moi) d = '<span class="dem-nho">' + moi + '</span>';
    if (m.id === 'hamdoi' && st.fleets.length) d = '<span class="dem-nho">' + st.fleets.length + '</span>';
    h += '<a class="' + (U.man === m.id ? 'on' : '') + '" data-act="man" data-man="' + m.id + '">' +
      '<span>' + m.ten + '</span>' + d + '</a>';
  }
  document.getElementById('menu').innerHTML = h;
};

U.veCanh = function () {
  var st = U.st(), h = '', i;
  if (st.noBaoTri > 0) h += '<div class="canh">NỢ PHÍ BẢO TRÌ ' + G.so(st.noBaoTri) +
    ' GALANA — sản lượng toàn đế quốc giảm 30%, hạm đội bị niêm phong không tấn công được. Bán tài nguyên hoặc giảm quy mô hạm đội.</div>';
  if (st.ncQueue && st.ncQueue.treo) h += '<div class="canh bt">Nghiên cứu "' + U.esc(G.R(st.ncQueue.id).ten) +
    '" đang TREO vì thiếu vốn đầu tư (' + G.so(st.ncQueue.vonMoiKy) + ' Galana mỗi chu kỳ).</div>';
  for (i = 0; i < st.planets.length; i++) if (st.planets[i].doi > 0)
    h += '<div class="canh bt">' + U.esc(st.planets[i].ten) + ' ' + G.tdStr(st.planets[i].c) +
      ' HẾT LƯƠNG THỰC — sản lượng còn một nửa. Xây thêm Trang Trại Sinh Quyển hoặc chở lương thực tới.</div>';
  for (i = 0; i < st.toi.length; i++) {
    var w = st.toi[i], p = st.planets[w.pi] || st.planets[0];
    h += '<div class="canh">BÁO ĐỘNG — ' + U.esc(w.ten) + ' ' + U.esc(w.lm || '') + ' từ ' + G.tdStr(w.tu) +
      ' đánh vào ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) + ' trong ' + U.dem(w.den_t) + '.</div>';
  }
  /* hạm đội của người chơi thật đang bay tới (bản nhiều người) */
  var pv = st.pvpToi || [];
  for (i = 0; i < pv.length; i++) {
    var q = pv[i], pt = U.htTheoKey(q.den);
    var tenHT = pt ? pt.ten + ' [' + q.den + ']' : '[' + q.den + ']';
    if (q.nv === 'attack')
      h += '<div class="canh">BÁO ĐỘNG ĐỎ — <b>' + U.esc(q.ten) + '</b> ' + U.esc(q.lm || '') + ' từ [' + U.esc(q.tu) +
        '] đang tấn công ' + U.esc(tenHT) + ', tới trong ' + U.dem(q.den_t) +
        '. Dựng thêm phòng thủ, hoặc cho hạm đội bay đi để khỏi bị bắn hạ.</div>';
    else
      h += '<div class="canh ok">' + U.esc(q.ten) + ' ' + U.esc(q.lm || '') + ' đang chở hàng tới ' +
        U.esc(tenHT) + ', tới trong ' + U.dem(q.den_t) + '.</div>';
  }
  document.getElementById('thanh-canh').innerHTML = h;
};

U.veChonHT = function () {
  var st = U.st(), h = '';
  for (var i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    h += '<option value="' + i + '"' + (i === U.pi ? ' selected' : '') + '>' +
      U.esc(p.ten) + ' ' + G.tdStr(p.c) + '</option>';
  }
  document.getElementById('chon-ht').innerHTML = h;
};

/* ======================================================================
 * MÀN: TỔNG QUAN
 * ==================================================================== */
U.m_tongquan = function () {
  var st = U.st(), p = U.ht(), s = G.sanLuong(st, p), d = G.diem(st);
  var h = '';

  h += '<div class="panel"><h3>' + U.esc(p.ten) + ' ' + G.tdStr(p.c) + (p.thuDo ? ' — thủ phủ' : '') + '</h3><div class="noi luoi">';
  h += '<div><b>Chỉ huy</b><br>' + U.esc(st.ten) + (st.lm ? ' <span class="tag-lm">' + U.esc(st.lm.ten) + '</span>' : '') + '</div>';
  h += '<div><b>Điểm</b><br><span class="sz">' + G.so(d.tong) + '</span> <span class="mo">(CT ' + G.so(d.ct) +
    ' · NC ' + G.so(d.nc) + ' · Hạm ' + G.so(d.ham) + ' · Thủ ' + G.so(d.thu) + ')</span></div>';
  h += '<div><b>Hành tinh</b><br>' + U.esc(p.ten) + ' <button class="nut nho" data-act="doi-ten">đổi tên</button>' +
    (p.thuDo || U.pi === 0 ? '' : ' <button class="nut nho xoa" data-act="bo-hoang">bỏ hoang</button>') + '</div>';
  var Lp = G.loaiHT(st, p);
  h += '<div><b>Loại hành tinh</b><br><b style="color:' + Lp.mau + '">' + U.esc(Lp.ten) + '</b></div>';
  h += '<div><b>Nhiệt độ</b><br>' + p.temp + '°C</div>';
  h += '<div><b>Ô đất</b><br>' + G.oDaDung(p) + ' / ' + G.oToiDa(p) + '</div>';
  h += '<div><b>Khe hạm đội</b><br>' + st.fleets.length + ' / ' + G.khe(st) +
    ' <span class="mo">(thám hiểm ' + G.dangThamHiem(st) + '/' + G.kheThamHiem(st) + ')</span></div>';
  h += '<div><b>Số hành tinh</b><br>' + st.planets.length + ' / ' + G.maxThuocDia(st) + '</div>';
  h += '<div><b>Chu kỳ bảo trì</b><br>' + U.dem(st.nextMaint) + ' <span class="mo">(mỗi 6 giờ)</span></div>';
  h += '<div><b>Trận đánh</b><br><span class="luc">' + st.stats.thang + ' thắng</span> / <span class="do">' + st.stats.thua + ' thua</span></div>';
  h += '<div><b>Quân đổ bộ giữ nhà</b><br>' + U.dsTau(p.linh || {}) + '</div>';
  h += '</div></div>';

  /* hàng đợi */
  h += '<div class="luoi2">';
  h += '<div class="panel"><h3>Đang xây trên hành tinh</h3><div class="noi">';
  if (!p.qB.length) h += '<span class="mo">Không có công trình nào đang xây.</span>';
  else {
    h += '<table><tr><th>Công trình</th><th>Cấp</th><th>Xong sau</th><th></th></tr>';
    for (var i = 0; i < p.qB.length; i++) {
      var q = p.qB[i];
      h += '<tr><td>' + U.esc(G.B(q.id).ten) + '</td><td class="c">' + q.lv + '</td><td class="sz">' +
        (q.xong ? U.dem(q.xong) : '<span class="mo">chờ</span>') + '</td>' +
        '<td class="r"><button class="nut nho xoa" data-act="huyxay" data-i="' + i + '">Huỷ</button></td></tr>';
    }
    h += '</table>';
  }
  h += '</div></div>';

  h += '<div class="panel"><h3>Xưởng đóng tàu</h3><div class="noi">';
  if (!p.qS.length) h += '<span class="mo">Xưởng đang rảnh.</span>';
  else {
    h += '<table><tr><th>Đơn vị</th><th class="r">Còn lại</th><th>Chiếc tới</th><th></th></tr>';
    for (var j = 0; j < p.qS.length; j++) {
      var q2 = p.qS[j], u = G.UNIT(q2.id) || G.M(q2.id);
      h += '<tr><td>' + U.esc(u.ten) + '</td><td class="r sz">' + G.so(q2.n) + '</td><td class="sz">' +
        (j === 0 ? U.dem(st.now + q2.tLeft) : '<span class="mo">chờ</span>') + '</td>' +
        '<td class="r"><button class="nut nho xoa" data-act="huydong" data-i="' + j + '">Huỷ</button></td></tr>';
    }
    h += '</table>';
  }
  h += '</div></div>';

  h += '<div class="panel"><h3>Phòng nghiên cứu</h3><div class="noi">';
  if (!st.ncQueue) h += '<span class="mo">Không có đề tài nào đang chạy.</span>';
  else {
    var q3 = st.ncQueue;
    var tienDo = Math.max(0, Math.min(1, 1 - q3.conLai / q3.tong));
    h += '<b>' + U.esc(G.R(q3.id).ten) + '</b> → cấp ' + q3.lv + '<div class="thanh"><i style="width:' +
      (tienDo * 100).toFixed(1) + '%"></i></div>';
    h += q3.treo ? '<span class="do">BỊ TREO — thiếu vốn đầu tư.</span>'
      : 'Xong sau ' + U.dem(st.now + q3.conLai);
    h += '<br><span class="mo">Vốn đầu tư còn phải rót: ' + G.so(q3.vonConLai) + ' Galana (' +
      G.so(q3.vonMoiKy) + '/chu kỳ)</span>';
    h += '<br><button class="nut nho xoa" data-act="huync">Huỷ đề tài</button>';
  }
  h += '</div></div>';

  h += '<div class="panel"><h3>Hạm đội đang bay</h3><div class="noi">';
  if (!st.fleets.length) h += '<span class="mo">Toàn bộ hạm đội đang đậu tại các hành tinh.</span>';
  else {
    h += '<div class="bang-cuon"><table><tr><th>#</th><th>Nhiệm vụ</th><th>Tới</th><th>Còn</th></tr>';
    for (var k = 0; k < st.fleets.length; k++) {
      var f = st.fleets[k];
      h += '<tr><td>' + f.id + '</td><td>' + U.esc(G.byId(G.MISSIONS, f.mission).ten) +
        (f.pha === 've' ? ' <span class="mo">(về)</span>' : '') + '</td><td class="sz">' +
        G.tdStr(f.pha === 've' ? f.tu : f.den) + '</td><td class="sz">' +
        U.dem(f.pha === 've' ? f.ve_t : f.den_t) + '</td></tr>';
    }
    h += '</table></div>';
  }
  h += '</div></div>';
  h += '</div>';

  /* tin mới nhất */
  h += '<div class="panel"><h3>Tin mới nhất</h3><div class="noi">';
  if (!st.msgs.length) h += '<span class="mo">Chưa có tin.</span>';
  else for (var m = 0; m < Math.min(4, st.msgs.length); m++)
    h += '<div><span class="hu">' + G.gio(st.msgs[m].t * 1000) + '</span> ' + U.esc(st.msgs[m].td) + '</div>';
  h += '</div></div>';
  return h;
};

/* ======================================================================
 * MÀN: TÀI NGUYÊN
 * ==================================================================== */
U.m_tainguyen = function () {
  var st = U.st(), p = U.ht(), s = G.sanLuong(st, p), cap = G.dungTich(p);
  var h = '<div class="panel"><h3>Sản lượng ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) + '</h3><div class="noi bang-cuon">';
  h += '<table><tr><th>Tài nguyên</th><th class="r">Đang có</th><th class="r">Dung tích</th><th class="r">Mỗi giờ</th><th class="r">Mỗi chu kỳ 6g</th><th>Đầy sau</th></tr>';
  for (var i = 0; i < G.RES_HANH_TINH.length; i++) {
    var id = G.RES_HANH_TINH[i], r = G.byId(G.RES, id), v = p.res[id] || 0, rate = s.r[id];
    var day = rate > 0 && v < cap[id] ? G.tg((cap[id] - v) / rate * 3600) : (rate <= 0 ? '—' : 'đã đầy');
    h += '<tr><td style="color:' + r.mau + '">' + r.ten + '</td><td class="r sz">' + G.so(v) + '</td><td class="r sz">' +
      G.so(cap[id]) + '</td><td class="r sz ' + (rate < 0 ? 'do' : '') + '">' + (rate >= 0 ? '+' : '') + G.so(rate) +
      '</td><td class="r sz">' + (rate >= 0 ? '+' : '') + G.so(rate * 6) + '</td><td class="sz">' + day + '</td></tr>';
  }
  h += '<tr><td style="color:' + G.byId(G.RES, 'galana').mau + '">Galana <span class="mo">(toàn đế quốc)</span></td><td class="r sz">' +
    G.so(st.galana) + '</td><td class="r mo">không giới hạn</td><td class="r sz">+' + G.so(s.r.galana) +
    '</td><td class="r sz">+' + G.so(s.r.galana * 6) + '</td><td class="mo">—</td></tr>';
  h += '<tr><td style="color:' + G.byId(G.RES, 'tech').mau + '">Công Nghệ <span class="mo">(toàn đế quốc)</span></td><td class="r sz">' +
    G.so(st.techPts) + '</td><td class="r mo">không giới hạn</td><td class="r sz">+' + G.so(s.r.tech) +
    '</td><td class="r sz">+' + G.so(s.r.tech * 6) + '</td><td class="mo">—</td></tr>';
  h += '</table></div></div>';

  var Lr = s.loai || G.loaiHT(st, p);
  h += '<div class="panel"><h3>Hành tinh loại ' + U.esc(Lr.ten) + '</h3><div class="noi">' +
    '<p class="mo">' + U.esc(Lr.mota) + '</p>' +
    '<div class="bang-cuon"><table><tr><th>Ô đất</th><th class="r">Kim Loại</th><th class="r">Tinh Thể</th>' +
    '<th class="r">Deuterium</th><th class="r">Lương Thực</th><th class="r">Điện mặt trời</th><th class="r">Phòng thủ mặt đất</th></tr><tr>' +
    ['oDat', 'kl', 'tt', 'dt', 'lt', 'dien', 'thuDat'].map(function (k) {
      var v = Lr[k];
      return '<td class="r sz ' + (v > 1 ? 'luc' : (v < 1 ? 'do' : 'mo')) + '">×' + v + '</td>';
    }).join('') + '</tr></table></div></div></div>';
  h += '<div class="luoi2">';
  h += '<div class="panel"><h3>Cân bằng điện</h3><div class="noi">';
  h += '<table><tr><td>Sản xuất</td><td class="r sz luc">' + G.so(s.dienCo) + '</td></tr>' +
    '<tr><td>Tiêu thụ</td><td class="r sz do">' + G.so(s.dienDung) + '</td></tr>' +
    '<tr><td>Hiệu suất mỏ</td><td class="r sz">' + Math.round(s.hs * 100) + '%</td></tr>' +
    '<tr><td>Lò nhiệt hạch đốt</td><td class="r sz">' + G.so(s.dotDT) + ' DT/giờ</td></tr></table>';
  if (s.hs < 1) h += '<div class="canh bt" style="margin:8px 0 0">Thiếu điện: mỏ chỉ chạy ' + Math.round(s.hs * 100) +
    '%. Xây thêm Nhà Máy Điện Mặt Trời, Lò Phản Ứng Nhiệt Hạch hoặc Vệ Tinh Phòng Thủ.</div>';
  h += '</div></div>';

  var soThu = 0; for (var kk in p.def) soThu += p.def[kk];
  h += '<div class="panel"><h3>Lương thực &amp; dân cư</h3><div class="noi">';
  h += '<table><tr><td>Thủy thủ đoàn đang đậu</td><td class="r sz">' + G.so(G.thuyThu(p.ships)) + ' người</td></tr>' +
    '<tr><td>Tổng cấp công trình</td><td class="r sz">' + G.tongCapCT(p) + '</td></tr>' +
    '<tr><td>Công sự phải nuôi</td><td class="r sz">' + G.so(soThu) + '</td></tr>' +
    '<tr><td>Tiêu thụ lương thực</td><td class="r sz do">' + G.so(s.anUong) + '/giờ</td></tr>' +
    '<tr><td>Thuế thu về</td><td class="r sz" style="color:var(--tim)">' + G.so(s.r.galana) + ' Galana/giờ</td></tr></table>';
  if (s.doi) h += '<div class="canh" style="margin:8px 0 0">Hành tinh đang bị bỏ đói — sản lượng còn một nửa và hạm đội không xuất kích được.</div>';
  h += '</div></div>';
  h += '</div>';

  /* Chợ Thiên Hà: đổi tài nguyên ra Galana và ngược lại */
  h += '<div class="panel"><h3>Chợ Thiên Hà — quy đổi Galana</h3><div class="noi">';
  h += '<p class="mo">Bán tài nguyên lấy Galana để trả phí bảo trì, hoặc mua tài nguyên bằng Galana. ' +
    'Tỷ giá bán: 1 Galana = ' + G.C.TY_GIA.metal + ' Kim Loại / ' + G.C.TY_GIA.crystal + ' Tinh Thể / ' + G.C.TY_GIA.deut + ' Deuterium / ' + G.C.TY_GIA.food + ' Lương Thực. Giá mua đắt gấp ' + G.C.HE_SO_MUA + ' lần.</p>';
  h += '<div class="hd-luoi">';
  var tg = G.C.TY_GIA;
  for (var t in tg) {
    var rr = G.byId(G.RES, t);
    h += '<div class="hd-tau"><span style="color:' + rr.mau + '">' + rr.ten + '</span>' +
      '<input type="number" min="0" step="1000" id="cho-' + t + '" value="' + (U.cho[t] || 0) + '">' +
      '<button class="nut nho oke" data-act="ban" data-res="' + t + '">Bán</button>' +
      '<button class="nut nho" data-act="mua" data-res="' + t + '">Mua</button></div>';
  }
  h += '</div></div></div>';
  return h;
};


/* ======================================================================
 * MÀN: CÔNG TRÌNH / NGHIÊN CỨU / XƯỞNG / PHÒNG THỦ
 * ==================================================================== */
U.theCT = function (st, p, b) {
  var lv = p.b[b.id] || 0, dangXay = G.capDangXay(p, b.id);
  var lvTiep = lv + dangXay + 1;
  var cost = G.giaXay(b, lvTiep);
  var thieuDK = G.thieuDK(st, p, b);
  var du = G.duTien(st, p, cost);
  var tg = G.tgXay(st, p, cost);
  var s = G.sanLuong(st, p);

  var h = '<div class="the' + (thieuDK.length ? ' tat' : '') + '">';
  h += '<span class="cap">cấp ' + lv + (dangXay ? ' (+' + dangXay + ')' : '') + '</span>';
  h += '<h4>' + U.esc(b.ten) + '</h4>';
  h += '<div class="mt">' + U.esc(b.mota) + '</div>';

  /* hiệu quả cấp tiếp theo */
  var ctx = { temp: p.temp, tech: st.tech };
  if (b.prod) {
    var a = b.prod(lv, ctx), c = b.prod(lv + 1, ctx), lines = [];
    for (var k in c) {
      var mo = (a[k] || 0), mo2 = c[k];
      var sp = (k === 'energy') ? 1 : G.C.TOC_DO_SERVER;
      lines.push((k === 'energy' ? 'Điện' : G.byId(G.RES, k).ten) + ': ' + G.so(mo * sp) + ' → <b>' + G.so(mo2 * sp) + '</b>');
    }
    h += '<div style="font-size:11.5px;margin-bottom:6px">' + lines.join('<br>') + '</div>';
  }
  if (b.cap) h += '<div style="font-size:11.5px;margin-bottom:6px">Dung tích: ' + G.so(b.cap(lv)) + ' → <b>' + G.so(b.cap(lv + 1)) + '</b></div>';
  if (b.id === 'robot' || b.id === 'nanite' || b.id === 'shipyard' || b.id === 'lab')
    h += '<div style="font-size:11.5px;margin-bottom:6px" class="mo">Cấp cao hơn = sản xuất nhanh hơn.</div>';
  if (b.id === 'fleetHQ') h += '<div style="font-size:11.5px;margin-bottom:6px">Khe hạm đội: ' + G.khe(st) + ' → <b>' + (G.khe(st) + 1) + '</b></div>';
  if (b.id === 'maintDepot') h += '<div style="font-size:11.5px;margin-bottom:6px">Giảm phí bảo trì: ' +
    Math.min(60, 6 * G.tongB(st, 'maintDepot')) + '% → <b>' + Math.min(60, 6 * (G.tongB(st, 'maintDepot') + 1)) + '%</b></div>';

  if (thieuDK.length) h += '<div class="dk">Cần: ' + U.esc(thieuDK.join(', ')) + '</div>';
  h += '<div class="gia">' + U.gia(cost, p, st) + '</div>';
  h += '<div class="ct"><button class="nut nho ' + (du && !thieuDK.length ? 'oke' : '') + '" data-act="xay" data-id="' + b.id +
    '"' + (thieuDK.length ? ' disabled' : '') + '>Xây cấp ' + lvTiep + '</button>' +
    '<span class="mo sz">' + G.tg(tg) + '</span></div>';
  h += '</div>';
  return h;
};

U.m_congtrinh = function () {
  var st = U.st(), p = U.ht();
  var nhom = [['kt', 'Khai thác'], ['nl', 'Năng lượng'], ['kho', 'Kho chứa'], ['cn', 'Công nghiệp &amp; hạ tầng']];
  var h = '<div class="panel"><h3>Ô đất: ' + G.oDaDung(p) + ' / ' + G.oToiDa(p) + ' — ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) +
    '</h3><div class="noi"><span class="mo">Mỗi loại công trình chiếm một ô đất. Hàng đợi tối đa 5 mục.</span></div></div>';
  for (var n = 0; n < nhom.length; n++) {
    h += '<div class="panel"><h3>' + nhom[n][1] + '</h3><div class="noi luoi">';
    for (var i = 0; i < G.BUILDINGS.length; i++) if (G.BUILDINGS[i].nhom === nhom[n][0]) h += U.theCT(st, p, G.BUILDINGS[i]);
    h += '</div></div>';
  }
  return h;
};

U.m_nghiencuu = function () {
  var st = U.st(), p = U.ht();
  var h = '<div class="panel"><h3>Phòng nghiên cứu cấp ' + (p.b.lab || 0) + '</h3><div class="noi">';
  h += '<p class="mo">Cơ chế nghiên cứu của Thiên Hà Đại Chiến: ngoài chi phí trả ngay, mỗi đề tài còn có ' +
    '<b>vốn đầu tư</b> bị trừ dần mỗi chu kỳ bảo trì 6 giờ. Hết Galana giữa kỳ là đề tài bị treo.</p>';
  if (st.ncQueue) {
    var q = st.ncQueue;
    h += '<div class="canh ' + (q.treo ? '' : 'ok') + '"><b>' + U.esc(G.R(q.id).ten) + ' → cấp ' + q.lv + '</b> — ' +
      (q.treo ? 'BỊ TREO vì thiếu vốn' : 'xong sau ' + U.dem(st.now + q.conLai)) +
      '. Vốn còn phải rót: ' + G.so(q.vonConLai) + ' Galana (' + G.so(q.vonMoiKy) + '/chu kỳ). ' +
      '<button class="nut nho xoa" data-act="huync">Huỷ</button></div>';
  }
  h += '</div></div>';

  h += '<div class="panel"><h3>Đề tài</h3><div class="noi luoi">';
  for (var i = 0; i < G.RESEARCH.length; i++) {
    var d = G.RESEARCH[i], lv = st.tech[d.id] || 0, lvT = lv + 1;
    var cost = G.giaXay(d, lvT), thieuDK = G.thieuDK(st, p, d), du = G.duTien(st, p, cost);
    var tg = G.tgNC(st, p, cost);
    var von = Math.round(((cost.metal || 0) + (cost.crystal || 0) + (cost.deut || 0)) * 0.15 + (cost.tech || 0) * 0.05);
    h += '<div class="the' + (thieuDK.length ? ' tat' : '') + '"><span class="cap">cấp ' + lv + '</span>' +
      '<h4>' + U.esc(d.ten) + '</h4><div class="mt">' + U.esc(d.mota) + '</div>';
    if (thieuDK.length) h += '<div class="dk">Cần: ' + U.esc(thieuDK.join(', ')) + '</div>';
    h += '<div class="gia">' + U.gia(cost, p, st) + '</div>';
    h += '<div style="font-size:11.5px;margin-bottom:6px" class="tim">Vốn đầu tư: ' + G.so(von) + ' Galana (trả dần theo chu kỳ)</div>';
    h += '<div class="ct"><button class="nut nho ' + (du && !thieuDK.length && !st.ncQueue ? 'oke' : '') +
      '" data-act="nc" data-id="' + d.id + '"' + (thieuDK.length || st.ncQueue ? ' disabled' : '') + '>Nghiên cứu cấp ' + lvT + '</button>' +
      '<span class="mo sz">' + G.tg(tg) + '</span></div></div>';
  }
  h += '</div></div>';
  return h;
};

U.theDonVi = function (st, p, u, loai) {
  var co = (loai === 'ship') ? (p.ships[u.id] || 0)
    : (loai === 'mis' ? (p.mis[u.id] || 0)
    : (loai === 'bo' ? ((p.linh || {})[u.id] || 0) : (p.def[u.id] || 0)));
  var dang = G.dangDong(p, u.id);
  var thieuDK = G.thieuDK(st, p, u), du = G.duTien(st, p, u.cost);
  var tg = G.tgTau(st, p, u.cost);
  var h = '<div class="the' + (thieuDK.length ? ' tat' : '') + '">';
  h += '<span class="cap">có ' + G.so(co) + (dang ? ' (+' + G.so(dang) + ')' : '') + '</span>';
  h += '<h4>' + U.esc(u.ten) + '</h4><div class="mt">' + U.esc(u.mota) + '</div>';
  if (loai === 'bo') {
    var w0 = 1 + 0.1 * (st.tech.weapon || 0), a0 = 1 + 0.1 * (st.tech.armor || 0);
    h += '<table style="font-size:11px;margin-bottom:6px">' +
      '<tr><td>Công</td><td class="r sz">' + G.so(u.atk * w0) + '</td><td>Vỏ</td><td class="r sz">' + G.so(u.hull * a0) + '</td></tr>' +
      '<tr><td>Chiếm chỗ</td><td class="r sz">' + u.cho + '</td><td>Lớp</td><td class="r">mặt đất</td></tr></table>';
  }
  if (loai !== 'mis' && loai !== 'bo') {
    var w = 1 + 0.1 * (st.tech.weapon || 0), sh = 1 + 0.1 * (st.tech.shield || 0), ar = 1 + 0.1 * (st.tech.armor || 0);
    h += '<table style="font-size:11px;margin-bottom:6px">' +
      '<tr><td>Công</td><td class="r sz">' + G.so(u.atk * w) + '</td><td>Khiên</td><td class="r sz">' + G.so(u.shield * sh) + '</td></tr>' +
      '<tr><td>Vỏ</td><td class="r sz">' + G.so(u.hull * ar) + '</td>' +
      (loai === 'ship'
        ? '<td>Tốc độ</td><td class="r sz">' + G.so(u.speed * G.bonusDC(st, u.dc)) + '</td></tr>' +
          '<tr><td>Khoang</td><td class="r sz">' + G.so(u.cargo) + '</td><td>Thủy thủ</td><td class="r sz">' + G.so(u.crew) + '</td></tr>'
        : '<td>Lớp</td><td class="r">' + (u.lop === 'quydao' ? 'quỹ đạo' : 'mặt đất') + '</td></tr>') +
      '</table>';
  }
  if (thieuDK.length) h += '<div class="dk">Cần: ' + U.esc(thieuDK.join(', ')) + '</div>';
  h += '<div class="gia">' + U.gia(u.cost, p, st) + '</div>';
  h += '<div class="ct"><input type="number" min="1" value="1" id="sl-' + u.id + '" style="width:80px">' +
    '<button class="nut nho ' + (du && !thieuDK.length ? 'oke' : '') + '" data-act="dong" data-id="' + u.id + '"' +
    (thieuDK.length ? ' disabled' : '') + '>Đóng</button><span class="mo sz">' + G.tg(tg) + '/chiếc</span></div>';
  h += '</div>';
  return h;
};

U.m_xuong = function () {
  var st = U.st(), p = U.ht();
  var h = '<div class="panel"><h3>Xưởng Đóng Tàu cấp ' + (p.b.shipyard || 0) + ' — ' + U.esc(p.ten) + '</h3><div class="noi">';
  h += '<b>Hạm đội đang đậu:</b> ' + U.dsTau(p.ships);
  h += '<br><span class="mo">Thủy thủ đoàn: ' + G.so(G.thuyThu(p.ships)) + ' người · khoang hàng tổng ' +
    G.so(G.khoangHang(p.ships)) + '</span></div></div>';
  h += '<div class="panel"><h3>Đóng tàu</h3><div class="noi luoi">';
  for (var i = 0; i < G.SHIPS.length; i++) h += U.theDonVi(st, p, G.SHIPS[i], 'ship');
  h += '</div></div>';

  h += '<div class="panel"><h3>Quân đổ bộ</h3><div class="noi">';
  h += '<p class="mo">Cơ chế đặc trưng của bản gốc: <b>phá vỡ quỹ đạo trước</b>, rồi Đại Chiến Hạm mới thả ' +
    'Robot và Tank xuống. Thắng dưới mặt đất thì <b>san phẳng công trình</b> của đối phương và vét thêm kho. ' +
    'Quân đổ bộ không đánh được trên quỹ đạo, nhưng đứng ở nhà thì chống được quân đổ bộ của địch.</p>';
  h += '<table style="font-size:12px;max-width:520px"><tr><th>Đang có</th><th class="r">Số lượng</th><th class="r">Chiếm chỗ</th></tr>';
  for (var b2 = 0; b2 < G.BOBINH.length; b2++) {
    var bb = G.BOBINH[b2];
    h += '<tr><td>' + U.esc(bb.ten) + '</td><td class="r sz">' + G.so((p.linh || {})[bb.id] || 0) +
      '</td><td class="r sz">' + bb.cho + ' chỗ/đơn vị</td></tr>';
  }
  h += '<tr><td>Tổng chỗ đang cần</td><td class="r sz">' + G.so(G.choLinhCan(p.linh || {})) +
    '</td><td class="r sz mo">hạm đội ở đây chở được ' + G.so(G.sucChoLinh(p.ships)) + '</td></tr></table>';
  h += '<div class="luoi" style="margin-top:10px">';
  for (var b3 = 0; b3 < G.BOBINH.length; b3++) h += U.theDonVi(st, p, G.BOBINH[b3], 'bo');
  h += '</div></div></div>';
  return h;
};

U.m_phongthu = function () {
  var st = U.st(), p = U.ht();
  var h = '<div class="panel"><h3>Phòng thủ hai lớp — ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) + '</h3><div class="noi">';
  h += '<p class="mo">Đặc trưng của Thiên Hà Đại Chiến: phòng thủ chia làm <b>lớp quỹ đạo</b> và <b>lớp mặt đất</b>. ' +
    'Lớp quỹ đạo giao chiến ngay từ vòng 1; hạm đội địch chỉ xuống tới tầng khí quyển và đụng phòng thủ mặt đất ' +
    'từ vòng ' + G.VONG_XUONG_DAT + '. Công sự bị phá có 70% cơ hội được sửa lại sau trận.</p>';
  h += '<b>Đang có:</b> ' + U.dsTau(p.def) + '<br><b>Tên lửa:</b> ' + U.dsTau(p.mis);
  h += '</div></div>';
  var nhom = [['quydao', 'Lớp quỹ đạo'], ['dat', 'Lớp mặt đất']];
  for (var n = 0; n < nhom.length; n++) {
    h += '<div class="panel"><h3>' + nhom[n][1] + '</h3><div class="noi luoi">';
    for (var i = 0; i < G.DEFENSES.length; i++) if (G.DEFENSES[i].lop === nhom[n][0]) h += U.theDonVi(st, p, G.DEFENSES[i], 'def');
    h += '</div></div>';
  }
  h += '<div class="panel"><h3>Tên lửa (hầm cấp ' + (p.b.missileSilo || 0) + ', chứa ' + ((p.b.missileSilo || 0) * 10) +
    ' đơn vị)</h3><div class="noi luoi">';
  for (var m = 0; m < G.MISSILES.length; m++) h += U.theDonVi(st, p, G.MISSILES[m], 'mis');
  h += '</div></div>';

  /* --- bắn tên lửa liên hành tinh --- */
  var tam = G.tamTenLua(st);
  h += '<div class="panel"><h3>Bắn tên lửa liên hành tinh</h3><div class="noi">';
  h += '<p class="mo">Tên lửa bay thẳng, không quay về, và chỉ phá <b>phòng thủ mặt đất</b> — lớp quỹ đạo ' +
    'không hề hấn gì. Bên bị bắn dùng Tên Lửa Đánh Chặn hạ 1 đổi 1. Tầm bắn = (cấp Động Cơ Xung × 5) − 1 hệ, ' +
    'chỉ trong cùng thiên hà.</p>';
  h += '<table style="font-size:12px;max-width:420px"><tr><td>Đang có</td><td class="r sz">' +
    G.so(p.mis.icbm || 0) + ' quả</td></tr>' +
    '<tr><td>Tầm bắn</td><td class="r sz ' + (tam ? '' : 'do') + '">' + tam + ' hệ ' +
    '<span class="mo">(Động Cơ Xung cấp ' + (st.tech.impulse || 0) + ')</span></td></tr>' +
    '<tr><td>Sát thương mỗi quả</td><td class="r sz">' +
    G.so(G.C.SAT_THUONG_ICBM * (1 + 0.1 * (st.tech.weapon || 0))) + '</td></tr>' +
    '<tr><td>Đánh chặn của ta</td><td class="r sz">' + G.so(p.mis.interceptor || 0) + ' quả</td></tr></table>';
  if (p.mis.icbm) {
    h += '<div class="hd-td" style="margin-top:8px">Mục tiêu ' +
      '<input id="tl-g" type="number" min="1" max="' + G.C.SO_THIEN_HA + '" value="' + p.c.g + '" readonly title="chỉ bắn được trong cùng thiên hà">:' +
      '<input id="tl-h" type="number" min="1" max="' + G.C.SO_HE + '" value="' + p.c.h + '">:' +
      '<input id="tl-p" type="number" min="1" max="' + G.C.SO_HANH_TINH + '" value="1">' +
      ' Số quả <input id="tl-n" type="number" min="1" max="' + (p.mis.icbm || 1) + '" value="' + (p.mis.icbm || 1) + '" style="width:70px">' +
      ' <button class="nut xoa" data-act="ban-ten-lua">PHÓNG</button></div>';
  } else {
    h += '<p class="do">Chưa có quả nào — đóng Tên Lửa Liên Hành Tinh ở trên (cần Hầm Tên Lửa cấp 4).</p>';
  }
  if (st.tenLua && st.tenLua.length) {
    h += '<div class="bang-cuon" style="margin-top:10px"><table><tr><th>Loạt</th><th>Từ</th><th>Tới</th><th class="r">Số quả</th><th>Nổ sau</th></tr>';
    for (var z = 0; z < st.tenLua.length; z++) {
      var q3 = st.tenLua[z];
      h += '<tr><td class="sz">#' + q3.id + '</td><td class="sz">' + G.tdStr(q3.tu) + '</td><td class="sz">' +
        G.tdStr(q3.den) + '</td><td class="r sz">' + G.so(q3.n) + '</td><td class="sz cam">' + U.dem(q3.khi) + '</td></tr>';
    }
    h += '</table></div>';
  }
  h += '</div></div>';
  return h;
};

/* ======================================================================
 * MÀN: HẠM ĐỘI
 * ==================================================================== */
U.formMoi = function () {
  var p = U.ht();
  return { den: { g: p.c.g, h: p.c.h, p: p.c.p }, mission: 'attack', pct: 100, ships: {}, linh: {}, cargo: {}, giu: 1 };
};
U.capNhatForm = function () {
  var f = U.form; if (!f) return;
  var g = document.getElementById('f-g'), h = document.getElementById('f-h'), pp = document.getElementById('f-p');
  if (g) f.den = { g: +g.value || 1, h: +h.value || 1, p: +pp.value || 1 };
  var ms = document.getElementById('f-mission'); if (ms) f.mission = ms.value;
  var pc = document.getElementById('f-pct'); if (pc) f.pct = +pc.value || 100;
  var gi = document.getElementById('f-giu'); if (gi) f.giu = Math.max(1, +gi.value || 1);
  var i, el;
  for (i = 0; i < G.SHIPS.length; i++) {
    el = document.getElementById('ft-' + G.SHIPS[i].id);
    if (el) { var n = Math.max(0, Math.floor(+el.value || 0)); if (n) f.ships[G.SHIPS[i].id] = n; else delete f.ships[G.SHIPS[i].id]; }
  }
  if (!f.linh) f.linh = {};
  for (i = 0; i < G.BOBINH.length; i++) {
    el = document.getElementById('fl-' + G.BOBINH[i].id);
    if (el) { var nb = Math.max(0, Math.floor(+el.value || 0)); if (nb) f.linh[G.BOBINH[i].id] = nb; else delete f.linh[G.BOBINH[i].id]; }
  }
  for (i = 0; i < G.RES_HANH_TINH.length; i++) {
    el = document.getElementById('fc-' + G.RES_HANH_TINH[i]);
    if (el) { var v = Math.max(0, Math.floor(+el.value || 0)); if (v) f.cargo[G.RES_HANH_TINH[i]] = v; else delete f.cargo[G.RES_HANH_TINH[i]]; }
  }
};
U.ttBay = function () {
  var st = U.st(), p = U.ht(), f = U.form;
  if (G.trong(f.ships)) return '<span class="mo">Chọn ít nhất một tàu để xem thông số chuyến bay.</span>';
  var kc = G.khoangCach(p.c, f.den);
  var tg = G.tgBay(st, f.ships, kc, f.pct);
  var nl = G.nhienLieu(st, f.ships, kc, f.pct);
  var suc = G.khoangHang(f.ships);
  var hang = 0; for (var k in f.cargo) hang += f.cargo[k];
  return '<table style="font-size:12px"><tr>' +
    '<td>Khoảng cách</td><td class="r sz">' + G.so(kc) + '</td>' +
    '<td>Tốc độ hạm đội</td><td class="r sz">' + G.so(G.tocDoHam(st, f.ships)) + '</td></tr>' +
    '<tr><td>Thời gian bay</td><td class="r sz cam">' + G.tg(tg) + '</td>' +
    '<td>Cả đi lẫn về</td><td class="r sz">' + G.tg(tg * 2) + '</td></tr>' +
    '<tr><td>Nhiên liệu</td><td class="r sz ' + ((p.res.deut || 0) < nl ? 'do' : 'luc') + '">' + G.so(nl) + ' DT</td>' +
    '<td>Khoang hàng</td><td class="r sz ' + (hang > suc ? 'do' : '') + '">' + G.so(hang) + ' / ' + G.so(suc) + '</td></tr>' +
    '<tr><td>Thủy thủ đoàn</td><td class="r sz">' + G.so(G.thuyThu(f.ships)) + '</td>' +
    '<td>Khe hạm đội</td><td class="r sz">' + st.fleets.length + ' / ' + G.khe(st) + '</td></tr>' +
    (G.trong(f.linh || {}) ? '' :
      '<tr><td>Quân đổ bộ</td><td class="r sz">' + G.so(G.choLinhCan(f.linh)) + ' chỗ</td>' +
      '<td>Hạm đội chở được</td><td class="r sz ' + (G.choLinhCan(f.linh) > G.sucChoLinh(f.ships) ? 'do' : 'luc') + '">' +
      G.so(G.sucChoLinh(f.ships)) + '</td></tr>') +
    '</table>';
};

U.m_hamdoi = function () {
  var st = U.st(), p = U.ht();
  if (!U.form) U.form = U.formMoi();
  var f = U.form, i, h = '';

  h += '<div class="panel"><h3>Hạm đội đang hoạt động (' + st.fleets.length + '/' + G.khe(st) + ')</h3><div class="noi">';
  if (!st.fleets.length) h += '<span class="mo">Không có hạm đội nào đang bay.</span>';
  else {
    h += '<div class="bang-cuon"><table><tr><th>#</th><th>Nhiệm vụ</th><th>Hạm đội</th><th>Từ → Tới</th><th>Còn</th><th>Hàng</th><th></th></tr>';
    for (i = 0; i < st.fleets.length; i++) {
      var fl = st.fleets[i];
      h += '<tr><td class="sz">' + fl.id + '</td><td>' + U.esc(G.byId(G.MISSIONS, fl.mission).ten) +
        (fl.pha === 've' ? ' <span class="mo">(đang về)</span>' : (fl.dangGiu ? ' <span class="mo">(đang giữ chỗ)</span>' : '')) +
        (fl.doiHuong ? ' <span class="vang">↷' + fl.doiHuong + '</span>' : '') + '</td>' +
        '<td style="font-size:11.5px">' + U.dsTau(fl.ships) + '</td>' +
        '<td class="sz">' + G.tdStr(fl.tu) + ' → ' + G.tdStr(fl.den) + '</td>' +
        '<td class="sz">' + U.dem(fl.pha === 've' ? fl.ve_t : fl.den_t) + '</td>' +
        '<td style="font-size:11.5px">' + U.dsRes(fl.cargo) + '</td>' +
        '<td class="r" style="white-space:nowrap">' +
        (fl.pha === 'di' ? '<button class="nut nho" data-act="doihuong" data-fid="' + fl.id + '">Đổi mục tiêu</button> ' : '') +
        (fl.pha === 'di' ? '<button class="nut nho xoa" data-act="goive" data-fid="' + fl.id + '">Gọi về</button>' : '') +
        '</td></tr>';
    }
    h += '</table></div>';
    h += '<p class="mo" style="margin:8px 0 0">Đổi mục tiêu giữa đường là cơ chế riêng của Thiên Hà Đại Chiến: ' +
      'mất ' + G.C.DOI_MUC_TIEU_GALANA + ' Galana cộng phí nhiên liệu phụ trội, thời gian bay tính lại từ vị trí hiện tại.</p>';
  }
  h += '</div></div>';

  var pvToi = st.pvpToi || [];
  if (st.toi.length || pvToi.length) {
    h += '<div class="panel"><h3>Hạm đội đang bay tới hành tinh của ta</h3><div class="noi bang-cuon"><table>' +
      '<tr><th>Chỉ huy</th><th>Từ</th><th>Nhiệm vụ</th><th>Tới</th><th>Còn</th></tr>';
    for (i = 0; i < st.toi.length; i++) {
      var w = st.toi[i], pt = st.planets[w.pi] || st.planets[0];
      h += '<tr><td>' + U.esc(w.ten) + ' <span class="tag-lm">' + U.esc(w.lm || '') + '</span> <span class="mo">(NPC)</span></td>' +
        '<td class="sz">' + G.tdStr(w.tu) + '</td><td class="do">Tấn Công</td><td>' + U.esc(pt.ten) + ' ' + G.tdStr(pt.c) +
        '</td><td class="sz do">' + U.dem(w.den_t) + '</td></tr>';
    }
    for (i = 0; i < pvToi.length; i++) {
      var q2 = pvToi[i], p2 = U.htTheoKey(q2.den);
      h += '<tr><td><b class="cam">' + U.esc(q2.ten) + '</b> <span class="tag-lm">' + U.esc(q2.lm || '') + '</span></td>' +
        '<td class="sz">[' + U.esc(q2.tu) + ']</td><td class="' + (q2.nv === 'attack' ? 'do' : 'luc') + '">' +
        (q2.nv === 'attack' ? 'Tấn Công' : 'Vận Chuyển') + '</td><td>' +
        U.esc(p2 ? p2.ten : '') + ' [' + U.esc(q2.den) + ']</td><td class="sz do">' + U.dem(q2.den_t) + '</td></tr>';
    }
    h += '</table><p class="mo">Hạm đội đang bay thì không bao giờ bị bắn hạ — nếu không đỡ được, hãy cho hạm đội của mình ' +
      'bay đi trước khi địch tới (nhiệm vụ Giữ Chỗ hoặc Vận Chuyển sang hành tinh khác). ' +
      'Muốn biết địch mang những gì thì phải gửi tàu do thám. Nhiệm vụ do thám của đối phương thì không hiện ở đây.</p>' +
      '</div></div>';
  }

  /* --- form điều hạm --- */
  h += '<div class="panel"><h3>Điều hạm đội từ ' + U.esc(p.ten) + ' ' + G.tdStr(p.c) + '</h3><div class="noi">';
  h += '<div class="luoi2"><div>';
  h += '<div style="margin-bottom:8px"><b>Mục tiêu</b><div class="hd-td" style="margin-top:4px">' +
    '<input id="f-g" type="number" min="1" max="' + G.C.SO_THIEN_HA + '" value="' + f.den.g + '">:' +
    '<input id="f-h" type="number" min="1" max="' + G.C.SO_HE + '" value="' + f.den.h + '">:' +
    '<input id="f-p" type="number" min="1" max="' + G.C.O_THAM_HIEM + '" value="' + f.den.p + '">' +
    '<button class="nut nho" data-act="gal-tu-form">Xem hệ này</button></div></div>';
  h += '<div style="margin-bottom:8px"><b>Nhiệm vụ</b><br><select id="f-mission" style="margin-top:4px;width:100%">';
  for (i = 0; i < G.MISSIONS.length; i++)
    h += '<option value="' + G.MISSIONS[i].id + '"' + (f.mission === G.MISSIONS[i].id ? ' selected' : '') + '>' +
      G.MISSIONS[i].ten + '</option>';
  h += '</select><div class="mo" style="font-size:11.5px;margin-top:3px">' +
    U.esc(G.byId(G.MISSIONS, f.mission).mota) + '</div></div>';
  h += '<div style="margin-bottom:8px"><b>Tốc độ: <span id="f-pct-v">' + f.pct + '%</span></b><br>' +
    '<input id="f-pct" type="range" min="10" max="100" step="10" value="' + f.pct + '" style="width:100%"></div>';
  if (f.mission === 'hold')
    h += '<div style="margin-bottom:8px"><b>Giữ chỗ (giờ)</b><br><input id="f-giu" type="number" min="1" max="24" value="' + f.giu + '"></div>';
  h += '<div id="hd-tt">' + U.ttBay() + '</div>';
  h += '<button class="nut lon" data-act="gui" style="margin-top:10px">PHÁT LỆNH XUẤT KÍCH</button>';
  h += '</div><div>';

  h += '<b>Chọn tàu</b><div class="hd-luoi" style="margin-top:6px">';
  var coTau = false;
  for (i = 0; i < G.SHIPS.length; i++) {
    var s = G.SHIPS[i], co = p.ships[s.id] || 0;
    if (!co) continue;
    coTau = true;
    h += '<div class="hd-tau"><span>' + U.esc(s.ten) + '<br><span class="mo sz">có ' + G.so(co) + '</span></span>' +
      '<span><input id="ft-' + s.id + '" type="number" min="0" max="' + co + '" value="' + (f.ships[s.id] || 0) + '">' +
      '<button class="nut nho" data-act="max-tau" data-id="' + s.id + '">Tất cả</button></span></div>';
  }
  if (!coTau) h += '<span class="mo">Chưa có tàu nào ở hành tinh này.</span>';
  h += '</div>';

  var choCo = G.sucChoLinh(f.ships), choCan = G.choLinhCan(f.linh || {});
  if (['attack', 'deploy', 'transport'].indexOf(f.mission) >= 0 && !G.trong(p.linh || {})) {
    h += '<b style="display:block;margin-top:10px">Quân đổ bộ ' +
      '<span class="' + (choCan > choCo ? 'do' : 'mo') + ' sz">(' + G.so(choCan) + ' / ' + G.so(choCo) + ' chỗ)</span></b>' +
      '<div class="hd-luoi" style="margin-top:6px">';
    for (i = 0; i < G.BOBINH.length; i++) {
      var bb2 = G.BOBINH[i], coBB = (p.linh || {})[bb2.id] || 0;
      if (!coBB) continue;
      h += '<div class="hd-tau"><span>' + U.esc(bb2.ten) + '<br><span class="mo sz">có ' + G.so(coBB) +
        ' · ' + bb2.cho + ' chỗ</span></span>' +
        '<span><input id="fl-' + bb2.id + '" type="number" min="0" max="' + coBB + '" value="' +
        ((f.linh || {})[bb2.id] || 0) + '">' +
        '<button class="nut nho" data-act="max-linh" data-id="' + bb2.id + '">Tất cả</button></span></div>';
    }
    h += '</div>';
  }
  h += '<b style="display:block;margin-top:10px">Xếp hàng lên tàu</b><div class="hd-luoi" style="margin-top:6px">';
  for (i = 0; i < G.RES_HANH_TINH.length; i++) {
    var rid = G.RES_HANH_TINH[i], rr = G.byId(G.RES, rid);
    h += '<div class="hd-tau"><span style="color:' + rr.mau + '">' + rr.ten + '<br><span class="mo sz">' +
      G.so(p.res[rid] || 0) + '</span></span><input id="fc-' + rid + '" type="number" min="0" step="1000" value="' +
      (f.cargo[rid] || 0) + '"></div>';
  }
  h += '</div><button class="nut nho" data-act="max-hang" style="margin-top:6px">Xếp đầy khoang</button>';
  h += '</div></div></div></div>';
  return h;
};

/* ======================================================================
 * MÀN: THIÊN HÀ
 * ==================================================================== */
U.m_thienha = function () {
  var st = U.st(), p = U.ht();
  if (!U.gal) U.gal = { g: p.c.g, h: p.c.h };
  var g = U.gal.g, hh = U.gal.h;
  var ds = U.nguon.xemHe(g, hh);
  var d = G.diem(st);

  var h = '<div class="panel"><h3>Bản đồ thiên hà</h3><div class="noi">';
  h += '<div class="gal-dh">' +
    '<button class="nut nho" data-act="gal" data-dg="-1">◀ Thiên hà</button>' +
    'Thiên hà <input id="g-g" type="number" min="1" max="' + G.C.SO_THIEN_HA + '" value="' + g + '" style="width:60px">' +
    '<button class="nut nho" data-act="gal" data-dg="1">▶</button>' +
    '<button class="nut nho" data-act="gal" data-dh="-1">◀ Hệ</button>' +
    'Hệ <input id="g-h" type="number" min="1" max="' + G.C.SO_HE + '" value="' + hh + '" style="width:76px">' +
    '<button class="nut nho" data-act="gal" data-dh="1">▶</button>' +
    '<button class="nut nho oke" data-act="gal-di">Đi</button>' +
    '<button class="nut nho" data-act="gal-nha">Về hành tinh mẹ</button>' +
    '</div>';
  h += '<div class="bang-cuon"><table><tr><th>Ô</th><th>Hành tinh</th><th>Chỉ huy</th><th>Liên minh</th>' +
    '<th class="r">Điểm</th><th>Phế liệu</th><th>Hành động</th></tr>';
  for (var i = 0; i < ds.length; i++) {
    var o = ds[i], c = o.c;
    var cls = '';
    if (o.loai === 'trong' || o.loai === 'sau') cls = 'trong';
    else if (o.loai === 'toi') cls = 'toi';
    else if (o.loai === 'nguoi') cls = 'nguoi';
    else if (o.npc && o.npc.bo) cls = 'npc-bo';
    h += '<tr class="' + cls + '"><td class="sz">' + (o.loai === 'sau' ? '<span class="tim">' + c.p + '</span>' : c.p) + '</td>';
    if (o.loai === 'sau') {
      h += '<td class="tim">— vùng không gian sâu —</td><td class="mo">chỉ nhận nhiệm vụ Thám Hiểm</td><td></td><td class="r"></td>';
    } else if (o.loai === 'trong') {
      var Lt = G.LHT(G.loaiTheoViTri(st.seed, c));
      h += '<td class="mo">— trống — <span style="color:' + Lt.mau + '">' + U.esc(Lt.ten) + '</span></td><td></td><td></td><td class="r"></td>';
    } else if (o.loai === 'toi') {
      h += '<td><b>' + U.esc(o.p.ten) + '</b></td><td class="luc">' + U.esc(st.ten) + ' (ta)</td><td class="tag-lm">' +
        U.esc(st.lm ? st.lm.ten : '') + '</td><td class="r sz">' + G.so(d.tong) + '</td>';
    } else if (o.loai === 'nguoi') {
      h += '<td>' + U.esc(o.htTen) + '</td><td class="cam"><b>' + U.esc(o.ten) + '</b>' +
        (o.online ? ' <span class="luc" title="đang chơi">●</span>' : '') +
        (o.bo ? ' <span class="vang">(lâu không vào)</span>' : '') +
        '</td><td class="tag-lm">' + U.esc(o.lm || '') + '</td><td class="r sz">' + G.so(o.diem) + '</td>';
    } else {
      var n = o.npc;
      var Ln = G.LHT(G.loaiTheoViTri(st.seed, c));
      h += '<td>' + U.esc(n.htTen) + ' <span class="mo" style="color:' + Ln.mau + '">' + U.esc(Ln.ten) + '</span></td><td>' +
        U.esc(n.ten) + (n.bo ? ' <span class="vang">(bỏ hoang)</span>' : '') +
        '</td><td class="tag-lm">' + U.esc(n.lm) + '</td><td class="r sz">' + G.so(n.diem) + '</td>';
    }
    h += '<td class="pl">' + (o.debris ? G.soNgan(o.debris.metal) + ' KL / ' + G.soNgan(o.debris.crystal) + ' TT' : '') + '</td>';
    h += '<td style="white-space:nowrap">';
    var td = c.g + ',' + c.h + ',' + c.p;
    if (o.loai === 'npc' || o.loai === 'nguoi') {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="spy">Do thám</button> ' +
        '<button class="nut nho xoa" data-act="nv" data-td="' + td + '" data-m="attack">Tấn công</button> ';
      if (st.spy && st.spy[o.key]) h += '<button class="nut nho" data-act="xem-tt" data-key="' + o.key + '">Tin tình báo</button> ';
    } else if (o.loai === 'sau') {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="thamhiem">Thám hiểm</button> ';
    } else if (o.loai === 'trong') {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="colonize">Thực dân</button> ';
    } else {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="transport">Vận chuyển</button> ';
    }
    if (o.loai === 'nguoi') {
      h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="transport">Tiếp tế</button> ';
      if (APP.mp) h += '<button class="nut nho" data-act="gui-thu" data-ten="' + U.esc(o.ten) + '">Gửi thư</button> ';
    }
    if (o.debris) h += '<button class="nut nho" data-act="nv" data-td="' + td + '" data-m="recycle">Thu hồi</button>';
    h += '</td></tr>';
  }
  h += '</table></div>';
  h += '<p class="mo">Vũ trụ có ' + G.C.SO_THIEN_HA + ' thiên hà × ' + G.C.SO_HE + ' hệ × ' + G.C.SO_HANH_TINH +
    ' hành tinh, sinh tất định từ hạt giống <b>' + U.esc(st.seed) + '</b>. ' +
    (APP.mp ? 'Ô màu <span class="cam">cam</span> là hành tinh của người chơi khác — đánh nhau với họ là thật, và họ đánh lại được. '
            : 'Hành tinh <span class="vang">bỏ hoang</span> ít phòng thủ nhưng nhiều tài nguyên.') + '</p>';
  h += '</div></div>';
  return h;
};

/* ======================================================================
 * MÀN: LIÊN MINH / XẾP HẠNG
 * ==================================================================== */
U.m_lienminh = function () {
  var st = U.st();
  var h = '<div class="panel"><h3>Liên minh</h3><div class="noi">';
  if (st.lm) {
    h += '<h2>' + U.esc(st.lm.ten) + '</h2>';
    h += '<p>Gia nhập ngày ' + G.gio(st.lm.t * 1000) + '. Quyền lợi: <b>+5% sản lượng</b> toàn đế quốc, ' +
      'chia sẻ tin tình báo, và được đứng tên liên minh trên bảng xếp hạng.</p>';
    if (U.nguon.thanhVien) {
      var tv = U.nguon.thanhVien(st.lm.ten);
      if (tv && tv.length) {
        h += '<div class="bang-cuon"><table><tr><th>Thành viên</th><th class="r">Điểm</th><th class="r">Hành tinh</th></tr>';
        for (var t = 0; t < tv.length; t++)
          h += '<tr' + (tv[t].ta ? ' class="toi"' : '') + '><td>' + U.esc(tv[t].ten) + (tv[t].ta ? ' <b class="luc">(ta)</b>' : '') +
            '</td><td class="r sz">' + G.so(tv[t].diem) + '</td><td class="r sz">' + tv[t].ht + '</td></tr>';
        h += '</table></div>';
      }
    }
    h += '<button class="nut xoa" data-act="lm-ra" style="margin-top:8px">Rời liên minh</button>';
  } else {
    h += '<p class="mo">Bản gốc có hệ thống liên minh với bộ máy điều hành. Bản phục dựng giữ lại phần cốt: ' +
      'gia nhập một liên minh để nhận <b>+5% sản lượng</b> và danh nghĩa trên bảng xếp hạng.</p>';
    var ds = U.nguon.dsLM();
    h += '<div class="bang-cuon"><table><tr><th>Liên minh</th><th class="r">Thành viên</th><th class="r">Tổng điểm</th><th></th></tr>';
    for (var i = 0; i < ds.length; i++) {
      var e = ds[i];
      var sl = e.sl, dm = e.diem;
      if (sl === undefined) {
        sl = 0; dm = 0;
        var xh = U.nguon.xepHang();
        for (var j = 0; j < xh.length; j++) if (xh[j].lm === e.ten) { sl++; dm += xh[j].diem; }
      }
      h += '<tr><td class="tag-lm">' + U.esc(e.ten) + '</td><td class="r sz">' + G.so(sl) + '</td><td class="r sz">' + G.so(dm) +
        '</td><td class="r"><button class="nut nho oke" data-act="lm-vao" data-ten="' + U.esc(e.ten) + '">Xin vào</button></td></tr>';
    }
    h += '</table></div>';
  }
  h += '</div></div>';
  return h;
};

U.XH_LOAI = [
  { id: 'tong', ten: 'Tổng điểm' },
  { id: 'ct', ten: 'Công trình' },
  { id: 'nc', ten: 'Nghiên cứu' },
  { id: 'ham', ten: 'Hạm đội' },
  { id: 'thu', ten: 'Phòng thủ' }
];
U.xhLoai = 'tong';

U.m_xephang = function () {
  var st = U.st(), xh = U.nguon.xepHang(U.xhLoai) || [];
  var h = '<div class="panel"><h3>Bảng xếp hạng vũ trụ</h3><div class="noi">';
  h += '<div class="gal-dh">Xếp theo: ';
  for (var t = 0; t < U.XH_LOAI.length; t++) {
    var L = U.XH_LOAI[t];
    h += '<button class="nut nho ' + (U.xhLoai === L.id ? 'oke' : '') + '" data-act="xh-loai" data-loai="' + L.id + '">' +
      L.ten + '</button>';
  }
  h += '</div>';
  var ta = null;
  for (var z = 0; z < xh.length; z++) if (xh[z].ta) ta = xh[z];
  if (ta) h += '<p>Ta đang đứng <b class="cam">hạng ' + ta.hang + '</b> / ' + xh.length +
    ' ở hạng mục <b>' + U.esc(G.byId(U.XH_LOAI, U.xhLoai).ten) + '</b>.</p>';
  h += '<div class="bang-cuon"><table><tr><th class="r">Hạng</th><th>Chỉ huy</th><th>Liên minh</th>' +
    '<th class="r">Điểm</th><th class="r">Tổng</th><th class="r">Hành tinh</th></tr>';
  for (var i = 0; i < xh.length; i++) {
    var e = xh[i];
    h += '<tr' + (e.ta ? ' class="toi"' : '') + '><td class="r sz">' + e.hang + '</td><td>' +
      U.esc(e.ten) + (e.ta ? ' <b class="luc">(ta)</b>' : '') + '</td><td class="tag-lm">' + U.esc(e.lm) +
      '</td><td class="r sz"><b>' + G.so(e.diem) + '</b></td><td class="r sz mo">' + G.so(e.tong === undefined ? e.diem : e.tong) +
      '</td><td class="r sz">' + e.ht + '</td></tr>';
  }
  h += '</table></div>';
  if (!xh.length) h += '<span class="mo">Chưa có dữ liệu xếp hạng.</span>';
  h += '</div></div>';
  void st;
  return h;
};

/* ======================================================================
 * MÀN: TIN NHẮN (kèm báo cáo chiến đấu / tình báo)
 * ==================================================================== */
U.veBaoCao = function (d) {
  var kq = d.kq, h = '<div class="bc">';
  var nhan = { thang: 'BÊN TẤN CÔNG THẮNG', thua: 'BÊN PHÒNG THỦ THẮNG', hoa: 'HAI BÊN CẦM CỰ — KHÔNG PHÂN THẮNG BẠI', huyDiet: 'CẢ HAI BÊN BỊ XOÁ SỔ' };
  var taThang = (d.ben === 'ta' && kq.kq === 'thang') || (d.ben === 'dich' && (kq.kq === 'thua' || kq.kq === 'huyDiet'));
  h += '<div class="kq ' + (taThang ? 'thang' : (kq.kq === 'hoa' ? 'hoa' : 'thua')) + '"><b>' + nhan[kq.kq] + '</b><br>' +
    'Tấn công: ' + U.esc(kq.tenA) + ' &nbsp;·&nbsp; Phòng thủ: ' + U.esc(kq.tenD) + ' &nbsp;·&nbsp; Toạ độ ' + G.tdStr(d.td) +
    (kq.loaiHT ? ' &nbsp;·&nbsp; hành tinh <b>' + U.esc(kq.loaiHT) + '</b>' +
      (kq.thuDat && kq.thuDat !== 1 ? ' <span class="mo">(phòng thủ mặt đất ×' + kq.thuDat + ')</span>' : '') : '') +
    '</div>';

  h += '<table><tr><th>Vòng</th><th class="r">Lực tấn công</th><th class="r">Lực phòng thủ</th><th class="r">Đơn vị còn (A)</th><th class="r">Đơn vị còn (D)</th><th>Ghi chú</th></tr>';
  for (var i = 0; i < kq.vongDanh.length; i++) {
    var v = kq.vongDanh[i];
    h += '<tr><td class="c">' + v.vong + '</td><td class="r sz">' + G.soNgan(v.lucA) + '</td><td class="r sz">' + G.soNgan(v.lucD) +
      '</td><td class="r sz">' + G.so(v.conA) + '</td><td class="r sz">' + G.so(v.conD) + '</td><td class="mo">' +
      (v.haDoCao ? 'lớp quỹ đạo đã bị dẹp — hạm đội hạ độ cao'
        : (v.matDat ? 'hạm đội đã xuống tầng khí quyển — phòng thủ mặt đất tham chiến' : 'giao chiến trên quỹ đạo')) + '</td></tr>';
  }
  h += '</table>';

  h += '<div class="luoi"><div><b>Bên tấn công mất</b><br>' + U.dsTau(kq.matA) +
    '<br><b>Còn lại</b><br>' + U.dsTau(kq.conShipsA) + '</div>';
  h += '<div><b>Bên phòng thủ mất</b><br>' + U.dsTau(kq.matD) +
    '<br><b>Còn lại</b><br>' + U.dsTau(kq.conShipsD) + ' ' + U.dsTau(kq.conDefD);
  if (kq.matDPha && !G.trong(kq.matDPha))
    h += '<br><span class="mo">Công sự bị phá trong trận: ' + U.dsTau(kq.matDPha) +
      ' — ' + Math.round(G.C.SUA_CONG_SU * 100) + '% trong số đó được dựng lại sau trận.</span>';
  h += '</div></div>';

  if (d.doBo) {
    var db = d.doBo, kb = db.kq;
    h += '<div class="kq ' + (db.thang ? (d.ben === 'ta' ? 'thang' : 'thua') : (d.ben === 'ta' ? 'thua' : 'thang')) + '">' +
      '<b>PHA ĐỔ BỘ — ' + (db.thang ? 'QUÂN ĐỔ BỘ LÀM CHỦ MẶT ĐẤT' : 'CUỘC ĐỔ BỘ BỊ ĐẨY LÙI') + '</b>' +
      '<br><span class="mo">Quỹ đạo vỡ rồi, Đại Chiến Hạm mới thả quân xuống.</span></div>';
    h += '<div class="luoi"><div><b>Quân đổ bộ mất</b><br>' + U.dsTau(kb.matA) +
      '<br><b>Còn lại</b><br>' + U.dsTau(kb.conBoA) + '</div>' +
      '<div><b>Bên giữ đất mất</b><br>' + U.dsTau(kb.matD) +
      '<br><b>Còn lại</b><br>' + U.dsTau(kb.conBoD) + ' ' + U.dsTau(kb.conDefD) + '</div></div>';
    if (db.phaCT && db.phaCT.soCap)
      h += '<p><b class="do">Công trình bị san phẳng:</b> ' + U.esc(G.moTaPhaCT(db.phaCT.pha)) +
        ' <span class="mo">(tổng ' + db.phaCT.soCap + ' cấp' +
        (db.phaCT.chamTran ? ', đã chạm trần ' + Math.round(G.C.PHA_CT_TOI_DA * 100) + '% mỗi trận' : '') + ')</span></p>';
    else if (db.thang)
      h += '<p class="mo">Làm chủ mặt đất nhưng không đủ sức phá cấp công trình nào — cần nhiều Robot/Tank hơn.</p>';
  }
  h += '<p><b>Cướp được:</b> ' + U.dsRes(d.cuop) + '<br>' +
    '<b>Bãi phế liệu tạo ra:</b> ' + G.so(d.pl.metal) + ' Kim Loại, ' + G.so(d.pl.crystal) + ' Tinh Thể ' +
    '<span class="mo">(dùng Tàu Thu Hồi để vét)</span></p>';
  h += '</div>';
  return h;
};

U.veDoTham = function (bc) {
  var h = '<div class="bc">';
  h += '<p><b>' + U.esc(bc.ten) + '</b> ' + (bc.lm ? '<span class="tag-lm">' + U.esc(bc.lm) + '</span>' : '') +
    ' — hành tinh <b>' + U.esc(bc.ht) + '</b> ' + G.tdStr(bc.td) +
    '<br>Điểm: <span class="sz">' + G.so(bc.diem) + '</span>' + (bc.bo ? ' <span class="vang">· bỏ hoang</span>' : '') +
    '<br><span class="mo">Độ chi tiết báo cáo: mức ' + bc.mucDo + '/5' +
    (bc.mat ? ' · mất ' + bc.mat + ' tàu do thám vì bị phản tình báo' : '') + '</span></p>';
  h += '<b>Tài nguyên</b><br>' + U.dsRes(bc.res) + '<br><br>';
  h += '<b>Hạm đội</b><br>' + (bc.ships ? U.dsTau(bc.ships) : '<span class="mo">không đủ cấp Công Nghệ Tình Báo để thấy</span>') + '<br><br>';
  h += '<b>Phòng thủ</b><br>' + (bc.def ? U.dsTau(bc.def) : '<span class="mo">không đủ cấp Công Nghệ Tình Báo để thấy</span>') + '<br><br>';
  h += '<b>Công nghệ</b><br>';
  if (bc.tech) {
    var out = [];
    for (var k in bc.tech) { var r = G.R(k); out.push((r ? r.ten : k) + ' cấp ' + bc.tech[k]); }
    h += out.join(', ');
  } else h += '<span class="mo">không đủ cấp Công Nghệ Tình Báo để thấy</span>';
  h += '<p class="mo">Báo cáo lúc ' + G.gio(bc.t * 1000) + '. Càng gửi nhiều tàu do thám và cấp Công Nghệ Tình Báo càng cao thì càng thấy nhiều.</p>';
  h += '</div>';
  return h;
};

U.veBaoCaoTenLua = function (d) {
  var t = d.tl, h = '<div class="bc">';
  var taBan = d.ben === 'ta';
  var soPha = 0, k;
  for (k in t.pha) soPha += t.pha[k];
  h += '<div class="kq ' + (taBan ? (soPha ? 'thang' : 'hoa') : (soPha ? 'thua' : 'thang')) + '"><b>' +
    (taBan ? 'TA BẮN ' + G.so(d.soBan) + ' TÊN LỬA VÀO ' + U.esc(d.ten)
           : U.esc(d.ten) + ' BẮN ' + G.so(d.soBan) + ' TÊN LỬA VÀO TA') +
    '</b><br>Toạ độ ' + G.tdStr(d.td) + '</div>';
  h += '<table><tr><td>Số quả phóng đi</td><td class="r sz">' + G.so(d.soBan) + '</td></tr>' +
    '<tr><td>Bị Tên Lửa Đánh Chặn hạ</td><td class="r sz ' + (t.chan ? 'luc' : '') + '">' + G.so(t.chan) + '</td></tr>' +
    '<tr><td>Nổ trúng mục tiêu</td><td class="r sz">' + G.so(t.no) + '</td></tr></table>';
  h += '<p><b>Phòng thủ mặt đất bị phá:</b> ' + U.esc(G.moTaPha(t.pha)) + '</p>';
  h += '<p class="mo">Tên lửa không đụng tới lớp quỹ đạo, không phá công trình, không cướp tài nguyên, ' +
    'và công sự bị tên lửa phá thì mất hẳn — không được dựng lại như sau một trận đánh thường.</p></div>';
  return h;
};

U.HU = { he: 'Hệ thống', tran: 'Chiến báo', tt: 'Tình báo', bt: 'Bảo trì', ham: 'Hạm đội',
  nc: 'Nghiên cứu', canh: 'Báo động', thu: 'Thư' };

U.m_tinnhan = function () {
  var st = U.st();
  var h = '<div class="panel"><h3>Hộp tin (' + st.msgs.length + ')</h3><div class="noi">' +
    '<button class="nut nho" data-act="doc-het">Đánh dấu đã đọc</button> ' +
    '<button class="nut nho xoa" data-act="xoa-tin">Xoá hết tin</button></div></div>';
  if (!st.msgs.length) return h + '<div class="panel"><div class="noi mo">Chưa có tin nào.</div></div>';
  for (var i = 0; i < st.msgs.length; i++) {
    var m = st.msgs[i], mo = !!U.moTin[i];
    h += '<div class="tn' + (m.doc ? '' : ' moi') + '"><div class="d" data-act="doc-tin" data-i="' + i + '">' +
      '<span><span class="hu">' + U.esc(U.HU[m.loai] || m.loai) + '</span> ' + U.esc(m.td) + '</span>' +
      '<span class="mo sz">' + G.gio(m.t * 1000) + '</span></div>';
    if (mo) {
      h += '<div class="n">';
      if (m.data && m.data.tl) h += U.veBaoCaoTenLua(m.data);
      else if (m.data && m.data.kq) h += U.veBaoCao(m.data);
      else if (m.data && m.data.bc) h += U.veDoTham(m.data.bc);
      else h += '<pre class="nd">' + U.esc(m.nd) + '</pre>';
      h += '</div>';
    }
    h += '</div>';
  }
  return h;
};

/* ======================================================================
 * MÀN: NHẬT KÝ & LƯU
 * ==================================================================== */
U.m_nhatky = function () {
  var st = U.st(), d = G.diem(st);
  var h = '<div class="luoi2">';
  h += '<div class="panel"><h3>Thống kê chiến dịch</h3><div class="noi"><table>' +
    '<tr><td>Chỉ huy</td><td class="r">' + U.esc(st.ten) + '</td></tr>' +
    '<tr><td>Hạt giống vũ trụ</td><td class="r sz">' + U.esc(st.seed) + '</td></tr>' +
    '<tr><td>Bắt đầu</td><td class="r">' + G.gio(st.t0 * 1000) + '</td></tr>' +
    '<tr><td>Thời gian chơi</td><td class="r sz">' + G.tg(st.now - st.t0) + '</td></tr>' +
    '<tr><td>Chu kỳ bảo trì đã qua</td><td class="r sz">' + st.soChuKy + '</td></tr>' +
    '<tr><td>Tổng điểm</td><td class="r sz">' + G.so(d.tong) + '</td></tr>' +
    '<tr><td>Trận thắng / thua</td><td class="r sz">' + st.stats.thang + ' / ' + st.stats.thua + '</td></tr>' +
    '<tr><td>Tài nguyên cướp được</td><td class="r sz">' + G.so(st.stats.cuop) + '</td></tr>' +
    '<tr><td>Tàu địch bắn hạ</td><td class="r sz">' + G.so(st.stats.tauDietDich) + '</td></tr>' +
    '<tr><td>Tàu của ta bị mất</td><td class="r sz">' + G.so(st.stats.tauMat) + '</td></tr>' +
    '<tr><td>Chuyến bay đã điều</td><td class="r sz">' + G.so(st.stats.chuyenBay) + '</td></tr>' +
    '</table></div></div>';

  h += '<div class="panel"><h3>Lưu &amp; nạp</h3><div class="noi">' +
    '<p class="mo">Bàn chơi tự lưu vào bộ nhớ trình duyệt mỗi 15 giây. Thời gian vẫn chạy khi đóng game: ' +
    'mở lại là engine tua lại toàn bộ sản xuất, chuyến bay và chu kỳ bảo trì đã diễn ra.</p>' +
    '<button class="nut nho" data-act="luu">Lưu ngay</button> ' +
    '<button class="nut nho" data-act="xuat">Xuất file</button> ' +
    '<button class="nut nho" data-act="nhap">Nạp file</button> ' +
    '<button class="nut nho xoa" data-act="xoa-game">Xoá bàn &amp; chơi lại</button>' +
    '<input type="file" id="file-nhap" accept=".json" style="display:none">' +
    '</div></div>';
  h += '</div>';

  h += '<div class="panel"><h3>Nhật ký</h3><div class="noi">';
  if (!st.nk.length) h += '<span class="mo">Chưa có gì.</span>';
  else for (var i = 0; i < st.nk.length; i++)
    h += '<div><span class="hu sz">' + G.gio(st.nk[i].t * 1000) + '</span> ' + U.esc(st.nk[i].s) + '</div>';
  h += '</div></div>';
  return h;
};

/* ======================================================================
 * MÀN: HƯỚNG DẪN
 * ==================================================================== */
U.m_huongdan = function () {
  var st = U.st(), p = U.ht();
  var h = '';

  h += '<div class="panel"><h3>Bắt đầu từ đâu</h3><div class="noi">';
  h += '<p class="mo">Không có nhiệm vụ dẫn dắt, không có level nhân vật. Sức mạnh của ta = số công trình, ' +
    'số đề tài nghiên cứu và số tàu — đúng như thiết kế của bản gốc.</p>';
  h += '<table><tr><th style="width:34px">#</th><th>Việc</th><th>Vì sao</th></tr>' +
    '<tr><td class="c">1</td><td><b>Mỏ Kim Loại</b> và <b>Mỏ Tinh Thể</b> lên cấp 5–8</td>' +
    '<td class="mo">Mọi thứ khác đều cần hai thứ này.</td></tr>' +
    '<tr><td class="c">2</td><td><b>Nhà Máy Điện Mặt Trời</b> chạy theo cho đủ điện</td>' +
    '<td class="mo">Thiếu điện thì mỏ chỉ chạy cầm chừng — xem ô "Điện" trên thanh trên, phải đạt 100%.</td></tr>' +
    '<tr><td class="c">3</td><td><b>Trang Trại Sinh Quyển</b> lên sớm</td>' +
    '<td class="mo">Hết Lương Thực là hành tinh bị đói: sản lượng còn một nửa và hạm đội không xuất kích được.</td></tr>' +
    '<tr><td class="c">4</td><td><b>Nhà Máy Robot</b> → <b>Xưởng Đóng Tàu</b> → <b>Phòng Nghiên Cứu</b></td>' +
    '<td class="mo">Robot làm mọi thứ xây nhanh hơn; xưởng mở ra hạm đội; phòng nghiên cứu mở ra công nghệ.</td></tr>' +
    '<tr><td class="c">5</td><td>Nghiên cứu <b>Động Cơ Đốt</b>, đóng vài <b>Tàu Do Thám</b></td>' +
    '<td class="mo">Do thám trước khi đánh — đây là thói quen sống còn của thể loại này.</td></tr>' +
    '<tr><td class="c">6</td><td>Xây <b>Kho</b> khi thấy tài nguyên chạm trần</td>' +
    '<td class="mo">Kho đầy thì phần sản xuất thêm bị mất trắng.</td></tr>' +
    '</table></div></div>';

  /* 5 loại hành tinh — lấy nguyên từ tư liệu bản gốc */
  h += '<div class="panel"><h3>Năm loại hành tinh</h3><div class="noi">';
  h += '<p class="mo">Đây là mô tả có thật của bản gốc: "sau nhiều năm nghiên cứu, các nhà khoa học đã xác định ' +
    'được 5 loại hành tinh". Vị trí trong hệ quyết định loại: gần Mặt Trời là Sa Mạc, xa là Băng Hà.</p>';
  h += '<div class="bang-cuon"><table><tr><th>Loại</th><th>Đặc điểm</th><th class="r">Ô đất</th>' +
    '<th class="r">KL</th><th class="r">TT</th><th class="r">DT</th><th class="r">LT</th>' +
    '<th class="r">Điện</th><th class="r">Thủ đất</th></tr>';
  for (var li = 0; li < G.LOAI_HT.length; li++) {
    var L2 = G.LOAI_HT[li];
    h += '<tr><td><b style="color:' + L2.mau + '">' + U.esc(L2.ten) + '</b></td><td class="mo" style="font-size:11.5px">' +
      U.esc(L2.mota) + '</td>' +
      ['oDat', 'kl', 'tt', 'dt', 'lt', 'dien', 'thuDat'].map(function (k) {
        var v = L2[k];
        return '<td class="r sz ' + (v > 1 ? 'luc' : (v < 1 ? 'do' : 'mo')) + '">×' + v + '</td>';
      }).join('') + '</tr>';
  }
  h += '</table></div><p class="mo">Hành tinh mẹ luôn là Ôn Hoà. Đi thực dân thì chọn loại hợp với thứ mình thiếu: ' +
    'Sa Mạc để lấy Kim Loại, Nước – Đầm Lầy và Băng Hà để lấy nhiên liệu và thủ, Rừng Già để nuôi quân.</p>';
  h += '</div></div>';

  h += '<div class="luoi2">';
  h += '<div class="panel"><h3>Bốn cơ chế riêng của Thiên Hà Đại Chiến</h3><div class="noi">' +
    '<p><b class="cam">1. Chu kỳ bảo trì 6 giờ.</b> Cứ 6 giờ thực, đế quốc bị trừ phí bảo trì bằng <b>Galana</b>, ' +
    'tính theo quy mô hạm đội + phòng thủ + công trình. Không trả nổi thì mang nợ: sản lượng toàn đế quốc ' +
    'giảm 30% và hạm đội bị niêm phong, không tấn công được. Xem đồng hồ "Bảo trì sau" ở thanh trên. ' +
    'Bí tiền thì ra <b>Chợ Thiên Hà</b> (màn Tài Nguyên) bán bớt Kim Loại. ' +
    '<i>Trung Tâm Bảo Trì</i> giảm tới 60% khoản phí này.</p>' +
    '<p><b class="cam">2. Nghiên cứu trả góp.</b> Ngoài chi phí trả ngay, mỗi đề tài còn có <b>vốn đầu tư</b> bị ' +
    'trừ dần qua từng chu kỳ bảo trì. Giữa chừng hết Galana thì đề tài <b>bị treo</b> cho tới khi có tiền.</p>' +
    '<p><b class="cam">3. Phòng thủ hai lớp.</b> Lớp <b>quỹ đạo</b> (vệ tinh, trạm phòng không, khiên) đánh ngay từ ' +
    'vòng 1. Hạm đội địch chỉ hạ xuống tầng khí quyển và đụng lớp <b>mặt đất</b> (tên lửa, laser, gauss, plasma) ' +
    'từ vòng ' + G.VONG_XUONG_DAT + '. Muốn thủ chắc thì phải có cả hai lớp.</p>' +
    '<p><b class="cam">Tên lửa liên hành tinh.</b> Đóng ở màn Phòng Thủ rồi bắn thẳng sang hành tinh khác trong ' +
    'cùng thiên hà: phá <b>phòng thủ mặt đất</b> mà không cần cho hạm đội bay, nhưng không đụng được lớp quỹ đạo ' +
    'và không cướp được gì. Tầm bắn = (cấp Động Cơ Xung × 5) − 1 hệ. Đối phương có Tên Lửa Đánh Chặn thì hạ ' +
    'được 1 đổi 1 — nên nhớ đóng đánh chặn cho mình.</p>' +
    '<p><b class="cam">Đổ bộ — cách bản gốc kết liễu một hành tinh.</b> Hạm đội chỉ giành được ' +
    '<b>quỹ đạo</b>; muốn động tới hành tinh thì phải chở <b>Robot</b> và <b>Tank</b> theo (Đại Chiến Hạm chở ' +
    'được nhiều nhất). Quỹ đạo vỡ rồi quân mới đổ xuống, đánh nhau với quân giữ nhà và phòng thủ mặt đất của ' +
    'đối phương; thắng thì <b>san phẳng công trình</b> của họ và vét thêm kho. Quân đổ bộ đứng ở nhà thì chính ' +
    'là lực lượng chống đổ bộ — đừng để hành tinh trống trơn.</p>' +
    '<p><b class="cam">Thám hiểm.</b> Ô số 16 của mỗi hệ là <b>vùng không gian sâu</b>. Gửi hạm đội ra đó ' +
    'để tìm tài nguyên trôi nổi, tàu bỏ hoang còn dùng được hay một trạm giao dịch cũ — nhưng cũng có thể ' +
    'đụng sinh vật ngoài hành tinh, lạc đường, hoặc bay vào vành đai thiên thạch. Số đoàn đi cùng lúc ' +
    'phụ thuộc Công Nghệ Liên Hành Tinh. Đừng gửi thứ mình tiếc.</p>' +
    '<p><b class="cam">Máy tính trận đánh.</b> Trước khi xuất kích, mở màn <b>Máy Tính Trận</b>: nạp đội hình ' +
    'đối phương từ báo cáo do thám rồi chạy thử ' + U.MP_LAN + ' lần để biết tỷ lệ thắng và lãi/lỗ kỳ vọng. ' +
    'Đây là thói quen của mọi người chơi lâu năm thể loại này.</p>' +
    '<p><b class="cam">4. Đổi mục tiêu giữa đường.</b> Hạm đội đang bay vẫn đổi được đích: vào màn Hạm Đội bấm ' +
    '"Đổi mục tiêu", mất ' + G.so(G.C.DOI_MUC_TIEU_GALANA) + ' Galana cộng nhiên liệu phụ trội, thời gian bay ' +
    'tính lại từ vị trí hiện tại. Dùng để đánh úp, hoặc để né khi đối phương kịp dựng phòng thủ.</p>' +
    '</div></div>';

  h += '<div class="panel"><h3>Đánh nhau</h3><div class="noi">' +
    '<p>Trận đánh chạy <b>' + G.C.VONG_DANH + ' vòng</b>. Mỗi vòng hai bên bắn đồng thời; khiên hồi đầu mỗi vòng; ' +
    'phát bắn yếu hơn 1% khiên đối phương thì <b>dội ra</b> không gây sát thương. Một số tàu có <b>bắn nhanh</b>: ' +
    'hạ được mục tiêu nhỏ thì được bắn tiếp ngay trong vòng đó.</p>' +
    '<p><b>' + Math.round(G.C.PHE_LIEU * 100) + '% xác tàu</b> đọng lại thành <b>bãi phế liệu</b> trên quỹ đạo — ' +
    'ai đưa <i>Tàu Thu Hồi</i> tới trước thì vét được, kể cả xác tàu của chính mình. ' +
    'Công sự bị phá có <b>70%</b> cơ hội được sửa lại sau trận, nên đánh vào chỗ nhiều pháo thường lỗ.</p>' +
    '<p>Bên thắng cướp tối đa <b>' + Math.round(G.C.CUOP_TOI_DA * 100) + '%</b> tài nguyên trong kho đối phương, ' +
    'nhưng chỉ chở về được đúng sức chứa khoang hàng — nhớ mang theo tàu vận tải.</p>' +
    '<p class="mo">Kinh nghiệm: trên mỗi đồng bỏ ra, phòng thủ mặt đất bền hơn hạm đội rất nhiều. Hạm đội để đi ' +
    'cướp mục tiêu giàu mà mỏng, đừng lao vào chỗ có nhiều Pháo Plasma.</p>' +
    '</div></div>';
  h += '</div>';

  h += '<div class="luoi2">';
  h += '<div class="panel"><h3>Hạm đội &amp; toạ độ</h3><div class="noi">' +
    '<p>Toạ độ có dạng <b class="sz">[thiên hà : hệ : hành tinh]</b> — vũ trụ có ' + G.C.SO_THIEN_HA + ' × ' +
    G.C.SO_HE + ' × ' + G.C.SO_HANH_TINH + ' ô. Càng xa bay càng lâu và càng tốn deuterium; ' +
    'hạ tốc độ xuống 10–50% thì tốn ít nhiên liệu hơn nhiều.</p>' +
    '<p>Số chuyến bay cùng lúc = <b>' + G.khe(st) + ' khe</b> (tăng bằng <i>Công Nghệ Máy Tính</i> và ' +
    '<i>Đài Chỉ Huy Hạm Đội</i>). Bảy nhiệm vụ: Tấn Công, Vận Chuyển, Triển Khai, Do Thám, Thực Dân, ' +
    'Thu Hồi, Giữ Chỗ.</p>' +
    '<p><b>Hạm đội đang bay thì không bao giờ bị bắn hạ.</b> Thấy báo động mà không đỡ nổi thì cho hạm đội ' +
    'bay đi — về sau quay lại vẫn còn nguyên.</p>' +
    '</div></div>';

  h += '<div class="panel"><h3>' + (APP.mp ? 'Chơi với người thật' : 'Mở rộng đế quốc') + '</h3><div class="noi">';
  if (APP.mp) {
    h += '<p>Hành tinh <b class="cam">màu cam</b> trên bản đồ là người chơi thật. Đánh nhau với họ là thật: ' +
      'tài nguyên bị cướp khỏi kho của họ, phòng thủ của họ vỡ thật, và họ đánh lại được.</p>' +
      '<p><b>Bảo vệ người chơi mới:</b> dưới ' + G.so(G.C.BAO_VE_MOI_DIEM) + ' điểm thì hai bên lệch nhau quá ' +
      G.C.BAO_VE_MOI_TY_LE + ' lần là không đánh được nhau.</p>' +
      '<p>Khi có người thật cho hạm đội tấn công tới, ta <b>được báo động trước</b> kèm đồng hồ đếm ngược — ' +
      'nhưng không thấy họ mang gì, muốn biết thì phải do thám ngược lại. Nhiệm vụ do thám của đối phương ' +
      'thì đi lén, không báo trước.</p>' +
      '<p>Vào <b>liên minh</b> để được +5% sản lượng, và dùng nhiệm vụ <b>Vận Chuyển</b> chở tài nguyên tiếp tế ' +
      'cho đồng minh. Hàng bên nhận không chứa nổi sẽ được mang về, không mất.</p>' +
      '<p class="mo">Đế quốc của ta chạy trên máy chủ 24/7: thoát ra thì mỏ vẫn đào, bảo trì vẫn trừ tiền, ' +
      'và người khác vẫn đánh vào được.</p>';
  } else {
    h += '<p>Nghiên cứu <b>Công Nghệ Liên Hành Tinh</b>: cứ 2 cấp cho phép giữ thêm một hành tinh. ' +
      'Đóng <b>Tàu Thực Dân</b>, mở màn Thiên Hà, tìm ô <span class="mo">— trống —</span> rồi bấm "Thực dân". ' +
      'Hành tinh ở vị trí 4–12 thường nhiều ô đất và mát hơn; hành tinh xa mặt trời cho nhiều deuterium hơn.</p>' +
      '<p>Hành tinh <span class="vang">bỏ hoang</span> của NPC ít phòng thủ nhưng nhiều tài nguyên — đó là chỗ ' +
      'kiếm vốn tốt nhất lúc đầu.</p>' +
      '<p class="mo">Thời gian vẫn chạy khi ta đóng game: mở lại là toàn bộ sản xuất, chuyến bay và các chu kỳ ' +
      'bảo trì đã diễn ra được tua lại đúng thứ tự.</p>';
  }
  h += '</div></div></div>';

  h += '<div class="panel"><h3>Về bản phục dựng này</h3><div class="noi mo">' +
    '<p>Nguyên tác <b>Thiên Hà Đại Chiến</b> là webgame chiến thuật vũ trụ thuần text của <b>Trần Châu Quốc Bình</b> ' +
    'cùng nhóm 3 người, phát triển từ khoảng 2004, đoạt giải VietGames 2006 (VINASA), vận hành tại ' +
    'thienhadaichien.com tới đầu thập niên 2010.</p>' +
    '<p>Server gốc đã mất, nên bản này dựng lại từ tư liệu báo game và diễn đàn còn sót: các cơ chế đặc trưng ' +
    '(chu kỳ bảo trì 6 giờ, nghiên cứu trả góp, phòng thủ hai lớp, đổi mục tiêu giữa đường, 6 loại tài nguyên) ' +
    'là thật; mọi con số cân bằng là suy luận theo khung OGame.</p>' +
    '<p>Hành tinh hiện tại: <b>' + U.esc(p.ten) + '</b> ' + G.tdStr(p.c) + ' · nhiệt độ ' + p.temp + '°C · ' +
    G.oDaDung(p) + '/' + G.oToiDa(p) + ' ô đất.</p>' +
    '</div></div>';
  return h;
};

/* ======================================================================
 * VẼ & CẬP NHẬT
 * ==================================================================== */
U.sig = function () {
  var st = U.st(), s = [st.planets.length, st.msgs.length, st.fleets.length, st.toi.length, st.soChuKy,
    st.noBaoTri > 0 ? 1 : 0, U.man, U.pi, st.nk.length];
  for (var i = 0; i < st.planets.length; i++) {
    var p = st.planets[i];
    s.push(p.qB.length, p.qS.length, p.qS.length ? p.qS[0].n : 0, p.doi > 0 ? 1 : 0);
  }
  s.push(st.ncQueue ? st.ncQueue.id + (st.ncQueue.treo ? 'T' : '') : '-');
  for (var j = 0; j < st.fleets.length; j++) s.push(st.fleets[j].id + st.fleets[j].pha);
  return s.join('|');
};

U.ve = function () {
  var st = U.st();
  if (!st) return;
  document.getElementById('tt-res').innerHTML = U.thanhRes();
  U.veMenu(); U.veCanh(); U.veChonHT();
  var f = U['m_' + U.man] || U.m_tongquan;
  document.getElementById('noidung').innerHTML = f();
  document.getElementById('chan-tt').innerHTML =
    'Thiên Hà Đại Chiến — bản phục dựng ' + G.VERSION + ' · nguyên tác: Trần Châu Quốc Bình &amp; nhóm 3 người (2004–2013) · ' +
    'máy chủ tốc độ x' + G.C.TOC_DO_SERVER + ' · chu kỳ bảo trì 6 giờ';
  U.sigCu = U.sig();
};

U.live = function () {
  var st = U.st();
  if (!st) return;
  if (U.sig() !== U.sigCu) { U.ve(); return; }
  var p = U.ht(), s = G.sanLuong(st, p), i;
  var els = document.querySelectorAll('[data-live]');
  for (i = 0; i < els.length; i++) {
    var k = els[i].getAttribute('data-live'), v;
    if (k.indexOf('res.') === 0) v = G.soNgan(p.res[k.slice(4)] || 0);
    else if (k.indexOf('rate.') === 0) { var rk = k.slice(5); v = (s.r[rk] >= 0 ? '+' : '') + G.soNgan(s.r[rk]) + '/g'; }
    else if (k === 'galana') v = G.soNgan(st.galana);
    else if (k === 'tech') v = G.soNgan(st.techPts);
    if (v !== undefined && els[i].textContent !== v) els[i].textContent = v;
  }
  var ds = document.querySelectorAll('.dem');
  for (i = 0; i < ds.length; i++) {
    var t = +ds[i].getAttribute('data-t');
    ds[i].textContent = G.tg(t - st.now);
  }
};

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
    '</span><input id="' + tienTo + '-' + u.id + '" type="number" min="0" value="' + (giaTri || 0) + '"></div>';
}

U.m_mophong = function () {
  var st = U.st(), p = U.ht();
  if (!U.mp) U.mp = U.mpMoi();
  var m = U.mp, i, h = '';

  h += '<div class="panel"><h3>Máy tính trận đánh</h3><div class="noi">';
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
    h += '<select id="mp-bc"><option value="">— nạp từ báo cáo do thám —</option>';
    for (i = 0; i < ds.length; i++) {
      var bc = st.spy[ds[i]];
      h += '<option value="' + U.esc(ds[i]) + '">' + U.esc(bc.ten) + ' ' + G.tdStr(bc.td) + '</option>';
    }
    h += '</select><button class="nut nho" data-act="mp-nap-bc">Nạp</button>';
  }
  h += '</div>';
  if (m.nguon) h += '<div class="mo" style="margin-top:6px">Bên phòng thủ lấy từ báo cáo do thám: <b>' + U.esc(m.nguon) + '</b></div>';
  h += '</div></div>';

  /* kết quả */
  if (m.kq) {
    var k = m.kq;
    var tyLe = Math.round(k.thang / k.lan * 100);
    var pThang = k.thang / k.lan;
    var tongCuop = k.cuop ? G.tongRes(k.cuop) : 0;
    /* kỳ vọng: chỉ thắng mới cướp và mới yên tâm vét phế liệu */
    var lai = Math.round(pThang * (tongCuop + k.pl.metal + k.pl.crystal) - k.giaA);
    h += '<div class="panel"><h3>Kết quả mô phỏng (' + k.lan + ' lần)</h3><div class="noi">';
    h += '<div class="kq ' + (tyLe >= 80 ? 'thang' : (tyLe >= 30 ? 'hoa' : 'thua')) + '" style="margin:0 0 10px">' +
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
      '<tr><td>Bãi phế liệu tạo ra</td><td class="r sz vang">' + G.so(k.pl.metal) + ' KL · ' + G.so(k.pl.crystal) + ' TT</td></tr>' +
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
  h += '<div class="panel"><h3>Bên tấn công (ta)</h3><div class="noi">';
  h += '<div class="hd-luoi">';
  for (i = 0; i < G.SHIPS.length; i++) h += mpO('mpa', G.SHIPS[i], m.A.ships[G.SHIPS[i].id], p.ships[G.SHIPS[i].id]);
  h += '</div><div class="hd-luoi" style="margin-top:8px">' +
    '<div class="hd-tau"><span>Công Nghệ Vũ Khí</span><input id="mpta-weapon" type="number" min="0" max="50" value="' + m.A.tech.weapon + '"></div>' +
    '<div class="hd-tau"><span>Công Nghệ Khiên</span><input id="mpta-shield" type="number" min="0" max="50" value="' + m.A.tech.shield + '"></div>' +
    '<div class="hd-tau"><span>Công Nghệ Giáp</span><input id="mpta-armor" type="number" min="0" max="50" value="' + m.A.tech.armor + '"></div>' +
    '</div></div></div>';

  h += '<div class="panel"><h3>Bên phòng thủ</h3><div class="noi">';
  h += '<b>Hạm đội</b><div class="hd-luoi" style="margin-top:6px">';
  for (i = 0; i < G.SHIPS.length; i++) h += mpO('mpd', G.SHIPS[i], m.D.ships[G.SHIPS[i].id], 0);
  h += '</div><b style="display:block;margin-top:10px">Phòng thủ</b><div class="hd-luoi" style="margin-top:6px">';
  for (i = 0; i < G.DEFENSES.length; i++) h += mpO('mpf', G.DEFENSES[i], m.D.def[G.DEFENSES[i].id], 0);
  h += '</div><div class="hd-luoi" style="margin-top:8px">' +
    '<div class="hd-tau"><span>Công Nghệ Vũ Khí</span><input id="mptd-weapon" type="number" min="0" max="50" value="' + m.D.tech.weapon + '"></div>' +
    '<div class="hd-tau"><span>Công Nghệ Khiên</span><input id="mptd-shield" type="number" min="0" max="50" value="' + m.D.tech.shield + '"></div>' +
    '<div class="hd-tau"><span>Công Nghệ Giáp</span><input id="mptd-armor" type="number" min="0" max="50" value="' + m.D.tech.armor + '"></div>' +
    '</div></div></div>';
  h += '</div>';
  return h;
};
