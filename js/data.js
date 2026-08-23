/* =========================================================================
 * THIÊN HÀ ĐẠI CHIẾN — Bảng dữ liệu game
 * -------------------------------------------------------------------------
 * Tên tài nguyên, chu kỳ bảo trì 6h, nghiên cứu trả góp, phòng thủ 2 lớp,
 * hạm đội đổi mục tiêu giữa đường  => lấy từ tư liệu về game gốc.
 * Toàn bộ CON SỐ cân bằng là [SUY LUẬN] theo khung OGame (xem docs/NGHIEN-CUU.md)
 * ========================================================================= */
'use strict';

var G = window.G = window.G || {};

G.VERSION = '1.35b-r2';          // state v6: nhịp dân sự + hạm đội giữ quỹ đạo thật
G.NAM_AKABRAC = 2184;
G.BOI_CANH = 'Nhiều năm sau Thông Điệp Akabrac năm 2184';

/* --- Tài nguyên ------------------------------------------------------- */
G.RES = [
  { id: 'metal',   ten: 'Kim Loại',   ky: 'KL', mau: '#c9a06a' },
  { id: 'crystal', ten: 'Thạch Anh',  ky: 'TA', mau: '#7fd4f5' },
  { id: 'deut',    ten: 'Nhiên Liệu', ky: 'NL', mau: '#9be59b' },
  { id: 'food',    ten: 'Thực Phẩm',  ky: 'TP', mau: '#e5c76b' },
  { id: 'galana',  ten: 'Galana',     ky: 'GL', mau: '#f0b3ff' },
  { id: 'tech',    ten: 'Kỹ Thuật',   ky: 'KT', mau: '#8fa8ff' }
];
G.RES_HANH_TINH = ['metal', 'crystal', 'deut', 'food'];  // chứa ở kho hành tinh
G.RES_DE_QUOC   = ['galana', 'tech'];                    // chung toàn đế quốc

/* --- 5 loại hành tinh (tư liệu gốc: thread GVN của người chơi Nazgul) ----
 * Chiều lợi/hại bám mô tả gốc; độ lớn HỆ SỐ là [TÁI DỰNG] bảo thủ. */
G.LOAI_HT = [
  { id: 'onhoa', ten: 'Ôn Hoà', mau: '#7fe0a0',
    mota: 'Hành tinh hoàn hảo với các điều kiện như Trái Đất. Không mạnh mặt nào nhưng cũng không yếu mặt nào.',
    oDat: 1.00, kl: 1.00, tt: 1.00, dt: 1.00, lt: 1.15, dien: 1.00, thuDat: 1.00,
    dan: 1.00, ungHoBp: 0, temp: [20, 60] },
  { id: 'runggia', ten: 'Rừng Già', mau: '#8fd14f',
    mota: 'Hành tinh cổ vài tỉ năm, không một nền văn minh nào, chỉ có rừng cây và muông thú. Thực Phẩm dồi dào, đất rộng.',
    oDat: 1.12, kl: 0.90, tt: 0.95, dt: 0.90, lt: 1.55, dien: 0.95, thuDat: 1.00,
    dan: 1.15, ungHoBp: 500, temp: [10, 45] },
  { id: 'nuoc', ten: 'Nước – Đầm Lầy', mau: '#57c8ff',
    mota: '90% bề mặt là biển, còn lại là đầm lầy. Khó kiến thiết (ít ô đất) nhưng KHÓ TẤN CÔNG và rất nhiều nhiên liệu.',
    oDat: 0.75, kl: 0.85, tt: 0.90, dt: 1.60, lt: 1.10, dien: 0.90, thuDat: 1.25,
    dan: 1.08, ungHoBp: 0, temp: [5, 40] },
  { id: 'samac', ten: 'Sa Mạc', mau: '#ffb45e',
    mota: 'Gần Mặt Trời, giàu Kim Loại và quang năng; Thạch Anh, Nhiên Liệu và sự sống đều khó khăn.',
    oDat: 1.00, kl: 1.35, tt: 0.80, dt: 0.70, lt: 0.55, dien: 1.35, thuDat: 0.90,
    dan: 0.82, ungHoBp: -500, temp: [80, 140] },
  { id: 'banghai', ten: 'Băng Hà', mau: '#bcd9ff',
    mota: 'Xa Mặt Trời, ánh sáng hạn chế, khắc nghiệt hơn Nam Cực; giàu Thạch Anh và PHÒNG THỦ MẶT ĐẤT MẠNH.',
    oDat: 0.90, kl: 0.90, tt: 1.45, dt: 0.90, lt: 0.70, dien: 0.60, thuDat: 1.50,
    dan: 0.90, ungHoBp: -200, temp: [-130, -40] }
];
G.LHT = function (id) { return G.byId(G.LOAI_HT, id) || G.LOAI_HT[0]; };

