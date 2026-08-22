# Thiên Hà Đại Chiến — bản phục dựng

Phục dựng lại **Thiên Hà Đại Chiến**, webgame chiến thuật vũ trụ do **Trần Châu Quốc Bình**
và nhóm 3 thành viên người Việt phát triển từ khoảng **2004**, đoạt giải **VietGames 2006**
(VINASA) và vận hành tại `thienhadaichien.com` cho tới đầu thập niên 2010 — nay đã đóng cửa.

Bản gốc là game **thuần text** (phiên bản 1.33f), lối chơi rất gần OGame nhưng có một số cơ
chế riêng khá đặc biệt. Bản phục dựng này giữ đúng những cơ chế đó, chạy hoàn toàn trong
trình duyệt, không cần server.

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

Kiểm thử phần lõi (không cần trình duyệt):

```bash
node tools/smoke.js          # 56 kiểm tra: sản xuất, bảo trì, chiến đấu, hạm đội, tua offline
```

Đóng gói thành **một file HTML duy nhất** để gửi đi hoặc up lên đâu cũng chạy:

```bash
node tools/build.js          # -> dist/thien-ha-dai-chien.html
```

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
| **Tình báo & phản tình báo** | Tàu do thám mang về báo cáo; Trung Tâm Tình Báo của đối phương có thể bắn hạ chúng. Độ chi tiết báo cáo phụ thuộc chênh lệch cấp Công Nghệ Tình Báo |
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

## Cấu trúc mã nguồn

```
index.html            khung trang, nạp 7 file script
css/style.css         giao diện nhại webgame Việt 2009–2013
js/data.js            bảng dữ liệu: công trình, nghiên cứu, tàu, phòng thủ, hằng số cân bằng
js/util.js            định dạng số/thời gian, PRNG tất định, toạ độ, khoảng cách
js/galaxy.js          sinh vũ trụ & NPC tất định từ hạt giống, bảng xếp hạng
js/combat.js          bộ mô phỏng trận đánh 6 vòng, bắn nhanh, phòng thủ hai lớp
js/engine.js          state, sản lượng, hàng đợi, chi phí, điểm
js/fleet.js           hạm đội, nhiệm vụ, chu kỳ bảo trì, dòng thời gian (tua offline)
js/ui.js              12 màn giao diện
js/main.js            khởi động, lưu/nạp, xử lý thao tác
tools/smoke.js        kiểm thử lõi bằng Node
tools/build.js        gộp thành một file HTML duy nhất
docs/NGHIEN-CUU.md    tư liệu về game gốc + phần nào là suy luận
```

Không dùng framework, không phụ thuộc bên ngoài. Bàn chơi lưu trong `localStorage`
(xuất/nạp được ra file JSON ở màn *Nhật Ký & Lưu*).

## Ghi công

Nguyên tác **Thiên Hà Đại Chiến** thuộc về **Trần Châu Quốc Bình** và nhóm phát triển.
Đây là bản phục dựng phi thương mại dựng lại từ tư liệu báo game và diễn đàn còn sót lại;
mọi con số cân bằng là suy luận, không phải dữ liệu gốc.
