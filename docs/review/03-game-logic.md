# Báo cáo Review Game Logic & Dữ liệu — Thiên Hà Đại Chiến (Seat S3)

## 1. Tóm tắt

Dự án "Thiên Hà Đại Chiến" là một bản phục dựng công phu webgame chiến thuật vũ trụ năm 2004 của tác giả Trần Châu Quốc Bình. Về mặt Game Logic và Dữ liệu, dự án đạt được thành tựu nổi bật khi tái hiện thành công toàn bộ hệ thống cơ chế đặc thù vượt ngoài khuôn khổ OGame cổ điển: chu kỳ bảo trì 6 giờ, nghiên cứu rút vốn dần theo checkpoint, phòng thủ hai lớp (quỹ đạo và mặt đất), đổi mục tiêu giữa đường, đóng quân giữ quỹ đạo và đổ bộ phá hủy công trình bằng Robot/Tank. Toàn bộ 241/241 bài kiểm tra trong `tools/smoke.js` đều vượt qua, bảo đảm tính toán tất định theo thời gian thực (deterministic timeline).

Tuy nhiên, qua rà soát chi tiết mã nguồn (`js/combat.js`, `js/fleet.js`, `js/galaxy.js`, `js/thitruong.js`, `js/data.js`, `server/rules.js` đối chiếu `tools/smoke.js`, `server/world.js` và `README.md`), hệ thống bộc lộ những khiếm khuyết logic đáng kể:
1. **Lệch pha luật chơi giữa Solo và Multiplayer:** Chợ solo bị nghẽn hoàn toàn chiều bán (đơn đăng bán của người chơi không có NPC mua, khiến hướng dẫn bán Kim Loại trả bảo trì trong `README.md` bị vô hiệu); cơ chế đổ bộ phá hủy công trình thực tế chỉ hoạt động ở multiplayer do NPC không có dữ liệu công trình `p.b`; công thức tính cướp bóc khi đổ bộ thắng bị sai lệch số học giữa hai chế độ (67.5% ở solo vs 85% ở server).
2. **Khuyết tật số học trong Combat & Fleet:** Mô hình gom nhóm (macro) trong `combat.js` làm méo mó bản chất của Rapidfire (mang tàu nhỏ làm bia đỡ đạn lại làm khuếch đại số phát bắn của địch vào tàu lớn của phe mình); thuật toán phục hồi công sự chạy vòng lặp ngẫu nhiên `O(N)` phá vỡ cam kết hiệu năng khi quân số lên tới hàng triệu đơn vị; khoảng cách đổi hướng hạm đội dùng phép nội suy tuyến tính hai đầu mút sai lệch lớn so với hình học không gian.
3. **Cấu trúc dữ liệu phân mảnh và khả năng mở rộng kém:** Dữ liệu trong `data.js` chưa phải là schema hướng dữ liệu (data-driven) hoàn chỉnh mà bị hardcode hiệu ứng rải rác trong `engine.js` và `fleet.js`; công trình đắt đỏ "Cổng Không Gian" (`jumpGate`) hoàn toàn là code rỗng (dead content); trùng ID giữa công trình `robot` và quân đổ bộ `robot`; cùng một rừng con số ma thuật (magic numbers) không được đưa vào bảng hằng số.

---

## 2. Điểm mạnh

