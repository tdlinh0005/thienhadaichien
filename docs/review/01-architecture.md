# Báo cáo Review Kiến trúc & Ranh giới Module — Thiên Hà Đại Chiến (Seat S1)

## 1. Tóm tắt

Hệ thống "Thiên Hà Đại Chiến" là một dự án webgame chiến thuật vũ trụ phục dựng rất đặc sắc: chạy hoàn toàn bằng vanilla JavaScript (không framework, không thư viện ngoài), hỗ trợ cả chế độ một người (chạy trên trình duyệt, lưu `localStorage`) lẫn nhiều người (máy chủ Node.js thuần + `node:sqlite`). Kiến trúc cốt lõi dựa trên triết lý **"một bộ luật duy nhất chạy ở cả hai đầu"**: cùng một bộ mô phỏng kinh tế, công nghệ, thời gian, hạm đội và chiến trận (`js/*.js`) phục vụ cho cả client lẫn server.

Tuy nhiên, do việc tái dựng phát triển liên tục qua nhiều phiên bản (từ v3 đến v7) và duy trì sự tương thích ngược triệt để, hệ thống bộc lộ những giới hạn kiến trúc đáng lưu ý: sự phụ thuộc vào biến toàn cục (`window.G`), nạp file qua `eval()`, tình trạng "god module" và ôm đồm logic migration trong `js/engine.js`, sự phân mảnh render giao diện giữa `js/ui.js` và `web/js/mp.js`, ranh giới xử lý đơn chợ/liên minh bị phân nhánh (bifurcation), cùng mô hình lưu trữ toàn bộ đế quốc thành một blob JSON duy nhất trên SQLite gây áp lực I/O và tuần tự hóa khi mở rộng quy mô multiplayer.

---

## 2. Điểm mạnh

1. **Triết lý Zero-Dependency & tính độc lập cao:**
   - Cả client và server đều không phụ thuộc vào bất kỳ thư viện npm bên ngoài nào (`package.json` hoàn toàn không có `dependencies`).
   - Server chỉ sử dụng các module tích hợp sẵn của Node.js: `node:http`, `node:sqlite`, `node:crypto`, `node:fs`, `node:path`. Quá trình triển khai, khởi động và sao lưu cực kỳ gọn nhẹ, không có rủi ro chuỗi cung ứng (supply-chain attacks).
2. **Bộ luật game đẳng cấu (Isomorphic Ruleset) chạy song song:**
   - Các file luật cốt lõi (`data.js`, `util.js`, `galaxy.js`, `combat.js`, `engine.js`, `fleet.js`, `thitruong.js`, `actions.js`) dùng chung 100% logic toán học, công thức sản xuất, chi phí, cơ chế 6 vòng đánh và hàng đợi giữa client và server.
   - Giúp đảm bảo tính tất định (determinism) khi tính toán sản xuất offline ở chế độ solo và kiểm tra tính hợp lệ authoritative ở server multiplayer.
3. **Cơ chế Migration dữ liệu v3 → v7 chặt chẽ, bảo toàn vốn:**
   - Quá trình nâng cấp state được thiết kế tuần tự, khép kín từng phiên bản (`G.nangCapState` trong `js/engine.js:410-430`), từ việc bảo toàn vốn tích lũy khi chuyển cấp công trình sang số lượng (v4), phân bổ nhịp bảo trì 6 giờ và dân số (v5), đóng quân quỹ đạo 3 pha (v6), đến bổ sung ngân hàng/thị trường (v7).
   - Server chủ động từ chối chạy nếu gặp state mới hơn engine (`js/engine.js:413-414`), ngăn chặn việc vô tình hạ cấp làm hỏng dữ liệu.
4. **Mô hình Unit-of-Work và bảo vệ giao dịch PvP nhiều bên:**
   - Server (`server/world.js` và `docs/MAY-CHU.md:384-392, 503-544`) triển khai mô hình Unit of Work bọc toàn bộ các mutation của trận đánh (attacker, host, các đồng minh đóng quân, bãi phế liệu, bảng tin, sổ ghi trận) trong một transaction SQLite duy nhất (`Kho.giaoDich`).
   - Có cơ chế khóa đồng thời (`dangTick`), kiểm tra quyền 2 lớp (lúc phát lệnh và lúc hạm đến nơi), cùng việc hoãn trận 20 giây nếu bên tham chiến đang bận xử lý nhịp khác, ngăn chặn triệt để race condition và phân mảnh dữ liệu.
