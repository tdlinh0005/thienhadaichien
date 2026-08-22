/* Kiểm thử máy chủ nhiều người: tài khoản, database, PvP thật giữa 2 account.
 * Chạy: node tools/test-server.js                                          */
'use strict';
var { spawn } = require('child_process');
var path = require('path'), fs = require('fs'), os = require('os');
var sqlite = require('node:sqlite');

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
    env: Object.assign({}, process.env, { PORT: String(CONG), THDC_DB: DB, THDC_NHIP: '60000' }),
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
    ktra(!r1.loi && r1.st.planets[0].qB.length === 1, 'xây Mỏ Kim Loại qua API' + (r1.loi ? ': ' + r1.loi : ''));
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

    /* ---------- 4. sản xuất chạy trên server ---------- */
    suaState(idA, function (st) {
      var p = st.planets[0];
      p.b.metalMine = 12; p.b.solar = 14; p.b.metalStore = 8;
      st.lastTick = st.now - 7200;
    });
    var s2 = await goi('/api/state', null, a.token);
    ktra(s2.st.planets[0].res.metal > 15000,
      'server tự tua sản xuất khi vắng mặt (' + Math.round(s2.st.planets[0].res.metal) + ' KL sau 2 giờ)');
    ktra(s2.st.lastTick >= s2.sv.now - 5, 'mốc thời gian của đế quốc được kéo tới hiện tại');

    /* ---------- 5. chuẩn bị PvP ---------- */
    var toaDoB = b.nha.g + ':' + b.nha.h + ':' + b.nha.p;
    suaState(idA, function (st) {
      var p = st.planets[0];
      p.b.shipyard = 8; p.b.robot = 6; p.b.lab = 8; p.b.fleetHQ = 3;
      p.res.metal = 5e6; p.res.crystal = 5e6; p.res.deut = 2e6; p.res.food = 2e6;
      p.ships = { cruiser: 120, cargoL: 40, probe: 10 };
      st.tech = { weapon: 6, shield: 6, armor: 6, spy: 6, computer: 5, combustion: 8, impulse: 6, hyperdrive: 4, energy: 6, laser: 8, ion: 4 };
      st.galana = 500000;
    });
    suaState(idB, function (st) {
      var p = st.planets[0];
      p.b.shipyard = 8; p.b.intel = 4; p.b.metalStore = 6; p.b.crystalStore = 6;
      p.res.metal = 900000; p.res.crystal = 600000; p.res.deut = 200000; p.res.food = 150000;
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
      p.b = { metalMine: 24, crystalMine: 22, deutSyn: 18, farm: 18, solar: 24,
              metalStore: 9, crystalStore: 9, deutStore: 8, silo: 8, robot: 8, shipyard: 4 };
      p.def = { missileLauncher: 25, laserS: 15 };
      p.ships = {};
      p.res = { metal: 900000, crystal: 700000, deut: 300000, food: 200000 };
    });
    await goi('/api/state', null, f.token);
    var diemF = truyVan('SELECT diem FROM dq WHERE tk=?', idF)[0].diem;
    log('nông trại: ' + diemF + ' điểm, phòng thủ mỏng');
    ktra(diemF > G_moc(), 'nông trại vượt mốc bảo vệ người chơi mới (' + diemF + ')');

    suaState(idA, function (st) {
      st.planets[0].ships = { destroyer: 40, cargoL: 60 };
      st.planets[0].res.deut = 3e6;
    });
    await goi('/api/state', null, a.token);
    var klF0 = docState(idF).planets[0].res.metal;
    var g2b = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { destroyer: 40, cargoL: 60 }, den: f.nha, mission: 'attack', cargo: {}, pct: 100 }
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
      ktra(truyVan('SELECT * FROM tran').length === 2, 'bảng tran có 2 trận PvP');
      ktra(stF.msgs.some(m => m.loai === 'tran' && m.data && m.data.ben === 'dich'), 'mục tiêu nhận được báo cáo bị đánh');
    }

    /* ---------- 7c. bên phòng thủ được báo động trước ---------- */
    suaState(idA, function (st) {
      st.planets[0].ships = { cruiser: 20, cargoL: 10 };
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
    await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { probe: 2 }, den: b.nha, mission: 'spy', cargo: {}, pct: 10 }
    }, a.token);
    var sB3 = await goi('/api/state', null, b.token);
    ktra(!sB3.st.pvpToi || !sB3.st.pvpToi.length, 'nhiệm vụ do thám đi lén, không báo trước cho đối phương');
    epToiDich(idA);
    await goi('/api/state', null, a.token);

    /* ---------- 8. bảo vệ người chơi mới ---------- */
    var c = await goi('/api/dangky', { ten: 'tanbinh', hienthi: 'Tân Binh', mk: 'matkhau789' });
    var idC = truyVan("SELECT id FROM tk WHERE ten='tanbinh'")[0].id;
    suaState(idC, function (st) {
      st.planets[0].ships = { fighterL: 5 };
      st.planets[0].res.deut = 100000;
      st.tech.combustion = 4;
    });
    var g3 = await goi('/api/lam', {
      ten: 'gui', dl: { pi: 0, ships: { fighterL: 5 }, den: a.nha, mission: 'attack', cargo: {}, pct: 100 }
    }, c.token);
    ktra(!g3.loi, 'tân binh gửi được hạm đội' + (g3.loi ? ': ' + g3.loi : ''));
    epToiDich(idC);
    await goi('/api/state', null, c.token);
    var stC = docState(idC);
    ktra(stC.msgs.some(m => m.td && m.td.indexOf('bị chặn') >= 0), 'bảo vệ người chơi mới chặn cuộc tấn công lệch trình độ');
    ktra(truyVan('SELECT * FROM tran').length === 2, 'không phát sinh trận mới từ cuộc tấn công bị chặn');

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
    ktra(lm2.ds.length === 1 && lm2.ds[0].sl === 1, 'liên minh có 1 thành viên');
    var lm3 = await goi('/api/lam', { ten: 'lmvao', dl: { ten: '[DNV] Đại Nam Vệ' } }, b.token);
    ktra(!lm3.loi, 'B gia nhập liên minh' + (lm3.loi ? ': ' + lm3.loi : ''));
    var lm4 = await goi('/api/lm', null, b.token);
    ktra(lm4.tv.length === 2, 'liên minh có 2 thành viên (' + lm4.tv.length + ')');
    var lm5 = await goi('/api/lam', { ten: 'lmvao', dl: { ten: '[XXX] Không Có Thật' } }, b.token);
    ktra(!!lm5.loi, 'không gia nhập được liên minh không tồn tại');
    var lm6 = await goi('/api/lam', { ten: 'lmra', dl: {} }, b.token);
    ktra(!lm6.loi && !lm6.st.lm, 'B rời được liên minh');

    /* ---------- 10b. tiếp tế cho người chơi khác ---------- */
    suaState(idA, function (st) {
      var p = st.planets[0];
      p.ships.cargoL = (p.ships.cargoL || 0) + 20;
      p.res.metal = 400000; p.res.deut = 1e6;
    });
    await goi('/api/state', null, a.token);

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
    suaState(idB, function (st) { st.planets[0].b.metalStore = 11; st.planets[0].res.metal = 50000; });
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
    ktra(truyVan("SELECT * FROM bangtin WHERE loai='tiepte'").length === 1, 'bảng tin ghi lại vụ tiếp tế');
    var hamTT = stA3.fleets.filter(x => x.pha === 've');
    ktra(hamTT.length >= 1, 'hạm đội tiếp tế đang trên đường về');

    /* ---------- 11. xếp hạng & bảng tin ---------- */
    var xh = await goi('/api/xephang', null, a.token);
    ktra(xh.ds.length === 4 && xh.ds[0].diem >= xh.ds[1].diem, 'bảng xếp hạng lấy từ database, sắp theo điểm (' + xh.ds.length + ' người)');
    ktra(xh.ds.some(e => e.ta), 'bảng xếp hạng đánh dấu được chính mình');
    var bt = await goi('/api/bangtin', null, a.token);
    ktra(bt.bt.length >= 3, 'bảng tin vũ trụ có tin (' + bt.bt.length + ')');

    /* ---------- 12. đổi mật khẩu & đăng xuất ---------- */
    var dm1 = await goi('/api/doimk', { cu: 'sai', moi: 'matkhaumoi1' }, a.token);
    ktra(dm1.__ma === 401, 'không đổi được mật khẩu khi nhập sai mật khẩu cũ');
    var dm2 = await goi('/api/doimk', { cu: 'matkhau123', moi: 'matkhaumoi1' }, a.token);
    ktra(!dm2.loi, 'đổi được mật khẩu');
    var dn2 = await goi('/api/dangnhap', { ten: 'quocbinh', mk: 'matkhaumoi1' });
    ktra(!!dn2.token, 'đăng nhập bằng mật khẩu mới');
    await goi('/api/dangxuat', {}, a.token);
    var sauThoat = await goi('/api/state', null, a.token);
    ktra(sauThoat.__ma === 401, 'token bị vô hiệu sau khi đăng xuất');

    /* ---------- 13. dữ liệu bền vững sau khi khởi động lại ---------- */
    sv.kill('SIGTERM');
    await nghi(700);
    var sv2 = spawn(process.execPath, [path.join(GOC, 'server', 'index.js')], {
      env: Object.assign({}, process.env, { PORT: String(CONG + 1), THDC_DB: DB, THDC_NHIP: '60000' }),
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
      ktra(tt2.soNguoi === 4, 'vẫn còn 4 tài khoản');
      var dn3 = await goi('/api/dangnhap', { ten: 'levu', mk: 'matkhau456' });
      var s3 = await goi('/api/state', null, dn3.token);
      ktra(!!s3.st && s3.st.planets.length >= 1, 'B đăng nhập lại và lấy được đế quốc cũ');
      ktra(s3.st.msgs.some(m => m.loai === 'tran'), 'báo cáo trận đánh vẫn còn trong hộp tin của B');
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
