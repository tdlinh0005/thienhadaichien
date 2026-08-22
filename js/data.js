/* =========================================================================
 * THIÊN HÀ ĐẠI CHIẾN — Bảng dữ liệu game
 * -------------------------------------------------------------------------
 * Tên tài nguyên, chu kỳ bảo trì 6h, nghiên cứu trả góp, phòng thủ 2 lớp,
 * hạm đội đổi mục tiêu giữa đường  => lấy từ tư liệu về game gốc.
 * Toàn bộ CON SỐ cân bằng là [SUY LUẬN] theo khung OGame (xem docs/NGHIEN-CUU.md)
 * ========================================================================= */
'use strict';

var G = window.G = window.G || {};

G.VERSION = '1.33f-r';           // nhại phiên bản 1.33f của bản gốc
G.NAM_BOI_CANH = 2184;

/* --- Tài nguyên ------------------------------------------------------- */
G.RES = [
  { id: 'metal',   ten: 'Kim Loại',   ky: 'KL', mau: '#c9a06a' },
  { id: 'crystal', ten: 'Tinh Thể',   ky: 'TT', mau: '#7fd4f5' },
  { id: 'deut',    ten: 'Deuterium',  ky: 'DT', mau: '#9be59b' },
  { id: 'food',    ten: 'Lương Thực', ky: 'LT', mau: '#e5c76b' },
  { id: 'galana',  ten: 'Galana',     ky: 'GL', mau: '#f0b3ff' },
  { id: 'tech',    ten: 'Công Nghệ',  ky: 'CN', mau: '#8fa8ff' }
];
G.RES_HANH_TINH = ['metal', 'crystal', 'deut', 'food'];  // chứa ở kho hành tinh
G.RES_DE_QUOC   = ['galana', 'tech'];                    // chung toàn đế quốc

/* --- Công trình -------------------------------------------------------- */
/* prod(l, ctx) -> {metal|crystal|deut|food|energy|galana|tech}
 * use(l)      -> năng lượng tiêu thụ                                     */
