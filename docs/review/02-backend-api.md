# Báo cáo đánh giá Backend & API (Seat S2)

> **Dự án**: Thiên Hà Đại Chiến (Node >= 22, CommonJS, `node:sqlite`, zero external dependencies)  
> **Phạm vi kiểm tra**: `server/api.js`, `server/db.js`, `server/index.js`, `server/world.js`, `server/rules.js`, `docs/MAY-CHU.md`  
> **Người thực hiện**: Reviewer Backend & Bảo mật (Seat S2)

---

## 1. Tóm tắt

Hệ thống backend của Thiên Hà Đại Chiến được thiết kế theo triết lý tối giản, tự chủ hoàn toàn với **zero external dependencies** (chỉ sử dụng `node:http`, `node:sqlite`, `node:crypto`). Kiến trúc chia sẻ bộ luật game nguyên bản (`js/*.js`) giữa client và server thông qua cơ chế nạp cô lập trong `server/rules.js` là một điểm sáng lớn giúp loại bỏ hoàn toàn tình trạng trôi lệch logic (logic drift).

Tầng lưu trữ kết hợp hài hòa giữa Document model (toàn bộ state đế quốc lưu dưới dạng JSON trong bảng `dq`) và Relational model (các bảng chỉ mục `ht`, `hamdang`, `hamgiu`, `cho`, `lm` phục vụ tra cứu O(1) và bảo đảm toàn vẹn quan hệ). Giao thức API Stateless sử dụng custom header `x-thdc-token` kết hợp mã hóa băm mật khẩu `scrypt` chuẩn mật mã học mang lại nền tảng bảo mật vững chắc.

Tuy nhiên, quá trình rà soát phát hiện **01 lỗ hổng bảo mật nghiêm trọng** (endpoint quản trị `/api/admin/tocdo` mở công khai không xác thực), **01 lỗi logic ngữ cảnh state** trong `TheGioi.prototype.choMua` liên quan đến `chuStack`, và nguy cơ nghẽn Event Loop do sử dụng `scryptSync` đồng bộ. Ngoài ra, file `server/world.js` với 1.772 dòng đang gánh vác quá nhiều vai trò (God Object), cần được tái cấu trúc thành các module miền nghiệp vụ độc lập.

---

## 2. Điểm mạnh

1. **Zero Dependency & Tối ưu chuẩn Node 22+**:
   - Sử dụng trực tiếp `node:sqlite` (`sqlite.DatabaseSync`), `node:crypto`, `node:http` mà không cần cài đặt bất kỳ thư viện bên thứ ba nào, loại bỏ hoàn toàn nguy cơ tấn công chuỗi cung ứng (supply-chain attack).
   - Tận dụng `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=4000` giúp SQLite vận hành bền bỉ, an toàn trong môi trường concurrency đọc/ghi.

2. **Một bộ luật duy nhất (Single Source of Truth) qua `rules.js`**:
   - `server/rules.js` nạp và chạy trực tiếp bộ luật từ `js/*.js` trong phạm vi hàm đóng kín (closure), chia sẻ trọn vẹn mô hình cân bằng, tính toán chiến đấu và xử lý hàng đợi mà không cần viết lại logic trên backend.

3. **100% Prepared Statements & An toàn SQL**:
   - Tất cả câu truy vấn SQL trong `server/db.js` (`this.q`) đều được `prepare` sẵn từ lúc khởi động, tham số được truyền qua bind parameter (`?`), triệt tiêu hoàn toàn nguy cơ SQL Injection.

4. **Kiến trúc Unit-of-Work (UoW) nhất quán**:
   - `TheGioi.prototype.batDau` và `ketThuc` hỗ trợ lồng nhau, gom cụm toàn bộ thay đổi của nhiều người chơi (bên tấn công, bên phòng thủ, hạm đội hỗ trợ, bãi phế liệu, bảng tin) để commit trong đúng 1 transaction SQLite duy nhất tại tầng ngoài cùng.

