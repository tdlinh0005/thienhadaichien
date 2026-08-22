# Nghiên cứu: Thiên Hà Đại Chiến (2004 – ~2013)

Tài liệu này ghi lại những gì tìm được về game gốc, và những chỗ nào trong bản
phục dựng là **suy luận / thiết kế bù** vì tư liệu đã mất.

## 1. Danh tính game

| Hạng mục | Thông tin |
|---|---|
| Tên | **Thiên Hà Đại Chiến** (tên tiếng Anh xuất hiện trong tư liệu: *Galaxy Alert*, *Galactic Wars*) |
| Tác giả | **Trần Châu Quốc Bình**, cùng nhóm 3 thành viên (đại diện: Quốc Bình, Lê Vũ) |
| Bắt đầu phát triển | Khoảng **2004** |
| Giải thưởng | Một trong 6 giải **VietGames 2006** (VINASA) – hạng mục kịch bản game xuất sắc |
| Thể loại | Webgame chiến thuật thời gian thực, bối cảnh chiến tranh vũ trụ (text-based) |
| Phiên bản vận hành | **1.33f** – thuần text |
| Bản đồ họa | Dự kiến ra mắt **tháng 10/2010** (giao diện tương tác, đa ngôn ngữ Anh/Việt) |
| Website | `thienhadaichien.com` (đã ngừng hoạt động) |
| Mô hình | Miễn phí giờ chơi (F2P) |
| CCU | **300–500** người chơi cùng lúc, giữ vững dù không hề quảng cáo (chỉ truyền miệng) |
| Tên nội bộ | `galactic-wars` (thấy trong đường dẫn thật của game) |
| Ghi chú | Nhóm dev tự bỏ tiền để tiếp tục dự án – "người Việt làm game Việt". Buổi gặp báo chí ngày 07/10/2010 tại trụ sở công ty ITD |

Gameplay được cộng đồng thời đó mô tả là **rất giống OGame**, nhưng có một số cơ
chế riêng khá đặc trưng (xem mục 3).

## 2. Bối cảnh

Năm **2184**. Loài người đã đi thực dân hóa các hành tinh xa trong dải Ngân Hà,
đồng thời phải chống lại các sinh vật ngoài hành tinh hung dữ. Người chơi vào vai
người chỉ huy một hành tinh thuộc địa: khai thác tài nguyên, xây dựng công trình,
nghiên cứu công nghệ, đóng hạm đội, đánh nhau với người chơi khác và với quái vũ trụ.

## 3. Cơ chế được xác nhận từ tư liệu

Những điểm này lấy trực tiếp từ mô tả của người chơi/báo game thời đó:

1. **Tài nguyên nhiều hơn OGame.** Ngoài Kim Loại (Metal), Tinh Thể (Crystal),
   Deuterium, game còn có:
   - **Lương Thực** (Food) – nuôi dân số / thủy thủ đoàn.
   - **Galana** – đơn vị tiền tệ dùng cho giao dịch.
   - **Công Nghệ** – tài nguyên "ẩn", có được thông qua nghiên cứu.
   - (Có tư liệu khác gọi tài nguyên là "Lục Thạch" và "Dầu Khí" — có thể là tên
     ở một phiên bản/bản dịch khác của game.)
2. **Hệ thống bảo trì hành tinh theo chu kỳ 6 giờ thực.** Người chơi phải quan tâm
   hành tinh mỗi 6 tiếng; đây là nhịp đập chính của game.
3. **Chế độ nghiên cứu độc đáo**: tiền đầu tư cho nghiên cứu bị **trừ dần trong
   các chu kỳ bảo trì**, chứ không trả một lần.
4. **Phòng thủ hành tinh hai lớp**: phần **quỹ đạo** và phần **mặt đất** tách biệt.
5. **Hạm đội di chuyển tự do**: có thể triển khai đi bất cứ đâu trong thiên hà và
   **đổi mục tiêu ngay khi đang bay** — điểm khác biệt lớn nhất so với OGame.
6. **Liên minh** có hệ thống điều hành/quản trị.
7. **Tình báo và phản tình báo** (do thám, chống do thám).
8. **Nhiều máy chủ liên thông**, **bảo vệ người chơi mới**, và thiết kế
   "ưu tiên số lượng thay vì thăng cấp" (không có level nhân vật).

## 3b. Tư liệu tìm được đợt hai (quan trọng nhất)