G.BUILDINGS = [
  { id: 'metalMine', ten: 'Mỏ Kim Loại', nhom: 'kt',
    mota: 'Máy khoan tự động bóc lớp vỏ hành tinh để lấy kim loại thô — nền tảng của mọi công trình.',
    cost: { metal: 60, crystal: 15 }, factor: 1.5,
    prod: function (l) { return { metal: 30 * l * Math.pow(1.1, l) }; },
    use: function (l) { return 10 * l * Math.pow(1.1, l); } },

  { id: 'crystalMine', ten: 'Mỏ Tinh Thể', nhom: 'kt',
    mota: 'Hầm khai thác tinh thể — vật liệu bắt buộc cho mạch điện tử và vũ khí năng lượng.',
    cost: { metal: 48, crystal: 24 }, factor: 1.6,
    prod: function (l) { return { crystal: 20 * l * Math.pow(1.1, l) }; },
    use: function (l) { return 10 * l * Math.pow(1.1, l); } },

  { id: 'deutSyn', ten: 'Giàn Tổng Hợp Deuterium', nhom: 'kt',
    mota: 'Lọc nước nặng từ khí quyển thành deuterium — nhiên liệu cho hạm đội và lò nhiệt hạch.',
    cost: { metal: 225, crystal: 75 }, factor: 1.5,
    prod: function (l, c) { return { deut: 10 * l * Math.pow(1.1, l) * (1.28 - 0.002 * c.temp) }; },
    use: function (l) { return 20 * l * Math.pow(1.1, l); } },

  { id: 'farm', ten: 'Trang Trại Sinh Quyển', nhom: 'kt',
    mota: 'Vòm sinh quyển trồng lương thực nuôi dân cư và thủy thủ đoàn. Hết Lương Thực là hành tinh đói.',
    cost: { metal: 80, crystal: 40 }, factor: 1.55,
    prod: function (l) { return { food: 26 * l * Math.pow(1.1, l) }; },
    use: function (l) { return 8 * l * Math.pow(1.1, l); } },

  { id: 'solar', ten: 'Nhà Máy Điện Mặt Trời', nhom: 'nl',
    mota: 'Cánh đồng pin quang điện. Không có điện thì mỏ chỉ chạy cầm chừng.',
    cost: { metal: 75, crystal: 30 }, factor: 1.5,
    prod: function (l) { return { energy: 20 * l * Math.pow(1.1, l) }; } },

  { id: 'fusion', ten: 'Lò Phản Ứng Nhiệt Hạch', nhom: 'nl',
    mota: 'Đốt deuterium để lấy điện. Đắt, ngốn nhiên liệu, nhưng là nguồn điện mạnh nhất.',
    cost: { metal: 900, crystal: 360, deut: 180 }, factor: 1.8,
    prod: function (l, c) { return { energy: 30 * l * Math.pow(1.05 + 0.01 * c.tech.energy, l) }; },
    deutUse: function (l) { return 10 * l * Math.pow(1.1, l); } },

  { id: 'metalStore', ten: 'Kho Kim Loại', nhom: 'kho',
    mota: 'Kho vượt quá dung tích thì tài nguyên tràn ra ngoài và mất trắng.',
    cost: { metal: 1000 }, factor: 2,
    cap: function (l) { return Math.floor(10000 * (Math.pow(1.6, l))); } },

  { id: 'crystalStore', ten: 'Kho Tinh Thể', nhom: 'kho',
    mota: 'Nhà chứa tinh thể có kiểm soát độ ẩm.',
    cost: { metal: 1000, crystal: 500 }, factor: 2,
    cap: function (l) { return Math.floor(10000 * (Math.pow(1.6, l))); } },

  { id: 'deutStore', ten: 'Bồn Deuterium', nhom: 'kho',
    mota: 'Bồn áp lực chứa nước nặng đã tinh chế.',
    cost: { metal: 1000, crystal: 1000 }, factor: 2,
    cap: function (l) { return Math.floor(10000 * (Math.pow(1.6, l))); } },

  { id: 'silo', ten: 'Vựa Lương Thực', nhom: 'kho',
    mota: 'Vựa chứa lương thực có làm lạnh.',
    cost: { metal: 800, crystal: 200 }, factor: 2,
    cap: function (l) { return Math.floor(10000 * (Math.pow(1.6, l))); } },

  { id: 'robot', ten: 'Nhà Máy Robot', nhom: 'cn',
    mota: 'Mỗi cấp giảm thời gian xây dựng công trình.',
    cost: { metal: 400, crystal: 120, deut: 200 }, factor: 2 },

  { id: 'nanite', ten: 'Nhà Máy Nano', nhom: 'cn', req: { b: { robot: 10 }, r: { computer: 10 } },
    mota: 'Bầy robot nano lắp ghép ở cấp phân tử. Giảm mạnh mọi thời gian sản xuất.',
    cost: { metal: 1000000, crystal: 500000, deut: 100000 }, factor: 2 },

  { id: 'shipyard', ten: 'Xưởng Đóng Tàu', nhom: 'cn', req: { b: { robot: 2 } },
    mota: 'Ụ tàu trên quỹ đạo. Không có xưởng thì không có hạm đội.',
    cost: { metal: 400, crystal: 200, deut: 100 }, factor: 2 },

  { id: 'lab', ten: 'Phòng Nghiên Cứu', nhom: 'cn',
    mota: 'Tạo ra Công Nghệ — tài nguyên ẩn của đế quốc — và cho phép nghiên cứu.',
    cost: { metal: 200, crystal: 400, deut: 200 }, factor: 2,
    prod: function (l) { return { tech: 4 * l * Math.pow(1.08, l) }; },
    use: function (l) { return 6 * l * Math.pow(1.1, l); } },

  { id: 'intel', ten: 'Trung Tâm Tình Báo', nhom: 'cn', req: { b: { lab: 4 } },
    mota: 'Vừa phân tích báo cáo do thám, vừa phản tình báo — mỗi cấp tăng xác suất bắn hạ tàu do thám địch.',
    cost: { metal: 5000, crystal: 8000, deut: 2000 }, factor: 1.9 },

  { id: 'fleetHQ', ten: 'Đài Chỉ Huy Hạm Đội', nhom: 'cn', req: { b: { shipyard: 4 } },
    mota: 'Mỗi cấp mở thêm một khe điều phối hạm đội cùng lúc.',
    cost: { metal: 20000, crystal: 20000, deut: 1000 }, factor: 2 },

  { id: 'maintDepot', ten: 'Trung Tâm Bảo Trì', nhom: 'cn',
    mota: 'Giảm 6% chi phí Galana mỗi chu kỳ bảo trì (tối đa 60%). Cứu cánh khi hạm đội phình to.',
    cost: { metal: 10000, crystal: 6000, deut: 2000 }, factor: 1.8 },

  { id: 'missileSilo', ten: 'Hầm Tên Lửa', nhom: 'cn', req: { b: { shipyard: 1 } },
    mota: 'Mỗi cấp chứa 10 tên lửa đánh chặn hoặc 5 tên lửa liên hành tinh.',
    cost: { metal: 20000, crystal: 20000, deut: 1000 }, factor: 2 },

  { id: 'terraform', ten: 'Cải Tạo Hành Tinh', nhom: 'cn', req: { r: { energy: 12 } },
    mota: 'Nắn lại địa hình để lấy thêm ô đất xây dựng (+6 ô mỗi cấp).',
    cost: { metal: 0, crystal: 50000, deut: 100000 }, factor: 2 },

  { id: 'jumpGate', ten: 'Cổng Không Gian', nhom: 'cn', req: { r: { hyperspace: 7 } },
    mota: 'Dịch chuyển hạm đội tức thời giữa hai hành tinh cùng có cổng (hồi 60 phút).',
    cost: { metal: 2000000, crystal: 4000000, deut: 200000 }, factor: 2 }
];