5. **Tự phục hồi dữ liệu khi khởi động**:
   - Hệ thống tự động nâng cấp schema và migration state qua `TheGioi.prototype.nangCapDuLieu`.
   - Hàm `_dongBoChiMucTrongGD` xóa và dựng lại toàn bộ các bảng chỉ mục phái sinh (`ht`, `hamdang`, `hamgiu`) từ dữ liệu canonical JSON, loại bỏ hoàn toàn trạng thái rác/mồ côi sau sự cố crash.

6. **Bảo mật giao thức & Chống CSRF mặc định**:
   - Không sử dụng cookie xác thực mà dùng header `x-thdc-token` sinh từ `crypto.randomBytes(24)`, loại trừ rủi ro tấn công Cross-Site Request Forgery (CSRF).
   - Thiết lập đầy đủ các header an toàn: `Content-Security-Policy: default-src 'none'`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
   - Có cơ chế `docBodyDaXacThuc` trong `server/api.js:201-208` kiểm tra lại phiên sau khi hoàn tất đọc stream body, chống race condition khi phiên bị thu hồi trong quá trình tải payload.

---

## 3. Vấn đề phát hiện (Kèm bằng chứng file / dòng)

### 3.1. Mức độ Nghiêm trọng (Critical)

- **[BẢO MẬT] Endpoint `/api/admin/tocdo` mở công khai, hoàn toàn không xác thực**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/api.js#L147-L153`
  ```javascript
  /* [v7] đổi tốc độ server (admin) */
  if (duong === '/api/admin/tocdo' && req.method === 'POST') {
    var b = await docBody(req);
    var r = self.doiTocDo(b.tocDo);
    if (r.loi) return json(res, 400, r);
    return json(res, 200, r);
  }
  ```
  - **Bằng chứng**: Endpoint này được đặt trước dòng `192: /* ---- cần đăng nhập ---- */`, không kiểm tra `self.phien(req)`, không kiểm tra quyền tài khoản, và cũng không áp dụng rate limit. Bất kỳ client nào gửi `POST /api/admin/tocdo` với payload `{"tocDo": 1000}` đều có thể thay đổi biến toàn cục `G.C.TOC_DO_SERVER` và cấu hình SQLite `cauhinh('tocDo')`, phá hủy hoàn toàn tốc độ cân bằng của server.

### 3.2. Mức độ Cao (High)

- **[STATE & LOGIC] Lệch ngữ cảnh `chuStack` trong giao dịch mua chợ (`TheGioi.prototype.choMua`)**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/world.js#L493-L499`
  ```javascript
  var capTk = [tkA, hang.tk].sort(function (x, y) { return x - y; });
  for (var k = 0; k < capTk.length; k++) { this.dangTick.add(capTk[k]); this.chuStack.push(capTk[k]); }
  var gio = this.mocHoacGio();
  for (k = 0; k < capTk.length; k++) {
    var dK = capTk[k] === tkA ? a : b;
    G.tick(dK.st, gio);
  }
  ```
  - **Bằng chứng**: Khác với `danhNguoi` (chỉ push/pop `chuStack` cục bộ quanh mỗi lần `G.tick`, dòng 939-941), `choMua` đẩy cả hai ID người chơi (`tkA` và `hang.tk`) vào `this.chuStack` cùng lúc trước vòng lặp. Khi chạy `G.tick` cho người chơi đầu tiên trong mảng `capTk`, hàm `this.chuHienTai()` (dòng 646: trả về phần tử cuối cùng của `chuStack`) sẽ trả về ID của người chơi thứ hai! Nếu trong quá trình tick có hook nào kích hoạt (như `oNguoi`, `kiemTraGui`), server sẽ nhận diện nhầm người đang sở hữu hành tinh/hạm đội.

### 3.3. Mức độ Trung bình (Medium)