/* --- Công trình -------------------------------------------------------- */
/* Từ state v4, b[id] và tham số n dưới đây là SỐ LƯỢNG công trình.
 * factor chỉ còn dùng để quy đổi vốn lũy kế từ save cũ và tính mốc
 * tương thích; giá lô mới luôn tuyến tính theo n.                    */
G.BUILDINGS = [
  { id: 'metalMine', ten: 'Mỏ Kim Loại', nhom: 'kt',
    mota: 'Máy khoan tự động bóc lớp vỏ hành tinh để lấy kim loại thô — nền tảng của mọi công trình.',
    cost: { metal: 60, crystal: 15 }, factor: 1.5,
    prod: function (n, c) { return { metal: 30 * n * G.hsKhaiMo(c.tech) }; },
    use: function (n) { return 10 * n; } },

  { id: 'crystalMine', ten: 'Mỏ Thạch Anh', nhom: 'kt',
    mota: 'Hầm khai thác Thạch Anh — vật liệu bắt buộc cho mạch điện tử và vũ khí năng lượng.',
    cost: { metal: 48, crystal: 24 }, factor: 1.6,
    prod: function (n, c) { return { crystal: 20 * n * G.hsKhaiMo(c.tech) }; },
    use: function (n) { return 10 * n; } },

  { id: 'deutSyn', ten: 'Giàn Lọc Nhiên Liệu', nhom: 'kt',
    mota: 'Lọc nước nặng từ khí quyển thành Nhiên Liệu cho hạm đội và lò nhiệt hạch.',
    cost: { metal: 225, crystal: 75 }, factor: 1.5,
    prod: function (n, c) { return { deut: 10 * n * G.hsKhaiMo(c.tech) * (1.28 - 0.002 * c.temp) }; },
    use: function (n) { return 20 * n; } },

  { id: 'farm', ten: 'Trang Trại Sinh Quyển', nhom: 'kt',
    mota: 'Vòm sinh quyển tạo thực phẩm nuôi dân cư và thủy thủ đoàn. Hết Thực Phẩm là hành tinh đói.',
    cost: { metal: 80, crystal: 40 }, factor: 1.55,
    prod: function (n) { return { food: 26 * n }; },
    use: function (n) { return 8 * n; } },

  /* [TÁI DỰNG] Tư liệu người chơi xác nhận Thành Phố, dân số và thuế,
   * nhưng không còn bảng giá/sức chứa. `housing` là metadata để engine dân
   * sự không phải nhận diện công trình bằng tên hiển thị. */
  { id: 'city', ten: 'Thành Phố', nhom: 'ds',
    mota: 'Khu dân cư có bệnh viện, trường học và cơ quan thuế. Mỗi Thành Phố mở thêm chỗ ở cho 25.000 dân.',
    cost: { metal: 1200, crystal: 600, food: 400 }, factor: 1.6,
    housing: 25000, use: function (n) { return 4 * n; } },

  { id: 'solar', ten: 'Nhà Máy Điện Mặt Trời', nhom: 'nl',
    mota: 'Cánh đồng pin quang điện. Không có điện thì mỏ chỉ chạy cầm chừng.',
    cost: { metal: 75, crystal: 30 }, factor: 1.5,
    prod: function (n) { return { energy: 20 * n }; } },

  { id: 'fusion', ten: 'Lò Phản Ứng Nhiệt Hạch', nhom: 'nl',
    mota: 'Đốt Nhiên Liệu để lấy điện. Đắt, ngốn tài nguyên, nhưng là nguồn điện mạnh nhất.',
    cost: { metal: 900, crystal: 360, deut: 180 }, factor: 1.8,
    prod: function (n, c) { return { energy: 30 * n * (1 + 0.05 * (c.tech.energy || 0)) }; },
    deutUse: function (n) { return 10 * n; } },

  { id: 'metalStore', ten: 'Kho Kim Loại', nhom: 'kho',
    mota: 'Kho vượt quá dung tích thì tài nguyên tràn ra ngoài và mất trắng.',
    cost: { metal: 1000 }, factor: 2,
    cap: function (n) { return 10000 + 6000 * n; } },

  { id: 'crystalStore', ten: 'Kho Thạch Anh', nhom: 'kho',
    mota: 'Nhà chứa Thạch Anh có kiểm soát độ ẩm.',
    cost: { metal: 1000, crystal: 500 }, factor: 2,
    cap: function (n) { return 10000 + 6000 * n; } },

  { id: 'deutStore', ten: 'Bồn Nhiên Liệu', nhom: 'kho',
    mota: 'Bồn áp lực chứa nước nặng đã tinh chế.',
    cost: { metal: 1000, crystal: 1000 }, factor: 2,
    cap: function (n) { return 10000 + 6000 * n; } },

  { id: 'silo', ten: 'Kho Thực Phẩm', nhom: 'kho',
    mota: 'Vựa chứa Thực Phẩm có làm lạnh.',
    cost: { metal: 800, crystal: 200 }, factor: 2,
    cap: function (n) { return 10000 + 6000 * n; } },

  { id: 'robot', ten: 'Nhà Máy Robot', nhom: 'cn',
    mota: 'Mỗi nhà máy tăng công suất xây dựng công trình.',
    cost: { metal: 400, crystal: 120, deut: 200 }, factor: 2 },

  { id: 'nanite', ten: 'Nhà Máy Nano', nhom: 'cn', req: { b: { robot: 10 }, r: { computer: 10 } },
    mota: 'Bầy robot nano lắp ghép ở cấp phân tử. Giảm mạnh mọi thời gian sản xuất.',
    cost: { metal: 1000000, crystal: 500000, deut: 100000 }, factor: 2 },

  { id: 'shipyard', ten: 'Xưởng Đóng Tàu', nhom: 'cn', req: { b: { robot: 2 } },
    mota: 'Ụ tàu trên quỹ đạo. Không có xưởng thì không có hạm đội.',
    cost: { metal: 400, crystal: 200, deut: 100 }, factor: 2 },

  { id: 'lab', ten: 'Phòng Nghiên Cứu', nhom: 'cn',
    mota: 'Tạo ra Kỹ Thuật — tài nguyên ẩn của đế quốc — và cho phép nghiên cứu.',
    cost: { metal: 200, crystal: 400, deut: 200 }, factor: 2,
    prod: function (n) { return { tech: 4 * n }; },
    use: function (n) { return 6 * n; } },

  { id: 'intel', ten: 'Trung Tâm Tình Báo', nhom: 'cn', req: { b: { lab: 4 } },
    mota: 'Vừa phân tích báo cáo do thám, vừa phản tình báo — mỗi trung tâm tăng xác suất bắn hạ tàu do thám địch.',
    cost: { metal: 5000, crystal: 8000, deut: 2000 }, factor: 1.9 },

  { id: 'fleetHQ', ten: 'Đài Chỉ Huy Hạm Đội', nhom: 'cn', req: { b: { shipyard: 4 } },
    mota: 'Mỗi đài mở thêm một khe điều phối hạm đội cùng lúc.',
    cost: { metal: 20000, crystal: 20000, deut: 1000 }, factor: 2 },

  { id: 'maintDepot', ten: 'Trung Tâm Bảo Trì', nhom: 'cn',
    mota: 'Giảm 6% chi phí Galana mỗi chu kỳ bảo trì (tối đa 60%). Cứu cánh khi hạm đội phình to.',
    cost: { metal: 10000, crystal: 6000, deut: 2000 }, factor: 1.8 },

  { id: 'missileSilo', ten: 'Hầm Tên Lửa', nhom: 'cn', req: { b: { shipyard: 1 } },
    mota: 'Mỗi hầm chứa 10 điểm tên lửa (tên lửa liên hành tinh chiếm 2).',
    cost: { metal: 20000, crystal: 20000, deut: 1000 }, factor: 2 },

  { id: 'terraform', ten: 'Cải Tạo Hành Tinh', nhom: 'cn', req: { r: { energy: 12 } },
    mota: 'Nắn lại địa hình để lấy thêm khu xây dựng (+6 khu mỗi công trình).',
    cost: { metal: 0, crystal: 50000, deut: 100000 }, factor: 2 },

  { id: 'jumpGate', ten: 'Cổng Không Gian', nhom: 'cn', req: { r: { hyperspace: 7 } },
    mota: 'Dịch chuyển hạm đội tức thời giữa hai hành tinh cùng có cổng (hồi 60 phút).',
    cost: { metal: 2000000, crystal: 4000000, deut: 200000 }, factor: 2 }
];

