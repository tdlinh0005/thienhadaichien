/* Kiểm thử nhanh phần lõi (chạy: node tools/smoke.js) — không cần trình duyệt. */
var G = require('../server/rules.js').G;

var loi = 0, ok = 0;
function ktra(dk, ten) { if (dk) { ok++; } else { loi++; console.log('  ✗ ' + ten); } }
function quetNaN(o, duong) {
  duong = duong || '$';
  if (typeof o === 'number') { if (!isFinite(o)) { console.log('  ✗ NaN/Inf tại ' + duong); loi++; } return; }
  if (o && typeof o === 'object') for (var k in o) quetNaN(o[k], duong + '.' + k);
}

/* ---- 0. dispatcher migration v3 -> v4 -> v5 -> v6 ---- */
var cu = G.moiGame('Save V3', 'THDC-MIGRATE-V3');
cu.v = 3; delete cu.moHinhCT; delete cu.moHinhNhip; delete cu.moHinhQuyDao; delete cu.baoTri;
var pc = cu.planets[0];
delete pc.danSu;
pc.b = { metalMine: 4, shipyard: 2, metalStore: 3 };
pc.qB = [
  { id: 'metalMine', lv: 5, cost: G.giaXay(G.B('metalMine'), 5), tg: 91, xong: cu.now + 91 },
  { id: 'metalMine', lv: 6, cost: G.giaXay(G.B('metalMine'), 6), tg: 122, xong: null },
  { id: 'shipyard', lv: 3, cost: G.giaXay(G.B('shipyard'), 3), tg: 80, xong: null }
];
pc.qS = [{ id: 'fighterL', n: 7, tEach: 11, tLeft: 9, cost1: { metal: 3000, crystal: 1000 } }];
var costCu = JSON.stringify(pc.qB.map(function (x) { return x.cost; }));
var qSCu = JSON.stringify(pc.qS);
G.nangCapState(cu, cu.now);
ktra(cu.v === 6 && cu.moHinhCT === 'so-luong-v1' && cu.moHinhNhip === 'bao-tri-dan-su-v1' &&
  cu.moHinhQuyDao === 'giu-quy-dao-v1',
  'dispatcher nâng tuần tự v3 -> v4 -> v5 -> v6 và gắn đủ model marker');
ktra(pc.b.metalMine === G.slTuCap(G.B('metalMine'), 4) && pc.b.shipyard === 3,
  'level cũ đổi thành số lượng theo tổng vốn lũy kế');
ktra(pc.qB.every(function (x) { return x.n > 0 && x.lv === undefined; }), 'qB sau dispatcher chỉ lưu n, không còn lv');
ktra(pc.qB[0].n === G.slTuCap(G.B('metalMine'), 5) - G.slTuCap(G.B('metalMine'), 4) &&
  pc.qB[1].n === G.slTuCap(G.B('metalMine'), 6) - G.slTuCap(G.B('metalMine'), 5) && pc.qB[2].n === 4,
  'mỗi mục queue giữ đúng phần vốn gia tăng của level cũ');
ktra(
  JSON.stringify(pc.qB.map(function (x) { return x.cost; })) === costCu,
  'migration giữ nguyên cost đã thanh toán/hoàn'
);
ktra(JSON.stringify(pc.qS) === qSCu, 'dispatcher giữ nguyên hàng đợi đóng tàu');
ktra(cu.baoTri && cu.baoTri.activatedAt === cu.now &&
  cu.baoTri.nextAt === cu.baoTri.activatedAt + G.C.CHU_KY_BAO_TRI && pc.danSu,
  'dispatcher khởi tạo nhịp v5 và dân sự tại đúng snapshot');
var motLan = JSON.stringify(cu); G.nangCapState(cu);
ktra(JSON.stringify(cu) === motLan, 'migration v6 idempotent byte-for-byte');
var tuChoiTuongLai = false;
try {
  G.nangCapState({ v: G.STATE_VERSION + 1 });
} catch (errMig) {
  tuChoiTuongLai = /mới hơn engine/.test(errMig.message);
}
ktra(tuChoiTuongLai, 'migration từ chối state tương lai thay vì âm thầm hạ cấp');

/* v4 đã là số lượng: tuyệt đối không được chạy lại phép level -> quantity,
 * không xử phạt quãng offline xảy ra trước khi luật v5 được kích hoạt. */
var v4 = G.moiGame('Save V4', 'THDC-MIGRATE-V4'), p4 = v4.planets[0];
v4.v = 4; delete v4.moHinhNhip; delete v4.baoTri; delete p4.danSu;
v4.now = v4.lastTick = 1700000000;
v4.nextMaint = v4.now - 30 * 24 * 3600 + 1234;
var phaBaoTriV4 = v4.nextMaint;
v4.nextRaid = v4.now + 9e9;
v4.soChuKy = 17; v4.noBaoTri = 0;
p4.b = { metalMine: 123456789, crystalMine: 987654321, lab: 23 };
p4.qB = [{ id: 'metalMine', n: 444444444, cost: { metal: 1 }, tg: 99, xong: null }];
p4.qS = [{ id: 'fighterL', n: 555555555, tEach: 8, tLeft: 7, cost1: { metal: 3, crystal: 1 } }];
v4.ncQueue = {
  id: 'energy', lv: 2, cost: { crystal: 1600, deut: 800 }, tong: 12345, conLai: 6789,
  von: 360, vonConLai: 180, vonMoiKy: 180, treo: false, pi: 0
};
var snapV4 = JSON.stringify({ b: p4.b, qB: p4.qB, qS: p4.qS });
var mocKichHoat = v4.now + 45 * 24 * 3600 + 321;
var nextV5MongDoi = phaBaoTriV4 +
  (Math.floor((mocKichHoat - phaBaoTriV4) / G.C.CHU_KY_BAO_TRI) + 1) * G.C.CHU_KY_BAO_TRI;
G.nangCapState(v4, mocKichHoat);
ktra(JSON.stringify({ b: p4.b, qB: p4.qB, qS: p4.qS }) === snapV4,
  'v4 -> v5 giữ nguyên số lượng tỷ lệ lớn và mọi hàng đợi');
ktra(v4.baoTri.activatedAt === mocKichHoat && v4.baoTri.nextAt === nextV5MongDoi &&
  (v4.baoTri.nextAt - phaBaoTriV4) % G.C.CHU_KY_BAO_TRI === 0 &&
  v4.baoTri.cycle === 17 && v4.baoTri.missStreak === 0,
  'v4 -> v5 bỏ qua checkpoint cũ nhưng giữ đúng pha 6 giờ, không phát sinh drift');
ktra(v4.ncQueue && v4.ncQueue.planetKey === G.tdKey(p4.c) &&
  v4.ncQueue.totalCost.crystal === 1600 && v4.ncQueue.totalCost.deut === 800 &&
  v4.ncQueue.totalCost.galana === 360 && v4.ncQueue.paidCost.crystal === 1600 &&
  v4.ncQueue.paidCost.deut === 800 && v4.ncQueue.paidCost.galana === 180 &&
  v4.ncQueue.finishAt === mocKichHoat + 6789,
  'v4 -> v5 chuyển queue nghiên cứu sang planetKey và không thu lại phần đã trả');
var v4MotLan = JSON.stringify(v4); G.nangCapState(v4, mocKichHoat + 999999);
ktra(JSON.stringify(v4) === v4MotLan, 'kết quả v4 -> v5 idempotent byte-for-byte kể cả queue');
var bTruocKichHoat = JSON.stringify(p4.b), danTruocKichHoat = p4.danSu.population;
var finishTruocKichHoat = v4.ncQueue.finishAt, failTruocKichHoat = v4.ncQueue.failures;
var demandSauKichHoat = G.nhuCauTPChuKy(v4, p4) *
  (v4.baoTri.nextAt - 1 - v4.baoTri.activatedAt) / G.NHIP_V1.cycleSeconds;
G.tick(v4, v4.baoTri.nextAt - 1);
ktra(JSON.stringify(p4.b) === bTruocKichHoat && p4.danSu.population === danTruocKichHoat &&
  v4.baoTri.cycle === 17 && v4.ncQueue.failures === failTruocKichHoat &&
  v4.ncQueue.finishAt === finishTruocKichHoat,
  'trước checkpoint v5 đầu tiên không có mất dân/công trình/thất bại nghiên cứu hồi tố');
ktra(Math.abs(p4.danSu.foodDemandCycle - demandSauKichHoat) <= Math.max(1e-6, demandSauKichHoat * 1e-12),
  'kỳ dân sự đầu chỉ tích nhu cầu sau activatedAt, không gom quãng offline legacy');
var paidLegacyV5 = JSON.parse(JSON.stringify(v4.ncQueue.paidCost));
var resLegacyV5 = JSON.parse(JSON.stringify(p4.res)), galanaLegacyV5 = v4.galana;
G.huyNC(v4);
ktra(v4.ncQueue === null && ['metal', 'crystal', 'deut', 'food'].every(function (rLegacy) {
  return ganV5(p4.res[rLegacy] || 0, (resLegacyV5[rLegacy] || 0) + (paidLegacyV5[rLegacy] || 0));
}) && ganV5(v4.galana, galanaLegacyV5 + (paidLegacyV5.galana || 0)),
  'hủy queue migrated giữ chính sách legacy-full, hoàn đúng phần save cũ đã trả');

/* v5 từng biểu diễn một hạm đã đậu bằng pha `di` + dangGiu. V6 phải đổi
 * đúng hạm ấy, không hiểu nhầm đoàn còn bay/đang về và không thu nhiên liệu
 * cho thời gian trước lúc luật quỹ đạo được kích hoạt. */
var v5Giu = G.moiGame('Save Giữ V5', 'THDC-MIGRATE-HOLD-V5');
v5Giu.v = 5; delete v5Giu.moHinhQuyDao;
var p5Giu = v5Giu.planets[0];
var dich5Giu = G.htMoi(v5Giu, G.toaDo(p5Giu.c.g, p5Giu.c.h, p5Giu.c.p === 2 ? 3 : 2), 'Tiền Đồn', false);
v5Giu.planets.push(dich5Giu);
var mocV5Giu = v5Giu.now, kichHoatQD = mocV5Giu + 1000;
v5Giu.baoTri.nextAt = kichHoatQD + 1e9; v5Giu.nextRaid = kichHoatQD + 1e9;
v5Giu.fleets = [
  { id: 1, pi: 0, tu: G.clone(p5Giu.c), den: G.clone(dich5Giu.c), mission: 'hold',
    ships: { fighterL: 4 }, cargo: { deut: 1000 }, pct: 100, pha: 'di', dangGiu: true,
    diLuc: mocV5Giu - 100, den_t: kichHoatQD + 12 * 3600, giu: 24 * 3600 },
  { id: 2, pi: 0, tu: G.clone(p5Giu.c), den: G.clone(dich5Giu.c), mission: 'hold',
    ships: { cargoS: 1 }, cargo: { deut: 50 }, pct: 100, pha: 'di', dangGiu: false,
    diLuc: mocV5Giu, den_t: kichHoatQD + 1e8, giu: 6 * 3600 },
  { id: 3, pi: 0, tu: G.clone(p5Giu.c), den: G.clone(dich5Giu.c), mission: 'hold',
    ships: { probe: 1 }, cargo: {}, pct: 100, pha: 've', dangGiu: false,
    diLuc: mocV5Giu - 10, den_t: mocV5Giu - 5, veLuc: mocV5Giu, ve_t: kichHoatQD + 1e8, giu: 6 * 3600 }
];
v5Giu.fleetIdSeq = 4;
var taiSanV5Giu = JSON.stringify({ planets: v5Giu.planets, ncQueue: v5Giu.ncQueue,
  debris: v5Giu.debris, queues: v5Giu.planets.map(function (x) { return [x.qB, x.qS]; }) });
