# Báo cáo đánh giá Hiệu năng & Độ tin cậy (Seat S6)

> **Dự án**: Thiên Hà Đại Chiến (Node >= 22, CommonJS, `node:sqlite`, zero external dependencies)
> **Phạm vi kiểm tra**: Vòng lặp game/tick (`server/world.js`), I/O `node:sqlite` đồng bộ (`server/db.js`), cơ chế polling/mạng (`web/js/mp.js`, `server/api.js`), memory leaks/intervals (`js/app.js`, `js/ui.js`), xử lý lỗi & shutdown (`server/index.js`), trọng lượng tải client (`js/`, `dist/`, `web/index.html`), hệ thống logging, và kịch bản đo tải (`tools/test-tai.js`).
> **Người thực hiện**: Reviewer Hiệu năng & Độ tin cậy (Seat S6)

---

## 1. Tóm tắt

Hệ thống "Thiên Hà Đại Chiến" là một sản phẩm kỹ thuật ấn tượng với triết lý zero-dependency triệt để: toàn bộ máy chủ nhiều người chơi vận hành chỉ bằng các module tích hợp sẵn của Node.js 22+ (`node:http`, `node:sqlite`, `node:crypto`). Nhờ tận dụng mô hình game đẳng cấu (isomorphic), server chia sẻ 100% logic mô phỏng toán học, sản lượng và chiến trận với client mà không bị lệch pha logic. Mô hình Unit-of-Work (UoW) gom toàn bộ mutation của các bên tham chiến vào một transaction SQLite duy nhất giúp dữ liệu PvP và giao dịch ngân hàng/chợ đạt tính toàn vẹn rất cao.

Tuy nhiên, từ góc độ **hiệu năng cao (high throughput)** và **độ tin cậy vận hành (production reliability)**, kiến trúc hiện tại bộc lộ nhiều nút thắt cổ chai nghiêm trọng:
1. **Event Loop bị phong tỏa bởi I/O đồng bộ**: `node:sqlite` là thư viện hoàn toàn đồng bộ (`DatabaseSync`). Mọi thao tác đọc/ghi cơ sở dữ liệu, serialize/deserialize JSON state lớn (20KB - 80KB/tài khoản) đều chạy trên luồng chính (Main Thread).
2. **Scheduler chạy 60 transaction SQLite riêng lẻ mỗi nhịp 3 giây**: Mỗi lần `tg.nhip()` chạy, server thực hiện tuần tự hàng trăm câu truy vấn đĩa đồng bộ, khiến Event Loop bị đóng băng (freeze) từ 100ms đến hàng trăm ms, đẩy p99 latency của HTTP request lên cao.
3. **Polling HTTP 8 giây truyền tải toàn bộ Monolithic State**: Không có WebSocket hay SSE; mỗi client gửi `GET /api/state` định kỳ 8s để nhận về toàn bộ payload JSON lớn, đồng thời kích hoạt 1 transaction ghi đĩa SQLite ở backend ngay cả khi người chơi ở trạng thái nhàn rỗi (idle).
4. **Tranh chấp khóa `dangTick` đẩy lỗi 503 cho người dùng**: Khi background scheduler đang tua một đế quốc, mọi thao tác HTTP của người chơi đó đều bị từ chối với HTTP 503 thay vì được xếp hàng chờ xử lý tuần tự.
5. **Quy trình Shutdown đột ngột, không bảo đảm an toàn dữ liệu**: Hàm `tat()` đóng database và kết thúc tiến trình ngay lập tức mà không đợi các kết nối HTTP in-flight hoàn thành.
6. **Mạng client chịu tải nặng không cần thiết**: 11 file JavaScript riêng biệt (~410 KB) được phục vụ ở chế độ thô không nén (thiếu Gzip/Brotli) và bị ép `Cache-Control: no-cache`. Phía client, hàm `U.live()` tính toán lại toàn bộ `U.sig()` mỗi 1.000ms gây hao pin và áp lực GC liên tục.

