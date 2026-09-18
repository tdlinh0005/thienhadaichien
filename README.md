# Thiên Hà Đại Chiến — bản phục dựng

Phục dựng lại **Thiên Hà Đại Chiến**, webgame chiến thuật vũ trụ do **Trần Châu Quốc Bình**
và nhóm 3 thành viên người Việt phát triển từ khoảng **2004**, đoạt giải **VietGames 2006**
(VINASA). Tư liệu xác nhận game còn hoạt động tại `thienhadaichien.com` đến đầu tháng
**11/2010**; website nay không còn hoạt động, nhưng chưa xác minh được ngày đóng cửa.

Bản **1.33f** được ghi nhận là game thuần text; bản đồ hoạ **1.34** và **1.35b** ra mắt sau
đó trong tháng 10–11/2010. Lối chơi gần OGame nhưng có nhiều cơ chế riêng. Bản phục dựng
này ưu tiên các cơ chế có nguồn xác nhận và ghi rõ phần nào phải thiết kế bù.

Ba con số phiên bản có vai trò riêng: SemVer phát hành lấy duy nhất từ `package.json.version`;
nhãn tư liệu hiển thị là `G.PHIEN_BAN_LICH_SU` (`1.35b-r2`); schema save dùng
`G.STATE_VERSION`. Nhãn lịch sử không quyết định migration và schema state không phải số
phiên bản phát hành.

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

Cần **Node 22.5 trở lên** (vì `node:sqlite`, nên lúc chạy có một dòng
`ExperimentalWarning` — bình thường, không phải lỗi).

> **Về scheduler.** Database **mới tinh** được tự chuyển sang durable scheduler
> ngay lúc khởi động, nên cài mới chạy được luôn, không cần thao tác gì. Tính
> năng này chỉ đụng tới database chưa có tài khoản, chưa có đế quốc và chưa có
> dấu vết durable nào; tắt bằng `THDC_TU_CUTOVER=0`.
>
> Database **đã có dữ liệu** thì vẫn phải cutover **thủ công** — đó là thao tác
> bảo trì có sao lưu trước (xem [`docs/MAY-CHU.md`](docs/MAY-CHU.md)):
>
> ```bash
> node tools/scheduler-cutover.js --db /duong-dan/thdc.db --action cutover
> ```
>
> Dấu hiệu database còn ở chế độ `legacy`: server vẫn lắng nghe và `/healthz`
> vẫn 200, nhưng `/readyz` trả `{"ready":false,"reason":"SCHEDULER_MODE_LEGACY"}`
> và **mọi `/api/*` trả 503** — nhìn từ trình duyệt là "Máy chủ đang đồng bộ,
> hãy thử lại."

- **Tài khoản riêng**: đăng ký tên đăng nhập + mật khẩu (băm scrypt kèm muối),
  nhận ngay một hành tinh ở một chỗ còn trống trong vũ trụ chung.
- **Database SQLite**: toàn bộ đế quốc nằm trong một file `.db`. Đế quốc chạy
  24/7 trên máy chủ — thoát ra thì mỏ vẫn đào, chu kỳ bảo trì vẫn trừ tiền, hạm
  đội vẫn bay tới đích.
- **PvP thật, có báo trước**: hành tinh màu cam trên bản đồ là người chơi khác.
  Muốn tấn công phải tuyên chiến và chờ Hội Đồng Bảo An **24 giờ**; server kiểm
  tra quyền lúc xuất phát/đổi hướng và kiểm tra lại khi hạm đội hoặc tên lửa tới
  nơi. Tài nguyên bị cướp khỏi kho thật, phòng thủ vỡ thật, cả hai bên nhận báo cáo
  và trận đánh hiện lên *Bảng Tin Vũ Trụ*.
- **Cộng đồng thật**: chat chung toàn vũ trụ, kênh riêng liên minh, đơn xin gia nhập,
  chủ liên minh duyệt/từ chối, loại thành viên và chuyển quyền chỉ huy.

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

Bốn bộ kiểm thử; ba bộ đầu không cần cài package, còn bộ giao diện cần Playwright
(hoặc `playwright-core`) và Chromium:

