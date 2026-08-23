/* THIÊN HÀ ĐẠI CHIẾN — tầng thao tác giao diện (dùng chung cho 1 người & nhiều người)
 * Mọi thao tác của người chơi đi qua APP.lam(ten, dl, xong):
 *   - bản một người  (js/main.js): chạy G.chay() ngay trên state trong máy
 *   - bản nhiều người (web/js/mp.js): gửi lên server, server mới là bên quyết định
 * File này chỉ lo thu dữ liệu từ DOM, hiện hộp thoại và vẽ lại.            */
'use strict';
var G = window.G, U = window.U, APP = window.APP = window.APP || {};

APP.mp = false;                 // true khi đang chơi ở chế độ nhiều người

/* Nguồn dữ liệu vũ trụ: bản một người tính tại chỗ, bản nhiều người lấy từ server */
U.nguon = {
  xemHe: function (g, h) { return G.xemHe(U.st(), g, h); },
  xepHang: function (loai) { return G.xepHang(U.st(), loai); },
  dsLM: function () {
    var out = [];
    for (var i = 0; i < G.LIEN_MINH.length; i++) if (G.LIEN_MINH[i]) out.push({ ten: G.LIEN_MINH[i] });
    return out;
  }
};

function soO(id) { var e = document.getElementById(id); return e ? Math.max(0, Math.floor(+e.value || 0)) : 0; }
function veLai(err, okMsg) {
  if (err) U.toast(err, 'loi');
  else if (okMsg) U.toast(okMsg, 'ok');
  U.ve();
}
/* gửi một hành động lên "máy" (local hoặc server) */
function lam(ten, dl, okMsg) {
  APP.lam(ten, dl || {}, function (err) { veLai(err, err ? null : okMsg); });
}
APP.gui = lam;