/* --- Nghiên cứu -------------------------------------------------------- */
/* Đặc trưng bản gốc: ngoài chi phí trả ngay, mỗi đề tài còn có "vốn đầu tư"
 * Galana bị trừ DẦN qua từng chu kỳ bảo trì 6 giờ.                        */
G.RESEARCH = [
  { id: 'energy', ten: 'Công Nghệ Năng Lượng', cost: { crystal: 800, deut: 400 }, factor: 2,
    mota: 'Nền tảng cho mọi vũ khí năng lượng và lò nhiệt hạch.', req: { b: { lab: 1 } } },
  { id: 'laser', ten: 'Công Nghệ Laser', cost: { metal: 200, crystal: 100 }, factor: 2,
    mota: 'Chùm tia hội tụ — mở ra pháo laser và phi thuyền hạng nặng.', req: { b: { lab: 1 }, r: { energy: 2 } } },
  { id: 'ion', ten: 'Công Nghệ Ion', cost: { metal: 1000, crystal: 300, deut: 100 }, factor: 2,
    mota: 'Dòng hạt mang điện xé rào chắn.', req: { b: { lab: 4 }, r: { laser: 5, energy: 4 } } },
  { id: 'hyperspace', ten: 'Công Nghệ Siêu Hấp', cost: { metal: 0, crystal: 4000, deut: 2000 }, factor: 2,
    mota: 'Gấp không gian lại. Điều kiện cho tàu lớn và cổng không gian.', req: { b: { lab: 7 }, r: { energy: 5, shield: 5 } } },
  { id: 'plasma', ten: 'Công Nghệ Plasma', cost: { metal: 2000, crystal: 4000, deut: 1000 }, factor: 2,
    mota: 'Bắn khối vật chất siêu nhiệt — sức công phá cao nhất.', req: { b: { lab: 4 }, r: { energy: 8, laser: 10, ion: 5 } } },
  { id: 'combustion', ten: 'Động Cơ Đốt', cost: { metal: 400, deut: 600 }, factor: 2,
    mota: 'Mỗi cấp +10% tốc độ cho tàu dùng động cơ đốt.', req: { b: { lab: 1 }, r: { energy: 1 } } },
  { id: 'impulse', ten: 'Động Cơ Xung', cost: { metal: 2000, crystal: 4000, deut: 600 }, factor: 2,
    mota: 'Mỗi cấp +20% tốc độ cho tàu dùng động cơ xung.', req: { b: { lab: 2 }, r: { energy: 1 } } },
  { id: 'hyperdrive', ten: 'Động Cơ Siêu Hấp', cost: { metal: 10000, crystal: 20000, deut: 6000 }, factor: 2,
    mota: 'Mỗi cấp +30% tốc độ cho tàu dùng động cơ siêu hấp.', req: { b: { lab: 7 }, r: { hyperspace: 3 } } },
  { id: 'spy', ten: 'Công Nghệ Tình Báo', cost: { metal: 200, crystal: 1000, deut: 200 }, factor: 2,
    mota: 'Chênh lệch cấp tình báo quyết định báo cáo do thám thấy được bao nhiêu.', req: { b: { lab: 3 } } },
  { id: 'computer', ten: 'Công Nghệ Máy Tính', cost: { crystal: 400, deut: 600 }, factor: 2,
    mota: 'Mỗi cấp +1 khe hạm đội và tăng hiệu quả điều phối.', req: { b: { lab: 1 } } },
  { id: 'weapon', ten: 'Công Nghệ Vũ Khí', cost: { metal: 800, crystal: 200 }, factor: 2,
    mota: 'Mỗi cấp +10% sát thương cho toàn bộ tàu và pháo.', req: { b: { lab: 4 } } },
  { id: 'shield', ten: 'Công Nghệ Khiên', cost: { metal: 200, crystal: 600 }, factor: 2,
    mota: 'Mỗi cấp +10% khiên.', req: { b: { lab: 6 }, r: { energy: 3 } } },
  { id: 'armor', ten: 'Công Nghệ Giáp', cost: { metal: 1000 }, factor: 2,
    mota: 'Mỗi cấp +10% vỏ thép.', req: { b: { lab: 2 } } },
  { id: 'astro', ten: 'Công Nghệ Liên Hành Tinh', cost: { metal: 4000, crystal: 8000, deut: 4000 }, factor: 1.75,
    mota: 'Mỗi 2 cấp cho phép chiếm thêm một hành tinh thuộc địa.', req: { b: { lab: 3 }, r: { impulse: 3 } } },
  { id: 'graviton', ten: 'Công Nghệ Trọng Trường', cost: { tech: 30000 }, factor: 3,
    mota: 'Điều khiển lực hấp dẫn. Điều kiện bắt buộc của Pháo Đài Di Động.', req: { b: { lab: 12 } } }
];