```bash
node tools/smoke.js          # luật: migration v3→v4→v5→v6, sản xuất, điện, dân số/thuế, bảo trì,
                             #   nghiên cứu cấp vốn theo kỳ, đóng tàu, phòng thủ 2 lớp, do thám,
                             #   giữ quỹ đạo/tiếp nhiên liệu, tấn công & cướp, đổi mục tiêu, thực dân,
                             #   NPC đánh lại, tua offline 30 ngày, lưu/nạp JSON
node tools/test-server.js    # máy chủ qua HTTP thật với nhiều tài khoản:
                             #   đăng ký/đăng nhập/đổi mật khẩu, băm mật khẩu, chặn dữ liệu
                             #   rác, thuế authoritative, sản xuất khi vắng mặt, do thám PvP,
                             #   đánh nhau PvP (thắng & hoà), đóng quân/phòng thủ đồng minh
                             #   theo nhóm chủ, rollback nguyên tử, cướp tài nguyên thật, tiếp tế,
                             #   bảo vệ người mới, quản trị liên minh, chat, xếp hạng, bảng tin,
                             #   và dữ liệu còn nguyên sau khi khởi động lại server
node tools/test-tai.js 60    # tải: 60 đế quốc, tua 24 giờ toàn server,
                             #   60 đợt tấn công PvP đến hạn cùng lúc, chống đệ quy,
                             #   tỷ lệ giải quyết trận và dung lượng database
node tools/test-mp-ui.mjs    # giao diện multiplayer trên Chromium thật:
                             #   3 tài khoản, hạm tới/đóng quân/gọi về/phòng thủ đồng minh,
                             #   migration local v3→v6 + save tương lai, dân số/thuế,
                             #   đủ 16 màn, liên minh, chat và mobile
```

`npm test` chạy hai bộ đầu. Playwright chỉ cần cho bộ UI; có thể đặt
`THDC_PLAYWRIGHT=/duong/dan/playwright/index.mjs` và `THDC_CHROMIUM=/duong/dan/chrome`
nếu công cụ/trình duyệt được cài ngoài vị trí mặc định.

## Bối cảnh

Game diễn ra **nhiều năm sau Thông Điệp Akabrac năm 2184**. Loài người đã toả ra thực dân
hoá các hành tinh xa, vừa tranh giành lẫn nhau vừa chống lại các thế lực ngoài hành tinh.
Bạn là chỉ huy một hành tinh thuộc địa ở vùng biên Ngân Hà.

## Cơ chế gốc và cách bản này tái dựng

Đây là phần làm Thiên Hà Đại Chiến khác OGame. Nhãn trong bảng ngăn con số cân
bằng mới bị hiểu nhầm thành luật lịch sử; chi tiết nguồn nằm ở
[`docs/NGHIEN-CUU.md`](docs/NGHIEN-CUU.md).