G.nangCapState(v5Giu, kichHoatQD);
var legacyGiu = v5Giu.fleets[0];
ktra(v5Giu.v === 6 && v5Giu.moHinhQuyDao === G.QUY_DAO_V1.marker &&
  legacyGiu.pha === 'giu' && legacyGiu.giuRules === G.QUY_DAO_V1.legacyRules &&
  legacyGiu.giuDen_t === kichHoatQD + 12 * 3600 &&
  legacyGiu.tiepNL_t === kichHoatQD + G.QUY_DAO_V1.segmentSeconds,
  'v5 -> v6 đổi đúng hạm đã đậu và cấp một đoạn ân hạn không hồi tố');
ktra(v5Giu.fleets[1].pha === 'di' && !v5Giu.fleets[1].dangGiu &&
  v5Giu.fleets[2].pha === 've' && !v5Giu.fleets[2].dangGiu &&
  v5Giu.fleets.slice(1).every(function (f5) { return f5.giuLuc === undefined && f5.tiepNL_t === undefined; }),
  'migration không biến đoàn hold đang bay/đang về thành lực lượng đóng quân');
ktra(JSON.stringify({ planets: v5Giu.planets, ncQueue: v5Giu.ncQueue,
  debris: v5Giu.debris, queues: v5Giu.planets.map(function (x) { return [x.qB, x.qS]; }) }) === taiSanV5Giu,
  'v5 -> v6 bảo toàn hành tinh, tài nguyên và mọi hàng đợi');
var v5GiuMotLan = JSON.stringify(v5Giu); G.nangCapState(v5Giu, kichHoatQD + 999999);
ktra(JSON.stringify(v5Giu) === v5GiuMotLan, 'v5 -> v6 idempotent byte-for-byte');
var cargoAnHan = legacyGiu.cargo.deut;
G.tick(v5Giu, legacyGiu.tiepNL_t - 1);
ktra(legacyGiu.cargo.deut === cargoAnHan && legacyGiu.pha === 'giu',
  'đoạn ân hạn legacy không thu nhiên liệu trước ranh giới đầu tiên');
var canDoanSauAnHan = G.nhienLieuGiu(v5Giu, legacyGiu.ships, G.QUY_DAO_V1.segmentSeconds);
G.tick(v5Giu, legacyGiu.tiepNL_t);
ktra(legacyGiu.cargo.deut === cargoAnHan - canDoanSauAnHan &&
  legacyGiu.giuRules === G.QUY_DAO_V1.holdRules,
  'từ ranh giới sau ân hạn, legacy trả trước đúng một đoạn như fleet v6');
var giaLo = G.giaCongTrinh(G.B('metalMine'), 37);
ktra(giaLo.metal === G.B('metalMine').cost.metal * 37 && giaLo.crystal === G.B('metalMine').cost.crystal * 37,
  'giá công trình tuyến tính theo lô');

/* neo kinh tế từ lời người chơi; công thức nội suy được ghi [TÁI DỰNG] */
var moc = G.MOC_LICH_SU.moKimLoai;
var ngayMoc = 30 * moc.soLuong * G.hsKhaiMo({ mining: moc.khaiMo }) * G.C.TOC_DO_SERVER * 24;
ktra(Math.abs(ngayMoc - moc.sanLuongNgay) / moc.sanLuongNgay < 1e-12,
  'neo 2.500 Mỏ KL + KT-KTM 28 = 17 tỷ KL/ngày');
ktra(G.hsNhaXuong({ workshop: 20 }) > 9 && G.hsNhaXuong({ workshop: 20 }) < 10,
  'neo tái dựng KT-NX 20 xấp xỉ ×10 công suất');

var stLo = G.moiGame('Lô', 'THDC-BATCH-V4'), pLo = stLo.planets[0];
pLo.res = { metal: 1e9, crystal: 1e9, deut: 1e9, food: 1e9 };
var loiLo = G.xepXay(stLo, pLo, 'metalMine', 25);
ktra(!loiLo && pLo.qB[0].n === 25 && pLo.qB[0].lv === undefined, 'xếp lô xây mới bằng n');
var xongLo = pLo.qB[0].xong; G.tick(stLo, xongLo);
ktra(pLo.b.metalMine === 25, 'hoàn thành queue cộng n vào số lượng hiện có');
ktra(G.dungTich({ b: { metalStore: 8 } }).metal - G.dungTich({ b: { metalStore: 7 } }).metal === 6000,
  'sức chứa kho tăng theo từng công trình');

var stDat = G.moiGame('Đất', 'THDC-LAND-V4'), pDat = stDat.planets[0];
pDat.oDat = 1; pDat.res = { metal: 1e9, crystal: 1e9, deut: 1e9, food: 1e9 }; stDat.tech.energy = 12;
ktra(!G.xepXay(stDat, pDat, 'metalMine', 500) && !G.xepXay(stDat, pDat, 'metalMine', 700),
  'nhiều lô cùng loại chỉ giữ một khu đất');
ktra(!!G.xepXay(stDat, pDat, 'crystalMine', 1), 'khu đất tính cả loại đang chờ, chặn loại mới khi đầy');
ktra(!G.xepXay(stDat, pDat, 'terraform', 1), 'Cải Tạo Hành Tinh vẫn xây được khi đã hết khu');

var stMoc = G.moiGame('Mốc', 'THDC-MINING-V4'), pMoc = stMoc.planets[0];
stMoc.tech.mining = moc.khaiMo; pMoc.loai = 'onhoa'; pMoc.temp = 40;
pMoc.b = { metalMine: moc.soLuong, solar: 1250 };
var sanMoc = G.sanLuong(stMoc, pMoc);
ktra(Math.abs((sanMoc.r.metal - 30 * G.C.TOC_DO_SERVER) * 24 - moc.sanLuongNgay) / moc.sanLuongNgay < 1e-12,
  'engine production đạt neo khai mỏ, không chỉ metadata');
var pXuong = G.htMoi(stMoc, G.toaDo(1, 2, 3), 'Xưởng', false); pXuong.b.shipyard = 1000;
stMoc.tech.workshop = 0; var tgNX0 = G.tgTau(stMoc, pXuong, { metal: 1e10 });
stMoc.tech.workshop = 20; var tgNX20 = G.tgTau(stMoc, pXuong, { metal: 1e10 });
ktra(tgNX0 / tgNX20 > 9, 'KT-NX tăng công suất đóng tàu thật trong engine');

var stLon = G.moiGame('O1', 'THDC-O1-V4');
stLon.planets[0].b = { metalMine: 1000000000, crystalMine: 800000000, shipyard: 700000000 };
var tDiemLon = Date.now(), diemLon = G.diem(stLon), msDiemLon = Date.now() - tDiemLon;
ktra(diemLon.ct > 0 && msDiemLon < 1000, 'tính điểm hàng tỷ công trình theo O(số loại) (' + msDiemLon + 'ms)');

/* ---- 0b. state v5: nhịp 6 giờ, dân sự và nghiên cứu trả góp ---- */
var CHU_KY_V5 = G.NHIP_V1.cycleSeconds;
function ganV5(a, b, eps) { return Math.abs(a - b) <= (eps === undefined ? 1e-7 : eps); }
function gameNhipV5(ten, seed) {
  var x = G.moiGame(ten, seed), h = x.planets[0];
  x.nextRaid = x.now + 9e9;
  x.galana = 1e12; x.techPts = 1e12;
  h.res = { metal: 1e12, crystal: 1e12, deut: 1e12, food: 1e12 };
  h.danSu.taxBp = 0;
  h.danSu.foodShortfallCycle = 0;
  return x;
}

/* Biên đúng 6 giờ và cadence phải neo vào đồng hồ đăng ký, không neo lại
 * theo thời điểm người chơi tình cờ mở game. */
var nhipNen = gameNhipV5('Nhịp', 'THDC-CADENCE-V5');
var mocNhipDau = nhipNen.baoTri.nextAt;
var nhipBien = JSON.parse(JSON.stringify(nhipNen));
G.tick(nhipBien, mocNhipDau - 1);
ktra(nhipBien.baoTri.cycle === 0, 'checkpoint chưa chạy sớm trước đúng biên 6 giờ');
G.tick(nhipBien, mocNhipDau);
ktra(nhipBien.baoTri.cycle === 1 && nhipBien.baoTri.nextAt === mocNhipDau + CHU_KY_V5,
  'checkpoint chạy đúng tại giây thứ 21.600');

var nhipMotMach = JSON.parse(JSON.stringify(nhipNen));
var nhipChiaDoan = JSON.parse(JSON.stringify(nhipNen));
var dichNhip = mocNhipDau + 2 * CHU_KY_V5 + 137;
G.tick(nhipMotMach, dichNhip);
G.tick(nhipChiaDoan, mocNhipDau + 17);
G.tick(nhipChiaDoan, mocNhipDau + CHU_KY_V5 + 83);
G.tick(nhipChiaDoan, dichNhip);
ktra(nhipMotMach.baoTri.cycle === 3 &&
  nhipMotMach.baoTri.nextAt === mocNhipDau + 3 * CHU_KY_V5,
  'tick trễ vẫn giữ pha gốc qua 3 checkpoint, không drift 137 giây');
ktra(JSON.stringify(nhipMotMach.baoTri) === JSON.stringify(nhipChiaDoan.baoTri) &&
  JSON.stringify(nhipMotMach.planets[0].danSu) === JSON.stringify(nhipChiaDoan.planets[0].danSu) &&
  ganV5(nhipMotMach.galana, nhipChiaDoan.galana, 1e-5) &&
  ['metal', 'crystal', 'deut', 'food'].every(function (rV5) {
    return ganV5(nhipMotMach.planets[0].res[rV5], nhipChiaDoan.planets[0].res[rV5], 1e-5);
  }), 'tua một mạch và chia đoạn cho kết quả nhịp/dân sự/tài nguyên tương đương');

/* Hoá đơn bảo trì là giao dịch nguyên khối: thiếu một phần cũng không được
 * âm thầm vét sạch số Galana đang có. */
var stHoaDon = gameNhipV5('Hoá đơn', 'THDC-MAINT-ATOMIC-V5'), pHoaDon = stHoaDon.planets[0];
pHoaDon.b = { metalMine: 100000 };
var phiHoaDon = G.phiBaoTriNhip(stHoaDon).phi;
stHoaDon.galana = Math.max(0, phiHoaDon - 1);
var galanaTruocHoaDon = stHoaDon.galana;
G.tick(stHoaDon, stHoaDon.baoTri.nextAt);
ktra(phiHoaDon > 0 && stHoaDon.galana === galanaTruocHoaDon &&
  stHoaDon.baoTri.arrearsGalana === phiHoaDon && stHoaDon.baoTri.missStreak === 1,
  'bảo trì thiếu tiền không trừ lẻ, ghi nguyên hoá đơn thành nợ');

/* Xếp đề tài không trừ trước và không giữ chỗ tài nguyên; engine chỉ kết toán
 * tại checkpoint. Đây cũng là gate cho thời gian tối thiểu 12 giờ. */
var stKhongTraTruoc = gameNhipV5('Không trả trước', 'THDC-RESEARCH-NO-UPFRONT-V5');
var pKhongTraTruoc = stKhongTraTruoc.planets[0];
pKhongTraTruoc.b.lab = 1;
pKhongTraTruoc.res = { metal: 0, crystal: 0, deut: 0, food: 1e9 };
stKhongTraTruoc.galana = 0; stKhongTraTruoc.techPts = 0;
var truocXepNCV5 = JSON.stringify({ res: pKhongTraTruoc.res, galana: stKhongTraTruoc.galana,
  techPts: stKhongTraTruoc.techPts });
