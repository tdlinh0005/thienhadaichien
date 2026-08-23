/* THIÊN HÀ ĐẠI CHIẾN — driver bản MỘT NGƯỜI
 * State nằm trong localStorage, mọi hành động chạy thẳng trên máy.
 * (Bản nhiều người dùng web/js/mp.js thay cho file này.)                  */
'use strict';
(function () {
  var G = window.G, U = window.U, APP = window.APP;
  var KEY = 'thdc_save_v6', KEY_CU = ['thdc_save_v5', 'thdc_save_v4', 'thdc_save_v3'];
  var ST = null;
  var LOI_NAP = '';
  var COFILE = !window.THDC_ARTIFACT;   // trong Artifact không tải file được

  /* ---------------- lưu / nạp ---------------- */
  function luu(im) {
    if (!ST) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(ST));
      if (!im) U.toast('Đã lưu bàn chơi.', 'ok');
    } catch (e) { U.toast('Không lưu được: ' + e.message, 'loi'); }
  }
  function chuanHoa(o) {
    if (!o || !Array.isArray(o.planets) || !o.planets.length)
      throw new Error('không phải bàn chơi hợp lệ');
    var v = Math.max(0, Math.floor(Number(o.v) || 0));
    if (v > G.STATE_VERSION)
      throw new Error('bàn chơi dùng state v' + v + ', mới hơn engine v' + G.STATE_VERSION);
    G.nangCapState(o, G.giay());
    if (o.v !== G.STATE_VERSION || o.moHinhCT !== 'so-luong-v1' ||
        o.moHinhNhip !== 'bao-tri-dan-su-v1' || o.moHinhQuyDao !== 'giu-quy-dao-v1')
      throw new Error('marker mô hình state không hợp lệ cho state v' + o.v);
    o.toi = Array.isArray(o.toi) ? o.toi : [];
    o.tenLua = Array.isArray(o.tenLua) ? o.tenLua : [];
    o.fleets = Array.isArray(o.fleets) ? o.fleets : [];
    o.npc = o.npc || {}; o.debris = o.debris || {}; o.msgs = Array.isArray(o.msgs) ? o.msgs : [];
    o.nk = Array.isArray(o.nk) ? o.nk : [];
    o.stats = o.stats || { thang: 0, thua: 0, cuop: 0, tauMat: 0, tauDietDich: 0, chuyenBay: 0 };
    o.fleetIdSeq = o.fleetIdSeq || 1;
    return o;
  }
  function nap() {
    var nguon = null;
    try {
      var s = localStorage.getItem(KEY);
      for (var i = 0; !s && i < KEY_CU.length; i++) {
        s = localStorage.getItem(KEY_CU[i]);
        if (s) nguon = KEY_CU[i];
      }
      if (!s) return null;
      var o = chuanHoa(JSON.parse(s));
      /* Chỉ ghi key mới sau khi parse + migration + validation đã thành công.
         Các key v5/v4/v3 được giữ nguyên làm bản raw dự phòng cho tới khi người
         chơi tự xoá bàn; bản v6 luôn được ưu tiên nên save cũ không sống lại. */
      if (nguon) localStorage.setItem(KEY, JSON.stringify(o));
      return o;
    } catch (e) { LOI_NAP = e && e.message || String(e); return null; }
  }

  /* ---------------- APP: chạy hành động tại chỗ ---------------- */
  APP.mp = false;
  APP.luu = luu;
  APP.lam = function (ten, dl, xong) {
    var err = G.chay(ST, ten, dl);
    if (!err) luu(true);
    if (xong) xong(err);
  };
  APP.moiGiay = (function () {
    var dem = 0;
    return function () { if (++dem >= 15) { dem = 0; luu(true); } };
  })();

  function batDau(st) {
    window.ST = ST = chuanHoa(st);
    document.getElementById('man-khoidong').style.display = 'none';
    document.getElementById('game').style.display = '';
    G.tick(ST, G.giay());
    U.ve();
  }
  window.addEventListener('beforeunload', function () { luu(true); });

  /* ---------------- hành động riêng của bản một người ---------------- */
  APP.themACT({
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
        '<textarea id="nhap-js" style="width:100%;height:180px" placeholder=\'{"v":6,...}\'></textarea>' +
        '<div style="margin-top:8px"><button class="nut oke" data-act="nhap-ok">Nạp</button>' +
        (COFILE ? ' <button class="nut" data-act="nhap-file">Chọn file...</button>' : '') + '</div>');
    },
    'nhap-ok': function () {
      var v = (document.getElementById('nhap-js') || {}).value || '';
      try {
        var o = JSON.parse(v);
        o = chuanHoa(o);
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
    'xoa-that': function () {
      /* Ngăn beforeunload ghi lại đúng bàn vừa xoá trong lúc reload. */
      ST = null; window.ST = null;
      localStorage.removeItem(KEY);
      for (var i = 0; i < KEY_CU.length; i++) localStorage.removeItem(KEY_CU[i]);
      location.reload();
    }
  });

  APP.doiFile = function (e) {
    if (e.target.id === 'file-nhap' && e.target.files && e.target.files[0]) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var o = JSON.parse(fr.result);
          o = chuanHoa(o);
          window.ST = ST = o; G.tick(ST, G.giay()); luu(true); U.ve();
          U.toast('Đã nạp bàn chơi từ file.', 'ok');
        } catch (err) { U.toast('Nạp thất bại: ' + err.message, 'loi'); }
      };
      fr.readAsText(e.target.files[0]);
    }
  };

  /* ---------------- màn khởi động ---------------- */
  document.getElementById('kd-ver').textContent = G.VERSION;
  var cu = nap();
  if (LOI_NAP) {
    var kd = document.querySelector('.kd-form');
    if (kd) kd.insertAdjacentHTML('beforeend', '<div class="canh" style="margin-top:10px">Không nạp được bàn cũ: ' +
      U.esc(LOI_NAP) + '. Dữ liệu gốc vẫn được giữ nguyên.</div>');
  }
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
  APP.batDauNhip();
})();