| Cơ chế | Trong game |
|---|---|
| **6 tài nguyên** | Kim Loại, Thạch Anh, Nhiên Liệu, **Thực Phẩm**, **Galana** (tiền tệ), **Kỹ Thuật** (tài nguyên ẩn) |
| **Chu kỳ bảo trì 6 giờ** | **[XÁC NHẬN]** Một đồng hồ đế quốc 6 giờ; thiếu bảo trì tác động lần lượt tới nghiên cứu, dân cư rồi cơ sở vật chất. **[TÁI DỰNG]** Hoá đơn phải trả nguyên khoản ở checkpoint; lỡ kỳ 1/2/3 lần lượt làm nghiên cứu trễ, dân rời đi và công trình xuống cấp. |
| **Nghiên cứu trả dần** | **[XÁC NHẬN]** Tài nguyên nghiên cứu bị rút dần ở nhịp bảo trì, thiếu kỳ thì thất bại và đề tài tối thiểu 12 giờ. Bản này chia toàn bộ vector chi phí thành các khoản 6 giờ; thiếu một loại thì không trừ phần nào và mốc xong cộng đúng 6 giờ. |
| **Dân số, ủng hộ & thuế** | **[XÁC NHẬN]** Game gốc có cả ba chỉ số, thiếu Thực Phẩm làm dân rời đi và 250.000 dân cơ bản không bỏ hành tinh. **[TÁI DỰNG]** Thành Phố/sức chứa, tốc độ tăng–giảm, thuế và hệ số theo loại hành tinh được gom trong bảng `NHIP_V1`; do thám đủ cấp mới thấy các chỉ số này. |
| **Phòng thủ hai lớp** | **[XÁC NHẬN]** Phải phá lớp **quỹ đạo** trước khi đánh xuống **mặt đất**. **[TÁI DỰNG]** Engine chọn vòng 3 làm mốc bắt đầu hạ xuống đất. |
| **Đổi mục tiêu giữa đường** | **[XÁC NHẬN]** Hạm đội đổi mục tiêu được cả lượt đi lẫn lượt về. **[TÁI DỰNG]** Phí Galana, nhiên liệu phụ trội và cách tính lại thời gian từ vị trí hiện tại là cân bằng mới. |
| **Đóng quân quỹ đạo** | **[XÁC NHẬN]** Hạm có thể đậu ở bất kỳ quỹ đạo, gặp địch thì đánh, chia đội, chọn căn cứ trở về và phải tiếp nhiên liệu định kỳ; thiếu nhiên liệu sẽ thành “rác không gian”. **[TÁI DỰNG]** Bản này mới cho đậu ở hành tinh mình/đồng minh, trả trước nhiên liệu chở theo từng đoạn 6 giờ ở mức 2%; thiếu kỳ sau xoá đội, chỉ 30% giá trị Kim Loại/Thạch Anh thành phế liệu, gọi về sớm không hoàn phí. **Chọn căn cứ trở về** và **tách đội** đã có: hạm đội quay về một hành tinh khác của chính đế quốc (phí `DOI_CAN_CU_GALANA` cộng nhiên liệu phụ trội nếu chặng về dài hơn), và chia được một phần tàu/quân/hàng thành hạm đội thứ hai (tốn một khe + `TACH_HAM_GALANA`, hai đội giữ nguyên giờ tới). **Phong toả quỹ đạo** cũng đã có: Giữ Chỗ gửi tới quỹ đạo không phải của mình/đồng minh thì tới nơi phải thắng **lớp quỹ đạo** mới neo được, và mỗi mốc 6 giờ lại chạm trán lực lượng đã hồi lại. Phong toả không phá công trình và không cướp kho. Hiện chỉ phong toả được quỹ đạo NPC và ô trống; quỹ đạo người chơi khác vẫn phải dùng Tấn Công. |
| **Tuyên chiến 24 giờ** | **[XÁC NHẬN]** Phải đặt lệnh rồi chờ Hội Đồng Bảo An 24 giờ. **[TÁI DỰNG]** Multiplayer dùng chủ liên minh→người chơi, hoặc người chơi lẻ→người chơi; quyền đi theo tư cách liên minh hiện tại. |
| **Chuyển Galana & tiếp tế** | **[XÁC NHẬN]** Chỉ người cùng liên minh được chuyển tiền; bản này ghi hai số dư Galana trong cùng một giao dịch SQLite. **[TÁI DỰNG]** Đoàn vận tải tài nguyên cũng bị giới hạn cho đồng minh, kiểm tra cả lúc đi lẫn lúc đến. |
| **Tình báo & phản tình báo** | Tàu do thám mang về báo cáo; Trung Tâm Tình Báo của đối phương có thể bắn hạ chúng. Độ chi tiết báo cáo phụ thuộc chênh lệch cấp Công Nghệ Tình Báo. Bị đánh thì được báo động trước kèm đồng hồ, nhưng không thấy đội hình địch — còn nhiệm vụ do thám thì đi lén |
| **Liên minh & chat** | Người chơi gửi đơn, chủ liên minh duyệt/loại/chuyển quyền; chat chung được nguồn gốc xác nhận, kênh riêng liên minh là phần phục dựng |
| **Bảo vệ người chơi mới** | **[XÁC NHẬN]** Game gốc có bảo vệ người mới. **[TÁI DỰNG]** Bản này chọn ngưỡng 5.000 điểm và tỷ lệ sức mạnh 5 lần. |
| **5 loại hành tinh** | Ôn Hoà, Rừng Già, Nước – Đầm Lầy, Sa Mạc, Băng Hà — mô tả nguyên văn trong tư liệu: Sa Mạc "tài nguyên phong phú và dễ khai thác" nhưng "nghèo nàn về sự sống"; Nước "không dễ tấn công và có rất nhiều nhiên liệu"; Băng Hà được chọn vì "phòng thủ mặt đất mạnh" |
| **Đổ bộ mặt đất** | **[XÁC NHẬN]** Quỹ đạo phải thất thủ rồi **Robot** và **Tank** do **Đại Chiến Hạm** chở xuống mới phá công trình, như trận Start War III 16/10/2006; công thức sát thương/số công trình bị phá là **[TÁI DỰNG]**. |
| **Tên đơn vị gốc** | Máy Bay Chiến Đấu, Máy Bay Tiêm Kích, Tiểu / Trung / Đại Chiến Hạm, Hoả Tiễn, Boom, Tàu Dầu, Robot, Tank |
| **Công trình theo số lượng** | Người chỉ huy không có level riêng; `p.b[id]` là số công trình. Save cấp cũ được đổi sang số lượng theo vốn lũy kế. Giá lô, hệ số sản lượng và phép migration là **[TÁI DỰNG]** vì không còn bảng số gốc. |