5. **Hệ thống Design System & Information Architecture (IA) quy chuẩn:**
   - `design.md` định nghĩa hệ thống token, nguyên tắc UX ("Thấy tình hình trước. Chọn hành động sau"), phân tầng 5 workspace chuẩn mực cho cả solo (15 màn) và multiplayer (17 màn).

---

## 3. Vấn đề

### VĐ-01: Thiếu ranh giới module chuẩn — Ô nhiễm biến toàn cục và cơ chế nạp `eval()`
- **Bằng chứng:**
  - `server/rules.js:6-18`: Server nạp các file trong `js/` bằng cách giả lập `global.window = {}`, sau đó dùng `fs.readFileSync` đọc từng file và gọi `(function () { eval(ma); })();`.
  - `js/util.js:3`, `js/engine.js:6`, `js/actions.js:10`, `js/thitruong.js:17`: Mọi file đều tự gắn vào `var G = window.G = window.G || {};`.
  - `js/app.js:7`: Khởi tạo `var G = window.G, U = window.U, APP = window.APP = window.APP || {};`.
- **Hệ quả:**
  - Mã nguồn phụ thuộc hoàn toàn vào môi trường runtime có sẵn `window`. Không tận dụng được tính năng kiểm tra tĩnh (static analysis), tree-shaking hoặc cơ chế import/export của ES Modules (ESM) / CommonJS.
  - Sử dụng `eval()` tiềm ẩn rủi ro bảo mật, cản trở trình biên dịch JIT tối ưu hóa mã và khiến việc dò lỗi (stack trace) khi khởi động server trở nên khó khăn.

### VĐ-02: Khớp nối cứng theo thứ tự nạp file (Temporal / Load-Order Coupling)
- **Bằng chứng:**
  - `server/rules.js:6`: Khai báo mảng thứ tự cứng `var THU_TU = ['data', 'util', 'galaxy', 'combat', 'engine', 'thitruong', 'fleet', 'actions'];`.
  - `index.html`: Nạp tuần tự 10 thẻ `<script>` (`data.js`, `util.js`, `galaxy.js`, `combat.js`, `engine.js`, `thitruong.js`, `fleet.js`, `actions.js`, `ui.js`, `app.js`, `main.js`).
- **Hệ quả:**
  - Các module không tự khai báo rõ dependency của mình mà giả định các module trước đó đã chạy xong và gắn sẵn hàm vào `window.G`.
  - Nếu một lập trình viên gọi một tiện ích từ file đứng sau trong mảng (hoặc thay đổi thứ tự script trong HTML), toàn bộ ứng dụng sẽ đổ vỡ tại thời điểm khởi động với lỗi `TypeError: G.xxx is not a function`.

### VĐ-03: "God Module" và vi phạm SRP trong `js/engine.js`
- **Bằng chứng:**
  - `js/engine.js:16-85`: Khởi tạo trạng thái ban đầu (`G.moiGame`, `G.htMoi`).
  - `js/engine.js:88-430`: Logic migration state v3 → v7 với 342 dòng code tính toán chuyển đổi công trình, hàng đợi, đồng hồ nợ, hạm đội và kinh tế.
  - `js/engine.js:435-497`: Điều kiện tiên quyết và tính chi phí (`G.giaXay`, `G.thoaDK`, `G.thieuDK`).
  - `js/engine.js:536-630`: Mô hình sản lượng và tính toán tick tài nguyên/dân số (`G.sanLuong`, `G.sanXuat`).
  - `js/engine.js:656-777`: Quản lý hàng đợi xây dựng, đóng tàu, nghiên cứu (`G.xepXay`, `G.xepTau`, `G.xepNC`).
  - `js/engine.js:781-811`: Xử lý logic bỏ hoang thuộc địa (`G.boHoang`).
  - `js/engine.js:816-832`: Tính điểm đế quốc (`G.diem`).
  - `js/engine.js:841-849`: Thao tác mảng tin nhắn và nhật ký (`G.tin`, `G.ghi`).
