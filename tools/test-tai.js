/* Kiểm thử tải: nhiều đế quốc cùng chạy, PvP chéo đồng thời, tua thời gian dài.
 * Chạy trực tiếp trên lõi (không qua HTTP) để đo đúng phần nặng nhất.
 *   node tools/test-tai.js [số tài khoản]                                  */
'use strict';
var path = require('path'), os = require('os'), fs = require('fs');
var Kho = require(path.join(__dirname, '..', 'server', 'db.js')).Kho;
var W = require(path.join(__dirname, '..', 'server', 'world.js'));
var TheGioi = W.TheGioi, G = W.G;

var SO_TK = Math.max(4, parseInt(process.argv[2] || '60', 10));
var DB = path.join(os.tmpdir(), 'thdc-tai-' + process.pid + '.db');
var loi = 0, ok = 0;
function ktra(dk, ten) { if (dk) ok++; else { loi++; console.log('  ✗ ' + ten); } }
function log(s) { console.log('  · ' + s); }
function ctTheoCap(ds) {
  var ra = {};
  for (var k in ds) ra[k] = G.slTuCap(G.B(k), ds[k]);
  return ra;
}

var kho = new Kho(DB);
var tg = new TheGioi(kho);
var now = Math.floor(Date.now() / 1000);

try {
  /* ---------- tạo tài khoản ---------- */
  var t0 = Date.now();
  var ids = [], nha = [];
  for (var i = 0; i < SO_TK; i++) {
    var ten = 'nc' + i;
    kho.q.tkThem.run(ten, 'Chỉ Huy ' + i, 'x', 'y', now, now);
    var tk = kho.q.tkTheoTen.get(ten).id;
    var r = tg.taoDeQuoc(tk, 'Chỉ Huy ' + i);
    ktra(!r.loi, 'tạo được đế quốc ' + i + (r.loi ? ': ' + r.loi : ''));
    ids.push(tk); nha.push(r.nha);
  }
  log('tạo ' + SO_TK + ' đế quốc mất ' + (Date.now() - t0) + 'ms');
  ktra(kho.q.htDem.get().n === SO_TK, 'mỗi đế quốc chiếm đúng 1 ô hành tinh');

  var key = {};
  var trung = 0;
  for (i = 0; i < nha.length; i++) { var k = G.tdKey(nha[i]); if (key[k]) trung++; key[k] = 1; }
  ktra(trung === 0, 'không có hai đế quốc trùng toạ độ');

  /* ---------- trang bị ---------- */
  function sua(tk, f) { var r = tg.nap(tk); f(r.st); tg.luu(tk, r.st); }
  for (i = 0; i < SO_TK; i++) {
    sua(ids[i], function (st) {
      var p = st.planets[0];
      p.b = ctTheoCap({ metalMine: 16, crystalMine: 14, deutSyn: 12, farm: 12, solar: 18, metalStore: 7,
              crystalStore: 7, deutStore: 6, silo: 6, robot: 5, shipyard: 7, lab: 6, fleetHQ: 2, maintDepot: 2 });
      p.res = { metal: 3e5, crystal: 2e5, deut: 3e5, food: 1e5 };
      p.ships = { cruiser: 30, cargoL: 10, probe: 5 };
      p.def = { missileLauncher: 20, laserS: 15, gauss: 5 };
      st.tech = { weapon: 5, shield: 5, armor: 5, spy: 4, computer: 4, combustion: 8, impulse: 5, hyperdrive: 3, energy: 5, laser: 6, ion: 3 };
      st.galana = 2e5;
    });
  }

  /* ---------- tua 24 giờ cho toàn bộ server ---------- */
  var t1 = Date.now();
  var moc = now + 24 * 3600;
  for (i = 0; i < SO_TK; i++) tg.tick(ids[i], moc);
  var msTua = Date.now() - t1;
  log('tua 24 giờ cho ' + SO_TK + ' đế quốc mất ' + msTua + 'ms (' + Math.round(msTua / SO_TK) + 'ms/đế quốc)');
  ktra(msTua < 20000, 'tua 24 giờ toàn server dưới 20 giây');
  var mau = tg.nap(ids[0]).st;
  ktra(mau.v === 6 && mau.moHinhCT === 'so-luong-v1' &&
    mau.moHinhNhip === 'bao-tri-dan-su-v1' && mau.moHinhQuyDao === 'giu-quy-dao-v1',
    'mọi state tải chạy trên contract v6 đầy đủ marker');
  ktra(mau.baoTri && mau.baoTri.cycle >= 4,
    'chu kỳ bảo trì đã chạy trong lúc tua (' + (mau.baoTri ? mau.baoTri.cycle : 0) + ')');

  /* Mỗi chỉ huy độc lập tuyên chiến với người kế tiếp từ trước. Bài tải đo
     xử lý PvP, nên không dùng việc thiếu thời gian chờ để làm nhiễu kết quả. */
  for (i = 0; i < SO_TK; i++)
    kho.q.chienThemTK.run(ids[i], ids[(i + 1) % SO_TK], now - 90000);
  ktra(kho.db.prepare('SELECT COUNT(*) n FROM chien').get().n === SO_TK,
    'đã chuẩn bị đủ lệnh chiến tranh có hiệu lực cho bài tải');

  /* ---------- PvP chéo đồng thời: ai cũng đánh người kế tiếp ---------- */
  var guiDuoc = 0, chan = 0;
  for (i = 0; i < SO_TK; i++) {
    var muc = nha[(i + 1) % SO_TK];
    var kq = tg.hanhDong(ids[i], 'gui', {
      pi: 0, ships: { cruiser: 30 }, den: muc, mission: 'attack', cargo: {}, pct: 100
    });
    if (kq.loi) chan++; else guiDuoc++;
  }
  log('gửi được ' + guiDuoc + ' hạm đội tấn công, bị chặn ' + chan);
  ktra(guiDuoc > SO_TK * 0.7, 'phần lớn hạm đội xuất kích được');

  /* ép tất cả tới đích cùng lúc để thử cơ chế chống đệ quy */
  var mocDen = moc + 60;
  for (i = 0; i < SO_TK; i++) {
    sua(ids[i], function (st) {
      st.lastTick = st.now - 5;
      st.fleets.forEach(function (f) { if (f.pha === 'di') f.den_t = st.now - 2; });
    });
  }
  var t2 = Date.now();
  for (i = 0; i < SO_TK; i++) tg.tick(ids[i], mocDen);
  var msDanh = Date.now() - t2;
  log('xử lý ' + guiDuoc + ' trận PvP đồng thời mất ' + msDanh + 'ms');

  var soTran = kho.q.tranDS.all(1000).length;
  log('bảng tran ghi được ' + soTran + ' trận');
  ktra(soTran > 0, 'có trận PvP được ghi vào database');

  /* các hạm đội bị hoãn vì đệ quy phải được xử lý ở nhịp sau */
  var conBay = 0;
  for (i = 0; i < SO_TK; i++) {
    var st2 = tg.nap(ids[i]).st;
    conBay += st2.fleets.filter(function (f) { return f.pha === 'di'; }).length;
  }
  log('còn ' + conBay + ' hạm đội bị hoãn (sẽ xử lý ở nhịp sau)');
  var vong = 0;
  while (conBay > 0 && vong++ < 12) {
    mocDen += 30;
    for (i = 0; i < SO_TK; i++) tg.tick(ids[i], mocDen);
    conBay = 0;
    for (i = 0; i < SO_TK; i++) {
      var st3 = tg.nap(ids[i]).st;
      conBay += st3.fleets.filter(function (f) { return f.pha === 'di'; }).length;
    }
  }
  ktra(conBay === 0, 'mọi hạm đội bị hoãn đều được xử lý xong (' + conBay + ' còn lại sau ' + vong + ' nhịp)');
  var soTran2 = kho.q.tranDS.all(1000).length;
  ktra(soTran2 >= guiDuoc * 0.9, 'gần như mọi cuộc tấn công đều thành trận thật (' + soTran2 + '/' + guiDuoc + ')');

  /* ---------- không mất mát dữ liệu ---------- */
  var xau = 0, am = 0;
  for (i = 0; i < SO_TK; i++) {
    var st4 = tg.nap(ids[i]);
    if (!st4 || !st4.st.planets.length) { xau++; continue; }
    var p4 = st4.st.planets[0];
    for (var rk in p4.res) if (!(p4.res[rk] >= 0) || !isFinite(p4.res[rk])) am++;
    if (!isFinite(st4.st.galana) || st4.st.galana < 0) am++;
  }
  ktra(xau === 0, 'mọi đế quốc còn nạp được (' + xau + ' hỏng)');
  ktra(am === 0, 'không có tài nguyên âm hoặc NaN (' + am + ' chỗ)');

  /* ---------- scheduler ---------- */
  var t3 = Date.now();
  var soTua = tg.nhip(SO_TK + 10);
  log('một nhịp scheduler xử lý ' + soTua + ' đế quốc trong ' + (Date.now() - t3) + 'ms');

  var cs = fs.statSync(DB).size;
  log('database ' + Math.round(cs / 1024) + ' KB cho ' + SO_TK + ' tài khoản (' + Math.round(cs / 1024 / SO_TK) + ' KB/tài khoản)');
  ktra(cs / SO_TK < 200 * 1024, 'dung lượng mỗi tài khoản dưới 200 KB');
} catch (e) {
  loi++;
  console.log('  ✗ NGOẠI LỆ: ' + (e && e.stack || e));
} finally {
  kho.dong();
  try { fs.unlinkSync(DB); fs.unlinkSync(DB + '-wal'); fs.unlinkSync(DB + '-shm'); } catch (e) { }
}

console.log('\n' + (loi ? '✗ ' + loi + ' lỗi / ' : '✓ ') + ok + ' kiểm tra đạt');
process.exit(loi ? 1 : 0);