## Nội dung

- **21 công trình**: 4 mỏ, Thành Phố, 2 nguồn điện, 4 kho, xưởng đóng tàu, phòng nghiên cứu,
  nhà máy robot/nano, trung tâm tình báo, đài chỉ huy hạm đội, trung tâm bảo trì, hầm tên lửa,
  cải tạo hành tinh, cổng không gian.
- **17 đề tài nghiên cứu**: Kỹ Thuật Khai Thác Mỏ/Nhà Xưởng, vũ khí/khiên/giáp,
  3 dòng động cơ, laser–ion–plasma, tình báo, máy tính, liên hành tinh, trọng trường.
- **15 loại tàu**: từ Phi Thuyền Nhẹ tới **Pháo Đài Di Động** (9 triệu vỏ thép), kèm tàu vận
  tải, do thám, thu hồi, thực dân.
- **10 công trình phòng thủ** chia hai lớp + 2 loại tên lửa.
- **8 nhiệm vụ hạm đội**: Tấn Công, Vận Chuyển, Triển Khai, Do Thám, Thực Dân, Thu Hồi,
  Giữ Chỗ, Thám Hiểm. Giữ Chỗ neo thật tại hành tinh của mình/đồng minh; chủ hạm
  có thể gọi về, còn đội đang đậu tham chiến bằng công nghệ của chính chủ sở hữu.
- **Chọn căn cứ trở về**: hạm đội đang bay đi, đang neo hay đang trên đường về đều đổi được
  hành tinh sẽ quay về — mục tiêu đang bay tới giữ nguyên, chỉ chặng về đổi chỗ, và tàu lẫn
  hàng trong khoang nhập vào kho căn cứ mới. Đang về thì giờ tới nơi tính lại từ vị trí hiện tại.
- **Phong toả quỹ đạo**: Giữ Chỗ gửi tới quỹ đạo lạ là một cuộc phong toả — tới nơi phải đánh
  thắng lớp quỹ đạo mới neo được, rồi cứ mỗi mốc nhiên liệu 6 giờ lại phải giữ lấy nó (phòng thủ
  NPC hồi 1,5%/giờ nên đây là cam kết dài hạn). Đúng luật hai lớp, phong toả **không** chạm tới
  mặt đất: không phá công trình, không cướp kho — muốn lấy của thì phải đổ bộ bằng Tấn Công.
- **Tách hạm đội**: chia một phần tàu, quân đổ bộ và hàng ra thành hạm đội thứ hai đi tiếp
  độc lập — từ đó đổi mục tiêu hay đổi căn cứ riêng nhau. Tốn một khe hạm đội và một khoản
  Galana; hai đội **giữ nguyên giờ tới của đội gốc**, nên không thể gửi kèm tàu chậm rồi tách
  ra giữa đường để đi nhanh hơn. Cả hai bên đều phải chở nổi phần hàng và quân của mình.