---

## 2. Điểm mạnh

1. **Chuẩn hóa 100% Prepared Statements & An toàn truy vấn:**
   - Mọi câu truy vấn trong `server/db.js` (`this.q`) đều được chuẩn bị sẵn (`prepare`) ngay khi khởi động server, liên kết tham số bằng bind parameter (`?`). Việc này giúp SQLite tái sử dụng query execution plan tối ưu và loại bỏ hoàn toàn chi phí biên dịch SQL ở từng request.

2. **Mô hình Unit-of-Work (UoW) đảm bảo tính nguyên tử (Atomicity) của giao dịch:**
   - Cơ chế `batDau()` và `ketThuc()` trong `server/world.js:131-167` gom toàn bộ thay đổi của nhiều thực thể (bên tấn công, bên phòng thủ, hạm đội hỗ trợ, bãi phế liệu, bảng tin, sổ ghi trận) và chỉ `COMMIT` đúng một lần duy nhất ở nhịp ngoài cùng. Nếu có lỗi phát sinh, toàn bộ thao tác được rollback sạch sẽ qua `kho.giaoDich()`.

3. **Cơ chế tự phục hồi (Self-Healing) chỉ mục sau sự cố:**
   - Hàm `_dongBoChiMucTrongGD` (`server/world.js:762-777`) tái thiết lập toàn bộ các bảng chỉ mục phái sinh (`ht`, `hamdang`, `hamgiu`) từ nguồn sự thật duy nhất (`dq.state` JSON) mỗi khi khởi động máy chủ. Điều này giúp hệ thống không bao giờ bị kẹt dữ liệu mồ côi (stale/orphan records) sau khi máy chủ gặp sự cố sập nguồn đột ngột.

4. **Dự đoán và mô phỏng nhẹ phía Client (Client-Side Prediction):**
   - Với `G.MO_PHONG_NHE = true` (`web/js/mp.js:23`), client tự chạy mô phỏng sản xuất cục bộ mỗi giây (`G.tick`), giúp tài nguyên nhảy mượt mà theo thời gian thực mà không cần server phải push dữ liệu từng giây.

5. **Phân tầng giới hạn tần suất (Multi-Tier Rate Limiting) tại cổng API:**
   - `server/api.js` đã triển khai giới hạn tốc độ chi tiết: 40 request/10s cho token thông thường, 8 request/10s cho các endpoint nặng mã hóa CPU như đăng nhập/đăng ký (`scrypt`), 3 tin/10s cho chat và 1 thư/10s cho hòm thư.

6. **Có kịch bản kiểm thử tải bài bản (`tools/test-tai.js`):**
   - Dự án sở hữu công cụ kiểm thử tải thực tế đo đạc trực tiếp hiệu năng tua thời gian 24 giờ cho 60 tài khoản, xử lý 60 trận PvP chéo đồng thời, xác minh tính toàn vẹn số học (không âm, không NaN) và cơ chế chống đệ quy khóa tài khoản.

---

## 3. Vấn đề phát hiện (Kèm bằng chứng file / dòng)

### 3.1. Vòng lặp Game/Tick & Bộ lập lịch Scheduler

- **VĐ-01: Scheduler `tg.nhip()` chạy 60 transaction SQLite riêng lẻ tuần tự gây đóng băng Event Loop**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/index.js#L118-L128`, `file:///home/linh/linh/thienhadaichien/server/world.js#L1760-L1769`, `file:///home/linh/linh/thienhadaichien/server/world.js#L747-L758`.
  - **Cơ chế**: Cứ mỗi 3.000ms, timer gọi `tg.nhip()`. Hàm này truy vấn `dqDenHan.all(now, 60)` lấy tối đa 60 tài khoản đến hạn và chạy vòng lặp `for (var i = 0; i < ds.length; i++) this.tick(ds[i].tk, now);`. Vì mỗi lần gọi `this.tick()` độc lập không nằm trong ngữ cảnh `ctx` chung, `this.luu()` sẽ gọi `this.kho.giaoDich()` riêng cho từng tài khoản.
  - **Hệ quả**: 60 tài khoản tương đương 60 transaction SQLite riêng biệt (`BEGIN` ... `COMMIT`). Với I/O đĩa thông thường, 60 lần commit tuần tự có thể tiêu tốn từ 100ms đến 500ms CPU hoàn toàn đồng bộ trên luồng chính. Trong suốt khoảng thời gian này, Event Loop bị tê liệt, máy chủ không thể tiếp nhận kết nối mạng hay xử lý bất kỳ request HTTP nào khác, tạo ra hiện tượng lag đột biến (latency spikes).