var loiKhongTraTruoc = G.xepNC(stKhongTraTruoc, pKhongTraTruoc, 'energy');
ktra(!loiKhongTraTruoc && JSON.stringify({ res: pKhongTraTruoc.res,
  galana: stKhongTraTruoc.galana, techPts: stKhongTraTruoc.techPts }) === truocXepNCV5,
  'xếp nghiên cứu dù chưa có kỳ đầu và không trừ trước bất kỳ tài nguyên nào');
ktra(stKhongTraTruoc.ncQueue &&
  stKhongTraTruoc.ncQueue.finishAt - stKhongTraTruoc.ncQueue.startedAt >= 12 * 3600 &&
  stKhongTraTruoc.ncQueue.installmentsTotal >= 2,
  'nghiên cứu mới tối thiểu 12 giờ và chia ít nhất 2 kỳ');

/* Thiếu một thành phần của vector thì cả installment thất bại. Nạp tiền giữa
 * kỳ không tự chạy lại; lần retry chỉ diễn ra tại checkpoint kế tiếp. */
var stNCV5 = gameNhipV5('Trả góp', 'THDC-RESEARCH-ATOMIC-V5'), pNCV5 = stNCV5.planets[0];
pNCV5.b.lab = 1;
var loiNCV5 = G.xepNC(stNCV5, pNCV5, 'energy');
var qNCV5 = stNCV5.ncQueue, finishGocV5 = qNCV5 && qNCV5.finishAt;
var kyDauV5 = qNCV5 ? G.kyNghienCuu(qNCV5) : {};
pNCV5.res.deut = 0;
var crystalTruocThatBai = pNCV5.res.crystal;
var nhipNCDau = stNCV5.baoTri.nextAt;
G.tick(stNCV5, nhipNCDau);
ktra(!loiNCV5 && qNCV5 && qNCV5.failures === 1 && qNCV5.status === 'retry' &&
  qNCV5.finishAt === finishGocV5 + CHU_KY_V5 &&
  qNCV5.installmentsLeft === qNCV5.installmentsTotal,
  'thiếu installment làm đề tài thất bại đúng một lần và cộng đúng 6 giờ');
ktra(pNCV5.res.crystal === crystalTruocThatBai && Object.keys(qNCV5.paidCost).length === 0 &&
  kyDauV5.crystal > 0 && kyDauV5.deut > 0,
  'installment nhiều tài nguyên là atomic, không trừ riêng phần đang đủ');
pNCV5.res.deut = 1e12;
var paidGiuaKy = JSON.stringify(qNCV5.paidCost), conGiuaKy = qNCV5.installmentsLeft;
G.tick(stNCV5, nhipNCDau + CHU_KY_V5 - 1);
ktra(qNCV5.status === 'retry' && JSON.stringify(qNCV5.paidCost) === paidGiuaKy &&
  qNCV5.installmentsLeft === conGiuaKy,
  'bổ sung tài nguyên giữa chu kỳ không tự resume/ngầm trừ tiền');
var kyTraDuocV5 = G.kyNghienCuu(qNCV5);
G.tick(stNCV5, nhipNCDau + CHU_KY_V5);
ktra(qNCV5.status === 'active' && qNCV5.installmentsLeft === qNCV5.installmentsTotal - 1 &&
  Object.keys(kyTraDuocV5).every(function (kV5) { return qNCV5.paidCost[kV5] === kyTraDuocV5[kV5]; }),
  'checkpoint kế tiếp mới resume và ghi đủ nguyên vector installment');

/* Ở giây finishAt, checkpoint phải chạy trước hoàn thành. Nếu kỳ cuối thiếu,
 * công nghệ chưa được cấp và deadline chỉ dời đúng một nhịp. */
pNCV5.res.deut = 0;
var finishTruocThuHai = qNCV5.finishAt, failTruocThuHai = qNCV5.failures;
G.tick(stNCV5, nhipNCDau + 2 * CHU_KY_V5);
ktra((stNCV5.tech.energy || 0) === 0 && stNCV5.ncQueue === qNCV5 &&
  qNCV5.failures === failTruocThuHai + 1 && qNCV5.finishAt === finishTruocThuHai + CHU_KY_V5,
  'checkpoint cùng giây hoàn thành được xử lý trước; thiếu kỳ cuối không cấp công nghệ');
pNCV5.res.deut = 1e12;
G.tick(stNCV5, nhipNCDau + 3 * CHU_KY_V5);
ktra((stNCV5.tech.energy || 0) === 1 && stNCV5.ncQueue === null,
  'đủ kỳ cuối tại checkpoint retry thì nghiên cứu hoàn thành đúng thứ tự');

/* Đề tài v5 mới chấp nhận mất phần đã trả khi chủ động hủy; đây là chính
 * sách khác save legacy ở trên và phải được serialize rõ, không lẫn nhau. */
var stHuyNC = gameNhipV5('Hủy mới', 'THDC-RESEARCH-CANCEL-V5'), pHuyNC = stHuyNC.planets[0];
pHuyNC.b.lab = 1;
G.xepNC(stHuyNC, pHuyNC, 'energy');
G.tick(stHuyNC, stHuyNC.baoTri.nextAt);
var paidHuyNC = G.tongRes(stHuyNC.ncQueue.paidCost || {});
var resTruocHuyNC = JSON.stringify(pHuyNC.res);
G.huyNC(stHuyNC);
ktra(paidHuyNC > 0 && stHuyNC.ncQueue === null && JSON.stringify(pHuyNC.res) === resTruocHuyNC,
  'hủy đề tài v5 forfeit phần installment đã trả, không tạo tài nguyên hoàn giả');

/* Queue nghiên cứu bám tọa độ ổn định, không bám array index dễ lệch khi
 * bỏ một thuộc địa khác. Hành tinh chủ trì thì bị chặn bỏ hoang. */
var stKeyNC = gameNhipV5('Planet key', 'THDC-RESEARCH-PLANET-KEY-V5');
var pChuTri = G.htMoi(stKeyNC, G.toaDo(1, 101, 5), 'Chủ trì', false);
var pKhacNC = G.htMoi(stKeyNC, G.toaDo(1, 102, 6), 'Khác', false);
pChuTri.b.lab = 1; pChuTri.res = { metal: 1e9, crystal: 1e9, deut: 1e9, food: 1e9 };
stKeyNC.planets.push(pChuTri, pKhacNC);
G.xepNC(stKeyNC, pChuTri, 'energy');
var keyChuTri = stKeyNC.ncQueue.planetKey;
var chanBoChuTri = G.boHoang(stKeyNC, 1);
var boHanhTinhKhac = G.boHoang(stKeyNC, 2);
ktra(!!chanBoChuTri && !boHanhTinhKhac && stKeyNC.ncQueue.planetKey === keyChuTri &&
  G.timHanhTinh(stKeyNC, keyChuTri) === pChuTri,
  'planetKey chặn bỏ hành tinh chủ trì; bỏ hành tinh khác không retarget queue');

/* Ba mức suy thoái: lần 1 làm nghiên cứu thất bại; lần 2 mất dân; lần 3 mới
 * được phá hạ tầng. Dân không bao giờ xuống dưới 250.000. */
var stSuyThoai = gameNhipV5('Suy thoái', 'THDC-MISS-LEVELS-V5'), pSuyThoai = stSuyThoai.planets[0];
pSuyThoai.b = { metalMine: 1000000000, crystalMine: 900000000, solar: 800000000, lab: 1 };
pSuyThoai.qB = [{ id: 'metalMine', n: 700000000, cost: { metal: 1 }, tg: 99, xong: null }];
pSuyThoai.danSu.population = 1000000; pSuyThoai.danSu.taxBp = 0;
pSuyThoai.res = { metal: 1e15, crystal: 1e15, deut: 1e15, food: 1e15 };
stSuyThoai.galana = 0;
G.xepNC(stSuyThoai, pSuyThoai, 'energy');
var bMuc0 = JSON.stringify(pSuyThoai.b), danMuc0 = pSuyThoai.danSu.population;
var qBMuc0 = JSON.stringify(pSuyThoai.qB), nhipSuyDau = stSuyThoai.baoTri.nextAt;
G.tick(stSuyThoai, nhipSuyDau);
ktra(stSuyThoai.baoTri.missStreak === 1 && stSuyThoai.ncQueue.failures === 1 &&
  pSuyThoai.danSu.population === danMuc0 && JSON.stringify(pSuyThoai.b) === bMuc0,
  'mức thiếu bảo trì 1 chỉ đánh hỏng kỳ nghiên cứu, chưa mất dân/công trình');
G.tick(stSuyThoai, nhipSuyDau + CHU_KY_V5);
ktra(stSuyThoai.baoTri.missStreak === 2 && pSuyThoai.danSu.population < danMuc0 &&
  pSuyThoai.danSu.population >= G.NHIP_V1.populationFloor && JSON.stringify(pSuyThoai.b) === bMuc0,
  'mức thiếu bảo trì 2 làm dân bỏ đi nhưng chưa phá hạ tầng');
pSuyThoai.danSu.population = G.NHIP_V1.populationFloor;
var tMuc3 = Date.now();
G.tick(stSuyThoai, nhipSuyDau + 2 * CHU_KY_V5);
var msMuc3 = Date.now() - tMuc3;
ktra(stSuyThoai.baoTri.missStreak === 3 && G.tongSoCT(pSuyThoai) <
  1000000000 + 900000000 + 800000000 + 1,
  'mức thiếu bảo trì 3 mới làm cơ sở vật chất xuống cấp');
ktra(pSuyThoai.danSu.population === G.NHIP_V1.populationFloor,
  'dân số giữ sàn lịch sử đúng 250.000 qua suy thoái');
ktra(JSON.stringify(pSuyThoai.qB) === qBMuc0 && msMuc3 < 1000,
  'suy thoái hàng tỷ công trình chạy O(số loại) và không đụng queue (' + msMuc3 + 'ms)');

/* Primitive decay được kiểm riêng để queue tàu đang sản xuất cũng không bị
 * coi là hạ tầng hiện hữu rồi phá nhầm. */
var stDecay = gameNhipV5('Decay O(types)', 'THDC-DECAY-O1-V5'), pDecay = stDecay.planets[0];
pDecay.b = { metalMine: 1000000000, crystalMine: 900000000, solar: 800000000, shipyard: 700000000 };
pDecay.qB = [{ id: 'solar', n: 600000000, xong: null, tg: 10, cost: {} }];
pDecay.qS = [{ id: 'fighterL', n: 500000000, tEach: 5, tLeft: 4, cost1: {} }];
var queueDecay = JSON.stringify({ qB: pDecay.qB, qS: pDecay.qS });
var tongDecay0 = G.tongSoCT(pDecay), tDecay = Date.now();
var matDecay = G.suyThoaiCongTrinhNhip(pDecay, G.NHIP_V1.infrastructureDecayBp);
var msDecay = Date.now() - tDecay;
ktra(matDecay > 0 && G.tongSoCT(pDecay) === tongDecay0 - matDecay && msDecay < 1000,
  'primitive decay xử lý hàng tỷ số lượng theo O(số loại) (' + msDecay + 'ms)');
ktra(JSON.stringify({ qB: pDecay.qB, qS: pDecay.qS }) === queueDecay,
  'primitive decay không sửa số lượng/timing của cả queue xây lẫn queue tàu');