- **Tên lửa liên hành tinh**: bắn thẳng sang hành tinh khác phá phòng thủ mặt đất, tầm bắn
  theo cấp Động Cơ Xung, bên bị bắn dùng Tên Lửa Đánh Chặn hạ 1 đổi 1.
- **Máy tính trận đánh**: chạy thử 60 lần một trận bằng đúng bộ luật, cho tỷ lệ thắng, tàu
  mất quy ra tài nguyên và lãi/lỗ kỳ vọng; nạp thẳng đội hình địch từ báo cáo do thám.
- **Thám hiểm vùng không gian sâu** (ô 16 của mỗi hệ): 7 loại kết cục — tài nguyên trôi nổi,
  hạm đội bỏ hoang, trạm giao dịch cũ, chạm trán sinh vật ngoài hành tinh, lạc đường, vành đai
  thiên thạch, hoặc chẳng thấy gì.
- **Vũ trụ 9 × 499 × 15** hành tinh, sinh tất định từ hạt giống — cùng hạt giống thì bản đồ
  luôn giống nhau. Các đế quốc NPC có tên, liên minh, điểm, hạm đội và phòng thủ riêng;
  hành tinh **bỏ hoang** ít phòng thủ nhưng nhiều tài nguyên (nông trại kinh điển của thể loại).
- **Bãi phế liệu**: 30% xác tàu bị bắn hạ đọng lại trên quỹ đạo, vét bằng Tàu Thu Hồi.
- **Siêu Thị Thiên Hà**: chợ có **kho hữu hạn** và **quỹ tiền mặt riêng** — bán nhiều quá thì
  siêu thị hết tiền và phải chờ đoàn buôn tới, mua thì chỉ mua được thứ đang có. Thuế **10%**
  cả hai chiều, và **hàng mua tới hành tinh sau 6 giờ** chứ không tới ngay.
- **Ngân Hàng Thiên Hà**: gửi Galana lấy lãi **2%/ngày** cộng ở mỗi checkpoint bảo trì — kỳ nào
  lỡ bảo trì thì không có lãi. Ngoài ra có khoản **đầu tư khoá kỳ** lãi cao hơn, không rút giữa chừng.
- **Hai giao diện**: bản *vũ trụ tối* mặc định, và skin **“3D Blue (2010)”** gợi lại lối webgame
  Việt 2004–2010 — khung xanh bo viền nổi, thanh tiêu đề chữ trắng in hoa, nút bấm bóng. Đổi bằng
  nút **Giao diện** ở thanh trên, lựa chọn được nhớ lại. Tư liệu chỉ còn ghi *tên* theme gốc là
  “3D Blue” chứ không còn screenshot nào, nên đây là dựng theo lối chứ **không phải bản sao**.
- **Màn Hướng Dẫn ngay trong game**: 6 bước mở đầu, bốn cơ chế đặc trưng, cách trận
  đánh diễn ra, hệ toạ độ — mọi con số đọc trực tiếp từ bảng luật nên không lệch.
- **Phòng Chat & Bộ Chỉ Huy Liên Minh**: chat chung/liên minh lưu trong SQLite; đơn xin
  phải được chủ duyệt, có chuyển quyền và loại thành viên, chống spam và lọc XSS khi vẽ.

## Mẹo cho người mới

1. Bốn công trình đầu tiên: **Mỏ Kim Loại, Mỏ Thạch Anh, Nhà Máy Điện Mặt Trời, Trang Trại
   Sinh Quyển**. Thiếu điện thì mỏ chạy cầm chừng; thiếu Thực Phẩm được cộng dồn tới
   checkpoint kế tiếp, làm giảm ủng hộ và khiến phần dân trên sàn 250.000 có thể rời đi.