- **VĐ-02: Tranh chấp khóa `dangTick` giữa Scheduler và HTTP Request trả về lỗi HTTP 503 cho người chơi**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/world.js#L832`, `file:///home/linh/linh/thienhadaichien/server/world.js#L875`, `file:///home/linh/linh/thienhadaichien/server/api.js#L228-L230`.
  - **Cơ chế**: `TheGioi.prototype.dangTick` sử dụng một `Set` lưu ID các tài khoản đang trong quá trình tick. Khi người chơi gửi thao tác lên `POST /api/lam`, hàm `hanhDong` gọi `this.tick()`. Nếu scheduler đang tua tài khoản này trong nền (`this.dangTick.has(tk)`), hàm trả về null và ném ra lỗi `'Đế quốc đang được xử lý, thử lại sau một nhịp.'`. Tại `api.js:229`, server lập tức phản hồi mã lỗi `HTTP 503`.
  - **Hệ quả**: Người chơi nhận thông báo lỗi hệ thống và bị từ chối hành động dù họ thao tác hoàn toàn hợp lệ. Thay vì xếp hàng (queue) chờ vài mili-giây để nhịp nền hoàn tất, hệ thống bắt client phải chịu lỗi và tự thử lại bằng tay.

- **VĐ-03: Xóa và ghi lại toàn bộ bảng chỉ mục (`ht`, `hamdang`, `hamgiu`) trong mọi lần lưu state**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/world.js#L735-L745`.
  - **Cơ chế**: Trong `TheGioi.prototype._ghiNhieu`, mỗi lần lưu tài khoản (kể cả chỉ tăng tài nguyên thông thường qua `tick` định kỳ), server thực hiện:
    `kho.q.htXoaCua.run(x.tk); kho.q.hdXoaCua.run(x.tk); kho.q.hgXoaCua.run(x.tk);`
    sau đó lặp qua tất cả hành tinh để `kho.q.htThem.run(...)` và gọi `_ghiChiMucHam(...)`.
  - **Hệ quả**: Gây ra hiện tượng B-Tree index churn rất lớn trên 5 index (`ht_tk`, `hamdang_tkd`, `hamdang_den_nv`, `hamgiu_td`, `hamgiu_due`). Một tài khoản có 10 hành tinh và 5 hạm đội sẽ kích hoạt 18 câu lệnh ghi SQL mỗi nhịp tick chỉ để ghi lại dữ liệu hành tinh không hề thay đổi tên hay tọa độ.

- **VĐ-04: Hiện tượng hoãn trận dây chuyền khi nhiều trận PvP diễn ra đồng thời**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/world.js#L910-L914`, `file:///home/linh/linh/thienhadaichien/tools/test-tai.js#L117-L127`.
  - **Cơ chế**: Trong `TheGioi.prototype.danhNguoi`, server gom toàn bộ ID người phòng thủ và đồng minh (`can`). Nếu bất kỳ ai trong số họ đang nằm trong `this.dangTick`, hạm đội tấn công sẽ bị hoãn lại 20 giây (`f.den_t = st.now + 20; return;`). Kịch bản `tools/test-tai.js` cho thấy khi 60 người đồng thời tấn công chéo, hệ thống phải mất tới 12 vòng lặp scheduler kế tiếp mới thanh toán xong toàn bộ các hạm đội bị hoãn.
  - **Hệ quả**: Khi số lượng người chơi lớn và diễn ra đại chiến liên minh (hàng chục hạm đội cùng đổ về một tọa độ), cơ chế khóa thô này khiến các trận đánh bị dời thời gian liên tục, gây chậm trễ kết quả giao tranh và tích tụ khối lượng tính toán lớn dồn về các nhịp sau.