/* Thành Phố là sức chứa dân; đặc tính hành tinh chỉ đổi hướng/tốc độ tăng
 * dân và ủng hộ, cùng một input phải giữ đúng trật tự đã công bố. */
ktra(G.sucChuaDan({ b: { city: 10 } }) === G.NHIP_V1.populationFloor + 10 * G.NHIP_V1.cityHousing,
  '10 Thành Phố mở đúng 250.000 chỗ ở ngoài dân số sàn');
var stLoaiDan = gameNhipV5('Loại dân sự', 'THDC-CIVIL-PLANET-TYPE-V5');
function motNhipLoaiDan(idLoai, pSo) {
  var pLoai = G.htMoi(stLoaiDan, G.toaDo(2, 200, pSo), idLoai, false);
  pLoai.loai = idLoai; pLoai.b = { city: 10 };
  pLoai.danSu.population = G.NHIP_V1.populationFloor;
  pLoai.danSu.supportBp = G.NHIP_V1.defaultSupportBp;
  pLoai.danSu.taxBp = 0;
  pLoai.danSu.foodDemandCycle = 1000;
  pLoai.danSu.foodShortfallCycle = 0;
  G.nhipDanSu(stLoaiDan, pLoai, true, 0, []);
  return { dan: pLoai.danSu.population, ungHo: pLoai.danSu.supportBp };
}
var danOnHoa = motNhipLoaiDan('onhoa', 4), danRung = motNhipLoaiDan('runggia', 5);
var danNuoc = motNhipLoaiDan('nuoc', 6), danSaMac = motNhipLoaiDan('samac', 7);
ktra(danRung.dan > danOnHoa.dan && danNuoc.dan > danOnHoa.dan,
  'cùng Thành Phố, Rừng Già và Nước tăng dân nhanh hơn Ôn Hòa');
ktra(danRung.ungHo > danOnHoa.ungHo && danSaMac.ungHo < danOnHoa.ungHo,
  'Rừng Già nâng hướng ủng hộ, Sa Mạc hạ hướng ủng hộ so với Ôn Hòa');

/* 140% ủng hộ là số liệu đã xuất hiện trong tư liệu, không được clamp về
 * 100% khi serialize hoặc đi qua một heartbeat. */
var stUngHo = gameNhipV5('Ủng hộ', 'THDC-SUPPORT-140-V5');
stUngHo.planets[0].danSu.supportBp = 14000;
stUngHo = JSON.parse(JSON.stringify(stUngHo));
G.tick(stUngHo, stUngHo.baoTri.nextAt);
ktra(stUngHo.planets[0].danSu.supportBp > 10000 &&
  stUngHo.planets[0].danSu.supportBp <= G.NHIP_V1.maxSupportBp,
  'ủng hộ 140% sống qua JSON + heartbeat, không bị cap về 100%');

/* Thuế đổi theo phần trăm ở action và được tích luỹ liên tục, nên hai nửa
 * chu kỳ có hai mức thuế phải được prorate đúng theo số giây. */
var stThue = gameNhipV5('Thuế', 'THDC-TAX-PRORATE-V5'), pThue = stThue.planets[0];
pThue.danSu.population = 1000000; pThue.danSu.supportBp = 14000;
stThue.galana = 0;
var thueCuV5 = pThue.danSu.taxBp;
var loiThueV5 = [G.HANHDONG.doithue(stThue, { pi: 0, thue: -1 }),
  G.HANHDONG.doithue(stThue, { pi: 0, thue: 101 }),
  G.HANHDONG.doithue(stThue, { pi: 0, thue: 'khong-phai-so' })];
ktra(loiThueV5.every(function (eThue) { return !!eThue; }) && pThue.danSu.taxBp === thueCuV5,
  'action thuế từ chối phần trăm ngoài 0..100/NaN mà không mutate state');
var okThue0 = !G.HANHDONG.doithue(stThue, { pi: 0, thue: 0 }) && pThue.danSu.taxBp === 0;
var gThue0 = stThue.galana, rateThue0 = G.sanLuong(stThue, pThue).r.galana;
G.tick(stThue, stThue.now + 1000);
var okThue4 = !G.HANHDONG.doithue(stThue, { pi: 0, thue: 4 }) && pThue.danSu.taxBp === 400;
var rateThue4 = G.sanLuong(stThue, pThue).r.galana;
G.tick(stThue, stThue.now + 1000);
var okThue19 = !G.HANHDONG.doithue(stThue, { pi: 0, thue: 19 }) && pThue.danSu.taxBp === 1900;
ktra(okThue0 && okThue4 && okThue19, 'action thuế nhận 0% / 4% / 19% và lưu basis point chính xác');
ktra(ganV5(stThue.galana - gThue0, (rateThue0 + rateThue4) * 1000 / 3600, 1e-7),
  'thuế đổi giữa chu kỳ được prorate đúng theo từng đoạn thời gian');

/* ---- 0c. Giữ Chỗ v6: quyền, pha, trả trước và authority ---- */
function gameGiu(seed, gio, cargoDeut, ships) {
  var sg = G.moiGame('Giữ Quỹ Đạo', seed), pg = sg.planets[0];
  var soO = pg.c.p === G.C.SO_HANH_TINH ? pg.c.p - 1 : pg.c.p + 1;
  var dg = G.htMoi(sg, G.toaDo(pg.c.g, pg.c.h, soO), 'Trạm Đồng Minh', false);
  sg.planets.push(dg);
  ships = G.clone(ships || { fighterL: 10 });
  pg.ships = G.clone(ships);
  pg.res.deut = 1000000; sg.galana = 1000000;
  sg.baoTri.nextAt = sg.now + 1e9; sg.nextRaid = sg.now + 1e9;
  var loiG = G.guiHam(sg, 0, G.clone(ships), dg.c, 'hold', { deut: cargoDeut }, 100, gio);
  return { st: sg, p: pg, dich: dg, ships: ships, loi: loiG,
    fleet: sg.fleets[sg.fleets.length - 1] };
}

var tauGiu = { fighterL: 10 }, giu18 = 18 * 3600;
var nlGiuDau = G.nhienLieuGiu(null, tauGiu, G.QUY_DAO_V1.segmentSeconds);
var nlGiuTong = G.nhienLieuGiuTong(null, tauGiu, giu18);
ktra(nlGiuTong === 3 * nlGiuDau,
  'helper nhiên liệu giữ cộng theo đúng ba đoạn 6 giờ, làm tròn từng đoạn');

var thieuDau = gameGiu('THDC-HOLD-ATOMIC', 18, nlGiuDau - 1, tauGiu);
var taiSanThieuDau = JSON.stringify({ ships: thieuDau.p.ships, res: thieuDau.p.res,
  fleets: thieuDau.st.fleets, stats: thieuDau.st.stats });
/* gameGiu đã gọi dispatch; dựng lại snapshot chuẩn để chứng minh không mutate. */
var stTuChoi = G.moiGame('Từ Chối', 'THDC-HOLD-REJECT'), pTuChoi = stTuChoi.planets[0];
var dTuChoi = G.htMoi(stTuChoi, G.toaDo(pTuChoi.c.g, pTuChoi.c.h,
  pTuChoi.c.p === G.C.SO_HANH_TINH ? pTuChoi.c.p - 1 : pTuChoi.c.p + 1), 'Đích', false);
stTuChoi.planets.push(dTuChoi); pTuChoi.ships = G.clone(tauGiu); pTuChoi.res.deut = 1000000;
var snapTuChoi = JSON.stringify({ ships: pTuChoi.ships, res: pTuChoi.res,
  fleets: stTuChoi.fleets, stats: stTuChoi.stats });
var loiThieuDau = G.guiHam(stTuChoi, 0, G.clone(tauGiu), dTuChoi.c, 'hold',
  { deut: nlGiuDau - 1 }, 100, 18);
ktra(/^Giữ quỹ đạo cần chở ít nhất /.test(loiThieuDau || '') &&
  JSON.stringify({ ships: pTuChoi.ships, res: pTuChoi.res,
    fleets: stTuChoi.fleets, stats: stTuChoi.stats }) === snapTuChoi,
  'thiếu nhiên liệu đoạn đầu bị từ chối nguyên tử, không trừ tàu/hàng/chuyến');
void thieuDau; void taiSanThieuDau;

/* Server cắm hook quyền vào cùng core. Outsider bị chặn trước mọi phép trừ;
 * đồng minh được đi nhưng quan hệ phải được xét lại lúc đến/checkpoint. */
var hookCu = G.HOOK, choDongMinh = false;
var stDongMinh = G.moiGame('Khách', 'THDC-HOLD-ALLY'), pDongMinh = stDongMinh.planets[0];
var cDongMinh = G.toaDo(pDongMinh.c.g, pDongMinh.c.h, pDongMinh.c.p === 1 ? 2 : 1);
pDongMinh.ships = { fighterL: 10 }; pDongMinh.res.deut = 1000000;
stDongMinh.baoTri.nextAt = stDongMinh.now + 1e9; stDongMinh.nextRaid = stDongMinh.now + 1e9;
G.HOOK = {
  oNguoi: function (sg, c) {
    return G.tdKey(c) === G.tdKey(cDongMinh)
      ? { loai: 'nguoi', c: c, key: G.tdKey(c), tk: 42, ten: 'Đồng Minh' } : null;
  },
  kiemTraGui: function () { return choDongMinh ? null : 'Chỉ được đóng quân cho đồng minh.'; },
  kiemTraGiu: function () { return choDongMinh ? { tk: 42 } : 'Quan hệ liên minh không còn hợp lệ.'; }
};
var snapNgoai = JSON.stringify({ ships: pDongMinh.ships, res: pDongMinh.res,
  fleets: stDongMinh.fleets, stats: stDongMinh.stats });
var loiNgoai = G.guiHam(stDongMinh, 0, { fighterL: 10 }, cDongMinh, 'hold',
  { deut: nlGiuTong }, 100, 18);
ktra(!!loiNgoai && JSON.stringify({ ships: pDongMinh.ships, res: pDongMinh.res,
  fleets: stDongMinh.fleets, stats: stDongMinh.stats }) === snapNgoai,
  'outsider bị từ chối asset-neutral trước khi hạm đội rời bến');
choDongMinh = true;
var loiDongMinh = G.guiHam(stDongMinh, 0, { fighterL: 10 }, cDongMinh, 'hold',
  { deut: nlGiuTong }, 100, 18);
var fDongMinh = stDongMinh.fleets[0], cargoTruocDen = fDongMinh && fDongMinh.cargo.deut;
ktra(!loiDongMinh && fDongMinh && fDongMinh.pha === 'di' && cargoTruocDen === nlGiuTong,
  'đồng minh được xuất phát; dispatch chỉ kiểm tra chứ chưa thu phí quỹ đạo');
choDongMinh = false;
G.tick(stDongMinh, fDongMinh.den_t);
ktra(fDongMinh.pha === 've' && fDongMinh.cargo.deut === cargoTruocDen &&
  fDongMinh.giuLuc === undefined && fDongMinh.giuTaiTk === undefined,
  'mất tư cách đồng minh lúc tới làm hạm quay về, không thu phí hay để lại garrison');
G.HOOK = hookCu;

var mauGiu = gameGiu('THDC-HOLD-FRESH', 18, nlGiuTong, tauGiu);
ktra(!mauGiu.loi && mauGiu.fleet && mauGiu.fleet.pha === 'di' &&
  mauGiu.fleet.cargo.deut === nlGiuTong,
  'hold tại thuộc địa của mình xuất phát ở pha di và không thu phí giữ upfront');