- **[HIỆU NĂNG & DOS] Sử dụng `crypto.scryptSync` đồng bộ trên Main Thread**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/api.js#L20`
  ```javascript
  function bam(mk, muoi) { return crypto.scryptSync(String(mk), muoi, 64, { N: 16384, r: 8, p: 1 }).toString('hex'); }
  ```
  - **Bằng chứng**: Mỗi phép tính `scryptSync` với tham số N=16384 tiêu tốn khoảng 30–80ms CPU. Vì chạy đồng bộ (`Sync`), nó chặn đứng Node.js Event Loop trong suốt thời gian băm. Khi có nhiều request đăng ký/đăng nhập đồng thời (hoặc tấn công dò mật khẩu qua mạng botnet), toàn bộ server sẽ bị đơ, không phản hồi các kết nối khác.
- **[BẢO MẬT] Cơ chế xóa trắng Rate Limit Map khi đầy**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/api.js#L73`
  ```javascript
  if (this.nhip.size > 5000) this.nhip.clear();
  ```
  - **Bằng chứng**: Khi kích thước `Map` vượt quá 5.000 entry, toàn bộ cache rate-limit bị xóa sạch thay vì dọn dẹp các key đã hết hạn (`now - o.tu > NHIP_CUA * 1000`). Kẻ tấn công có thể spam liên tục để kích hoạt điều kiện này, gián tiếp reset bộ đếm giới hạn tần suất cho chính mình và các IP khác.
- **[TOÀN VẸN GIAO DỊCH] Hàm `TheGioi.prototype.lmTao` ghi dữ liệu ngoài transaction**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/world.js#L1636-L1654`
  - **Bằng chứng**: Lệnh `lmThem.run` và `lmDoiChinhThe.run` được thực thi trực tiếp, nằm ngoài transaction trước khi gọi `this.hanhDong(tk, 'lmvao')`. Nếu quá trình gán quyền xảy ra lỗi, code phải dùng cơ chế bù trừ thủ công `kho.q.lmXoa.run(day)`. Nếu tiến trình server bị crash đúng thời điểm này, liên minh mồ côi sẽ tồn tại vĩnh viễn trong DB.
- **[KIẾN TRÚC] God Object `server/world.js` vi phạm nguyên tắc Đơn trách nhiệm (SRP)**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/world.js` (toàn bộ 1.772 dòng)
  - **Bằng chứng**: Class `TheGioi` đảm nhiệm cùng lúc hơn 8 phân hệ: Migration dữ liệu, Unit-of-Work, Chợ giao dịch, Biểu quyết liên minh, Quản lý thành viên liên minh, Mô phỏng chiến tranh PvP, Bảng tin/Thư tín, và Vòng lặp Scheduler. Sự kết hợp này làm tăng độ phức tạp liên kết (coupling) và khiến unit test gặp nhiều trở ngại.

### 3.4. Mức độ Thấp & Lệch tài liệu (Low / Doc Drift)

- **[TÀI LIỆU] Thiếu đặc tả API `/api/admin/tocdo` trong tài liệu máy chủ**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/docs/MAY-CHU.md#L398-L430`
  - **Bằng chứng**: Bảng API trong tài liệu liệt kê từ `/api/thongtin` đến `/api/doimk` nhưng hoàn toàn không đề cập đến endpoint `/api/admin/tocdo`.
- **[HỆ THỐNG] Graceful Shutdown không chờ nhịp tick kết thúc**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/index.js#L139-L148`
  - **Bằng chứng**: Khi nhận `SIGINT`/`SIGTERM`, hàm `tat()` gọi ngay `kho.dong()` mà không kiểm tra cờ `dangNhip`. Nếu scheduler đang trong vòng lặp `nhip()` ghi hàng chục đế quốc, đóng database đột ngột có thể ném exception hoặc gây lỗi transaction.
- **[TRANSACTION SQL] `Kho.prototype.giaoDich` dùng `BEGIN` thay vì `BEGIN IMMEDIATE`**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/db.js#L375`
  - **Bằng chứng**: Mặc định `BEGIN` trong SQLite là `DEFERRED`. Mặc dù server hiện chạy một tiến trình, việc dùng `BEGIN IMMEDIATE` sẽ an toàn hơn khi có tool bên ngoài (backup script, CLI admin) đọc/ghi song song trên file WAL.
