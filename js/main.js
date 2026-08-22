/* THIÊN HÀ ĐẠI CHIẾN — khởi động, lưu bàn, xử lý thao tác */
'use strict';
(function () {
  var KEY = 'thdc_save_v3';
  var ST = null;
  /* Khi nhúng làm Artifact, trình xem không cho tải file — chỉ dùng sao chép/dán */
  var COFILE = !window.THDC_ARTIFACT;

  /* ---------------- lưu / nạp ---------------- */
  function luu(im) {
    if (!ST) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(ST));
      if (!im) U.toast('Đã lưu bàn chơi.', 'ok');
    } catch (e) { U.toast('Không lưu được: ' + e.message, 'loi'); }
  }
  function nap() {
    try {
      var s = localStorage.getItem(KEY);
      if (!s) return null;
      var o = JSON.parse(s);
      if (!o || !o.planets || !o.planets.length) return null;
      /* vá các trường mới nếu bàn cũ thiếu */
      o.toi = o.toi || []; o.npc = o.npc || {}; o.debris = o.debris || {}; o.msgs = o.msgs || [];
      o.nk = o.nk || []; o.stats = o.stats || { thang: 0, thua: 0, cuop: 0, tauMat: 0, tauDietDich: 0, chuyenBay: 0 };
      o.noBaoTri = o.noBaoTri || 0; o.soChuKy = o.soChuKy || 0; o.fleetIdSeq = o.fleetIdSeq || 1;
      return o;
    } catch (e) { return null; }
  }

  function batDau(st) {
    window.ST = ST = st;
    document.getElementById('man-khoidong').style.display = 'none';
    document.getElementById('game').style.display = '';
    G.tick(ST, G.giay());
    U.ve();
  }

  /* ---------------- vòng lặp ---------------- */
  var demLuu = 0;
  setInterval(function () {
    if (!ST) return;
    G.tick(ST, G.giay());
    U.live();
    if (++demLuu >= 15) { demLuu = 0; luu(true); }
  }, 1000);
  window.addEventListener('beforeunload', function () { luu(true); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && ST) { G.tick(ST, G.giay()); U.ve(); }
  });

  /* ---------------- thao tác ---------------- */
  function bao(loi, okMsg) {
    if (loi) U.toast(loi, 'loi');
    else if (okMsg) U.toast(okMsg, 'ok');
    U.ve();
  }
  function soO(id) { var e = document.getElementById(id); return e ? Math.max(0, Math.floor(+e.value || 0)) : 0; }

  var ACT = {
    man: function (el) { U.man = el.getAttribute('data-man'); document.getElementById('menu').classList.remove('mo-ra'); U.ve(); window.scrollTo(0, 0); },
    luu: function () { luu(false); },
    'dong-ht': function () { U.dongHop(); },

    xay: function (el) { bao(G.xepXay(ST, U.ht(), el.getAttribute('data-id'))); },
    huyxay: function (el) { G.huyXay(ST, U.ht(), +el.getAttribute('data-i')); bao(null); },
    nc: function (el) { bao(G.xepNC(ST, U.ht(), el.getAttribute('data-id'))); },
    huync: function () { G.huyNC(ST); bao(null, 'Đã huỷ đề tài, hoàn lại chi phí.'); },
    dong: function (el) {
      var id = el.getAttribute('data-id');
      bao(G.xepTau(ST, U.ht(), id, soO('sl-' + id) || 1));
    },
    huydong: function (el) { G.huyDong(ST, U.ht(), +el.getAttribute('data-i')); bao(null); },

    ban: function (el) {
      var r = el.getAttribute('data-res'), n = soO('cho-' + r), p = U.ht();
      if (!n) return U.toast('Nhập số lượng cần bán.', 'loi');
      if ((p.res[r] || 0) < n) return U.toast('Không đủ ' + G.byId(G.RES, r).ten + '.', 'loi');
      var g = Math.floor(n / U.TY_GIA[r]);
      if (g <= 0) return U.toast('Lượng quá nhỏ, không đủ 1 Galana.', 'loi');
      p.res[r] -= n; ST.galana += g;
      bao(null, 'Bán ' + G.so(n) + ' ' + G.byId(G.RES, r).ten + ' → +' + G.so(g) + ' Galana.');
    },
    mua: function (el) {
      var r = el.getAttribute('data-res'), n = soO('cho-' + r), p = U.ht();
      if (!n) return U.toast('Nhập số lượng cần mua.', 'loi');
      var g = Math.ceil(n / U.TY_GIA[r] * 2.5);
      if (ST.galana < g) return U.toast('Cần ' + G.so(g) + ' Galana.', 'loi');
      ST.galana -= g; p.res[r] = (p.res[r] || 0) + n;
      bao(null, 'Mua ' + G.so(n) + ' ' + G.byId(G.RES, r).ten + ' → -' + G.so(g) + ' Galana.');
    },

    gal: function (el) {
      if (!U.gal) U.gal = { g: U.ht().c.g, h: U.ht().c.h };
      var dg = +el.getAttribute('data-dg') || 0, dh = +el.getAttribute('data-dh') || 0;
      U.gal.g = Math.min(G.C.SO_THIEN_HA, Math.max(1, U.gal.g + dg));
      U.gal.h = Math.min(G.C.SO_HE, Math.max(1, U.gal.h + dh));
      U.ve();
    },
    'gal-di': function () {
      U.gal = {
        g: Math.min(G.C.SO_THIEN_HA, Math.max(1, soO('g-g') || 1)),
        h: Math.min(G.C.SO_HE, Math.max(1, soO('g-h') || 1))
      };
      U.ve();
    },
    'gal-nha': function () { var c = ST.planets[0].c; U.gal = { g: c.g, h: c.h }; U.man = 'thienha'; U.ve(); },
    'gal-tu-form': function () {
      U.capNhatForm();
      U.gal = { g: U.form.den.g, h: U.form.den.h };
      U.man = 'thienha'; U.ve();
    },

    nv: function (el) {
      var t = el.getAttribute('data-td').split(',');
      if (!U.form) U.form = U.formMoi();
      U.form.den = { g: +t[0], h: +t[1], p: +t[2] };
      U.form.mission = el.getAttribute('data-m');
      U.form.ships = {};
      U.man = 'hamdoi'; U.ve(); window.scrollTo(0, 0);
      U.toast('Đã nạp mục tiêu ' + G.tdStr(U.form.den) + ' — chọn tàu rồi xuất kích.');
    },
    'max-tau': function (el) {
      U.capNhatForm();
      var id = el.getAttribute('data-id');
      U.form.ships[id] = U.ht().ships[id] || 0;
      U.ve();
    },
    'max-hang': function () {
      U.capNhatForm();
      var p = U.ht(), f = U.form;
      var suc = G.khoangHang(f.ships);
      var kc = G.khoangCach(p.c, f.den);
      var nl = G.nhienLieu(ST, f.ships, kc, f.pct);
      f.cargo = {};
      var con = suc, ds = ['metal', 'crystal', 'deut', 'food'];
      for (var i = 0; i < ds.length && con > 0; i++) {
        var co = Math.max(0, Math.floor((p.res[ds[i]] || 0) - (ds[i] === 'deut' ? nl : 0)));
        var lay = Math.min(co, Math.floor(con / (ds.length - i)));
        if (i === ds.length - 1) lay = Math.min(co, con);
        if (lay > 0) { f.cargo[ds[i]] = lay; con -= lay; }
      }
      U.ve();
    },
    gui: function () {
      U.capNhatForm();
      var f = U.form;
      var loi = G.guiHam(ST, U.pi, G.clone(f.ships), f.den, f.mission, G.clone(f.cargo), f.pct, f.giu);
      if (loi) return U.toast(loi, 'loi');
      U.form = U.formMoi();
      bao(null, 'Hạm đội đã xuất kích.');
    },
    goive: function (el) { bao(G.goiVe(ST, +el.getAttribute('data-fid')), 'Đã phát lệnh gọi về.'); },
    doihuong: function (el) {
      var fid = +el.getAttribute('data-fid');
      var f = null;
      for (var i = 0; i < ST.fleets.length; i++) if (ST.fleets[i].id === fid) f = ST.fleets[i];
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
      var fid = +el.getAttribute('data-fid');
      var c = G.toaDo(soO('dh-g'), soO('dh-h'), soO('dh-p'));
      if (!G.tdParse(c.g + ':' + c.h + ':' + c.p)) return U.toast('Toạ độ không hợp lệ.', 'loi');
      var loi = G.doiMucTieu(ST, fid, c);
      U.dongHop();
      bao(loi, 'Hạm đội đã đổi hướng.');
    },

    'doc-tin': function (el) {
      var i = +el.getAttribute('data-i');
      U.moTin[i] = !U.moTin[i];
      if (ST.msgs[i]) ST.msgs[i].doc = true;
      U.ve();
    },
    'doc-het': function () { for (var i = 0; i < ST.msgs.length; i++) ST.msgs[i].doc = true; U.ve(); },
    'xoa-tin': function () { ST.msgs = []; U.moTin = {}; U.ve(); },
    'xem-tt': function (el) {
      var bc = ST.spy && ST.spy[el.getAttribute('data-key')];
      if (bc) U.hop('Tin tình báo ' + G.tdStr(bc.td), U.veDoTham(bc));
    },

    'lm-vao': function (el) {
      var ten = G.LIEN_MINH[+el.getAttribute('data-i')];
      ST.lm = { ten: ten, t: ST.now };
      G.tin(ST, 'he', 'Đã gia nhập liên minh', 'Ta chính thức là thành viên của ' + ten + '. Sản lượng toàn đế quốc +5%.');
      bao(null, 'Đã gia nhập ' + ten + '.');
    },
    'lm-ra': function () { ST.lm = null; bao(null, 'Đã rời liên minh.'); },

    xuat: function () {
      var js = JSON.stringify(ST);
      U.hop('Xuất bàn chơi',
        '<p class="mo">Sao chép toàn bộ đoạn dưới đây và lưu lại. Dán vào ô "Nạp bàn chơi" ở bất kỳ máy nào để chơi tiếp. ' +
        (COFILE ? 'Nút "Tải về file" cũng dùng được.' : '') + '</p>' +
        '<textarea id="xuat-js" style="width:100%;height:180px" readonly></textarea>' +
        '<div style="margin-top:8px"><button class="nut oke" data-act="xuat-copy">Sao chép</button>' +
        (COFILE ? ' <button class="nut" data-act="xuat-file">Tải về file</button>' : '') + '</div>');
      document.getElementById('xuat-js').value = js;
    },
    'xuat-copy': function () {
      var t = document.getElementById('xuat-js');
      t.select();
      var xong = false;
      try { xong = document.execCommand('copy'); } catch (e) { xong = false; }
      if (!xong && navigator.clipboard) {
        navigator.clipboard.writeText(t.value).then(function () { U.toast('Đã sao chép.', 'ok'); },
          function () { U.toast('Không sao chép được, hãy chọn tay rồi Ctrl+C.', 'loi'); });
        return;
      }
      U.toast(xong ? 'Đã sao chép.' : 'Không sao chép được, hãy chọn tay rồi Ctrl+C.', xong ? 'ok' : 'loi');
    },
/*[TAI-FILE-BAT-DAU]*/
    'xuat-file': function () {
      try {
        var b = new Blob([JSON.stringify(ST)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'thdc-' + ST.ten.replace(/\s+/g, '') + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        U.toast('Nếu trình duyệt không tải về được, hãy dùng nút Sao chép.');
      } catch (e) { U.toast('Không tải file được ở môi trường này — hãy dùng nút Sao chép.', 'loi'); }
    },
/*[TAI-FILE-KET-THUC]*/
    nhap: function () {
      U.hop('Nạp bàn chơi',
        '<p class="mo">Dán nội dung bàn chơi đã xuất vào đây rồi bấm Nạp. Bàn hiện tại sẽ bị ghi đè.</p>' +
        '<textarea id="nhap-js" style="width:100%;height:180px" placeholder=\'{"v":3,...}\'></textarea>' +
        '<div style="margin-top:8px"><button class="nut oke" data-act="nhap-ok">Nạp</button>' +
        (COFILE ? ' <button class="nut" data-act="nhap-file">Chọn file...</button>' : '') + '</div>');
    },
    'nhap-ok': function () {
      var v = (document.getElementById('nhap-js') || {}).value || '';
      try {
        var o = JSON.parse(v);
        if (!o || !o.planets || !o.planets.length) throw new Error('không phải bàn chơi hợp lệ');
        window.ST = ST = o; G.tick(ST, G.giay()); luu(true); U.dongHop(); U.ve();
        U.toast('Đã nạp bàn chơi.', 'ok');
      } catch (e) { U.toast('Nạp thất bại: ' + e.message, 'loi'); }
    },
    'nhap-file': function () { document.getElementById('file-nhap').click(); },
    'xoa-game': function () {
      U.hop('Xoá bàn chơi?', '<p>Toàn bộ tiến trình sẽ mất. Chắc chưa?</p>' +
        '<button class="nut xoa" data-act="xoa-that">Xoá và chơi lại</button> ' +
        '<button class="nut" data-act="dong-ht">Thôi</button>');
    },
    'xoa-that': function () { localStorage.removeItem(KEY); location.reload(); }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var a = el.getAttribute('data-act');
    if (ACT[a]) { e.preventDefault(); ACT[a](el); }
  });

  /* cập nhật form hạm đội mà không vẽ lại (giữ con trỏ trong ô nhập) */
  document.addEventListener('input', function (e) {
    if (!ST) return;
    var id = e.target.id || '';
    if (id === 'f-pct') { var v = document.getElementById('f-pct-v'); if (v) v.textContent = e.target.value + '%'; }
    if (/^(f-|ft-|fc-)/.test(id)) {
      U.capNhatForm();
      var tt = document.getElementById('hd-tt');
      if (tt) tt.innerHTML = U.ttBay();
      if (id === 'f-mission') U.ve();
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'chon-ht') { U.pi = +e.target.value; U.form = null; U.ve(); }
    if (e.target.id === 'file-nhap' && e.target.files && e.target.files[0]) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var o = JSON.parse(fr.result);
          if (!o.planets) throw new Error('file không đúng định dạng');
          window.ST = ST = o; G.tick(ST, G.giay()); luu(true); U.ve();
          U.toast('Đã nạp bàn chơi từ file.', 'ok');
        } catch (err) { U.toast('Nạp thất bại: ' + err.message, 'loi'); }
      };
      fr.readAsText(e.target.files[0]);
    }
  });

  /* ---------------- màn khởi động ---------------- */
  document.getElementById('kd-ver').textContent = G.VERSION;
  var cu = nap();
  if (cu) {
    var b = document.getElementById('kd-tieptuc');
    b.style.display = '';
    b.textContent = 'TIẾP TỤC: ' + cu.ten + ' — ' + G.so(G.diem(cu).tong) + ' điểm';
    b.onclick = function () { batDau(cu); };
  }
  document.getElementById('kd-batdau').onclick = function () {
    var ten = (document.getElementById('kd-ten').value || '').trim() || 'Chỉ Huy';
    var seed = (document.getElementById('kd-seed').value || '').trim() || null;
    if (cu && !confirm('Bàn chơi cũ sẽ bị ghi đè. Tiếp tục tạo bàn mới?')) return;
    batDau(G.moiGame(ten, seed));
    luu(true);
  };
  document.getElementById('nut-menu').onclick = function () {
    document.getElementById('menu').classList.toggle('mo-ra');
  };
  document.getElementById('kd-ten').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('kd-batdau').click();
  });
})();