var denLucGiu = mauGiu.fleet.den_t;
G.tick(mauGiu.st, denLucGiu);
var fDaGiu = mauGiu.fleet;
ktra(fDaGiu.pha === 'giu' && fDaGiu.giuLuc === denLucGiu &&
  fDaGiu.giuDen_t === denLucGiu + giu18 &&
  fDaGiu.tiepNL_t === denLucGiu + G.QUY_DAO_V1.segmentSeconds &&
  fDaGiu.giuRules === G.QUY_DAO_V1.holdRules && fDaGiu.cargo.deut === nlGiuTong - nlGiuDau,
  'tới đích chuyển sang pha giu và thu nguyên tử đúng đoạn đầu');

var goiSom = JSON.parse(JSON.stringify(mauGiu.st)), fGoiSom = goiSom.fleets[0];
G.tick(goiSom, denLucGiu + 1234);
var cargoTruocGoi = fGoiSom.cargo.deut;
var tgVeDayDu = G.tgBay(goiSom, fGoiSom.ships, G.khoangCach(fGoiSom.den, fGoiSom.tu), fGoiSom.pct);
var loiGoiSom = G.goiVe(goiSom, fGoiSom.id);
ktra(!loiGoiSom && fGoiSom.pha === 've' && fGoiSom.ve_t - goiSom.now === tgVeDayDu &&
  fGoiSom.cargo.deut === cargoTruocGoi && fGoiSom.giuLuc === undefined,
  'gọi fleet đang đậu về theo toàn tuyến đích→nguồn và không hoàn phí đã trả');

/* Một lần tick dài phải tương đương các tick rời có JSON restart giữa kỳ. */
var giuMotMach = JSON.parse(JSON.stringify(mauGiu.st));
var giuPhanDoan = JSON.parse(JSON.stringify(mauGiu.st));
G.tick(giuMotMach, denLucGiu + giu18);
G.tick(giuPhanDoan, denLucGiu + 6 * 3600);
giuPhanDoan = JSON.parse(JSON.stringify(giuPhanDoan));
G.tick(giuPhanDoan, denLucGiu + 12 * 3600);
G.tick(giuPhanDoan, denLucGiu + giu18);
var fMotMach = giuMotMach.fleets[0], fPhanDoan = giuPhanDoan.fleets[0];
ktra(fMotMach.pha === 've' && fMotMach.cargo.deut === undefined &&
  JSON.stringify({ pha: fMotMach.pha, cargo: fMotMach.cargo, veLuc: fMotMach.veLuc, ve_t: fMotMach.ve_t,
    fleets: giuMotMach.fleets.length, debris: giuMotMach.debris }) ===
  JSON.stringify({ pha: fPhanDoan.pha, cargo: fPhanDoan.cargo, veLuc: fPhanDoan.veLuc, ve_t: fPhanDoan.ve_t,
    fleets: giuPhanDoan.fleets.length, debris: giuPhanDoan.debris }),
  'trả trước 6 giờ không drift: tick dài = phân đoạn + restart và hết hạn về đúng mốc');

var hetDungMoc = gameGiu('THDC-HOLD-EXPIRY', 6, nlGiuDau, tauGiu);
G.tick(hetDungMoc.st, hetDungMoc.fleet.den_t);
var mocHetDung = hetDungMoc.fleet.giuDen_t, cargoHetDung = JSON.stringify(hetDungMoc.fleet.cargo);
G.tick(hetDungMoc.st, mocHetDung);
ktra(hetDungMoc.fleet.pha === 've' && JSON.stringify(hetDungMoc.fleet.cargo) === cargoHetDung &&
  hetDungMoc.fleet.ve_t - mocHetDung === G.tgBay(hetDungMoc.st, hetDungMoc.fleet.ships,
    G.khoangCach(hetDungMoc.fleet.den, hetDungMoc.fleet.tu), hetDungMoc.fleet.pct),
  'tại giây hết hạn, expiry thắng refuel và bắt đầu lượt về theo tuyến đầy đủ');

var thieuSau = gameGiu('THDC-HOLD-LATER-FAIL', 12, nlGiuDau, tauGiu);
G.tick(thieuSau.st, thieuSau.fleet.den_t);
var idThieuSau = thieuSau.fleet.id, tdThieuSau = G.tdKey(thieuSau.fleet.den);
var plTruocThieu = G.clone(thieuSau.st.debris[tdThieuSau] || { metal: 0, crystal: 0 });
var klVo = Math.round(G.S('fighterL').cost.metal * tauGiu.fighterL * G.C.PHE_LIEU);
var ttVo = Math.round(G.S('fighterL').cost.crystal * tauGiu.fighterL * G.C.PHE_LIEU);
G.tick(thieuSau.st, thieuSau.fleet.tiepNL_t);
var plSauThieu = thieuSau.st.debris[tdThieuSau] || { metal: 0, crystal: 0 };
ktra(!thieuSau.st.fleets.some(function (fg) { return fg.id === idThieuSau; }) &&
  plSauThieu.metal - (plTruocThieu.metal || 0) === klVo &&
  plSauThieu.crystal - (plTruocThieu.crystal || 0) === ttVo,
  'thiếu đoạn nhiên liệu sau xoá fleet và cộng xác tàu đúng một lần vào phế liệu quỹ đạo');

var nheGiu = gameGiu('THDC-HOLD-LIGHT-AUTH', 12,
  G.nhienLieuGiuTong(null, tauGiu, 12 * 3600), tauGiu);
G.tick(nheGiu.st, nheGiu.fleet.den_t);
var snapNheGiu = JSON.stringify({ fleet: nheGiu.fleet, debris: nheGiu.st.debris,
  stats: nheGiu.st.stats });
G.MO_PHONG_NHE = true;
G.tick(nheGiu.st, nheGiu.fleet.tiepNL_t + 1);
G.MO_PHONG_NHE = false;
ktra(JSON.stringify({ fleet: nheGiu.fleet, debris: nheGiu.st.debris,
  stats: nheGiu.st.stats }) === snapNheGiu,
  'MO_PHONG_NHE không refuel/expire/phá hạm: authority quỹ đạo chỉ thuộc server');

/* ---- 1. tạo bàn ---- */
var st = G.moiGame('Kiểm Thử', 'THDC-TEST-1');
var now = st.now;
ktra(st.planets.length === 1, 'có 1 hành tinh khởi đầu');
ktra(st.planets[0].thuDo, 'hành tinh mẹ được đánh dấu');

/* ---- 2. xây mỏ & tick 24 giờ ---- */
var p = st.planets[0];
p.res.metal = 5e6; p.res.crystal = 5e6; p.res.deut = 2e6; p.res.food = 2e6; st.galana = 2e6;
function xayDen(id, muc) {
  var dich = G.slTuCap(G.B(id), muc), ngoai = 0;
  while ((p.b[id] || 0) < dich && ngoai++ < 60) {
    var e = G.xepXay(st, p, id);
    if (e) { console.log('    (không xây được ' + id + ': ' + e + ')'); return; }
    var trong = 0;
    while (p.qB.length && trong++ < 5000) { now += 60; G.tick(st, now); }
  }
}
var keHoach = [['metalMine', 10], ['crystalMine', 9], ['deutSyn', 7], ['farm', 8], ['solar', 12],
  ['metalStore', 4], ['crystalStore', 4], ['deutStore', 3], ['silo', 3],
  ['robot', 4], ['shipyard', 6], ['lab', 6], ['fleetHQ', 1], ['maintDepot', 2], ['intel', 1], ['missileSilo', 2]];
for (var i = 0; i < keHoach.length; i++) xayDen(keHoach[i][0], keHoach[i][1]);

ktra(
  (p.b.metalMine || 0) >= G.slTuCap(G.B('metalMine'), 5),
  'mỏ kim loại xây được theo số lượng (' + p.b.metalMine + ')'
);
ktra((p.b.shipyard || 0) >= 1, 'có xưởng đóng tàu');
var s = G.sanLuong(st, p);
ktra(s.r.metal > 0, 'sản lượng kim loại dương');
console.log(
  '  · sản lượng/giờ: KL ' + Math.round(s.r.metal) + ' TA ' + Math.round(s.r.crystal) +
  ' NL ' + Math.round(s.r.deut) + ' TP ' + Math.round(s.r.food) + ' | điện ' +
  Math.round(s.dienCo) + '/' + Math.round(s.dienDung)
);

/* ---- 3. nghiên cứu (vốn trả góp theo chu kỳ) ---- */
var e2 = G.xepNC(st, p, 'energy');
ktra(!e2, 'xếp được đề tài nghiên cứu' + (e2 ? ': ' + e2 : ''));
ktra(st.ncQueue && st.ncQueue.installmentsTotal >= 2 && st.ncQueue.installmentsLeft === st.ncQueue.installmentsTotal,
  'đề tài có vector chi phí trả góp theo checkpoint');
now += 2 * G.C.CHU_KY_BAO_TRI; G.tick(st, now);
ktra((st.tech.energy || 0) >= 1, 'nghiên cứu hoàn thành (cấp ' + (st.tech.energy || 0) + ')');

/* ---- 4. chu kỳ bảo trì ---- */
var kyTruoc = st.soChuKy;
now += G.C.CHU_KY_BAO_TRI * 3 + 60; G.tick(st, now);
ktra(st.soChuKy >= kyTruoc + 3, 'chạy đủ 3 chu kỳ bảo trì (' + st.soChuKy + ')');
var btMsg = st.msgs.filter(function (m) { return m.loai === 'bt'; });
ktra(btMsg.length >= 3, 'có báo cáo bảo trì');

/* ---- 5. đóng tàu ---- */
p.res.metal += 5e6; p.res.crystal += 5e6; p.res.deut += 1e6;
function ncDen(id, muc) {
  var ngoai = 0;
  while ((st.tech[id] || 0) < muc && ngoai++ < 30) {
    var e = G.xepNC(st, p, id);
    if (e) { console.log('    (không nghiên cứu được ' + id + ': ' + e + ')'); return; }
    var trong = 0;
    while (st.ncQueue && trong++ < 5000) { now += 300; G.tick(st, now); }
  }
}
ncDen('energy', 4); ncDen('combustion', 6); ncDen('spy', 2); ncDen('shield', 2);
ncDen('impulse', 4); ncDen('armor', 2); ncDen('computer', 2); ncDen('weapon', 3);
ncDen('laser', 5); ncDen('ion', 2);
var e3 = G.xepTau(st, p, 'fighterL', 120);
ktra(!e3, 'xếp được lô phi thuyền nhẹ' + (e3 ? ': ' + e3 : ''));
ktra(!G.xepTau(st, p, 'cargoS', 20), 'xếp được tàu vận tải');
ktra(!G.xepTau(st, p, 'probe', 8), 'xếp được tàu do thám');
ktra(!G.xepTau(st, p, 'recycler', 6), 'xếp được tàu thu hồi');
ktra(!G.xepTau(st, p, 'colony', 1), 'xếp được tàu thực dân');
now += 14 * 3600; G.tick(st, now);
ktra((p.ships.fighterL || 0) === 120, 'đóng xong 120 phi thuyền nhẹ (' + (p.ships.fighterL || 0) + ')');
ktra((p.ships.probe || 0) === 8, 'đóng xong tàu do thám');

/* ---- 6. phòng thủ 2 lớp ---- */
ktra(!G.xepTau(st, p, 'missileLauncher', 30), 'xếp được phòng thủ mặt đất');
ktra(!G.xepTau(st, p, 'satellite', 5), 'xếp được phòng thủ quỹ đạo');
now += 6 * 3600; G.tick(st, now);
ktra((p.def.missileLauncher || 0) === 30 && (p.def.satellite || 0) === 5, 'xây được cả 2 lớp phòng thủ');