/* --- Nghiên cứu -------------------------------------------------------- */
/* Đặc trưng bản gốc: tổng nguyên liệu nghiên cứu được rút DẦN qua từng
 * chu kỳ 6 giờ, không khấu trừ toàn bộ ngay khi xếp đề tài.               */
G.RESEARCH = [
  { id: 'mining', ten: 'Kỹ Thuật Khai Thác Mỏ', cost: { metal: 600, crystal: 200 }, factor: 2,
    mota: 'KT-KTM tăng sản lượng trên mỗi mỏ. Hệ số cụ thể là [TÁI DỰNG] neo theo mốc người chơi.', req: { b: { lab: 1 } } },
  { id: 'workshop', ten: 'Kỹ Thuật Nhà Xưởng', cost: { metal: 800, crystal: 400, deut: 200 }, factor: 2,
    mota: 'KT-NX tăng công suất của Nhà Máy Sản Xuất. Hệ số cụ thể là [TÁI DỰNG].', req: { b: { lab: 1, shipyard: 1 } } },
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
    atk: 5, shield: 25, hull: 12000, speed: 7500, cargo: 25000, fuel: 50, crew: 8, choLinh: 300, dc: 'combustion',
    req: { b: { shipyard: 4 }, r: { combustion: 6 } },
    mota: 'Khoang hàng gấp năm lần tàu nhỏ mà vẫn bay nhanh hơn.' },
  { id: 'fighterL', ten: 'Máy Bay Chiến Đấu', cost: { metal: 3000, crystal: 1000 },
    atk: 50, shield: 10, hull: 4000, speed: 12500, cargo: 50, fuel: 20, crew: 2, dc: 'combustion',
    req: { b: { shipyard: 1 }, r: { combustion: 1 } },
    mota: 'MBCD — xương sống của mọi hạm đội quỹ đạo trong bản gốc, đếm bằng hàng triệu chiếc. Rẻ, nhanh, chết cũng nhanh.' },
  { id: 'fighterH', ten: 'Máy Bay Tiêm Kích', cost: { metal: 6000, crystal: 4000 },
    atk: 150, shield: 25, hull: 10000, speed: 10000, cargo: 100, fuel: 75, crew: 4, dc: 'impulse',
    req: { b: { shipyard: 3 }, r: { armor: 2, impulse: 2 } },
    mota: 'MBTK — bản nặng của Máy Bay Chiến Đấu, mặc thêm giáp và gắn laser.' },
  { id: 'cruiser', ten: 'Tiểu Chiến Hạm', cost: { metal: 20000, crystal: 7000, deut: 2000 },
    atk: 400, shield: 50, hull: 27000, speed: 15000, cargo: 800, fuel: 300, crew: 12, dc: 'impulse',
    req: { b: { shipyard: 5 }, r: { impulse: 4, ion: 2 } },
    mota: 'TiCH — chiến hạm hạng nhẹ. Nghiền máy bay và bệ tên lửa.' },
  { id: 'battleship', ten: 'Trung Chiến Hạm', cost: { metal: 45000, crystal: 15000 },
    atk: 1000, shield: 200, hull: 60000, speed: 10000, cargo: 1500, fuel: 500, crew: 30, dc: 'hyperdrive',
    req: { b: { shipyard: 7 }, r: { hyperdrive: 4 } },
    mota: 'TCH — chủ lực đánh quỹ đạo trong bản gốc, các tướng điều hàng chục fleet mỗi fleet vài nghìn chiếc.' },
  { id: 'battlecruiser', ten: 'Khu Trục Hạm', cost: { metal: 30000, crystal: 40000, deut: 15000 },
    atk: 700, shield: 400, hull: 70000, speed: 10000, cargo: 750, fuel: 250, crew: 25, dc: 'hyperdrive',
    req: { b: { shipyard: 8 }, r: { hyperspace: 5, hyperdrive: 5, laser: 12 } },
    mota: 'Sinh ra để xé nát hạm đội hạng nhẹ. Kém hiệu quả trước phòng thủ mặt đất.' },
  { id: 'bomber', ten: 'Boom', cost: { metal: 50000, crystal: 25000, deut: 15000 },
    atk: 1000, shield: 500, hull: 75000, speed: 4000, cargo: 500, fuel: 700, crew: 30, choLinh: 400, dc: 'impulse',
    req: { b: { shipyard: 8 }, r: { impulse: 6, plasma: 5 } },
    mota: 'Boom — chuyên trị công sự: cày phẳng pháo và khiên trên mặt đất.' },
  { id: 'destroyer', ten: 'Đại Chiến Hạm', cost: { metal: 60000, crystal: 50000, deut: 15000 },
    atk: 2000, shield: 500, hull: 110000, speed: 5000, cargo: 2000, fuel: 1000, crew: 50, choLinh: 2000, dc: 'hyperdrive',
    req: { b: { shipyard: 9 }, r: { hyperdrive: 6, plasma: 5 } },
    mota: 'DCH — tàu lớn nhất còn bay được, vừa đánh vừa CHỞ QUÂN ĐỔ BỘ xuống hành tinh sau khi quỹ đạo vỡ.' },
  { id: 'fortress', ten: 'Pháo Đài Di Động', cost: { metal: 5000000, crystal: 4000000, deut: 1000000 },
    atk: 200000, shield: 50000, hull: 9000000, speed: 100, cargo: 1000000, fuel: 1, crew: 500, choLinh: 120000, dc: 'hyperdrive',
    req: { b: { shipyard: 12 }, r: { graviton: 1, hyperspace: 6, hyperdrive: 7 } },
    mota: 'Một hành tinh nhân tạo có động cơ. Bay chậm như rùa nhưng bất tử.' },
  { id: 'hoaTien', ten: 'Hoả Tiễn', cost: { metal: 400, crystal: 100 },
    atk: 12, shield: 2, hull: 500, speed: 9000, cargo: 0, fuel: 2, crew: 0, dc: 'combustion',
    req: { b: { shipyard: 1 }, r: { combustion: 1 } },
    mota: 'Đạn tự hành không người lái, bay kèm hạm đội. Trong bản gốc mỗi Trung Chiến Hạm đi kèm ' +
      'khoảng 100 quả — một trận lớn ngốn hàng chục triệu quả. Rẻ và đông, nhưng chiến hạm lớn xé nát.' },

  { id: 'tauDau', ten: 'Tàu Dầu', cost: { metal: 8000, crystal: 3000, deut: 1000 },
    atk: 2, shield: 20, hull: 14000, speed: 4500, cargo: 12000, fuel: 40, crew: 5, dc: 'combustion',
    req: { b: { shipyard: 4 }, r: { combustion: 5 } },
    mota: 'Tiếp nhiên liệu cho cả hạm đội giữa đường: mỗi chiếc bù 600 Nhiên Liệu cho chuyến bay ' +
      '(giảm tối đa 60% tiêu hao). Trong bản gốc, thiếu tàu dầu là cả đạo quân phải quay đầu.' },

  { id: 'probe', ten: 'Tàu Do Thám', cost: { crystal: 1000 },
    atk: 0, shield: 0, hull: 1000, speed: 100000, cargo: 5, fuel: 1, crew: 1, dc: 'combustion',
    req: { b: { shipyard: 3 }, r: { combustion: 3, spy: 2 } },
    mota: 'Tàu không người, bay cực nhanh, chỉ để nhìn rồi báo về.' },
  { id: 'recycler', ten: 'Tàu Thu Hồi', cost: { metal: 10000, crystal: 6000, deut: 2000 },
    atk: 1, shield: 10, hull: 16000, speed: 2000, cargo: 20000, fuel: 300, crew: 6, dc: 'combustion',
    req: { b: { shipyard: 4 }, r: { combustion: 6, shield: 2 } },
    mota: 'Hót xác tàu ở bãi phế liệu sau mỗi trận đánh. Kẻ thắng thật sự của chiến tranh.' },
  { id: 'colony', ten: 'Tàu Thực Dân', cost: { metal: 10000, crystal: 20000, deut: 10000 },
    atk: 50, shield: 100, hull: 30000, speed: 2500, cargo: 7500, fuel: 1000, crew: 20, choLinh: 200, dc: 'impulse',
    req: { b: { shipyard: 4 }, r: { impulse: 3 } },
    mota: 'Mang theo một thành phố gấp gọn. Bay tới ô đất trống và dựng hành tinh mới.' }
];