Nguồn: thread **"Thiên Hà Đại Chiến – game online xây dựng hành tinh"** trên diễn đàn
GVN, do người chơi *Nazgul* mở, kèm bài **tường thuật trận "Start War III"** ngày
16–17/10/2006 đánh vào hành tinh MIMI. Đây là tư liệu chi tiết nhất còn sót lại về
game gốc: nó ghi tên đơn vị, quy mô quân số, và diễn biến một trận đánh thật.

### Địa chỉ thật của game

```
http://www.thienhadaichien.com:8080/galactic-wars/wars?document=main
http://www.thienhadaichien.com:8082/galactic-wars/wars?document=main
```

Tên nội bộ của game là **galactic-wars** — khớp với tên tiếng Anh *Galactic Wars*.

### Bối cảnh chính xác

Bối cảnh là **nhiều năm sau sự kiện "Thông Điệp Akabrac" năm 2184** — thời kỳ loài
người tiến tới nền văn minh liên ngân hà. (Trước đây tư liệu chỉ cho biết mốc 2184;
nay biết 2184 là năm xảy ra *Thông Điệp Akabrac*, còn game diễn ra sau đó.)

### 5 loại hành tinh (nguyên văn)

| Loại | Mô tả trong tư liệu |
|---|---|
| **Ôn hoà** | "hành tinh hoàn hảo với các điều kiện như Trái Đất" |
| **Rừng già** | "những hành tinh cổ với tuổi vài tỉ năm với không một sự phát triển văn minh nào, chỉ có rừng cây và muông thú" |
| **Nước – Đầm lầy** | "90% bề mặt là biển… không phải là loại hành tinh dễ dàng kiến thiết nhưng nó lại là hành tinh **không dễ tấn công** và **có rất nhiều nhiên liệu**" |
| **Sa mạc** | "tương đối gần Mặt Trời, với sức nóng khủng khiếp… **nghèo nàn về sự sống** nhưng lại có **nguồn tài nguyên phong phú và dễ khai thác**" |
| **Băng hà** | "vị trí tương đối xa Mặt Trời, ánh sáng hạn chế, nhiệt độ khắc nghiệt hơn Nam Cực… vẫn được nhiều người chọn bởi yếu tố **phòng thủ mặt đất mạnh**" |

### Tài nguyên

"Trong game sử dụng **5 loại tài nguyên chính (bao gồm cả tiền tệ: Galana)**", bắt đầu
bằng **Kim loại**. Một người chơi khác bổ sung: "còn thiếu một loại tài nguyên khá là
quan trọng đây: **KĨ THUẬT**". Vậy tên gốc của tài nguyên ẩn nhiều khả năng là
**Kĩ Thuật** chứ không phải "Công Nghệ".

### Tên đơn vị thật (từ bảng thống kê cuối trận Start War III)

> 28.750.000 **Robot** · 5.750.000 **Tank** · 4.550.000 **Máy Bay Chiến Đấu** ·
> 1.250.000 **Máy Bay Tiêm Kích** · 750 **Tiểu Chiến Hạm** · 749.500 **Trung Chiến Hạm** ·
> 11.500 **Đại Chiến Hạm** · 70.525.000 **Hỏa Tiễn** · 2.400.000 **Boom**

Viết tắt dùng trong tường thuật: **TiCH** (Tiểu Chiến Hạm), **TCH** (Trung Chiến Hạm),
**DCH** (Đại Chiến Hạm), **MBCD** (Máy Bay Chiến Đấu), **MBTK** (Máy Bay Tiêm Kích),
**QD** (Quỹ Đạo), **BCH** (Bộ Chỉ Huy), **HT** (Hành Tinh), **LM** (Liên Minh).
Ngoài ra còn **Tàu dầu** (trong đội hình phòng thủ quỹ đạo của MIMI có "50.000 Tàu dầu")
và **tàu thăm dò / gián điệp**.

### Quy mô và cách một trận đánh diễn ra

- Đơn vị tính bằng **hàng triệu**; một "fleet" là một cánh quân, mỗi tướng điều
  **hàng chục fleet** (trận này hơn **219 fleet**).
- Đội hình một fleet đánh quỹ đạo điển hình: **"2.500 TCH + 250.000 hỏa tiễn"** —
  tỷ lệ khoảng **100 hoả tiễn cho mỗi Trung Chiến Hạm**.
- Đội hình đổ bộ: **"6.250.000 Robot, 1.250.000 Tank, 1.250.000 MBCD, 2.500 DCH"** —
  Đại Chiến Hạm là tàu chở quân đổ bộ.