---

### 3.2. Tầng Database & I/O `node:sqlite`

- **VĐ-05: Toàn bộ thao tác `DatabaseSync` là đồng bộ và thiếu PRAGMA tối ưu cho WAL**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/db.js#L5-L11`.
  - **Cơ chế**: `server/db.js` dùng `node:sqlite` (`sqlite.DatabaseSync`). Thư viện này chỉ cung cấp các API đồng bộ (synchronous). Khi cấu hình, file chỉ chạy:
    `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=4000;`
    mà thiếu hoàn toàn `PRAGMA synchronous = NORMAL;`, `PRAGMA cache_size = -64000;` (64MB) và `PRAGMA temp_store = MEMORY;`.
  - **Hệ quả**: Trong chế độ WAL của SQLite, nếu không đặt `synchronous = NORMAL`, giá trị mặc định là `FULL`. Mỗi lệnh `COMMIT` vẫn buộc hệ thống phải gọi fsync đồng bộ xuống đĩa. Hơn nữa, vì `busy_timeout` đặt tới 4.000ms, nếu có lock tranh chấp, luồng chính của Node.js sẽ bị block cứng đến 4 giây, làm đứt đoạn hoàn toàn dịch vụ.

- **VĐ-06: Monolithic JSON State trong `dq.state` gây áp lực CPU và Garbage Collection (GC) lớn**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/db.js#L36-L49`, `file:///home/linh/linh/thienhadaichien/server/world.js#L671`, `file:///home/linh/linh/thienhadaichien/server/world.js#L690`.
  - **Cơ chế**: Toàn bộ dữ liệu của một người chơi được nhồi vào một cột duy nhất `dq.state TEXT NOT NULL` (bao gồm công trình 10 hành tinh, danh sách tàu, công nghệ, hàng đợi, 150 tin nhắn, 120 dòng nhật ký). Mỗi lần đọc phải qua `JSON.parse()`, mỗi lần lưu phải qua `JSON.stringify()`.
  - **Hệ quả**: Kích thước mỗi bản ghi dao động từ 20KB đến 80KB. Khi có hàng trăm người chơi hoạt động, việc parse và stringify hàng ngàn lần mỗi phút tiêu tốn rất nhiều CPU và liên tục cấp phát các chuỗi bộ nhớ ngắn hạn, buộc V8 Garbage Collector phải kích hoạt GC dọn dẹp liên tục, tạo ra hiện tượng giật cục (GC pauses).

---

### 3.3. Cơ chế Polling & Đồng bộ Mạng

- **VĐ-07: Polling HTTP 8 giây truyền toàn bộ state lớn, kích hoạt ghi đĩa không cần thiết ở backend**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L128-L152`, `file:///home/linh/linh/thienhadaichien/server/api.js#L119-L134`.
  - **Cơ chế**: Không có WebSocket hay SSE. Client sử dụng polling HTTP: cứ mỗi 8 giây lại gọi `GET /api/state`. Trên server, hàm `goiState(p)` gọi `this.tg.tick(p.tk, null)`, sau đó tuần tự hóa và trả về toàn bộ cây state đồ sộ `{ st: st, sv: ..., toi: ... }`.
  - **Hệ quả**:
    1. Về mạng: 200 người chơi online sẽ tạo ra 25 request/giây. Với mỗi response nặng ~40KB (chưa nén), băng thông mạng outbound tiêu tốn khoảng 1.0 MB/s (~8 Mbps) chỉ riêng cho tác vụ giữ trạng thái nhàn rỗi.
    2. Về đĩa: Mỗi request `/api/state` lại chạy `tg.tick()`, kích hoạt một transaction ghi SQLite `_ghiNhieu` xuống đĩa. Người chơi không làm gì thì server vẫn liên tục ghi đĩa 25 lần/giây.