/* --- Tàu chiến --------------------------------------------------------- */
/* dc: động cơ (combustion|impulse|hyperdrive) — quyết định tech tăng tốc  */
G.SHIPS = [
  { id: 'cargoS', ten: 'Tàu Vận Tải Nhỏ', cost: { metal: 2000, crystal: 2000 },
    atk: 5, shield: 10, hull: 4000, speed: 5000, cargo: 5000, fuel: 10, crew: 3, dc: 'combustion',
    req: { b: { shipyard: 2 }, r: { combustion: 2 } },
    mota: 'Con la thồ của thiên hà. Chở tài nguyên, chở lính, chở của cướp được.' },
  { id: 'cargoL', ten: 'Tàu Vận Tải Lớn', cost: { metal: 6000, crystal: 6000 },
    atk: 5, shield: 25, hull: 12000, speed: 7500, cargo: 25000, fuel: 50, crew: 8, dc: 'combustion',
    req: { b: { shipyard: 4 }, r: { combustion: 6 } },
    mota: 'Khoang hàng gấp năm lần tàu nhỏ mà vẫn bay nhanh hơn.' },
  { id: 'fighterL', ten: 'Phi Thuyền Nhẹ', cost: { metal: 3000, crystal: 1000 },
    atk: 50, shield: 10, hull: 4000, speed: 12500, cargo: 50, fuel: 20, crew: 2, dc: 'combustion',
    req: { b: { shipyard: 1 }, r: { combustion: 1 } },
    mota: 'Rẻ, nhanh, chết cũng nhanh. Sức mạnh nằm ở số lượng.' },
  { id: 'fighterH', ten: 'Phi Thuyền Nặng', cost: { metal: 6000, crystal: 4000 },
    atk: 150, shield: 25, hull: 10000, speed: 10000, cargo: 100, fuel: 75, crew: 4, dc: 'impulse',
    req: { b: { shipyard: 3 }, r: { armor: 2, impulse: 2 } },
    mota: 'Phi thuyền nhẹ mặc thêm giáp và gắn laser.' },
  { id: 'cruiser', ten: 'Tuần Dương Hạm', cost: { metal: 20000, crystal: 7000, deut: 2000 },
    atk: 400, shield: 50, hull: 27000, speed: 15000, cargo: 800, fuel: 300, crew: 12, dc: 'impulse',
    req: { b: { shipyard: 5 }, r: { impulse: 4, ion: 2 } },
    mota: 'Xương sống hạm đội giữa game. Nghiền phi thuyền nhẹ và bệ tên lửa.' },
  { id: 'battleship', ten: 'Chiến Hạm', cost: { metal: 45000, crystal: 15000 },
    atk: 1000, shield: 200, hull: 60000, speed: 10000, cargo: 1500, fuel: 500, crew: 30, dc: 'hyperdrive',
    req: { b: { shipyard: 7 }, r: { hyperdrive: 4 } },
    mota: 'Pháo hạm chủ lực, đủ vỏ thép để đứng trụ tới vòng cuối.' },
  { id: 'battlecruiser', ten: 'Khu Trục Hạm', cost: { metal: 30000, crystal: 40000, deut: 15000 },
    atk: 700, shield: 400, hull: 70000, speed: 10000, cargo: 750, fuel: 250, crew: 25, dc: 'hyperdrive',
    req: { b: { shipyard: 8 }, r: { hyperspace: 5, hyperdrive: 5, laser: 12 } },
    mota: 'Sinh ra để xé nát hạm đội hạng nhẹ. Kém hiệu quả trước phòng thủ mặt đất.' },
  { id: 'bomber', ten: 'Tàu Bom', cost: { metal: 50000, crystal: 25000, deut: 15000 },
    atk: 1000, shield: 500, hull: 75000, speed: 4000, cargo: 500, fuel: 700, crew: 30, dc: 'impulse',
    req: { b: { shipyard: 8 }, r: { impulse: 6, plasma: 5 } },
    mota: 'Chuyên trị công sự: cày phẳng pháo và khiên trên mặt đất.' },
  { id: 'destroyer', ten: 'Chiến Hạm Hủy Diệt', cost: { metal: 60000, crystal: 50000, deut: 15000 },
    atk: 2000, shield: 500, hull: 110000, speed: 5000, cargo: 2000, fuel: 1000, crew: 50, dc: 'hyperdrive',
    req: { b: { shipyard: 9 }, r: { hyperdrive: 6, plasma: 5 } },
    mota: 'Nắm đấm cuối game. Chậm, đắt, và gần như không có gì đứng vững trước nó.' },
  { id: 'fortress', ten: 'Pháo Đài Di Động', cost: { metal: 5000000, crystal: 4000000, deut: 1000000 },
    atk: 200000, shield: 50000, hull: 9000000, speed: 100, cargo: 1000000, fuel: 1, crew: 500, dc: 'hyperdrive',
    req: { b: { shipyard: 12 }, r: { graviton: 1, hyperspace: 6, hyperdrive: 7 } },
    mota: 'Một hành tinh nhân tạo có động cơ. Bay chậm như rùa nhưng bất tử.' },
  { id: 'probe', ten: 'Tàu Do Thám', cost: { crystal: 1000 },
    atk: 0, shield: 0, hull: 1000, speed: 100000, cargo: 5, fuel: 1, crew: 1, dc: 'combustion',
    req: { b: { shipyard: 3 }, r: { combustion: 3, spy: 2 } },
    mota: 'Tàu không người, bay cực nhanh, chỉ để nhìn rồi báo về.' },
  { id: 'recycler', ten: 'Tàu Thu Hồi', cost: { metal: 10000, crystal: 6000, deut: 2000 },
    atk: 1, shield: 10, hull: 16000, speed: 2000, cargo: 20000, fuel: 300, crew: 6, dc: 'combustion',
    req: { b: { shipyard: 4 }, r: { combustion: 6, shield: 2 } },
    mota: 'Hót xác tàu ở bãi phế liệu sau mỗi trận đánh. Kẻ thắng thật sự của chiến tranh.' },
  { id: 'colony', ten: 'Tàu Thực Dân', cost: { metal: 10000, crystal: 20000, deut: 10000 },
    atk: 50, shield: 100, hull: 30000, speed: 2500, cargo: 7500, fuel: 1000, crew: 20, dc: 'impulse',
    req: { b: { shipyard: 4 }, r: { impulse: 3 } },
    mota: 'Mang theo một thành phố gấp gọn. Bay tới ô đất trống và dựng hành tinh mới.' }
];

