/* THIÊN HÀ ĐẠI CHIẾN — bộ mô phỏng chiến đấu
 * 6 vòng, bắn nhanh (rapidfire), khiên hồi đầu mỗi vòng, bãi phế liệu 30%.
 * Đặc trưng bản gốc: PHÒNG THỦ HAI LỚP — lớp quỹ đạo giao chiến ngay từ
 * vòng 1, hạm đội chỉ xuống tới tầng khí quyển (gặp phòng thủ mặt đất) từ
 * vòng 3. [SUY LUẬN về số vòng và hệ số]                                  */
'use strict';
var G = window.G = window.G || {};

G.VONG_XUONG_DAT = 3;

function nhom(id, n, tech, ben, thuDat) {
  var u = G.UNIT(id);
  var w = 1 + 0.1 * (tech.weapon || 0), s = 1 + 0.1 * (tech.shield || 0), a = 1 + 0.1 * (tech.armor || 0);
  /* Loại hành tinh làm phòng thủ MẶT ĐẤT dày thêm (Băng Hà, Nước – Đầm Lầy) */
  if (u.lop === 'dat' && thuDat) { s *= thuDat; a *= thuDat; }
  return {
    id: id, ten: u.ten, n: n, n0: n, ben: ben,
    atk: u.atk * w,
    shield: u.shield * s,
    hull: (u.hull) * a * 0.1 + u.hull * 0.9 * a,   // vỏ thép cơ bản × giáp
    hongDu: 0,
    lop: u.lop || 'ham',
    cost: u.cost
  };
}

function gomBen(ships, def, tech, ben, thuDat, bo) {
  var out = [];
  var id;
  if (ships) for (id in ships) if (ships[id] > 0 && G.S(id)) out.push(nhom(id, ships[id], tech, ben));
  if (def) for (id in def) if (def[id] > 0 && G.D(id)) out.push(nhom(id, def[id], tech, ben, thuDat));
  if (bo) for (id in bo) if (bo[id] > 0 && G.BB(id)) out.push(nhom(id, bo[id], tech, ben, thuDat));
  return out;
}

function conSong(g) { return g.n > 0; }

function heSoBanNhanh(g, dich) {
  var rf = G.RAPIDFIRE[g.id];
  if (!rf) return 1;
  var tong = 0, i;
  for (i = 0; i < dich.length; i++) tong += dich[i].n;
  if (!tong) return 1;
  var q = 0;
  for (i = 0; i < dich.length; i++) {
    var r = rf[dich[i].id];
    if (r && r > 1) q += (dich[i].n / tong) * (r - 1) / r;
  }
  if (q >= 0.999) q = 0.999;
  return 1 / (1 - q);
}

/* Một bên bắn vào bên kia (mô hình gộp nhóm) */
function banLoat(banh, dich, rnd) {
  var i, j;
  var tongDich = 0;
  for (j = 0; j < dich.length; j++) tongDich += dich[j].n;
  if (!tongDich) return;

  /* tổng số phát bắn phân về từng nhóm địch theo tỷ lệ số lượng */
  var vao = [];
  for (j = 0; j < dich.length; j++) vao.push({ phat: 0, dmg: 0 });

  for (i = 0; i < banh.length; i++) {
    var g = banh[i];
    if (g.n <= 0 || g.atk <= 0) continue;
    var phat = g.n * heSoBanNhanh(g, dich);
    for (j = 0; j < dich.length; j++) {
      var p = phat * (dich[j].n / tongDich);
      vao[j].phat += p;
      /* quy tắc dội: sát thương < 1% khiên thì không xuyên nổi */
      if (g.atk >= dich[j].shield * 0.01) vao[j].dmg += p * g.atk;
    }
  }

  for (j = 0; j < dich.length; j++) {
    var d = dich[j];
    if (d.n <= 0) continue;
    var hutKhien = Math.min(vao[j].dmg, d.n * d.shield * (0.9 + rnd() * 0.2));
    var vaoVo = Math.max(0, vao[j].dmg - hutKhien) + d.hongDu;
    var chet = Math.floor(vaoVo / d.hull);
    if (chet > d.n) chet = d.n;
    d.hongDu = vaoVo - chet * d.hull;
    /* tàu hư nặng có thể nổ dây */
    if (chet < d.n && d.hongDu > d.hull * 0.7 && rnd() < (d.hongDu / d.hull)) { chet++; d.hongDu = 0; }
    d.n -= chet;
    if (d.n < 0) d.n = 0;
  }
}

function tinhLuc(gs) {
  var t = 0;
  for (var i = 0; i < gs.length; i++) t += gs[i].n * (gs[i].atk + gs[i].hull * 0.02 + gs[i].shield);
  return t;
}

/* -----------------------------------------------------------------------
 * G.danhTran(A, D) — A/D: { ten, tech, ships, def }
 * --------------------------------------------------------------------- */
