# Nghiên cứu: Thiên Hà Đại Chiến (phát triển từ 2004, còn hoạt động ít nhất tới 11/2010)

Tài liệu này ghi lại những gì tìm được về game gốc, và những chỗ nào trong bản
phục dựng là **suy luận / thiết kế bù** vì tư liệu đã mất.

- **[XÁC NHẬN]**: có câu chữ hoặc diễn biến trực tiếp trong tư liệu còn sống.
- **[TÁI DỰNG]**: quyết định của bản phục dựng để lấp khoảng trống; không được
  đọc ngược thành luật của game gốc. Các hằng số cân bằng cũng thuộc nhãn này.

Độ tin cậy được xét riêng với nhãn: snapshot trên host chính thức là **cao** cho
URL/thời điểm tồn tại; bài báo ghi “Theo ITD” là **trung bình–cao**; lời người
chơi đương thời trên GVN là **trung bình** dù có thể rất chi tiết. “Xác nhận” ở
đây nghĩa là tư liệu thực sự nói điều đó, không có nghĩa mọi nguồn đều chính thức.

## 1. Danh tính game

| Hạng mục | Thông tin |
|---|---|
| Tên | **Thiên Hà Đại Chiến**; một thread năm 2006 gọi ngắn bản tiếng Anh là *Wars* |
| Tác giả | **Trần Châu Quốc Bình**, cùng nhóm 3 thành viên (đại diện: Quốc Bình, Lê Vũ) |
| Bắt đầu phát triển | Khoảng **2004** |
| Giải thưởng | Một trong 6 giải **VietGames 2006** (VINASA) – hạng mục kịch bản game xuất sắc |
| Thể loại | Webgame chiến thuật thời gian thực, bối cảnh chiến tranh vũ trụ (text-based) |
| Phiên bản có tư liệu | **1.33f** thuần text; **1.34** ra mắt 10/10/2010; **1.35b** đầu 11/2010 |
| Bản đồ họa | 1.34 có giao diện tương tác; 1.35b có Việt/Anh và giao diện chọn được như “3D Blue” |
| Website | `thienhadaichien.com` (đã ngừng hoạt động) |
| Mô hình | Miễn phí giờ chơi (F2P) |
| CCU | **300–500** người chơi cùng lúc, giữ vững dù không hề quảng cáo (chỉ truyền miệng) |
| Đường dẫn nội bộ | `galactic-wars` xuất hiện trong URL; đây không phải bằng chứng về tên hiển thị tiếng Anh |
| Ghi chú | Nhóm dev tự bỏ tiền để tiếp tục dự án – "người Việt làm game Việt". Buổi gặp báo chí ngày 07/10/2010 tại trụ sở công ty ITD |

Gameplay được cộng đồng thời đó mô tả là **rất giống OGame**, nhưng có một số cơ
chế riêng khá đặc trưng (xem mục 3).

## 2. Bối cảnh

Game diễn ra **nhiều năm sau sự kiện Thông Điệp Akabrac năm 2184**, khi loài người đã
đi thực dân hóa các hành tinh xa trong dải Ngân Hà và chống lại các sinh vật ngoài
hành tinh. Người chơi vào vai người chỉ huy một hành tinh thuộc địa: khai thác,
xây dựng, nghiên cứu, đóng hạm đội và đánh nhau.

## 3. Cơ chế được xác nhận từ tư liệu

Những điểm này lấy trực tiếp từ mô tả của người chơi/báo game thời đó:

1. **Tài nguyên nhiều hơn OGame.** Nguồn “Theo ITD” gọi năm tài nguyên chính là
   **Kim Loại, Thạch Anh, Nhiên Liệu (deuterium), Thực Phẩm/Thức Ăn và Galana**.
   **Kỹ Thuật** là tài nguyên "ẩn" thứ sáu, có được qua nghiên cứu.
2. **Hệ thống bảo trì hành tinh theo chu kỳ 6 giờ thực.** Người chơi phải quan tâm
   hành tinh mỗi 6 tiếng; đây là nhịp đập chính của game.
3. **Chế độ nghiên cứu độc đáo**: tiền đầu tư cho nghiên cứu bị **trừ dần trong
   các chu kỳ bảo trì**, chứ không trả một lần.