/* Rapidfire: bắn nhanh — bắn hạ mục tiêu là được bắn tiếp [SUY LUẬN theo OGame] */
G.RAPIDFIRE = {
  cargoS:        { probe: 5 },
  cargoL:        { probe: 5 },
  fighterL:      { probe: 5 },
  fighterH:      { probe: 5, cargoS: 3 },
  cruiser:       { probe: 5, fighterL: 6, missileLauncher: 10 },
  battleship:    { probe: 5 },
  battlecruiser: { probe: 5, cargoS: 3, cargoL: 3, fighterH: 4, cruiser: 4, battleship: 7 },
  bomber:        { probe: 5, missileLauncher: 20, laserS: 20, laserL: 10, ion: 10, plasma: 5 },
  destroyer:     { probe: 5, battlecruiser: 2, laserL: 10 },
  fortress:      { probe: 1250, cargoS: 250, cargoL: 250, fighterL: 200, fighterH: 100,
                   cruiser: 33, battleship: 30, battlecruiser: 15, bomber: 25, destroyer: 5,
                   recycler: 250, colony: 250, missileLauncher: 200, laserS: 200, laserL: 100,
                   gauss: 50, ion: 100, plasma: 50 },
  recycler:      { probe: 5 },
  colony:        { probe: 5 }
};