- **[MÃ NGUỒN] Sử dụng `eval` trong `server/rules.js`**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/server/rules.js#L15`
  - **Bằng chứng**: Dù file nạp là file cục bộ cố định, việc dùng `eval()` thay vì module chuẩn `node:vm` (`vm.runInThisContext`) là thói quen code không được khuyến khích trong môi trường Node.js hiện đại.

---

## 4. Đề xuất cải tiến

| STT | Đề xuất cải tiến | Lợi ích | Độ khó | Mức ưu tiên |
|---|---|---|---|---|
| 1 | **Bảo vệ endpoint `/api/admin/tocdo`**: Đưa vào sau `self.phien(req)` và kiểm tra `p.tkRow.quyen === 'admin'` (hoặc secret token riêng trong env `ADMIN_KEY`). | Ngăn chặn hoàn toàn việc người ngoài tự ý can thiệp tốc độ server và phá hoại gameplay. | Rất dễ (vài dòng code) | **P0 (Khẩn cấp)** |
| 2 | **Sửa lỗi ngữ cảnh `chuStack` trong `choMua`**: Đẩy và rút `chuStack` quanh từng lệnh `G.tick(dK.st, gio)` giống như hàm `danhNguoi`. | Đảm bảo tính nhất quán của `this.chuHienTai()`, ngăn ngừa lỗi logic khi các hook kiểm tra quyền/tài sản kích hoạt trong giao dịch chợ. | Dễ | **P1 (Cao)** |
| 3 | **Chuyển `scryptSync` sang bất đồng bộ (`crypto.scrypt`)**: Dùng `util.promisify(crypto.scrypt)` trong quá trình đăng ký, đăng nhập và đổi mật khẩu. | Giải phóng Event Loop, tránh nghẽn server và chống tấn công làm tê liệt dịch vụ (DoS). | Trung bình | **P1 (Cao)** |
| 4 | **Hoàn thiện bộ quản lý Rate Limit**: Dọn dẹp key hết hạn định kỳ (cron sweep) hoặc áp dụng thuật toán sliding window thay vì `this.nhip.clear()`. | Đảm bảo hạn mức tần suất truy cập hoạt động liên tục, không bị reset đột ngột khi traffic tăng. | Dễ | **P2 (Trung bình)** |
| 5 | **Bọc `lmTao` vào một Transaction SQLite duy nhất**: Gộp toàn bộ `lmThem`, `lmDoiChinhThe` và cập nhật state người tạo vào một khối giao dịch nguyên tử. | Đảm bảo tính toàn vẹn tuyệt đối (ACID), không để lại liên minh mồ côi khi có lỗi phát sinh. | Dễ | **P2 (Trung bình)** |
| 6 | **Cải tiến Graceful Shutdown**: Chờ cờ `dangNhip === false` và hoàn tất các request HTTP đang dở dang trước khi gọi `kho.dong()`. | Đảm bảo an toàn dữ liệu, chống lỗi kết nối database khi restart hoặc cập nhật server. | Dễ | **P2 (Trung bình)** |
| 7 | **Tách nhỏ `server/world.js` theo Bounded Contexts**: Chia thành `world/combat.js`, `world/market.js`, `world/alliance.js`, `world/migration.js`. | Giảm độ phức tạp của file 1.772 dòng, tuân thủ nguyên tắc SRP, tăng khả năng bảo trì và viết unit test. | Trung bình | **P3 (Dài hạn)** |
| 8 | **Đồng bộ hóa tài liệu `docs/MAY-CHU.md`**: Cập nhật endpoint `/api/admin/tocdo` và cấu trúc trả về của các API chợ v7. | Đảm bảo tài liệu khớp hoàn toàn với hiện trạng mã nguồn. | Rất dễ | **P3 (Thấp)** |