var ACT = {
  /* ---------- điều hướng & hộp thoại ---------- */
  man: function (el) {
    U.man = el.getAttribute('data-man');
    var m = document.getElementById('menu'); if (m) m.classList.remove('mo-ra');
    U.ve(); window.scrollTo(0, 0);
  },
  'dong-ht': function () { U.dongHop(); },
  luu: function () { if (APP.luu) APP.luu(false); },

  /* ---------- công trình / nghiên cứu / xưởng ---------- */
  xay: function (el) {
    var id = el.getAttribute('data-id');
    lam('xay', { pi: U.pi, id: id, n: soO('ct-sl-' + id) });
  },
  huyxay: function (el) { lam('huyxay', { pi: U.pi, i: +el.getAttribute('data-i') }); },
  nc: function (el) { lam('nc', { pi: U.pi, id: el.getAttribute('data-id') }); },
  huync: function () { lam('huync', {}, 'Đã huỷ đề tài, hoàn lại chi phí.'); },
  dong: function (el) {
    var id = el.getAttribute('data-id');
    lam('dong', { pi: U.pi, id: id, n: soO('sl-' + id) || 1 });
  },
  huydong: function (el) { lam('huydong', { pi: U.pi, i: +el.getAttribute('data-i') }); },
  doithue: function () {
    var e = document.getElementById('thue-pct');
    lam('doithue', { pi: U.pi, thue: e ? Number(e.value) : NaN }, 'Đã đổi mức thuế từ chu kỳ hiện tại.');
  },

  /* ---------- chợ ---------- */
  ban: function (el) {
    var r = el.getAttribute('data-res');
    U.cho[r] = soO('cho-' + r);
    lam('ban', { pi: U.pi, res: r, n: U.cho[r] });
  },
  mua: function (el) {
    var r = el.getAttribute('data-res');
    U.cho[r] = soO('cho-' + r);
    lam('mua', { pi: U.pi, res: r, n: U.cho[r] });
  },

  /* ---------- bản đồ thiên hà ---------- */
  gal: function (el) {
    if (!U.gal) U.gal = { g: U.ht().c.g, h: U.ht().c.h };
    U.gal.g = Math.min(G.C.SO_THIEN_HA, Math.max(1, U.gal.g + (+el.getAttribute('data-dg') || 0)));
    U.gal.h = Math.min(G.C.SO_HE, Math.max(1, U.gal.h + (+el.getAttribute('data-dh') || 0)));
    APP.taiHe ? APP.taiHe(U.gal.g, U.gal.h) : U.ve();
  },
  'gal-di': function () {
    U.gal = {
      g: Math.min(G.C.SO_THIEN_HA, Math.max(1, soO('g-g') || 1)),
      h: Math.min(G.C.SO_HE, Math.max(1, soO('g-h') || 1))
    };
    APP.taiHe ? APP.taiHe(U.gal.g, U.gal.h) : U.ve();
  },
  'gal-nha': function () {
    var c = U.st().planets[0].c;
    U.gal = { g: c.g, h: c.h }; U.man = 'thienha';
    APP.taiHe ? APP.taiHe(U.gal.g, U.gal.h) : U.ve();
  },
  'gal-tu-form': function () {
    U.capNhatForm();
    U.gal = { g: U.form.den.g, h: U.form.den.h }; U.man = 'thienha';
    APP.taiHe ? APP.taiHe(U.gal.g, U.gal.h) : U.ve();
  },

  /* ---------- hạm đội ---------- */
  nv: function (el) {
    var t = el.getAttribute('data-td').split(',');
    if (!U.form) U.form = U.formMoi();
    U.form.den = { g: +t[0], h: +t[1], p: +t[2] };
    U.form.mission = el.getAttribute('data-m');
    U.form.ships = {};
    U.man = 'hamdoi'; U.ve(); window.scrollTo(0, 0);
    U.toast('Đã nạp mục tiêu ' + G.tdStr(U.form.den) + ' — chọn tàu rồi xuất kích.');
  },
  'max-linh': function (el) {
    U.capNhatForm();
    var id = el.getAttribute('data-id');
    if (!U.form.linh) U.form.linh = {};
    U.form.linh[id] = (U.ht().linh || {})[id] || 0;
    U.ve();
  },
  'max-tau': function (el) {
    U.capNhatForm();
    var id = el.getAttribute('data-id');
    U.form.ships[id] = U.ht().ships[id] || 0;
    U.ve();
  },
  'max-hang': function () {
    U.capNhatForm();
    var p = U.ht(), f = U.form, st = U.st();
    var suc = G.khoangHang(f.ships);
    var nl = G.nhienLieu(st, f.ships, G.khoangCach(p.c, f.den), f.pct);
    f.cargo = {};
    var con = suc, ds = ['metal', 'crystal', 'deut', 'food'];
    /* Với Giữ Chỗ, ưu tiên nạp đủ nhiên liệu quỹ đạo đã lên kế hoạch. Đây chỉ
       là tiện ích điền form; engine/server vẫn tự kiểm tra authoritative. */
    if (f.mission === 'hold' && G.QUY_DAO_V1 && G.nhienLieuGiu) {
      var giuGiay = Math.max(1, Math.min(24, Math.floor(+f.giu || 1))) * 3600;
      var canGiu = 0, doan = Math.max(1, G.QUY_DAO_V1.segmentSeconds);
      if (G.nhienLieuGiuTong) canGiu = G.nhienLieuGiuTong(st, f.ships, giuGiay);
      else for (var giuCon = giuGiay; giuCon > 0; giuCon -= doan)
        canGiu += G.nhienLieuGiu(st, f.ships, Math.min(giuCon, doan));
      var deutCo = Math.max(0, Math.floor((p.res.deut || 0) - nl));
      var napGiu = Math.min(con, deutCo, canGiu);
      if (napGiu > 0) { f.cargo.deut = napGiu; con -= napGiu; }
      ds = ['metal', 'crystal', 'food'];
    }
    for (var i = 0; i < ds.length && con > 0; i++) {
      var co = Math.max(0, Math.floor((p.res[ds[i]] || 0) - (ds[i] === 'deut' ? nl : 0)));
      var lay = (i === ds.length - 1) ? Math.min(co, con) : Math.min(co, Math.floor(con / (ds.length - i)));
      if (lay > 0) { f.cargo[ds[i]] = lay; con -= lay; }
    }
    U.ve();
  },
  gui: function () {
    U.capNhatForm();
    var f = U.form;
    APP.lam('gui', {
      pi: U.pi, ships: G.clone(f.ships), linh: G.clone(f.linh || {}), den: f.den, mission: f.mission,
      cargo: G.clone(f.cargo), pct: f.pct, giu: f.giu
    }, function (err) {
      if (err) return U.toast(err, 'loi');
      U.form = U.formMoi();
      veLai(null, 'Hạm đội đã xuất kích.');
    });
  },
  goive: function (el) { lam('goive', { fid: +el.getAttribute('data-fid') }, 'Đã phát lệnh gọi về.'); },
  'ban-ten-lua': function () {
    lam('banTenLua', {
      pi: U.pi, n: soO('tl-n'),
      den: { g: soO('tl-g'), h: soO('tl-h'), p: soO('tl-p') }
    }, 'Tên lửa đã rời bệ phóng.');
  },
  doihuong: function (el) {
    var fid = +el.getAttribute('data-fid'), st = U.st(), f = null;
    for (var i = 0; i < st.fleets.length; i++) if (st.fleets[i].id === fid) f = st.fleets[i];
    if (!f) return;
    U.hop('Đổi mục tiêu hạm đội #' + fid,
      '<p>Hạm đội đang bay tới <b>' + G.tdStr(f.den) + '</b>. Nhập toạ độ mới — thời gian bay được tính lại từ ' +
      'vị trí hiện tại của hạm đội. Phí: <b>' + G.C.DOI_MUC_TIEU_GALANA + ' Galana</b> cộng nhiên liệu phụ trội.</p>' +
      '<div class="hd-td"><input id="dh-g" type="number" min="1" max="' + G.C.SO_THIEN_HA + '" value="' + f.den.g + '">:' +
      '<input id="dh-h" type="number" min="1" max="' + G.C.SO_HE + '" value="' + f.den.h + '">:' +
      '<input id="dh-p" type="number" min="1" max="' + G.C.SO_HANH_TINH + '" value="' + f.den.p + '">' +
      '<button class="nut oke" data-act="doihuong-ok" data-fid="' + fid + '">Phát lệnh đổi hướng</button></div>');
  },
  'doihuong-ok': function (el) {
    APP.lam('doihuong', {
      fid: +el.getAttribute('data-fid'),
      den: { g: soO('dh-g'), h: soO('dh-h'), p: soO('dh-p') }
    }, function (err) { U.dongHop(); veLai(err, err ? null : 'Hạm đội đã đổi hướng.'); });
  },

  'xh-loai': function (el) {
    U.xhLoai = el.getAttribute('data-loai');
    if (APP.taiXepHang) APP.taiXepHang(U.xhLoai); else U.ve();
  },

  /* ---------- máy tính trận đánh ---------- */
  'mp-chay': function () { U.mpDoc(); U.mpChay(); U.ve(); window.scrollTo(0, 0); },
  'mp-nap-ham': function () { U.mpDoc(); U.mp.A.ships = G.clone(U.ht().ships || {}); U.ve(); },
  'mp-xoa': function () { U.mp = U.mpMoi(); U.mp.A.ships = {}; U.ve(); },
  'mp-nap-bc': function () {
    U.mpDoc();
    var s = document.getElementById('mp-bc');
    if (s && s.value) { U.mpNapDoTham(s.value); U.ve(); }
    else U.toast('Chọn một báo cáo do thám đã.', 'loi');
  },

  /* ---------- tin nhắn ---------- */
  'doc-tin': function (el) {
    var i = +el.getAttribute('data-i');
    U.moTin[i] = !U.moTin[i];
    var st = U.st();
    if (st.msgs[i] && !st.msgs[i].doc) { st.msgs[i].doc = true; lam('doctin', { i: i }); }
    else U.ve();
  },
  'doc-het': function () { lam('docHet'); },
  'xoa-tin': function () { U.moTin = {}; lam('xoatin'); },
  'xem-tt': function (el) {
    var st = U.st();
    var bc = st.spy && st.spy[el.getAttribute('data-key')];
    if (bc) U.hop('Tin tình báo ' + G.tdStr(bc.td), U.veDoTham(bc));
  },

  /* ---------- liên minh ---------- */
  'lm-vao': function (el) { lam('lmvao', { ten: el.getAttribute('data-ten') }, 'Đã gửi đơn và được nhận.'); },
  'lm-ra': function () { lam('lmra', {}, 'Đã rời liên minh.'); },

  /* ---------- bỏ hoang thuộc địa ---------- */
  'bo-hoang': function () {
    var p = U.ht();
    U.hop('Bỏ hoang ' + p.ten + '?',
      '<p>Toàn bộ công trình, tàu và tài nguyên trên <b>' + U.esc(p.ten) + '</b> ' + G.tdStr(p.c) +
      ' sẽ mất. Ô toạ độ trở về trạng thái trống, ai cũng có thể tới chiếm. <b>Không lấy lại được.</b></p>' +
      '<p>Gõ chữ <b>BO</b> để xác nhận:</p>' +
      '<input id="bh-xn" maxlength="10" style="width:120px"> ' +
      '<button class="nut xoa" data-act="bo-hoang-ok" data-pi="' + U.pi + '">Bỏ hoang</button>');
  },
  'bo-hoang-ok': function (el) {
    var e2 = document.getElementById('bh-xn');
    APP.lam('boHoang', { pi: +el.getAttribute('data-pi'), xacnhan: e2 ? e2.value.trim().toUpperCase() : '' },
      function (err) {
        U.dongHop();
        if (!err) U.pi = 0;
        veLai(err, err ? null : 'Đã bỏ hoang thuộc địa.');
      });
  },

  /* ---------- đổi tên hành tinh ---------- */
  'doi-ten': function () {
    var p = U.ht();
    U.hop('Đổi tên hành tinh',
      '<p>Tên mới cho hành tinh ' + G.tdStr(p.c) + ':</p>' +
      '<input id="ten-ht" maxlength="24" value="' + U.esc(p.ten) + '" style="width:260px">' +
      ' <button class="nut oke" data-act="doi-ten-ok">Đổi</button>');
  },
  'doi-ten-ok': function () {
    var e = document.getElementById('ten-ht');
    APP.lam('doiTenHT', { pi: U.pi, ten: e ? e.value : '' }, function (err) { U.dongHop(); veLai(err); });
  }
};