- **VĐ-08: Độ trễ cập nhật Chat và Cảnh báo tấn công lên tới 8 giây**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L143-L144`, `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L266-L282`.
  - **Cơ chế**: Kênh chat và danh sách hạm đội bay tới (`pvpToi`) không có kênh đẩy sự kiện tức thời (push notification/SSE/WebSocket). Mọi thông tin chỉ được làm mới khi chu kỳ 8s của hàm `dongBo()` kích hoạt.
  - **Hệ quả**: Hai người chơi trò chuyện trong liên minh phải chịu độ trễ trung bình 4-8 giây cho mỗi tin nhắn. Nghiêm trọng hơn, khi bị đối phương tấn công bất ngờ, cảnh báo có thể bị trễ tới 8 giây, làm mất đi thời gian phản ứng phòng thủ quý giá của người chơi.

- **VĐ-09: Thiếu Exponential Backoff & Jitter khi mất kết nối (nguy cơ Thundering Herd)**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L128-L152`.
  - **Cơ chế**: Khi kết nối mạng bị gián đoạn hoặc server phản hồi lỗi (500/503), client chỉ tăng biến đếm `demLoiDongBo` nhưng tần suất gọi `dongBo()` vẫn giữ nguyên cố định 8 giây một lần (`if (++demGiay >= 8)`).
  - **Hệ quả**: Nếu server gặp sự cố quá tải tạm thời hoặc vừa khởi động lại, hàng trăm client đang chờ sẽ đồng loạt gửi request tới server cùng lúc (thundering herd) mà không có bước giãn cách ngẫu nhiên (jitter) hay tăng thời gian chờ (exponential backoff), dễ khiến server rơi vào vòng lặp quá tải thứ cấp.

- **VĐ-10: Cơ chế Rate Limiting `this.nhip.clear()` xóa sổ toàn bộ giới hạn khi vượt 5.000 khóa**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/api.js#L68-L75`.
  - **Cơ chế**: Trong `API.prototype.gioiHan`:
    `if (this.nhip.size > 5000) this.nhip.clear();`
  - **Hệ quả**: Nếu có lưu lượng truy cập lớn hoặc kẻ tấn công cố tình spam với hàng ngàn token/IP rác, Map rate-limit sẽ đạt mốc 5.000 và bị xóa sạch (`clear()`). Ngay lập tức, bộ đếm của mọi người dùng khác bị reset về 0, vô hiệu hóa hoàn toàn cơ chế bảo vệ rate-limit của máy chủ.

---

### 3.4. Rò rỉ tài nguyên & Memory Leaks Client/Server

- **VĐ-11: `U.live()` tính toán lại toàn bộ `U.sig()` mỗi 1.000ms gây giật lag và hao pin client**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/js/app.js#L463-L470`, `file:///home/linh/linh/thienhadaichien/js/ui.js#L2658-L2661`, `file:///home/linh/linh/thienhadaichien/js/ui.js#L507-L574`.
  - **Cơ chế**: Cứ mỗi giây, `APP.batDauNhip` kích hoạt `U.live()`. Dòng đầu tiên của `U.live()` gọi `U.sig() !== U.sigCu`. Hàm `U.sig()` thực hiện: lặp qua tất cả hành tinh, tính năng suất, dung tích kho, tính toán danh sách alert (`U.tinhViecCanXuLy`), phân loại mảng tàu/phòng thủ, và gọi `JSON.stringify(sig)`.
  - **Hệ quả**: Việc cấp phát mảng và chuỗi liên tục mỗi 1.000ms chỉ để so sánh chữ ký trạng thái sinh ra lượng rác bộ nhớ khổng lồ trên trình duyệt. Trên điện thoại hoặc laptop chạy pin, điều này làm quạt quay mạnh, nóng máy và gây micro-stutter cho giao diện.