1. **Tái hiện trung thực và sâu sắc các cơ chế cốt lõi của game gốc 2004:**
   - Cơ chế nhịp bảo trì 6 giờ (`CHU_KY_BAO_TRI = 21600` giây) và nghiên cứu trả góp (`research-installments-v1`): chi phí nghiên cứu được phân bổ đều qua các checkpoint, thiếu tài nguyên hoặc thiếu bảo trì tại checkpoint sẽ hoãn đúng 6 giờ theo nguyên tắc giao dịch nguyên khối (atomic).
   - Cơ chế phòng thủ hai lớp: lớp quỹ đạo giao chiến trước, chỉ khi quét sạch quỹ đạo và từ vòng 3 trở đi hạm đội mới hạ độ cao đánh vào lớp mặt đất (`js/combat.js:142-156`).
   - Đổi mục tiêu giữa đường (`G.doiMucTieu` trong `js/fleet.js:319-375`): hỗ trợ đổi hướng cho cả hạm đội đang đi, đang giữ quỹ đạo và đang quay về, tính toán lại thời gian bay và phụ thu Galana/nhiên liệu.
   - Giữ quỹ đạo thật (`giu-quy-dao-v1` trong `js/fleet.js:142-212`): hạm đội trả trước nhiên liệu theo từng chặng 6 giờ từ khoang hàng, thiếu nhiên liệu sẽ tan rã thành phế liệu trên quỹ đạo.
   - 5 loại hành tinh (`js/data.js:30-51`) bám sát mô tả gốc: Sa Mạc giàu Kim Loại và điện nhưng đói Thực Phẩm; Băng Hà giàu Thạch Anh và phòng thủ đất dày; Nước nhiều Nhiên Liệu nhưng ít ô đất; Rừng Già dồi dào Thực Phẩm và diện tích đất rộng.

2. **Thiết kế tính toán theo lô O(số loại) xử lý quy mô hàng tỷ đơn vị:**
   - Để mô phỏng quy mô webgame thời kỳ 2004–2006 (hàng triệu MBCD, hàng tỷ tài nguyên), hầu hết thuật toán cốt lõi (`suyThoaiCongTrinhNhip`, `phaCongTrinh`, `sanXuat`, `chayXuong`, `diem`) được thiết kế xử lý theo nhóm loại đơn vị (`O(số loại)`) thay vì lặp qua từng thực thể, giữ cho thời gian xử lý luôn dưới 10ms kể cả khi tua 30 ngày offline.

3. **Vũ trụ tất định và mô phỏng thời gian thực độc lập:**
   - Hệ thống thiên hà 9 × 499 × 15 được sinh tất định từ hạt giống (`st.seed`), giúp giảm thiểu dung lượng lưu trữ (chỉ lưu các ô có can thiệp của người chơi).
   - Mô phỏng dòng thời gian (`G.tick`, `G.sukienKe`) xử lý tuần tự từng mốc sự kiện phát sinh, bảo đảm tính nhất quán toán học tuyệt đối giữa việc tick liên tục từng giây và việc tua bù một quãng dài khi người chơi quay lại sau nhiều ngày.

4. **Kiểm thử lõi tự động hóa mạnh mẽ (`tools/smoke.js`):**
   - Bộ smoke test chạy độc lập không phụ thuộc trình duyệt, kiểm tra 241 tiêu chí khắt khe: từ tính lũy kế migration v3→v7, tính bất biến sau khi lưu/nạp JSON, đến kiểm tra triệt để nguy cơ trôi số (drift) và phát hiện giá trị `NaN`/`Infinity`.

---

## 3. Vấn đề

### VĐ-01: Thị trường Solo bị nghẽn (Deadlock) — Người chơi không thể thanh lý tài nguyên lấy Galana
- **Bằng chứng:**
  - `js/thitruong.js:60-61`: Hàm `G.dangBan` trừ tài nguyên khỏi kho hành tinh và đẩy đơn vào mảng `st.choDon`.
  - `js/thitruong.js:93-94`: Hàm `G.muaDon` chặn: `if (!don.npc && st.choDon.indexOf(don) >= 0) return 'Không thể tự mua đơn của chính mình.';`.
  - Toàn bộ `js/thitruong.js` và `js/fleet.js`: Không hề có logic bot NPC định kỳ quét mua các đơn trong `st.choDon`.
  - `js/actions.js:98-103`: Chợ cũ đã bị đóng cứng (`ban` và `mua` trả về chuỗi thông báo lỗi yêu cầu sang màn mới).
  - `README.md:161, 172`: Hướng dẫn khẳng định: *"Chợ Thiên Hà: quy đổi tài nguyên ↔ Galana khi cần tiền trả bảo trì"* và *"Bí tiền thì ra Chợ Thiên Hà bán Kim Loại"*.