/* --- Phòng thủ: hai lớp (mặt đất / quỹ đạo) — đặc trưng bản gốc -------- */
G.DEFENSES = [
  { id: 'missileLauncher', ten: 'Bệ Phóng Tên Lửa', lop: 'dat', cost: { metal: 2000 },
    atk: 80, shield: 20, hull: 2000, req: { b: { shipyard: 1 } },
    mota: 'Rẻ nhất, dùng làm bia đỡ đạn cho các khẩu pháo đắt tiền phía sau.' },
  { id: 'laserS', ten: 'Pháo Laser Nhỏ', lop: 'dat', cost: { metal: 1500, crystal: 500 },
    atk: 100, shield: 25, hull: 2000, req: { b: { shipyard: 2 }, r: { laser: 3, energy: 1 } },
    mota: 'Tháp laser tiêu chuẩn, hiệu quả trên mỗi đồng bỏ ra rất tốt.' },
  { id: 'laserL', ten: 'Pháo Laser Lớn', lop: 'dat', cost: { metal: 6000, crystal: 2000 },
    atk: 250, shield: 100, hull: 8000, req: { b: { shipyard: 4 }, r: { laser: 6, energy: 3 } },
    mota: 'Bản phóng đại của pháo laser nhỏ.' },
  { id: 'gauss', ten: 'Pháo Gauss', lop: 'dat', cost: { metal: 20000, crystal: 15000, deut: 2000 },
    atk: 1100, shield: 200, hull: 35000, req: { b: { shipyard: 6 }, r: { weapon: 3, energy: 6, shield: 1 } },
    mota: 'Bắn khối kim loại đi bằng từ trường. Xuyên giáp cực mạnh.' },
  { id: 'ion', ten: 'Pháo Ion', lop: 'dat', cost: { metal: 5000, crystal: 3000 },
    atk: 150, shield: 500, hull: 8000, req: { b: { shipyard: 4 }, r: { ion: 4 } },
    mota: 'Sát thương thấp nhưng khiên rất dày — cột chân địch cho pháo khác bắn.' },
  { id: 'plasma', ten: 'Pháo Plasma', lop: 'dat', cost: { metal: 50000, crystal: 50000, deut: 30000 },
    atk: 3000, shield: 300, hull: 100000, req: { b: { shipyard: 8 }, r: { plasma: 7 } },
    mota: 'Khẩu pháo mặt đất mạnh nhất. Một phát xóa sổ cả phi đội nhẹ.' },
  { id: 'satellite', ten: 'Vệ Tinh Phòng Thủ', lop: 'quydao', cost: { metal: 8000, crystal: 4000, deut: 1000 },
    atk: 300, shield: 400, hull: 12000, req: { b: { shipyard: 4 }, r: { energy: 4 } },
    mota: 'Lớp quỹ đạo: đánh chặn hạm đội trước khi chúng vào tầng khí quyển.' },
  { id: 'orbitalStation', ten: 'Trạm Phòng Không Quỹ Đạo', lop: 'quydao',
    cost: { metal: 30000, crystal: 20000, deut: 5000 },
    atk: 1200, shield: 1500, hull: 50000, req: { b: { shipyard: 7 }, r: { hyperspace: 2, shield: 5 } },
    mota: 'Pháo đài trên quỹ đạo, có người trực. Kẻ giữ cửa thật sự của hành tinh.' },
  { id: 'shieldS', ten: 'Khiên Hành Tinh Nhỏ', lop: 'quydao', max: 1, cost: { metal: 10000, crystal: 10000 },
    atk: 1, shield: 2000, hull: 20000, req: { b: { shipyard: 1 }, r: { shield: 2 } },
    mota: 'Vòm khiên bọc cả hành tinh. Chỉ dựng được một cái.' },
  { id: 'shieldL', ten: 'Khiên Hành Tinh Lớn', lop: 'quydao', max: 1, cost: { metal: 50000, crystal: 50000 },
    atk: 1, shield: 10000, hull: 100000, req: { b: { shipyard: 6 }, r: { shield: 6, hyperspace: 4 } },
    mota: 'Vòm khiên cấp hai. Cũng chỉ một cái.' }
];