/* ---- 7. tìm NPC & do thám ---- */
var muc = null;
for (var hh = p.c.h; hh < p.c.h + 12 && !muc; hh++) {
  var he = G.xemHe(st, p.c.g, hh);
  for (var j = 0; j < he.length; j++) if (he[j].loai === 'npc' && he[j].npc.diem < 4000) { muc = he[j]; break; }
}
ktra(!!muc, 'tìm được mục tiêu NPC');
if (muc) {
  var e4 = G.guiHam(st, 0, { probe: 4 }, muc.c, 'spy', {}, 100);
  ktra(!e4, 'gửi được hạm đội do thám' + (e4 ? ': ' + e4 : ''));
  now += 4 * 3600; G.tick(st, now);
  ktra(!!(st.spy && st.spy[muc.key]), 'nhận được báo cáo do thám');

  /* ---- 8. tấn công ---- */
  var truocKL = p.res.metal;
  var e5 = G.guiHam(st, 0, { fighterL: 120, cargoS: 20 }, muc.c, 'attack', {}, 100);
  ktra(!e5, 'gửi được hạm đội tấn công' + (e5 ? ': ' + e5 : ''));
  var fl = st.fleets[st.fleets.length - 1];
  ktra(!!fl, 'hạm đội có trong danh sách');

  /* ---- 9. đổi mục tiêu giữa đường ---- */
  now += Math.max(1, Math.floor((fl.den_t - fl.diLuc) / 2)); G.tick(st, now);
  var conBay = st.fleets.indexOf(fl) >= 0;
  if (conBay && fl.pha === 'di') {
    var truocT = fl.den_t;
    var e6 = G.doiMucTieu(st, fl.id, G.toaDo(muc.c.g, muc.c.h, muc.c.p === 15 ? 14 : muc.c.p + 1));
    ktra(!e6, 'đổi được mục tiêu giữa đường' + (e6 ? ': ' + e6 : ''));
    ktra(fl.doiHuong === 1 && fl.den_t !== truocT, 'thời gian bay được tính lại');
  }
  now += 12 * 3600; G.tick(st, now);
  var tran = st.msgs.filter(function (m) { return m.loai === 'tran'; });
  ktra(tran.length >= 1, 'có báo cáo chiến đấu (' + tran.length + ')');
  if (tran.length) {
    var kq = tran[0].data.kq;
    ktra(kq.vongDanh.length >= 1, 'trận đánh có ít nhất 1 vòng');
    ktra(kq.vongDanh.every(function (v) { return !v.matDat || v.vong >= G.VONG_XUONG_DAT; }),
      'phòng thủ mặt đất không tham chiến trước vòng ' + G.VONG_XUONG_DAT);
    console.log('  · kết quả trận: ' + kq.kq + ', phế liệu ' + G.so(kq.pheLieu.metal) + ' KL');
  }
}

/* Bản gốc cho phép quay lại đánh tiếp ngay cả khi hạm đội đang trên đường về. */
if ((p.ships.probe || 0) >= 1 && muc) {
  var eVe0 = G.guiHam(st, 0, { probe: 1 }, muc.c, 'spy', {}, 100);
  var hamVeDoi = st.fleets[st.fleets.length - 1];
  ktra(!eVe0 && !!hamVeDoi, 'gửi hạm đội mẫu để thử đổi hướng lúc quay về');
  now += Math.max(1, Math.floor((hamVeDoi.den_t - hamVeDoi.diLuc) / 3)); G.tick(st, now);
  var eVe1 = G.goiVe(st, hamVeDoi.id);
  ktra(!eVe1 && hamVeDoi.pha === 've' && hamVeDoi.veLuc === st.now,
    'gọi hạm đội về có ghi mốc bắt đầu chặng về');
  delete hamVeDoi.veLuc;                 // mô phỏng save cũ trước khi có trường này
  var dichMoiVe = G.toaDo(muc.c.g, muc.c.h, muc.c.p === 1 ? 2 : muc.c.p - 1);
  var eVe2 = G.doiMucTieu(st, hamVeDoi.id, dichMoiVe);
  ktra(!eVe2 && hamVeDoi.pha === 'di' && G.bang(hamVeDoi.den, dichMoiVe) && hamVeDoi.doiHuong >= 1,
    'đổi được mục tiêu trên đường về, kể cả hạm đội từ save cũ');
  G.goiVe(st, hamVeDoi.id); now += 60; G.tick(st, now);
}

/* ---- 10. thực dân hoá ---- */
var oTrong = null;
for (var h3 = p.c.h; h3 < p.c.h + 8 && !oTrong; h3++) {
  var he3 = G.xemHe(st, p.c.g, h3);
  for (var k3 = 0; k3 < he3.length; k3++) if (he3[k3].loai === 'trong') { oTrong = he3[k3]; break; }
}
if (oTrong && (p.ships.colony || 0) > 0) {
  var e7 = G.guiHam(st, 0, { colony: 1 }, oTrong.c, 'colonize', {}, 100);
  ktra(!e7, 'gửi được tàu thực dân' + (e7 ? ': ' + e7 : ''));
  now += 12 * 3600; G.tick(st, now);
  ktra(st.planets.length === 2, 'có thuộc địa mới (' + st.planets.length + ' hành tinh)');
}

/* ---- 10b. cướp được tài nguyên từ hành tinh bỏ hoang ---- */
var bo = null;
for (var h4 = p.c.h; h4 < p.c.h + 40 && !bo; h4++) {
  var he4 = G.xemHe(st, p.c.g, h4);
  for (var k4 = 0; k4 < he4.length; k4++) if (he4[k4].loai === 'npc' && he4[k4].npc.bo) { bo = he4[k4]; break; }
}
ktra(!!bo, 'tìm được hành tinh bỏ hoang');
if (bo) {
  p.res.metal += 4e7; p.res.crystal += 4e7; p.res.deut += 1e7;
  ktra(!G.xepTau(st, p, 'cruiser', 60), 'xếp được tuần dương hạm');
  ktra(!G.xepTau(st, p, 'cargoL', 40), 'xếp được tàu vận tải lớn');
  now += 24 * 3600; G.tick(st, now);
  var soTin = st.msgs.length;
  var e8 = G.guiHam(st, 0, { cruiser: 60, cargoL: 40 }, bo.c, 'attack', {}, 100);
  ktra(!e8, 'gửi hạm đội đánh hành tinh bỏ hoang' + (e8 ? ': ' + e8 : ''));
  now += 24 * 3600; G.tick(st, now);
  var bcs = st.msgs.filter(function (m) { return m.loai === 'tran' && m.data && m.data.ben === 'ta'; });
  var cuopDuoc = bcs.length && G.tongRes(bcs[0].data.cuop) > 0;
  ktra(cuopDuoc, 'thắng và cướp được tài nguyên (' + (bcs.length ? G.so(G.tongRes(bcs[0].data.cuop)) : 0) + ')');
}

/* ---- 10c. NPC tấn công ngược lại người chơi ---- */
/* vượt mốc bảo vệ người chơi mới để NPC được phép đánh */
p.def.plasma = (p.def.plasma || 0) + 80;
ktra(
  G.diem(st).tong > G.C.BAO_VE_MOI_DIEM,
  'đã vượt mốc bảo vệ người chơi mới (' + Math.round(G.diem(st).tong) + ' điểm)'
);
var thu = 0;
while (st.toi.length === 0 && thu++ < 8) { st.nextRaid = st.now + 5; now += 10; G.tick(st, now); }
ktra(st.toi.length >= 1, 'NPC phát động đợt tấn công (sau ' + thu + ' lần hẹn)');
var raidCanXuLy = st.toi.map(function (w) { return { id: w.id, den: w.den_t }; });
var denRaid = st.now;
for (var rdx = 0; rdx < raidCanXuLy.length; rdx++) {
  denRaid = Math.max(denRaid, raidCanXuLy[rdx].den);
}
now = Math.max(now + 1, denRaid + 1); G.tick(st, now);
ktra(raidCanXuLy.every(function (r0) {
  return !st.toi.some(function (w0) { return w0.id === r0.id; });
}), 'đợt tấn công của NPC đã được xử lý');
ktra(
  st.msgs.some(function (m) { return m.loai === 'tran' && m.data && m.data.ben === 'dich'; }),
  'có báo cáo trận phòng thủ'
);

/* ---- 10d. tên lửa liên hành tinh ---- */
ncDen('impulse', 5);
xayDen('missileSilo', 5);
p.res.metal += 5e6; p.res.crystal += 2e6; p.res.deut += 3e6;
ktra(!G.xepTau(st, p, 'icbm', 12), 'đóng được Tên Lửa Liên Hành Tinh');
ktra(!G.xepTau(st, p, 'interceptor', 6), 'đóng được Tên Lửa Đánh Chặn');
now += 6 * 3600; G.tick(st, now);
ktra((p.mis.icbm || 0) === 12, 'có 12 tên lửa trong hầm (' + (p.mis.icbm || 0) + ')');
ktra(G.tamTenLua(st) === (st.tech.impulse * 5 - 1), 'tầm bắn = (Động Cơ Xung × 5) − 1 = ' + G.tamTenLua(st) + ' hệ');

/* ngoài tầm và khác thiên hà thì phải bị chặn */
var xa = G.toaDo(p.c.g, Math.min(G.C.SO_HE, p.c.h + G.tamTenLua(st) + 5), 4);
ktra(!!G.banTenLua(st, 0, xa, 1), 'chặn bắn ra ngoài tầm');
ktra(!!G.banTenLua(st, 0, G.toaDo(p.c.g === 9 ? 8 : p.c.g + 1, p.c.h, 4), 1), 'chặn bắn sang thiên hà khác');
ktra(!!G.banTenLua(st, 0, p.c, 1), 'chặn tự bắn vào mình');
ktra(!!G.banTenLua(st, 0, G.toaDo(p.c.g, p.c.h, (p.c.p % 15) + 1), 999), 'chặn bắn nhiều hơn số tên lửa đang có');

/* bắn vào một NPC trong tầm */
var mucTL = null;
for (var hT = Math.max(1, p.c.h - G.tamTenLua(st)); hT <= p.c.h + G.tamTenLua(st) && !mucTL; hT++) {
  if (hT < 1 || hT > G.C.SO_HE) continue;
  var heT = G.xemHe(st, p.c.g, hT);
  for (var kT = 0; kT < heT.length; kT++) {
    var oT = heT[kT];
    if (oT.loai === 'npc' && !oT.npc.bo) {
      var coDat = false;
      for (var dk in oT.npc.def) { var dd = G.D(dk); if (dd && dd.lop === 'dat' && oT.npc.def[dk] > 0) coDat = true; }
      if (coDat) { mucTL = oT; break; }
    }
  }
}
ktra(!!mucTL, 'tìm được mục tiêu có phòng thủ mặt đất trong tầm tên lửa');
if (mucTL) {
  var thuTruoc = 0, dk2;
  for (dk2 in mucTL.npc.def) { var d2 = G.D(dk2); if (d2 && d2.lop === 'dat') thuTruoc += mucTL.npc.def[dk2]; }
  var quyDaoTruoc = (mucTL.npc.def.satellite || 0) + (mucTL.npc.def.orbitalStation || 0);
  var eTL = G.banTenLua(st, 0, mucTL.c, 10);
  ktra(!eTL, 'phóng được tên lửa' + (eTL ? ': ' + eTL : ''));
  ktra(st.tenLua.length === 1 && (p.mis.icbm || 0) === 2, 'tên lửa rời hầm và đang bay');
  now += 3600; G.tick(st, now);
  ktra(st.tenLua.length === 0, 'tên lửa đã nổ');
  var bcTL = st.msgs.find(function (m) { return m.data && m.data.tl; });
  ktra(!!bcTL, 'có báo cáo kết quả bắn tên lửa');
  if (bcTL) {
    var thuSau = 0, dk3;
    for (dk3 in mucTL.npc.def) { var d3 = G.D(dk3); if (d3 && d3.lop === 'dat') thuSau += mucTL.npc.def[dk3]; }
    var quyDaoSau = (mucTL.npc.def.satellite || 0) + (mucTL.npc.def.orbitalStation || 0);
    console.log('  · tên lửa: bắn 10, bị chặn ' + bcTL.data.tl.chan + ', phá ' + G.moTaPha(bcTL.data.tl.pha));
    ktra(thuSau < thuTruoc || bcTL.data.tl.chan === 10, 'phòng thủ mặt đất của mục tiêu bị phá thật');
    ktra(quyDaoSau === quyDaoTruoc, 'lớp quỹ đạo KHÔNG bị tên lửa đụng tới');
  }
}

