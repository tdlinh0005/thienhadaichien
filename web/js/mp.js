/* THIÊN HÀ ĐẠI CHIẾN — driver bản NHIỀU NGƯỜI
 * Client chỉ vẽ và gửi yêu cầu; server là bên quyết định mọi thứ.
 * Client vẫn chạy phần sản xuất tại chỗ (G.MO_PHONG_NHE) để các con số nhảy
 * êm giữa hai lần đồng bộ, nhưng không tự kết luận sự kiện nào.            */
'use strict';
(function () {
  var G = window.G, U = window.U, APP = window.APP;
  var KHOA_TOKEN = 'thdc_mp_token';
  var token = null;
  try { token = localStorage.getItem(KHOA_TOKEN); } catch (e) { token = null; }

  var MP = window.MP = { he: null, xh: null, lm: null, bt: null, sv: null, ten: null, lienLac: true };
  G.MO_PHONG_NHE = true;
  APP.mp = true;

  /* -------------------------------------------------- gọi API ---------- */
  function api(duong, dl, phuongThuc) {
    var opt = {
      method: phuongThuc || (dl ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opt.headers['x-thdc-token'] = token;
    if (dl) opt.body = JSON.stringify(dl);
    return fetch(duong, opt).then(function (r) {
      return r.json().catch(function () { return { loi: 'Máy chủ trả về dữ liệu không đọc được.' }; })
        .then(function (o) {
          netOK(true);
          if (r.status === 401 && token) { dangXuatCuc('Phiên đăng nhập đã hết hạn.'); throw new Error('Chưa đăng nhập.'); }
          if (!r.ok && o && o.loi) throw new Error(o.loi);
          if (!r.ok) throw new Error('Máy chủ lỗi ' + r.status + '.');
          return o;
        });
    }, function (e) {
      netOK(false);
      throw new Error('Mất kết nối tới máy chủ.');
    });
  }
  function netOK(ok) {
    MP.lienLac = ok;
    var e = document.getElementById('tt-net');
    if (e) { e.style.color = ok ? 'var(--luc)' : 'var(--do)'; e.title = ok ? 'Đã kết nối máy chủ' : 'Mất kết nối'; }
  }

  function apDung(goi) {
    if (goi.sv) {
      MP.sv = goi.sv;
      G.LECH_GIO = goi.sv.now - Math.floor(Date.now() / 1000);
    }
    if (goi.st) {
      window.ST = goi.st;
      if (U.pi >= goi.st.planets.length) U.pi = 0;
    }
    if (goi.toi) MP.ten = goi.toi.ten;
  }

  /* -------------------------------------------------- APP interface ---- */
  APP.lam = function (ten, dl, xong) {
    api('/api/lam', { ten: ten, dl: dl }).then(function (r) {
      apDung(r);
      if (xong) xong(r.loi || null);
    }, function (e) { if (xong) xong(e.message); });
  };
  APP.taiHe = function (g, h) {
    api('/api/he?g=' + g + '&h=' + h).then(function (r) {
      MP.he = r; U.ve();
    }, function (e) { U.toast(e.message, 'loi'); });
  };
  APP.luu = function () { U.toast('Bản nhiều người tự lưu trên máy chủ sau mỗi thao tác.'); };

  var demGiay = 0;
  APP.moiGiay = function () {
    if (++demGiay >= 8) { demGiay = 0; dongBo(); }
  };
  APP.hienLai = function () { dongBo(); };

  function dongBo() {
    if (!token) return;
    api('/api/state').then(function (r) { apDung(r); U.ve(); }, function () { });
  }

  /* -------------------------------------------------- nguồn dữ liệu ---- */
  U.nguon = {
    xemHe: function (g, h) {
      if (MP.he && MP.he.g === g && MP.he.h === h) return MP.he.o;
      APP.taiHe(g, h);
      return (MP.he && MP.he.o) || [];      /* giữ dữ liệu hệ cũ trong lúc chờ server */
    },
    xepHang: function () { return MP.xh || []; },
    dsLM: function () { return (MP.lm && MP.lm.ds) || []; },
    thanhVien: function () { return (MP.lm && MP.lm.tv) || []; }
  };

  /* -------------------------------------------------- menu & màn riêng - */
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
    { id: 'bangtin', ten: 'Bảng Tin Vũ Trụ' },
    { id: 'tinnhan', ten: 'Tin Nhắn' },
    { id: 'huongdan', ten: 'Hướng Dẫn' },
    { id: 'taikhoan', ten: 'Tài Khoản' }
  ];

  U.m_bangtin = function () {
    var bt = (MP.bt && MP.bt.bt) || [], tr = (MP.bt && MP.bt.tran) || [];
    var h = '<div class="panel"><h3>Chuyện đang xảy ra trong vũ trụ</h3><div class="noi">';
    if (!bt.length) h += '<span class="mo">Chưa có gì. Vũ trụ đang yên.</span>';
    else for (var i = 0; i < bt.length; i++)
      h += '<div><span class="hu sz">' + G.gio(bt[i].khi * 1000) + '</span> ' + U.esc(bt[i].noi) + '</div>';
    h += '</div></div>';

    h += '<div class="panel"><h3>Những trận đánh gần nhất</h3><div class="noi bang-cuon">';
    if (!tr.length) h += '<span class="mo">Chưa có trận nào.</span>';
    else {
      h += '<table><tr><th>Lúc</th><th>Toạ độ</th><th>Kết quả</th><th class="r">Cướp được</th><th class="r">Tàu mất (công/thủ)</th></tr>';
      for (var j = 0; j < tr.length; j++) {
        var t = tr[j];
        h += '<tr><td class="sz">' + G.gio(t.khi * 1000) + '</td><td class="sz">[' + U.esc(t.td) + ']</td><td>' +
          (t.kq === 'thang' ? '<span class="do">bên tấn công thắng</span>' :
            (t.kq === 'thua' ? '<span class="luc">bên phòng thủ giữ được</span>' : '<span class="vang">cầm cự</span>')) +
          '</td><td class="r sz">' + G.so(t.cuop) + '</td><td class="r sz">' + G.so(t.matA) + ' / ' + G.so(t.matD) + '</td></tr>';
      }
      h += '</table>';
    }
    h += '</div></div>';
    return h;
  };

  U.m_taikhoan = function () {
    var st = U.st(), d = G.diem(st), sv = MP.sv || {};
    var h = '<div class="luoi2">';
    h += '<div class="panel"><h3>Tài khoản</h3><div class="noi"><table>' +
      '<tr><td>Chỉ huy</td><td class="r">' + U.esc(MP.ten || st.ten) + '</td></tr>' +
      '<tr><td>Liên minh</td><td class="r">' + U.esc(st.lm ? st.lm.ten : '—') + '</td></tr>' +
      '<tr><td>Điểm</td><td class="r sz">' + G.so(d.tong) + '</td></tr>' +
      '<tr><td>Số hành tinh</td><td class="r sz">' + st.planets.length + ' / ' + G.maxThuocDia(st) + '</td></tr>' +
      '<tr><td>Chu kỳ bảo trì đã qua</td><td class="r sz">' + st.soChuKy + '</td></tr>' +
      '<tr><td>Trận thắng / thua</td><td class="r sz">' + st.stats.thang + ' / ' + st.stats.thua + '</td></tr>' +
      '<tr><td>Tài nguyên đã cướp</td><td class="r sz">' + G.so(st.stats.cuop) + '</td></tr>' +
      '<tr><td>Tàu địch bắn hạ</td><td class="r sz">' + G.so(st.stats.tauDietDich) + '</td></tr>' +
      '<tr><td>Tàu của ta bị mất</td><td class="r sz">' + G.so(st.stats.tauMat) + '</td></tr>' +
      '</table>' +
      '<div style="margin-top:8px"><button class="nut nho" data-act="doi-mk">Đổi mật khẩu</button> ' +
      '<button class="nut nho xoa" data-act="dangxuat">Đăng xuất</button></div>' +
      '</div></div>';

    h += '<div class="panel"><h3>Máy chủ</h3><div class="noi"><table>' +
      '<tr><td>Hạt giống vũ trụ</td><td class="r sz">' + U.esc(sv.seed || '—') + '</td></tr>' +
      '<tr><td>Số tài khoản</td><td class="r sz">' + G.so(sv.soNguoi || 0) + '</td></tr>' +
      '<tr><td>Hành tinh đã có chủ</td><td class="r sz">' + G.so(sv.soHT || 0) + '</td></tr>' +
      '<tr><td>Tốc độ sản xuất</td><td class="r sz">x' + (sv.tocDo || G.C.TOC_DO_SERVER) + '</td></tr>' +
      '<tr><td>Tốc độ bay</td><td class="r sz">x' + (sv.tocDoBay || G.C.TOC_DO_BAY) + '</td></tr>' +
      '<tr><td>Chu kỳ bảo trì</td><td class="r sz">' + ((sv.chuKy || G.C.CHU_KY_BAO_TRI) / 3600) + ' giờ</td></tr>' +
      '<tr><td>Phiên bản</td><td class="r sz">' + U.esc(sv.phienBan || G.VERSION) + '</td></tr>' +
      '</table><p class="mo">Đế quốc của ta chạy trên máy chủ 24/7: kể cả khi ta thoát ra, sản xuất vẫn tiếp tục, ' +
      'chu kỳ bảo trì vẫn trừ tiền, và người chơi khác vẫn đánh được vào hành tinh của ta.</p></div></div>';
    h += '</div>';

    h += '<div class="panel"><h3>Nhật ký</h3><div class="noi">';
    if (!st.nk.length) h += '<span class="mo">Chưa có gì.</span>';
    else for (var i = 0; i < st.nk.length; i++)
      h += '<div><span class="hu sz">' + G.gio(st.nk[i].t * 1000) + '</span> ' + U.esc(st.nk[i].s) + '</div>';
    h += '</div></div>';
    return h;
  };

  /* thêm phần lập liên minh vào màn liên minh */
  var lmGoc = U.m_lienminh;
  U.m_lienminh = function () {
    var st = U.st();
    var h = lmGoc();
    if (!st.lm) {
      h += '<div class="panel"><h3>Lập liên minh mới</h3><div class="noi">' +
        '<div class="gal-dh">Thẻ <input id="lm-tag" maxlength="6" style="width:80px" placeholder="THDC">' +
        'Tên <input id="lm-ten" maxlength="32" style="width:220px" placeholder="Thiên Hà Đại Chiến">' +
        '<button class="nut oke" data-act="lm-tao">Lập</button></div>' +
        '<p class="mo">Thẻ 2–6 chữ/số, hiện trước tên trên bảng xếp hạng. Người lập là chủ liên minh.</p>' +
        '</div></div>';
    }
    return h;
  };

  /* -------------------------------------------------- hành động riêng -- */
  var manCu = APP.ACT.man;
  APP.themACT({
    man: function (el) {
      var m = el.getAttribute('data-man');
      manCu(el);
      if (m === 'thienha') {
        if (!U.gal) { var c = U.st().planets[0].c; U.gal = { g: c.g, h: c.h }; }
        APP.taiHe(U.gal.g, U.gal.h);
      }
      if (m === 'xephang') api('/api/xephang').then(function (r) { MP.xh = r.ds; U.ve(); }, function () { });
      if (m === 'lienminh') api('/api/lm').then(function (r) { MP.lm = r; U.ve(); }, function () { });
      if (m === 'bangtin') api('/api/bangtin').then(function (r) { MP.bt = r; U.ve(); }, function () { });
    },
    /* vào/ra liên minh xong phải nạp lại danh sách thành viên từ server */
    'lm-vao': function (el) {
      APP.lam('lmvao', { ten: el.getAttribute('data-ten') }, function (err) {
        if (err) return U.toast(err, 'loi');
        api('/api/lm').then(function (l) { MP.lm = l; U.ve(); U.toast('Đã gia nhập liên minh.', 'ok'); },
          function () { U.ve(); });
      });
    },
    'lm-ra': function () {
      APP.lam('lmra', {}, function (err) {
        if (err) return U.toast(err, 'loi');
        api('/api/lm').then(function (l) { MP.lm = l; U.ve(); U.toast('Đã rời liên minh.', 'ok'); },
          function () { U.ve(); });
      });
    },
    'lm-tao': function () {
      var ten = (document.getElementById('lm-ten') || {}).value || '';
      var tag = (document.getElementById('lm-tag') || {}).value || '';
      api('/api/lmtao', { ten: ten, tag: tag }).then(function (r) {
        if (r.loi) return U.toast(r.loi, 'loi');
        apDung(r);
        api('/api/lm').then(function (l) { MP.lm = l; U.ve(); U.toast('Đã lập liên minh.', 'ok'); }, function () { U.ve(); });
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'doi-mk': function () {
      U.hop('Đổi mật khẩu',
        '<div class="kd-form"><label>Mật khẩu hiện tại</label><input id="mk-cu" type="password">' +
        '<label>Mật khẩu mới</label><input id="mk-moi" type="password">' +
        '<button class="nut oke" data-act="doi-mk-ok" style="margin-top:10px">Đổi</button></div>');
    },
    'doi-mk-ok': function () {
      api('/api/doimk', {
        cu: (document.getElementById('mk-cu') || {}).value || '',
        moi: (document.getElementById('mk-moi') || {}).value || ''
      }).then(function () { U.dongHop(); U.toast('Đã đổi mật khẩu.', 'ok'); },
        function (e) { U.toast(e.message, 'loi'); });
    },
    dangxuat: function () {
      api('/api/dangxuat', {}).then(function () { dangXuatCuc(null); }, function () { dangXuatCuc(null); });
    }
  });

  function dangXuatCuc(msg) {
    try { localStorage.removeItem(KHOA_TOKEN); } catch (e) { }
    token = null; window.ST = null;
    document.getElementById('game').style.display = 'none';
    document.getElementById('man-khoidong').style.display = '';
    if (msg) loi(msg);
  }

  /* -------------------------------------------------- màn đăng nhập ---- */
  function loi(s) {
    var e = document.getElementById('kd-loi');
    e.style.display = s ? '' : 'none';
    e.textContent = s || '';
  }
  function vaoGame(goi) {
    apDung(goi);
    loi(null);
    document.getElementById('man-khoidong').style.display = 'none';
    document.getElementById('game').style.display = '';
    G.tick(window.ST, G.giay());
    U.ve();
  }

  document.getElementById('tab-dn').onclick = function () {
    document.getElementById('form-dn').style.display = '';
    document.getElementById('form-dk').style.display = 'none';
    loi(null);
  };
  document.getElementById('tab-dk').onclick = function () {
    document.getElementById('form-dn').style.display = 'none';
    document.getElementById('form-dk').style.display = '';
    loi(null);
  };
  document.getElementById('nut-dn').onclick = function () {
    var b = this; b.disabled = true;
    api('/api/dangnhap', {
      ten: document.getElementById('dn-ten').value,
      mk: document.getElementById('dn-mk').value
    }).then(function (r) {
      token = r.token;
      try { localStorage.setItem(KHOA_TOKEN, token); } catch (e) { }
      return api('/api/state');
    }).then(function (g) { b.disabled = false; vaoGame(g); },
      function (e) { b.disabled = false; loi(e.message); });
  };
  document.getElementById('nut-dk').onclick = function () {
    var b = this; b.disabled = true;
    api('/api/dangky', {
      ten: document.getElementById('dk-ten').value,
      hienthi: document.getElementById('dk-hienthi').value,
      mk: document.getElementById('dk-mk').value
    }).then(function (r) {
      token = r.token;
      try { localStorage.setItem(KHOA_TOKEN, token); } catch (e) { }
      U.toast('Hành tinh của ta ở ' + G.tdStr(r.nha) + '.', 'ok');
      return api('/api/state');
    }).then(function (g) { b.disabled = false; vaoGame(g); },
      function (e) { b.disabled = false; loi(e.message); });
  };
  ['dn-mk', 'dk-mk'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById(id === 'dn-mk' ? 'nut-dn' : 'nut-dk').click();
    });
  });
  document.getElementById('nut-menu').onclick = function () {
    document.getElementById('menu').classList.toggle('mo-ra');
  };

  /* -------------------------------------------------- khởi động -------- */
  document.getElementById('kd-ver').textContent = G.VERSION;
  api('/api/thongtin').then(function (sv) {
    MP.sv = sv;
    G.LECH_GIO = sv.now - Math.floor(Date.now() / 1000);
    document.getElementById('kd-sv').innerHTML =
      'Năm <b>' + G.NAM_BOI_CANH + '</b> &middot; vũ trụ <b>' + U.esc(sv.seed) + '</b><br>' +
      G.so(sv.soNguoi) + ' chỉ huy &middot; ' + G.so(sv.soHT) + ' hành tinh đã có chủ &middot; ' +
      'sản xuất x' + sv.tocDo + ' &middot; bảo trì mỗi ' + (sv.chuKy / 3600) + ' giờ';
  }, function () {
    document.getElementById('kd-sv').textContent = 'Không liên lạc được với máy chủ.';
  });

  if (token) {
    api('/api/state').then(function (g) { vaoGame(g); }, function () { /* token cũ: ở lại màn đăng nhập */ });
  }
  APP.batDauNhip();
})();