G.MISSILES = [
  { id: 'interceptor', ten: 'Tên Lửa Đánh Chặn', cost: { metal: 8000, deut: 2000 }, o: 1,
    req: { b: { missileSilo: 2 } }, mota: 'Bắn hạ tên lửa liên hành tinh đang bay tới.' },
  { id: 'icbm', ten: 'Tên Lửa Liên Hành Tinh', cost: { metal: 12500, crystal: 2500, deut: 10000 }, o: 2,
    req: { b: { missileSilo: 4 }, r: { impulse: 1 } },
    mota: 'Phóng thẳng sang hành tinh khác phá phòng thủ MẶT ĐẤT mà không cần cho hạm đội bay. ' +
      'Tầm bắn = (cấp Động Cơ Xung × 5) − 1 hệ, chỉ trong cùng thiên hà. Bắn xong là mất, không thu hồi.' }
];

/* --- Nhiệm vụ hạm đội -------------------------------------------------- */
G.MISSIONS = [
  { id: 'attack',   ten: 'Tấn Công',    mota: 'Đánh hạm đội và phòng thủ của mục tiêu, cướp tối đa 50% tài nguyên.' },
  { id: 'transport',ten: 'Vận Chuyển',  mota: 'Chở tài nguyên tới hành tinh khác rồi bay về.' },
  { id: 'deploy',   ten: 'Triển Khai',  mota: 'Chuyển hạm đội và hàng sang hành tinh của mình, ở luôn.' },
  { id: 'spy',      ten: 'Do Thám',     mota: 'Gửi tàu do thám lấy báo cáo tình báo.' },
  { id: 'colonize', ten: 'Thực Dân',    mota: 'Dựng hành tinh mới ở một ô đất trống.' },
  { id: 'recycle',  ten: 'Thu Hồi',     mota: 'Vét bãi phế liệu trên quỹ đạo mục tiêu.' },
  { id: 'hold',     ten: 'Giữ Chỗ',     mota: 'Đậu ở hành tinh đồng minh/của mình một khoảng thời gian rồi về.' },
  { id: 'thamhiem', ten: 'Thám Hiểm',   mota: 'Bay ra vùng không gian sâu (ô 16) tìm vận may — hoặc tìm thấy thứ không nên gặp.' }
];