/* ---- 10e. bỏ hoang thuộc địa ---- */
if (st.planets.length >= 2) {
  var soTruoc = st.planets.length;
  var htBo = st.planets[1];
  /* Cô lập ca kiểm thử bỏ hoang khỏi raid ngẫu nhiên sinh ra ở ca trước. */
  st.nextRaid = st.now + 9e9;
  st.toi = st.toi.filter(function (wBo) { return wBo.pi !== 1; });
  ktra(!!G.boHoang(st, 0), 'không bỏ được hành tinh mẹ');
  ktra(!!G.HANHDONG.boHoang(st, { pi: 1 }), 'phải xác nhận mới bỏ hoang được');
  /* còn hạm đội xuất phát từ đó thì không bỏ được */
  st.planets[1].ships = { cargoS: 1 }; st.planets[1].res.deut = 10000;
  var eB = G.guiHam(st, 1, { cargoS: 1 }, st.planets[0].c, 'transport', {}, 100);
  if (!eB) {
    ktra(!!G.boHoang(st, 1), 'không bỏ được khi còn hạm đội của hành tinh đó đang bay');
    now += 24 * 3600; G.tick(st, now);
  }
  /* gửi một hạm đội của hành tinh MẸ đi để kiểm tra việc dời chỉ số */
  st.planets[0].ships.probe = (st.planets[0].ships.probe || 0) + 2;
  st.planets[0].res.deut += 50000;
  var xaBo = G.toaDo(st.planets[0].c.g, Math.min(G.C.SO_HE, st.planets[0].c.h + 3), 5);
  G.guiHam(st, 0, { probe: 2 }, xaBo, 'spy', {}, 10);
  var eBo = G.HANHDONG.boHoang(st, { pi: 1, xacnhan: 'BO' });
  ktra(!eBo, 'bỏ hoang được thuộc địa' + (eBo ? ': ' + eBo : ''));
  ktra(st.planets.length === soTruoc - 1, 'danh sách hành tinh giảm đúng 1');
  ktra(!st.planets.some(function (x) { return G.tdKey(x.c) === G.tdKey(htBo.c); }), 'hành tinh đã biến khỏi đế quốc');
  ktra(
    st.fleets.every(function (f) { return f.pi >= 0 && f.pi < st.planets.length; }),
    'chỉ số hành tinh của hạm đội vẫn hợp lệ'
  );
  now += 12 * 3600; G.tick(st, now);
  ktra(st.fleets.length === 0, 'hạm đội cũ vẫn về được sau khi bỏ hoang (không kẹt)');
  var oCu = G.oHanhTinh(st, htBo.c);
  ktra(oCu.loai !== 'toi', 'ô toạ độ cũ không còn là của ta');
}

/* ---- 10f. thám hiểm vùng không gian sâu ---- */
var oSau = G.toaDo(p.c.g, p.c.h, G.C.O_THAM_HIEM);
ktra(G.oHanhTinh(st, oSau).loai === 'sau', 'ô 16 là vùng không gian sâu');
ktra(G.xemHe(st, p.c.g, p.c.h).length === G.C.SO_HANH_TINH + 1, 'màn thiên hà có thêm ô thám hiểm');
ktra(!!G.guiHam(st, 0, { cargoS: 1 }, oSau, 'attack', {}, 100), 'không đánh được vào vùng không gian sâu');
ktra(!!G.guiHam(st, 0, { cargoS: 1 }, G.toaDo(p.c.g, p.c.h, 5), 'thamhiem', {}, 100), 'thám hiểm phải nhắm đúng ô 16');

var ketQua = {};
var soLan = 0, matHet = 0;
for (var tH = 0; tH < 30; tH++) {
  p.ships.cargoL = (p.ships.cargoL || 0) + 6;
  p.ships.cruiser = (p.ships.cruiser || 0) + 8;
  p.res.deut += 200000;
  var eTh = G.guiHam(st, 0, { cargoL: 6, cruiser: 8 }, oSau, 'thamhiem', {}, 100);
  if (eTh) { if (tH === 0) console.log('    (không gửi được: ' + eTh + ')'); break; }
  soLan++;
  now += 8 * 3600; G.tick(st, now);
}
ktra(soLan >= 20, 'điều được nhiều đoàn thám hiểm (' + soLan + ')');
var nk = st.msgs.filter(function (m) { return m.td && m.td.indexOf('Nhật ký thám hiểm') === 0; });
ktra(nk.length >= soLan * 0.6, 'mỗi chuyến đều có nhật ký (' + nk.length + '/' + soLan + ')');
ktra((st.stats.thamHiem || 0) >= soLan * 0.6, 'thống kê đếm được số chuyến thám hiểm');
var loaiKQ = {};
nk.forEach(function (m) {
  var s2 = m.nd || '';
  var k2 = /đám mây vật chất/.test(s2) ? 'tài nguyên' : /hạm đội bỏ hoang/.test(s2) ? 'tàu trôi dạt'
    : /Galana/.test(s2) ? 'Galana' : /sinh vật/.test(s2) ? 'chạm trán' : /lạc ra ngoài/.test(s2) ? 'lạc đường'
    : /thiên thạch/.test(s2) ? 'thiên thạch' : 'không thấy gì';
  loaiKQ[k2] = (loaiKQ[k2] || 0) + 1;
});
console.log('  · kết quả ' + nk.length + ' chuyến thám hiểm: ' + JSON.stringify(loaiKQ));
ktra(Object.keys(loaiKQ).length >= 3, 'thám hiểm cho nhiều loại kết quả khác nhau');
ktra(
  st.fleets.filter(function (f) { return f.mission === 'thamhiem'; }).length === 0,
  'không còn đoàn nào kẹt ngoài đó'
);
void matHet; void ketQua;

/* ---- 10g. 5 loại hành tinh (tư liệu gốc) ---- */
ktra(G.LOAI_HT.length === 5, 'có đủ 5 loại hành tinh');
ktra(st.planets[0].loai === 'onhoa', 'hành tinh mẹ luôn là Ôn Hoà');
var sanLuongTheoLoai = {};
G.LOAI_HT.forEach(function (L) {
  var pt = G.htMoi(st, G.toaDo(1, 60, 8), 'x', false);
  pt.loai = L.id; pt.temp = Math.round((L.temp[0] + L.temp[1]) / 2);
  pt.b = {
    metalMine: G.slTuCap(G.B('metalMine'), 15), crystalMine: G.slTuCap(G.B('crystalMine'), 14),
    deutSyn: G.slTuCap(G.B('deutSyn'), 12), farm: G.slTuCap(G.B('farm'), 12),
    solar: G.slTuCap(G.B('solar'), 16)
  };
  sanLuongTheoLoai[L.id] = G.sanLuong(st, pt).r;
});
ktra(sanLuongTheoLoai.samac.metal > sanLuongTheoLoai.onhoa.metal * 1.3,
  'Sa Mạc giàu Kim Loại hơn hẳn ("tài nguyên phong phú và dễ khai thác")');
ktra(sanLuongTheoLoai.samac.food < sanLuongTheoLoai.onhoa.food * 0.8,
  'Sa Mạc nghèo Thực Phẩm ("nghèo nàn về sự sống")');
ktra(G.LHT('samac').tt < G.LHT('onhoa').tt && G.LHT('samac').dt < G.LHT('onhoa').dt,
  'Sa Mạc khó khai thác Thạch Anh và Nhiên Liệu');
ktra(G.LHT('banghai').tt > G.LHT('onhoa').tt * 1.3 && G.LHT('banghai').dt <= G.LHT('onhoa').dt,
  'Băng Hà giàu Thạch Anh, không bị gán nhầm bonus Nhiên Liệu');
ktra(sanLuongTheoLoai.runggia.food > sanLuongTheoLoai.onhoa.food * 1.2,
  'Rừng Già nhiều Thực Phẩm nhất');
ktra(G.LHT('runggia').oDat > G.LHT('onhoa').oDat, 'Rừng Già có đất rộng theo mô tả gốc');
ktra(sanLuongTheoLoai.nuoc.deut > sanLuongTheoLoai.onhoa.deut * 1.3,
  'Nước – Đầm Lầy nhiều nhiên liệu ("có rất nhiều nhiên liệu")');
ktra(G.LHT('nuoc').oDat < 0.85, 'Nước – Đầm Lầy ít ô đất ("không dễ dàng kiến thiết")');
ktra(G.LHT('banghai').thuDat > G.LHT('onhoa').thuDat && G.LHT('nuoc').thuDat > 1,
  'Băng Hà và Nước phòng thủ mặt đất mạnh hơn');
/* hệ số phòng thủ mặt đất có tác dụng thật trong trận đánh */
var thuMau = { gauss: 80, plasma: 25 };
var kqOn = G.danhTran({ ten: 'A', tech: { weapon: 8 }, ships: { destroyer: 250 } },
  { ten: 'D', tech: {}, ships: {}, def: G.clone(thuMau), thuDat: 1 }, 4242);
var kqBang = G.danhTran({ ten: 'A', tech: { weapon: 8 }, ships: { destroyer: 250 } },
  { ten: 'D', tech: {}, ships: {}, def: G.clone(thuMau), thuDat: G.LHT('banghai').thuDat }, 4242);
var phaOn = 0, phaBang = 0, kk1;
for (kk1 in kqOn.matDPha) phaOn += kqOn.matDPha[kk1];
for (kk1 in kqBang.matDPha) phaBang += kqBang.matDPha[kk1];
ktra(phaBang < phaOn, 'đánh xuống Băng Hà phá được ít công sự hơn Ôn Hoà (' + phaBang + ' < ' + phaOn + ')');

/* lớp mặt đất tuyệt đối không được bắn xuyên qua một lớp quỹ đạo còn sống */
var kqChanTang = G.danhTran(
  { ten: 'A', tech: { weapon: 1, shield: 20, armor: 20 }, ships: { battleship: 1 } },
  { ten: 'D', tech: {}, ships: {}, def: { shieldL: 1, missileLauncher: 20 }, thuDat: 1 }, 701);
ktra(kqChanTang.vongDanh.length === G.C.VONG_DANH && !kqChanTang.vongDanh.some(function (v) { return v.matDat; }),
  'quỹ đạo còn sống suốt trận thì mặt đất không tham chiến');
ktra(!kqChanTang.matDPha.missileLauncher,
  'công sự mặt đất nguyên vẹn khi lớp quỹ đạo chưa bị triệt phá');

