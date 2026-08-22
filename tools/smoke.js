/* Kiểm thử nhanh phần lõi (chạy: node tools/smoke.js) — không cần trình duyệt. */
global.window = global;
var fs = require('fs'), path = require('path');
var goc = path.join(__dirname, '..', 'js');
['data', 'util', 'galaxy', 'combat', 'engine', 'fleet', 'actions'].forEach(function (f) {
  eval(fs.readFileSync(path.join(goc, f + '.js'), 'utf8'));
});
var G = window.G;

var loi = 0, ok = 0;
function ktra(dk, ten) { if (dk) { ok++; } else { loi++; console.log('  ✗ ' + ten); } }
function quetNaN(o, duong) {
  duong = duong || '$';
  if (typeof o === 'number') { if (!isFinite(o)) { console.log('  ✗ NaN/Inf tại ' + duong); loi++; } return; }
  if (o && typeof o === 'object') for (var k in o) quetNaN(o[k], duong + '.' + k);
}

/* ---- 1. tạo bàn ---- */
var st = G.moiGame('Kiểm Thử', 'THDC-TEST-1');
var now = st.now;
ktra(st.planets.length === 1, 'có 1 hành tinh khởi đầu');
ktra(st.planets[0].thuDo, 'hành tinh mẹ được đánh dấu');

/* ---- 2. xây mỏ & tick 24 giờ ---- */
var p = st.planets[0];
p.res.metal = 5e6; p.res.crystal = 5e6; p.res.deut = 2e6; p.res.food = 2e6; st.galana = 2e6;
function xayDen(id, muc) {
  var ngoai = 0;
  while ((p.b[id] || 0) < muc && ngoai++ < 60) {
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

ktra((p.b.metalMine || 0) >= 5, 'mỏ kim loại lên được nhiều cấp (' + p.b.metalMine + ')');
ktra((p.b.shipyard || 0) >= 1, 'có xưởng đóng tàu');
var s = G.sanLuong(st, p);
ktra(s.r.metal > 0, 'sản lượng kim loại dương');
console.log('  · sản lượng/giờ: KL ' + Math.round(s.r.metal) + ' TT ' + Math.round(s.r.crystal) +
  ' DT ' + Math.round(s.r.deut) + ' LT ' + Math.round(s.r.food) + ' | điện ' + Math.round(s.dienCo) + '/' + Math.round(s.dienDung));

/* ---- 3. nghiên cứu (vốn trả góp theo chu kỳ) ---- */
var e2 = G.xepNC(st, p, 'energy');
ktra(!e2, 'xếp được đề tài nghiên cứu' + (e2 ? ': ' + e2 : ''));
ktra(st.ncQueue && st.ncQueue.von > 0, 'đề tài có vốn đầu tư trả góp');
now += 7200; G.tick(st, now);
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
    ktra(kq.vongDanh.some(function (v) { return v.matDat; }) || kq.vongDanh.length < G.VONG_XUONG_DAT,
      'phòng thủ mặt đất chỉ tham chiến từ vòng ' + G.VONG_XUONG_DAT);
    console.log('  · kết quả trận: ' + kq.kq + ', phế liệu ' + G.so(kq.pheLieu.metal) + ' KL');
  }
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
ktra(G.diem(st).tong > G.C.BAO_VE_MOI_DIEM, 'đã vượt mốc bảo vệ người chơi mới (' + Math.round(G.diem(st).tong) + ' điểm)');
var thu = 0;
while (st.toi.length === 0 && thu++ < 8) { st.nextRaid = st.now + 5; now += 10; G.tick(st, now); }
ktra(st.toi.length >= 1, 'NPC phát động đợt tấn công (sau ' + thu + ' lần hẹn)');
now += 12 * 3600; G.tick(st, now);
ktra(st.toi.length === 0, 'đợt tấn công của NPC đã được xử lý');
ktra(st.msgs.some(function (m) { return m.loai === 'tran' && m.data && m.data.ben === 'dich'; }), 'có báo cáo trận phòng thủ');

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
  ktra(st.fleets.every(function (f) { return f.pi >= 0 && f.pi < st.planets.length; }), 'chỉ số hành tinh của hạm đội vẫn hợp lệ');
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
ktra(st.fleets.filter(function (f) { return f.mission === 'thamhiem'; }).length === 0, 'không còn đoàn nào kẹt ngoài đó');
void matHet; void ketQua;

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
ktra(js.length > 100 && JSON.parse(js).planets.length === st.planets.length, 'state lưu/nạp được JSON (' + Math.round(js.length / 1024) + ' KB)');

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