- **VĐ-12: `APP.batDauNhip` tạo Interval vĩnh viễn không thể hủy và không có cờ chống chạy trùng**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/js/app.js#L462-L480`.
  - **Cơ chế**: `APP.batDauNhip` tạo một `setInterval(..., 1000)` ẩn danh, không lưu ID vào bất kỳ thuộc tính nào của `APP` và không có cờ kiểm tra xem interval đã chạy hay chưa.
  - **Hệ quả**: Trong các kịch bản kiểm thử tự động, chuyển trang đơn (SPA) hoặc nạp lại script, mỗi lần gọi `APP.batDauNhip()` sẽ sinh thêm một luồng timer chạy vĩnh viễn trong nền, không bao giờ được giải phóng (`clearInterval`), gây rò rỉ bộ nhớ client nghiêm trọng.

---

### 3.5. Xử lý lỗi & Khôi phục sự cố

- **VĐ-13: Quy trình Shutdown trong `tat()` đóng database và exit ngay lập tức khi request đang chạy**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/index.js#L139-L151`.
  - **Cơ chế**:
    ```javascript
    function tat() {
      clearInterval(boDem); clearInterval(boDon);
      try { server.close(); } catch (e) { }
      var thoat = false;
      try { kho.dong(); thoat = true; } catch (e) { ... }
      if (thoat) process.exit(0);
    }
    ```
    Hàm `server.close()` là tác vụ bất đồng bộ cần thời gian để đóng các socket và hoàn tất request đang dở. Tuy nhiên, code không hề truyền callback mà lập tức gọi tiếp `kho.dong()` (`this.db.close()`) và `process.exit(0)`.
  - **Hệ quả**: Khi server nhận tín hiệu restart từ môi trường production (như Docker, systemd, PM2), các request HTTP đang ghi dữ liệu hoặc nhịp scheduler đang chạy dở sẽ bị đứt gánh giữa đường, ném lỗi database closed, làm người chơi bị mất mát hành động hoặc nhận lỗi 502/500 vô lý.

- **VĐ-14: Thiếu Global Handlers cho `uncaughtException` và `unhandledRejection`**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/index.js#L139-L151`.
  - **Cơ chế**: Không có bộ lắng nghe `process.on('uncaughtException')` và `process.on('unhandledRejection')`.
  - **Hệ quả**: Nếu một ngoại lệ bất ngờ xảy ra bên ngoài luồng HTTP (ví dụ trong timer `setInterval` hoặc trong một event emitter ngầm định của stream I/O), toàn bộ tiến trình Node.js sẽ lập tức sập nguồn (crash), ngắt kết nối của tất cả người chơi trong vũ trụ.

---

### 3.6. Trọng lượng tải Client & Tối ưu tĩnh

- **VĐ-15: Phục vụ file tĩnh không nén (Gzip/Brotli) và áp đặt `Cache-Control: no-cache`**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/index.js#L48-L70`, `file:///home/linh/linh/thienhadaichien/web/index.html#L109-L119`.
  - **Cơ chế**: Hàm `traFile` đặt header `'Cache-Control': 'no-cache'` cho mọi file tĩnh (`.js`, `.css`, v.v.) và đọc file qua `fs.readFile` gửi thẳng ra `res.end(d)` mà không kiểm tra nén gzip/brotli.
  - **Hệ quả**: `web/index.html` yêu cầu 11 file JS (~410 KB) và 2 file CSS (~45 KB). Không có cache, mỗi lần người chơi truy cập hoặc F5 lại trang, trình duyệt phải tải lại toàn bộ 455+ KB mã nguồn thô qua 13-15 request HTTP riêng biệt, khiến thời gian nạp trang đầu tiên (FCP) trên mạng di động bị kéo dài từ 2 đến 4 giây.