/* Driver có thể bổ sung/ghi đè hành động riêng (lưu file, đăng xuất...) */
APP.themACT = function (o) { for (var k in o) ACT[k] = o[k]; };
APP.ACT = ACT;

document.addEventListener('click', function (e) {
  var el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el) return;
  var a = el.getAttribute('data-act');
  if (ACT[a]) { e.preventDefault(); ACT[a](el); }
});

/* cập nhật form hạm đội mà không vẽ lại (giữ con trỏ trong ô nhập) */
document.addEventListener('input', function (e) {
  if (!window.ST) return;
  var id = e.target.id || '';
  if (id === 'f-pct') { var v = document.getElementById('f-pct-v'); if (v) v.textContent = e.target.value + '%'; }
  if (/^cho-/.test(id)) U.cho[id.slice(4)] = Math.max(0, Math.floor(+e.target.value || 0));
  if (/^ct-sl-/.test(id)) {
    var bid = id.slice(6), b = G.B(bid), n = Math.max(1, Math.min(10000000, Math.floor(+e.target.value || 1)));
    var gia = document.getElementById('ct-gia-' + bid), tg = document.getElementById('ct-tg-' + bid);
    var nut = document.querySelector('[data-act="xay"][data-id="' + bid + '"]');
    var cost = b ? G.giaCongTrinh(b, n) : null;
    if (b && gia) gia.innerHTML = U.gia(cost, U.ht(), U.st());
    if (b && tg) tg.textContent = G.tg(G.tgXay(U.st(), U.ht(), cost));
    if (nut) {
      nut.textContent = 'Xây ×' + G.so(n);
      nut.classList.toggle('oke', !!b && G.duTien(U.st(), U.ht(), cost) && !G.thieuDK(U.st(), U.ht(), b).length);
    }
  }
  if (/^(f-|ft-|fc-|fl-)/.test(id)) {
    U.capNhatForm();
    var tt = document.getElementById('hd-tt');
    if (tt) tt.innerHTML = U.ttBay();
    if (id === 'f-mission') U.ve();
  }
});
document.addEventListener('change', function (e) {
  if (e.target.id === 'chon-ht') { U.pi = +e.target.value; U.form = null; U.ve(); }
  if (APP.doiFile) APP.doiFile(e);
});

/* ---------- nhịp đập chung: 1 giây một lần ---------- */
APP.batDauNhip = function () {
  setInterval(function () {
    if (!window.ST) return;
    G.tick(window.ST, G.giay());
    U.live();
    if (APP.moiGiay) APP.moiGiay();
  }, 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && window.ST) { G.tick(window.ST, G.giay()); U.ve(); if (APP.hienLai) APP.hienLai(); }
  });
};