- **Hệ quả:**
  - Trong chế độ chơi đơn (Solo), người chơi đăng bán tài nguyên thì tài nguyên bị giam vĩnh viễn trong đơn, không bao giờ thu được Galana trừ khi hủy đơn lấy lại hàng.
  - Người chơi làm theo đúng hướng dẫn của game sẽ bị cạn kiệt Galana, dẫn đến vỡ nợ bảo trì ở checkpoint 6 giờ, làm chậm nghiên cứu, mất dân và hỏng công trình một cách oan uổng.

### VĐ-02: Bất nhất công thức số học cướp bóc đổ bộ giữa Solo và Multiplayer
- **Bằng chứng:**
  - `js/fleet.js:501, 519-526` (Solo):
    - Đợt 1 (trên không): cướp 50% kho: `cuop = G.chiaHang(n.res, ..., G.C.CUOP_TOI_DA);` (trừ khỏi `n.res`).
    - Đợt 2 (đổ bộ thắng): cướp thêm 35% trên **phần kho còn lại**: `themCuop = G.chiaHang(n.res, ..., G.C.CUOP_DO_BO);`. Tổng tỷ lệ cướp được là: $50\% + (100\% - 50\%) \times 35\% = 67.5\%$.
  - `server/world.js:1045-1046` (Multiplayer):
    - Tính gộp thẳng: `var tyLe = (doBo && doBo.thang) ? Math.min(0.85, G.C.CUOP_TOI_DA + G.C.CUOP_DO_BO) : G.C.CUOP_TOI_DA; cuop = G.chiaHang(dp.res, ..., tyLe);`. Tỷ lệ cướp là $50\% + 35\% = 85\%$.
- **Hệ quả:**
  - Cùng một trận đánh đổ bộ thắng lợi hoàn toàn, người chơi multiplayer cướp được 85% tài nguyên đối phương, trong khi người chơi solo chỉ cướp được 67.5%. Hai nhánh mã nguồn client và server mâu thuẫn trực tiếp về công thức cân bằng kinh tế chiến tranh.

### VĐ-03: Cơ chế đổ bộ phá hủy công trình (`phaCongTrinh`) bị vô hiệu hóa hoàn toàn trong chế độ Solo
- **Bằng chứng:**
  - `js/fleet.js:514`: Khi đánh NPC, hàm gọi `doBo = G.doBoXuong(st, f, { ten: n.ten, tech: n.tech, linh: n.linh, def: thuDat0, thuDat: Lmuc.thuDat, loaiHT: Lmuc.id });` — đối tượng truyền vào **hoàn toàn không có thuộc tính `p`** (hành tinh mục tiêu).
  - `js/fleet.js:1443`: Trong `G.doBoXuong`: `if (thang && ben.p) phaCT = G.phaCongTrinh(st, ben.p, G.sucPhaCT(f.linh));`. Vì `ben.p` là `undefined`, `G.phaCongTrinh` không bao giờ được gọi.
  - `js/galaxy.js:68-90`: Cấu trúc dữ liệu của NPC chỉ lưu `diem`, `tech`, `ships`, `def`, `res`, không hề có bảng công trình `b`.
  - `js/fleet.js:876-885`: Khi NPC phản công người chơi (`G.hepRaid`), NPC chỉ sinh hạm đội tàu (`ships`), không bao giờ mang theo quân đổ bộ `linh`.