/* Rapidfire: bắn nhanh — bắn hạ mục tiêu là được bắn tiếp [SUY LUẬN theo OGame] */
G.RAPIDFIRE = {
  cargoS:        { probe: 5 },
  cargoL:        { probe: 5 },
  fighterL:      { probe: 5 },
  fighterH:      { probe: 5, cargoS: 3 },
  cruiser:       { probe: 5, fighterL: 6, missileLauncher: 10, hoaTien: 8 },
  battleship:    { probe: 5, hoaTien: 10 },
  battlecruiser: { probe: 5, cargoS: 3, cargoL: 3, fighterH: 4, cruiser: 4, battleship: 7, hoaTien: 12 },
  bomber:        { probe: 5, missileLauncher: 20, laserS: 20, laserL: 10, ion: 10, plasma: 5 },
  destroyer:     { probe: 5, battlecruiser: 2, laserL: 10, hoaTien: 15, tauDau: 3 },
  fortress:      { probe: 1250, hoaTien: 500, tauDau: 100, cargoS: 250, cargoL: 250, fighterL: 200, fighterH: 100,
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

/* --- Quân đổ bộ (tư liệu gốc: Robot, Tank do Đại Chiến Hạm chở xuống) ---
 * Chỉ đánh khi hạm đội đã làm chủ quỹ đạo. Thắng thì PHÁ CÔNG TRÌNH — đúng
 * như trận Start War III: "phá hủy toàn bộ những công trình của MiMi".     */
G.BOBINH = [
  { id: 'robot', ten: 'Robot', lop: 'bo', cost: { metal: 220, crystal: 80 },
    atk: 10, shield: 2, hull: 450, cho: 2, crew: 0,
    req: { b: { robot: 2, shipyard: 2 } },
    mota: 'Bộ binh máy, đổ bộ theo bầy hàng triệu con. Rẻ, không cần nuôi ăn, và là thứ thực sự phá công trình.' },
  { id: 'tank', ten: 'Tank', lop: 'bo', cost: { metal: 700, crystal: 240, deut: 60 },
    atk: 34, shield: 8, hull: 1900, cho: 6, crew: 1,
    req: { b: { robot: 4, shipyard: 4 }, r: { armor: 3 } },
    mota: 'Thiết giáp hạng nặng. Chiếm chỗ gấp ba Robot nhưng cày phẳng công sự mặt đất nhanh hơn hẳn.' }
];
G.BB = function (id) { return G.byId(G.BOBINH, id); };

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
  PHA_CT_TOI_DA: 0.25,       // một trận đổ bộ phá tối đa 25% tổng số lượng công trình
  SUC_PHA_MOI_TAI_NGUYEN: 0.35, // cần bao nhiêu sức đổ bộ để phá 1 tài nguyên giá trị công trình
  TAU_DAU_BU: 600,           // mỗi Tàu Dầu bù được bao nhiêu Nhiên Liệu cho chuyến bay
  TOC_TEN_LUA: 26,           // giây bay cho mỗi hệ (chưa chia tốc độ máy chủ)
  CUOP_TOI_DA: 0.5,
  CUOP_DO_BO: 0.35,          // đổ bộ thành công thì vét thêm được chừng này phần kho còn lại
  DOI_MUC_TIEU_GALANA: 250,  // phí đổi mục tiêu giữa đường (đặc trưng bản gốc)
  VONG_DANH: 6,
  THUE_CO_BAN: 8,            // chỉ dùng bridge catch-up v4; thuế v5 lấy theo dân số
  TY_GIA: { metal: 45, crystal: 30, deut: 12, food: 60 },  // 1 Galana đổi được bao nhiêu
  HE_SO_MUA: 2.5,            // giá mua đắt gấp mấy lần giá bán
  /* [TÁI DỰNG] hiệu chỉnh sao cho 2.500 Mỏ KL, KT-KTM 28 cho ra
   * 17 tỷ KL/ngày trên server x8, đúng mốc người chơi ghi lại. */
  HE_SO_KHAI_MO: 1.287411465204992,
  /* [TÁI DỰNG] KT-NX 20 xấp xỉ nhân 10 công suất mỗi nhà máy. */
  HE_SO_NHA_XUONG: 1.12
};

/* Đậu quỹ đạo có trong tư liệu gốc; nhịp tiếp nhiên liệu và mức tiêu hao cụ
 * thể không còn bảng luật nên đều là [TÁI DỰNG]. Hạm đội trả trước từng đoạn
 * từ Nhiên Liệu đang chở trong khoang, tuyệt đối không tự rút kho đồng minh. */
G.QUY_DAO_V1 = {
  marker: 'giu-quy-dao-v1',
  holdRules: 'orbit-hold-v1',
  legacyRules: 'legacy-hold-v5',
  segmentSeconds: 6 * 3600,
  fuelPerBaseHour: 0.02
};

/* Nhịp 6 giờ có nguồn; các tỷ lệ dân số/thuế/phạt bên dưới không còn bảng
 * gốc nên đều là [TÁI DỰNG] bảo thủ và được gom ở một chỗ để cân bằng/test.
 * Basis point (bp): 10.000 bp = 100%. */
G.NHIP_V1 = {
  marker: 'bao-tri-dan-su-v1',
  maintenanceRules: 'maintenance-v1',
  researchRules: 'research-installments-v1',
  cycleSeconds: G.C.CHU_KY_BAO_TRI,
  minResearchSeconds: 12 * 3600,

  populationFloor: 250000,       // mốc sàn được tư liệu người chơi xác nhận
  populationStart: 250000,
  defaultSupportBp: 7000,
  maxSupportBp: 20000,          // 140% từng xuất hiện trong tư liệu người chơi
  defaultTaxBp: 1000,
  minTaxBp: 0,
  maxTaxBp: 10000,
  baseHousing: 250000,
  cityHousing: 25000,
  foodPerPersonCycle: 0.002,
  taxGalanaPerPersonHour: 0.001,

  populationGrowthBp: 25,
  foodShortfallMaxLossBp: 500,
  maintenancePopulationLossBp: 250,
  supportRecoverBp: 100,
  supportFoodPenaltyBp: 400,
  supportMaintenancePenaltyBp: 200,
  infrastructureDecayBp: 100,

  maintenanceMilitaryPointRate: 0.015,
  maintenanceBuildingPointRate: 0.008,
  maintenanceDepotReductionBp: 600,
  maintenanceDepotMaxReductionBp: 6000,
  researchFailureMissStreak: 1,
  populationLossMissStreak: 2,
  infrastructureDecayMissStreak: 3,
  refundPolicy: 'forfeit-paid-v1',
  legacyRefundPolicy: 'legacy-full'
};

/* Các neo có nguồn để cân bằng/test không trôi về OGame. Chúng
 * không phải bảng giá đầy đủ của game gốc. */
G.MOC_LICH_SU = {
  moKimLoai: { soLuong: 2500, khaiMo: 28, sanLuongNgay: 17000000000 },
  nhaMay: { soLuong: 1000, nhaXuong: 20, mayBayTangHinhNgay: 10000 },
  mbcdMotTrieu: { soLuong: 1000000, cost: { metal: 10000000000, crystal: 5000000000, galana: 10000000000 } }
};
G.hsKhaiMo = function (tech) { return Math.pow(G.C.HE_SO_KHAI_MO, (tech && tech.mining) || 0); };
G.hsNhaXuong = function (tech) { return Math.pow(G.C.HE_SO_NHA_XUONG, (tech && tech.workshop) || 0); };

/* --- Tra cứu nhanh ----------------------------------------------------- */
G.byId = function (arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; };
G.B = function (id) { return G.byId(G.BUILDINGS, id); };
G.R = function (id) { return G.byId(G.RESEARCH, id); };
G.S = function (id) { return G.byId(G.SHIPS, id); };
G.D = function (id) { return G.byId(G.DEFENSES, id); };
G.M = function (id) { return G.byId(G.MISSILES, id); };
G.UNIT = function (id) { return G.S(id) || G.D(id) || G.BB(id); };