- **VĐ-16: Khối lượng file client lớn (`js/ui.js` 184 KB, ~2.870 dòng) nạp rời rạc không minified**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/js/ui.js`, `file:///home/linh/linh/thienhadaichien/web/index.html#L109-L119`.
  - **Cơ chế**: Trong khi bản solo có công cụ đóng gói `tools/build.js` thành 1 file HTML duy nhất, bản multiplayer lại chạy trực tiếp 11 file JS phát triển chứa đầy đủ comment, chuỗi template HTML và ký tự khoảng trắng thừa.
  - **Hệ quả**: Tăng chi phí parse và compile mã nguồn JavaScript của trình duyệt trên các thiết bị cấu hình thấp.

---

### 3.7. Logging & Khả năng quan sát

- **VĐ-17: Logging phân mảnh, không cấu trúc và thiếu đo lường độ trễ (Latency/Metrics)**
  - **Bằng chứng**: `file:///home/linh/linh/thienhadaichien/server/index.js#L100,L125`, `file:///home/linh/linh/thienhadaichien/server/world.js#L380,L673,L1766`.
  - **Cơ chế**: Mã nguồn sử dụng `console.log` / `console.error` rải rác không kèm timestamp chuẩn ISO, không có log level (DEBUG/INFO/WARN/ERROR), không có request ID liên kết và không có log ghi nhận thời gian thực thi (latency ms) của các request API hay nhịp scheduler.
  - **Hệ quả**: Khi server xảy ra hiện tượng phản hồi chậm hoặc nghẽn I/O trong môi trường production, đội ngũ vận hành hoàn toàn "mù thông tin", không thể tra cứu được nguyên nhân xuất phát từ câu truy vấn SQL nào hay do endpoint API nào gây ra.

---

## 4. Đề xuất cải tiến

### Bảng tổng hợp đề xuất

| STT | Đề xuất cải tiến | Lợi ích mang lại | Độ khó | Ưu tiên |
|---|---|---|---|---|
| **01** | Bật PRAGMA `synchronous = NORMAL`, `cache_size = -64000`, `temp_store = MEMORY` trong `server/db.js` | Giảm thời gian fsync khi COMMIT từ ~10ms xuống <0.1ms; tăng tốc độ ghi đĩa gấp 10-50 lần | Dễ | **P0** |
| **02** | Xử lý Graceful Shutdown chuẩn trong `server/index.js` (chờ `server.close(cb)`, đợi request in-flight rồi mới đóng DB) | Loại bỏ hoàn toàn lỗi crash và rủi ro hỏng giao dịch khi khởi động lại server hoặc deploy | Dễ | **P0** |
| **03** | Gom 60 lượt tick của scheduler `tg.nhip()` vào một transaction SQLite duy nhất (Batch Transaction) | Giảm từ 60 lần `COMMIT` xuống đúng 1 lần `COMMIT` mỗi nhịp 3s; giảm 90% thời gian khóa Event Loop | Vừa | **P0** |
| **04** | Thay thế lỗi 503 khi trùng `dangTick` bằng cơ chế Promise Chaining / In-Memory Lock Queue theo `tk` | Người chơi không bao giờ bị ném lỗi 503 vô cớ khi thao tác trùng nhịp scheduler nền | Vừa | **P0** |
| **05** | Bổ sung nén Gzip/Brotli (`node:zlib`) và cấu hình HTTP Caching (`ETag` / `max-age`) cho file tĩnh trong `server/index.js` | Giảm 70% dung lượng truyền tải mạng cho client (~450KB xuống ~120KB); tải trang tức thì khi F5 | Dễ | **P1** |
| **06** | Triển khai Server-Sent Events (SSE) hoặc WebSocket siêu nhẹ cho Chat và Cảnh báo PvP | Cập nhật tin nhắn và báo động địch tức thì (real-time < 100ms); giảm 80% số lượng request polling rác | Vừa | **P1** |
| **07** | Triển khai Conditional Polling (`If-None-Match` / State Hash) cho `/api/state` | Trả về `304 Not Modified` rỗng nếu state không đổi; tiết kiệm 95% băng thông và tránh ghi đĩa vô ích | Vừa | **P1** |
| **08** | Bổ sung Exponential Backoff và Randomized Jitter vào hàm `dongBo()` trong `web/js/mp.js` | Triệt tiêu nguy cơ sập dây chuyền (thundering herd) khi mạng chập chờn hoặc server restart | Dễ | **P1** |
| **09** | Tách cơ chế Dirty Check cho bảng chỉ mục `ht`, `hamdang`, `hamgiu` (chỉ ghi khi hạm đội/hành tinh thực sự đổi) | Cắt giảm 80% câu lệnh `DELETE` và `INSERT` rác trong mỗi lần tick tài nguyên | Vừa | **P1** |
| **10** | Tối ưu `U.live()` phía client: loại bỏ `JSON.stringify(sig)` mỗi giây, chỉ so sánh các trường số nguyên động | Giảm 90% áp lực Garbage Collection phía client; tiết kiệm pin và loại bỏ micro-stutter trên mobile | Vừa | **P1** |
| **11** | Cải tiến cơ chế Rate Limiting trong `server/api.js`: dùng Sliding Window / LRU thay vì `this.nhip.clear()` | Ngăn chặn kẻ xấu lợi dụng tràn bảng để xóa sạch rate limit của toàn server | Dễ | **P2** |
| **12** | Xây dựng công cụ Bundle & Minify nhẹ cho client multiplayer (`tools/build-mp.js`) | Gộp 11 file script thành 1 file minified; giảm số lượng round-trip HTTP lúc tải game | Vừa | **P2** |
| **13** | Chuẩn hóa Structured Logging (JSON log có timestamp, request latency, query duration) | Giúp giám sát, phát hiện sớm các câu query chậm và sự cố nghẽn mạng trong vận hành | Vừa | **P2** |