- **Hệ quả:**
  - Tính năng đổ bộ phá hủy công trình (vốn là niềm tự hào phục dựng từ trận Start War III 2006) hoàn toàn không tồn tại trong chế độ một người. Người chơi đầu tư hàng trăm ngàn Tank/Robot ở bản solo chỉ nhận thêm một lượng tài nguyên cướp bóc mà không bao giờ phá được công trình nào của NPC, và công trình của người chơi cũng không bao giờ bị đe dọa bởi quân đổ bộ NPC.

### VĐ-04: Nghịch lý số học Rapidfire trong mô hình gom nhóm — Fodder biến thành gánh nặng
- **Bằng chứng:**
  - `js/combat.js:53-57`: `heSoBanNhanh` tính tỷ lệ bắn tiếp trung bình của một loại tàu công dựa trên tỷ lệ số lượng của các loại tàu thủ: $q = \sum (n_i / \text{tongDich}) \times (r_i - 1) / r_i$, sau đó trả về hệ số bắn $\text{phat} = n \times 1/(1 - q)$.
  - `js/combat.js:74-76`: Toàn bộ số phát bắn gia tăng này được phân bổ lại cho mọi mục tiêu bên thủ theo tỷ lệ số lượng: $p = \text{phat} \times (dich[j].n / \text{tongDich})$.
- **Hệ quả:**
  - Trong OGame gốc, rapidfire kích hoạt trên từng phát bắn độc lập khi bắn trúng đúng loại tàu tương ứng.
  - Trong công thức gom nhóm tại `combat.js`, nếu bên phòng thủ đưa vào nhiều tàu nhỏ có rapidfire cao (ví dụ: Tàu Do Thám `probe` chịu rapidfire 5 từ Cruiser, 1250 từ Fortress), hệ số $q$ của phe công sẽ tăng vọt lên sát ngưỡng `0.999`. Tổng số phát bắn của Cruiser/Fortress tăng gấp bội, và số phát bắn gia tăng này được nã ngược vào các tàu chiến chủ lực (Battleship, Destroyer) của bên thủ. Việc mang "bia đỡ đạn" rẻ tiền vô tình tiếp thêm hỏa lực cho địch tiêu diệt hạm đội nặng của chính mình.

### VĐ-05: Vòng lặp `O(N)` trong cơ chế sửa chữa công sự gây nguy cơ treo luồng (Event Loop Freeze)
- **Bằng chứng:**
  - `js/combat.js:215`: Sau trận đánh, số công sự mặt đất bị phá `m` được thử phục hồi 70% qua vòng lặp:
    `for (var k = 0; k < m; k++) if (rnd() < G.C.SUA_CONG_SU) sua++;`.
- **Hệ quả:**
  - Trong các trận đánh lớn cuối game (đặc trưng OGame/THDC có thể có hàng triệu Bệ Phóng Tên Lửa `missileLauncher` hoặc Pháo Laser), giá trị `m` có thể lên tới $5.000.000 - 10.000.000$.
  - Vòng lặp `for` chạy hàng triệu lần gọi hàm PRNG tuần tự sẽ làm đóng băng (block) hoàn toàn luồng chính của Node.js hoặc trình duyệt trong nhiều giây. Trong khi toàn bộ engine đã được tối ưu sang `O(số loại)`, dòng code này là một lỗ hổng nghiêm trọng về hiệu năng (DoS vector trong server multiplayer).

### VĐ-06: Phép nội suy tuyến tính sai lệch khi đổi mục tiêu hạm đội giữa đường
- **Bằng chứng:**
  - `js/fleet.js:345-348`:
    `var fr = dangGiu ? 1 : (tong > 0 ? Math.min(1, Math.max(0, (st.now - batDau) / tong)) : 1);`
    `var kcMoi = (1 - fr) * G.khoangCach(dau, den) + fr * G.khoangCach(cuoi, den);`
    `kcMoi = Math.max(5, Math.round(kcMoi));`
