# Thiên Hà Đại Chiến — bản phục dựng

Phục dựng lại **Thiên Hà Đại Chiến**, webgame chiến thuật vũ trụ do **Trần Châu Quốc Bình**
và nhóm 3 thành viên người Việt phát triển từ khoảng **2004**, đoạt giải **VietGames 2006**
(VINASA) và vận hành tại `thienhadaichien.com` cho tới đầu thập niên 2010 — nay đã đóng cửa.

Bản gốc là game **thuần text** (phiên bản 1.33f), lối chơi rất gần OGame nhưng có một số cơ
chế riêng khá đặc biệt. Bản phục dựng này giữ đúng những cơ chế đó, và có hai cách chơi:

- **Một người** — chạy hoàn toàn trong trình duyệt, không cần server, không cần mạng.
- **Nhiều người** — máy chủ Node + SQLite: mỗi người một tài khoản, vũ trụ dùng chung,
  đánh nhau giữa các tài khoản là thật (xem mục [Chơi nhiều người](#chơi-nhiều-người)).

> Toàn bộ tư liệu tìm được, chỗ nào là sự thật và chỗ nào là suy luận: xem
> [`docs/NGHIEN-CUU.md`](docs/NGHIEN-CUU.md).

## Chạy game

Không cần build, không cần cài gì:

```bash
# cách 1: mở trực tiếp
xdg-open index.html          # hoặc mở file index.html bằng trình duyệt

# cách 2: chạy qua http (khuyến nghị)
npx http-server . -p 8080    # rồi vào http://localhost:8080
```

Đóng gói thành **một file HTML duy nhất** để gửi đi hoặc up lên đâu cũng chạy:

```bash
node tools/build.js          # -> dist/thien-ha-dai-chien.html
npm run build                # + dist/artifact.html (bản nhúng)
```

## Chơi nhiều người

Ngoài bản một người chạy hẳn trong trình duyệt, repo còn có một **máy chủ nhiều
người chơi** viết bằng Node thuần (`node:http` + `node:sqlite`, không cài gói nào):

```bash
node server/index.js                       # hoặc: npm start  ->  http://localhost:8080
PORT=3000 THDC_DB=/var/lib/thdc/thdc.db node server/index.js
```

Cần **Node 22 trở lên** (vì `node:sqlite`, nên lúc chạy có một dòng
`ExperimentalWarning` — bình thường, không phải lỗi).

- **Tài khoản riêng**: đăng ký tên đăng nhập + mật khẩu (băm scrypt kèm muối),
  nhận ngay một hành tinh ở một chỗ còn trống trong vũ trụ chung.
- **Database SQLite**: toàn bộ đế quốc nằm trong một file `.db`. Đế quốc chạy
  24/7 trên máy chủ — thoát ra thì mỏ vẫn đào, chu kỳ bảo trì vẫn trừ tiền, hạm
  đội vẫn bay tới đích.
- **PvP thật**: hành tinh màu cam trên bản đồ là người chơi khác. Đánh nhau là
  thật — tài nguyên bị cướp khỏi kho của họ, phòng thủ của họ vỡ thật, cả hai bên
  đều nhận báo cáo chiến đấu, và trận đánh hiện lên *Bảng Tin Vũ Trụ*. Họ cũng
  đánh lại được. Do thám, phản tình báo, liên minh và bảng xếp hạng đều là dữ liệu
  thật của server.

| | bản một người | bản nhiều người |
|---|---|---|
| Vào ở | `index.html` (hoặc `/motnguoi`) | `http://localhost:8080/` |
| Cần server | không | có (`node server/index.js`) |
| Lưu ở | `localStorage` của trình duyệt | SQLite trên máy chủ |
| Bên quyết định | chính trình duyệt | **máy chủ** — client chỉ vẽ và gửi yêu cầu |
| Đối thủ | NPC sinh tất định từ hạt giống | người chơi thật + NPC dùng chung |
| Thời gian khi thoát | tua bù lúc mở lại | chạy liên tục trên máy chủ |
| Bảng xếp hạng, liên minh | sinh từ hạt giống | dữ liệu thật của server |

Chi tiết kiến trúc, schema database, bảng API, luồng PvP, bảo mật và vận hành:
[`docs/MAY-CHU.md`](docs/MAY-CHU.md).

## Kiểm thử

Bốn bộ kiểm thử, không cần cài gì (bộ giao diện cần Chromium của Playwright):

```bash
node tools/smoke.js          # 56 kiểm tra — phần luật: sản xuất, điện, lương thực, bảo trì,
                             #   nghiên cứu trả góp, đóng tàu, phòng thủ 2 lớp, do thám,
                             #   tấn công & cướp, đổi mục tiêu giữa đường, thực dân hoá,
                             #   NPC đánh lại, tua offline 30 ngày, lưu/nạp JSON
node tools/test-server.js    # 91 kiểm tra — máy chủ qua HTTP thật với nhiều tài khoản:
                             #   đăng ký/đăng nhập/đổi mật khẩu, băm mật khẩu, chặn dữ liệu
                             #   rác, sản xuất khi vắng mặt, do thám PvP, đánh nhau PvP
                             #   (thắng & hoà), cướp tài nguyên thật, tiếp tế đồng minh,
                             #   bảo vệ người chơi mới, liên minh, xếp hạng, bảng tin,
                             #   và dữ liệu còn nguyên sau khi khởi động lại server
node tools/test-tai.js 60    # 51 kiểm tra — tải: 60 đế quốc, tua 24 giờ toàn server,
                             #   60 trận PvP đồng thời, chống đệ quy, dung lượng database
node tools/test-mp-ui.mjs    # 90 kiểm tra — giao diện bản nhiều người trên Chromium thật:
                             #   2 tài khoản độc lập, đủ 13 màn, thao tác thật, thấy nhau
                             #   trên bản đồ, liên minh, và layout điện thoại
```

`npm test` chạy hai bộ đầu.

## Bối cảnh

Năm **2184**. Loài người đã toả ra thực dân hoá các hành tinh xa, vừa tranh giành lẫn nhau
vừa chống lại các thế lực ngoài hành tinh. Bạn là chỉ huy một hành tinh thuộc địa ở vùng
biên Ngân Hà: khai thác, xây dựng, nghiên cứu, đóng hạm đội, và đánh nhau.

## Những cơ chế lấy từ bản gốc

Đây là phần làm Thiên Hà Đại Chiến khác OGame, và cũng là phần bản phục dựng bám sát nhất:

| Cơ chế | Trong game |
|---|---|
| **6 tài nguyên** | Kim Loại, Tinh Thể, Deuterium, **Lương Thực**, **Galana** (tiền tệ), **Công Nghệ** (tài nguyên ẩn) |
| **Chu kỳ bảo trì 6 giờ** | Cứ 6 giờ thực, đế quốc bị trừ phí bảo trì bằng Galana. Không trả nổi → nợ: sản lượng −30%, hạm đội bị niêm phong không tấn công được |
| **Nghiên cứu trả góp** | Mỗi đề tài có **vốn đầu tư** bị trừ dần qua từng chu kỳ bảo trì. Hết Galana giữa kỳ là đề tài **bị treo** |
| **Phòng thủ hai lớp** | Lớp **quỹ đạo** giao chiến từ vòng 1; hạm đội địch chỉ xuống tầng khí quyển và đụng lớp **mặt đất** từ vòng 3 |
| **Đổi mục tiêu giữa đường** | Hạm đội đang bay có thể **đổi mục tiêu ngay trên đường**: trả Galana + nhiên liệu phụ trội, thời gian bay tính lại từ vị trí hiện tại |
| **Tình báo & phản tình báo** | Tàu do thám mang về báo cáo; Trung Tâm Tình Báo của đối phương có thể bắn hạ chúng. Độ chi tiết báo cáo phụ thuộc chênh lệch cấp Công Nghệ Tình Báo. Bị đánh thì được báo động trước kèm đồng hồ, nhưng không thấy đội hình địch — còn nhiệm vụ do thám thì đi lén |
| **Liên minh** | Gia nhập liên minh để nhận +5% sản lượng và danh nghĩa trên bảng xếp hạng |
| **Bảo vệ người chơi mới** | Dưới 5.000 điểm thì không bị NPC đánh, và cũng không đánh được đối thủ mạnh hơn 5 lần |
| **Không có level nhân vật** | Sức mạnh = số lượng công trình, nghiên cứu và tàu — đúng như thiết kế "ưu tiên số lượng thay vì thăng cấp" của bản gốc |

## Nội dung

- **19 công trình**: 4 mỏ, 2 nguồn điện, 4 kho, xưởng đóng tàu, phòng nghiên cứu, nhà máy
  robot/nano, trung tâm tình báo, đài chỉ huy hạm đội, trung tâm bảo trì, hầm tên lửa,
  cải tạo hành tinh, cổng không gian.
- **15 đề tài nghiên cứu**: vũ khí/khiên/giáp, 3 dòng động cơ, laser–ion–plasma, tình báo,
  máy tính, liên hành tinh, trọng trường.
- **13 loại tàu**: từ Phi Thuyền Nhẹ tới **Pháo Đài Di Động** (9 triệu vỏ thép), kèm tàu vận
  tải, do thám, thu hồi, thực dân.
- **10 công trình phòng thủ** chia hai lớp + 2 loại tên lửa.
- **7 nhiệm vụ hạm đội**: Tấn Công, Vận Chuyển, Triển Khai, Do Thám, Thực Dân, Thu Hồi, Giữ Chỗ.
- **Vũ trụ 9 × 499 × 15** hành tinh, sinh tất định từ hạt giống — cùng hạt giống thì bản đồ
  luôn giống nhau. Các đế quốc NPC có tên, liên minh, điểm, hạm đội và phòng thủ riêng;
  hành tinh **bỏ hoang** ít phòng thủ nhưng nhiều tài nguyên (nông trại kinh điển của thể loại).
- **Bãi phế liệu**: 30% xác tàu bị bắn hạ đọng lại trên quỹ đạo, vét bằng Tàu Thu Hồi.
- **Chợ Thiên Hà**: quy đổi tài nguyên ↔ Galana khi cần tiền trả bảo trì.
- **Màn Hướng Dẫn ngay trong game**: 6 bước mở đầu, bốn cơ chế đặc trưng, cách trận
  đánh diễn ra, hệ toạ độ — mọi con số đọc trực tiếp từ bảng luật nên không lệch.

## Mẹo cho người mới

1. Bốn công trình đầu tiên: **Mỏ Kim Loại, Mỏ Tinh Thể, Nhà Máy Điện Mặt Trời, Trang Trại
   Sinh Quyển**. Thiếu điện thì mỏ chạy cầm chừng; hết Lương Thực thì hành tinh bị bỏ đói,
   sản lượng còn một nửa và hạm đội không xuất kích được.
2. **Luôn để dư Galana** trước mốc bảo trì. Xem đồng hồ "Bảo trì sau" ở thanh trên.
   Bí tiền thì ra Chợ Thiên Hà bán Kim Loại.
3. **Do thám trước khi đánh.** Phòng thủ mặt đất của NPC thường nặng hơn vẻ ngoài, và nó
   chỉ lộ ra từ vòng 3 của trận đánh.
4. Đánh **hành tinh bỏ hoang** để có vốn — cùng số điểm nhưng ít phòng thủ hơn nhiều.
5. Thấy báo động hạm đội địch mà không đỡ được thì **cho hạm đội bay đi**: hạm đội đang bay
   không bao giờ bị bắn hạ.
6. Thời gian vẫn chạy khi bạn tắt game. Mở lại, engine tua lại toàn bộ sản xuất, chuyến bay
   và các chu kỳ bảo trì đã diễn ra.
7. *(bản nhiều người)* Đừng lao vào đánh người chơi có nhiều **Pháo Plasma** — trên mỗi đồng
   bỏ ra, phòng thủ mặt đất bền hơn hạm đội rất nhiều, đánh vào là lỗ. Hạm đội để dành đi
   cướp mục tiêu giàu mà phòng thủ mỏng. Muốn an toàn thì tự dựng plasma và một lớp quỹ đạo.
8. *(bản nhiều người)* Vào liên minh rồi dùng nhiệm vụ **Tiếp tế** để chi viện tài nguyên cho
   đồng minh — hàng bên nhận không chứa nổi sẽ được mang về, không mất.

## Cấu trúc mã nguồn

```
index.html            khung trang bản MỘT NGƯỜI, nạp 10 file script
css/style.css         giao diện nhại webgame Việt 2009–2013

js/                   BỘ LUẬT DÙNG CHUNG — chạy cả trên trình duyệt lẫn trên server
  data.js             bảng dữ liệu: công trình, nghiên cứu, tàu, phòng thủ, hằng số cân bằng
  util.js             định dạng số/thời gian, PRNG tất định, toạ độ, khoảng cách
  galaxy.js           sinh vũ trụ & NPC tất định từ hạt giống, bảng xếp hạng, móc nối G.HOOK
  combat.js           bộ mô phỏng trận đánh 6 vòng, bắn nhanh, phòng thủ hai lớp
  engine.js           state, sản lượng, hàng đợi, chi phí, điểm
  fleet.js            hạm đội, nhiệm vụ, chu kỳ bảo trì, dòng thời gian (tua offline)
  actions.js          bảng hành động — NƠI DUY NHẤT thao tác của người chơi được thực thi
  ui.js               các màn giao diện
  app.js              tầng thao tác giao diện, dùng chung cho cả hai bản
  main.js             driver bản MỘT NGƯỜI: state trong localStorage, chạy tại chỗ

server/               MÁY CHỦ NHIỀU NGƯỜI (Node thuần, không gói ngoài)
  index.js            HTTP, phục vụ file tĩnh, scheduler, tắt máy êm
  api.js              các đường dẫn /api/*, xác thực scrypt, giới hạn tần suất
  world.js            thế giới dùng chung: nạp/lưu đế quốc, tua thời gian, PvP thật
  db.js               schema SQLite + câu truy vấn
  rules.js            nạp js/*.js vào tiến trình Node

web/                  CLIENT BẢN NHIỀU NGƯỜI
  index.html          màn đăng nhập/đăng ký + khung game
  js/mp.js            driver: gọi API, đồng bộ, màn Bảng Tin Vũ Trụ & Tài Khoản

tools/
  smoke.js            kiểm thử lõi bằng Node
  test-server.js      kiểm thử máy chủ: tài khoản, database, PvP giữa hai account
  test-tai.js         kiểm thử tải: nhiều đế quốc, PvP chéo đồng thời
  test-mp-ui.mjs      kiểm thử giao diện bản nhiều người bằng trình duyệt thật
  build.js            gộp bản một người thành một file HTML duy nhất

package.json          các lệnh npm (start / test / build), không có dependency nào
docs/NGHIEN-CUU.md    tư liệu về game gốc + phần nào là suy luận
docs/MAY-CHU.md       tài liệu kỹ thuật máy chủ nhiều người
```

Không dùng framework, không phụ thuộc bên ngoài. Bản một người lưu bàn chơi trong
`localStorage` (xuất/nạp được ra file JSON ở màn *Nhật Ký & Lưu*); bản nhiều người
lưu trên máy chủ sau mỗi thao tác.

## Ghi công

Nguyên tác **Thiên Hà Đại Chiến** thuộc về **Trần Châu Quốc Bình** và nhóm phát triển.
Đây là bản phục dựng phi thương mại dựng lại từ tư liệu báo game và diễn đàn còn sót lại;
mọi con số cân bằng là suy luận, không phải dữ liệu gốc.