---

### Lộ trình thực hiện khuyến nghị

1. **Giai đoạn 1 (Khẩn cấp — Quick Wins trong 1 ngày):**
   - Áp dụng ngay `PRAGMA synchronous = NORMAL` trong `server/db.js`.
   - Sửa hàm `tat()` trong `server/index.js` thành async graceful shutdown có timeout 5s.
   - Thêm nén `zlib.gzipSync` cho `traFile` và header `Cache-Control: public, max-age=86400` cho tài sản tĩnh.
   - Bổ sung `process.on('uncaughtException')` và `unhandledRejection` để ghi log lỗi thay vì chết process.

2. **Giai đoạn 2 (Tối ưu cốt lõi Backend & Mạng trong 2-3 ngày):**
   - Bọc toàn bộ vòng lặp trong `TheGioi.prototype.nhip` vào `this.batDau()` / `this.ketThuc()` để gom 60 tick thành 1 commit duy nhất.
   - Thay đổi API `/api/state`: hỗ trợ header `If-None-Match` (dựa trên `st.lastTick + st.now`), nếu state chưa đổi và không có hạm mới thì trả về `304 Not Modified`.
   - Thêm Exponential Backoff có jitter cho `dongBo()` trong `web/js/mp.js`.
   - Thay cơ chế `dangTick` trả về 503 bằng promise queue cho từng `tk`.

3. **Giai đoạn 3 (Nâng cao trải nghiệm & Hiện đại hóa trong 1 tuần):**
   - Bổ sung 1 endpoint SSE siêu nhẹ `/api/su-kien` đẩy tin nhắn chat và báo động đỏ tức thì.
   - Viết script `tools/build-mp.js` để bundle và minify mã nguồn client nhiều người chơi.
   - Refactor `U.live()` trong `js/ui.js` để theo dõi các phần tử DOM cụ thể thay vì hash toàn bộ state mỗi giây.