- **Hệ quả:**
  - Khoảng cách đến mục tiêu mới `kcMoi` được tính bằng trung bình trọng số giữa khoảng cách từ điểm xuất phát tới đích mới và khoảng cách từ đích cũ tới đích mới, thay vì tính từ vị trí tọa độ nội suy thực tế của con tàu.
  - Ví dụ: Hạm đội bay từ hệ 1 đến hệ 100. Khi hạm đội đã bay được 50% quãng đường (đang ở ngang hệ 50), người chơi đổi mục tiêu sang một hành tinh ở hệ 50 ngay cạnh vị trí hiện tại. Theo công thức trên: $\text{kcMoi} = 0.5 \times |1 - 50| + 0.5 \times |100 - 50| = 24.5 + 25 = 49.5$ hệ! Con tàu đang ở ngay trước mặt đích đến mới nhưng vẫn bị bắt bay thêm một quãng đường tương đương nửa dải ngân hà.

### VĐ-07: Lỗ hổng tiêu thụ Thực Phẩm: Hạm đội bay ngoài không gian không tốn thức ăn
- **Bằng chứng:**
  - `js/engine.js:145-147`: Nhu cầu Thực Phẩm của thủy thủ đoàn được tính: `var thuyThu = G.thuyThu && p ? G.thuyThu(p.ships || {}) : 0;` và `(0.05 * thuyThu + ...)`.
  - Hàm chỉ kiểm tra mảng `p.ships` (tàu đỗ tại hành tinh).
  - `js/fleet.js:299`: Khi hạm đội xuất kích, tàu bị trừ hoàn toàn khỏi `p.ships` và chuyển sang `st.fleets`.
- **Hệ quả:**
  - Khi hạm đội có hàng triệu thủy thủ đoàn đang bay ngoài vũ trụ hoặc làm nhiệm vụ giữ chỗ/thám hiểm, lượng tiêu thụ Thực Phẩm của họ bằng 0. Người chơi có thể lách luật chống đói bằng cách duy trì hạm đội liên tục trên không gian ("fleet save trốn ăn"), làm suy yếu cơ chế quản lý dân sự và áp lực bảo trì lương thực.

### VĐ-08: Công trình rỗng "Cổng Không Gian" (`jumpGate`) và tính năng bị bỏ quên của "Trung Tâm Tình Báo" (`intel`)
- **Bằng chứng:**
  - `js/data.js:160-162`: Định nghĩa `jumpGate` với giá rất đắt (2 triệu KL, 4 triệu TA, 200k NL, yêu cầu Siêu Hấp 7) và mô tả dịch chuyển hạm đội tức thời giữa hai hành tinh.
  - Tìm kiếm toàn bộ repo: `jumpGate` không xuất hiện ở bất kỳ file xử lý logic nào (`engine.js`, `fleet.js`, `actions.js`). Người chơi xây xong chỉ tốn tài nguyên và tăng phí bảo trì mà không nhận được tính năng nào.
  - `js/data.js:140-142`: `intel` (Trung Tâm Tình Báo) được mô tả tăng xác suất bắn hạ tàu do thám địch.
  - `js/fleet.js:571` (Solo): Hàm `G.doThamNPC` tính tỷ lệ bắn hạ chỉ dựa vào chênh lệch cấp công nghệ do thám `tech.spy` và thuộc tính bỏ hoang `n.bo`, hoàn toàn bỏ qua `p.b.intel`. Trong khi đó, `server/world.js:1162` (Multiplayer) lại có tính `0.05 * (dp.b.intel || 0)`.

### VĐ-09: Xung đột định danh ID `'robot'` giữa Công Trình và Quân Đổ Bộ
- **Bằng chứng:**
  - `js/data.js:122`: Công trình Nhà Máy Robot có `id: 'robot'`.
  - `js/data.js:332`: Đơn vị bộ binh Robot có `id: 'robot'`.
  - `js/data.js:518`: Hàm `G.UNIT = function (id) { return G.S(id) || G.D(id) || G.BB(id); };`. Khi gọi `G.UNIT('robot')` sẽ trả về bộ binh Robot, nhưng gọi `G.B('robot')` lại trả về công trình.