- **Hệ quả:**
  - `js/engine.js` phải gánh vác quá nhiều trách nhiệm khác biệt. Riêng phần migration chiếm tới hơn 40% dung lượng file nhưng chỉ chạy 1 lần lúc nạp save/khởi động server.
  - Khi cần bảo trì công thức sản xuất hoặc cân bằng hàng đợi, lập trình viên buộc phải can thiệp vào một file khổng lồ chứa lẫn lộn mã migration cũ.

### VĐ-04: Khớp nối lỏng lẻo qua Monkey-Patching giữa Driver và Tầng Thao Tác
- **Bằng chứng:**
  - `js/main.js:58-68`: Driver solo ghi đè các hàm của `APP`: `APP.mp = false`, `APP.luu = luu`, `APP.lam = function(...)`.
  - `web/js/mp.js:23-25`: Driver multiplayer ghi đè `G.MO_PHONG_NHE = true`, `APP.mp = true`.
  - `web/js/mp.js:80-126`: Ghi đè trực tiếp `APP.lam`, `APP.taiXepHang`, `APP.taiHe`, `APP.luu`.
  - `web/js/mp.js:155-186`: Ghi đè toàn bộ đối tượng `U.nguon` (`xemHe`, `xepHang`, `dsLM`, `thanhVien`, `daXin`, `chinhThe`, `choDonNgoai`).
  - `web/js/mp.js:201`: Ghi đè danh sách màn hình `U.MAN = U.taoMAN('mp');`.
- **Hệ quả:**
  - Không có một Interface hoặc Abstract Controller rõ ràng định nghĩa hợp đồng giữa UI và Data Layer.
  - Các driver can thiệp sâu vào nội bộ của `APP` và `U` bằng cách gán đè thuộc tính run-time. Luồng dữ liệu trở nên khó đoán định và phụ thuộc vào thời điểm các file script được thực thi.

### VĐ-05: Phân mảnh và rò rỉ mã Render giao diện sang Driver Multiplayer
- **Bằng chứng:**
  - `web/js/mp.js:203-226`: Chứa hàm render HTML toàn bộ màn Bảng tin `U.m_bangtin = function () { ... }`.
  - `web/js/mp.js:284-305`: Chứa hàm render HTML màn Chat `U.m_chat = function () { ... }`.
  - `web/js/mp.js:307-344`: Chứa hàm render HTML màn Tài khoản `U.m_taikhoan = function () { ... }`.
  - `web/js/mp.js:350-431`: Ghi đè và nối thêm HTML vào màn Liên minh `U.m_lienminh`.
- **Hệ quả:**
  - Vi phạm ranh giới module: `web/js/mp.js` vốn được định vị là driver mạng/đồng bộ multiplayer, nhưng lại chứa hàng trăm dòng template HTML và thao tác DOM trực tiếp.
  - Logic hiển thị UI bị xé lẻ thành hai nơi: các màn cơ bản nằm ở `js/ui.js`, trong khi các màn multiplayer nằm ở `web/js/mp.js`. Khi cần đồng bộ theo Design System (`design.md`), lập trình viên dễ bỏ sót các màn trong `mp.js`.

### VĐ-06: Phân nhánh logic hành động (Action Routing Bifurcation) giữa Solo và Multiplayer
- **Bằng chứng:**
  - `js/actions.js:176-198`: Định nghĩa các hành động `dangBan`, `huyDon`, `muaDon` thông qua `G.HANHDONG` cho state cục bộ.
  - `web/js/mp.js:479-520`: Ghi chú rõ ràng rằng gọi `lam('dangBan'...)` sẽ chỉ chạy trên state local, nên `mp.js` đã can thiệp vào tầng action (`APP.themACT`), bỏ qua `APP.lam` và gọi trực tiếp các API REST riêng biệt: `api('/api/cho', ...)`, `api('/api/cho/mua', ...)`, `api('/api/cho/huy', ...)`.
  - `js/actions.js:228-237`: Hành động `lmvao` cho phép người chơi solo tự gia nhập liên minh trực tiếp, nhưng ở multiplayer lại bị chặn ở `server/api.js:405` để bắt buộc đi qua luồng gửi đơn `POST /api/lmxin` và duyệt đơn `POST /api/lmduyet`.
