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

  var MP = window.MP = { he: null, xh: null, lm: null, bt: null, chat: null, sv: null, ten: null,
    cho: null, choLoai: 'sieuthi', lienLac: true };
  G.MO_PHONG_NHE = true;
  APP.mp = true;

  /* -------------------------------------------------- gọi API ---------- */
  function api(duong, dl, phuongThuc) {
    var tokenLucGoi = token;
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
          /* Bỏ mọi response thuộc phiên cũ; request A có thể về muộn sau khi
             người dùng đã logout rồi đăng nhập B trong cùng tab. */
          if (tokenLucGoi !== token) throw new Error('Phiên đã thay đổi.');
          if (r.status === 401 && token) { dangXuatCuc('Phiên đăng nhập đã hết hạn.');
            throw new Error('Chưa đăng nhập.'); }
          if (!r.ok) {
            var err = new Error(o && o.loi ? o.loi : ('Máy chủ lỗi ' + r.status + '.'));
            if (o && o.code) err.code = o.code;
            throw err;
          }
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
      if (r && r.code === 'TICK_PARTIAL') {
        if (xong) xong(r.loi || 'Máy chủ đang đồng bộ, hãy thử lại.', {code: 'TICK_PARTIAL'});
        return;
      }
      apDung(r);
      if (xong) xong(r.loi || null);
    }, function (e) {
      if (xong) xong(e.message, e.code === 'TICK_PARTIAL' ? {code: 'TICK_PARTIAL'} : undefined);
    });
  };
  APP.taiXepHang = function (loai) {
    api('/api/xephang?loai=' + encodeURIComponent(loai || 'tong')).then(function (r) {
      MP.xh = r.ds; U.ve();
    }, function (e) { U.toast(e.message, 'loi'); });
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
    api('/api/state').then(function (r) {
      apDung(r);
      /* Chỉ vẽ lại khi có gì đó thật sự đổi. Vẽ lại vô điều kiện mỗi 8 giây sẽ
         xoá mất những gì người chơi đang gõ dở trong các ô nhập. */
      if (U.sig() !== U.sigCu) U.ve(); else U.live();
      if (U.man === 'chat') taiChat(false).catch(function () { });
      if (U.man === 'lienminh') taiLienMinh(false).catch(function () { });
      if (U.man === 'cho') taiCho(false).catch(function () { });
    }, function () { });
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
    thanhVien: function () { return (MP.lm && MP.lm.tv) || []; },
    daXin: function (ten) {
      var ds = (MP.lm && MP.lm.xin) || [];
      for (var i = 0; i < ds.length; i++) if (ds[i].lm === ten) return true;
      return false;
    }
  };

  function taiLienMinh(veToan) {
    return api('/api/lm').then(function (r) {
      var thayDoi = JSON.stringify(MP.lm) !== JSON.stringify(r);
      MP.lm = r;
      if (U.man === 'lienminh' && (veToan || thayDoi)) U.ve();
      return r;
    }, function (e) {
      if (veToan) U.toast(e.message, 'loi');
      throw e;
    });
  }

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
    { id: 'cho', ten: 'Chợ Thiên Hà' },
    { id: 'lienminh', ten: 'Liên Minh' },
    { id: 'xephang', ten: 'Bảng Xếp Hạng' },
    { id: 'bangtin', ten: 'Bảng Tin Vũ Trụ' },
    { id: 'chat', ten: 'Phòng Chat' },
    { id: 'mophong', ten: 'Máy Tính Trận' },
    { id: 'tinnhan', ten: 'Tin Nhắn' },
    { id: 'huongdan', ten: 'Hướng Dẫn' },
    { id: 'taikhoan', ten: 'Tài Khoản' }
  ];

  /* ---------------------------------------------- chợ dùng chung ------- */
  function taiCho(veToan) {
    return api('/api/cho?loai=' + encodeURIComponent(MP.choLoai)).then(function (r) {
      var thayDoi = JSON.stringify(MP.cho) !== JSON.stringify(r);
      MP.cho = r;
      if (U.man === 'cho' && (veToan || thayDoi)) U.ve();
      return r;
    }, function (e) {
      if (veToan) U.toast(e.message, 'loi');
      throw e;
    });
  }

  function soO(id) {
    var e = document.getElementById(id);
    return Math.floor(+((e && e.value) || 0));
  }

  /* Giá gốc mỗi đơn vị, đúng công thức server dùng cho Siêu Thị. */
  function choGiaGoc(res) { return 1 / G.C.TY_GIA[res]; }

  /* Đắt hay rẻ so với giá gốc — con số trần trụi "4 Galana" không nói lên gì
     nếu người chơi không nhẩm được 1 Galana đổi được 45 Kim Loại. */
  function choNhanGia(res, gia) {
    var goc = choGiaGoc(res);
    if (!(goc > 0)) return '';
    var ty = gia / goc;
    var pt = Math.round(Math.abs(ty - 1) * 100);
    if (pt < 3) return '<span class="mo sz">≈ giá gốc</span>';
    return ty < 1
      ? '<span class="luc sz">rẻ hơn gốc ' + pt + '%</span>'
      : '<span class="do sz">đắt hơn gốc ' + pt + '%</span>';
  }

  /* Người bán phải thấy TRƯỚC mình cầm về bao nhiêu sau thuế, chứ không phải
     đăng xong rồi mới biết. Đọc thẳng từ các ô đang gõ nên cập nhật tức thì. */
  function choUocBan() {
    var c = MP.cho;
    if (!c) return '&nbsp;';
    var res = (document.getElementById('sap-res') || {}).value || 'metal';
    var sl = soO('sap-sl');
    var gia = MP.choLoai === 'sieuthi'
      ? choGiaGoc(res)
      : +((document.getElementById('sap-gia') || {}).value || 0);
    if (!(sl > 0) || !(gia > 0)) return 'Nhập số lượng' +
      (MP.choLoai === 'sieuthi' ? '' : ' và giá') + ' để xem sẽ nhận về bao nhiêu.';
    var tho = Math.ceil(gia * sl);
    var thue = Math.ceil(tho * c.thue);
    var rd = G.byId(G.RES, res);
    return 'Bán hết lô này thu <b class="vang">' + G.so(tho - thue) + ' Galana</b> ' +
      '<span class="mo">(gộp ' + G.so(tho) + ', thuế ' + G.so(thue) + ')</span> — ' +
      choNhanGia(res, gia) + '. Kho ' + U.esc(rd ? rd.ten : res) + ' bị giữ ' +
      G.so(sl) + ' ngay khi đăng.';
  }

  /* Tính lại các con số ước tính TẠI CHỖ, không vẽ lại cả màn — vẽ lại sẽ
     xoá mất số người chơi đang gõ dở. Dùng tiền tố `sap-` chứ không phải
     `cho-`: bản một người đã bắt mọi ô `cho-*` cho siêu thị NPC của nó, dùng
     lại tiền tố đó là hai tính năng giẫm chân nhau. */
  function choTinhLai() {
    if (U.man !== 'cho' || !MP.cho) return;
    var uoc = document.getElementById('sap-uoc');
    if (uoc) uoc.innerHTML = choUocBan();
    var ds = (MP.cho.ds || []), i;
    for (i = 0; i < ds.length; i++) {
      var x = ds[i];
      var o = document.getElementById('sap-mua-' + x.id);
      var ra = document.getElementById('sap-tien-' + x.id);
      if (!o || !ra) continue;
      var n = Math.max(0, Math.floor(+o.value || 0));
      if (!n) { ra.innerHTML = '&nbsp;'; continue; }
      if (n > Math.floor(x.sl)) { ra.innerHTML = '<span class="do">lô chỉ còn ' +
        G.so(Math.floor(x.sl)) + '</span>'; continue; }
      var tien = Math.ceil(x.gia * n);
      var du = (U.st().galana || 0) >= tien;
      ra.innerHTML = '<span class="' + (du ? 'vang' : 'do') + '">' + G.so(tien) + ' Galana</span>' +
        (du ? '' : ' <span class="do">— không đủ</span>');
    }
  }

  document.addEventListener('input', function (e) {
    if (U.man !== 'cho') return;
    if (/^sap-/.test(e.target.id || '')) choTinhLai();
  });
  document.addEventListener('change', function (e) {
    if (U.man !== 'cho') return;
    if ((e.target.id || '') === 'sap-res') choTinhLai();
  });

  /* Cả hai chợ dùng chung một bảng lô hàng; khác nhau ở thuế và ở chỗ Siêu Thị
     ép giá gốc còn Chợ Tự Do để người bán tự ra giá. */
  U.m_cho = function () {
    var st = U.st(), c = MP.cho;
    var laST = MP.choLoai === 'sieuthi';
    var h = '<div class="panel"><h3>Chợ Thiên Hà</h3><div class="noi">';
    h += '<div class="hd-td" style="margin-bottom:8px">' +
      '<button class="nut nho' + (laST ? ' oke' : '') + '" data-act="cho-tab" data-loai="sieuthi">' +
        'Siêu Thị Thiên Hà</button>' +
      '<button class="nut nho' + (laST ? '' : ' oke') + '" data-act="cho-tab" data-loai="tudo">' +
        'Chợ Tự Do</button></div>';
    if (!c) return h + '<span class="mo">Đang nối vào chợ...</span></div></div>';

    h += '<p class="mo">' + (laST
      ? 'Siêu Thị bán <b>hàng do chính người chơi ký gửi</b>, theo <b>giá gốc cố định</b> — ' +
        'không ai ép giá ai được. Thuế <b>' + Math.round(c.thue * 100) + '%</b> trừ vào tiền người bán.'
      : 'Chợ Tự Do để <b>người bán tự ra giá</b> và người mua tự cân nhắc. Thuế nhẹ hơn, chỉ <b>' +
        Math.round(c.thue * 100) + '%</b>.') +
      ' Hàng đăng bán bị <b>giữ khỏi kho ngay</b>, và hàng mua <b>tới hành tinh sau ' +
      G.tg(c.giaoSau) + '</b>.</p>';

    /* ---- đăng bán ---- */
    h += '<h4 style="margin:10px 0 4px">Ký gửi hàng</h4>';
    h += '<div class="hd-td"><select id="sap-res">';
    for (var i = 0; i < G.RES.length; i++) {
      var rr = G.RES[i];
      if (!G.C.TY_GIA[rr.id]) continue;
      h += '<option value="' + rr.id + '">' + U.esc(rr.ten) + ' (còn ' +
        G.so(Math.floor(U.ht().res[rr.id] || 0)) + ')</option>';
    }
    h += '</select>' +
      '<input id="sap-sl" type="number" min="1" step="1000" value="0" placeholder="số lượng">';
    if (!laST) h += '<input id="sap-gia" type="number" min="0" step="1" value="1" ' +
      'placeholder="Galana/đơn vị" title="giá mỗi đơn vị">';
    h += '<button class="nut nho oke" data-act="cho-dang">Đăng bán từ ' +
      U.esc(U.ht().ten) + '</button></div>';
    h += '<p class="mo" style="margin-top:4px" id="sap-uoc">' + choUocBan() + '</p>';
    if (laST) h += '<p class="mo">Giá gốc: 1 Galana = ' +
      G.C.TY_GIA.metal + ' Kim Loại / ' + G.C.TY_GIA.crystal + ' Thạch Anh / ' +
      G.C.TY_GIA.deut + ' Nhiên Liệu / ' + G.C.TY_GIA.food + ' Thực Phẩm.</p>';

    /* ---- lô của mình ---- */
    var cua = c.cuaToi || [];
    h += '<h4 style="margin:12px 0 4px">Lô của ta (' + cua.length + '/' + c.toiDa + ')</h4>';
    if (!cua.length) h += '<span class="mo">Chưa ký gửi gì.</span>';
    else {
      h += '<table><tr><th>Chợ</th><th>Mặt hàng</th><th class="r">Còn lại</th>' +
        '<th class="r">Giá</th><th class="r"></th></tr>';
      for (var j = 0; j < cua.length; j++) {
        var o = cua[j], ro = G.byId(G.RES, o.res);
        h += '<tr><td class="sz">' + (o.loai === 'sieuthi' ? 'Siêu Thị' : 'Tự Do') + '</td>' +
          '<td><span style="color:' + U.mau(o.res, ro ? ro.mau : '#fff') + '">' +
            U.esc(ro ? ro.ten : o.res) + '</span></td>' +
          '<td class="r sz">' + G.so(Math.floor(o.sl)) + '</td>' +
          '<td class="r sz vang">' + G.soNgan(o.gia) + '</td>' +
          '<td class="r"><button class="nut nho xoa" data-act="cho-go" data-id="' + o.id +
            '">Gỡ</button></td></tr>';
      }
      h += '</table>';
    }
    h += '</div></div>';

    /* ---- sạp hàng ---- */
    h += '<div class="panel"><h3>' + (laST ? 'Quầy Siêu Thị' : 'Sạp Chợ Tự Do') +
      '</h3><div class="noi bang-cuon">';
    var ds = c.ds || [];
    if (!ds.length) h += '<span class="mo">Chưa ai bày hàng ở đây.</span>';
    else {
      h += '<table><tr><th>Người bán</th><th>Mặt hàng</th><th class="r">Còn</th>' +
        '<th class="r">Giá / đơn vị</th><th class="r">Mua</th></tr>';
      for (var k = 0; k < ds.length; k++) {
        var x = ds[k], rx = G.byId(G.RES, x.res);
        var laToi = MP.cho.cuaToi.some(function (y) { return y.id === x.id; });
        var duMua = Math.max(0, Math.min(Math.floor(x.sl),
          Math.floor((st.galana || 0) / Math.max(1e-9, x.gia))));
        h += '<tr><td class="sz">' + U.esc(x.tenBan) + (laToi ? ' <span class="mo">(ta)</span>' : '') +
          '</td>' +
          '<td><span style="color:' + U.mau(x.res, rx ? rx.mau : '#fff') + '">' +
            U.esc(rx ? rx.ten : x.res) + '</span></td>' +
          '<td class="r sz">' + G.so(Math.floor(x.sl)) + '</td>' +
          '<td class="r sz"><span class="vang">' + G.soNgan(x.gia) + '</span><br>' +
            choNhanGia(x.res, x.gia) + '</td>' +
          '<td class="r">' + (laToi ? '<span class="mo sz">—</span>' :
            '<input type="number" min="1" step="1000" value="0" id="sap-mua-' + x.id +
              '" data-gia="' + x.gia + '" data-max="' + Math.floor(x.sl) +
              '" style="width:110px"> ' +
            '<button class="nut nho" data-act="cho-het" data-id="' + x.id +
              '" data-n="' + duMua + '" title="Mua nhiều nhất trong khả năng chi trả">Tối đa</button> ' +
            '<button class="nut nho oke" data-act="cho-mua" data-id="' + x.id + '">Mua</button>' +
            '<div class="mo sz" id="sap-tien-' + x.id + '">&nbsp;</div>') + '</td></tr>';
      }
      h += '</table>';
    }
    h += '</div></div>';

    /* ---- hàng đang trên đường ---- */
    var dsGiao = G.giaoHang(st);
    h += '<div class="panel"><h3>Hàng đang trên đường về</h3><div class="noi">';
    if (!dsGiao.length) h += '<span class="mo">Không có chuyến nào.</span>';
    else {
      h += '<table><tr><th>Lô hàng</th><th class="r">Tới sau</th><th>Về</th></tr>';
      for (var g = 0; g < dsGiao.length; g++) {
        var gg = dsGiao[g], pg = st.planets[gg.pi], rg = G.byId(G.RES, gg.res);
        h += '<tr><td>' + G.so(gg.n) + ' ' + U.esc(rg ? rg.ten : gg.res) + '</td>' +
          '<td class="r sz">' + U.dem(gg.den_t) + '</td>' +
          '<td class="sz">' + U.esc(pg ? pg.ten : '—') + '</td></tr>';
      }
      h += '</table>';
    }
    h += '</div></div>';
    return h;
  };

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
      h += '<table><tr><th>Lúc</th><th>Toạ độ</th><th>Kết quả</th><th ' +
        'class="r">Cướp được</th><th class="r">Tàu mất (công/thủ)</th></tr>';
      for (var j = 0; j < tr.length; j++) {
        var t = tr[j];
        h += '<tr><td class="sz">' + G.gio(t.khi * 1000) + '</td><td class="sz">[' + U.esc(t.td) + ']</td><td>' +
          (t.kq === 'thang' ? '<span class="do">bên tấn công thắng</span>' :
            (t.kq === 'thua' ? '<span class="luc">bên phòng thủ giữ được</span>' :
              '<span class="vang">cầm cự</span>')) +
          '</td><td class="r sz">' + G.so(t.cuop) + '</td><td class="r sz">' + G.so(t.matA) + ' / ' +
            G.so(t.matD) + '</td></tr>';
      }
      h += '</table>';
    }
    h += '</div></div>';
    return h;
  };

  function noiChat(ds, dangTai) {
    if (dangTai) return '<span class="mo">Đang nối vào kênh...</span>';
    if (!ds || !ds.length) return '<span class="mo">Chưa có ai lên tiếng.</span>';
    var h = '';
    for (var i = 0; i < ds.length; i++) {
      var m = ds[i], tag = String(m.lm || '').match(/^\[[^\]]+\]/);
      h += '<div class="chat-dong"><span class="hu sz">' + G.gio(m.khi * 1000) + '</span> ' +
        '<b>' + U.esc(m.ten) + '</b>' + (tag ? ' <span class="tag-lm">' + U.esc(tag[0]) + '</span>' : '') +
        '<span class="chat-noi">' + U.esc(m.noi) + '</span></div>';
    }
    return h;
  }

  function capNhatChat() {
    if (U.man !== 'chat' || !MP.chat) return;
    var chung = document.getElementById('chat-ds-chung');
    var lm = document.getElementById('chat-ds-lienminh');
    if (chung) {
      var satDay = chung.scrollHeight - chung.scrollTop - chung.clientHeight < 48;
      chung.innerHTML = noiChat(MP.chat.chung, false);
      if (satDay) chung.scrollTop = chung.scrollHeight;
    }
    if (lm) {
      var satDayLM = lm.scrollHeight - lm.scrollTop - lm.clientHeight < 48;
      lm.innerHTML = noiChat(MP.chat.lienminh, false);
      if (satDayLM) lm.scrollTop = lm.scrollHeight;
    }
  }

  function cuonChatXuong() {
    var ids = ['chat-ds-chung', 'chat-ds-lienminh'];
    for (var i = 0; i < ids.length; i++) {
      var e = document.getElementById(ids[i]);
      if (e) e.scrollTop = e.scrollHeight;
    }
  }

  function taiChat(veToan) {
    return api('/api/chat').then(function (r) {
      /* Lần GET đầu có thể từng lỗi: khi poll hồi phục phải vẽ lại cả panel,
         nếu không thành viên vẫn bị kẹt ở lời nhắc "hãy gia nhập liên minh". */
      var doiLienMinh = !MP.chat || MP.chat.lm !== r.lm;
      MP.chat = r;
      if (U.man !== 'chat') return r;
      if (veToan || doiLienMinh || !document.getElementById('chat-ds-chung')) {
        U.ve();
        cuonChatXuong();
      }
      else capNhatChat();
      return r;
    }, function (e) {
      if (veToan) U.toast(e.message, 'loi');
      throw e;
    });
  }

  U.m_chat = function () {
    var c = MP.chat, dangTai = !c;
    var h = '<div class="luoi2">';
    h += '<div class="panel"><h3>Kênh chung toàn vũ trụ</h3><div class="noi">' +
      '<div id="chat-ds-chung" class="chat-ds">' + noiChat(c && c.chung, dangTai) + '</div>' +
      '<div class="chat-gui"><input id="chat-noi-chung" class="chat-nhap" maxlength="300" autocomplete="off" ' +
      'placeholder="Nói với toàn vũ trụ..."><button class="nut oke" ' +
        'data-act="chat-gui" data-kenh="chung">Gửi</button></div>' +
      '<p class="mo chat-ghi">Tối đa 300 ký tự · 3 tin mỗi 10 giây.</p></div></div>';

    h += '<div class="panel"><h3>Kênh liên minh' + (c && c.lm ? ' — ' + U.esc(c.lm) : '') + '</h3><div class="noi">';
    if (c && c.lm) {
      h += '<div id="chat-ds-lienminh" class="chat-ds">' + noiChat(c.lienminh, false) + '</div>' +
        '<div class="chat-gui"><input id="chat-noi-lienminh" class="chat-nhap" maxlength="300" autocomplete="off" ' +
        'placeholder="Nói riêng với đồng minh..."><button class="nut oke" ' +
          'data-act="chat-gui" data-kenh="lienminh">Gửi</button></div>';
    } else {
      h += '<div class="chat-ds"><span class="mo">Gia nhập một liên minh để mở kênh riêng.</span></div>';
    }
    h += '<p class="mo chat-ghi">Tin liên minh chỉ được máy chủ trả về cho thành viên hiện tại.</p></div></div></div>';
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
      '<tr><td>Chu kỳ bảo trì đã qua</td><td class="r sz">' + ((st.baoTri && st.baoTri.cycle) || 0) + '</td></tr>' +
      '<tr><td>Trận thắng / thua</td><td class="r sz">' + st.stats.thang + ' / ' + st.stats.thua + '</td></tr>' +
      '<tr><td>Tài nguyên đã cướp</td><td class="r sz">' + G.so(st.stats.cuop) + '</td></tr>' +
      '<tr><td>Tàu địch bắn hạ</td><td class="r sz">' + G.so(st.stats.tauDietDich) + '</td></tr>' +
      '<tr><td>Tàu của ta bị mất</td><td class="r sz">' + G.so(st.stats.tauMat) + '</td></tr>' +
      '</table>' +
      '<div style="margin-top:8px"><button class="nut nho" data-act="doi-mk">Đổi mật khẩu</button> ' +
      '<button class="nut nho" data-act="dangxuat">Đăng xuất</button> ' +
      '<button class="nut nho xoa" data-act="xoa-tk">Xoá tài khoản</button></div>' +
      '</div></div>';

    h += '<div class="panel"><h3>Máy chủ</h3><div class="noi"><table>' +
      '<tr><td>Hạt giống vũ trụ</td><td class="r sz">' + U.esc(sv.seed || '—') + '</td></tr>' +
      '<tr><td>Số tài khoản</td><td class="r sz">' + G.so(sv.soNguoi || 0) + '</td></tr>' +
      '<tr><td>Hành tinh đã có chủ</td><td class="r sz">' + G.so(sv.soHT || 0) + '</td></tr>' +
      '<tr><td>Tốc độ sản xuất</td><td class="r sz">x' + (sv.tocDo || G.C.TOC_DO_SERVER) + '</td></tr>' +
      '<tr><td>Tốc độ bay</td><td class="r sz">x' + (sv.tocDoBay || G.C.TOC_DO_BAY) + '</td></tr>' +
      '<tr><td>Chu kỳ bảo trì</td><td class="r sz">' + ((sv.chuKy || G.C.CHU_KY_BAO_TRI) / 3600) + ' giờ</td></tr>' +
      '<tr><td>Bản phát hành</td><td class="r sz">' + U.esc(sv.releaseVersion || '—') + '</td></tr>' +
      '<tr><td>Nhãn lịch sử</td><td class="r sz">' +
        U.esc(sv.phienBanLichSu || G.PHIEN_BAN_LICH_SU) + '</td></tr>' +
      '<tr><td>Schema state</td><td class="r sz">v' + (sv.stateVersion || G.STATE_VERSION) + '</td></tr>' +
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

  U.nguon.thanhVien = function () { return (MP.lm && MP.lm.tv) || []; };

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
    if (!st.lm && MP.lm && MP.lm.xin && MP.lm.xin.length) {
      h += '<div class="panel"><h3>Đơn đang chờ duyệt</h3><div class="noi">';
      for (var x = 0; x < MP.lm.xin.length; x++)
        h += '<div><span class="tag-lm">' + U.esc(MP.lm.xin[x].lm) + '</span> · gửi ' +
          G.gio(MP.lm.xin[x].khi * 1000) + '</div>';
      h += '</div></div>';
    }
    if (st.lm && MP.lm && MP.lm.laChu) {
      var don = MP.lm.don || [], tv = MP.lm.tv || [];
      h += '<div class="panel"><h3>Bộ Chỉ Huy Liên Minh</h3><div class="noi">' +
        '<p class="mo">Chủ liên minh duyệt thành viên, loại người vi phạm hoặc chuyển quyền chỉ huy. ' +
        'Phải chuyển quyền trước khi rời nếu liên minh còn người khác.</p>';
      h += '<h3 style="margin-top:10px">Đơn xin gia nhập</h3>';
      if (!don.length) h += '<span class="mo">Không có đơn nào đang chờ.</span>';
      else {
        h += '<div class="bang-cuon"><table><tr><th>Chỉ huy</th><th ' +
          'class="r">Điểm</th><th class="r">Hành tinh</th><th></th></tr>';
        for (var d = 0; d < don.length; d++)
          h += '<tr><td>' + U.esc(don[d].hienthi) + '</td><td class="r sz">' + G.so(don[d].diem) +
            '</td><td class="r sz">' + don[d].soHT + '</td><td class="r">' +
            '<button class="nut nho oke" data-act="lm-duyet" data-tk="' + don[d].tk + '">Duyệt</button> ' +
            '<button class="nut nho xoa" data-act="lm-tu-choi" data-tk="' + don[d].tk + '">Từ chối</button></td></tr>';
        h += '</table></div>';
      }
      if (tv.length > 1) {
        h += '<h3 style="margin-top:14px">Điều hành thành viên</h3><div class="bang-cuon"><table>' +
          '<tr><th>Chỉ huy</th><th class="r">Điểm</th><th></th></tr>';
        for (var v = 0; v < tv.length; v++) if (!tv[v].ta)
          h += '<tr><td>' + U.esc(tv[v].ten) + '</td><td class="r sz">' + G.so(tv[v].diem) + '</td><td class="r">' +
            '<button class="nut nho" data-act="lm-chuyen" data-tk="' + tv[v].tk + '" data-ten="' +
              U.esc(tv[v].ten) + '">Chuyển quyền</button> ' +
            '<button class="nut nho xoa" data-act="lm-duoi" data-tk="' + tv[v].tk + '" data-ten="' +
              U.esc(tv[v].ten) + '">Loại</button></td></tr>';
        h += '</table></div>';
      }
      h += '</div></div>';
    }
    var chien = MP.lm && MP.lm.chien;
    if (chien) {
      h += '<div class="panel"><h3>Lệnh chiến tranh</h3><div class="noi">' +
        '<p class="mo">Lệnh nhắm tới một chỉ huy và chỉ có hiệu lực sau 24 giờ. Khi đang ở liên minh, ' +
        'chỉ chủ liên minh ra lệnh; mọi thành viên hiện tại cùng hưởng quyền giao chiến.</p>';
      h += '<h3 style="margin-top:10px">Bên ta đã tuyên</h3>';
      if (!chien.di.length) h += '<span class="mo">Chưa tuyên chiến với ai.</span>';
      else {
        h += '<div class="bang-cuon"><table><tr><th>Mục tiêu</th><th>Liên ' +
          'minh</th><th>Lúc tuyên</th><th>Trạng thái</th></tr>';
        for (var cd = 0; cd < chien.di.length; cd++) {
          var wd = chien.di[cd];
          var tt = wd.trang === 'hieuluc' ? '<span class="do">Được phép giao chiến</span>' :
            (wd.trang === 'dongminh' ? '<span class="luc">Đồng minh — đình chỉ</span>' :
              '<span class="vang">Chờ ' + U.dem(wd.hieuLuc) + '</span>');
          h += '<tr><td><b>' + U.esc(wd.tenD) + '</b></td><td class="tag-lm">' + U.esc(wd.lmD || '') +
            '</td><td class="sz">' + G.gio(wd.khi * 1000) + '</td><td>' + tt + '</td></tr>';
        }
        h += '</table></div>';
      }
      h += '<h3 style="margin-top:14px">Bên tuyên chiến với ta</h3>';
      if (!chien.den.length) h += '<span class="mo">Không có lệnh nào nhắm tới ta.</span>';
      else {
        h += '<div class="bang-cuon"><table><tr><th>Bên tuyên</th><th>Lúc tuyên</th><th>Trạng thái</th></tr>';
        for (var ct = 0; ct < chien.den.length; ct++) {
          var wi = chien.den[ct];
          var ti = wi.trang === 'dongminh' ? '<span class="luc">Đồng minh — đình chỉ</span>' :
            (wi.trang === 'dinhchi' ? '<span class="mo">Bên tuyên đã vào liên minh — đình chỉ</span>' :
              (wi.duoc ? '<span class="do">Đã có hiệu lực</span>' :
                '<span class="vang">Còn ' + U.dem(wi.hieuLuc) + '</span>'));
          h += '<tr><td><b>' + U.esc(wi.ben) + '</b></td><td class="sz">' + G.gio(wi.khi * 1000) +
            '</td><td>' + ti + '</td></tr>';
        }
        h += '</table></div>';
      }
      h += '</div></div>';
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
      if (m === 'xephang') APP.taiXepHang(U.xhLoai);
      if (m === 'lienminh') taiLienMinh(true).catch(function () { });
      if (m === 'bangtin') api('/api/bangtin').then(function (r) { MP.bt = r; U.ve(); }, function () { });
      if (m === 'chat') taiChat(true).catch(function () { });
      if (m === 'cho') taiCho(true).catch(function () { });
    },
    'cho-het': function (el) {
      var id = el.getAttribute('data-id');
      var o = document.getElementById('sap-mua-' + id);
      if (o) { o.value = String(Math.max(0, Math.floor(+el.getAttribute('data-n') || 0))); choTinhLai(); }
    },
    'cho-tab': function (el) {
      MP.choLoai = el.getAttribute('data-loai') === 'tudo' ? 'tudo' : 'sieuthi';
      MP.cho = null; U.ve();
      taiCho(true).catch(function () { });
    },
    'cho-dang': function () {
      var res = (document.getElementById('sap-res') || {}).value || '';
      var sl = soO('sap-sl');
      if (!Number.isSafeInteger(sl) || sl < 1) return U.toast('Nhập số lượng cần ký gửi.', 'loi');
      var dl = { loai: MP.choLoai, pi: U.pi, res: res, sl: sl };
      if (MP.choLoai !== 'sieuthi') {
        var gia = +((document.getElementById('sap-gia') || {}).value || 0);
        if (!(gia > 0)) return U.toast('Nhập giá mỗi đơn vị.', 'loi');
        dl.gia = gia;
      }
      api('/api/chodang', dl).then(function (r) {
        if (r.loi) { MP.cho = r.cho; U.ve(); return U.toast(r.loi, 'loi'); }
        apDung(r); MP.cho = r.cho; U.ve();
        U.toast('Đã ký gửi ' + G.so(sl) + ' đơn vị.', 'ok');
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'cho-go': function (el) {
      api('/api/chogo', { loai: MP.choLoai, id: +el.getAttribute('data-id') }).then(function (r) {
        if (r.loi) { MP.cho = r.cho; U.ve(); return U.toast(r.loi, 'loi'); }
        apDung(r); MP.cho = r.cho; U.ve(); U.toast('Đã gỡ lô, hàng về kho.', 'ok');
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'cho-mua': function (el) {
      var id = +el.getAttribute('data-id'), sl = soO('sap-mua-' + id);
      if (!Number.isSafeInteger(sl) || sl < 1) return U.toast('Nhập số lượng cần mua.', 'loi');
      api('/api/chomua', { loai: MP.choLoai, id: id, sl: sl }).then(function (r) {
        if (r.loi) { MP.cho = r.cho; U.ve(); return U.toast(r.loi, 'loi'); }
        apDung(r); MP.cho = r.cho; U.ve();
        U.toast('Đã mua. Hàng tới sau ' + G.tg(MP.cho.giaoSau) + '.', 'ok');
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    /* vào/ra liên minh xong phải nạp lại danh sách thành viên từ server */
    'lm-vao': function (el) {
      api('/api/lmxin', { ten: el.getAttribute('data-ten') }).then(function () {
        api('/api/lm').then(function (l) {
          MP.lm = l; U.ve(); U.toast('Đã gửi đơn. Chờ chủ liên minh duyệt.', 'ok');
        }, function () { U.ve(); });
      }, function (e) { U.toast(e.message, 'loi'); });
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
        api('/api/lm').then(function (l) { MP.lm = l; U.ve(); U.toast('Đã lập liên minh.', 'ok'); },
          function () { U.ve(); });
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'lm-duyet': function (el) {
      api('/api/lmduyet', { tk: +el.getAttribute('data-tk') }).then(function () {
        api('/api/lm').then(function (l) { MP.lm = l; U.ve(); U.toast('Đã duyệt thành viên.', 'ok'); });
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'lm-tu-choi': function (el) {
      api('/api/lmtuchoi', { tk: +el.getAttribute('data-tk') }).then(function () {
        api('/api/lm').then(function (l) { MP.lm = l; U.ve(); U.toast('Đã từ chối đơn.', 'ok'); });
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'lm-duoi': function (el) {
      var tk = +el.getAttribute('data-tk'), ten = el.getAttribute('data-ten') || 'thành viên này';
      U.hop('Loại thành viên', '<p>Loại <b>' + U.esc(ten) + '</b> khỏi liên minh?</p>' +
        '<button class="nut xoa" data-act="lm-duoi-ok" data-tk="' + tk + '">Xác nhận loại</button>');
    },
    'lm-duoi-ok': function (el) {
      api('/api/lmduoi', { tk: +el.getAttribute('data-tk') }).then(function () {
        U.dongHop(); api('/api/lm').then(function (l) { MP.lm = l; U.ve(); U.toast('Đã loại thành viên.', 'ok'); });
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'lm-chuyen': function (el) {
      var tk = +el.getAttribute('data-tk'), ten = el.getAttribute('data-ten') || 'thành viên này';
      U.hop('Chuyển quyền chủ', '<p>Trao toàn bộ quyền chủ liên minh cho <b>' + U.esc(ten) + '</b>?</p>' +
        '<button class="nut oke" data-act="lm-chuyen-ok" data-tk="' + tk + '">Xác nhận chuyển quyền</button>');
    },
    'lm-chuyen-ok': function (el) {
      api('/api/lmchuyen', { tk: +el.getAttribute('data-tk') }).then(function () {
        U.dongHop(); api('/api/lm').then(function (l) { MP.lm = l; U.ve(); U.toast('Đã chuyển quyền chủ.', 'ok'); });
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'tuyen-chien': function (el) {
      var tk = +el.getAttribute('data-tk'), ten = el.getAttribute('data-ten') || 'chỉ huy này';
      U.hop('Tuyên chiến với ' + ten,
        '<p>Lệnh chiến tranh nhắm tới <b>' + U.esc(ten) + '</b> và có hiệu lực sau đúng 24 giờ.</p>' +
        '<p class="mo">Nếu ta đang ở liên minh, chỉ chủ liên minh ra ' +
          'lệnh và toàn bộ thành viên hiện tại cùng hưởng quyền đánh.</p>' +
        '<button class="nut xoa" data-act="tuyen-chien-ok" data-tk="' + tk + '">XÁC NHẬN TUYÊN CHIẾN</button>');
    },
    'tuyen-chien-ok': function (el) {
      api('/api/tuyenchien', { tk: +el.getAttribute('data-tk') }).then(function (r) {
        U.dongHop();
        if (MP.lm) MP.lm.chien = r.chien;
        if (U.gal) APP.taiHe(U.gal.g, U.gal.h);
        if (U.man === 'lienminh') taiLienMinh(true).catch(function () { });
        U.toast('Đã tuyên chiến. Hội Đồng Bảo An bắt đầu đếm 24 giờ.', 'ok');
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'chuyen-galana': function (el) {
      var tk = +el.getAttribute('data-tk'), ten = el.getAttribute('data-ten') || 'đồng minh';
      U.hop('Chuyển Galana cho ' + ten,
        '<p>Kho hiện có <b class="vang">' + G.so(U.st().galana || 0) + ' Galana</b>.</p>' +
        '<input id="galana-so" type="number" min="1" step="1000" style="width:100%" placeholder="Số Galana">' +
        '<p class="mo">Nguồn lịch sử xác nhận chỉ thành viên cùng liên minh mới được chuyển tiền cho nhau.</p>' +
        '<button class="nut oke" data-act="chuyen-galana-ok" data-tk="' + tk +
          '" style="margin-top:8px">CHUYỂN</button>');
    },
    'chuyen-galana-ok': function (el) {
      var o = document.getElementById('galana-so'), so = Math.floor(+(o && o.value || 0));
      if (!Number.isSafeInteger(so) || so < 1) return U.toast('Nhập số Galana hợp lệ.', 'loi');
      api('/api/chuyengalana', { tk: +el.getAttribute('data-tk'), so: so }).then(function (r) {
        apDung(r); U.dongHop(); U.ve(); U.toast('Đã chuyển ' + G.so(so) + ' Galana.', 'ok');
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'gui-thu': function (el) {
      var ten = el.getAttribute('data-ten') || '';
      U.hop('Gửi thư cho ' + ten,
        '<p class="mo">Thư sẽ xuất hiện trong hộp tin của họ. Tối đa 1.200 ký tự.</p>' +
        '<input id="thu-den" value="' + U.esc(ten) +
          '" style="width:100%;margin-bottom:6px" placeholder="tên chỉ huy">' +
        '<textarea id="thu-noi" style="width:100%;height:150px" placeholder="Chào đồng minh..."></textarea>' +
        '<div style="margin-top:8px"><button class="nut oke" data-act="gui-thu-ok">Gửi</button></div>');
    },
    'gui-thu-ok': function () {
      var den = (document.getElementById('thu-den') || {}).value || '';
      var noi = (document.getElementById('thu-noi') || {}).value || '';
      if (!noi.trim()) return U.toast('Thư trống.', 'loi');
      api('/api/guithu', { den: den, noi: noi }).then(function () {
        U.dongHop(); U.toast('Đã gửi thư cho ' + den + '.', 'ok');
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    'chat-gui': function (el) {
      var kenh = el.getAttribute('data-kenh') === 'lienminh' ? 'lienminh' : 'chung';
      var o = document.getElementById('chat-noi-' + kenh);
      var noi = o ? o.value.trim() : '';
      if (!noi) return U.toast('Tin chat đang trống.', 'loi');
      el.disabled = true;
      api('/api/chat', { kenh: kenh, noi: noi }).then(function () {
        if (o) o.value = '';
        return taiChat(false);
      }).then(function () {
        el.disabled = false;
        U.toast('Đã gửi vào ' + (kenh === 'lienminh' ? 'kênh liên minh.' : 'kênh chung.'), 'ok');
      }, function (e) {
        el.disabled = false;
        U.toast(e.message, 'loi');
      });
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
      }).then(function () { U.dongHop(); U.toast('Đã đổi mật khẩu. Mọi thiết bị khác đã bị đăng xuất.', 'ok'); },
        function (e) { U.toast(e.message, 'loi'); });
    },
    'xoa-tk': function () {
      U.hop('Xoá tài khoản',
        '<p>Toàn bộ đế quốc sẽ bị xoá khỏi máy chủ và các hành tinh của ta trở về trạng thái trống ' +
        'cho người khác chiếm. <b>Không lấy lại được.</b></p>' +
        '<div class="kd-form"><label>Mật khẩu</label><input id="xtk-mk" type="password">' +
        '<label>Gõ chữ <b>XOA</b> để xác nhận</label><input id="xtk-xn" maxlength="10">' +
        '<button class="nut lon xoa" data-act="xoa-tk-ok">XOÁ VĨNH VIỄN</button></div>');
    },
    'xoa-tk-ok': function () {
      api('/api/xoatk', {
        mk: (document.getElementById('xtk-mk') || {}).value || '',
        xacnhan: (document.getElementById('xtk-xn') || {}).value || ''
      }).then(function () {
        U.dongHop();
        dangXuatCuc('Tài khoản đã được xoá. Hẹn gặp lại ở một vũ trụ khác.');
      }, function (e) { U.toast(e.message, 'loi'); });
    },
    dangxuat: function () {
      var tokenDangXuat = token;
      api('/api/dangxuat', {}).then(function () {
        if (token === tokenDangXuat) dangXuatCuc(null);
      }, function () {
        /* Response logout A về muộn không được xoá phiên B vừa đăng nhập. */
        if (token === tokenDangXuat) dangXuatCuc(null);
      });
    }
  });

  function dangXuatCuc(msg) {
    try { localStorage.removeItem(KHOA_TOKEN); } catch (e) { }
    token = null; window.ST = null;
    /* Không để dữ liệu theo tài khoản A lọt sang tài khoản B khi đăng nhập lại
       trong cùng tab, đặc biệt là lịch sử chat riêng và quyền quản trị LM. */
    MP.he = null; MP.xh = null; MP.lm = null; MP.bt = null; MP.chat = null;
    MP.ten = null; U.man = 'tongquan'; U.pi = 0; U.gal = null; U.form = null;
    U.moTin = {}; U.cho = {}; U.mp = null; U.sigCu = '';
    var ndCu = document.getElementById('noidung'); if (ndCu) ndCu.textContent = '';
    var menuCu = document.getElementById('menu'); if (menuCu) menuCu.classList.remove('mo-ra');
    if (U.dongHop) U.dongHop();
    var hopCu = document.getElementById('ht-noi'); if (hopCu) hopCu.textContent = '';
    ['dn-ten', 'dn-mk', 'dk-ten', 'dk-hienthi', 'dk-mk'].forEach(function (id) {
      var o = document.getElementById(id); if (o) o.value = '';
    });
    var formDN = document.getElementById('form-dn'); if (formDN) formDN.style.display = '';
    var formDK = document.getElementById('form-dk'); if (formDK) formDK.style.display = 'none';
    var toastCu = document.getElementById('toast'); if (toastCu) toastCu.textContent = '';
    document.getElementById('game').style.display = 'none';
    document.getElementById('man-khoidong').style.display = '';
    loi(msg || null);
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
  document.getElementById('kd-ver').textContent = G.PHIEN_BAN_LICH_SU;
  api('/api/thongtin').then(function (sv) {
    MP.sv = sv;
    G.LECH_GIO = sv.now - Math.floor(Date.now() / 1000);
    document.getElementById('kd-sv').innerHTML =
      U.esc(G.BOI_CANH) + ' &middot; vũ trụ <b>' + U.esc(sv.seed) + '</b><br>' +
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
