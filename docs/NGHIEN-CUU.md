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
| Ghi chú | Nhóm dev tự bỏ tiền để tiếp tục dự án – "người Việt làm game Việt" |

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

- GameLandVN – "Thiên Hà Đại Chiến sắp ra mắt phiên bản chính thức":
  https://gamelandvn.com/thien-ha-dai-chien-sap-ra-mat-phien-ban-chinh-thuc/
- Diễn đàn GVN – "Thiên Hà Đại Chiến – game online xây dựng hành tinh":
  https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/
- Diễn Đàn Tin Học – "Game Thiên hà đại chiến & OGame":
  https://www.ddth.com/archive/index.php/t-93346.html
- Tinh Tế – "Hướng dẫn chơi Galaxy Alert (Thiên Hà Đại Chiến)":
  https://tinhte.vn/thread/huong-dan-choi-galaxy-alert-thien-ha-dai-chien.2188188/