- **Hệ quả:**
  - Ranh giới giữa "hành động game cốt lõi" (`G.HANHDONG`) và "hành động tương tác xã hội/thị trường" không nhất quán.
  - Người đọc mã nguồn tại `js/actions.js` sẽ lầm tưởng rằng mọi thao tác người chơi đều đi qua bảng `G.HANHDONG`, nhưng thực chất multiplayer lại rẽ nhánh sang các API endpoint độc lập.

### VĐ-07: Lưu trữ monolithic state dạng JSON blob trên SQLite & Churn khi cập nhật chỉ mục
- **Bằng chứng:**
  - `server/db.js` và `docs/MAY-CHU.md:155, 172-185`: Toàn bộ dữ liệu đế quốc của mỗi tài khoản được lưu thành một chuỗi JSON khổng lồ trong cột `dq.state` (gồm danh sách hành tinh, công trình, kho tài nguyên, hàng đợi tàu/công trình, hạm đội, danh bạ tin nhắn tối đa 150 tin, nhật ký tối đa 120 dòng).
  - `docs/MAY-CHU.md:254-257, 274-277, 303-305`: Mỗi khi lưu state (`TheGioi.luu`), server thực hiện xóa sạch và nạp lại toàn bộ các dòng liên quan trong các bảng chỉ mục:
    `DELETE FROM ht WHERE tk = ?; INSERT INTO ht ...`
    `DELETE FROM hamdang WHERE tkA = ?; INSERT INTO hamdang ...`
    `DELETE FROM hamgiu WHERE tkA = ?; INSERT INTO hamgiu ...`
- **Hệ quả:**
  - Mỗi vòng scheduler tick (`server/index.js:118-128`, mặc định 3 giây/lần cho tối đa 60 đế quốc) hoặc mỗi thao tác người chơi đều phải thực hiện `JSON.parse` và `JSON.stringify` toàn bộ cấu trúc đế quốc. Khi số lượng đế quốc và quy mô đế quốc tăng, chi phí CPU cho serialization trong luồng chính của Node.js sẽ gây nghẽn event loop.
  - Việc xóa trắng và insert lại hàng loạt bản ghi phụ thuộc (`ht`, `hamdang`, `hamgiu`) tạo ra write amplification lớn, làm phình nhanh file WAL của SQLite và gia tăng nguy cơ tranh chấp khóa (`SQLITE_BUSY`).

### VĐ-08: Hạn chế của kiến trúc Polling 8 giây trong tác chiến thời gian thực
- **Bằng chứng:**
  - `web/js/mp.js:128-132, 452`: Client gọi polling `/api/state` định kỳ mỗi 8 giây một lần thông qua `setInterval`.
  - `docs/MAY-CHU.md:452`: "Không có WebSocket — tất cả là polling."
- **Hệ quả:**
  - Độ trễ thông tin chiến sự cao: Nếu một hạm đội đối phương xuất kích hoặc đổi hướng nhắm tới hành tinh của người chơi, người chơi có thể mất tới 8 giây mới nhận được cảnh báo.
  - Lãng phí tài nguyên mạng và I/O server khi hàng trăm client liên tục gửi request HTTP GET `/api/state` ngay cả khi đế quốc không hề có biến động gì mới.

### VĐ-09: Cơ cấu thư mục chưa phản ánh đúng bản chất module
- **Bằng chứng:**
  - `README.md:197-208`: Thư mục `js/` được chú thích là "BỘ LUẬT DÙNG CHUNG — chạy cả trên trình duyệt lẫn trên server", nhưng thực tế chứa cả `ui.js` (render DOM), `app.js` (xử lý sự kiện click/phím), và `main.js` (driver solo).
  - Vị trí hai bản chơi không đối xứng: Bản solo nằm ở gốc (`index.html`, `js/main.js`), còn bản multiplayer nằm trong `web/` (`web/index.html`, `web/js/mp.js`).
- **Hệ quả:**
  - Cấu trúc thư mục gây ngộ nhận về ranh giới mã nguồn. Server buộc phải duy trì danh sách lọc thủ công (`server/rules.js`) để tránh nạp nhầm các file UI của trình duyệt vào Node.js.

---

## 4. Đề xuất cải tiến