/* Hạm hành tinh và hạm đồng minh là hai nhóm sở hữu độc lập. Cùng loại tàu
 * nhưng công nghệ khác phải chịu thiệt hại khác, rồi ghi về đúng chỉ số nhóm;
 * chừng nào một nhóm quỹ đạo còn sống thì pháo đất vẫn không được bắn/ăn đạn. */
var kqNhomGiu = G.danhTran(
  { ten: 'A', tech: { weapon: 4 }, ships: { cruiser: 3 } },
  { ten: 'D', tech: {}, nhomTau: [
    { ships: { fighterL: 8 }, tech: { armor: 0, shield: 0 } },
    { ships: { fighterL: 8 }, tech: { armor: 15, shield: 15 } }
  ], def: { missileLauncher: 2 }, thuDat: 1 }, 703);
ktra(kqNhomGiu.conNhomD.length === 2 && kqNhomGiu.matNhomD.length === 2 &&
  (kqNhomGiu.matNhomD[1].fighterL || 0) < (kqNhomGiu.matNhomD[0].fighterL || 0) &&
  (kqNhomGiu.conShipsD.fighterL || 0) ===
    (kqNhomGiu.conNhomD[0].fighterL || 0) + (kqNhomGiu.conNhomD[1].fighterL || 0),
  'combat dùng tech từng chủ và trả survivor/loss về đúng nhóm, không nhập hạm đồng minh vào hành tinh');
ktra(!kqNhomGiu.vongDanh.some(function (v) { return v.matDat; }) &&
  !kqNhomGiu.matDPha.missileLauncher,
  'một nhóm đóng quân còn sống vẫn giữ ranh giới quỹ đạo–mặt đất');
var kqVoQuyDao = G.danhTran(
  { ten: 'A', tech: { weapon: 10 }, ships: { destroyer: 80 } },
  { ten: 'D', tech: {}, ships: {}, def: { satellite: 1, missileLauncher: 20 }, thuDat: 1 }, 702);
var vongDatDau = kqVoQuyDao.vongDanh.find(function (v) { return v.matDat; });
ktra(!!vongDatDau && vongDatDau.vong >= G.VONG_XUONG_DAT,
  'chỉ hạ xuống mặt đất sau khi quỹ đạo vỡ và tới vòng ' + G.VONG_XUONG_DAT);

/* ---- 10h. quân đổ bộ Robot/Tank ---- */
p.res.metal += 8e7; p.res.crystal += 4e7; p.res.deut += 2e7;
xayDen('robot', 8); xayDen('shipyard', 9);
xayDen('lab', 8);
ncDen('armor', 3); ncDen('energy', 8); ncDen('shield', 5); ncDen('laser', 10);
ncDen('ion', 5); ncDen('hyperspace', 3); ncDen('hyperdrive', 6); ncDen('plasma', 5);
p.res.metal += 8e7; p.res.crystal += 6e7; p.res.deut += 3e7;
ktra(!G.xepTau(st, p, 'robot', 120000), 'đóng được Robot');
var eTk = G.xepTau(st, p, 'tank', 15000); ktra(!eTk, 'đóng được Tank' + (eTk ? ': ' + eTk : ''));
var eDc = G.xepTau(st, p, 'destroyer', 200); ktra(!eDc, 'đóng được Đại Chiến Hạm' + (eDc ? ': ' + eDc : ''));
var tDB = Date.now();
now += 600 * 3600; G.tick(st, now);
ktra(Date.now() - tDB < 5000, 'đóng hàng trăm nghìn quân không làm treo engine (' + (Date.now() - tDB) + 'ms)');
ktra((p.linh.robot || 0) === 120000, 'có 120.000 Robot (' + (p.linh.robot || 0) + ')');
ktra((p.linh.tank || 0) === 15000, 'có 15.000 Tank');
ktra(G.sucChoLinh({ destroyer: 200 }) === 200 * G.S('destroyer').choLinh, 'Đại Chiến Hạm chở được quân');
ktra(
  !!G.guiHam(
    st, 0, { cruiser: 1 }, G.toaDo(p.c.g, p.c.h, (p.c.p % 15) + 1),
    'attack', {}, 100, 1, { robot: 100000 }
  ),
  'chặn khi hạm đội không đủ chỗ chở quân');
ktra(!!G.guiHam(st, 0, { destroyer: 50 }, G.toaDo(p.c.g, p.c.h, (p.c.p % 15) + 1), 'spy', {}, 100, 1, { robot: 100 }),
  'chỉ Tấn Công / Triển Khai / Vận Chuyển mới chở được quân');

/* đánh một NPC có phòng thủ mặt đất, mang theo quân đổ bộ */
st.nextRaid = st.now + 9e6;
var mucDB = null;
for (var hD = p.c.h; hD < p.c.h + 60 && !mucDB; hD++) {
  var heD = G.xemHe(st, p.c.g, hD);
  for (var kD = 0; kD < heD.length; kD++) {
    var oD = heD[kD];
    if (oD.loai === 'npc' && !oD.npc.bo && oD.npc.diem > 2000 && oD.npc.diem < 15000) { mucDB = oD; break; }
  }
}
ktra(!!mucDB, 'tìm được mục tiêu để đổ bộ');
if (mucDB) {
  var thuDatTruoc = 0, kD2;
  for (kD2 in mucDB.npc.def) { var dD = G.D(kD2); if (dD && dD.lop === 'dat') thuDatTruoc += mucDB.npc.def[kD2]; }
  var doiHT = { destroyer: Math.min(200, p.ships.destroyer || 0) };
  ['cruiser', 'battleship', 'fighterH', 'cargoL'].forEach(function (x) {
    if (p.ships[x]) doiHT[x] = p.ships[x];
  });
  var eDB = G.guiHam(st, 0, doiHT, mucDB.c, 'attack', {}, 100, 1, { robot: 120000, tank: 15000 });
  ktra(!eDB, 'gửi được hạm đội kèm quân đổ bộ' + (eDB ? ': ' + eDB : ''));
  ktra(G.trong(p.linh), 'quân đã rời hành tinh, không còn ở nhà');
  now += 30 * 3600; G.tick(st, now);
  var bcDB = st.msgs.filter(function (m) { return m.data && m.data.kq && m.data.ben === 'ta'; })[0];
  ktra(!!bcDB, 'có báo cáo trận đánh');
  if (bcDB && bcDB.data.kq.kq === 'thang') {
    ktra(!!bcDB.data.doBo, 'báo cáo có pha đổ bộ');
    if (bcDB.data.doBo) {
      var thuDatSau = 0, kD3;
      for (kD3 in mucDB.npc.def) { var dD3 = G.D(kD3); if (dD3 && dD3.lop === 'dat') thuDatSau += mucDB.npc.def[kD3]; }
      console.log('  · đổ bộ: ' + (bcDB.data.doBo.thang ? 'thắng' : 'thua') +
        ', phòng thủ mặt đất địch ' + thuDatTruoc + ' -> ' + thuDatSau +
        ', cướp ' + G.so(G.tongRes(bcDB.data.cuop)));
      ktra(bcDB.data.doBo.thang ? thuDatSau < thuDatTruoc : true, 'đổ bộ thắng thì phòng thủ mặt đất địch bị xoá');
      ktra(G.tongRes(bcDB.data.cuop) > 0, 'cướp được tài nguyên');
    }
  }
  now += 30 * 3600; G.tick(st, now);
  ktra(!G.trong(p.linh) || st.fleets.length === 0, 'quân sống sót đã về nhà');
}

/* phá công trình */
var htThu = G.htMoi(st, G.toaDo(1, 70, 7), 'Bia', false);
htThu.b = {
  metalMine: G.slTuCap(G.B('metalMine'), 12), crystalMine: G.slTuCap(G.B('crystalMine'), 10),
  solar: G.slTuCap(G.B('solar'), 11), shipyard: G.slTuCap(G.B('shipyard'), 6),
  lab: G.slTuCap(G.B('lab'), 5)
};
var capTruoc = G.tongSoCT(htThu);
var kqPha = G.phaCongTrinh(st, htThu, 1e7);
ktra(G.tongSoCT(htThu) < capTruoc, 'quân đổ bộ phá được công trình (' + capTruoc + ' -> ' + G.tongSoCT(htThu) + ')');
ktra(capTruoc - G.tongSoCT(htThu) <= Math.ceil(capTruoc * G.C.PHA_CT_TOI_DA),
  'không phá quá trần ' + Math.round(G.C.PHA_CT_TOI_DA * 100) + '% mỗi trận');
ktra(kqPha.soLuong === kqPha.soCap, 'báo cáo phá công trình có soLuong và alias soCap tương thích');
var htTy = G.htMoi(st, G.toaDo(1, 71, 7), 'Bia tỷ', false);
htTy.b = { metalMine: 1000000000, crystalMine: 900000000, solar: 800000000 };
var tyTruoc = G.tongSoCT(htTy), tPhaTy = Date.now();
var phaTy = G.phaCongTrinh(st, htTy, 1e30), msPhaTy = Date.now() - tPhaTy;
ktra(phaTy.soLuong > 0 && phaTy.soLuong <= Math.floor(tyTruoc * G.C.PHA_CT_TOI_DA) && msPhaTy < 1000,
  'phá hàng tỷ công trình theo lô O(số loại) (' + msPhaTy + 'ms)');

/* ---- 11. tua offline dài ---- */
var truocChuKy = st.soChuKy;
var t0 = Date.now();
now += 30 * 24 * 3600;
G.tick(st, now);
var ms = Date.now() - t0;
ktra(st.soChuKy >= truocChuKy + 100, 'tua offline 30 ngày chạy đủ chu kỳ bảo trì (' + st.soChuKy + ')');
ktra(ms < 8000, 'tua 30 ngày dưới 8 giây (' + ms + 'ms)');
console.log('  · tua 30 ngày mất ' + ms + 'ms');

/* ---- 12. an toàn số liệu & serialize ---- */
quetNaN(st.planets); quetNaN({ galana: st.galana, tech: st.techPts, no: st.noBaoTri });
for (var q = 0; q < st.planets.length; q++) {
  var pp = st.planets[q];
  for (var rk in pp.res) ktra(pp.res[rk] >= 0, 'tài nguyên ' + rk + ' không âm ở hành tinh ' + q);
}
ktra(st.galana >= 0, 'Galana không âm (' + Math.round(st.galana) + ')');
var js = JSON.stringify(st);
ktra(
  js.length > 100 && JSON.parse(js).planets.length === st.planets.length,
  'state lưu/nạp được JSON (' + Math.round(js.length / 1024) + ' KB)'
);

/* ---- 13. bảng xếp hạng ---- */
var xh = G.xepHang(st);
ktra(xh.length === 60 && xh.some(function (x) { return x.ta; }), 'bảng xếp hạng có người chơi');

/* ---- 14. chiến đấu: bên mạnh áp đảo phải thắng ---- */
var kq2 = G.danhTran(
  { ten: 'A', tech: { weapon: 10, shield: 10, armor: 10 }, ships: { destroyer: 500 } },
  { ten: 'D', tech: {}, ships: { fighterL: 50 }, def: { missileLauncher: 20 } }, 12345);
ktra(kq2.kq === 'thang', 'hạm đội áp đảo thắng trận');
var kq3 = G.danhTran(
  { ten: 'A', tech: {}, ships: { fighterL: 3 } },
  { ten: 'D', tech: { weapon: 8 }, ships: {}, def: { plasma: 20, orbitalStation: 10 } }, 999);
ktra(kq3.kq === 'thua', 'hạm đội yếu bị nghiền');

console.log('\n' + (loi ? '✗ ' + loi + ' lỗi / ' : '✓ ') + ok + ' kiểm tra đạt');
process.exit(loi ? 1 : 0);