2. **Luôn để dư Galana** trước mốc bảo trì. Xem đồng hồ "Bảo trì sau" ở thanh trên.
   Bí tiền thì ra Siêu Thị Thiên Hà bán Kim Loại — nhưng nhớ là siêu thị có hạn mức tiền mặt,
   bán cả núi một lúc sẽ bị từ chối. Dư tiền thì gửi ngân hàng ăn lãi 2%/ngày.
3. **Do thám trước khi đánh.** Phòng thủ mặt đất của NPC thường nặng hơn vẻ ngoài.
   Trong luật cân bằng hiện tại, phải quét sạch quỹ đạo và tới vòng 3 mới giao chiến
   với lớp mặt đất.
4. Đánh **hành tinh bỏ hoang** để có vốn — cùng số điểm nhưng ít phòng thủ hơn nhiều.
5. Thấy báo động hạm đội địch mà không đỡ được thì **cho hạm đội bay đi**: hạm đội đang bay
   không bao giờ bị bắn hạ.
6. Thời gian vẫn chạy khi bạn tắt game. Mở lại, engine tua lại toàn bộ sản xuất, chuyến bay
   và các chu kỳ bảo trì đã diễn ra.
7. *(bản nhiều người)* Đừng lao vào đánh người chơi có nhiều **Pháo Plasma** — trên mỗi đồng
   bỏ ra, phòng thủ mặt đất bền hơn hạm đội rất nhiều, đánh vào là lỗ. Hạm đội để dành đi
   cướp mục tiêu giàu mà phòng thủ mỏng. Muốn an toàn thì tự dựng plasma và một lớp quỹ đạo.
8. *(bản nhiều người)* Vào liên minh rồi có thể **chuyển Galana trực tiếp**, hoặc dùng
   nhiệm vụ **Tiếp tế** để chở Kim Loại/Thạch Anh/Nhiên Liệu/Thực Phẩm. Quan hệ đồng
   minh được kiểm tra cả lúc xuất phát và lúc đến; hàng bên nhận không chứa nổi sẽ
   được mang về, không mất.

## Cấu trúc mã nguồn

```
index.html            khung trang bản MỘT NGƯỜI, nạp 10 file script
css/style.css         hai giao diện: vũ trụ tối (mặc định) và "3D Blue (2010)"

js/                   BỘ LUẬT DÙNG CHUNG — chạy cả trên trình duyệt lẫn trên server
  data.js             bảng dữ liệu: công trình, nghiên cứu, tàu, phòng thủ, hằng số cân bằng
  util.js             định dạng số/thời gian, PRNG tất định, toạ độ, khoảng cách
  galaxy.js           sinh vũ trụ & NPC tất định từ hạt giống, bảng xếp hạng, móc nối G.HOOK
  combat.js           bộ mô phỏng trận đánh 6 vòng, bắn nhanh, phòng thủ hai lớp
  engine.js           state, sản lượng, hàng đợi, chi phí, điểm
  fleet.js            hạm đội, nhiệm vụ, chu kỳ bảo trì, dòng thời gian (tua offline)
  actions.js          bảng hành động luật game cốt lõi (xây, nghiên cứu, hạm đội...)
  ui.js               các màn giao diện
  app.js              tầng thao tác giao diện, dùng chung cho cả hai bản
  main.js             driver bản MỘT NGƯỜI: state trong localStorage, chạy tại chỗ

server/               MÁY CHỦ NHIỀU NGƯỜI (Node thuần, không gói ngoài)
  index.js            HTTP, phục vụ file tĩnh, scheduler, tắt máy êm
  api.js              các đường dẫn /api/*, xác thực scrypt, giới hạn tần suất
  world.js            thế giới dùng chung: nạp/lưu đế quốc, tua thời gian, PvP, liên minh
  db.js               schema SQLite + câu truy vấn
  rules.js            nạp js/*.js vào tiến trình Node

web/                  CLIENT BẢN NHIỀU NGƯỜI
  index.html          màn đăng nhập/đăng ký + khung game
  js/mp.js            driver: gọi API, đồng bộ, chat, quản trị liên minh và các màn riêng

tools/
  smoke.js            kiểm thử lõi bằng Node
  test-server.js      kiểm thử máy chủ: tài khoản, database, PvP và phòng thủ nhiều chủ
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