| STT | Đề xuất cải tiến | Lợi ích kiến trúc | Độ khó | Mức độ ưu tiên |
|---|---|---|---|---|
| **1** | **Tách logic Migration ra khỏi `js/engine.js`:** Chuyển toàn bộ các hàm chuyển đổi phiên bản (`nangV3LenV4`, `nangV4LenV5`, `nangV5LenV6`, `nangV6LenV7`, `G.slTuCap`, `G.capTuSL`) sang một file riêng `js/migration.js`. | Giảm hơn 40% độ phức tạp của `engine.js`; đưa `engine.js` về đúng vai trò tính toán quy luật game thời gian thực (SRP). File migration chỉ nạp khi cần nâng cấp state. | Thấp | **Cao (P1)** |
| **2** | **Tách UI của Multiplayer về đúng tầng UI:** Chuyển các hàm render `U.m_bangtin`, `U.m_chat`, `U.m_taikhoan` và phần mở rộng của `U.m_lienminh` từ `web/js/mp.js` về `js/ui.js` (hoặc module `js/ui-mp.js`). | Trả `web/js/mp.js` về đúng vai trò Controller/Network Driver; gom toàn bộ trách nhiệm render HTML vào tầng UI, thuận tiện kiểm soát Design System và bảo trì giao diện. | Thấp | **Cao (P1)** |
| **3** | **Chuẩn hóa Module hóa (ES Modules hoặc UMD Wrapper):** Đóng gói các file trong `js/` bằng chuẩn ESM (hoặc UMD) thay vì gán trực tiếp vào `window.G`; thay thế cơ chế `eval()` trong `server/rules.js` bằng import chuẩn. | Loại bỏ hoàn toàn việc giả lập `global.window = {}` trên Node.js; xóa bỏ rủi ro bảo mật của `eval()`; cho phép các công cụ linting và IDE tự động phát hiện lỗi phụ thuộc vòng hoặc sai thứ tự. | Trung bình | **Trung bình (P2)** |
| **4** | **Đồng nhất hợp đồng Action (Action Contract Unification):** Chuẩn hóa việc phân loại hành động: phân định rõ những hành động cục bộ (`st`) với các hành động toàn cục (multiplayer transaction). Định nghĩa một Dispatcher thống nhất thay vì để `web/js/mp.js` monkey-patch đè lên `APP.themACT`. | Giúp luồng dữ liệu rõ ràng, minh bạch; xóa bỏ tình trạng code chết hoặc phân nhánh ngầm giữa chế độ solo và multiplayer. | Trung bình | **Trung bình (P2)** |
| **5** | **Tối ưu hóa Projection và Tách biệt Lịch sử trong Database:** Tách các dữ liệu biến động nhiều nhưng ít khi tính toán luật (như lịch sử chat, 150 tin nhắn `msgs`, 120 dòng nhật ký `nk`) ra khỏi blob `dq.state`. Áp dụng cập nhật vi sai (differential update) cho bảng `ht`, `hamdang`, `hamgiu` thay vì `DELETE ALL + INSERT`. | Giảm kích thước blob JSON của `dq.state` xuống 60–80%, giảm đáng kể chi phí tuần tự hóa JSON trong event loop; hạn chế tình trạng phình to file WAL và khóa SQLite. | Trung bình | **Trung bình (P2)** |
| **6** | **Nâng cấp kênh thông báo thời gian thực bằng Server-Sent Events (SSE):** Bổ sung một endpoint SSE (`GET /api/stream`) sử dụng `node:http` thuần (không cần thư viện ngoài) để push sự kiện (cảnh báo hạm đội địch, tin nhắn mới, chiến báo) tới client. Polling 8 giây chỉ dùng làm cơ chế dự phòng. | Giảm số lượng request HTTP vô ích tới server; tăng trải nghiệm người chơi lên mức tức thì (real-time) khi có báo động PvP hoặc tin nhắn liên minh. Vẫn giữ vững nguyên tắc zero-dependency. | Trung bình | **Thấp (P3)** |
| **7** | **Cơ cấu lại thư mục theo vai trò chức năng:** Tổ chức lại thư mục: `core/` (hoặc `rules/`) chứa bộ luật thuần chạy cả hai đầu; `client/` chứa UI và driver web; `server/` chứa backend Node.js. | Tạo ranh giới vật lý rõ ràng giữa mã nguồn đẳng cấu (isomorphic), mã trình duyệt và mã máy chủ; loại bỏ việc cấu hình danh sách file loại trừ thủ công. | Thấp | **Thấp (P3)** |