- **Phải phá vỡ Quỹ Đạo trước**, rồi hạm đổ bộ mới xuống được: *"nín thở chờ đợi hạm
  đổ bộ đến nơi cách 1h sau khi quỹ đạo của MiMi thất thủ"*.
- **Mỗi nhóm công trình có quân trấn giữ riêng**: *"số quân thủ mỗi công trình vẫn còn
  rất nhiều"*; tàn quân có thể **rút hết về BCH**.
- Đổ bộ thành công thì **phá huỷ công trình**: *"Hạm đổ bộ rảnh tay tấn công xuống và
  phá hủy toàn bộ những công trình của MiMi. Cuối cùng chỉ chừa lại đúng **1.000 Nhà
  Máy Tàu Bay**"*.
- **Kết quả trận tính bằng ĐIỂM**: *"Phe tấn công bị tổn thất 5.100.000 quân. Tổng cộng
  153.000.000 điểm"* → mỗi đơn vị đáng khoảng **18–30 điểm**.
- **Nhiên liệu tính theo GIỜ BAY**: *"Thời gian đi là 24h mà nhiên liệu mang theo chỉ có
  33h"* — chở không đủ nhiên liệu thì tới nơi cũng không có đường về.

### Công trình xây theo SỐ LƯỢNG, không theo cấp

Hai nguồn độc lập cùng nói:
- GameLandVN: *"các **kiến trúc** trong game ưu tiên về **số lượng** chứ không phải
  **thăng cấp** như các webgame cùng thể loại khác"*.
- Tường thuật trận đánh: hành tinh MIMI còn *"đúng **1.000 Nhà Máy Tàu Bay**"* —
  tức công trình đếm bằng nghìn cái, không phải cấp 1–20.

Đây là khác biệt kiến trúc lớn nhất giữa bản gốc và bản phục dựng hiện tại (đang dùng
mô hình cấp bậc kiểu OGame). **Tên công trình có thật đã biết: "Nhà Máy Tàu Bay".**

### Toạ độ 4 phần

Trong tường thuật, mục tiêu ghi là **`84.4.4.7`** — bốn thành phần, không phải ba như
OGame. Chưa đủ tư liệu để biết chắc ý nghĩa từng phần (nhiều khả năng
máy chủ/thiên hà.hệ.hành tinh hoặc thiên hà.hệ.hành tinh.vệ tinh).

### Vận hành

Có **phòng chat** trong game, có **Hội Đồng Bảo An** của liên minh xử lý chuyện vi phạm
hoà ước, và bảng xếp hạng thiên hà công khai đủ để người ngoài đoán ra một chiến dịch
lớn đang chuẩn bị. Máy chủ đặt tại chỗ, có lúc "die" vì đường truyền FPT.

## 4. Những chỗ phải suy luận (không có tư liệu)

Server gốc và mọi bảng số liệu đã mất, nên bản phục dựng lấy **khung công thức
kiểu OGame** (thể loại mà game gốc mô phỏng) rồi lắp các cơ chế đặc trưng ở mục 3
lên trên:

- Tên và chỉ số cụ thể của công trình / nghiên cứu / tàu chiến / phòng thủ.
- Công thức sản lượng `base × level × 1.1^level`, giá `base × factor^level`.
- Thuật toán chiến đấu 6 vòng, rapidfire, khiên hồi mỗi vòng, bãi phế liệu 30%.
- Toạ độ `[Thiên hà : Hệ : Hành tinh]` với 9 × 499 × 15.
- Chi tiết cân bằng của bảo trì, Galana, Công Nghệ.

Tất cả những chỗ này được đánh dấu trong code bằng comment `// [SUY LUẬN]`.

## 5. Nguồn

- Diễn đàn GVN – thread người chơi + tường thuật trận Start War III (16–17/10/2006):
  https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/
- GameLandVN – "Thiên Hà Đại Chiến sắp ra mắt phiên bản chính thức":
  https://gamelandvn.com/thien-ha-dai-chien-sap-ra-mat-phien-ban-chinh-thuc/
- Diễn đàn GVN – "Thiên Hà Đại Chiến – game online xây dựng hành tinh":
  https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/
- Diễn Đàn Tin Học – "Game Thiên hà đại chiến & OGame":
  https://www.ddth.com/archive/index.php/t-93346.html
- Tinh Tế – "Hướng dẫn chơi Galaxy Alert (Thiên Hà Đại Chiến)":
  https://tinhte.vn/thread/huong-dan-choi-galaxy-alert-thien-ha-dai-chien.2188188/
