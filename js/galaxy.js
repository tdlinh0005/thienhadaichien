/* THIÊN HÀ ĐẠI CHIẾN — sinh thiên hà & các đế quốc NPC
 * Toàn bộ vũ trụ được sinh tất định từ hạt giống (seed) nên không cần lưu:
 * chỉ những ô đã bị người chơi can thiệp mới ghi vào state.npc / state.debris.
 * [SUY LUẬN] — bản gốc là game nhiều người chơi thật, ở đây NPC thay người. */
'use strict';
var G = window.G = window.G || {};

G.HO = ['Trần', 'Nguyễn', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Phan', 'Trịnh'];
G.TEN = ['Quốc Bình', 'Vũ Long', 'Minh Khôi', 'Hải Đăng', 'Trọng Nghĩa', 'Anh Tuấn', 'Thiên Ân', 'Bảo Nam',
  'Chí Kiên', 'Duy Hưng', 'Gia Bảo', 'Hữu Phước', 'Khắc Vũ', 'Lam Sơn', 'Mạnh Trường', 'Nhật Quang',
  'Phúc Thịnh', 'Quang Vinh', 'Sơn Tùng', 'Thành Đạt', 'Tuấn Kiệt', 'Việt Hoàng', 'Xuân Trường', 'Yên Bình'];
G.TEN_HT = ['Tân Việt', 'Hồng Bàng', 'Lạc Long', 'Bạch Đằng', 'Vân Đồn', 'Phong Châu', 'Cửu Long', 'Trường Sơn',
  'Thiên Môn', 'Hắc Tinh', 'Bích Vân', 'Kim Ngưu', 'Hỏa Diệm', 'Băng Hà', 'Tử Vi', 'Thanh Long',
  'Bạch Hổ', 'Huyền Vũ', 'Chu Tước', 'Cự Giải', 'Thiên Lang', 'Vọng Nguyệt', 'Tam Đảo', 'Nam Giao'];
G.LIEN_MINH = ['[HBV] Hồng Bàng Vệ', '[TQD] Thiên Quân Đoàn', '[LLQ] Lạc Long Quân', '[SVN] Sao Việt',
  '[BTH] Bão Thiên Hà', '[HKV] Hạm Không Vực', '[TDD] Tinh Đẩu Đoàn', '[VTT] Vệ Tinh Trắng', ''];

G.NPC_KHO = [
  { ten: 'Nông Trại', mo: 'Hành tinh bỏ hoang, chủ đã lâu không đăng nhập.' },
  { ten: 'Thường', mo: 'Một chỉ huy bình thường, phòng thủ vừa phải.' },
  { ten: 'Cứng', mo: 'Hạm đội thật, phòng thủ dày. Đừng đánh khi chưa do thám.' },
  { ten: 'Thủ Lĩnh', mo: 'Cao thủ trong vùng. Chỉ đánh khi cả liên minh cùng vào.' }
];

/* --- Móc nối cho chế độ nhiều người ------------------------------------
 * Ở bản một người G.HOOK = null: vũ trụ nằm gọn trong state của người chơi.
 * Ở bản nhiều người, server gán G.HOOK để chuyển quyền sở hữu hành tinh,
 * trạng thái NPC và bãi phế liệu sang database dùng chung.               */
G.HOOK = null;

/* --- Thông tin một ô hành tinh ---------------------------------------- */
G.oHanhTinh = function (st, c) {
  var key = G.tdKey(c);
  for (var i = 0; i < st.planets.length; i++)
    if (G.tdKey(st.planets[i].c) === key) return { loai: 'toi', pi: i, p: st.planets[i], key: key, c: c };

  if (G.HOOK && G.HOOK.oNguoi) {
    var ng = G.HOOK.oNguoi(st, c);
    if (ng) return ng;                    // hành tinh của người chơi khác
  }

  if (!G.coNPC(st.seed, c)) return { loai: 'trong', key: key, c: c };
  return { loai: 'npc', key: key, c: c, npc: G.npc(st, c) };
};

/* Ô này có NPC hay không — hoàn toàn tất định theo hạt giống vũ trụ */
G.coNPC = function (seed, c) {
  var r = G.rng(G.hash(seed + '#' + G.tdKey(c)));
  var mat = (c.p >= 4 && c.p <= 12) ? 0.34 : 0.14;
  return r() <= mat;
};

/* --- Sinh & lưu trạng thái một NPC ------------------------------------ */
G.npc = function (st, c) {
  var key = G.tdKey(c);
  if (G.HOOK && G.HOOK.npc) { var chung = G.HOOK.npc(st, c, key); if (chung) { G.npcHoiPhuc(st, chung); return chung; } }
  if (st.npc[key]) { G.npcHoiPhuc(st, st.npc[key]); return st.npc[key]; }

  var r = G.rng(G.hash(st.seed + '@' + key));
  r(); // bỏ số đầu (đã dùng cho mật độ)
  var xa = G.khoangCach(c, st.home) / 20000;                    // càng xa càng mạnh
  var manh = Math.min(1, 0.25 + r() * 0.55 + xa * 0.25);
  var diem = Math.round(140 * Math.pow(420, manh));
  var bo = r() < 0.16;                                           // "nông trại": bỏ hoang
  var hang = bo ? 0 : (manh < 0.45 ? 1 : (manh < 0.78 ? 2 : 3));

  var n = {
    key: key, c: { g: c.g, h: c.h, p: c.p },
    ten: G.HO[Math.floor(r() * G.HO.length)] + ' ' + G.TEN[Math.floor(r() * G.TEN.length)],
    htTen: G.TEN_HT[Math.floor(r() * G.TEN_HT.length)],
    lm: G.LIEN_MINH[Math.floor(r() * G.LIEN_MINH.length)],
    bo: bo, hang: hang, diem: diem,
    tech: {}, ships: {}, def: {}, res: {},
    t: st.now, cuopLuc: 0
  };

  var tl = Math.max(1, Math.round(Math.log(diem / 100) / Math.log(3)));
  n.tech = { weapon: tl, shield: tl, armor: tl, spy: Math.max(1, tl - 2), energy: tl };

  /* Hạm đội & phòng thủ quy từ điểm [SUY LUẬN] */
  var dFleet = bo ? 0 : diem * (0.28 + r() * 0.2);
  var dDef = diem * (bo ? 0.06 : 0.3 + r() * 0.2);
  n.ships = G.npcHam(dFleet, manh, r);
  n.def = G.npcThu(dDef, manh, r);
  n.res = { metal: Math.round(diem * 220), crystal: Math.round(diem * 110), deut: Math.round(diem * 45), food: Math.round(diem * 60) };
  if (bo) { n.res.metal *= 3; n.res.crystal *= 3; n.res.deut *= 2; }

  if (G.HOOK && G.HOOK.npcMoi) G.HOOK.npcMoi(n); else st.npc[key] = n;
  return n;
};

/* điểm = tổng tài nguyên đầu tư / 1000 */
G.giaTriDiem = function (cost, n) {
  return ((cost.metal || 0) + (cost.crystal || 0) + (cost.deut || 0)) * (n || 1) / 1000;
};

G.npcHam = function (diem, manh, r) {
  if (diem <= 0) return {};
  var bang;
  if (manh < 0.4) bang = [['fighterL', 0.5], ['cargoS', 0.3], ['fighterH', 0.2]];
  else if (manh < 0.7) bang = [['fighterL', 0.3], ['fighterH', 0.3], ['cruiser', 0.25], ['cargoL', 0.15]];
  else bang = [['fighterH', 0.2], ['cruiser', 0.2], ['battleship', 0.25], ['battlecruiser', 0.2], ['destroyer', 0.15]];
  var out = {};
  for (var i = 0; i < bang.length; i++) {
    var s = G.S(bang[i][0]);
    var v = G.giaTriDiem(s.cost);
    var n = Math.floor(diem * bang[i][1] * (0.7 + r() * 0.6) / v);
    if (n > 0) out[bang[i][0]] = n;
  }
  return out;
};

G.npcThu = function (diem, manh, r) {
  if (diem <= 0) return {};
  var bang;
  if (manh < 0.4) bang = [['missileLauncher', 0.6], ['laserS', 0.4]];
  else if (manh < 0.7) bang = [['missileLauncher', 0.3], ['laserS', 0.25], ['laserL', 0.2], ['ion', 0.15], ['satellite', 0.1]];
  else bang = [['laserL', 0.2], ['gauss', 0.25], ['ion', 0.12], ['plasma', 0.23], ['satellite', 0.1], ['orbitalStation', 0.1]];
  var out = {};
  for (var i = 0; i < bang.length; i++) {
    var d = G.D(bang[i][0]);
    var v = G.giaTriDiem(d.cost);
    var n = Math.floor(diem * bang[i][1] * (0.7 + r() * 0.6) / v);
    if (n > 0) out[bang[i][0]] = n;
  }
  if (manh > 0.55) out.shieldS = 1;
  if (manh > 0.85) out.shieldL = 1;
  return out;
};

/* Tài nguyên NPC tự mọc lại theo thời gian; hạm đội/phòng thủ xây lại chậm */
G.npcHoiPhuc = function (st, n) {
  var dt = st.now - (n.t || st.now);
  if (dt <= 0) { n.t = st.now; return; }
  n.t = st.now;
  var h = dt / 3600;
  var toc = n.diem * (n.bo ? 1.4 : 1) * 0.02;
  n.res.metal = Math.min(n.diem * (n.bo ? 900 : 300), (n.res.metal || 0) + toc * 22 * h);
  n.res.crystal = Math.min(n.diem * (n.bo ? 450 : 150), (n.res.crystal || 0) + toc * 11 * h);
  n.res.deut = Math.min(n.diem * (n.bo ? 180 : 60), (n.res.deut || 0) + toc * 4 * h);
  n.res.food = Math.min(n.diem * 90, (n.res.food || 0) + toc * 6 * h);

  /* Xây lại phòng thủ đã mất: 1.5%/giờ so với cấu hình gốc */
  if (!n.bo && dt > 3600) {
    var r = G.rng(G.hash(n.key + '~' + Math.floor(st.now / 3600)));
    var goc = G.npcThu(n.diem * 0.35, Math.min(1, n.diem / 50000), r);
    for (var k in goc) {
      var thieu = goc[k] - (n.def[k] || 0);
      if (thieu > 0) n.def[k] = Math.min(goc[k], (n.def[k] || 0) + Math.max(1, Math.floor(goc[k] * 0.015 * h)));
    }
  }
};

/* --- Bãi phế liệu ------------------------------------------------------ */
G.pheLieu = function (st, key) {
  if (G.HOOK && G.HOOK.pheLieu) return G.HOOK.pheLieu(key);
  if (!st.debris[key]) st.debris[key] = { metal: 0, crystal: 0 };
  return st.debris[key];
};

/* --- Danh sách một hệ (cho màn Thiên Hà) ------------------------------ */
G.xemHe = function (st, g, h) {
  var out = [];
  for (var p = 1; p <= G.C.SO_HANH_TINH; p++) {
    var c = G.toaDo(g, h, p);
    var o = G.oHanhTinh(st, c);
    var d = st.debris[o.key];
    o.debris = (d && (d.metal > 0 || d.crystal > 0)) ? d : null;
    out.push(o);
  }
  return out;
};

/* --- Nhiệt độ & số ô đất của hành tinh theo vị trí -------------------- */
G.dacTinh = function (st, c) {
  var r = G.rng(G.hash(st.seed + '$' + G.tdKey(c)));
  var giua = 8, lech = Math.abs(c.p - giua);
  var temp = Math.round(120 - lech * 22 + (r() * 30 - 15));
  var oDat = Math.round(90 + (giua - lech) * 14 + r() * 60);
  return { temp: temp, oDat: oDat };
};

/* --- Bảng xếp hạng: sinh tất định, điểm tăng dần theo thời gian ------- */
G.xepHang = function (st) {
  if (G.HOOK && G.HOOK.xepHang) return G.HOOK.xepHang(st);
  var r = G.rng(G.hash(st.seed + '#rank'));
  var gio = Math.max(0, (st.now - st.t0) / 3600);
  var ds = [];
  for (var i = 0; i < 59; i++) {
    var nen = 220 * Math.pow(560, Math.pow(r(), 0.85));
    ds.push({
      ten: G.HO[Math.floor(r() * G.HO.length)] + ' ' + G.TEN[Math.floor(r() * G.TEN.length)],
      lm: G.LIEN_MINH[Math.floor(r() * G.LIEN_MINH.length)],
      diem: Math.round(nen * (1 + gio * 0.022)),
      ht: 1 + Math.floor(r() * 6)
    });
  }
  var d = G.diem(st);
  ds.push({ ten: st.ten, lm: st.lm ? st.lm.ten : '', diem: Math.round(d.tong), ht: st.planets.length, ta: true });
  ds.sort(function (a, b) { return b.diem - a.diem; });
  for (var j = 0; j < ds.length; j++) ds[j].hang = j + 1;
  return ds;
};