/* --- Hằng số cân bằng [SUY LUẬN] --------------------------------------- */
G.C = {
  TOC_DO_SERVER: 8,          // nhân tốc độ sản xuất/xây dựng (kiểu "server x8")
  TOC_DO_BAY: 2,             // nhân tốc độ bay của hạm đội
  CHU_KY_BAO_TRI: 6 * 3600,  // 6 GIỜ — nhịp bảo trì hành tinh của bản gốc
  SO_THIEN_HA: 9,
  SO_HE: 499,
  SO_HANH_TINH: 15,
  O_THAM_HIEM: 16,           // ô ảo ngoài rìa hệ, chỉ dùng cho nhiệm vụ Thám Hiểm
  KHO_KHOI_DIEM: 20000,
  BAO_VE_MOI_DIEM: 5000,     // dưới mốc điểm này được bảo vệ người chơi mới
  BAO_VE_MOI_TY_LE: 5,       // không đánh được đối thủ lệch nhau quá 5 lần điểm
  PHE_LIEU: 0.3,             // 30% xác tàu thành phế liệu
  SUA_CONG_SU: 0.7,          // 70% công sự bị phá được dựng lại sau trận
  SAT_THUONG_ICBM: 14000,    // sát thương một quả Tên Lửa Liên Hành Tinh
  TOC_TEN_LUA: 26,           // giây bay cho mỗi hệ (chưa chia tốc độ máy chủ)
  CUOP_TOI_DA: 0.5,
  DOI_MUC_TIEU_GALANA: 250,  // phí đổi mục tiêu giữa đường (đặc trưng bản gốc)
  VONG_DANH: 6,
  THUE_CO_BAN: 8,            // Galana/giờ mỗi cấp công trình dân sự
  TY_GIA: { metal: 45, crystal: 30, deut: 12, food: 60 },  // 1 Galana đổi được bao nhiêu
  HE_SO_MUA: 2.5             // giá mua đắt gấp mấy lần giá bán
};

/* --- Tra cứu nhanh ----------------------------------------------------- */
G.byId = function (arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; };
G.B = function (id) { return G.byId(G.BUILDINGS, id); };
G.R = function (id) { return G.byId(G.RESEARCH, id); };
G.S = function (id) { return G.byId(G.SHIPS, id); };
G.D = function (id) { return G.byId(G.DEFENSES, id); };
G.M = function (id) { return G.byId(G.MISSILES, id); };
G.UNIT = function (id) { return G.S(id) || G.D(id); };