- **Hệ quả:**
  - Sự trùng lặp ID giữa hai thực thể thuộc hai danh mục khác nhau dễ dẫn đến nhầm lẫn khi viết code tra cứu, logging hoặc migrate dữ liệu trong tương lai.

### VĐ-10: Lệch thứ tự nạp script giữa `index.html` và `server/rules.js` / `build.js`
- **Bằng chứng:**
  - `index.html:83-84`: Nạp `fleet.js` trước `thitruong.js`.
  - `server/rules.js:6`, `tools/build.js:7`, `tools/smoke.js:5`: Nạp `thitruong.js` trước `fleet.js`.
- **Hệ quả:**
  - Mặc dù hiện tại hàm `G.tickCho` trong `fleet.js` được gọi lười (lazy call) lúc runtime nên chưa phát sinh lỗi ngay lập tức, nhưng việc sai lệch thứ tự khai báo giữa môi trường trình duyệt raw và server/bundle tiềm ẩn nguy cơ lỗi phụ thuộc không đồng nhất khi bổ sung các biến hoặc hằng số khởi tạo ở cấp module.

### VĐ-11: Rừng Magic Numbers hardcode rải rác không nằm trong cấu hình
- **Bằng chứng:**
  - `js/combat.js:13`: Công nghệ vũ khí/khiên/giáp hardcode `+0.1` (+10%/cấp) thay vì đọc từ cấu hình nghiên cứu.
  - `js/combat.js:23`: Tỷ lệ thân tàu chịu ảnh hưởng địa hình hardcode `0.1` (bất biến) và `0.9` (chịu địa hình).
  - `js/combat.js:79`: Ngưỡng dội sát thương khiên hardcode `0.01` (1%).
  - `js/combat.js:92`: Ngưỡng nổ dây chuyền tàu hỏng hardcode `0.7` (70% hull).
  - `js/fleet.js:29, 38`: Hằng số chia thời gian bay và nhiên liệu `35000` hardcode trong biểu thức.
  - `js/fleet.js:356`: Đổi nhiên liệu thiếu sang Galana khi đổi hướng hardcode tỷ giá `3` Galana/NL (lệch với tỷ giá chuẩn trong `data.js`).
  - `js/engine.js:550`: Vệ tinh phát điện hardcode công thức: `vt * Math.max(6, Math.floor((p.temp + 160) / 5))`.
  - `js/engine.js:638, 649`: Hằng số công suất xây dựng và nghiên cứu `2500` và `1000` nằm rải rác trong code.
- **Hệ quả:**
  - Gây khó khăn lớn cho việc cân bằng game (game balance tuning), cản trở việc tạo các server có tốc độ/tỷ lệ khác nhau (speed server) hoặc mở rộng modding.

---

## 4. Đề xuất cải tiến