G.danhTran = function (A, D, seed) {
  var rnd = G.rng(seed || (Date.now() >>> 0));
  var doBo = !!A.doBo;                 /* trận đổ bộ: không chia lớp, đánh hết từ vòng 1 */
  var atk = gomBen(A.ships, null, A.tech || {}, 'A', 1, A.bo);
  var defAll = gomBen(D.ships, D.def, D.tech || {}, 'D', D.thuDat || 1, D.bo);

  var quyDao = [], mDat = [];
  for (var i = 0; i < defAll.length; i++) {
    if (!doBo && defAll[i].lop === 'dat') mDat.push(defAll[i]); else quyDao.push(defAll[i]);
  }

  var nhatKy = [];
  var vong;
  for (vong = 1; vong <= G.C.VONG_DANH; vong++) {
    var ta = atk.filter(conSong);
    if (!ta.length) break;
    var phe = quyDao.filter(conSong);
    var conDat = mDat.filter(conSong);
    if (vong >= G.VONG_XUONG_DAT) phe = phe.concat(conDat);
    if (!phe.length) {
      /* Đã dẹp xong lớp quỹ đạo nhưng chưa tới vòng hạ độ cao: vòng trống,
         hạm đội hạ dần xuống tầng khí quyển. */
      if (vong < G.VONG_XUONG_DAT && conDat.length) {
        nhatKy.push({ vong: vong, lucA: Math.round(tinhLuc(ta)), lucD: 0,
          conA: ta.reduce(function (s2, g2) { return s2 + g2.n; }, 0), conD: 0, matDat: false, haDoCao: true });
        continue;
      }
      break;
    }

    var lucA = tinhLuc(ta), lucD = tinhLuc(phe);
    /* hai bên bắn đồng thời: chụp lại số lượng trước khi trừ */
    var chupA = ta.map(function (g) { return { g: g, n: g.n }; });
    var chupD = phe.map(function (g) { return { g: g, n: g.n }; });
    banLoat(chupA.map(function (x) { return { id: x.g.id, n: x.n, atk: x.g.atk }; }), phe, rnd);
    banLoat(chupD.map(function (x) { return { id: x.g.id, n: x.n, atk: x.g.atk }; }), ta, rnd);

    nhatKy.push({
      vong: vong,
      lucA: Math.round(lucA), lucD: Math.round(lucD),
      conA: ta.reduce(function (s2, g2) { return s2 + g2.n; }, 0),
      conD: phe.reduce(function (s2, g2) { return s2 + g2.n; }, 0),
      matDat: vong >= G.VONG_XUONG_DAT
    });
  }

  var conA = 0, conD = 0;
  var i2;
  for (i2 = 0; i2 < atk.length; i2++) conA += atk[i2].n;
  for (i2 = 0; i2 < defAll.length; i2++) conD += defAll[i2].n;

  var coA = false, coD = false;
  for (i2 = 0; i2 < atk.length; i2++) if (atk[i2].n0 > 0) coA = true;
  for (i2 = 0; i2 < defAll.length; i2++) if (defAll[i2].n0 > 0) coD = true;
  var kq;
  if (!coA && !coD) kq = 'hoa';                                  /* hai bên đều trống */
  else if (conA > 0 && conD <= 0) kq = 'thang';
  else if (conA <= 0 && conD > 0) kq = 'thua';
  else if (conA <= 0 && conD <= 0) kq = 'huyDiet';
  else kq = 'hoa';

  /* --- thiệt hại, phế liệu, phòng thủ tự sửa --- */
  var matA = {}, matD = {}, matDPha = {}, pl = { metal: 0, crystal: 0 };   /* matDPha: công sự bị phá TRƯỚC khi sửa lại */
  var conShipsA = {}, conShipsD = {}, conDefD = {}, conBoA = {}, conBoD = {};

  for (i2 = 0; i2 < atk.length; i2++) {
    var g = atk[i2], mat = g.n0 - g.n;
    if (mat > 0) {
      matA[g.id] = mat;
      if (!G.BB(g.id)) {          /* bộ binh chết trên mặt đất, không thành phế liệu quỹ đạo */
        pl.metal += (g.cost.metal || 0) * mat * G.C.PHE_LIEU;
        pl.crystal += (g.cost.crystal || 0) * mat * G.C.PHE_LIEU;
      }
    }
    if (g.n > 0) { if (G.BB(g.id)) conBoA[g.id] = g.n; else conShipsA[g.id] = g.n; }
  }
  for (i2 = 0; i2 < defAll.length; i2++) {
    var d = defAll[i2], m = d.n0 - d.n, con = d.n;
    if (m > 0) {
      if (G.BB(d.id)) {  /* bộ binh chết không thành phế liệu bay */ }
      else if (G.S(d.id)) {   /* tàu bị bắn hạ -> phế liệu */
        pl.metal += (d.cost.metal || 0) * m * G.C.PHE_LIEU;
        pl.crystal += (d.cost.crystal || 0) * m * G.C.PHE_LIEU;
      } else {           /* công sự: 70% được sửa lại sau trận [SUY LUẬN kiểu OGame] */
        matDPha[d.id] = m;
        var sua = 0;
        for (var k = 0; k < m; k++) if (rnd() < G.C.SUA_CONG_SU) sua++;
        con += sua; m -= sua;
      }
      if (m > 0) matD[d.id] = m;
    }
    if (con > 0) {
      if (G.BB(d.id)) conBoD[d.id] = con;
      else if (G.S(d.id)) conShipsD[d.id] = con;
      else conDefD[d.id] = con;
    }
  }

  return {
    kq: kq, vongDanh: nhatKy, seed: seed,
    tenA: A.ten, tenD: D.ten, thuDat: D.thuDat || 1, loaiHT: D.loaiHT || null,
    conShipsA: conShipsA, conShipsD: conShipsD, conDefD: conDefD,
    conBoA: conBoA, conBoD: conBoD, doBo: doBo,
    matA: matA, matD: matD, matDPha: matDPha,
    pheLieu: { metal: Math.round(pl.metal), crystal: Math.round(pl.crystal) }
  };
};

/* Tổng khoang hàng của một hạm đội */
G.khoangHang = function (ships) {
  var t = 0;
  for (var id in ships) { var s = G.S(id); if (s) t += s.cargo * ships[id]; }
  return t;
};
G.thuyThu = function (ships) {
  var t = 0;
  for (var id in ships) { var s = G.S(id); if (s) t += (s.crew || 1) * ships[id]; }
  return t;
};