4. **Phòng thủ hành tinh hai lớp**: phần **quỹ đạo** và phần **mặt đất** tách biệt;
   phải triệt phá quỹ đạo rồi mới đánh các mục tiêu dưới mặt đất.
5. **Hạm đội di chuyển tự do**: có thể **đổi mục tiêu khi đang bay**, kể cả đang
   trên đường đi lẫn đường về — điểm khác biệt lớn nhất so với OGame.
6. **Liên minh và chiến tranh**: phải tuyên chiến trước, chờ **24 giờ** mới được
   đánh; chỉ thành viên cùng liên minh mới được chuyển tiền và phòng thủ cho nhau.
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

`galactic-wars` là **đường dẫn nội bộ** của ứng dụng. Không có đủ bằng chứng để biến
nó thành tên tiếng Anh chính thức của game.

Wayback còn giữ được một [snapshot diễn đàn chính thức ngày 03/01/2007](https://web.archive.org/web/20070103163641id_/http://www.thienhadaichien.com:8080/galactic-wars/forum?document=main&rnd=2007010205310112642)
trên đúng host, cổng `8080` và context `/galactic-wars/`; đây là chứng cứ gần
nguồn gốc hơn cho hạ tầng/đường dẫn, nhưng snapshot không khôi phục đủ bảng luật.

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
bằng **Kim Loại**. Nguồn ITD chi tiết hoá bốn loại còn lại là **Thạch Anh, Nhiên Liệu,
Thực Phẩm và Galana**; người chơi bổ sung tài nguyên ẩn **Kỹ Thuật**.

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
- **[XÁC NHẬN] Phải phá vỡ Quỹ Đạo trước**, rồi hạm đổ bộ mới xuống được: bản
  tường thuật ghi hạm đổ bộ chờ tới sau khi quỹ đạo MIMI thất thủ.
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

Đây từng là khác biệt kiến trúc lớn nhất của bản phục dựng. State v6 giữ marker
`so-luong-v1` và dùng `p.b[id]` theo số lượng; **tên công trình có thật đã biết:
"Nhà Máy Tàu Bay"**.
Phép đổi save cấp cũ sang số lượng và mọi đường giá/sản lượng vẫn là **[TÁI DỰNG]**.

Các bài trao đổi sau đó còn cho vài **neo định lượng**, nhưng đều là phát biểu của
người chơi nên chỉ có độ tin cậy trung bình, không đủ để suy ra công thức:

| Nguồn cộng đồng | Dữ kiện còn đọc được | Cách dùng |
|---|---|---|
| [GVN trang 3](https://f.gvn.co/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/page-3) | **2.000 mỏ mỗi loại**, **2.000 nhà máy sản xuất**, “Kĩ thuật nhà xưởng 17+”; mẫu khác ghi **2.500 mỏ Kim Loại** cho **17 tỷ/ngày** ở “KT khai mỏ 28”; **1 triệu MBCD** cần 10 tỷ Kim Loại + 5 tỷ Thạch Anh + 10 tỷ Galana | **[XÁC NHẬN — trung bình]** rằng số mỏ/nhà máy và kỹ thuật cùng tham gia năng lực kinh tế; **không xác nhận** quan hệ tuyến tính hay đường giá |
| [GVN trang 5](https://f.gvn.co/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/page-5) | Ước tính **1.000 nhà máy**, Kĩ thuật nhà xưởng 20, sản xuất khoảng **10.000 Máy Bay Tàng Hình/ngày** | **[XÁC NHẬN — trung bình]** một neo công suất do người chơi ước lượng, không phải bảng số chính thức |
| [GVN trang 19](https://f.gvn.co/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/page-19) và [trang 20](https://f.gvn.co/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/page-20) | Ví dụ **2.000 quân thủ/công trình**, dân số và thuế; các tên như Thành Phố, Nông Trại, Trường Kỹ Thuật, nhà máy và kho | **[XÁC NHẬN — trung bình]** mô hình có dân số/thuế và công trình theo số lượng; chưa đủ bảng chi phí/sản lượng |

Cách viết trong tư liệu không hoàn toàn thống nhất: bài giới thiệu dùng **“kỹ thuật
khai thác mỏ”**, còn trao đổi trang 3 viết tắt **“KT khai mỏ”**; **“Kĩ thuật nhà
xưởng”** xuất hiện ở cả phần mô tả và trao đổi. Bản phục dựng không nên tự chọn
một biến thể tên rồi coi đó là bằng chứng về công thức.

Tư liệu cũng dùng cả **“Nhà Máy Tàu Bay”** (báo cáo phá công trình Start War III)
và **“nhà máy sản xuất”** (trao đổi về công suất). Chưa đủ bằng chứng để kết luận
đó là cùng một loại công trình hay hai loại riêng; ánh xạ chúng vào Xưởng Đóng
Tàu/công suất sản xuất trong code vẫn là **[TÁI DỰNG]**.

### Kinh tế, dân số và thời gian hành quân

Các con số sau nằm trong [bài giới thiệu của người chơi Nazgul năm 2006](https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/),
không phải dump server hay manual chính thức; vì vậy chúng là **[XÁC NHẬN — trung
bình]** về phiên bản người đó chơi, không phải bảng công thức hoàn chỉnh. Bài
[GameLand ghi nguồn “Theo ITD”](https://gamelandvn.com/thien-ha-dai-chien-con-duong-tro-thanh-thong-tuong/)
xác nhận gần nguồn gốc hơn về khung tài nguyên/kinh tế, nhưng cũng không công bố
schema hay công thức đầy đủ:

- Bảo trì diễn ra mỗi **6 giờ thực**. Thiếu bảo trì có chuỗi hậu quả được mô tả
  từ nghiên cứu thất bại, dân bỏ đi tới cơ sở vật chất xuống cấp, nhưng không có
  ngưỡng hoặc tốc độ giảm cụ thể.
- Vốn nghiên cứu được rút vào từng kỳ bảo trì; thời gian một kỹ thuật ít nhất
  **12 giờ**. Thiếu vốn ở kỳ rút khiến nghiên cứu thất bại và mất thêm **6 giờ**;
  nguồn không nói rõ hoàn tiền bao nhiêu.
- Thực Phẩm chi phối dân số; nguồn nói **250.000 nhân viên nhà nước** là phần dân
  cơ bản không bỏ đi. Các bài [trang 19](https://f.gvn.co/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/page-19)
  và [trang 20](https://f.gvn.co/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/page-20)
  có ví dụ dân số/thuế/độ ủng hộ, nhưng chưa đủ để phục hồi hàm tăng dân hay
  quan hệ thuế→ủng hộ.
- Ngân hàng cho gửi tiền lấy lãi khoảng **2%/ngày**; còn có khoản đầu tư vào Siêu
  Thị Thiên Hà không rút giữa kỳ. Chữ “khoảng” trong chính nguồn khiến 2% chỉ là
  neo, không phải hằng số chắc chắn cho mọi phiên bản.
- Siêu thị chỉ có hàng do người chơi bán vào, dùng giá gốc và thuế **10%**; Thị
  Trường Tự Do là giao dịch trực tiếp người chơi, thuế **5%**; hàng mua tới hành
  tinh sau **6 giờ**. Tư liệu còn kể một khủng hoảng nhiên liệu vì siêu thị hết
  tiền, xác nhận thị trường không phải bộ đổi tài nguyên vô hạn.
- Thời gian bay được nêu theo bậc: cùng hệ mặt trời **6 giờ**, cùng vùng **12 giờ**,
  cùng thiên hà **24 giờ**, khác thiên hà **36 giờ**. Nguồn không còn định nghĩa
  ranh giới “vùng” hay mọi ngoại lệ tốc độ, nên bản phục dựng chưa thể dùng bốn
  mốc này như một hàm khoảng cách hoàn chỉnh.

### Chiến tranh, liên minh và chuyển tài sản

- **[XÁC NHẬN]** [bài giới thiệu GVN năm 2006](https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/)
  nói không được tấn công trước khi đặt lệnh chiến tranh và Hội Đồng Bảo An chỉ
  cho phép sau **24 giờ**. Tường thuật Start War III trong cùng thread ghi các
  liên minh tuyên chiến với chỉ huy MeoMeo và việc chậm tuyên làm quân đổ bộ bị
  vướng thời hạn 24 giờ.
- **[TÁI DỰNG]** Schema hiện tại diễn giải phần tư liệu còn thiếu như sau: khi ở
  liên minh, chỉ **chủ liên minh** đặt một lệnh `liên minh → tài khoản mục tiêu`
  và thành viên hiện tại dùng chung quyền đó; người chơi lẻ đặt lệnh
  `tài khoản → tài khoản`. Việc quyền tự đổi theo trạng thái gia nhập/rời liên
  minh, trạng thái đình chỉ và toàn bộ lifecycle chưa có nguồn gốc đủ rõ.
- **[XÁC NHẬN]** Cũng tại bài giới thiệu trên, chỉ thành viên cùng liên minh mới
  được **chuyển tiền** cho nhau. Vì Galana được nguồn gọi rõ là tiền tệ, chuyển
  Galana nội bộ là phục dựng trực tiếp từ dữ kiện này.
- **[TÁI DỰNG]** Giới hạn nhiệm vụ **Vận Chuyển tài nguyên vật chất** cho đồng
  minh là suy rộng để chống bơm tài nguyên; nguồn chỉ nói chuyển *tiền*, không
  khẳng định mọi loại hàng đều bị cùng một ràng buộc.

### Đổi hướng và hai lớp phòng thủ

- **[XÁC NHẬN]** [bài giới thiệu GVN](https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/)
  nêu cả hai khả năng: hạm đội đang đi A→B có thể chuyển sang C, và hạm đội đang
  trên đường về có thể quay lại đánh mục tiêu khác. Cùng nguồn nói hạm có thể
  đậu ở bất kỳ quỹ đạo; gặp lực lượng địch thì đánh, có thể chia đội, chọn căn cứ
  trở về, cùng đồng minh phòng thủ và phải tiếp nhiên liệu định kỳ, nếu không sẽ
  trở thành “rác không gian”.
- **[TÁI DỰNG]** Bản hiện tại có vị trí đậu thật, gọi về và phòng thủ theo từng
  nhóm chủ sở hữu, nhưng chỉ cho đậu tại hành tinh mình/đồng minh và luôn trở về
  nơi xuất phát `f.tu`. Chưa có đậu thù địch/trung lập, va chạm giữa các hạm đang
  đậu, tách một hạm hay chọn căn cứ trở về.
- **[TÁI DỰNG]** Nhịp trả trước **6 giờ**, định mức `2% × tổng fuel cơ bản/giờ`,
  cách làm tròn từng đoạn, không hoàn phần đã trả khi gọi về, và thứ tự xử lý
  hết hạn/thiếu nhiên liệu/tổn thất là quy tắc vận hành mới. Thiếu một đoạn sau
  khi đã đậu xoá toàn bộ fleet còn lại nhưng chỉ cộng 30% giá trị đóng bằng Kim
  Loại/Thạch Anh vào bãi phế liệu; nguồn không xác nhận các con số hay thứ tự này.
- **[TÁI DỰNG]** Bản hiện tại cho đổi mục tiêu ở cả lượt đi/về, nhưng mức phí
  nền **250 Galana**, cách quy thiếu nhiên liệu thành Galana, nội suy vị trí và
  tính lại thời gian bay đều là công thức cân bằng mới.
- **[XÁC NHẬN]** Tư liệu mô tả hai lớp và Start War III cho thấy phải làm chủ
  quỹ đạo trước khi hạm đổ bộ xuống hành tinh.
- **[TÁI DỰNG]** Quy định lớp mặt đất bắt đầu tham chiến cụ thể từ **vòng 3**
  (`G.VONG_XUONG_DAT = 3`) là lựa chọn cân bằng của bản phục dựng; nguồn không
  cho con số vòng này.

### Toạ độ 4 phần

Trong tường thuật, mục tiêu ghi là **`84.4.4.7`** — bốn thành phần, không phải ba như
OGame. Chưa đủ tư liệu để biết chắc ý nghĩa từng phần (nhiều khả năng
máy chủ/thiên hà.hệ.hành tinh hoặc thiên hà.hệ.hành tinh.vệ tinh).

### Vận hành

Có **kênh chat giữa người chơi** (nguồn ITD xác nhận), có **Hội Đồng Bảo An Thiên Hà**
xử lý vi phạm hiệp ước giữa các liên minh, và bảng xếp hạng công khai đủ để người ngoài
đoán ra một chiến dịch lớn đang chuẩn bị. Tư liệu Start War III cũng nhắc các chỉ huy vào một
“room chat”. Chưa tìm được nguồn tách riêng kênh chat liên minh; phần đó trong bản phục
dựng là thiết kế bù. Máy chủ gốc có lúc gián đoạn vì đường truyền FPT.

## 4. Những chỗ phải suy luận (không có tư liệu)

Server gốc và mọi bảng số liệu đã mất, nên bản phục dựng lấy **khung công thức
kiểu OGame** (thể loại mà game gốc mô phỏng) rồi lắp các cơ chế đặc trưng ở mục 3
lên trên:

- Tên và chỉ số cụ thể của công trình / nghiên cứu / tàu chiến / phòng thủ.
- Giá mỗi công trình mới, sản lượng tuyến tính theo số lượng, hệ số Kỹ Thuật Khai
  Thác Mỏ/Kỹ Thuật Nhà Xưởng và phép quy đổi level cũ theo vốn lũy kế.
- Thuật toán chiến đấu 6 vòng, rapidfire, khiên hồi mỗi vòng, bãi phế liệu 30%.
- Toạ độ `[Thiên hà : Hệ : Hành tinh]` với 9 × 499 × 15.
- Chi tiết cân bằng của bảo trì, Galana, Kỹ Thuật.
- Giá/sức chứa Thành Phố; tốc độ tăng–rời dân, biến động ủng hộ, thuế theo đầu
  người, hệ số dân sự theo loại hành tinh và ngưỡng suy thoái 1/2/3 kỳ.

Những chỗ này được đánh dấu trong code bằng comment `[SUY LUẬN]` hoặc
`[TÁI DỰNG]` tuỳ lớp code.

## 5. Đối chiếu với bản phục dựng hiện tại

| Hạng mục có nguồn | Hiện trạng |
|---|---|
| Công trình tính theo **số lượng**, có thể tới hàng nghìn | **Khớp mô hình dữ liệu:** state v6 giữ `p.b[id]` là số lượng và xây theo lô. **[TÁI DỰNG]** Migration v3→v4→v5→v6 bảo toàn vốn lũy kế; giá lô tuyến tính và các hệ số sản lượng được neo theo vài mẫu người chơi, không phải bảng gốc. |
| 5 tài nguyên chính + Kỹ Thuật ẩn | **Khớp tên và vai trò rộng:** id save cũ vẫn giữ nguyên để tương thích. Công thức là suy luận. |
| Bảo trì 6 giờ; nghiên cứu/dân/cơ sở vật chất chịu hậu quả | **Khớp khung:** state v6 có một clock đế quốc, nghiên cứu trả vector tài nguyên nguyên khối ở checkpoint, dân số/ủng hộ/thuế, sàn 250.000 và xuống cấp theo số lượng. **[TÁI DỰNG]** Hoá đơn all-or-nothing, các hệ số và ngưỡng miss 1/2/3; migration giữ pha clock và không áp mất mát hồi tố. |
| Ngân hàng, siêu thị do người chơi nhập hàng, chợ tự do có thuế/giao chậm | **Chưa có:** Chợ Thiên Hà hiện là bộ đổi vô hạn theo tỷ giá cố định. |
| Hạm đội đổi hướng cả lượt đi/về, tách đội, đỗ mọi quỹ đạo, gặp địch, chọn căn cứ về, tiếp nhiên liệu | **Một phần:** đã đổi mục tiêu hai chiều, đỗ tại hành tinh mình/đồng minh, gọi về và trả nhiên liệu quỹ đạo theo đoạn. **[TÁI DỰNG]** phí đổi hướng, nhịp/mức nhiên liệu và hậu quả thiếu kỳ; luôn về nơi xuất phát, chưa có tách hạm, đỗ thù địch/trung lập, va chạm hạm đậu, chọn căn cứ về hay trạm tiếp nhiên liệu giữa đường. |
| Phòng thủ quỹ đạo + mặt đất, Robot/Tank đổ bộ | **Khớp lõi:** **[XÁC NHẬN]** quỹ đạo phải thất thủ trước khi xuống đất; **[TÁI DỰNG]** bắt đầu mặt đất ở vòng 3, tỷ lệ phá công trình và cân bằng cụ thể. |
| Tình báo/phản tình báo | **Một phần:** có do thám nhiều mức, đánh chặn, và báo cáo đủ cấp thấy dân số/ủng hộ/thuế; chưa có lương gián điệp hay phản bội. Ngưỡng lộ chỉ số dân sự là **[TÁI DỰNG]**. |
| Liên minh, tuyên chiến 24 giờ, chuyển tiền nội bộ | **Một phần:** đã có đơn/duyệt/loại/chuyển chủ, lệnh chiến chờ 24 giờ, chuyển Galana và hạm đóng quân phòng thủ đồng minh. Mô hình chủ-LM→người, người lẻ→người, lifecycle và thứ tự chia tổn thất nhóm là **[TÁI DỰNG]**; chưa có ba chính thể hay hiệp ước. |
| Chat giữa người chơi | **Có:** chat chung được phục dựng; kênh riêng liên minh là thiết kế bù chưa có nguồn độc lập. |
| Nhiều máy chủ liên thông, giao diện Việt/Anh | **Chưa có:** server hiện là một tiến trình/một SQLite và giao diện chỉ tiếng Việt. |
| Toạ độ bốn phần như `84.4.4.7` | **Chưa khớp:** hiện dùng ba phần; không đoán phần thứ tư khi chưa biết ý nghĩa. |
| Giao diện ảnh 1.34/1.35b và theme “3D Blue” | **Chưa khớp:** giao diện hiện tại là CSS tối gợi không khí webgame, không tái tạo screenshot gốc. |

Các phần như NPC tất định, vũ trụ 9×499×15, trận 6 vòng, ô thám hiểm 16, rapidfire,
bãi phế liệu 30%, cổng không gian và máy tính trận đánh là nội dung phục dựng/OGame-derived,
không được trình bày như dữ kiện riêng của Thiên Hà Đại Chiến gốc.

## 6. Nguồn đúng về webgame ITD

- VnExpress – giải VietGames 2006, tác giả Trần Châu Quốc Bình:
  https://vnexpress.net/thoi-loan-game-viet-nam-hay-nhat-nam-2006-1531187.html
- Thanh Niên – khởi đầu game online “made in VN” từ VietGames 2006:
  https://thanhnien.vn/tu-cuoc-thi-vietgames-2006-khoi-dau-cua-game-online-made-in-vn-185208133.htm
- GameLandVN / Theo ITD – lối chơi, tài nguyên, kinh tế và chiến thuật:
  https://gamelandvn.com/thien-ha-dai-chien-con-duong-tro-thanh-thong-tuong/
- GameLandVN – 1.33f, nhóm phát triển, chat và kế hoạch bản chính thức:
  https://gamelandvn.com/thien-ha-dai-chien-sap-ra-mat-phien-ban-chinh-thuc/
- GameLandVN – giao diện 1.34 ra mắt 10/10/2010:
  https://gamelandvn.com/webgame-thien-ha-dai-chien-cong-bo-giao-dien-moi/
- GameLandVN – 1.35b, Việt/Anh và máy chủ quốc tế:
  https://gamelandvn.com/co-hoi-nhan-tien-mien-phi-tu-thien-ha-dai-chien/
- Diễn đàn GVN – thread người chơi + tường thuật trận Start War III (16–17/10/2006):
  https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/
- Wayback – snapshot diễn đàn chính thức trên `thienhadaichien.com:8080` (03/01/2007):
  https://web.archive.org/web/20070103163641id_/http://www.thienhadaichien.com:8080/galactic-wars/forum?document=main&rnd=2007010205310112642
- Diễn đàn GVN tháng 5/2006 – game text dự VietGames, nhãn tiếng Anh “Wars”:
  https://f.gvn.co/threads/thien-ha-dai-chien-game-text-tham-du-vg.192749/
- Diễn Đàn Tin Học – "Game Thiên hà đại chiến & OGame":
  https://www.ddth.com/archive/index.php/t-93346.html

## 7. Nguồn đã loại vì là game cùng tên khác

**Galaxy Alert** là game Android của DivMob công bố năm 2013, không phải webgame ITD
phát triển từ 2004. Bài hướng dẫn Tinh Tế có package `com.divmob.galaxyalert*`, lối chơi
tower-defense và tài nguyên Lục Thạch/Dầu Khí; vì vậy không được dùng làm bằng chứng ở trên.

- GameLandVN – thông báo sản phẩm mới của DivMob năm 2013:
  https://gamelandvn.com/game-moi-cua-divmob-la-thien-ha-dai-chien/
- Bài hướng dẫn Galaxy Alert đã bị loại khỏi tập nguồn:
  https://tinhte.vn/thread/huong-dan-choi-galaxy-alert-thien-ha-dai-chien.2188188/
