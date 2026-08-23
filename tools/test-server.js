/* Kiểm thử máy chủ nhiều người: tài khoản, database, PvP thật giữa 2 account.
 * Chạy: node tools/test-server.js                                          */
'use strict';
var { spawn } = require('child_process');
var http = require('http');
var path = require('path'), fs = require('fs'), os = require('os');
var sqlite = require('node:sqlite');
var KhoLuat = require(path.join(__dirname, '..', 'server', 'db.js')).Kho;
var TheGioiLuat = require(path.join(__dirname, '..', 'server', 'world.js')).TheGioi;
var Luat = require(path.join(__dirname, '..', 'server', 'rules.js')).G;

var CONG = 8199 + (process.pid % 300);
var DB = path.join(os.tmpdir(), 'thdc-test-' + process.pid + '.db');
var GOC = path.join(__dirname, '..');
var URL = 'http://127.0.0.1:' + CONG;

var loi = 0, ok = 0;
function ktra(dk, ten) { if (dk) ok++; else { loi++; console.log('  ✗ ' + ten); } }
function log(s) { console.log('  · ' + s); }
function G_so(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function G_tong(o) { var t = 0; for (var k in o) t += o[k] || 0; return t; }
function G_moc() { return 5000; }
function G_tdKeyLike(c) { return c.g + ':' + c.h + ':' + c.p; }
var G = { tdKeyLike: G_tdKeyLike };
function slCap(id, lv) { return Luat.slTuCap(Luat.B(id), lv); }
function ctTheoCap(ds) {
  var ra = {};
  for (var k in ds) ra[k] = slCap(k, ds[k]);
  return ra;
}

function nghi(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function goi(duong, dl, token, pt) {
  var opt = { method: pt || (dl ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' } };
  if (token) opt.headers['x-thdc-token'] = token;
  if (dl) opt.body = JSON.stringify(dl);
  var r = await fetch(URL + duong, opt);
  var o = await r.json().catch(function () { return {}; });
  o.__ma = r.status;
  return o;
}

/* Giữ một POST ở trạng thái gửi dở để tái hiện request đã xác thực nhưng body
   chỉ hoàn tất sau khi một request khác thu hồi phiên. */
function moPostCham(duong, token) {
  var req;
  var kq = new Promise(function (ok, thatBai) {
    req = http.request(URL + duong, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-thdc-token': token }
    }, function (res) {
      var buf = [];
      res.on('data', function (c) { buf.push(c); });
      res.on('end', function () {
        var o = {};
        try { o = JSON.parse(Buffer.concat(buf).toString('utf8')); } catch (e) { }
        o.__ma = res.statusCode;
        ok(o);
      });
    });
    req.on('error', thatBai);
    req.write('{');
  });
  return { req: req, kq: kq };
}

/* --- can thiệp trực tiếp vào DB để "tăng tốc" cho bài test --- */
function moDB() { return new sqlite.DatabaseSync(DB); }
function suaState(tkId, f) {
  var db = moDB();
  var r = db.prepare('SELECT state FROM dq WHERE tk=?').get(tkId);
  var st = JSON.parse(r.state);
  f(st);
  db.prepare('UPDATE dq SET state=?, keTiep=? WHERE tk=?').run(JSON.stringify(st), 0, tkId);
  db.close();
  return st;
}
/* Ép mọi hạm đội tới đích ngay: lùi mốc thời gian 5 giây để engine có bước
   thời gian mà xử lý sự kiện (G.tick bỏ qua khi now === lastTick). */
function epToiDich(tkId) {
  return suaState(tkId, function (st) {
    st.lastTick = st.now - 5;
    st.fleets.forEach(function (f) {
      if (f.pha === 've') f.ve_t = st.now - 2; else f.den_t = st.now - 2;
    });
  });
}
function docState(tkId) {
  var db = moDB();
  var r = db.prepare('SELECT state FROM dq WHERE tk=?').get(tkId);
  var st = JSON.parse(r.state);
  db.close();
  return st;
}
function truyVan(sql, ...args) {
  var db = moDB();
  var r = db.prepare(sql).all(...args);
  db.close();
  return r;
}

(async function () {
  var sv = spawn(process.execPath, [path.join(GOC, 'server', 'index.js')], {
    env: Object.assign({}, process.env, { PORT: String(CONG), THDC_DB: DB, THDC_NHIP: '60000', THDC_GIOI_HAN: '5000' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  var raSV = '';
  sv.stdout.on('data', d => { raSV += d; });
  sv.stderr.on('data', d => { raSV += d; });

  /* chờ server sẵn sàng */
  var san = false;
  for (var i = 0; i < 60 && !san; i++) {
    await nghi(150);
    try { var t = await goi('/api/thongtin'); san = !!t.seed; } catch (e) { }
  }
  if (!san) { console.log('SERVER KHÔNG LÊN:\n' + raSV); sv.kill(); process.exit(1); }

  try {
    /* Biên 24 giờ dùng thời gian tiêm trực tiếp, tránh một bài HTTP chập chờn
       vì đồng hồ có thể nhảy sang giây kế giữa UPDATE và GET. */
    var khoBien = new KhoLuat(':memory:'), tgBien = new TheGioiLuat(khoBien);
    khoBien.q.tkThem.run('bien-a', 'Biên A', 'x', 'y', 1, 1);
    khoBien.q.tkThem.run('bien-b', 'Biên B', 'x', 'y', 1, 1);
    var idBienA = khoBien.q.tkTheoTen.get('bien-a').id, idBienB = khoBien.q.tkTheoTen.get('bien-b').id;
    tgBien.taoDeQuoc(idBienA, 'Biên A'); tgBien.taoDeQuoc(idBienB, 'Biên B');
    khoBien.q.chienThemTK.run(idBienA, idBienB, 1000);
    ktra(!tgBien.quyenDanh(idBienA, idBienB, 1000 + 86399).duoc,
      'T+86.399 giây vẫn chưa được Hội Đồng Bảo An cho đánh');
    ktra(tgBien.quyenDanh(idBienA, idBienB, 1000 + 86400).duoc,
      'T+86.400 giây lệnh chiến tranh có hiệu lực chính xác');

    /* Một lỗi đọc hook ở sâu trong trận không được để lại nửa transaction,
       cũng không được làm "độ sâu" UoW kẹt cho request kế tiếp. */
    var bienA0 = tgBien.nap(idBienA).st, bienB0 = tgBien.nap(idBienB).st;
    bienA0.planets[0].ships = { cruiser: 80 };
    bienA0.planets[0].res.deut = 1000000;
    bienA0.tech.weapon = bienA0.tech.shield = bienA0.tech.armor = 5;
    bienB0.planets[0].ships = { fighterL: 300 };
    bienB0.planets[0].def = { missileLauncher: 100 };
    bienB0.tech.weapon = bienB0.tech.shield = bienB0.tech.armor = 5;
    tgBien.luu(idBienA, bienA0); tgBien.luu(idBienB, bienB0);
    var guiBien = tgBien.hanhDong(idBienA, 'gui', {
      pi: 0, ships: { cruiser: 40 }, den: bienB0.planets[0].c,
      mission: 'attack', cargo: {}, pct: 100
    });
    ktra(guiBien && !guiBien.loi, 'fixture UoW phát được trận PvP tới hook phế liệu');
    var tBien = Math.floor(Date.now() / 1000) - 1;
    var bienASapDanh = tgBien.nap(idBienA).st, bienBSapDanh = tgBien.nap(idBienB).st;
    bienASapDanh.now = bienASapDanh.lastTick = tBien - 5;
    bienBSapDanh.now = bienBSapDanh.lastTick = tBien - 5;
    var fBien = bienASapDanh.fleets.filter(function (f0) {
      return f0.mission === 'attack' && f0.pha === 'di';
    }).slice(-1)[0];
    if (fBien) fBien.den_t = tBien;
    tgBien.luu(idBienA, bienASapDanh); tgBien.luu(idBienB, bienBSapDanh);
    function anhBien() {
      var d = khoBien.db;
      return JSON.stringify({
        dq: d.prepare('SELECT * FROM dq ORDER BY tk').all(),
        ht: d.prepare('SELECT * FROM ht ORDER BY td').all(),
        hd: d.prepare('SELECT * FROM hamdang ORDER BY tkA,fid').all(),
        hg: d.prepare('SELECT * FROM hamgiu ORDER BY tkA,fid').all(),
        pl: d.prepare('SELECT * FROM pl ORDER BY td').all(),
        tran: d.prepare('SELECT * FROM tran ORDER BY id').all(),
        bt: d.prepare('SELECT * FROM bangtin ORDER BY id').all()
      });
    }
    var anhTruocLoi = anhBien(), tranBien0 = khoBien.db.prepare('SELECT COUNT(*) n FROM tran').get().n;
    var btBien0 = khoBien.db.prepare("SELECT COUNT(*) n FROM bangtin WHERE loai='tran'").get().n;
    var plGetCu = khoBien.q.plGet.get, nemMotLan = true, daNemHook = false;
    khoBien.q.plGet.get = function () {
      if (nemMotLan) { nemMotLan = false; throw new Error('loi-doc-phe-lieu-co-y'); }
      return plGetCu.apply(khoBien.q.plGet, arguments);
    };
    try { tgBien.tick(idBienA, tBien); }
    catch (eHook) { daNemHook = /loi-doc-phe-lieu-co-y/.test(eHook.message); }
    khoBien.q.plGet.get = plGetCu;
    ktra(daNemHook && anhBien() === anhTruocLoi && tgBien.ctx === null && tgBien.sau === 0,
      'lỗi đọc phế liệu rollback toàn bộ state/projection/log/debris và giải phóng UoW');
    tgBien.tick(idBienA, tBien);
    ktra(khoBien.db.prepare('SELECT COUNT(*) n FROM tran').get().n === tranBien0 + 1 &&
      khoBien.db.prepare("SELECT COUNT(*) n FROM bangtin WHERE loai='tran'").get().n === btBien0 + 1 &&
      anhBien() !== anhTruocLoi && tgBien.ctx === null && tgBien.sau === 0,
      'sau lỗi một lần, retry bình thường commit trọn trận đúng một lần');

    var tuongLai = JSON.parse(khoBien.q.dqGet.get(idBienB).state);
    tuongLai.v = 999; tuongLai.moHinhCT = 'tuong-lai';
    khoBien.q.dqLuuState.run(JSON.stringify(tuongLai), 1, idBienB);
    var chanHaCap = false;
    try { tgBien.nangCapDuLieu(); } catch (eTuongLai) { chanHaCap = /mới hơn engine/.test(eTuongLai.message); }
    ktra(chanHaCap && JSON.parse(khoBien.q.dqGet.get(idBienB).state).v === 999,
      'startup từ chối state tương lai và không tự hạ cấp dữ liệu');
    khoBien.dong();

    /* Projection inbound chỉ là snapshot chủ lúc xuất phát. Nếu ô đổi chủ
       trước giờ đến, discovery phải theo TOẠ ĐỘ rồi hook mới pin chủ hiện tại;
       nếu attacker cũng tới đúng T thì hạm vừa pin phải tham chiến. */
    var khoDoiChu = new KhoLuat(':memory:'), tgDoiChu = new TheGioiLuat(khoDoiChu);
    function themTKDoiChu(ten, hienThi) {
      khoDoiChu.q.tkThem.run(ten, hienThi, 'x', 'y', 1, 1);
      var id = khoDoiChu.q.tkTheoTen.get(ten).id;
      tgDoiChu.taoDeQuoc(id, hienThi);
      return id;
    }
    var idChuCu = themTKDoiChu('chu-cu', 'Chủ Cũ');
    var idChuMoi = themTKDoiChu('chu-moi', 'Chủ Mới');
    var idGiuDoiChu = themTKDoiChu('giu-doi-chu', 'Hạm Giữ');
    var idDanhDoiChu = themTKDoiChu('danh-doi-chu', 'Hạm Đánh');
    var tenLMDoiChu = '[DCH] Đổi Chủ', lucDoiChu = Math.floor(Date.now() / 1000);
    khoDoiChu.q.lmThem.run(tenLMDoiChu, 'DCH', idChuCu, lucDoiChu, null);
    [idChuCu, idChuMoi, idGiuDoiChu].forEach(function (tk0) {
      var vao = tgDoiChu.hanhDong(tk0, 'lmvao', { ten: tenLMDoiChu });
      if (vao && vao.loi) throw new Error(vao.loi);
    });
    var stChuCu = tgDoiChu.nap(idChuCu).st, stChuMoi = tgDoiChu.nap(idChuMoi).st;
    var stGiuDC = tgDoiChu.nap(idGiuDoiChu).st, stDanhDC = tgDoiChu.nap(idDanhDoiChu).st;
    var cChuCu = G_tdKeyLike(stChuCu.planets[0].c), cChuMoiCu = stChuMoi.planets[0].c;
    stChuCu.planets[0].ships = { cruiser: 200 };
    stChuMoi.planets[0].ships = { cruiser: 200 };
    stGiuDC.planets[0].ships = { fighterL: 40 }; stGiuDC.planets[0].res.deut = 1000000;
    stDanhDC.planets[0].ships = { cruiser: 200 }; stDanhDC.planets[0].res.deut = 1000000;
    tgDoiChu.luu(idChuCu, stChuCu); tgDoiChu.luu(idChuMoi, stChuMoi);
    tgDoiChu.luu(idGiuDoiChu, stGiuDC); tgDoiChu.luu(idDanhDoiChu, stDanhDC);
    var nlDoiChu = Luat.nhienLieuGiuTong(null, { fighterL: 20 }, 6 * 3600);
    var guiGiuDoiChu = tgDoiChu.hanhDong(idGiuDoiChu, 'gui', {
      pi: 0, ships: { fighterL: 20 }, den: stChuCu.planets[0].c, mission: 'hold',
      cargo: { deut: nlDoiChu }, pct: 100, giu: 6
    });
    var fGiuDoiChu = guiGiuDoiChu.st.fleets.filter(function (f0) {
      return f0.mission === 'hold' && f0.pha === 'di';
    }).slice(-1)[0];
    /* Chủ cũ rời ô; chủ mới nhận chính toạ độ đó. Không lưu lại owner hạm giữ,
       nên hamdang.tkD vẫn cố ý trỏ snapshot cũ. */
    var toaDoHoanDoi = stChuCu.planets[0].c;
    stChuCu = tgDoiChu.nap(idChuCu).st; stChuMoi = tgDoiChu.nap(idChuMoi).st;
    stChuCu.planets[0].c = cChuMoiCu;
    stChuMoi.planets[0].c = toaDoHoanDoi;
    tgDoiChu.luu(idChuCu, stChuCu); tgDoiChu.luu(idChuMoi, stChuMoi);
    khoDoiChu.q.chienThemTK.run(idDanhDoiChu, idChuMoi, lucDoiChu - 90000);
    var guiDanhDoiChu = tgDoiChu.hanhDong(idDanhDoiChu, 'gui', {
      pi: 0, ships: { cruiser: 40 }, den: toaDoHoanDoi, mission: 'attack', cargo: {}, pct: 100
    });
    var fDanhDoiChu = guiDanhDoiChu.st.fleets.filter(function (f0) {
      return f0.mission === 'attack' && f0.pha === 'di';
    }).slice(-1)[0];
    var rowGiuChuCu = khoDoiChu.db.prepare('SELECT * FROM hamdang WHERE tkA=? AND fid=?').get(
      idGiuDoiChu, fGiuDoiChu.id);
    ktra(rowGiuChuCu && rowGiuChuCu.tkD === idChuCu &&
      khoDoiChu.q.htGet.get(cChuCu).tk === idChuMoi,
      'fixture giữ inbound giữ snapshot chủ cũ trong khi projection hành tinh đã sang chủ mới');
    var tDoiChu = Math.floor(Date.now() / 1000) - 1;
    function epStateDoiChu(tk0, sua) {
      var row = khoDoiChu.q.dqGet.get(tk0), st0 = JSON.parse(row.state);
      st0.now = st0.lastTick = tDoiChu - 5; sua(st0);
      khoDoiChu.q.dqLuuState.run(JSON.stringify(st0), tDoiChu, tk0);
    }
    epStateDoiChu(idGiuDoiChu, function (st0) {
      var f0 = st0.fleets.find(function (x) { return x.id === fGiuDoiChu.id; }); f0.den_t = tDoiChu;
    });
    epStateDoiChu(idDanhDoiChu, function (st0) {
      var f0 = st0.fleets.find(function (x) { return x.id === fDanhDoiChu.id; }); f0.den_t = tDoiChu;
    });
    epStateDoiChu(idChuMoi, function () {});
    khoDoiChu.db.prepare('UPDATE hamdang SET denT=? WHERE tkA=? AND fid=?').run(
      tDoiChu, idGiuDoiChu, fGiuDoiChu.id);
    khoDoiChu.db.prepare('UPDATE hamdang SET denT=? WHERE tkA=? AND fid=?').run(
      tDoiChu, idDanhDoiChu, fDanhDoiChu.id);
    tgDoiChu.tick(idDanhDoiChu, tDoiChu);
    var stGiuSauDoiChu = JSON.parse(khoDoiChu.q.dqGet.get(idGiuDoiChu).state);
    var stDanhSauDoiChu = JSON.parse(khoDoiChu.q.dqGet.get(idDanhDoiChu).state);
    var fGiuSauDoiChu = stGiuSauDoiChu.fleets.find(function (x) { return x.id === fGiuDoiChu.id; });
    var bcDoiChu = stDanhSauDoiChu.msgs.filter(function (m) {
      return m.loai === 'tran' && m.data && m.data.pvp && m.data.ben === 'ta';
    })[0];
    var rowGiuChuMoi = khoDoiChu.db.prepare('SELECT * FROM hamgiu WHERE tkA=? AND fid=?').get(
      idGiuDoiChu, fGiuDoiChu.id);
    ktra(fGiuSauDoiChu && fGiuSauDoiChu.pha === 'giu' &&
      fGiuSauDoiChu.giuTaiTk === idChuMoi && rowGiuChuMoi && rowGiuChuMoi.tkD === idChuMoi &&
      bcDoiChu && bcDoiChu.data.kq.conNhomD.length === 2,
      'arrival query theo toạ độ pin chủ mới và đưa hạm hold vào trận cùng giây dù tkD inbound đã stale');
    khoDoiChu.dong();

    /* ---------- 1. thông tin & tài khoản ---------- */
    var tt = await goi('/api/thongtin');
    ktra(!!tt.seed && tt.tocDo > 0, 'API /thongtin trả về cấu hình máy chủ');
    log('vũ trụ ' + tt.seed + ', sản xuất x' + tt.tocDo);

    var a = await goi('/api/dangky', { ten: 'quocbinh', hienthi: 'Quốc Bình', mk: 'matkhau123' });
    ktra(!!a.token && !!a.nha, 'đăng ký tài khoản A' + (a.loi ? ': ' + a.loi : ''));
    var b = await goi('/api/dangky', { ten: 'levu', hienthi: 'Lê Vũ', mk: 'matkhau456' });
    ktra(!!b.token, 'đăng ký tài khoản B' + (b.loi ? ': ' + b.loi : ''));
    log('A ở [' + a.nha.g + ':' + a.nha.h + ':' + a.nha.p + '], B ở [' + b.nha.g + ':' + b.nha.h + ':' + b.nha.p + ']');
    ktra(!(a.nha.g === b.nha.g && a.nha.h === b.nha.h && a.nha.p === b.nha.p), 'hai tài khoản ở hai ô khác nhau');

    var trung = await goi('/api/dangky', { ten: 'QuocBinh', hienthi: 'Trùng', mk: 'matkhau123' });
    ktra(trung.__ma === 409, 'không cho đăng ký trùng tên (không phân biệt hoa/thường)');
    var yeu = await goi('/api/dangky', { ten: 'ai', hienthi: 'x', mk: '1' });
    ktra(yeu.__ma === 400, 'chặn tên/mật khẩu không hợp lệ');

    var saiMK = await goi('/api/dangnhap', { ten: 'quocbinh', mk: 'sai' });
    ktra(saiMK.__ma === 401, 'sai mật khẩu thì không vào được');
    var dung = await goi('/api/dangnhap', { ten: 'quocbinh', mk: 'matkhau123' });
    ktra(!!dung.token, 'đăng nhập đúng mật khẩu');

    var khongToken = await goi('/api/state');
    ktra(khongToken.__ma === 401, 'không có token thì bị từ chối');
    var chatKhongToken = await goi('/api/chat');
    ktra(chatKhongToken.__ma === 401, 'không đọc được phòng chat khi chưa đăng nhập');

    /* ---------- 2. database có đúng dữ liệu ---------- */
    var tks = truyVan('SELECT * FROM tk ORDER BY id');
    ktra(tks.length === 2, 'bảng tk có 2 tài khoản');
    ktra(tks[0].mk.length === 128 && tks[0].mk !== 'matkhau123', 'mật khẩu được băm (scrypt), không lưu thô');
    ktra(truyVan('SELECT * FROM dq').length === 2, 'bảng dq có 2 đế quốc');
    ktra(truyVan('SELECT * FROM ht').length === 2, 'bảng ht ghi nhận 2 hành tinh có chủ');
    var idA = tks.find(t => t.ten === 'quocbinh').id;
    var idB = tks.find(t => t.ten === 'levu').id;

    /* ---------- 3. hành động qua API ---------- */
    var s1 = await goi('/api/state', null, a.token);
    ktra(!!s1.st && s1.st.planets.length === 1, 'lấy được state của A');
    var r1 = await goi('/api/lam', { ten: 'xay', dl: { pi: 0, id: 'metalMine' } }, a.token);
    ktra(!r1.loi && r1.st.planets[0].qB.length === 1 && r1.st.planets[0].qB[0].n === 1,
      'xây Mỏ Kim Loại qua API bằng schema queue quantity' + (r1.loi ? ': ' + r1.loi : ''));
    var rLo = await goi('/api/lam', { ten: 'xay', dl: { pi: 0, id: 'crystalMine', n: 5 } }, a.token);
    ktra(!rLo.loi && rLo.st.planets[0].qB[1] && rLo.st.planets[0].qB[1].n === 5,
      'API nhận lô 5 công trình và lưu đúng trường n');
    var soQueueTruocNLe = rLo.st.planets[0].qB.length;
    var rNLe = await goi('/api/lam', { ten: 'xay', dl: { pi: 0, id: 'crystalMine', n: 1.5 } }, a.token);
    ktra(!!rNLe.loi && rNLe.st.planets[0].qB.length === soQueueTruocNLe,
      'server từ chối số lượng công trình không phải số nguyên mà không đổi queue');
    var rNQua = await goi('/api/lam', { ten: 'xay', dl: { pi: 0, id: 'crystalMine', n: 10000001 } }, a.token);
    ktra(!!rNQua.loi && rNQua.st.planets[0].qB.length === soQueueTruocNLe,
      'server chặn lô vượt trần 10 triệu');
    var r2 = await goi('/api/lam', { ten: 'xay', dl: { pi: 0, id: 'khongCoThat' } }, a.token);
    ktra(!!r2.loi, 'chặn công trình không tồn tại');
    var r3 = await goi('/api/lam', { ten: 'hackTien', dl: {} }, a.token);
    ktra(r3.__ma === 400, 'chặn hành động không có trong bảng');
    var r4 = await goi('/api/lam', { ten: 'xay', dl: { pi: 99, id: 'metalMine' } }, a.token);
    ktra(!!r4.loi, 'chặn chỉ số hành tinh không hợp lệ');
    var r5 = await goi('/api/lam', { ten: 'ban', dl: { pi: 0, res: 'metal', n: -1e9 } }, a.token);
    ktra(!!r5.loi, 'chặn bán số lượng âm');
    var r6 = await goi('/api/lam', { ten: 'mua', dl: { pi: 0, res: 'metal', n: 1e12 } }, a.token);
    ktra(!!r6.loi, 'không mua được khi không đủ Galana');
    var rThue = await goi('/api/lam', { ten: 'doithue', dl: { pi: 0, thue: 19 } }, a.token);
    ktra(!rThue.loi && rThue.st.planets[0].danSu.taxBp === 1900,
      'API đổi thuế authoritative từ phần trăm sang basis point');
    var rThueAm = await goi('/api/lam', { ten: 'doithue', dl: { pi: 0, thue: -1 } }, a.token);
    var rThueQua = await goi('/api/lam', { ten: 'doithue', dl: { pi: 0, thue: 101 } }, a.token);
    var rThueNaN = await goi('/api/lam', { ten: 'doithue', dl: { pi: 0, thue: 'khong-phai-so' } }, a.token);
    ktra(!!rThueAm.loi && !!rThueQua.loi && !!rThueNaN.loi && rThueNaN.st.planets[0].danSu.taxBp === 1900,
      'API chặn thuế âm, quá 100% và NaN mà không đổi state');

    /* ---------- 4. sản xuất chạy trên server ---------- */
    suaState(idA, function (st) {
      var p = st.planets[0];
      p.b.metalMine = slCap('metalMine', 12); p.b.solar = slCap('solar', 14);
      p.b.metalStore = slCap('metalStore', 8); p.b.farm = slCap('farm', 12);
      p.res.food = 1000000; p.doi = 0;
      st.lastTick = st.now - 7200;
    });
    var s2 = await goi('/api/state', null, a.token);
    ktra(s2.st.planets[0].res.metal > 15000,
      'server tự tua sản xuất khi vắng mặt (' + Math.round(s2.st.planets[0].res.metal) + ' KL sau 2 giờ)');
    ktra(s2.st.lastTick >= s2.sv.now - 5, 'mốc thời gian của đế quốc được kéo tới hiện tại');

    /* ---------- 5. chuẩn bị PvP ---------- */
    var toaDoA = a.nha.g + ':' + a.nha.h + ':' + a.nha.p;
    var toaDoB = b.nha.g + ':' + b.nha.h + ':' + b.nha.p;
    suaState(idA, function (st) {
      var p = st.planets[0];
      p.b.shipyard = slCap('shipyard', 8); p.b.robot = slCap('robot', 6);
      p.b.lab = slCap('lab', 8); p.b.fleetHQ = slCap('fleetHQ', 3); p.b.farm = slCap('farm', 12);
      p.res.metal = 5e6; p.res.crystal = 5e6; p.res.deut = 2e6; p.res.food = 2e6;
      p.doi = 0;
      p.ships = { cruiser: 120, cargoL: 40, probe: 10 };
      st.tech = { weapon: 6, shield: 6, armor: 6, spy: 6, computer: 5, combustion: 8, impulse: 6, hyperdrive: 4, energy: 6, laser: 8, ion: 4 };
      st.galana = 500000;
    });
    suaState(idB, function (st) {
      var p = st.planets[0];
      p.b.shipyard = slCap('shipyard', 8); p.b.intel = slCap('intel', 4);
      p.b.metalStore = slCap('metalStore', 6); p.b.crystalStore = slCap('crystalStore', 6);
      p.b.farm = slCap('farm', 10);
      p.res.metal = 900000; p.res.crystal = 600000; p.res.deut = 200000; p.res.food = 150000;
      p.doi = 0;
      p.def = { missileLauncher: 60, laserS: 40, laserL: 20, gauss: 20, plasma: 30, satellite: 10 };
      p.ships = { fighterL: 60, fighterH: 20 };
      st.tech = { weapon: 3, shield: 3, armor: 3, spy: 2 };
      st.galana = 200000;
    });

    /* B phải đủ điểm để không còn được bảo vệ người chơi mới */
    await goi('/api/state', null, a.token);
    await goi('/api/state', null, b.token);
    var diemA = truyVan('SELECT diem FROM dq WHERE tk=?', idA)[0].diem;
    var diemB = truyVan('SELECT diem FROM dq WHERE tk=?', idB)[0].diem;
    log('điểm A ' + diemA + ' · điểm B ' + diemB);
    ktra(diemB > 5000 && diemA > 5000, 'cả hai đã vượt mốc bảo vệ người chơi mới');

    /* Luật gốc: phải đặt lệnh chiến tranh và chờ Hội Đồng Bảo An đủ 24 giờ. */
    var tauTruocCam = docState(idA).planets[0].ships.cruiser;
    var chuaTuyen = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cruiser: 1 }, den: b.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, a.token);
    ktra(!!chuaTuyen.loi && chuaTuyen.loi.indexOf('Chưa có lệnh') >= 0,
      'chặn phát lệnh đánh người thật khi chưa tuyên chiến');
    ktra(docState(idA).planets[0].ships.cruiser === tauTruocCam,
      'lệnh trái luật không trừ tàu hay nhiên liệu');
    var tcAB = await goi('/api/tuyenchien', { tk: idB }, a.token);
    ktra(!tcAB.loi && truyVan('SELECT * FROM chien WHERE tkA=? AND tkD=?', idA, idB).length === 1,
      'người chơi độc lập tuyên chiến với một chỉ huy cụ thể');
    var soTinTuyenTruocLap = truyVan("SELECT * FROM bangtin WHERE loai='chien'").length;
    var tcLap = await goi('/api/tuyenchien', { tk: idB }, a.token);
    ktra(tcLap.__ma === 400 && truyVan('SELECT * FROM chien WHERE tkA=? AND tkD=?', idA, idB).length === 1,
      'không tạo trùng lệnh chiến tranh đang tồn tại');
    ktra(truyVan("SELECT * FROM bangtin WHERE loai='chien'").length === soTinTuyenTruocLap,
      'lệnh trùng không phát thêm bảng tin');
    var tcTuDanh = await goi('/api/tuyenchien', { tk: idA }, a.token);
    ktra(tcTuDanh.__ma === 400, 'không thể tuyên chiến với chính mình');
    var tcCho = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cruiser: 1 }, den: b.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, a.token);
    ktra(!!tcCho.loi && tcCho.loi.indexOf('chưa đủ 24 giờ') >= 0,
      'đã tuyên nhưng chưa đủ 24 giờ vẫn không được xuất kích');
    var heCho = await goi('/api/he?g=' + b.nha.g + '&h=' + b.nha.h, null, a.token);
    var oBCho = heCho.o.find(x => x.c.p === b.nha.p);
    ktra(oBCho && oBCho.chien && oBCho.chien.trang === 'cho' && !oBCho.chien.duoc,
      'bản đồ trả đúng trạng thái đang chờ Hội Đồng Bảo An');
    var dbChienAB = moDB();
    dbChienAB.prepare('UPDATE chien SET khi=? WHERE tkA=? AND tkD=?').run(
      Math.floor(Date.now() / 1000) - 90000, idA, idB);
    dbChienAB.close();
    var heDanh = await goi('/api/he?g=' + b.nha.g + '&h=' + b.nha.h, null, a.token);
    var oBDanh = heDanh.o.find(x => x.c.p === b.nha.p);
    ktra(oBDanh && oBDanh.chien && oBDanh.chien.trang === 'hieuluc' && oBDanh.chien.duoc,
      'lệnh tự có hiệu lực sau đủ 24 giờ');
    ktra(docState(idB).msgs.some(m => m.td && m.td.indexOf('BỊ TUYÊN CHIẾN') >= 0),
      'mục tiêu nhận được cảnh báo tuyên chiến');

    /* ---------- 6. do thám người chơi thật ---------- */
    var g1 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { probe: 6 }, den: b.nha, mission: 'spy', cargo: {}, pct: 100 }
    }, a.token);
    ktra(!g1.loi && g1.st.fleets.length === 1, 'gửi hạm đội do thám tới hành tinh của B' + (g1.loi ? ': ' + g1.loi : ''));
    /* đẩy mốc tới đích về hiện tại để không phải chờ */
    epToiDich(idA);
    await goi('/api/state', null, a.token);
    var stA = docState(idA), stB = docState(idB);
    var bcTT = stA.msgs.find(m => m.loai === 'tt' && m.data && m.data.bc && m.data.bc.pvp);
    ktra(!!bcTT, 'A nhận được báo cáo do thám về người chơi thật');
    if (bcTT) {
      ktra(bcTT.data.bc.res.metal > 0, 'báo cáo có tài nguyên thật của B');
      ktra(bcTT.data.bc.ships && bcTT.data.bc.def, 'báo cáo có hạm đội & phòng thủ của B');
      ktra(bcTT.data.bc.danSu && bcTT.data.bc.danSu.population >= 250000 &&
        bcTT.data.bc.danSu.taxBp === docState(idB).planets[0].danSu.taxBp,
        'báo cáo đủ cấp thấy dân số/ủng hộ/thuế thật của mục tiêu');
      log('do thám: mức ' + bcTT.data.bc.mucDo + '/5, mất ' + bcTT.data.bc.mat + ' tàu vì phản tình báo');
    }
    ktra(stB.msgs.some(m => m.nd && m.nd.indexOf('do thám') >= 0), 'B được cảnh báo là bị do thám');

    /* ---------- 7. TẤN CÔNG người chơi thật ---------- */
    var klB0 = stB.planets[0].res.metal;
    var g2 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cruiser: 120, cargoL: 40 }, den: b.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, a.token);
    ktra(!g2.loi, 'gửi hạm đội tấn công B' + (g2.loi ? ': ' + g2.loi : ''));
    epToiDich(idA);
    await goi('/api/state', null, a.token);

    stA = docState(idA); stB = docState(idB);
    var tranA = stA.msgs.find(m => m.loai === 'tran' && m.data && m.data.pvp && m.data.ben === 'ta');
    var tranB = stB.msgs.find(m => m.loai === 'tran' && m.data && m.data.pvp && m.data.ben === 'dich');
    ktra(!!tranA, 'A có báo cáo chiến đấu PvP');
    ktra(!!tranB, 'B nhận được báo cáo BỊ TẤN CÔNG');
    if (tranA) {
      log('trận PvP: ' + tranA.data.kq.kq + ', cướp ' + JSON.stringify(tranA.data.cuop));
      ktra(tranA.data.kq.tenD.indexOf('Lê Vũ') >= 0, 'báo cáo ghi đúng tên đối thủ');
      ktra(tranA.data.kq.vongDanh.length >= 1, 'trận đánh có diễn biến từng vòng');
    }
    var bangTran = truyVan('SELECT * FROM tran');
    ktra(bangTran.length === 1, 'bảng tran ghi lại trận PvP');
    if (bangTran.length) ktra(bangTran[0].tkA === idA && bangTran[0].tkD === idB, 'trận ghi đúng hai bên');
    ktra(truyVan("SELECT * FROM bangtin WHERE loai='tran'").length >= 1, 'bảng tin vũ trụ có tin về trận đánh');

    var thiethai = (stB.planets[0].def.missileLauncher || 0) < 40 || (stB.planets[0].ships.fighterL || 0) < 40;
    ktra(thiethai, 'phòng thủ/hạm đội của B thực sự bị thiệt hại');
    if (tranA && tranA.data.kq.kq === 'thang') {
      ktra(stB.planets[0].res.metal < klB0, 'B bị cướp tài nguyên thật (' + Math.round(klB0) + ' → ' + Math.round(stB.planets[0].res.metal) + ')');
      ktra(truyVan("SELECT * FROM pl").length >= 1, 'bãi phế liệu được ghi vào bảng chung');
    }
    ktra(stA.stats.thang + stA.stats.thua >= 1 && stB.stats.thang + stB.stats.thua >= 1, 'thống kê trận của cả hai bên được cập nhật');

    /* ---------- 7b. đánh "nông trại": giàu tài nguyên, phòng thủ mỏng ---------
       (Đánh thẳng vào B là trận hoà — đúng luật thể loại: pháo plasma rất bền
        so với chi phí, nên hạm đội chỉ nên đi cướp mục tiêu ít phòng thủ.)  */
    var f = await goi('/api/dangky', { ten: 'nongtrai', hienthi: 'Nông Trại', mk: 'matkhau000' });
    ktra(!!f.token, 'đăng ký tài khoản mục tiêu' + (f.loi ? ': ' + f.loi : ''));
    var idF = truyVan("SELECT id FROM tk WHERE ten='nongtrai'")[0].id;
    suaState(idF, function (st) {
      var p = st.planets[0];
      /* điểm nằm ở công trình (không có vỏ thép) nên vẫn vượt mốc bảo vệ */
      p.b = ctTheoCap({ metalMine: 24, crystalMine: 22, deutSyn: 18, farm: 18, solar: 24,
              metalStore: 9, crystalStore: 9, deutStore: 8, silo: 8, robot: 8, shipyard: 4 });
      p.def = { missileLauncher: 25, laserS: 15 };
      p.ships = {};
      p.res = { metal: 900000, crystal: 700000, deut: 300000, food: 200000 };
    });
    await goi('/api/state', null, f.token);
    var diemF = truyVan('SELECT diem FROM dq WHERE tk=?', idF)[0].diem;
    log('nông trại: ' + diemF + ' điểm, phòng thủ mỏng');
    ktra(diemF > G_moc(), 'nông trại vượt mốc bảo vệ người chơi mới (' + diemF + ')');
    var tcAF = await goi('/api/tuyenchien', { tk: idF }, a.token);
    ktra(!tcAF.loi, 'A đặt lệnh chiến tranh riêng với Nông Trại');
    var dbChienAF = moDB();
    dbChienAF.prepare('UPDATE chien SET khi=? WHERE tkA=? AND tkD=?').run(
      Math.floor(Date.now() / 1000) - 90000, idA, idF);
    dbChienAF.close();

    suaState(idA, function (st) {
      st.planets[0].ships = { destroyer: 120, cargoL: 60 };
      st.planets[0].res.deut = 3e6;
    });
    await goi('/api/state', null, a.token);
    var klF0 = docState(idF).planets[0].res.metal;
    var g2b = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { destroyer: 120, cargoL: 60 }, den: f.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, a.token);
    ktra(!g2b.loi, 'gửi hạm đội đánh nông trại' + (g2b.loi ? ': ' + g2b.loi : ''));
    epToiDich(idA);
    await goi('/api/state', null, a.token);
    stA = docState(idA);
    var stF = docState(idF);
    var tranF = stA.msgs.filter(m => m.loai === 'tran' && m.data && m.data.pvp && m.data.ben === 'ta')[0];
    ktra(tranF && tranF.data.kq.kq === 'thang', 'thắng trận đánh nông trại' + (tranF ? ' (' + tranF.data.kq.kq + ')' : ''));
    if (tranF && tranF.data.kq.kq === 'thang') {
      var tongCuop = tranF.data.cuop.metal + tranF.data.cuop.crystal + tranF.data.cuop.deut + tranF.data.cuop.food;
      log('cướp được ' + G_so(tongCuop) + ' tài nguyên');
      ktra(tongCuop > 0, 'cướp được tài nguyên thật');
      ktra(stF.planets[0].res.metal < klF0, 'kho của mục tiêu giảm thật (' + G_so(klF0) + ' → ' + G_so(stF.planets[0].res.metal) + ')');
      var hamVe = stA.fleets.filter(x => x.pha === 've');
      ktra(hamVe.length === 1 && G_tong(hamVe[0].cargo) > 0, 'hạm đội mang hàng cướp được trên đường về');
      ktra(truyVan('SELECT * FROM tran').length >= 2, 'bảng tran ghi thêm trận PvP');
      ktra(stF.msgs.some(m => m.loai === 'tran' && m.data && m.data.ben === 'dich'), 'mục tiêu nhận được báo cáo bị đánh');
    }

    /* ---------- 7c. bên phòng thủ được báo động trước ---------- */
    suaState(idA, function (st) {
      st.planets[0].ships = { cruiser: 20, cargoL: 10, probe: 2 };
      st.planets[0].res.deut = 2e6;
    });
    await goi('/api/state', null, a.token);
    var bao1 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cruiser: 20 }, den: b.nha, mission: 'attack', cargo: {}, pct: 10 }
    }, a.token);
    ktra(!bao1.loi, 'gửi hạm đội tấn công (tốc độ chậm để còn kịp xem báo động)' + (bao1.loi ? ': ' + bao1.loi : ''));
    var sB = await goi('/api/state', null, b.token);
    ktra(sB.st.pvpToi && sB.st.pvpToi.length === 1, 'B thấy hạm đội địch đang bay tới (' +
      ((sB.st.pvpToi || []).length) + ')');
    if (sB.st.pvpToi && sB.st.pvpToi.length) {
      var canh = sB.st.pvpToi[0];
      ktra(canh.ten === 'Quốc Bình' && canh.nv === 'attack', 'báo động ghi đúng tên người đánh và nhiệm vụ');
      ktra(canh.den_t > Math.floor(Date.now() / 1000), 'báo động có mốc thời gian tới trong tương lai');
      ktra(canh.ships === undefined, 'báo động KHÔNG lộ đội hình hạm đội (phải do thám mới biết)');
    }
    var sA = await goi('/api/state', null, a.token);
    ktra(!sA.st.pvpToi || !sA.st.pvpToi.length, 'bên tấn công không thấy báo động của chính mình');

    /* gọi hạm đội về -> báo động phải biến mất */
    var idF2 = sA.st.fleets[sA.st.fleets.length - 1].id;
    await goi('/api/lam', { ten: 'goive', dl: { fid: idF2 } }, a.token);
    var sB2 = await goi('/api/state', null, b.token);
    ktra(!sB2.st.pvpToi || !sB2.st.pvpToi.length, 'gọi hạm đội về thì báo động của B mất theo');
    epToiDich(idA);
    await goi('/api/state', null, a.token);

    /* do thám thì KHÔNG báo trước */
    suaState(idA, function (st) { st.tech.spy = 0; });
    suaState(idB, function (st) { st.tech.spy = 20; });
    var guiDoThamThap = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { probe: 2 }, den: b.nha, mission: 'spy', cargo: {}, pct: 10 }
    }, a.token);
    ktra(!guiDoThamThap.loi, 'gửi được ca do thám tình báo thấp' + (guiDoThamThap.loi ? ': ' + guiDoThamThap.loi : ''));
    var sB3 = await goi('/api/state', null, b.token);
    ktra(!sB3.st.pvpToi || !sB3.st.pvpToi.length, 'nhiệm vụ do thám đi lén, không báo trước cho đối phương');
    epToiDich(idA);
    await goi('/api/state', null, a.token);
    var bcThap = docState(idA).msgs.find(m => m.loai === 'tt' && m.data && m.data.bc && m.data.bc.pvp);
    ktra(bcThap && bcThap.data.bc.mucDo === 1 && !bcThap.data.bc.danSu,
      'báo cáo tình báo mức thấp không làm lộ chỉ số dân sự');
    suaState(idA, function (st) { st.tech.spy = 6; });
    suaState(idB, function (st) { st.tech.spy = 2; });

    /* ---------- 7d. bắn tên lửa liên hành tinh vào người thật ---------- */
    var cungHe = (a.nha.g === b.nha.g);
    suaState(idA, function (st) {
      st.planets[0].b.missileSilo = slCap('missileSilo', 6);
      st.planets[0].mis = { icbm: 12 };
      st.tech.impulse = 20;                      /* tầm 99 hệ cho chắc trong bài test */
      st.tech.weapon = 8;
    });
    suaState(idB, function (st) {
      st.planets[0].b.missileSilo = slCap('missileSilo', 6);
      st.planets[0].mis = { interceptor: 4 };
      st.planets[0].def = { missileLauncher: 40, laserS: 30, gauss: 10, satellite: 12, orbitalStation: 4 };
    });
    await goi('/api/state', null, a.token);
    await goi('/api/state', null, b.token);
    var thuB0 = docState(idB).planets[0].def;
    var quyDao0 = (thuB0.satellite || 0) + (thuB0.orbitalStation || 0);
    var datB0 = (thuB0.missileLauncher || 0) + (thuB0.laserS || 0) + (thuB0.gauss || 0);

    var tl1 = await goi('/api/lam', { ten: 'banTenLua', dl: { pi: 0, n: 10, den: b.nha } }, a.token);
    ktra(cungHe ? !tl1.loi : !!tl1.loi, 'bắn tên lửa' + (cungHe ? '' : ' khác thiên hà bị chặn') + (tl1.loi ? ': ' + tl1.loi : ''));
    if (cungHe) {
      ktra(tl1.st.tenLua && tl1.st.tenLua.length === 1, 'loạt tên lửa đang bay');
      ktra((tl1.st.planets[0].mis.icbm || 0) === 2, 'hầm chỉ còn 2 quả');
      suaState(idA, function (st) { st.lastTick = st.now - 5; st.tenLua.forEach(function (t) { t.khi = st.now - 2; }); });
      await goi('/api/state', null, a.token);
      var stA4 = docState(idA), stB4 = docState(idB);
      var bcA = stA4.msgs.find(m => m.data && m.data.tl && m.data.ben === 'ta');
      var bcB = stB4.msgs.find(m => m.data && m.data.tl && m.data.ben === 'dich');
      ktra(!!bcA, 'A có báo cáo kết quả bắn tên lửa');
      ktra(!!bcB, 'B nhận được báo cáo BỊ BẮN TÊN LỬA');
      if (bcA) {
        log('tên lửa PvP: bắn 10, B chặn ' + bcA.data.tl.chan + ', nổ trúng ' + bcA.data.tl.no);
        ktra(bcA.data.tl.chan === 4, 'B dùng đúng 4 Tên Lửa Đánh Chặn (' + bcA.data.tl.chan + ')');
        ktra(!stB4.planets[0].mis.interceptor, 'đánh chặn của B đã bị tiêu hao hết');
        var thuB1 = stB4.planets[0].def;
        var quyDao1 = (thuB1.satellite || 0) + (thuB1.orbitalStation || 0);
        var datB1 = (thuB1.missileLauncher || 0) + (thuB1.laserS || 0) + (thuB1.gauss || 0);
        ktra(datB1 < datB0, 'phòng thủ mặt đất của B bị phá thật (' + datB0 + ' → ' + datB1 + ')');
        ktra(quyDao1 === quyDao0, 'lớp quỹ đạo của B không bị đụng tới');
        ktra(truyVan("SELECT * FROM bangtin WHERE noi LIKE '%tên lửa%'").length >= 1, 'bảng tin ghi lại vụ bắn tên lửa');
      }
      var tl2 = await goi('/api/lam', { ten: 'banTenLua', dl: { pi: 0, n: 99, den: b.nha } }, a.token);
      ktra(!!tl2.loi, 'không bắn được nhiều hơn số tên lửa đang có');
    }

    /* ---------- 7e. ĐỔ BỘ: phá công trình của người chơi thật ---------- */
    suaState(idA, function (st) {
      var p = st.planets[0];
      p.b.shipyard = slCap('shipyard', 11); p.b.robot = slCap('robot', 9);
      p.ships = { destroyer: 400, battleship: 300, cruiser: 400, cargoL: 120 };
      p.linh = { robot: 150000, tank: 20000 };
      p.res.deut = 5e6;
      st.tech.weapon = 12; st.tech.shield = 10; st.tech.armor = 10;
      st.tech.hyperdrive = 8; st.tech.plasma = 7;
      st.tech.impulse = 8;          /* trả lại mức bình thường sau bài thử tên lửa */
    });
    suaState(idB, function (st) {
      var p = st.planets[0];
      /* B phải đủ điểm để không còn được bảo vệ người chơi mới */
      p.b = ctTheoCap({ metalMine: 26, crystalMine: 24, deutSyn: 22, solar: 24, shipyard: 8, robot: 5, lab: 6,
              farm: 12, metalStore: 8, crystalStore: 8, deutStore: 7, silo: 7 });
      p.def = { missileLauncher: 30, laserS: 20, satellite: 6 };
      p.ships = {}; p.linh = { robot: 20000 };
      p.res = { metal: 700000, crystal: 400000, deut: 200000, food: 120000 };
      st.tech = { weapon: 3, shield: 3, armor: 3 };
    });
    await goi('/api/state', null, a.token);
    await goi('/api/state', null, b.token);
    var capTruoc = 0, bTruoc = docState(idB).planets[0].b;
    for (var kb in bTruoc) capTruoc += bTruoc[kb];
    var linhBTruoc = (docState(idB).planets[0].linh || {}).robot || 0;

    var gDB = await goi('/api/lam', {
      ten: 'gui',
      dl: { pi: 0, ships: { destroyer: 400, battleship: 300, cruiser: 400, cargoL: 120 },
            linh: { robot: 150000, tank: 20000 }, den: b.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, a.token);
    ktra(!gDB.loi, 'gửi hạm đội kèm quân đổ bộ vào người chơi thật' + (gDB.loi ? ': ' + gDB.loi : ''));
    ktra(gDB.st && G_tong(gDB.st.planets[0].linh || {}) === 0, 'quân đổ bộ đã lên tàu, không còn ở nhà');
    epToiDich(idA);
    await goi('/api/state', null, a.token);

    var stA5 = docState(idA), stB5 = docState(idB);
    var bcDB = stA5.msgs.find(m => m.data && m.data.doBo && m.data.ben === 'ta');
    var bcDBb = stB5.msgs.find(m => m.data && m.data.doBo && m.data.ben === 'dich');
    log('điểm trước trận đổ bộ: A=' + truyVan('SELECT diem FROM dq WHERE tk=?', idA)[0].diem +
        ' · B=' + truyVan('SELECT diem FROM dq WHERE tk=?', idB)[0].diem);
    ktra(!!bcDB, 'A có báo cáo pha đổ bộ');
    ktra(!!bcDBb, 'B nhận được báo cáo bị đổ bộ');
    if (bcDB && bcDB.data.doBo) {
      var db = bcDB.data.doBo;
      var capSau = 0, bSau = stB5.planets[0].b;
      for (var kb2 in bSau) capSau += bSau[kb2];
      var linhBSau = (stB5.planets[0].linh || {}).robot || 0;
      log('đổ bộ PvP: ' + (db.thang ? 'thắng' : 'thua') + ', công trình B ' + capTruoc + ' -> ' + capSau +
        ' công trình, quân giữ nhà của B ' + G_so(linhBTruoc) + ' -> ' + G_so(linhBSau) +
        ', cướp ' + G_so(G_tong(bcDB.data.cuop)));
      ktra(db.thang, 'quân đổ bộ làm chủ được mặt đất');
      if (db.thang) {
        ktra(capSau < capTruoc, 'CÔNG TRÌNH của B bị san phẳng thật (' + capTruoc + ' -> ' + capSau + ')');
        ktra(capTruoc - capSau <= Math.ceil(capTruoc * 0.25) + 1, 'không phá quá trần 25% mỗi trận');
        ktra(linhBSau < linhBTruoc, 'quân giữ nhà của B bị tiêu diệt');
        ktra(G_tong(bcDB.data.cuop) > 0, 'đổ bộ xong vét thêm được kho');
        ktra(truyVan("SELECT * FROM bangtin WHERE noi LIKE '%san phẳng%'").length >= 1,
          'bảng tin vũ trụ ghi lại vụ san phẳng công trình');
      }
    }
    /* quân sống sót phải về được nhà */
    epToiDich(idA);
    await goi('/api/state', null, a.token);
    var stA6 = docState(idA);
    ktra(G_tong(stA6.planets[0].linh || {}) > 0, 'quân đổ bộ sống sót đã về nhà');

    /* ---------- 8. bảo vệ người chơi mới ---------- */
    var soTranTruocChan = truyVan('SELECT * FROM tran').length;
    var c = await goi('/api/dangky', { ten: 'tanbinh', hienthi: 'Tân Binh', mk: 'matkhau789' });
    var idC = truyVan("SELECT id FROM tk WHERE ten='tanbinh'")[0].id;
    suaState(idC, function (st) {
      st.planets[0].ships = { fighterL: 5 };
      st.planets[0].res.deut = 100000;
      st.tech.combustion = 4;
    });
    var tcCA = await goi('/api/tuyenchien', { tk: idA }, c.token);
    ktra(!tcCA.loi, 'tân binh vẫn phải tuyên chiến trước khi thử đánh người mạnh');
    var dbChienCA = moDB();
    dbChienCA.prepare('UPDATE chien SET khi=? WHERE tkA=? AND tkD=?').run(
      Math.floor(Date.now() / 1000) - 90000, idC, idA);
    dbChienCA.close();
    var g3 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { fighterL: 5 }, den: a.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, c.token);
    ktra(!g3.loi, 'tân binh gửi được hạm đội' + (g3.loi ? ': ' + g3.loi : ''));
    epToiDich(idC);
    await goi('/api/state', null, c.token);
    var stC = docState(idC);
    ktra(stC.msgs.some(m => m.td && m.td.indexOf('bị chặn') >= 0), 'bảo vệ người chơi mới chặn cuộc tấn công lệch trình độ');
    ktra(truyVan('SELECT * FROM tran').length === soTranTruocChan,
      'không phát sinh trận mới từ cuộc tấn công bị chặn');

    /* Đổi hướng lúc đang về là hợp lệ, nhưng không được dùng để né lệnh chiến tranh. */
    suaState(idA, function (st) {
      st.planets[0].ships.fighterL = (st.planets[0].ships.fighterL || 0) + 1;
      st.planets[0].res.deut += 100000;
    });
    var hamThuDoiVe = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { fighterL: 1 }, den: b.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, a.token);
    var fidThuDoiVe = hamThuDoiVe.st.fleets.filter(x => x.pha === 'di').slice(-1)[0].id;
    await goi('/api/lam', { ten: 'goive', dl: { fid: fidThuDoiVe } }, a.token);
    var galTruocDoiCam = docState(idA).galana;
    var doiVeLachLuat = await goi('/api/lam', {
      ten: 'doihuong', dl: { fid: fidThuDoiVe, den: c.nha }
    }, a.token);
    var hamSauDoiCam = doiVeLachLuat.st.fleets.find(x => x.id === fidThuDoiVe);
    ktra(!!doiVeLachLuat.loi && doiVeLachLuat.loi.indexOf('Chưa có lệnh') >= 0 && hamSauDoiCam.pha === 've',
      'đổi hướng chặng về vẫn bị chặn nếu mục tiêu mới chưa được tuyên chiến');
    ktra(docState(idA).galana === galTruocDoiCam, 'đổi hướng bị chặn không thu phí Galana');
    epToiDich(idA); await goi('/api/state', null, a.token);

    /* Tên lửa cũng là hành vi tấn công và phải đi qua cùng lệnh chiến tranh. */
    suaState(idA, function (st) {
      st.planets[0].b.missileSilo = Math.max(slCap('missileSilo', 6), st.planets[0].b.missileSilo || 0);
      st.planets[0].mis.icbm = 1; st.tech.impulse = 20;
    });
    await goi('/api/state', null, a.token);
    var tlKhongChien = await goi('/api/lam', { ten: 'banTenLua', dl: { pi: 0, n: 1, den: c.nha } }, a.token);
    ktra(!!tlKhongChien.loi && tlKhongChien.loi.indexOf('Chưa có lệnh') >= 0,
      'chặn tên lửa liên hành tinh khi chưa tuyên chiến');
    ktra((docState(idA).planets[0].mis.icbm || 0) === 1,
      'tên lửa bị chặn lúc phát lệnh không bị tiêu hao');

    /* ---------- 9. không chiếm được ô đã có chủ ---------- */
    var he = await goi('/api/he?g=' + b.nha.g + '&h=' + b.nha.h, null, a.token);
    var oB = he.o.find(o => o.c.p === b.nha.p);
    ktra(oB && oB.loai === 'nguoi' && oB.ten === 'Lê Vũ', 'bản đồ thiên hà hiện hành tinh của người chơi khác');
    ktra(he.o.some(o => o.loai === 'npc' || o.loai === 'trong'), 'bản đồ vẫn có NPC/ô trống');

    /* ---------- 10. liên minh ---------- */
    var lmTrung = await goi('/api/lmtao', { ten: 'Hồng Bàng Vệ', tag: 'HBV' }, a.token);
    ktra(!!lmTrung.loi, 'không cho lập liên minh trùng tên/thẻ với liên minh NPC');
    var lmXau = await goi('/api/lmtao', { ten: 'ab', tag: '@@' }, a.token);
    ktra(!!lmXau.loi, 'chặn tên/thẻ liên minh không hợp lệ');
    var lm1 = await goi('/api/lmtao', { ten: 'Đại Nam Vệ', tag: 'DNV' }, a.token);
    ktra(!lm1.loi, 'A lập được liên minh' + (lm1.loi ? ': ' + lm1.loi : ''));
    var lm2 = await goi('/api/lm', null, a.token);
    ktra(lm2.ds.length === 1 && lm2.ds[0].sl === 1 && lm2.laChu, 'liên minh có 1 thành viên và A là chủ');
    var lmLach = await goi('/api/lam', { ten: 'lmvao', dl: { ten: '[DNV] Đại Nam Vệ' } }, b.token);
    ktra(lmLach.__ma === 400, 'không gọi thẳng hành động gia nhập để lách bước duyệt');
    var lmXin1 = await goi('/api/lmxin', { ten: '[DNV] Đại Nam Vệ' }, b.token);
    ktra(!lmXin1.loi, 'B gửi được đơn xin gia nhập');
    var lmXinLap = await goi('/api/lmxin', { ten: '[DNV] Đại Nam Vệ' }, b.token);
    ktra(lmXinLap.__ma === 400, 'không gửi trùng đơn đang chờ');
    var lmChoB = await goi('/api/lm', null, b.token);
    ktra(lmChoB.xin.length === 1 && lmChoB.xin[0].lm === '[DNV] Đại Nam Vệ', 'B thấy đơn của mình đang chờ');
    var lmDonA = await goi('/api/lm', null, a.token);
    ktra(lmDonA.don.length === 1 && lmDonA.don[0].tk === idB, 'chủ A thấy đơn của B cùng điểm/hành tinh');
    var lmIdXau1 = await goi('/api/lmduyet', { tk: 'khong-phai-id' }, a.token);
    var lmIdXau2 = await goi('/api/lmduoi', { tk: null }, a.token);
    var lmIdXau3 = await goi('/api/lmchuyen', { tk: -1 }, a.token);
    ktra(lmIdXau1.__ma === 400, 'chặn ID ứng viên sai ở thao tác duyệt');
    ktra(lmIdXau2.__ma === 400, 'chặn ID thành viên sai ở thao tác loại');
    ktra(lmIdXau3.__ma === 400, 'chặn ID thành viên sai ở thao tác chuyển quyền');
    var lmDuyetLach = await goi('/api/lmduyet', { tk: idB }, c.token);
    ktra(lmDuyetLach.__ma === 400, 'người không phải chủ không duyệt được đơn');
    var lmDuyet = await goi('/api/lmduyet', { tk: idB }, a.token);
    ktra(!lmDuyet.loi, 'A duyệt đơn của B');
    var lm4 = await goi('/api/lm', null, b.token);
    ktra(lm4.tv.length === 2 && lm4.tv.some(x => x.chu && x.tk === idA),
      'liên minh có 2 thành viên và đánh dấu đúng chủ (' + lm4.tv.length + ')');

    /* ---------- 10a. phòng chat chung & liên minh ---------- */
    var chat1 = await goi('/api/chat', { kenh: 'chung', noi: 'Chào toàn vũ trụ từ Quốc Bình!' }, a.token);
    ktra(!chat1.loi, 'A gửi được tin vào kênh chat chung' + (chat1.loi ? ': ' + chat1.loi : ''));
    var chat2 = await goi('/api/chat', { kenh: 'lienminh', noi: 'Tập kết hạm đội ở hệ 4.' }, b.token);
    ktra(!chat2.loi, 'B gửi được tin vào kênh liên minh' + (chat2.loi ? ': ' + chat2.loi : ''));
    var dbTinCu = moDB();
    dbTinCu.prepare('INSERT INTO chat(khi,tk,ten,lm,kenh,noi) VALUES(?,?,?,?,?,?)').run(
      Math.floor(Date.now() / 1000) - 31 * 86400, idA, 'Quốc Bình', null, 'chung', 'TIN_CU_HET_HAN');
    dbTinCu.close();
    var chatA = await goi('/api/chat', null, a.token);
    var chatB = await goi('/api/chat', null, b.token);
    var chatC = await goi('/api/chat', null, c.token);
    ktra(chatA.chung.some(m => m.ten === 'Quốc Bình' && m.noi.indexOf('toàn vũ trụ') >= 0),
      'thành viên A đọc được tin kênh chung');
    ktra(!chatA.chung.some(m => m.noi === 'TIN_CU_HET_HAN'), 'API không trả tin chat quá hạn 30 ngày');
    ktra(truyVan("SELECT * FROM chat WHERE noi='TIN_CU_HET_HAN'").length === 1,
      'TTL được lọc ngay cả giữa hai nhịp dọn dữ liệu theo giờ');
    ktra(chatB.lienminh.some(m => m.ten === 'Lê Vũ' && m.noi.indexOf('Tập kết') >= 0),
      'thành viên B đọc lại được tin liên minh');
    ktra(chatA.lienminh.some(m => m.ten === 'Lê Vũ'), 'đồng minh A thấy tin riêng của B');
    ktra(chatC.lm === null && chatC.lienminh.length === 0, 'người ngoài không nhận được lịch sử chat liên minh');
    var chatCam = await goi('/api/chat', { kenh: 'lienminh', noi: 'Nghe lén' }, c.token);
    ktra(chatCam.__ma === 403, 'người ngoài không gửi được vào kênh liên minh');
    var chatTrong = await goi('/api/chat', { kenh: 'chung', noi: '   \n  ' }, c.token);
    ktra(chatTrong.__ma === 400, 'chặn tin chat trống');
    var chatDai = await goi('/api/chat', { kenh: 'chung', noi: 'x'.repeat(301) }, c.token);
    ktra(chatDai.__ma === 400, 'chặn tin chat dài quá 300 ký tự');
    await goi('/api/chat', { kenh: 'lienminh', noi: 'Tin thứ hai.' }, b.token);
    await goi('/api/chat', { kenh: 'lienminh', noi: 'Tin thứ ba.' }, b.token);
    var chatSpam = await goi('/api/chat', { kenh: 'lienminh', noi: 'Tin thứ tư quá nhanh.' }, b.token);
    ktra(chatSpam.__ma === 429, 'giới hạn tối đa 3 tin chat mỗi 10 giây');
    ktra(truyVan("SELECT * FROM chat WHERE noi<>'TIN_CU_HET_HAN'").length === 4,
      'tin chat còn hạn được lưu bền vững trong SQLite');

    /* quyền chủ: không bỏ liên minh có người, chuyển quyền, từ chối và loại */
    var lmChuRoi = await goi('/api/lam', { ten: 'lmra', dl: {} }, a.token);
    ktra(!!lmChuRoi.loi && lmChuRoi.st.lm, 'chủ không thể rời khi chưa chuyển quyền');
    var lmChuyen1 = await goi('/api/lmchuyen', { tk: idB }, a.token);
    ktra(!lmChuyen1.loi, 'A chuyển quyền chủ cho B');
    var lmQuyenB = await goi('/api/lm', null, b.token);
    ktra(lmQuyenB.laChu && lmQuyenB.tv.some(x => x.chu && x.tk === idB), 'B nhận đúng quyền chủ');
    var lmAHetQuyen = await goi('/api/lmduoi', { tk: idB }, a.token);
    ktra(lmAHetQuyen.__ma === 400, 'chủ cũ không còn quyền loại thành viên');
    var lmChuyen2 = await goi('/api/lmchuyen', { tk: idA }, b.token);
    ktra(!lmChuyen2.loi, 'B chuyển quyền chủ lại cho A');

    var lmXinC1 = await goi('/api/lmxin', { ten: '[DNV] Đại Nam Vệ' }, c.token);
    ktra(!lmXinC1.loi, 'C gửi được đơn để thử từ chối');
    var lmTuChoi = await goi('/api/lmtuchoi', { tk: idC }, a.token);
    ktra(!lmTuChoi.loi && truyVan('SELECT * FROM lm_xin WHERE tk=?', idC).length === 0, 'A từ chối và xoá đúng đơn của C');
    await goi('/api/lmxin', { ten: '[DNV] Đại Nam Vệ' }, c.token);
    var lmDuyetC = await goi('/api/lmduyet', { tk: idC }, a.token);
    ktra(!lmDuyetC.loi && docState(idC).lm && docState(idC).lm.ten === '[DNV] Đại Nam Vệ', 'A duyệt C vào liên minh');
    var lmDuoiC = await goi('/api/lmduoi', { tk: idC }, a.token);
    ktra(!lmDuoiC.loi && !docState(idC).lm, 'chủ A loại được C khỏi liên minh');

    /* Lệnh của liên minh: chỉ chủ đặt, thành viên hiện tại cùng hưởng quyền. */
    var tcSaiQuyen = await goi('/api/tuyenchien', { tk: idC }, b.token);
    ktra(tcSaiQuyen.__ma === 400, 'thành viên thường không tự đặt lệnh chiến tranh cho liên minh');
    var tcLMC = await goi('/api/tuyenchien', { tk: idC }, a.token);
    ktra(!tcLMC.loi && truyVan('SELECT * FROM chien WHERE lmA=? AND tkD=?', '[DNV] Đại Nam Vệ', idC).length === 1,
      'chủ đặt lệnh liên minh nhắm tới một chỉ huy');
    var dbChienLMC = moDB();
    dbChienLMC.prepare('UPDATE chien SET khi=? WHERE lmA=? AND tkD=?').run(
      Math.floor(Date.now() / 1000) - 90000, '[DNV] Đại Nam Vệ', idC);
    dbChienLMC.close();

    /* [TÁI DỰNG] Quyền bám membership hiện tại, không đóng băng danh sách ở
       lúc tuyên: thành viên vào sau cũng hưởng lệnh đang có hiệu lực. */
    var fXinSauChien = await goi('/api/lmxin', { ten: '[DNV] Đại Nam Vệ' }, f.token);
    ktra(!fXinSauChien.loi, 'người ngoài gửi đơn sau khi liên minh đã có lệnh chiến tranh');
    var fVaoSauChien = await goi('/api/lmduyet', { tk: idF }, a.token);
    ktra(!fVaoSauChien.loi, 'chủ duyệt thành viên mới sau khi lệnh đã có hiệu lực');
    var heCuaFMoi = await goi('/api/he?g=' + c.nha.g + '&h=' + c.nha.h, null, f.token);
    var oCuaFMoi = heCuaFMoi.o.find(x => x.c.p === c.nha.p);
    ktra(oCuaFMoi && oCuaFMoi.chien && oCuaFMoi.chien.duoc,
      'thành viên gia nhập sau vẫn thừa hưởng ngay lệnh chiến tranh đang hiệu lực');
    var duoiFSauChien = await goi('/api/lmduoi', { tk: idF }, a.token);
    ktra(!duoiFSauChien.loi && !docState(idF).lm, 'loại thành viên thử nghiệm để không làm đổi các tình huống kế tiếp');

    var heCuaB = await goi('/api/he?g=' + c.nha.g + '&h=' + c.nha.h, null, b.token);
    var oCuaB = heCuaB.o.find(x => x.c.p === c.nha.p);
    ktra(oCuaB && oCuaB.chien && oCuaB.chien.duoc,
      'thành viên hiện tại thừa hưởng quyền đánh từ lệnh của liên minh');
    ktra(oCuaB && oCuaB.chien && !oCuaB.chien.coQuyenTuyen,
      'dữ liệu bản đồ không mời thành viên thường tự tuyên chiến');
    suaState(idB, function (st) {
      st.planets[0].ships.fighterL = (st.planets[0].ships.fighterL || 0) + 5;
      st.planets[0].res.deut = 200000;
    });
    var danhCTruocKhiVao = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { fighterL: 5 }, den: c.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, b.token);
    ktra(!danhCTruocKhiVao.loi, 'B xuất kích theo lệnh chiến tranh của liên minh');
    suaState(idA, function (st) {
      st.planets[0].b.missileSilo = Math.max(slCap('missileSilo', 6), st.planets[0].b.missileSilo || 0);
      st.planets[0].mis.icbm = 1; st.tech.impulse = 20;
    });
    suaState(idC, function (st) {
      st.planets[0].def = { missileLauncher: 7 };
      st.planets[0].mis = { interceptor: 2 };
    });
    await goi('/api/state', null, a.token); await goi('/api/state', null, c.token);
    var thuCTruocTenLua = JSON.stringify(docState(idC).planets[0].def);
    var chanCTruocTenLua = docState(idC).planets[0].mis.interceptor;
    var tlCTruocKhiVao = await goi('/api/lam', {
      ten: 'banTenLua', dl: { pi: 0, n: 1, den: c.nha }
    }, a.token);
    ktra(!tlCTruocKhiVao.loi && tlCTruocKhiVao.st.tenLua.length === 1,
      'A phóng tên lửa theo lệnh chiến tranh của liên minh');
    await goi('/api/lmxin', { ten: '[DNV] Đại Nam Vệ' }, c.token);
    var cVaoGiuaDuong = await goi('/api/lmduyet', { tk: idC }, a.token);
    ktra(!cVaoGiuaDuong.loi, 'C gia nhập liên minh trong lúc hạm đội B đang bay');
    var chienCTrongLM = await goi('/api/lm', null, c.token);
    ktra(chienCTrongLM.chien.den.some(x => x.ben === '[DNV] Đại Nam Vệ' && x.trang === 'dongminh' && !x.duoc),
      'danh sách phía bị tuyên hiện lệnh bị đình chỉ khi đã thành đồng minh');
    var soTranTruocDongMinh = truyVan('SELECT * FROM tran').length;
    epToiDich(idB);
    await goi('/api/state', null, b.token);
    ktra(docState(idB).msgs.some(m => m.td && m.td.indexOf('Hội Đồng Bảo An chặn') >= 0 && m.nd && m.nd.indexOf('cùng liên minh') >= 0),
      'máy chủ kiểm tra lại lúc tới nơi và chặn đánh người vừa thành đồng minh');
    ktra(truyVan('SELECT * FROM tran').length === soTranTruocDongMinh,
      'đổi tư cách liên minh giữa đường không tạo trận trái luật');
    suaState(idA, function (st) {
      st.lastTick = st.now - 5;
      st.tenLua.forEach(function (t) { t.khi = st.now - 2; });
    });
    await goi('/api/state', null, a.token);
    var stCSauTenLua = docState(idC), stASauTenLua = docState(idA);
    ktra(stASauTenLua.msgs.some(m => m.td && m.td.indexOf('Tên lửa bị Hội Đồng Bảo An vô hiệu hóa') >= 0),
      'máy chủ kiểm tra lại quan hệ lúc tên lửa tới nơi');
    ktra(JSON.stringify(stCSauTenLua.planets[0].def) === thuCTruocTenLua &&
      stCSauTenLua.planets[0].mis.interceptor === chanCTruocTenLua,
      'tên lửa bị mất quyền giữa đường không phá phòng thủ hay tiêu hao đánh chặn');
    var duoiCLanHai = await goi('/api/lmduoi', { tk: idC }, a.token);
    ktra(!duoiCLanHai.loi && !docState(idC).lm, 'đưa C ra ngoài lại sau bài test chuyển tư cách giữa đường');
    epToiDich(idB); await goi('/api/state', null, b.token);  // cho hạm đội bị chặn về hết, giải phóng khe

    var lm5 = await goi('/api/lmxin', { ten: '[XXX] Không Có Thật' }, c.token);
    ktra(!!lm5.loi, 'không xin vào được liên minh không tồn tại');
    suaState(idB, function (st) {
      st.planets[0].ships.fighterL = (st.planets[0].ships.fighterL || 0) + 5;
      st.planets[0].res.deut += 200000;
    });
    var danhTruocKhiRoi = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { fighterL: 5 }, den: c.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, b.token);
    ktra(!danhTruocKhiRoi.loi, 'B còn dùng được lệnh liên minh trước lúc rời');
    var lm6 = await goi('/api/lam', { ten: 'lmra', dl: {} }, b.token);
    ktra(!lm6.loi && !lm6.st.lm, 'B rời được liên minh');
    var tranTruocMatQuyen = truyVan('SELECT * FROM tran').length;
    epToiDich(idB); await goi('/api/state', null, b.token);
    ktra(docState(idB).msgs.some(m => m.td && m.td.indexOf('Hội Đồng Bảo An chặn') >= 0 && m.nd && m.nd.indexOf('Chưa có lệnh') >= 0),
      'rời liên minh giữa đường làm mất quyền đánh ở lần kiểm tra tại đích');
    ktra(truyVan('SELECT * FROM tran').length === tranTruocMatQuyen,
      'hạm đội mất quyền giữa đường không tạo trận');
    var heSauRoi = await goi('/api/he?g=' + c.nha.g + '&h=' + c.nha.h, null, b.token);
    var oSauRoi = heSauRoi.o.find(x => x.c.p === c.nha.p);
    ktra(oSauRoi && oSauRoi.chien && oSauRoi.chien.trang === 'chua',
      'rời liên minh thì mất quyền đánh được thừa hưởng, không giữ snapshot thành viên');
    var lmTrungTag = await goi('/api/lmtao', { ten: 'Một Tên Hoàn Toàn Khác', tag: 'DNV' }, c.token);
    ktra(lmTrungTag.__ma === 400, 'không cho hai liên minh người chơi dùng trùng thẻ');
    var lmKhoangTrang = await goi('/api/lmtao', { ten: 'Đại Nam Vệ', tag: '   DNVX' }, c.token);
    ktra(!lmKhoangTrang.loi && lmKhoangTrang.st.lm && lmKhoangTrang.st.lm.ten === '[DNVX] Đại Nam Vệ',
      'chuẩn hoá khoảng trắng một lần, không gia nhập nhầm liên minh [DNV] có sẵn');
    var lmKhoangTrangRoi = await goi('/api/lam', { ten: 'lmra', dl: {} }, c.token);
    ktra(!lmKhoangTrangRoi.loi && truyVan("SELECT * FROM lm WHERE tag='DNVX'").length === 0,
      'liên minh tạo từ input đã chuẩn hoá được sở hữu và giải thể đúng');
    var tenLMDai = 'X'.repeat(32);
    var lmDai = await goi('/api/lmtao', { ten: tenLMDai, tag: 'ABCDEF' }, c.token);
    ktra(!lmDai.loi && lmDai.st.lm && lmDai.st.lm.ten === '[ABCDEF] ' + tenLMDai,
      'tên liên minh dài tối đa được lưu nguyên vẹn trong state');
    var lmDaiChu = await goi('/api/lm', null, c.token);
    ktra(lmDaiChu.laChu && lmDaiChu.tv.length === 1, 'liên minh dài tối đa vẫn nhận đúng chủ');
    var chatLMCu = await goi('/api/chat', { kenh: 'lienminh', noi: 'BI_MAT_CUA_LIEN_MINH_CU' }, c.token);
    ktra(!chatLMCu.loi, 'liên minh tên dài gửi được tin riêng trước khi giải thể');
    var lmDaiRoi = await goi('/api/lam', { ten: 'lmra', dl: {} }, c.token);
    ktra(!lmDaiRoi.loi, 'chủ duy nhất rời và dọn được liên minh tên dài');
    var lmDaiLapLai = await goi('/api/lmtao', { ten: tenLMDai, tag: 'ABCDEF' }, c.token);
    ktra(!lmDaiLapLai.loi, 'có thể tái lập tên/thẻ sau khi liên minh cũ đã giải thể');
    var chatLMMoi = await goi('/api/chat', null, c.token);
    ktra(!chatLMMoi.lienminh.some(m => m.noi === 'BI_MAT_CUA_LIEN_MINH_CU'),
      'liên minh tái lập không đọc được lịch sử riêng của liên minh cũ');
    var lmDaiRoiLanHai = await goi('/api/lam', { ten: 'lmra', dl: {} }, c.token);
    ktra(!lmDaiRoiLanHai.loi, 'dọn liên minh tái lập để tiếp tục bài test');

    /* ---------- 10b. tiếp tế cho người chơi khác ---------- */
    suaState(idA, function (st) {
      var p = st.planets[0];
      p.ships.cargoL = (p.ships.cargoL || 0) + 20;
      p.res.metal = 400000; p.res.deut = 1e6;
    });
    await goi('/api/state', null, a.token);

    var klBNgoai = docState(idB).planets[0].res.metal;
    var ttNgoai = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cargoL: 1 }, den: b.nha, mission: 'transport', cargo: { metal: 1000 }, pct: 100 }
    }, a.token);
    ktra(!!ttNgoai.loi && ttNgoai.loi.indexOf('cùng liên minh') >= 0,
      'chặn tiếp tế cho người ngoài liên minh ngay lúc xuất phát');
    ktra(docState(idB).planets[0].res.metal === klBNgoai,
      'tiếp tế trái luật không làm tài nguyên bên nhận thay đổi');
    var galNgoaiA = docState(idA).galana, galNgoaiB = docState(idB).galana;
    var galNgoai = await goi('/api/chuyengalana', { tk: idB, so: 1000 }, a.token);
    ktra(galNgoai.__ma === 400, 'không chuyển Galana cho người ngoài liên minh');
    ktra(docState(idA).galana === galNgoaiA && docState(idB).galana === galNgoaiB,
      'giao dịch Galana ngoài liên minh không đổi số dư hai bên');

    var xinLaiB = await goi('/api/lmxin', { ten: '[DNV] Đại Nam Vệ' }, b.token);
    ktra(!xinLaiB.loi, 'B xin gia nhập lại để thử tiếp tế đồng minh');
    var duyetLaiB = await goi('/api/lmduyet', { tk: idB }, a.token);
    ktra(!duyetLaiB.loi && docState(idB).lm && docState(idB).lm.ten === '[DNV] Đại Nam Vệ',
      'A duyệt B trở lại liên minh');
    var tcDongMinh = await goi('/api/tuyenchien', { tk: idB }, a.token);
    ktra(tcDongMinh.__ma === 400, 'chủ liên minh không thể tuyên chiến với thành viên của mình');
    var galA0 = docState(idA).galana, galB0 = docState(idB).galana;
    var galQuaSoDu = await goi('/api/chuyengalana', { tk: idB, so: galA0 + 1 }, a.token);
    ktra(galQuaSoDu.__ma === 400, 'không chuyển quá số Galana đang có');
    var galChuyen = await goi('/api/chuyengalana', { tk: idB, so: 12345 }, a.token);
    ktra(!galChuyen.loi && docState(idA).galana === galA0 - 12345 && docState(idB).galana === galB0 + 12345,
      'chuyển Galana nội bộ cập nhật đúng, đồng thời cả hai số dư');
    ktra(docState(idA).msgs.some(m => m.td && m.td.indexOf('Đã chuyển Galana') >= 0) &&
      docState(idB).msgs.some(m => m.td && m.td.indexOf('Nhận Galana') >= 0),
      'cả hai đồng minh nhận biên nhận chuyển Galana');
    var danhDongMinh = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cargoL: 1 }, den: b.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, a.token);
    ktra(!!danhDongMinh.loi && danhDongMinh.loi.indexOf('cùng liên minh') >= 0,
      'không thể tấn công thành viên cùng liên minh dù từng có lệnh chiến tranh cá nhân');

    /* ---------- 10b-0. đóng quân quỹ đạo own/allied ---------- */
    var tauGiuSV = { fighterL: 12 };
    var nlGiu6SV = Luat.nhienLieuGiu(null, tauGiuSV, Luat.QUY_DAO_V1.segmentSeconds);
    var nlGiu18SV = Luat.nhienLieuGiuTong(null, tauGiuSV, 18 * 3600);
    suaState(idC, function (st) {
      var p = st.planets[0];
      p.ships.fighterL = (p.ships.fighterL || 0) + 12; p.res.deut += 1000000;
      st.tech.computer = 10;
    });
    var cTruocGiuCam = docState(idC), pcTruocGiuCam = cTruocGiuCam.planets[0];
    var snapGiuCam = { tau: pcTruocGiuCam.ships.fighterL || 0, deut: pcTruocGiuCam.res.deut || 0,
      fleets: cTruocGiuCam.fleets.length, chuyen: cTruocGiuCam.stats.chuyenBay || 0 };
    var giuCam = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: tauGiuSV, den: a.nha, mission: 'hold',
        cargo: { deut: nlGiu18SV }, pct: 100, giu: 18 }
    }, c.token);
    var cSauGiuCam = docState(idC), pcSauGiuCam = cSauGiuCam.planets[0];
    ktra(!!giuCam.loi && /liên minh|đồng minh|Giữ Chỗ/.test(giuCam.loi) &&
      (pcSauGiuCam.ships.fighterL || 0) === snapGiuCam.tau &&
      (pcSauGiuCam.res.deut || 0) >= snapGiuCam.deut &&
      cSauGiuCam.fleets.length === snapGiuCam.fleets &&
      (cSauGiuCam.stats.chuyenBay || 0) === snapGiuCam.chuyen,
      'server chặn outsider hold asset-neutral trước mọi phép trừ');

    suaState(idB, function (st) {
      var p = st.planets[0];
      p.ships.fighterL = (p.ships.fighterL || 0) + 30; p.res.deut += 1000000;
      st.tech.computer = 10; st.tech.armor = 14; st.tech.shield = 12;
      st.baoTri.nextAt = st.now + 1e9; st.nextRaid = st.now + 1e9;
    });
    var giuDongMinh = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: tauGiuSV, den: a.nha, mission: 'hold',
        cargo: { deut: nlGiu18SV }, pct: 100, giu: 18 }
    }, b.token);
    var fGiuSV = giuDongMinh.st && giuDongMinh.st.fleets.filter(function (f0) {
      return f0.mission === 'hold' && f0.pha === 'di';
    }).slice(-1)[0];
    ktra(!giuDongMinh.loi && !!fGiuSV && fGiuSV.cargo.deut === nlGiu18SV,
      'đồng minh xuất phát hold, chưa bị thu phí quỹ đạo upfront');
    var idxBayGiu = truyVan("SELECT * FROM hamdang WHERE tkA=? AND fid=? AND tkD=? AND nv='hold'",
      idB, fGiuSV && fGiuSV.id, idA);
    ktra(idxBayGiu.length === 1, 'hamdang index riêng đoàn hold đang bay tới host');
    var aThayGiuToi = await goi('/api/state', null, a.token);
    var canhGiuToi = aThayGiuToi.st.pvpToi.find(function (x) { return x.id === idB + ':' + fGiuSV.id; });
    ktra(canhGiuToi && canhGiuToi.nv === 'hold' && canhGiuToi.ships === undefined,
      'API host báo inbound hold thân thiện nhưng không lộ đội hình');

    epToiDich(idB); await goi('/api/state', null, b.token);
    var stBGiu = docState(idB), fDaGiuSV = stBGiu.fleets.find(function (f0) { return f0.id === fGiuSV.id; });
    ktra(fDaGiuSV && fDaGiuSV.pha === 'giu' && fDaGiuSV.giuTaiTk === idA &&
      fDaGiuSV.giuRules === Luat.QUY_DAO_V1.holdRules &&
      fDaGiuSV.cargo.deut === nlGiu18SV - nlGiu6SV,
      'arrival chuyển sang stationed, pin host và trừ đúng đoạn nhiên liệu đầu');
    ktra(truyVan('SELECT * FROM hamdang WHERE tkA=? AND fid=?', idB, fGiuSV.id).length === 0 &&
      truyVan('SELECT * FROM hamgiu WHERE tkA=? AND fid=? AND tkD=?', idB, fGiuSV.id, idA).length === 1,
      'arrival thay inbound index bằng một hamgiu projection');
    var aThayDongQuan = await goi('/api/state', null, a.token);
    var garrisonAPI = aThayDongQuan.st.pvpGiu.find(function (x) { return x.id === idB + ':' + fGiuSV.id; });
    ktra(garrisonAPI && garrisonAPI.tk === idB && garrisonAPI.fid === fGiuSV.id &&
      garrisonAPI.den === toaDoA && garrisonAPI.ships.fighterL === 12 && !garrisonAPI.ta,
      'pvpGiu chỉ cho host và lấy đội hình canonical từ state chủ hạm');
    var mocTiepGiuAPI = docState(idB).fleets.find(function (x) { return x.id === fGiuSV.id; }).tiepNL_t;
    var quaHanGiuAPI = Math.floor(Date.now() / 1000) - 1;
    suaState(idB, function (st) {
      var fg = st.fleets.find(function (x) { return x.id === fGiuSV.id; }); fg.tiepNL_t = quaHanGiuAPI;
    });
    var dbQuaHanGiu = moDB();
    dbQuaHanGiu.prepare('UPDATE hamgiu SET tiepNLT=? WHERE tkA=? AND fid=?').run(
      quaHanGiuAPI, idB, fGiuSV.id);
    dbQuaHanGiu.close();
    var aKhongThayQuaHan = await goi('/api/state', null, a.token);
    ktra(!aKhongThayQuaHan.st.pvpGiu.some(function (x) { return x.id === idB + ':' + fGiuSV.id; }),
      'API host ẩn bảo thủ garrison đã tới checkpoint nhiên liệu cho tới khi owner được tick');
    suaState(idB, function (st) {
      var fg = st.fleets.find(function (x) { return x.id === fGiuSV.id; }); fg.tiepNL_t = mocTiepGiuAPI;
    });
    var dbPhucHoiGiu = moDB();
    dbPhucHoiGiu.prepare('UPDATE hamgiu SET tiepNLT=? WHERE tkA=? AND fid=?').run(
      mocTiepGiuAPI, idB, fGiuSV.id);
    dbPhucHoiGiu.close();
    var cKhongThayGiu = await goi('/api/state', null, c.token);
    ktra(Array.isArray(cKhongThayGiu.st.pvpGiu) && cKhongThayGiu.st.pvpGiu.length === 0,
      'người ngoài không dùng API để do thám garrison của host');

    /* Projection bị mất hoặc có row rác đều tự chữa từ canonical dq.state. */
    var dbGiuRac = moDB();
    dbGiuRac.prepare('DELETE FROM hamgiu WHERE tkA=? AND fid=?').run(idB, fGiuSV.id);
    dbGiuRac.prepare(`INSERT INTO hamgiu(tkA,fid,tkD,tu,td,giuLuc,giuDenT,tiepNLT)
                      VALUES(?,?,?,?,?,?,?,?)`).run(idB, 999999, idA, toaDoB, toaDoA,
      fDaGiuSV.giuLuc, fDaGiuSV.giuDen_t, fDaGiuSV.tiepNL_t);
    dbGiuRac.close();
    var aLocRac = await goi('/api/state', null, a.token);
    ktra(!aLocRac.st.pvpGiu.some(function (x) { return x.fid === 999999; }),
      'API lọc row hamgiu rác không có fleet canonical');
    await goi('/api/state', null, b.token);
    ktra(truyVan('SELECT * FROM hamgiu WHERE tkA=? AND fid=?', idB, fGiuSV.id).length === 1 &&
      truyVan('SELECT * FROM hamgiu WHERE tkA=? AND fid=?', idB, 999999).length === 0,
      'lần lưu kế tiếp rebuild projection thiếu và xoá row stale');

    /* Một fleet thứ hai chứng minh recall stationed dùng nguyên tuyến, không
       cộng nhầm thời gian đã đậu và không hoàn nhiên liệu đã trả. */
    var giuDeGoi = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { fighterL: 6 }, den: a.nha, mission: 'hold',
        cargo: { deut: Luat.nhienLieuGiuTong(null, { fighterL: 6 }, 6 * 3600) }, pct: 100, giu: 6 }
    }, b.token);
    var fDeGoi = giuDeGoi.st.fleets.filter(function (f0) { return f0.mission === 'hold' && f0.pha === 'di'; }).slice(-1)[0];
    epToiDich(idB); await goi('/api/state', null, b.token);
    var truocGoiSV = docState(idB), fTruocGoiSV = truocGoiSV.fleets.find(function (f0) { return f0.id === fDeGoi.id; });
    var cargoTruocGoiSV = JSON.stringify(fTruocGoiSV.cargo);
    var tgVeSV = Luat.tgBay(truocGoiSV, fTruocGoiSV.ships,
      Luat.khoangCach(fTruocGoiSV.den, fTruocGoiSV.tu), fTruocGoiSV.pct);
    var goiGiuSV = await goi('/api/lam', { ten: 'goive', dl: { fid: fDeGoi.id } }, b.token);
    var fVeSV = goiGiuSV.st.fleets.find(function (f0) { return f0.id === fDeGoi.id; });
    ktra(!goiGiuSV.loi && fVeSV.pha === 've' && fVeSV.ve_t - goiGiuSV.st.now === tgVeSV &&
      JSON.stringify(fVeSV.cargo) === cargoTruocGoiSV,
      'server recall stationed theo full route và không hoàn khoản đã trả');
    epToiDich(idB); await goi('/api/state', null, b.token);

    /* Ba chủ thật: C đánh host A, fleet của B giữ quỹ đạo. Mỗi nhóm dùng
       tech/canonical state của đúng owner và cùng commit với report/debris. */
    suaState(idA, function (st) {
      st.planets[0].ships = { fighterL: 8 };
      st.planets[0].def = { missileLauncher: 20 };
      st.tech.weapon = 0; st.tech.shield = 0; st.tech.armor = 0;
    });
    suaState(idC, function (st) {
      var p = st.planets[0];
      p.ships = { cruiser: 103 }; p.res.deut = 1000000;
      p.b.metalMine = 1000000; p.b.solar = Math.max(p.b.solar || 0, 1000000);
      st.tech.weapon = 4; st.tech.shield = 0; st.tech.armor = 0; st.tech.computer = 10;
      st.baoTri.nextAt = st.now + 1e9; st.nextRaid = st.now + 1e9;
    });
    await goi('/api/state', null, a.token); await goi('/api/state', null, b.token);
    await goi('/api/state', null, c.token);
    var dbChienCA = moDB();
    var chienCATonTai = dbChienCA.prepare('SELECT id FROM chien WHERE tkA=? AND tkD=?').get(idC, idA);
    if (!chienCATonTai) dbChienCA.prepare('INSERT INTO chien(lmA,tkA,tkD,khi) VALUES(NULL,?,?,?)').run(
      idC, idA, Math.floor(Date.now() / 1000) - 90000);
    else dbChienCA.prepare('UPDATE chien SET khi=? WHERE id=?').run(
      Math.floor(Date.now() / 1000) - 90000, chienCATonTai.id);
    dbChienCA.close();
    ktra(truyVan('SELECT * FROM chien WHERE tkA=? AND tkD=?', idC, idA).length === 1,
      'chuẩn bị lệnh C→A đã đủ 24 giờ cho trận phòng thủ ba chủ');
    var pl3Truoc = truyVan('SELECT kl,tt FROM pl WHERE td=?', toaDoA)[0] || { kl: 0, tt: 0 };
    var tran3Truoc = truyVan('SELECT * FROM tran').length;
    var bt3Truoc = truyVan("SELECT * FROM bangtin WHERE loai='tran'").length;
    var icbm3Truoc = JSON.stringify({ a: docState(idA).tenLua || [], c: docState(idC).tenLua || [],
      misA: docState(idA).planets[0].mis || {}, misC: docState(idC).planets[0].mis || {} });
    var danh3Chu = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cruiser: 3 }, den: a.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, c.token);
    ktra(!danh3Chu.loi, 'C phát được hạm tấn công vào host đang có đồng minh giữ quỹ đạo');
    epToiDich(idC); await goi('/api/state', null, c.token);
    var stC3 = docState(idC), stA3Giu = docState(idA), stB3Giu = docState(idB);
    var bcC3 = stC3.msgs.filter(function (m) {
      return m.loai === 'tran' && m.data && m.data.pvp && m.data.ben === 'ta' && m.data.td &&
        G.tdKeyLike(m.data.td) === toaDoA;
    })[0];
    var bcB3 = stB3Giu.msgs.filter(function (m) {
      return m.loai === 'tran' && m.data && m.data.pvp && m.data.ben === 'hotro';
    })[0];
    var fB3 = stB3Giu.fleets.find(function (x) { return x.id === fGiuSV.id; });
    var kq3Chu = bcC3 && bcC3.data.kq;
    ktra(kq3Chu && kq3Chu.conNhomD.length === 2 &&
      JSON.stringify(stA3Giu.planets[0].ships) === JSON.stringify(kq3Chu.conNhomD[0]) &&
      JSON.stringify(fB3 ? fB3.ships : {}) === JSON.stringify(kq3Chu.conNhomD[1]),
      'combat writeback group0 vào hành tinh A và group1 đúng fleet B, không trộn ownership');
    var matB3 = kq3Chu ? G_tong(kq3Chu.matNhomD[1] || {}) : -1;
    ktra(bcB3 && bcB3.data.mat === matB3 && bcB3.data.chuNha === 'Quốc Bình' &&
      bcC3.data.hoTro.some(function (x) { return x.tk === idB && x.mat === matB3; }),
      'owner hỗ trợ nhận report riêng và attacker thấy metadata loss đúng chủ');
    ktra(kq3Chu && !kq3Chu.vongDanh.some(function (v) { return v.matDat; }) &&
      stA3Giu.planets[0].def.missileLauncher === 20,
      'garrison còn sống giữ ranh giới quỹ đạo, công sự mặt đất không bị đánh xuyên');
    var pl3Sau = truyVan('SELECT kl,tt FROM pl WHERE td=?', toaDoA)[0] || { kl: 0, tt: 0 };
    ktra(kq3Chu && pl3Sau.kl - pl3Truoc.kl === kq3Chu.pheLieu.metal &&
      pl3Sau.tt - pl3Truoc.tt === kq3Chu.pheLieu.crystal &&
      truyVan('SELECT * FROM tran').length === tran3Truoc + 1 &&
      truyVan("SELECT * FROM bangtin WHERE loai='tran'").length === bt3Truoc + 1,
      'trận ba chủ ghi phế liệu/tran/bảng tin đúng một lần trong cùng kết quả');
    ktra(JSON.stringify({ a: stA3Giu.tenLua || [], c: stC3.tenLua || [],
      misA: stA3Giu.planets[0].mis || {}, misC: stC3.planets[0].mis || {} }) === icbm3Truoc,
      'đóng quân và combat nhóm không làm đổi hàng tên lửa/ICBM');

    /* Biên cùng giây: arrival được tick trước và tham chiến; expiry được tick
       sang pha về trước khi dựng nhóm nên không còn phòng thủ tại T. */
    var soNhomNenEdge = 1 + docState(idB).fleets.filter(function (x) {
      return x.mission === 'hold' && x.pha === 'giu' && G.tdKeyLike(x.den) === toaDoA;
    }).length;
    var nlEdge = Luat.nhienLieuGiuTong(null, { fighterL: 6 }, 6 * 3600);
    var giuEdge = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { fighterL: 6 }, den: a.nha, mission: 'hold',
        cargo: { deut: nlEdge }, pct: 100, giu: 6 }
    }, b.token);
    var fEdge = giuEdge.st.fleets.filter(function (f0) { return f0.mission === 'hold' && f0.pha === 'di'; }).slice(-1)[0];
    var danhEdge1 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cruiser: 1 }, den: a.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, c.token);
    var fAtkEdge1 = danhEdge1.st.fleets.filter(function (f0) { return f0.mission === 'attack' && f0.pha === 'di'; }).slice(-1)[0];
    var tEdge1 = Math.floor(Date.now() / 1000) - 1;
    suaState(idB, function (st) {
      st.now = st.lastTick = tEdge1 - 5;
      var fg = st.fleets.find(function (x) { return x.id === fEdge.id; }); if (fg) fg.den_t = tEdge1;
    });
    suaState(idC, function (st) {
      st.now = st.lastTick = tEdge1 - 5;
      var fa = st.fleets.find(function (x) { return x.id === fAtkEdge1.id; }); if (fa) fa.den_t = tEdge1;
    });
    suaState(idA, function (st) { st.now = st.lastTick = tEdge1 - 5; });
    var dbEdge1 = moDB();
    dbEdge1.prepare('UPDATE hamdang SET denT=? WHERE tkA=? AND fid=?').run(tEdge1, idB, fEdge.id);
    dbEdge1.close();
    await goi('/api/state', null, c.token);
    var bcEdge1 = docState(idC).msgs.filter(function (m) {
      return m.loai === 'tran' && m.data && m.data.pvp && m.data.ben === 'ta';
    })[0];
    var fEdgeSauToi = docState(idB).fleets.find(function (x) { return x.id === fEdge.id; });
    ktra(bcEdge1 && bcEdge1.data.kq.conNhomD.length === soNhomNenEdge + 1 &&
      (!fEdgeSauToi || fEdgeSauToi.pha === 'giu'),
      'hold arrival đúng giây T được tick trước và trở thành nhóm phòng thủ trong trận T');

    var danhEdge2 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cruiser: 1 }, den: a.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, c.token);
    var fAtkEdge2 = danhEdge2.st.fleets.filter(function (f0) { return f0.mission === 'attack' && f0.pha === 'di'; }).slice(-1)[0];
    var tEdge2 = Math.floor(Date.now() / 1000) - 1;
    suaState(idB, function (st) {
      st.now = st.lastTick = tEdge2 - 5;
      var fg = st.fleets.find(function (x) { return x.id === fEdge.id; });
      if (fg) { fg.giuDen_t = tEdge2; fg.tiepNL_t = tEdge2; }
    });
    suaState(idC, function (st) {
      st.now = st.lastTick = tEdge2 - 5;
      var fa = st.fleets.find(function (x) { return x.id === fAtkEdge2.id; }); if (fa) fa.den_t = tEdge2;
    });
    suaState(idA, function (st) { st.now = st.lastTick = tEdge2 - 5; });
    var dbEdge2 = moDB();
    dbEdge2.prepare('UPDATE hamgiu SET giuDenT=?,tiepNLT=? WHERE tkA=? AND fid=?').run(
      tEdge2, tEdge2, idB, fEdge.id);
    dbEdge2.close();
    await goi('/api/state', null, c.token);
    var bcEdge2 = docState(idC).msgs.filter(function (m) {
      return m.loai === 'tran' && m.data && m.data.pvp && m.data.ben === 'ta';
    })[0];
    var fEdgeSauHet = docState(idB).fleets.find(function (x) { return x.id === fEdge.id; });
    ktra(bcEdge2 && bcEdge2.data.kq.conNhomD.length === soNhomNenEdge && fEdgeSauHet && fEdgeSauHet.pha === 've',
      'hold hết hạn đúng giây T chuyển về và bị loại khỏi nhóm phòng thủ trận T');

    /* Latest-state DB không được áp trận lịch sử lên target đã tick xa hơn.
       Hạm vẫn outbound, được rebase tới lát cắt đơn điệu và không có side effect. */
    suaState(idC, function (st) {
      st.planets[0].ships.cruiser = (st.planets[0].ships.cruiser || 0) + 1;
      st.planets[0].res.deut += 100000;
    });
    var danhDonDieu = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cruiser: 1 }, den: a.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, c.token);
    var fDonDieu = danhDonDieu.st.fleets.filter(function (f0) {
      return f0.mission === 'attack' && f0.pha === 'di';
    }).slice(-1)[0];
    var tDonDieu = Math.floor(Date.now() / 1000) - 2, mocTuongLai = tDonDieu + 120;
    suaState(idC, function (st) {
      st.now = st.lastTick = tDonDieu - 5;
      var fa = st.fleets.find(function (x) { return x.id === fDonDieu.id; }); fa.den_t = tDonDieu;
    });
    suaState(idA, function (st) { st.now = st.lastTick = mocTuongLai; });
    var dbDonDieu = moDB();
    dbDonDieu.prepare('UPDATE hamdang SET denT=? WHERE tkA=? AND fid=?').run(tDonDieu, idC, fDonDieu.id);
    dbDonDieu.close();
    var soTranTruocDonDieu = truyVan('SELECT * FROM tran').length;
    await goi('/api/state', null, c.token);
    var stSauDonDieu = docState(idC), fSauDonDieu = stSauDonDieu.fleets.find(function (x) {
      return x.id === fDonDieu.id;
    });
    ktra(fSauDonDieu && fSauDonDieu.pha === 'di' && fSauDonDieu.den_t >= mocTuongLai &&
      truyVan('SELECT * FROM tran').length === soTranTruocDonDieu,
      'target đã ở snapshot tương lai làm attack rebase đơn điệu, không đánh/log/debris tại quá khứ');
    /* Dọn fixture trực tiếp để các bài nghiệp vụ sau không phải chờ mốc +120. */
    suaState(idC, function (st) {
      var fi = st.fleets.findIndex(function (x) { return x.id === fDonDieu.id; });
      if (fi >= 0) {
        var ff = st.fleets[fi];
        for (var sid in ff.ships) st.planets[ff.pi].ships[sid] = (st.planets[ff.pi].ships[sid] || 0) + ff.ships[sid];
        st.fleets.splice(fi, 1);
      }
      st.now = st.lastTick = Math.floor(Date.now() / 1000);
    });
    suaState(idA, function (st) { st.now = st.lastTick = Math.floor(Date.now() / 1000); });
    var dbDonDonDieu = moDB();
    dbDonDonDieu.prepare('DELETE FROM hamdang WHERE tkA=? AND fid=?').run(idC, fDonDieu.id);
    dbDonDonDieu.close();
    /* Hoàn nguyên tàu vận tải phục vụ đúng các bài tiếp tế kế tiếp; trận mẫu
       cố ý thay toàn bộ đội hình host để kiểm soát ranh giới hai lớp. */
    suaState(idA, function (st) {
      st.planets[0].ships.cargoL = (st.planets[0].ships.cargoL || 0) + 50;
      st.planets[0].res.deut += 1000000;
    });

    /* ép kho Kim Loại của B đầy tràn để thử nhánh "không còn chỗ" */
    suaState(idB, function (st) {
      var p = st.planets[0];
      p.b.metalStore = slCap('metalStore', 3);
      p.res.metal = 1e9;
    });
    await goi('/api/state', null, b.token);

    /* 10b-1: kho bên nhận đang đầy -> hàng phải được mang về, không bốc hơi */
    var tt0 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cargoL: 20 }, den: b.nha, mission: 'transport', cargo: { metal: 200000 }, pct: 100 }
    }, a.token);
    ktra(!tt0.loi, 'gửi hạm đội tiếp tế (kho bên nhận đầy)' + (tt0.loi ? ': ' + tt0.loi : ''));
    epToiDich(idA);
    await goi('/api/state', null, a.token);
    var stA2 = docState(idA);
    ktra(stA2.msgs.some(m => m.td && m.td.indexOf('Kho bên nhận đã đầy') >= 0), 'báo về khi kho bên nhận không còn chỗ');
    var hamDay = stA2.fleets.filter(x => x.pha === 've');
    ktra(hamDay.length === 1 && (hamDay[0].cargo.metal || 0) === 200000, 'hàng không giao được thì được mang về nguyên vẹn');
    epToiDich(idA);
    await goi('/api/state', null, a.token);
    ktra(docState(idA).planets[0].res.metal > 350000, 'hàng mang về đã nhập lại kho của A');

    /* 10b-2: nới kho bên nhận -> giao được thật */
    suaState(idB, function (st) {
      st.planets[0].b.metalStore = slCap('metalStore', 11); st.planets[0].res.metal = 50000;
    });
    suaState(idA, function (st) { st.planets[0].res.metal = 400000; });
    await goi('/api/state', null, b.token);
    var klB2 = docState(idB).planets[0].res.metal;
    var tt1 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cargoL: 20 }, den: b.nha, mission: 'transport', cargo: { metal: 200000 }, pct: 100 }
    }, a.token);
    ktra(!tt1.loi, 'gửi hạm đội tiếp tế cho B' + (tt1.loi ? ': ' + tt1.loi : ''));
    epToiDich(idA);
    await goi('/api/state', null, a.token);
    var stA3 = docState(idA), stB3 = docState(idB);
    ktra(stB3.planets[0].res.metal >= klB2 + 199000, 'B nhận được tài nguyên tiếp tế (' + G_so(klB2) + ' → ' + G_so(stB3.planets[0].res.metal) + ')');
    ktra(stA3.msgs.some(m => m.td && m.td.indexOf('Đã tiếp tế') >= 0), 'A có biên nhận đã tiếp tế');
    ktra(stB3.msgs.some(m => m.td && m.td.indexOf('Được tiếp tế') >= 0), 'B được thông báo có hàng tiếp tế');
    ktra(truyVan("SELECT * FROM bangtin WHERE loai='tiepte'").length >= 1, 'bảng tin ghi lại vụ tiếp tế');
    var hamTT = stA3.fleets.filter(x => x.pha === 've');
    ktra(hamTT.length >= 1, 'hạm đội tiếp tế đang trên đường về');

    /* Tư cách đồng minh phải được kiểm tra lại ở đích, không chỉ lúc gửi. */
    suaState(idA, function (st) {
      st.planets[0].ships.cargoL = (st.planets[0].ships.cargoL || 0) + 1;
      st.planets[0].res.metal += 5000; st.planets[0].res.deut += 100000;
    });
    var ttDoiTuCach = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { cargoL: 1 }, den: b.nha, mission: 'transport', cargo: { metal: 1000 }, pct: 100 }
    }, a.token);
    var fidDoiTuCach = ttDoiTuCach.st && ttDoiTuCach.st.fleets.filter(x => x.pha === 'di').slice(-1)[0];
    ktra(!ttDoiTuCach.loi && !!fidDoiTuCach, 'gửi được chuyến tiếp tế khi hai bên còn là đồng minh');
    var bRoiGiuaDuong = await goi('/api/lam', { ten: 'lmra', dl: {} }, b.token);
    ktra(!bRoiGiuaDuong.loi, 'B rời liên minh trong lúc hàng đang bay');
    epToiDich(idA);
    await goi('/api/state', null, a.token);
    var stADoiTuCach = docState(idA);
    var hamBiTra = fidDoiTuCach && stADoiTuCach.fleets.find(x => x.id === fidDoiTuCach.id);
    ktra(stADoiTuCach.msgs.some(m => m.td && m.td.indexOf('Tiếp tế bị Hội Đồng Bảo An chặn') >= 0),
      'máy chủ chặn giao hàng khi bên nhận đã rời liên minh');
    ktra(hamBiTra && hamBiTra.pha === 've' && (hamBiTra.cargo.metal || 0) === 1000,
      'hàng bị chặn ở đích được mang về nguyên vẹn');

    var hostSauRoiLM = await goi('/api/state', null, a.token);
    ktra(!hostSauRoiLM.st.pvpGiu.some(function (x) { return x.id === idB + ':' + fGiuSV.id; }),
      'rời liên minh làm garrison mất quyền phòng thủ/API ngay, không giữ snapshot membership');
    var cargoTruocMatQuyenGiu;
    suaState(idB, function (st) {
      var fg = st.fleets.find(function (x) { return x.id === fGiuSV.id; });
      if (!fg) return;
      cargoTruocMatQuyenGiu = JSON.stringify(fg.cargo);
      st.lastTick = st.now - 5;
      fg.giuDen_t = st.now + 3600;
      fg.tiepNL_t = st.now - 2;
    });
    await goi('/api/state', null, b.token);
    var fBiDuoiGiu = docState(idB).fleets.find(function (x) { return x.id === fGiuSV.id; });
    ktra(fBiDuoiGiu && fBiDuoiGiu.pha === 've' &&
      JSON.stringify(fBiDuoiGiu.cargo) === cargoTruocMatQuyenGiu &&
      truyVan('SELECT * FROM hamgiu WHERE tkA=? AND fid=?', idB, fGiuSV.id).length === 0,
      'checkpoint kế tiếp recheck alliance, cho fleet về không thu thêm nhiên liệu và dọn index');

    /* ---------- 10c. thư giữa người chơi ---------- */
    var soTinB = docState(idB).msgs.length;
    var th1 = await goi('/api/guithu', { den: 'Lê Vũ', noi: 'Đình chiến nhé, ta chia đôi hệ này.' }, a.token);
    ktra(!th1.loi, 'gửi được thư cho người chơi khác' + (th1.loi ? ': ' + th1.loi : ''));
    var stBThu = docState(idB);
    var thu = stBThu.msgs.find(m => m.loai === 'thu');
    ktra(!!thu, 'thư vào đúng hộp tin của người nhận');
    if (thu) {
      ktra(thu.td.indexOf('Quốc Bình') >= 0, 'thư ghi đúng tên người gửi');
      ktra(thu.nd.indexOf('Đình chiến') >= 0, 'nội dung thư nguyên vẹn');
    }
    ktra(stBThu.msgs.length === soTinB + 1, 'chỉ thêm đúng một tin');
    var th2 = await goi('/api/guithu', { den: 'Không Có Ai', noi: 'xin chào' }, a.token);
    ktra(!!th2.loi, 'không gửi được cho người không tồn tại');
    var th3 = await goi('/api/guithu', { den: 'Quốc Bình', noi: 'tự gửi' }, a.token);
    ktra(!!th3.loi, 'không tự gửi thư cho chính mình');
    var th4 = await goi('/api/guithu', { den: 'Lê Vũ', noi: '' }, a.token);
    ktra(!!th4.loi, 'không gửi được thư trống');
    var th5 = await goi('/api/guithu', { den: 'Lê Vũ', noi: 'spam ngay lập tức' }, a.token);
    ktra(th5.__ma === 429, 'chặn gửi thư liên tiếp (chống spam)');

    /* ---------- 10d. bỏ hoang thuộc địa ---------- */
    var stCol = docState(idA);
    if (stCol.planets.length >= 2) {
      var tdCol = G.tdKeyLike(stCol.planets[1].c);
      var bh1 = await goi('/api/lam', { ten: 'boHoang', dl: { pi: 1 } }, a.token);
      ktra(!!bh1.loi, 'bỏ hoang phải có xác nhận');
      var bh2 = await goi('/api/lam', { ten: 'boHoang', dl: { pi: 0, xacnhan: 'BO' } }, a.token);
      ktra(!!bh2.loi, 'không bỏ được hành tinh mẹ');
      var bh3 = await goi('/api/lam', { ten: 'boHoang', dl: { pi: 1, xacnhan: 'BO' } }, a.token);
      ktra(!bh3.loi, 'bỏ hoang được thuộc địa' + (bh3.loi ? ': ' + bh3.loi : ''));
      ktra(truyVan('SELECT * FROM ht WHERE td=?', tdCol).length === 0, 'ô toạ độ được trả về trạng thái trống trong bảng ht');
      ktra(bh3.st.planets.length === stCol.planets.length - 1, 'đế quốc còn ít hơn 1 hành tinh');
    }

    /* ---------- 11. xếp hạng & bảng tin ---------- */
    /* xếp hạng theo hạng mục */
    var xhHam = await goi('/api/xephang?loai=ham', null, a.token);
    ktra(xhHam.loai === 'ham' && xhHam.ds.length >= 2, 'xếp hạng theo hạm đội trả về danh sách');
    var giamHam = xhHam.ds.every(function (e, i) { return i === 0 || xhHam.ds[i - 1].diem >= e.diem; });
    ktra(giamHam, 'xếp hạng hạm đội sắp giảm dần đúng');
    ktra(xhHam.ds[0].tong !== undefined && xhHam.ds[0].ct !== undefined, 'mỗi dòng có đủ điểm từng hạng mục');
    var xhThu = await goi('/api/xephang?loai=thu', null, a.token);
    var khac = JSON.stringify(xhThu.ds.map(function (e) { return e.ten; })) !==
               JSON.stringify(xhHam.ds.map(function (e) { return e.ten; }));
    ktra(khac || xhThu.ds.length < 3, 'thứ tự hạng mục phòng thủ khác hạng mục hạm đội');
    var xhBay = await goi('/api/xephang?loai=linhtinh', null, a.token);
    ktra(xhBay.ds.length >= 2, 'hạng mục không hợp lệ thì quay về tổng điểm chứ không lỗi');

    var xh = await goi('/api/xephang', null, a.token);
    ktra(xh.ds.length === 4 && xh.ds[0].diem >= xh.ds[1].diem, 'bảng xếp hạng lấy từ database, sắp theo điểm (' + xh.ds.length + ' người)');
    ktra(xh.ds.some(e => e.ta), 'bảng xếp hạng đánh dấu được chính mình');
    var bt = await goi('/api/bangtin', null, a.token);
    ktra(bt.bt.length >= 3, 'bảng tin vũ trụ có tin (' + bt.bt.length + ')');

    /* ---------- 12. đổi mật khẩu & đăng xuất ---------- */
    var dm1 = await goi('/api/doimk', { cu: 'sai', moi: 'matkhaumoi1' }, a.token);
    ktra(dm1.__ma === 401, 'không đổi được mật khẩu khi nhập sai mật khẩu cũ');
    var postCu = moPostCham('/api/doimk', dung.token);
    await nghi(100);               // để server xác thực phiên cũ rồi chờ phần body còn lại
    var dm2 = await goi('/api/doimk', { cu: 'matkhau123', moi: 'matkhaumoi1' }, a.token);
    ktra(!dm2.loi, 'đổi được mật khẩu');
    postCu.req.end('"cu":"matkhau123","moi":"matkhauchiem"}');
    var doiBangPhienCu = await postCu.kq;
    ktra(doiBangPhienCu.__ma === 401, 'POST gửi dở bị chặn nếu phiên bị thu hồi trong lúc đọc body');
    var dnChiem = await goi('/api/dangnhap', { ten: 'quocbinh', mk: 'matkhauchiem' });
    ktra(dnChiem.__ma === 401, 'phiên cũ không thể đổi ngược mật khẩu sau khi đã bị thu hồi');
    var dn2 = await goi('/api/dangnhap', { ten: 'quocbinh', mk: 'matkhaumoi1' });
    ktra(!!dn2.token, 'đăng nhập bằng mật khẩu mới');

    /* đổi mật khẩu phải đá mọi phiên khác ra */
    var phienX = (await goi('/api/dangnhap', { ten: 'quocbinh', mk: 'matkhaumoi1' })).token;
    ktra((await goi('/api/state', null, phienX)).__ma === 200, 'phiên thứ hai dùng được trước khi đổi mật khẩu');
    await goi('/api/doimk', { cu: 'matkhaumoi1', moi: 'matkhaumoi2' }, dn2.token);
    ktra((await goi('/api/state', null, phienX)).__ma === 401, 'đổi mật khẩu thu hồi các phiên khác');
    ktra((await goi('/api/state', null, dn2.token)).__ma === 200, 'phiên đang thao tác vẫn giữ được');
    a.token = dn2.token;

    /* không né được giới hạn đăng nhập bằng header IP giả */
    var choLot = 0;
    for (var ipg = 0; ipg < 25; ipg++) {
      var rIP = await fetch(URL + '/api/dangnhap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.' + ipg },
        body: JSON.stringify({ ten: 'quocbinh', mk: 'doantam' })
      });
      if (rIP.status !== 429) choLot++;
    }
    ktra(choLot < 25, 'giả mạo x-forwarded-for không né được giới hạn đoán mật khẩu (' + choLot + '/25 lọt)');
    await goi('/api/dangxuat', {}, a.token);
    var sauThoat = await goi('/api/state', null, a.token);
    ktra(sauThoat.__ma === 401, 'token bị vô hiệu sau khi đăng xuất');

    /* ---------- 12b. xoá tài khoản ---------- */
    var xt = await goi('/api/dangky', { ten: 'roigame', hienthi: 'Rời Game', mk: 'matkhau111' });
    ktra(!!xt.token, 'đăng ký tài khoản để thử xoá');
    var idX = truyVan("SELECT id FROM tk WHERE ten='roigame'")[0].id;
    var tdX = xt.nha.g + ':' + xt.nha.h + ':' + xt.nha.p;
    ktra(truyVan('SELECT * FROM ht WHERE td=?', tdX).length === 1, 'hành tinh của tài khoản mới có trong bảng ht');
    var lmX = await goi('/api/lmtao', { ten: 'Đội Chuyển Giao', tag: 'CG' }, xt.token);
    ktra(!lmX.loi, 'tài khoản sắp xoá lập liên minh để thử chuyển chủ tự động');
    await goi('/api/lmxin', { ten: '[CG] Đội Chuyển Giao' }, c.token);
    var lmXDuyet = await goi('/api/lmduyet', { tk: idC }, xt.token);
    ktra(!lmXDuyet.loi && docState(idC).lm, 'C vào liên minh của tài khoản sắp xoá');
    var x1 = await goi('/api/xoatk', { mk: 'sai', xacnhan: 'XOA' }, xt.token);
    ktra(x1.__ma === 401, 'không xoá được khi sai mật khẩu');
    var x2 = await goi('/api/xoatk', { mk: 'matkhau111', xacnhan: 'co' }, xt.token);
    ktra(x2.__ma === 400, 'không xoá được khi chưa gõ đúng chữ xác nhận');
    ktra(truyVan('SELECT * FROM tk WHERE id=?', idX).length === 1, 'tài khoản vẫn còn sau hai lần thử sai');
    var x3 = await goi('/api/xoatk', { mk: 'matkhau111', xacnhan: 'XOA' }, xt.token);
    ktra(!x3.loi, 'xoá được tài khoản' + (x3.loi ? ': ' + x3.loi : ''));
    ktra(truyVan('SELECT * FROM tk WHERE id=?', idX).length === 0, 'dòng tk đã bị xoá');
    ktra(truyVan('SELECT * FROM dq WHERE tk=?', idX).length === 0, 'đế quốc bị xoá theo (CASCADE)');
    ktra(truyVan('SELECT * FROM ht WHERE tk=?', idX).length === 0, 'hành tinh trở về trạng thái trống');
    ktra(truyVan('SELECT * FROM phien WHERE tk=?', idX).length === 0, 'phiên đăng nhập bị thu hồi');
    var lmSauXoaChu = truyVan("SELECT * FROM lm WHERE ten='[CG] Đội Chuyển Giao'")[0];
    ktra(lmSauXoaChu && lmSauXoaChu.chu === idC, 'xoá chủ tự chuyển quyền cho thành viên mạnh nhất còn lại');
    var cRoiLM = await goi('/api/lam', { ten: 'lmra', dl: {} }, c.token);
    ktra(!cRoiLM.loi && truyVan("SELECT * FROM lm WHERE ten='[CG] Đội Chuyển Giao'").length === 0,
      'chủ cuối cùng rời thì liên minh rỗng được dọn sạch');
    var sauXoa = await goi('/api/state', null, xt.token);
    ktra(sauXoa.__ma === 401, 'token của tài khoản đã xoá không dùng được nữa');
    var heTrong = await goi('/api/he?g=' + xt.nha.g + '&h=' + xt.nha.h, null, b.token);
    var oCu = heTrong.o.find(o => o.c.p === xt.nha.p);
    ktra(oCu && oCu.loai !== 'nguoi', 'ô hành tinh cũ không còn hiện là của người chơi nào');
    ktra(truyVan('SELECT * FROM tran').length >= 2, 'lịch sử trận đánh không bị xoá theo tài khoản');

    /* ---------- 13. dữ liệu bền vững + nâng cấp DB cũ ---------- */
    var chienTruocKhoiDong = JSON.stringify(truyVan('SELECT lmA,tkA,tkD,khi FROM chien ORDER BY id'));
    /* Hạ riêng state B về mẫu v3 có cả công trình hoàn thành lẫn hàng đợi.
       Startup kế tiếp phải đổi theo vốn lũy kế trước khi mở HTTP. */
    var mocQueueV3 = 987654321, costQueueV3 = { metal: 777, crystal: 333 };
    var resV3 = suaState(idB, function (st) {
      st.v = 3; delete st.moHinhCT; delete st.moHinhNhip; delete st.baoTri;
      st.planets[0].b = { metalMine: 4, robot: 2 };
      delete st.planets[0].danSu;
      st.planets[0].qB = [{ id: 'metalMine', lv: 5, cost: costQueueV3, tg: 321, xong: mocQueueV3 }];
    }).planets[0].res;
    var dbCotCu = moDB();
    dbCotCu.prepare('UPDATE dq SET diem=-99,diemCT=-99,diemNC=-99,diemHam=-99,diemThu=-99 WHERE tk=?').run(idB);
    dbCotCu.close();
    sv.kill('SIGTERM');
    await nghi(700);
    /* Mô phỏng dữ liệu do bản server cũ để lại: cựu chủ B không còn là thành
       viên nhưng lm.chu vẫn trỏ tới B, kèm một liên minh hoàn toàn mồ côi. */
    var dbCu = moDB();
    dbCu.prepare("UPDATE lm SET chu=? WHERE ten='[DNV] Đại Nam Vệ'").run(idB);
    dbCu.prepare('INSERT INTO lm(ten,tag,chu,tao,mota) VALUES(?,?,?,?,?)').run(
      '[CU] Liên Minh Mồ Côi', 'CU', 999999, Math.floor(Date.now() / 1000), null);
    dbCu.close();
    var sv2 = spawn(process.execPath, [path.join(GOC, 'server', 'index.js')], {
      env: Object.assign({}, process.env, { PORT: String(CONG + 1), THDC_DB: DB, THDC_NHIP: '60000', THDC_GIOI_HAN: '5000' }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    var raSV2 = ''; sv2.stdout.on('data', d => raSV2 += d); sv2.stderr.on('data', d => raSV2 += d);
    var URL0 = URL; URL = 'http://127.0.0.1:' + (CONG + 1);
    var san2 = false;
    for (var j = 0; j < 60 && !san2; j++) { await nghi(150); try { var t2 = await goi('/api/thongtin'); san2 = !!t2.seed; } catch (e) { } }
    ktra(san2, 'server khởi động lại được từ database cũ');
    if (san2) {
      var tt2 = await goi('/api/thongtin');
      ktra(tt2.seed === tt.seed, 'hạt giống vũ trụ giữ nguyên sau khi khởi động lại');
      ktra(tt2.soNguoi === 4, 'vẫn còn 4 tài khoản (tài khoản đã xoá không quay lại)');
      ktra(JSON.stringify(truyVan('SELECT lmA,tkA,tkD,khi FROM chien ORDER BY id')) === chienTruocKhoiDong,
        'toàn bộ lệnh chiến tranh và mốc tuyên còn nguyên sau khi khởi động lại');
      var rowV6 = truyVan('SELECT * FROM dq WHERE tk=?', idB)[0];
      var stateV6 = JSON.parse(rowV6.state), pV5 = stateV6.planets[0], qV5 = pV5.qB[0];
      ktra(stateV6.v === 6 && stateV6.moHinhCT === 'so-luong-v1' &&
        stateV6.moHinhNhip === 'bao-tri-dan-su-v1' && stateV6.moHinhQuyDao === 'giu-quy-dao-v1' &&
        stateV6.baoTri.nextAt > stateV6.baoTri.activatedAt,
        'startup nâng tuần tự state v3 lên v6 trước khi API mở');
      ktra(pV5.b.metalMine === 8 && pV5.b.robot === 3,
        'cấp công trình v3 được quy đổi theo tổng vốn (Mỏ 4→8, Robot 2→3)');
      ktra(qV5 && qV5.n === 5 && qV5.lv === undefined && qV5.tg === 321 && qV5.xong === mocQueueV3 &&
        JSON.stringify(qV5.cost) === JSON.stringify(costQueueV3),
        'hàng đợi v3 đổi đúng phần tăng số lượng, giữ nguyên tiền và thời gian');
      ktra(pV5.danSu && pV5.danSu.population === 250000,
        'startup khởi tạo dân số v5 mà không áp mất mát hồi tố');
      ktra(JSON.stringify(pV5.res) === JSON.stringify(resV3),
        'migration không cộng/trừ lại tài nguyên hành tinh');
      ktra(rowV6.diem >= 0 && rowV6.diemCT > 0 && rowV6.diemNC >= 0 && rowV6.diemHam >= 0 && rowV6.diemThu >= 0,
        'startup tính lại toàn bộ cột điểm dẫn xuất trong SQLite');
      var khoLai = new KhoLuat(DB), tgLai = new TheGioiLuat(khoLai);
      var nangLai = tgLai.nangCapDuLieu();
      khoLai.dong();
      ktra(nangLai === 0 && JSON.parse(truyVan('SELECT state FROM dq WHERE tk=?', idB)[0].state).planets[0].b.metalMine === 8,
        'chạy migration lần hai là idempotent');
      var dn3 = await goi('/api/dangnhap', { ten: 'levu', mk: 'matkhau456' });
      var s3 = await goi('/api/state', null, dn3.token);
      ktra(!!s3.st && s3.st.planets.length >= 1, 'B đăng nhập lại và lấy được đế quốc cũ');
      ktra(s3.st.msgs.some(m => m.loai === 'tran'), 'báo cáo trận đánh vẫn còn trong hộp tin của B');
      var lmDaSua = truyVan("SELECT * FROM lm WHERE ten='[DNV] Đại Nam Vệ'")[0];
      ktra(lmDaSua && lmDaSua.chu === idA, 'mở DB cũ tự chuyển quyền khỏi cựu chủ đã rời liên minh');
      ktra(truyVan("SELECT * FROM lm WHERE ten='[CU] Liên Minh Mồ Côi'").length === 0,
        'mở DB cũ tự xoá liên minh không còn thành viên');
      var quyenCu = await goi('/api/lmduoi', { tk: idA }, dn3.token);
      ktra(quyenCu.__ma === 400, 'cựu chủ không còn gọi API quản trị sau bước sửa DB');
      var chatSauKhoiDong = await goi('/api/chat', null, dn3.token);
      ktra(chatSauKhoiDong.chung.some(m => m.noi.indexOf('toàn vũ trụ') >= 0),
        'lịch sử chat chung còn nguyên sau khi khởi động lại server');
      ktra(truyVan("SELECT * FROM chat WHERE noi='TIN_CU_HET_HAN'").length === 0,
        'nhịp dọn chat đầu tiên sau khởi động xoá dữ liệu đã quá hạn');
    }
    URL = URL0;
    sv2.kill('SIGTERM');
    await nghi(300);
    if (raSV2.indexOf('Error') >= 0 || raSV2.indexOf('lỗi') >= 0) log('log server 2: ' + raSV2.slice(-400));

    /* ---------- kết luận ---------- */
    var xau = raSV.match(/\[(api|nhip)\][^\n]*/g);
    ktra(!xau, 'server không ghi lỗi nào ra log' + (xau ? ': ' + xau[0] : ''));
  } catch (e) {
    loi++;
    console.log('  ✗ NGOẠI LỆ: ' + (e && e.stack || e));
  } finally {
    try { sv.kill('SIGKILL'); } catch (e) { }
    try { fs.unlinkSync(DB); fs.unlinkSync(DB + '-wal'); fs.unlinkSync(DB + '-shm'); } catch (e) { }
  }

  console.log('\n' + (loi ? '✗ ' + loi + ' lỗi / ' : '✓ ') + ok + ' kiểm tra đạt');
  process.exit(loi ? 1 : 0);
})();
