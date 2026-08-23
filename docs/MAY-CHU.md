# Máy chủ nhiều người chơi — tài liệu kỹ thuật

Tài liệu này mô tả phần `server/` của bản phục dựng: kiến trúc, database, API,
luồng PvP, bảo mật và vận hành. Bản một người (`index.html` + `js/main.js`)
không cần đọc tài liệu này.

Khi nói về độ trung thành lịch sử, tài liệu dùng **[XÁC NHẬN]** cho cơ chế có
trong [tư liệu GVN còn sống](https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/)
và **[TÁI DỰNG]** cho data model, lifecycle hoặc hằng số cân bằng do dự án chọn.

Máy chủ **không phụ thuộc gói ngoài nào**: chỉ dùng `node:http`, `node:sqlite`,
`node:crypto` có sẵn của Node.

## 1. Kiến trúc tổng thể

Nguyên tắc gốc: **một bộ luật duy nhất, chạy được ở cả hai đầu.**

```
        js/data.js  util.js  galaxy.js  combat.js  engine.js  fleet.js  actions.js
                    (bộ luật dùng chung — KHÔNG có bản sao thứ hai)
                    │                                        │
   <script src=...> │                                        │ eval qua server/rules.js
                    ▼                                        ▼
      TRÌNH DUYỆT (client)                            NODE (server)
      js/ui.js  js/app.js                             server/world.js   thế giới chung, PvP
      web/js/mp.js  ── HTTP/JSON ──►                  server/api.js     API
      G.MO_PHONG_NHE = true                           server/db.js      SQLite
      chỉ vẽ + gửi yêu cầu                            server/index.js   HTTP + scheduler
```

- `server/rules.js` đọc lần lượt `js/data.js`, `util.js`, `galaxy.js`, `combat.js`,
  `engine.js`, `fleet.js`, `actions.js` rồi `eval` từng file trong một hàm riêng.
  Nhờ vậy các biến `var` của mỗi file không rò ra global, chỉ `window.G` được giữ
  lại — đúng như khi chạy trong trình duyệt. Server và client dùng **cùng một
  con số cân bằng, cùng một bộ mô phỏng trận đánh, cùng một bảng hành động**.
- **Server là bên quyết định.** Các hành động luật game cốt lõi đi qua
  `POST /api/lam`: server tua thời gian rồi gọi `G.HANHDONG[ten]` trên state trong
  database. Chat, quản trị liên minh, tuyên chiến và chuyển Galana dùng endpoint
  cùng phương thức server chuyên biệt; client không được tự kết luận kết quả.
- Client bản nhiều người bật `G.MO_PHONG_NHE = true` (`js/fleet.js`). Ở chế độ này
  `G.tick()` **chỉ chạy phần sản xuất** (mỏ, hàng đợi tàu, đồng hồ nghiên cứu) cho
  các con số nhảy êm giữa hai lần đồng bộ; nó không xử lý sự kiện, không giải quyết
  hạm đội tới đích, không tính bảo trì. Cứ 8 giây `web/js/mp.js` gọi `/api/state`
  để lấy lại state thật; `G.LECH_GIO` được đặt theo `sv.now` để đồng hồ client
  khớp giờ server.
- **Điểm móc nối** giữa bộ luật và thế giới chung là `G.HOOK` (khai báo `null` trong
  `js/galaxy.js`). `TheGioi.veHook()` trong `server/world.js` gán vào đó 11 hàm:

| Hook | Được gọi từ | Việc |
|---|---|---|
| `oNguoi(st, c)` | `G.oHanhTinh` | ô toạ độ này có phải hành tinh của người chơi khác? |
| `npc(st, c, key)` | `G.npc` | lấy trạng thái NPC từ bảng `npc` dùng chung |
| `npcMoi(n)` | `G.npc` | ghi NPC vừa sinh vào bảng `npc` |
| `pheLieu(key)` | `G.pheLieu` | bãi phế liệu dùng chung (bảng `pl`) |
| `xepHang(st)` | `G.xepHang` | bảng xếp hạng lấy từ database, không sinh giả |
| `kiemTraGui(st, p, den, mission)` | phát lệnh và đổi mục tiêu | kiểm tra chủ đích, quyền chiến hoặc tư cách đồng minh trước khi trừ tài sản |
| `kiemTraGiu(st, f, o)` | lúc tới và mỗi mốc nhiên liệu quỹ đạo | kiểm tra lại chủ toạ độ/tư cách đồng minh, pin `giuTaiTk` |
| `danhNguoi(st, f, o, veNha)` | `G.hamToiDich` | PvP: tấn công người thật, kiểm tra lại quyền chiến lúc đến |
| `doThamNguoi(st, f, o)` | `G.hamToiDich` | PvP: do thám người thật |
| `tangNguoi(st, f, o, veNha)` | `G.hamToiDich` | tiếp tế: chở tài nguyên, kiểm tra lại quan hệ đồng minh lúc đến |
| `tenLuaNguoi(st, tl, o)` | dòng thời gian tên lửa | PvP: nổ tên lửa liên hành tinh, kiểm tra lại quyền chiến lúc đến |

  Khi `G.HOOK` là `null` (bản một người), vũ trụ nằm gọn trong state của người chơi:
  NPC lưu ở `st.npc`, phế liệu ở `st.debris`, bảng xếp hạng sinh tất định từ hạt giống.
  Khi có `G.HOOK`, `TheGioi.nap()` **xoá sạch `st.npc` và `st.debris`** trước khi trả
  state về, vì hai thứ đó là tài sản chung của server chứ không của riêng ai.

- `js/actions.js` cũng thay đổi hành vi theo `G.HOOK`: bản một người cho vào liên
  minh NPC trực tiếp. Multiplayer **chặn** `lmvao` từ client; người chơi gửi đơn,
  chủ duyệt, rồi server mới gọi hành động này nội bộ trên state của ứng viên.

### File nào làm gì

| File | Việc |
|---|---|
| `server/index.js` | bootstrap, HTTP server, phục vụ file tĩnh, scheduler, tắt máy êm |
| `server/api.js` | toàn bộ đường dẫn `/api/*`, xác thực, băm mật khẩu, giới hạn tần suất |
| `server/world.js` | thế giới dùng chung: nạp/lưu đế quốc, tick, PvP, liên minh, xem hệ, tạo đế quốc mới |
| `server/db.js` | schema SQLite + tập câu truy vấn đã `prepare` sẵn |
| `server/rules.js` | nạp bộ luật `js/*.js` vào tiến trình Node |
| `web/index.html` | trang bản nhiều người (màn đăng nhập/đăng ký + khung game) |
| `web/js/mp.js` | driver client: gọi API, đồng bộ, chat, quản trị liên minh và các màn multiplayer |

Bản nhiều người dùng lại nguyên `js/ui.js` và `js/app.js`; `web/js/mp.js` chỉ ghi đè
`APP.lam`, `APP.taiHe`, `APP.luu`, `U.nguon` và bảng màn `U.MAN` (16 màn: bỏ
*Nhật Ký & Lưu* của bản một người, thêm *Bảng Tin Vũ Trụ*, *Phòng Chat* và *Tài Khoản*).

## 2. Cách chạy

```bash
node server/index.js                       # cổng 8080, DB server/data/thdc.db
PORT=3000 THDC_DB=/var/lib/thdc/thdc.db node server/index.js
THDC_AM=1 THDC_NHIP=1000 node server/index.js   # nhịp nhanh, in log mỗi lần tua
```

Kiểm thử máy chủ (tự bật server ở cổng tạm, DB tạm trong `/tmp`, tự dọn):

```bash
node tools/test-server.js
```