| STT | Đề xuất cải tiến | Lợi ích | Độ khó | Ưu tiên |
| :--- | :--- | :--- | :---: | :---: |
| 1 | **Bổ sung NPC Market Engine cho Solo:** Viết hàm tự động khớp đơn bán trong `st.choDon` theo giá thị trường hoặc cho phép bán thẳng tài nguyên lấy Galana ở Siêu Thị (giá gốc trừ 10% thuế). | Khôi phục chức năng cứu cánh kinh tế trong bản solo, đồng bộ đúng với tài liệu `README.md`. | Thấp | **Cao (P1)** |
| 2 | **Đồng bộ hóa công thức cướp đổ bộ giữa Solo và Server:** Thống nhất dùng chung một công thức toán học tính lượng tài nguyên cướp bóc (khuyến nghị áp dụng tỷ lệ 35% trên kho còn lại theo đúng tinh thần ghi chú `data.js:384`). | Loại bỏ phân mảnh quy tắc trò chơi giữa hai chế độ, bảo đảm tính công bằng khi người chơi chuyển từ solo sang multiplayer. | Thấp | **Cao (P1)** |
| 3 | **Tối ưu hóa thuật toán sửa chữa công sự sang $O(1)$:** Thay vòng lặp `for (k < m)` trong `combat.js:215` bằng phép tính xấp xỉ phân phối nhị thức/chuẩn: `sua = Math.round(m * 0.7 + (rnd() - 0.5) * Math.sqrt(m * 0.21))` khi $m > 100$. | Triệt tiêu nguy cơ freeze luồng xử lý khi số lượng công sự bị phá lên tới hàng triệu đơn vị, bảo vệ server khỏi tấn công làm nghẽn. | Thấp | **Cao (P1)** |
| 4 | **Hoàn thiện tính năng Cổng Không Gian (`jumpGate`):** Thêm action `nhayHam` cho phép chuyển tức thời hạm đội giữa hai thuộc địa cùng có Cổng Không Gian (kèm thời gian hồi 60 phút như mô tả). | Xóa bỏ nội dung rỗng (dead content), tăng chiều sâu chiến thuật cho giai đoạn cuối game. | Trung bình | **Trung bình (P2)** |
| 5 | **Sửa lỗi tính khoảng cách đổi hướng hạm đội:** Thay phép nội suy tuyến tính bằng phép tính khoảng cách hình học thực tế từ tọa độ nội suy hiện tại $(g_t, h_t, p_t)$ đến tọa độ mới. | Khắc phục tình trạng hạm đội bị phạt thời gian vô lý khi chuyển hướng sang mục tiêu nằm ngay sát vị trí đang bay. | Trung bình | **Trung bình (P2)** |
| 6 | **Điều chỉnh công thức Rapidfire trong `combat.js`:** Giới hạn phạm vi tác động của rapidfire chỉ áp dụng trên lượng sát thương gây ra cho chính loại tàu bị khắc chế, không khuếch đại thành phát bắn tự do nã vào các tàu khác. | Trả lại đúng vai trò chiến thuật của bia đỡ đạn (fodder), ngăn chặn nghịch lý mang tàu nhỏ làm hại tàu to. | Trung bình | **Trung bình (P2)** |
| 7 | **Bổ sung cơ chế tiêu thụ lương thực cho hạm đội viễn chinh:** Tính toán trừ Thực Phẩm của thủy thủ đoàn trực tiếp vào khoang hàng của hạm đội (hoặc trừ định kỳ vào hành tinh xuất phát). | Khắc phục lỗ hổng "bay liên tục để trốn tiêu thụ lương thực", tăng tính thực tế của chuỗi cung ứng quân sự. | Trung bình | **Thấp (P3)** |
| 8 | **Đổi tên ID bộ binh `robot` thành `boBinhRobot`:** Tách bạch định danh giữa công trình `robot` và quân đội. | Ngăn ngừa lỗi xung đột namespace và giảm thiểu nhầm lẫn cho nhà phát triển. | Thấp | **Thấp (P3)** |
| 9 | **Chuẩn hóa thứ tự nạp script trong `index.html`:** Chuyển thẻ nạp `thitruong.js` lên trước `fleet.js` trong `index.html` cho khớp với `rules.js` và `build.js`. | Đảm bảo 100% đồng nhất về thứ tự nạp module trên mọi môi trường chạy. | Rất thấp | **Thấp (P3)** |
| 10 | **Tập trung hóa Magic Numbers vào `data.js`:** Gom các hằng số phân tán (tỷ lệ công nghệ, công suất xưởng, tỷ giá đổi nhiên liệu khẩn cấp) vào bảng cấu hình `G.C` hoặc metadata của từng đơn vị. | Dễ dàng cân bằng thông số, hỗ trợ mở rộng modding hoặc tạo các universe có tốc độ khác nhau. | Trung bình | **Thấp (P3)** |