Yêu cầu **Node 22.5 trở lên** (vì `node:sqlite`).

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8080` | cổng HTTP |
| `THDC_DB` | `server/data/thdc.db` | đường dẫn file SQLite. Thư mục cha được tạo tự động. `:memory:` chạy được (dùng cho test) |
| `THDC_NHIP` | `3000` | chu kỳ scheduler, tính bằng **milli-giây** |
| `THDC_AM` | *(tắt)* | đặt `=1` để in `[nhip] đã tua N đế quốc` mỗi vòng có việc |
| `THDC_GIOI_HAN` | `40` | số yêu cầu tối đa của một phiên trong 10 giây |
| `THDC_GIOI_HAN_DN` | `8` | số lần đăng nhập/đăng ký tối đa của một IP trong 10 giây (thấp vì scrypt nặng CPU) |
| `THDC_PROXY` | *(tắt)* | đặt `=1` khi đứng sau reverse proxy, để tin header `x-forwarded-for` khi tính giới hạn tần suất. Không có proxy mà bật là tự mở đường cho việc né giới hạn |

### Đường dẫn

| Đường dẫn | Trả về |
|---|---|
| `/` hoặc `/index.html` | `web/index.html` — **bản nhiều người** |
| `/motnguoi` hoặc `/solo` | `index.html` ở gốc repo — **bản một người**, chơi offline trong `localStorage` |
| `/api/*` | API JSON (mục 4) |
| `/js/…` `/css/…` `/web/…` `/docs/…` `/dist/…` | file tĩnh (mục 6) |

Lúc khởi động server in ra địa chỉ, đường dẫn bản một người, đường dẫn database,
hạt giống vũ trụ, số tài khoản, số hành tinh đã có chủ, tốc độ server và nhịp tua.

### Scheduler

`setInterval` mỗi `THDC_NHIP` ms gọi `TheGioi.nhip(60)`:

1. `SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep LIMIT 60` — lấy các đế quốc tới hạn.
2. Với từng đế quốc, gọi `TheGioi.tick(tk, now)`: nạp state, `G.tick`, rồi lưu lại.
3. Lỗi ở một đế quốc chỉ ghi `console.error` chứ không làm chết vòng lặp.

Cờ `dangNhip` chống chồng nhịp: nếu vòng trước chưa xong thì vòng sau bỏ qua.
Mỗi lần lưu, `TheGioi.luu()` tính `keTiep = min(G.sukienKe(st), lastTick + 3600)` —
tức là **mọi đế quốc được tua lại ít nhất 1 giờ một lần**, kể cả khi không có sự
kiện nào chờ. Nhờ đó sản xuất, chu kỳ bảo trì và hạm đội vẫn chạy khi chủ đế quốc
đã thoát ra từ lâu.

Một `setInterval` thứ hai chạy mỗi giờ để xoá phiên hết hạn. `SIGINT` / `SIGTERM`
dừng cả hai bộ đếm, đóng HTTP server và đóng database rồi mới thoát.

## 3. Database

SQLite, `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=4000`. Schema nằm
trong mảng `SCHEMA` của `server/db.js` và được `exec` mỗi lần mở file, nên tất cả
đều là `CREATE TABLE IF NOT EXISTS` — mở lại file cũ không mất dữ liệu.

Lớp `Kho` mở database rồi `prepare` sẵn toàn bộ câu truy vấn vào `kho.q.*`.
`Kho.giaoDich(f)` bọc `f` trong `BEGIN` / `COMMIT` / `ROLLBACK`.

```
tk ──1:1── dq            (đế quốc: state JSON của riêng từng người)
 │   ├─1:n─ ht           (hành tinh đang giữ — chỉ mục sở hữu)
 │   └─1:n─ hamdang      (hạm đội đang bay tới hành tinh người khác)
 │   └─1:n─ hamgiu       (hạm đang đóng quân quỹ đạo — chỉ mục phái sinh)
 ├──1:n── phien          (token đăng nhập)
 ├──1:n── lm_xin         (đơn xin gia nhập liên minh)
 ├──1:n── chien          (đích tkD; hoặc bên tuyên tkA nếu người chơi lẻ)
 └──n:1── lm             (liên minh, qua cột dq.lm là TÊN liên minh)

lm ──1:n── chien          (bên tuyên lmA nếu là lệnh của liên minh)

riêng từng người : tk  dq  phien
dùng chung       : ht  hamdang  hamgiu  npc  pl  lm  lm_xin  chien  chat  bangtin  tran
```

### Bảng riêng từng người

**`dq`** — toàn bộ đế quốc của một tài khoản. Đây là bảng **riêng**: mỗi dòng là
một người chơi, và ai cũng chỉ đọc/ghi dòng của mình (trừ khi bị PvP, xem mục 5).

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `tk` | INTEGER PK | khoá ngoại tới `tk(id)`, `ON DELETE CASCADE` |
| `state` | TEXT | **toàn bộ state game** dạng JSON: hành tinh, tài nguyên, hàng đợi, công nghệ, hạm đội, tin nhắn, nhật ký, thống kê |
| `diem` | INTEGER | điểm đã tính sẵn (`G.diem(st).tong`) để xếp hạng không cần parse JSON |
| `lastTick` | INTEGER | mốc thời gian (giây epoch) mà state đã được tua tới |
| `keTiep` | INTEGER | mốc sự kiện gần nhất — scheduler dùng cột này để biết khi nào phải tua |
| `lm` | TEXT | tên liên minh đang tham gia, `NULL` nếu không có |
| `soHT` | INTEGER | số hành tinh, tính sẵn cho bảng xếp hạng |
| `capNhat` | INTEGER | lần ghi gần nhất |

Chỉ mục: `dq_ketiep(keTiep)` cho scheduler, `dq_diem(diem DESC)` cho bảng xếp hạng.

#### Contract state v6: số lượng, nhịp dân sự và giữ quỹ đạo

State hiện có `st.v = 6`, `st.moHinhCT = 'so-luong-v1'`,
`st.moHinhNhip = 'bao-tri-dan-su-v1'` và
`st.moHinhQuyDao = 'giu-quy-dao-v1'`. Trong mỗi hành tinh,
`p.b[id]` là **số nguyên số công trình đã hoàn thành**, còn hàng đợi xây dựng dùng
`{id,n,cost,tg,xong}`; `n` là số lượng của lô và không còn trường `lv`. Nghiên cứu
`st.tech[id]` vẫn theo cấp. Xây lô mới dùng giá đơn vị × `n`; sản lượng và sức
chứa nhận trực tiếp số lượng. Khu đất đếm **loại công trình** đang có/đang chờ,
không đếm từng chiếc trong một lô.

Đồng hồ 6 giờ duy nhất của đế quốc nằm ở
`st.baoTri={nextAt,cycle,missStreak,arrearsGalana,activatedAt,rules}`. Mỗi hành
tinh có `p.danSu={population,supportBp,taxBp,foodDemandCycle,foodShortfallCycle,decayRemainder}`;
10.000 basis point bằng 100%. Thành Phố mở sức chứa; 250.000 là sàn dân số.
Thuế chạy liên tục để đổi mức giữa chu kỳ được chia đúng theo thời gian, còn
thiếu Thực Phẩm và hậu quả bảo trì chỉ kết toán ở `nextAt`.

Hàng nghiên cứu dùng toạ độ ổn định thay vì chỉ số hành tinh:
`{id,lv,planetKey,startedAt,finishAt,totalCost,paidCost,installmentsTotal,installmentsLeft,failures,status,rules,refundPolicy}`.
Không trừ tiền lúc xếp đề tài. Mỗi checkpoint lấy nguyên một vector kỳ; thiếu
một loại thì không trừ loại nào, tăng `failures` và dời `finishAt` đúng 21.600 giây.

Fleet Giữ Chỗ v6 có ba pha tách bạch `di|giu|ve`. Khi đang đậu nó mang
`{giuLuc,giuDen_t,tiepNL_t,giuTaiTk,giuRules}`; tàu/hàng vẫn thuộc state chủ hạm,
còn `hamgiu` chỉ là projection để host và trận đánh tìm đúng đội hỗ trợ.

`TheGioi.nangCapDuLieu()` chạy trước khi server nhận request. Dispatcher nâng
tuần tự v3→v4→v5→v6: trước hết đổi level `L` sang số lượng bằng vốn lũy kế
`round((factor^L − 1) / (factor − 1))`, đổi từng mục queue thành phần tăng giữa
hai mốc nhưng giữ nguyên `cost/tg/xong`, rồi ghi **toàn bộ các đế quốc cần đổi
trong một transaction**. Bước v4→v5 giữ pha đồng hồ tài khoản, ghi `activatedAt`
ở lúc nâng và đẩy `nextAt` tới checkpoint cùng pha đầu tiên sau mốc đó. Vì vậy
quãng offline trước migration vẫn được tua tài nguyên nhưng không gây mất dân,
công trình hay thất bại nghiên cứu hồi tố. Bước v5→v6 chỉ đổi fleet legacy thực
sự đang đậu; mốc tiếp nhiên liệu ân hạn là
`min(giuDen_t, activatedAt + 21.600)`, nên ca sắp hết không được kéo dài thêm đủ
6 giờ. Đoàn đang bay/đang về không bị đổi pha và không bị thu nhiên liệu hồi tố.
Sau khi nâng toàn bộ state canonical, startup resolve rồi persist `giuTaiTk` hợp
lệ trước khi dựng lại projection `hamgiu`, cùng trong transaction migration.
Chạy lại trên v6 không đổi dữ liệu; state mới hơn engine làm server từ chối khởi
động thay vì âm thầm hạ cấp. Bản một người đọc lần lượt key v6 rồi v5/v4/v3,
chỉ ghi save v6 sau khi migration thành công và vẫn giữ nguyên key cũ làm bản dự
phòng; lệnh xoá bàn dọn cả bốn key.

**[XÁC NHẬN]** Công trình game gốc đếm theo số lượng. **[TÁI DỰNG]** Phép bảo
toàn vốn lũy kế, giá lô tuyến tính, hệ số `mining`/`workshop` và cách khu đất đếm
theo loại đều là quyết định tương thích/cân bằng, không phải schema server gốc.

**`tk`** — tài khoản.

| Cột | Ý nghĩa |
|---|---|
| `id` | khoá chính tự tăng, cũng là "ID người chơi" xuất hiện ở `ht.tk`, `tran.tkA/tkD`, `lm.chu` |
| `ten` | khoá đăng nhập, **đã hạ chữ thường**, UNIQUE |
| `hienthi` | tên chỉ huy hiện trong game |
| `mk` | scrypt hash dạng hex |
| `muoi` | muối (salt) 16 byte dạng hex |
| `tao` | lúc tạo tài khoản |
| `vaoCuoi` | lần hoạt động gần nhất — dùng để tính "đang online" (< 5 phút) và "lâu không vào" (> 7 ngày) |
| `quyen` | mặc định `'nguoi'`; cột dành sẵn cho quyền quản trị, hiện chưa có mã nào đọc |

**`phien`** — phiên đăng nhập: `token` (PK), `tk`, `tao`, `hetHan`. Chỉ mục `phien_tk(tk)`.

### Bảng dùng chung cả server

**`ht`** — chỉ mục sở hữu hành tinh. Là **bản sao tra cứu nhanh** rút từ `dq.state`:
mỗi lần `TheGioi.luu()` chạy, nó xoá hết dòng của tài khoản đó rồi ghi lại từ
`st.planets`. Nhờ bảng này mà "ai đang giữ toạ độ nào" tra được bằng một câu SQL
thay vì phải mở state của tất cả mọi người.

| Cột | Ý nghĩa |
|---|---|
| `td` | khoá chính, toạ độ dạng chuỗi `"g:h:p"` |
| `tk` | chủ hành tinh |
| `ten` | tên hành tinh |
| `pi` | chỉ số hành tinh trong `st.planets` của chủ (0 = hành tinh mẹ) |
| `thuDo` | 1 nếu là thủ đô |

Chỉ mục: `ht_tk(tk)`. Tra cứu theo hệ dùng `td LIKE 'g:h:%'` nên đi bằng chỉ mục
khoá chính trên `td`.

Cột `diemCT` / `diemNC` / `diemHam` / `diemThu` là điểm tách theo hạng mục, ghi
cùng lúc với `diem` mỗi lần lưu, để bảng xếp hạng sắp theo từng hạng mục mà không
phải mở state của mọi người.

**`hamdang`** — chỉ mục hạm đội đang bay tới hành tinh của **người khác**, để bên
phòng thủ được báo động trước. Cùng cơ chế với `ht`: mỗi lần `TheGioi.luu()` chạy,
xoá hết dòng của tài khoản đó rồi ghi lại từ `st.fleets`, nên gọi hạm đội về hay
đổi mục tiêu giữa đường thì báo động tự cập nhật theo.

| Cột | Ý nghĩa |
|---|---|
| `tkA` / `fid` | khoá chính: chủ hạm đội và id hạm đội trong state của họ |
| `tkD` | snapshot chủ hành tinh lúc projection được dựng; không phải quyền sở hữu cuối cùng |
| `tu` / `den` | toạ độ xuất phát / toạ độ đích, dạng `"g:h:p"` |
| `nv` | nhiệm vụ — `attack`, `transport`, hoặc `hold` đang bay tới |
| `denT` | mốc thời gian tới đích |
| `tenA` / `lmA` | tên và liên minh của bên tấn công (để hiện ngay, không phải join) |

Chỉ mục `hamdang_tkd(tkD, denT)` phục vụ cảnh báo, còn
`hamdang_den_nv(den,nv,denT)` tìm đoàn `hold` đến hạn theo **toạ độ**. Cảnh báo
`hdToi` JOIN lại `ht`, nên một `tkD` snapshot đã cũ không trao quyền xem cho chủ
cũ. Trận đánh cũng tìm mọi đoàn hold tới không muộn hơn T theo `den`, rồi mới
tick và kiểm tra chủ/membership hiện tại; vì vậy một ô đổi chủ khi đoàn đang bay
vẫn có thể pin đúng chủ mới nếu quan hệ còn hợp lệ. **Nhiệm vụ do thám cố tình
KHÔNG được ghi vào đây** — do thám là đi lén. `TheGioi.hamDangToi(tk)` gắn danh
sách vào `st.pvpToi` khi client gọi `/api/state` hoặc `/api/lam`; danh sách đó
**không chứa đội hình hạm đội**. Dòng cũ hơn 24 giờ được dọn mỗi giờ (`hdDonRac`).

`hold` lượt đi cũng nằm trong `hamdang`, kể cả khi bay tới một thuộc địa khác của
chính chủ, để UI phân biệt rõ đoàn hỗ trợ đang tới với lực lượng đã đậu.

**`hamgiu`** — projection của fleet `mission:'hold', pha:'giu'`; nguồn sự thật
vẫn là `dq.state`. Khoá chính `(tkA,fid)`, các cột `tkD/td` là chủ đã pin và toạ
độ host, `tu` là nguồn, còn `giuLuc/giuDenT/tiepNLT` là mốc tới, hết ca và trả
nhiên liệu. Mỗi lần lưu unit-of-work, server xoá/rebuild projection sau khi đã
ghi xong toàn bộ `ht`. Row canonical đã pin vẫn được giữ khi chủ ô hoặc liên minh
trở nên stale: truy vấn API JOIN `ht`/`dq` nên row mất hiệu lực và không lộ ngay;
truy vấn candidate thô theo `td` vẫn nạp chủ hạm ở trận kế tiếp để hook bắt hạm
quay về, thay vì âm thầm bỏ quên nó. Eligibility dùng biên
`giuLuc <= T < giuDenT`: tới đúng giây T được phòng thủ, hết hạn đúng T thì không.
`/api/state` của host nhận các row còn hợp lệ và chưa tới checkpoint nhiên liệu
ở `st.pvpGiu`; row đã tới `tiepNLT` được ẩn bảo thủ cho tới khi owner authoritative
tick. API bản đồ và xếp hạng không lộ đội hình này cho người ngoài.

**`npc`** — trạng thái các đế quốc NPC: `key` (toạ độ `"g:h:p"`), `data` (JSON của
NPC: tên, liên minh, điểm, công nghệ, hạm đội, phòng thủ, tài nguyên), `t` (lần ghi
cuối). NPC **dùng chung**: ai đánh xuống thì cả server thấy nó yếu đi, và nó hồi
phục dần theo `G.npcHoiPhuc`. Ô nào chưa ai chạm tới thì không có dòng nào —
`G.coNPC(seed, c)` sinh lại tất định từ hạt giống.

**`pl`** — bãi phế liệu: `td` (toạ độ), `kl` (Kim Loại), `tt` (Thạch Anh). Cũng là
tài sản chung: xác tàu của trận đánh giữa hai người khác vẫn vét được bằng Tàu Thu Hồi.

**`lm`** — liên minh: `ten` (PK, dạng `"[TAG] Tên"`), `tag`, `chu` (id chủ hiện tại),
`tao`, `mota`. Số thành viên và tổng điểm **không lưu ở đây** mà tính bằng
sub-query trên `dq.lm`. Chủ duyệt/từ chối đơn, loại thành viên và chuyển quyền.
Nếu chủ xoá tài khoản, quyền tự chuyển cho thành viên còn lại có điểm cao nhất.
Khi mở database cũ, server cũng tự sửa chủ đã rời liên minh và xoá liên minh mồ côi.

**`lm_xin`** — đơn xin gia nhập: khoá kép `(lm, tk)`, thời điểm `khi`. Cả hai phía
đều có khoá ngoại `ON DELETE CASCADE`; một người không gửi trùng đơn cho cùng liên
minh. Khi được duyệt vào một nơi, mọi đơn còn lại của người đó bị xoá.

**`chien`** — lệnh chiến tranh bền vững của multiplayer.

| Cột | Ý nghĩa |
|---|---|
| `id` | khoá chính tự tăng |
| `lmA` | tên liên minh bên tuyên, hoặc `NULL` nếu là lệnh cá nhân; FK `lm(ten) ON DELETE CASCADE` |
| `tkA` | tài khoản bên tuyên khi người chơi lẻ, hoặc `NULL` nếu `lmA` có giá trị; FK `tk(id) ON DELETE CASCADE` |
| `tkD` | tài khoản mục tiêu; FK `tk(id) ON DELETE CASCADE` |
| `khi` | giây epoch lúc đặt lệnh; có hiệu lực ở `khi + 86.400` |

`CHECK ((lmA IS NULL) <> (tkA IS NULL))` buộc đúng một loại bên tuyên; lệnh cá
nhân không được tự nhắm mình. Hai unique index `(lmA,tkD)` và `(tkA,tkD)` chặn
lệnh trùng, còn `chien_muctieu(tkD,khi DESC)` phục vụ danh sách bị tuyên chiến.
Schema không lưu một cờ `hieuLuc`: server luôn tính từ `khi`, nên không có job
riêng để “bật” lệnh sau 24 giờ.

**[XÁC NHẬN]** Tư liệu năm 2006 xác nhận phải tuyên chiến trước và chờ 24 giờ.
**[TÁI DỰNG]** Cách biểu diễn `lmA → tkD` do chủ liên minh đặt, `tkA → tkD` cho
người chơi lẻ, cùng vòng đời phụ thuộc membership hiện tại là quyết định của dự
án vì nguồn không mô tả đủ data model gốc.

**`chat`** — lịch sử chat: `khi`, snapshot `tk`/`ten`/`lm`, `kenh` (`chung` hoặc
`lienminh`) và `noi`. API chỉ trả kênh liên minh khớp `dq.lm` hiện tại; tin cũ hơn
30 ngày luôn bị lọc khỏi kết quả và được dọn khỏi SQLite theo nhịp tối đa một lần/giờ
khi có người đọc hoặc gửi. Kênh chung có nguồn từ game gốc, kênh liên minh là thiết kế
bù của bản phục dựng. Khi liên minh giải thể, lịch sử kênh riêng bị xoá để một liên
minh tái lập cùng tên/thẻ không đọc được bí mật của nhóm cũ.

**`bangtin`** — bảng tin toàn server: `id`, `khi`, `loai`, `noi`. `loai` hiện có
`'tk'` (người mới nhận hành tinh), `'lm'` (lập / gia nhập liên minh), `'chien'`
(đặt lệnh chiến tranh), `'tran'` (một trận PvP vừa xong), `'tiepte'` (chở tài
nguyên hoặc chuyển Galana cho đồng minh).
Chỉ mục `bangtin_khi(khi DESC)`.

**`tran`** — sổ ghi trận PvP để tra cứu về sau.

| Cột | Ý nghĩa |
|---|---|
| `khi` | lúc xảy ra |
| `tkA` / `tkD` | id bên tấn công / bên phòng thủ |
| `td` | toạ độ hành tinh bị đánh |
| `kq` | kết quả theo `G.danhTran`: `thang` (bên tấn công thắng), `thua` (bên phòng thủ đứng vững), `hoa`, `huyDiet` |
| `cuop` | tổng tài nguyên cướp được |
| `matA` / `matD` | số tàu bên tấn công / bên phòng thủ bị bắn hạ |

Chỉ mục `tran_khi(khi DESC)`.

**`cauhinh`** — cặp `k` / `v` cho cấu hình server. Hiện dùng `seed` (hạt giống
vũ trụ, sinh một lần rồi giữ vĩnh viễn), `moLuc` (lúc mở server) và
`stateVersion` (phiên bản state mà bước migration gần nhất đã ghi).

### Unit-of-work state dùng chung

`batDau()` mở phạm vi lồng nhau, `ketThuc()` đóng và chỉ tầng ngoài cùng mới ghi.
Context giữ cache NPC/phế liệu, mọi `dq.state` đã chạm, projection cần dựng lại,
`tran` và `bangtin`. Vì vậy một trận ba chủ không ghi host rồi mới ghi attacker:
toàn bộ mutation được stage và commit trong **một** `Kho.giaoDich`. Một tầng con
thất bại đánh dấu huỷ; tầng ngoài rollback mọi phần và luôn đưa `ctx`/độ sâu về
trạng thái sạch để request kế tiếp tiếp tục được.

## 4. Bảng API

Tất cả trả JSON, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
Token gửi qua header **`x-thdc-token`**. Lỗi luôn có dạng `{ "loi": "..." }`.

| Đường dẫn | Phương thức | Token | Dữ liệu vào | Dữ liệu ra |
|---|---|---|---|---|
| `/api/thongtin` | GET | không | — | `{seed, soNguoi, soHT, tocDo, tocDoBay, chuKy, phienBan, now}` |
| `/api/dangky` | POST | không | `{ten, mk, hienthi}` | `{token, ten, nha:{g,h,p}}` · 400 sai định dạng · 409 tên đã có · 429 quá nhanh (8 lần / 10 giây) |
| `/api/dangnhap` | POST | không | `{ten, mk}` | `{token, ten}` · 401 sai mật khẩu · 429 quá nhanh (8 lần / 10 giây) |
| `/api/dangxuat` | GET/POST | **có** | — | `{ok:true}` (xoá dòng `phien`) |
| `/api/state` | GET | **có** | — | `{st, sv, toi:{ten, tk}}` — `st` đã tua tới hiện tại và có projection `pvpToi`/`pvpGiu` dành riêng cho người gọi; `sv` là gói `/api/thongtin` |
| `/api/lam` | POST | **có** | `{ten, dl}` | `{loi, st, sv}` — hành động luật game, trả cùng projection PvP mới nhất; multiplayer chặn gọi thẳng `lmvao` để không lách duyệt đơn |
| `/api/he` | GET | **có** | query `?g=&h=` | `{g, h, o:[…16 dòng…]}`; 15 hành tinh có `loai` = `toi` / `nguoi` / `npc` / `trong`, dòng ô 16 có `loai:'sau'`, kèm `key`, `c`, `debris` khi phù hợp |
| `/api/guithu` | POST | **có** | `{den, noi}` — `den` là tên chỉ huy hoặc id tài khoản | `{ok:true}` — thư rơi thẳng vào hộp tin người nhận (`loai:'thu'`); tối đa 1.200 ký tự, 1 thư / 10 giây |
| `/api/xephang` | GET | **có** | query `?loai=tong\|ct\|nc\|ham\|thu` | `{loai,ds:[{hang,ten,lm,diem,tong,ct,nc,ham,thu,ht,ta}]}` — tối đa 200 người |
| `/api/lm` | GET | **có** | — | `{ds,tv,xin,don,laChu,chien:{di,den,cho}}`; `chien.di` là lệnh bên mình, `chien.den` là lệnh nhắm vào mình, `cho=86400` |
| `/api/tuyenchien` | POST | **có** | `{tk}` — id tài khoản mục tiêu | `{ok:true,chien}`; nếu đang ở liên minh chỉ chủ được đặt lệnh cho liên minh; 400 khi mục tiêu sai/cùng phe/lệnh trùng |
| `/api/chuyengalana` | POST | **có** | `{tk,so}` — id người nhận và số nguyên 1…1.000.000.000.000 | `{ok:true,st,sv}`; chỉ cùng liên minh, kiểm tra lại membership sau khi tua cả hai đế quốc và ghi hai số dư trong một transaction |
| `/api/lmtao` | POST | **có** | `{ten, tag}` | `{loi, st, sv}` — lập liên minh rồi tự gia nhập · 400 tên/thẻ sai, hoặc tên/thẻ đã tồn tại |
| `/api/lmxin` | POST | **có** | `{ten}` | gửi đơn xin; không đổi membership ngay, chặn đơn trùng |
| `/api/lmduyet` | POST | **có** | `{tk}` | chủ duyệt ứng viên và server cập nhật state của người đó |
| `/api/lmtuchoi` | POST | **có** | `{tk}` | chủ từ chối/xoá đơn |
| `/api/lmduoi` | POST | **có** | `{tk}` | chủ loại thành viên; không được tự loại mình |
| `/api/lmchuyen` | POST | **có** | `{tk}` | chuyển quyền chủ cho một thành viên hiện tại |
| `/api/chat` | GET | **có** | — | tối đa 60 tin chung + 60 tin của liên minh hiện tại |
| `/api/chat` | POST | **có** | `{kenh, noi}` | gửi tối đa 300 ký tự; tối đa 3 tin / 10 giây; kênh riêng đòi membership |
| `/api/bangtin` | GET | **có** | — | `{bt:[…40 tin…], tran:[…20 trận…]}` |
| `/api/xoatk` | POST | **có** | `{mk, xacnhan:"XOA"}` | `{ok:true}` — xoá tài khoản, đế quốc, hành tinh và phiên; giữ lại lịch sử `tran` |
| `/api/doimk` | POST | **có** | `{cu, moi}` | `{ok:true}` · 401 mật khẩu cũ sai · 400 mật khẩu mới ngắn hơn 6 ký tự |

Đường dẫn `/api/*` không khớp bảng trên trả **404** `{loi:"Không có đường dẫn này."}`.
Ngoại lệ chưa bắt trong tầng API được `server/index.js` bọc lại thành **500**.

### Ghi chú

- Hai đường dẫn công khai (`/api/dangky`, `/api/dangnhap`) bị giới hạn theo IP;
  mọi đường dẫn còn lại đòi token trước, rồi giới hạn theo token.
- Mỗi yêu cầu đã đăng nhập đều cập nhật `tk.vaoCuoi` — đó là nguồn của cờ
  "đang online" trên bản đồ thiên hà.
- `/api/lam` trả mã **200 cả khi hành động bị từ chối**; lỗi nằm trong trường `loi`
  còn `st` là state mới nhất. Client hiện thông báo lỗi rồi vẽ lại bằng `st` đó.
- Riêng `lmvao` không được gọi từ client multiplayer. `/api/lmduyet` kiểm tra quyền
  chủ và đơn hợp lệ rồi mới gọi nó nội bộ; `/api/lam` chặn đường tắt bằng mã 400.
- Danh sách hành động (`G.HANHDONG` trong `js/actions.js`, 20 hành động):
  `xay`, `huyxay`, `nc`, `huync`, `doithue`, `dong`, `huydong`, `ban`, `mua`, `gui`, `goive`,
  `banTenLua`, `doihuong`, `lmvao`, `lmra`, `doctin`, `docHet`, `xoatin`, `boHoang`, `doiTenHT`.
- Payload xây ở state hiện hành là `{pi,id,n}`; `n` phải là số nguyên 1…10.000.000. Nếu
  client cũ bỏ `n`, engine chọn lô tương thích vừa đủ tới mốc vốn level cũ kế tiếp.
- Đổi thuế qua `/api/lam` với `{ten:'doithue',dl:{pi,thue}}`; `thue` là phần
  trăm hữu hạn từ 0 tới 100, server lưu thành `taxBp` và tick state trước khi đổi.
- Client (`web/js/mp.js`) gọi `/api/state` mỗi 8 giây và mỗi lần tab được hiện lại;
  `/api/he`, `/api/xephang`, `/api/lm`, `/api/bangtin`, `/api/chat` gọi khi mở màn tương ứng.
  Khi đang ở màn Chat, client cũng lấy tin mới mỗi nhịp 8 giây nhưng chỉ thay vùng
  lịch sử, không xoá nội dung người chơi đang gõ.
  Không có WebSocket — tất cả là polling.

> `/api/he` trả 16 dòng: 15 ô hành tinh cộng một ô ảo `loai:'sau'` (ô số
> `G.C.O_THAM_HIEM` = 16) — vùng không gian sâu, chỉ nhận nhiệm vụ Thám Hiểm và
> không bao giờ có chủ.

## 5. Luồng PvP

Đây là chỗ khác biệt lớn nhất so với bản một người: một lượt tua của người A phải
mở và sửa state của người B.

### Lệnh chiến tranh và vòng đời quyền đánh

**[XÁC NHẬN]** Game gốc buộc đặt lệnh chiến tranh trước và chờ Hội Đồng Bảo An
**24 giờ**. **[TÁI DỰNG]** Server hiện thực phần không còn đủ tư liệu như sau:

1. `/api/tuyenchien {tk: tkD}` nhận một **tài khoản mục tiêu**, không nhận tên
   liên minh. Nếu A đang ở liên minh, A phải là `lm.chu` và server ghi
   `chien(lmA, tkD, khi)`; mọi thành viên hiện tại của liên minh dùng chung lệnh.
2. Nếu A không ở liên minh, server ghi `chien(tkA, tkD, khi)`. Đây là nhánh để
   người chơi lẻ không bị khoá khỏi PvP, không phải luật gốc đã xác minh.
3. `quyenDanh(tkA,tkD,now)` luôn đọc `dq.lm` **hiện tại**. Thành viên liên minh chỉ
   dùng lệnh `lmA`; người chơi lẻ chỉ dùng lệnh `tkA`. Cùng liên minh luôn bị chặn,
   kể cả có một lệnh cũ. `now < khi+86400` trả trạng thái `cho`; sau đó mới
   `hieuluc`.
4. Dòng `chien` không bị xoá khi người chơi vào/rời liên minh, nhưng lookup đổi
   theo membership. Vì thế quyền cá nhân có thể bị đình chỉ khi người tuyên vào
   liên minh, quyền chung mất khi thành viên rời liên minh, và mục tiêu gia nhập
   cùng phe làm giao chiến bị chặn. Đây là **[TÁI DỰNG] lifecycle**.
5. `chienCua(tk)` chiếu trạng thái hiện tại thành `{di,den,cho}` cho `/api/lm`;
   mỗi mục có `khi`, `hieuLuc`, `trang`, `duoc`. Các trạng thái nhìn thấy gồm
   `cho`, `hieuluc`, `dongminh`, và `dinhchi` khi người tuyên lệnh cá nhân đã vào
   một liên minh. Bảng tin loại `'chien'` là thông báo bền vững; hộp thư riêng của
   mục tiêu là side effect best-effort.

### Bảo vệ lúc phát lệnh, đổi hướng và lúc đến

`G.guiHam`, `G.doiMucTieu` và `G.banTenLua` gọi hook `kiemTraGui` nếu mục tiêu là
hành tinh người thật. Với tấn công/tên lửa, hook yêu cầu lệnh chiến đang hiệu lực;
với Vận Chuyển, hook yêu cầu cùng liên minh. Kiểm tra diễn ra **trước khi** trừ
tàu, quân, hàng, nhiên liệu hoặc phí đổi hướng, nên một lệnh bị từ chối không làm
mất tài sản.

Đây chưa phải kiểm tra một lần rồi tin mãi. Khi hạm đội/tên lửa thực sự tới nơi,
`danhNguoi`, `tenLuaNguoi` và `tangNguoi` tra lại quyền theo database hiện tại.
Nếu membership hoặc chủ toạ độ đã đổi trong lúc bay, trận/việc giao hàng bị chặn;
hạm đội mang hàng quay về, còn tên lửa trái quyền tự huỷ. Hai lớp kiểm tra này
ngăn request cũ lách thay đổi quan hệ xảy ra trong thời gian hành quân.

### Khi hạm đội của A tới hành tinh của B

1. **Scheduler hoặc một hành động** gọi `TheGioi.tick(tkA, now)`. Lần gọi ngoài
   cùng giữ `now` làm horizon cố định, mở một unit-of-work, khoá A trong
   `dangTick`, đẩy A vào `chuStack`, rồi gọi `G.tick`. Một sự kiện PvP cũ hơn
   horizon được dời tới chính horizon trước khi xét state dùng chung; mã không
   đọc `Date.now()` lặp lại để đuổi theo một ranh giới đang trôi.
2. Dòng thời gian gặp `f.den_t = T`; `G.hamToiDich` hỏi hook `oNguoi`, tra chủ
   hiện tại từ `ht`, rồi giao nhiệm vụ `attack` cho `TheGioi.danhNguoi`. Server
   kiểm tra lại lệnh chiến và membership. Mất quyền thì hạm quay về mà không
   mở trận.
3. Trước khi nạp bất kỳ defender nào, server dựng tập candidate gồm host, mọi
   owner có `hamgiu` tại toạ độ, và mọi owner có đoàn hold inbound với
   `denT <= T`. Hai truy vấn candidate cố ý theo toạ độ, không tin `tkD` snapshot.
   Nếu **bất kỳ** candidate nào đang ở `dangTick`, cả trận hoãn 20 giây; không
   được bỏ riêng một đồng minh đang bận rồi đánh đội hình thiếu.
4. Server đọc `lastTick` mới nhất của toàn tập. Nếu host hoặc supporter đã ở sau
   T, hạm tấn công vẫn `pha:'di'`, `den_t` được rebase tới mốc lớn nhất và không
   có side effect. Cơ chế này giữ lát cắt latest-state đơn điệu thay vì áp một
   trận lịch sử lên state tương lai.
5. Khi mốc hợp lệ, server khoá toàn tập theo thứ tự id ổn định, nạp rồi tick mỗi
   state tới T trong cùng unit-of-work. Hold tới đúng T được chuyển sang `giu`,
   trừ đoạn nhiên liệu đầu và có thể tham chiến; hold hết hạn đúng T chuyển sang
   `ve` trước khi dựng đội hình. Sau đó server tìm lại hành tinh, áp bảo vệ người
   chơi mới hai chiều, rồi chạy lại `kiemTraGiu` cho từng fleet để loại quan hệ
   hoặc pin chủ đã stale.
6. `G.danhTran(...)` nhận `nhomTau`: nhóm 0 là tàu của hành tinh B, mỗi nhóm sau
   là đúng một fleet đóng quân cùng công nghệ của owner đó. Hạt trận là
   `G.hash(f.id + ':' + st.now + ':' + o.key)`. `conNhomD`/`matNhomD` được ghi
   ngược về đúng planet/fleet; survivor đồng minh không bao giờ nhập vào
   `dp.ships`. **[XÁC NHẬN]** quỹ đạo phải hết trước khi mặt đất tham chiến;
   **[TÁI DỰNG]** mốc xuống đất cụ thể là vòng 3.
7. Nếu A thắng, `G.chiaHang` lấy tối đa `G.C.CUOP_TOI_DA` (50%) tài nguyên B,
   giới hạn bởi khoang hàng còn trống. Server cập nhật stats theo đúng owner,
   cộng xác tàu vào bãi `pl`, gửi báo cáo cho attacker, host và mỗi owner hỗ trợ,
   đồng thời stage đúng một dòng `tran` và một dòng `bangtin`.
8. `TheGioi.luu` trong luồng này chỉ **stage** mọi `dq.state` và projection.
   Khi `tick` ngoài cùng kết thúc, `_ghiNhieu` ghi toàn bộ state, `ht`, `hamdang`,
   `hamgiu`, phế liệu, báo cáo chung và bảng tin trong **một transaction SQLite**.
   Một lỗi ở bất kỳ hook/bước ghi nào rollback tất cả, giải phóng `ctx`/độ sâu UoW,
   và lần xử lý bình thường kế tiếp có thể commit đúng một lần.
9. Cuối cùng gỡ mọi owner khỏi `dangTick`/`chuStack`. Hạm A bị xoá sổ thì bị xoá;
   nếu còn tàu, nó bắt đầu chặng về.

### Do thám người thật

`doThamNguoi` chạy cùng khuôn: hoãn 20 giây nếu đối phương đang bị tua, nạp và tua
B, tính mức chi tiết báo cáo theo chênh lệch **Công Nghệ Tình Báo** và số tàu do
thám, cho **Trung Tâm Tình Báo** của B bắn hạ một phần tàu (`0.05 × cấp intel` cộng
phần bù nếu B mạnh hơn về tình báo, trần 90% mỗi chiếc), ghi báo cáo vào hộp tin và
`st.spy[key]` của A, đồng thời gửi tin "Bị do thám tại …" cho B. Mức chi tiết:
1 = tài nguyên, 2 = thêm hạm đội, 3 = thêm phòng thủ, 4 = thêm công nghệ,
5 = thêm công trình.

### Đổi hướng hạm đội đang bay hoặc đang đậu

**[XÁC NHẬN]** [nguồn GVN 2006](https://forum.gamevn.com/threads/thien-ha-dai-chien-game-online-xay-dung-hanh-tinh-oanh-nhau.239332/)
mô tả rõ cả đổi mục tiêu trên lượt đi và quay sang mục tiêu khác khi đang trên
đường về. `G.doiMucTieu` hiện hỗ trợ `f.pha === 'di'`, `'ve'` và hạm `hold` đang
`'giu'`: ước lượng vị trí hiện tại trên chặng cũ (hoặc lấy đúng quỹ đạo host nếu
đang đậu), đặt đích mới, xoá pin/trạng thái giữ, chuyển lại sang pha đi và tính
`den_t` mới. Khi state được lưu, `hamdang`/`hamgiu` cũng được dựng lại theo vị trí
mới.

**[TÁI DỰNG]** Phí nền `G.C.DOI_MUC_TIEU_GALANA = 250`, công thức nhiên liệu
phụ trội, tỷ lệ đổi thiếu nhiên liệu sang Galana và phép nội suy vị trí không có
trong nguồn. Với mục tiêu người thật, `kiemTraGui` chạy trước khi trừ phí; do đó
đổi hướng một hạm tấn công sang người chưa bị tuyên chiến, hoặc đổi đoàn Vận
Chuyển sang người ngoài liên minh, bị từ chối mà không mất Galana. Riêng hạm
`hold` đang đậu bắt đầu lại toàn bộ thời lượng `f.giu` khi tới đích mới; đây cũng
là semantics tái dựng, không phải công thức tìm lại được từ game gốc.

### Tiếp tế người thật

**[TÁI DỰNG]** Nguồn chỉ xác nhận chuyển *tiền* và phòng thủ trong nội bộ liên
minh; dự án suy rộng quy tắc đó sang đoàn **Vận Chuyển** (`transport`) chở tài
nguyên vật chất. Hook `kiemTraGui` chặn người ngoài liên minh ngay lúc phát lệnh;
hook `tangNguoi` kiểm tra lại lúc tới. Nếu người nhận đã rời/bị loại khỏi liên
minh trong lúc tàu bay, không có tài nguyên nào được ghi sang B và toàn bộ hàng
đi về cùng hạm đội.

Nếu quan hệ vẫn hợp lệ, `tangNguoi` dùng cùng khuôn với hai luồng trên: hoãn 20
giây nếu đối phương đang bị tua, khoang hàng trống thì quay về ngay, đối phương
đã rời toạ độ thì mang hàng về. Kho bên nhận chỉ chứa tới **150% dung tích**;
phần dư được mang về chứ không bốc hơi. Cả hai bên nhận tin `ham` và một dòng
`bangtin` loại `'tiepte'` được ghi cho bảng tin toàn server.

Nhiệm vụ **Triển Khai** (`deploy`) thì không có hook: chở tàu sang hành tinh người
khác vẫn bị coi là "không phải hành tinh của ta" và hạm đội mang hàng quay về.

### Đóng quân quỹ đạo

**[XÁC NHẬN]** Tư liệu mô tả hạm có thể đậu tại bất kỳ quỹ đạo; gặp lực lượng địch
thì đánh, có thể chia đội, chọn căn cứ trở về, được đồng minh cùng phòng thủ và
phải tiếp nhiên liệu định kỳ, nếu không sẽ thành “rác không gian”. Nhiệm vụ
**Giữ Chỗ** (`hold`) hiện mới triển khai vị trí đậu thật tại hành tinh chính chủ
hoặc thành viên cùng liên minh và luôn trở về `f.tu`. Chưa có đậu tại quỹ đạo
thù địch/trung lập, va chạm giữa các hạm đang đậu, tách đội hay chọn căn cứ về.

Dispatch kiểm tra quyền và yêu cầu `f.cargo.deut` đủ đoạn đầu trước khi trừ bất
kỳ tài sản nào. Khi tới nơi, `kiemTraGiu` đọc lại chủ toạ độ/membership, sau đó
engine mới trừ đoạn đầu và chuyển `pha:'di'` sang `pha:'giu'`. Mỗi mốc
`tiepNL_t` lại kiểm tra quyền trước khi trả trước đoạn kế. Rời/bị loại khỏi liên
minh làm fleet tự quay về; thiếu Nhiên Liệu ở một đoạn sau xoá toàn bộ fleet còn
lại và cộng vào bãi phế liệu chung đúng 30% giá trị đóng bằng Kim Loại/Thạch Anh.
Chủ hạm có thể **Gọi Về** đang đậu; thời gian về là toàn tuyến đích→nguồn, phần
nhiên liệu đã trả không hoàn lại.

Khi một trận tới host, server tìm candidate `hamgiu` và hold inbound theo toạ độ,
khoá/tua mọi chủ tới đúng T, rồi mới lọc biên `giuLuc <= T < giuDenT` và truyền
`G.danhTran` các `nhomTau`. Nhóm 0 là hạm hành tinh, mỗi nhóm sau là một fleet
đồng minh với công nghệ của chính chủ. `conNhomD`/`matNhomD` ghi survivor/loss về
đúng fleet, không nhập tàu đồng minh vào `dp.ships`; mọi nhóm này vẫn thuộc lớp
quỹ đạo nên công sự mặt đất không bị đánh xuyên qua.

**[TÁI DỰNG]** Đoạn dài 21.600 giây, định mức `2% × tổng fuel cơ bản/giờ`, cách
làm tròn từng đoạn, trả trước/không hoàn, mức phế liệu 30% và thứ tự phân bổ tổn
thất theo nhóm không còn bảng luật gốc. Save v5 đang đậu được ân hạn tới
`min(giuDen_t, activatedAt + 21.600)`; migration không thu hồi tố quãng offline.

### Chuyển Galana trong liên minh

**[XÁC NHẬN]** Nguồn năm 2006 nói chỉ thành viên cùng liên minh được chuyển tiền;
Galana được cùng nguồn định nghĩa là tiền tệ. `/api/chuyengalana` vì vậy là luồng
khác với đoàn Vận Chuyển: tiền đi thẳng giữa hai state đế quốc, không cần tàu và
không có thời gian bay.

`TheGioi.chuyenGalana(tkA,tkD,so)` kiểm tra id/số nguyên/trần, không cho tự chuyển,
yêu cầu cùng liên minh và đủ số dư. Server tua cả A lẫn D tới cùng `now`, rồi
**kiểm tra lại membership ngay trước khi ghi**. Hai số dư và dòng bảng tin được
ghi trong cùng `Kho.giaoDich`; nếu bất kỳ lệnh ghi nào lỗi, toàn bộ transaction
rollback. Mức trần 1 nghìn tỷ và việc chuyển tức thời là chi tiết
vận hành/cân bằng của bản phục dựng, không phải con số lịch sử.

### Chống đệ quy

Không có distributed/advisory lock để phối hợp nhiều process. Trong một process,
server dùng ba guard trong bộ nhớ:

- `dangTick` — `Set` các tài khoản **đang** được tua. `TheGioi.tick()` thấy tài khoản
  đã có trong `Set` thì trả `null` ngay (API trả 503 "Đế quốc đang được xử lý, thử
  lại sau một nhịp"). `danhNguoi` khoá trước host và toàn bộ owner hỗ trợ; chỉ một
  người đang bận cũng làm cả attack hoãn 20 giây. Các hook PvP khác cũng hoãn mục
  tiêu đang được xử lý, nhờ vậy hai hạm đội bay chéo không đệ quy vô hạn.
- `chuStack` — ngăn xếp "đang xử lý state của ai". `oNguoi()` dùng đỉnh ngăn xếp để
  không coi hành tinh của chính chủ là mục tiêu địch; dòng `tran` dùng đáy ngăn xếp
  (`chuStack[0]`) làm bên tấn công.
- `mocTick` — stack horizon của lượt authoritative ngoài cùng. Một trận due trong
  quãng offline dùng mốc cố định này; nếu candidate đã tick xa hơn, attack được
  rebase thay vì đánh ngược thời gian.

Vì cả ba đều nằm trong bộ nhớ, mô hình này chỉ đúng khi có **một tiến trình server
duy nhất** ghi vào file database. Không chạy hai instance trên cùng một file `.db`.

### Giới hạn đã biết

- **Không có event sourcing lịch sử.** State chỉ tiến; nếu host/supporter còn được
  discover và đã tick quá T, attack được rebase tới `max(lastTick)` mà không tạo
  trận/log/phế liệu ở T. Tuy nhiên, nếu supporter đã hết hạn và biến mất khỏi
  projection **trước khi** attack lịch sử được xử lý, latest-state DB không thể
  tái dựng việc nó từng hiện diện. Muốn loại giới hạn này cần event log/scheduler
  toàn cục, không chỉ một snapshot JSON mới nhất.
- **Báo động trước không lộ đội hình.** Bên phòng thủ thấy được ai đang đánh mình,
  từ toạ độ nào và còn bao lâu (bảng `hamdang` → `st.pvpToi`), nhưng **không** thấy
  địch mang những tàu gì — muốn biết thì phải do thám ngược lại. Nhiệm vụ do thám
  của đối phương thì không hiện ở đây. Riêng đợt tấn công của NPC vẫn đi qua `st.toi`
  của `G.hepRaid`, là một cơ chế khác nằm trong state.
- **Không có tấn công phối hợp.** Mỗi hạm đội tới đích là một trận riêng, đánh xong
  là xong; không có cơ chế gộp nhiều hạm đội đến gần nhau thành một trận.
- **Một writer process.** UoW làm từng trận crash-atomic trong một tiến trình, nhưng
  `dangTick` không phải distributed lock. Không chạy hai instance ghi chung một
  file SQLite; triển khai nhiều process cần hàng đợi/lock liên tiến trình riêng.
- **Chiếm hành tinh chưa có.** PvP chỉ cướp tài nguyên và phá phòng thủ; không có
  hành động nào chuyển chủ một hành tinh đã có người giữ.

## 6. Bảo mật

### Mật khẩu

- Băm bằng **scrypt** (`crypto.scryptSync`) với `N=16384, r=8, p=1`, độ dài khoá 64 byte.
- **Muối riêng cho từng tài khoản**: 16 byte ngẫu nhiên (`crypto.randomBytes`), lưu
  hex ở cột `tk.muoi`. Đổi mật khẩu sinh muối mới.
- So sánh bằng `crypto.timingSafeEqual` (hàm `bangNhau`), có kiểm tra độ dài trước.
- Mật khẩu **không bao giờ** được ghi log, không lọt vào `dq.state`, không quay lại
  client.
- Kiểm tra định dạng: tên đăng nhập `^[A-Za-z0-9_.-]{3,24}$` (lưu ở dạng chữ thường),
  mật khẩu ≥ 6 ký tự, tên chỉ huy 2–24 ký tự và không chứa `< > & "`.

### Phiên

- Token = 24 byte ngẫu nhiên dạng hex (48 ký tự), gửi qua header `x-thdc-token`,
  client lưu ở `localStorage` khoá `thdc_mp_token`.
- Hạn 30 ngày. Mỗi lần đăng nhập dọn luôn các phiên đã hết hạn, và một
  `setInterval` mỗi giờ cũng dọn.
- Đăng xuất xoá hẳn dòng `phien`. Nếu server trả **401** khi client đang có token,
  `web/js/mp.js` tự xoá token và đưa về màn đăng nhập.
- **Đổi mật khẩu thu hồi mọi phiên khác** (`phienXoaKhac`), chỉ giữ lại phiên đang
  thao tác — token bị lộ không sống sót qua một lần đổi mật khẩu.
- Mọi POST cần đăng nhập **xác thực lại token và nạp lại dòng tài khoản sau khi
  nhận đủ body**. Vì đọc body là bất đồng bộ, bước này chặn một request gửi dở
  tiếp tục chạy bằng phiên vừa bị đăng xuất hoặc thu hồi bởi lần đổi mật khẩu khác.
- Xoá tài khoản xoá sạch phiên của tài khoản đó.
- Không dùng cookie nên **không có bề mặt CSRF**; ngược lại, token nằm trong
  `localStorage` nên phải chặn XSS — mọi chuỗi do người chơi nhập đều đi qua
  `U.esc()` trước khi vào HTML, và tên chỉ huy / tên hành tinh bị lọc `< > & "`
  ngay ở tầng nhập.

### Chống lạm dụng

**Nguồn IP.** Mặc định chỉ dùng `req.socket.remoteAddress`; header
`x-forwarded-for` **chỉ được tin khi đặt `THDC_PROXY=1`**. Nếu tin vô điều kiện thì
ai cũng tự khai IP giả cho mỗi lần thử, và giới hạn đoán mật khẩu mất tác dụng
hoàn toàn. Chỉ bật `THDC_PROXY=1` khi thật sự có reverse proxy ghi đè header này.

- **Giới hạn tần suất** (`API.gioiHan`, cửa sổ trượt 10 giây):
  **8 yêu cầu / 10 giây theo IP** cho `/api/dangky` và `/api/dangnhap` — hai đường
  dẫn này gọi scrypt nên rất tốn CPU, phải siết chặt hơn; **40 yêu cầu / 10 giây
  theo token** cho phần còn lại. Vượt ngưỡng trả **429**. Bảng đếm tự xoá khi vượt
  5.000 khoá để không phình bộ nhớ.
- **Giới hạn kích thước body**: 96 KiB (`BODY_MAX`). Vượt ngưỡng thì server ngừng
  tích luỹ dữ liệu, vẫn đọc cạn request rồi trả 413. JSON sai cú pháp trả lỗi rõ ràng.
- Chuỗi vào đều bị `slice` về độ dài tối đa (`chuoi(v, dai)`) trước khi dùng.
- Token khi tra cứu bị `slice(0, 80)`.

### Tại sao mọi hành động phải chạy lại trên server

`js/actions.js` là **nơi duy nhất** hành động của người chơi được thực thi, và nó
được viết với giả định **dữ liệu vào là không tin được**:

- `ht(st, pi)` kiểm tra chỉ số hành tinh nằm trong `st.planets`.
- `soDuong(v, toiDa)` ép số nguyên dương và chặn trần (ví dụ đóng tàu tối đa 100.000 mỗi lệnh).
- `chuoi(v, dai)` chặn độ dài chuỗi.
- Mọi id công trình / đề tài / tàu / phòng thủ / tên lửa / nhiệm vụ đều phải tồn tại
  trong bảng dữ liệu (`G.B`, `G.R`, `G.S`, `G.D`, `G.M`, `G.MISSIONS`) mới được chạy.
- Toạ độ đi qua `G.tdParse` mới được nhận; loại tài nguyên phải có trong
  `G.C.TY_GIA` hoặc `G.RES_HANH_TINH`; `pct` bị kẹp về 10–100 và làm tròn bội 10;
  giờ giữ chỗ kẹp về 1–24.
- Chi phí, điều kiện tiên quyết, dung tích kho, giới hạn thuộc địa đều do
  `G.xepXay` / `G.xepNC` / `G.xepTau` / `G.guiHam` quyết định, không do client.

Client chỉ gửi `{ten, dl}`. Server **tua thời gian trước** rồi mới chạy hành động
trên state trong database, nên client có sửa `window.ST` cũng không thay đổi gì:
lượt sau `/api/state` sẽ ghi đè lại state thật.

### Phục vụ file tĩnh

Chỉ **5 thư mục** ở gốc repo được mở: `web`, `js`, `css`, `docs`, `dist`
(mảng `CHO_PHEP` trong `server/index.js`). Cơ chế:

- `/` và `/index.html` → `web/index.html`; `/motnguoi` và `/solo` → `index.html` ở gốc.
- Đường dẫn khác được `path.normalize`, bỏ dấu `/` đầu, **từ chối nếu còn chứa `..`**,
  rồi kiểm tra đoạn đầu tiên có nằm trong `CHO_PHEP` không. Không khớp → 404.
- Đường dẫn chứa **byte NUL** (`\0`) bị chặn ở cả `tinhTep()` và `traFile()`;
  URL không giải mã được (`decodeURIComponent` ném lỗi) trả **400** thay vì đổ stack.
- Vì vậy `server/`, `tools/`, `.git/`, `README.md` và file database **không phục vụ
  qua HTTP**.
- Chỉ chấp nhận `GET` và `HEAD`; phương thức khác trả **405**.
- Kiểu MIME lấy từ bảng `LOAI` theo phần mở rộng, mặc định `application/octet-stream`;
  luôn kèm `X-Content-Type-Options: nosniff` và `Cache-Control: no-cache`.

Server **không tự làm TLS** và không tự nén — hai việc đó để cho reverse proxy.

## 7. Vận hành

### Sao lưu

Database ở chế độ WAL nên **một file `.db` là chưa đủ**. Hai cách:

```bash
# cách 1: dừng server rồi copy cả ba file
cp server/data/thdc.db     /noi/sao-luu/
cp server/data/thdc.db-wal /noi/sao-luu/ 2>/dev/null
cp server/data/thdc.db-shm /noi/sao-luu/ 2>/dev/null

# cách 2: sao lưu nóng, không cần dừng server (cần sqlite3 CLI)
sqlite3 server/data/thdc.db ".backup '/noi/sao-luu/thdc-$(date +%F).db'"
```

Cách 2 tạo một file duy nhất đã gộp WAL, khôi phục chỉ cần copy trở lại rồi khởi
động server với `THDC_DB` trỏ vào nó. `tools/test-server.js` có một bài kiểm tra
đúng cho việc này: tắt server, bật lại từ cùng file `.db`, và xác nhận hạt giống vũ
trụ, số tài khoản, đế quốc cũ và cả báo cáo trận đánh trong hộp tin đều còn nguyên.

**Đừng khôi phục đè khi server đang chạy** — tiến trình đang giữ `dangTick` /
`chuStack` cho state cũ trong bộ nhớ.

`.gitignore` đã loại `server/data/`, `*.db`, `*.db-wal`, `*.db-shm` — dữ liệu người
chơi thật không bao giờ lọt vào repo.

### Đặt sau reverse proxy

> Nhớ bật `THDC_PROXY=1` khi (và chỉ khi) đã có proxy ghi đè `x-forwarded-for`.


Server nghe HTTP thuần trên `PORT`. Ví dụ với nginx:

```nginx
location / {
    proxy_pass         http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

Lưu ý:

- Giới hạn tần suất theo IP đọc `x-forwarded-for` và lấy **giá trị đầu tiên**. Proxy
  phải **ghi đè** header này (như cấu hình trên) chứ không được cho client tự đặt —
  nếu không, client có thể bịa IP để lách giới hạn ở `/api/dangky` và `/api/dangnhap`.
- Đặt TLS, nén và (nếu muốn) cache file tĩnh ở tầng proxy.
- Không có WebSocket nên không cần cấu hình `Upgrade`.
- Chỉ chạy **một** tiến trình server cho một file database (xem mục 5) — không
  `cluster`, không nhiều node sau load balancer.
- Chạy dưới một service manager (systemd, pm2, …) để tự khởi động lại. `SIGTERM`
  đã được xử lý sạch: dừng scheduler, đóng HTTP server, đóng database.

### Cảnh báo ExperimentalWarning

`node:sqlite` là **tính năng thử nghiệm của Node 22**, nên mỗi lần chạy server (và
`tools/test-server.js`) Node in ra:

```
(node:12345) ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

Đây là cảnh báo bình thường, không phải lỗi. Muốn ẩn thì thêm
`--no-warnings=ExperimentalWarning`:

```bash
node --no-warnings=ExperimentalWarning server/index.js
```

Đổi lại, hãy đọc kỹ ghi chú thay đổi khi nâng Node lên bản mới: API `node:sqlite`
có thể đổi.

### Theo dõi

- `THDC_AM=1` in một dòng mỗi vòng scheduler có việc: `[nhip] đã tua N đế quốc`.
- Lỗi API ghi `[api] <đường dẫn> <stack>`; lỗi trong lúc tua ghi `[nhip] …` —
  `tools/test-server.js` coi việc log có hai tiền tố này là kiểm tra **không đạt**.
- Số liệu nhanh: `/api/thongtin` trả số tài khoản và số hành tinh đã có chủ; dòng
  `bangtin` mới nhất cho biết vũ trụ có đang sống hay không.
