# Máy chủ nhiều người chơi — tài liệu kỹ thuật

Tài liệu này mô tả phần `server/` của bản phục dựng: kiến trúc, database, API,
luồng PvP, bảo mật và vận hành. Bản một người (`index.html` + `js/main.js`)
không cần đọc tài liệu này.

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
- **Server là bên quyết định.** Mọi thao tác của người chơi đi qua `POST /api/lam`,
  server tua thời gian rồi gọi lại `G.HANHDONG[ten]` trên state trong database.
  Client không được phép tự kết luận điều gì.
- Client bản nhiều người bật `G.MO_PHONG_NHE = true` (`js/fleet.js`). Ở chế độ này
  `G.tick()` **chỉ chạy phần sản xuất** (mỏ, hàng đợi tàu, đồng hồ nghiên cứu) cho
  các con số nhảy êm giữa hai lần đồng bộ; nó không xử lý sự kiện, không giải quyết
  hạm đội tới đích, không tính bảo trì. Cứ 8 giây `web/js/mp.js` gọi `/api/state`
  để lấy lại state thật; `G.LECH_GIO` được đặt theo `sv.now` để đồng hồ client
  khớp giờ server.
- **Điểm móc nối** giữa bộ luật và thế giới chung là `G.HOOK` (khai báo `null` trong
  `js/galaxy.js`). `TheGioi.veHook()` trong `server/world.js` gán vào đó 8 hàm:

| Hook | Được gọi từ | Việc |
|---|---|---|
| `oNguoi(st, c)` | `G.oHanhTinh` | ô toạ độ này có phải hành tinh của người chơi khác? |
| `npc(st, c, key)` | `G.npc` | lấy trạng thái NPC từ bảng `npc` dùng chung |
| `npcMoi(n)` | `G.npc` | ghi NPC vừa sinh vào bảng `npc` |
| `pheLieu(key)` | `G.pheLieu` | bãi phế liệu dùng chung (bảng `pl`) |
| `xepHang(st)` | `G.xepHang` | bảng xếp hạng lấy từ database, không sinh giả |
| `danhNguoi(st, f, o, veNha)` | `G.hamToiDich` | PvP: tấn công người thật |
| `doThamNguoi(st, f, o)` | `G.hamToiDich` | PvP: do thám người thật |
| `tangNguoi(st, f, o, veNha)` | `G.hamToiDich` | tiếp tế: chở tài nguyên cho người thật |

  Khi `G.HOOK` là `null` (bản một người), vũ trụ nằm gọn trong state của người chơi:
  NPC lưu ở `st.npc`, phế liệu ở `st.debris`, bảng xếp hạng sinh tất định từ hạt giống.
  Khi có `G.HOOK`, `TheGioi.nap()` **xoá sạch `st.npc` và `st.debris`** trước khi trả
  state về, vì hai thứ đó là tài sản chung của server chứ không của riêng ai.

- `js/actions.js` cũng thay đổi hành vi theo `G.HOOK`: hành động `lmvao` ở bản một
  người chỉ nhận tên trong danh sách `G.LIEN_MINH` cố định, còn ở bản nhiều người
  nhận tên bất kỳ rồi để `server/api.js` đối chiếu với bảng `lm` thật.

### File nào làm gì

| File | Việc |
|---|---|
| `server/index.js` | bootstrap, HTTP server, phục vụ file tĩnh, scheduler, tắt máy êm |
| `server/api.js` | toàn bộ đường dẫn `/api/*`, xác thực, băm mật khẩu, giới hạn tần suất |
| `server/world.js` | thế giới dùng chung: nạp/lưu đế quốc, tick, PvP, liên minh, xem hệ, tạo đế quốc mới |
| `server/db.js` | schema SQLite + tập câu truy vấn đã `prepare` sẵn |
| `server/rules.js` | nạp bộ luật `js/*.js` vào tiến trình Node |
| `web/index.html` | trang bản nhiều người (màn đăng nhập/đăng ký + khung game) |
| `web/js/mp.js` | driver client: gọi API, đồng bộ, thêm màn *Bảng Tin Vũ Trụ* và *Tài Khoản* |

Bản nhiều người dùng lại nguyên `js/ui.js` và `js/app.js`; `web/js/mp.js` chỉ ghi đè
`APP.lam`, `APP.taiHe`, `APP.luu`, `U.nguon` và bảng màn `U.MAN` (13 màn: bỏ
*Nhật Ký & Lưu* của bản một người, thêm *Bảng Tin Vũ Trụ* và *Tài Khoản*).

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

Yêu cầu **Node 22 trở lên** (vì `node:sqlite`).

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8080` | cổng HTTP |
| `THDC_DB` | `server/data/thdc.db` | đường dẫn file SQLite. Thư mục cha được tạo tự động. `:memory:` chạy được (dùng cho test) |
| `THDC_NHIP` | `3000` | chu kỳ scheduler, tính bằng **milli-giây** |
| `THDC_AM` | *(tắt)* | đặt `=1` để in `[nhip] đã tua N đế quốc` mỗi vòng có việc |

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
 ├──1:n── phien          (token đăng nhập)
 └──n:1── lm             (liên minh, qua cột dq.lm là TÊN liên minh)

riêng từng người : tk  dq  phien
dùng chung       : ht  hamdang  npc  pl  lm  bangtin  tran
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

**`hamdang`** — chỉ mục hạm đội đang bay tới hành tinh của **người khác**, để bên
phòng thủ được báo động trước. Cùng cơ chế với `ht`: mỗi lần `TheGioi.luu()` chạy,
xoá hết dòng của tài khoản đó rồi ghi lại từ `st.fleets`, nên gọi hạm đội về hay
đổi mục tiêu giữa đường thì báo động tự cập nhật theo.

| Cột | Ý nghĩa |
|---|---|
| `tkA` / `fid` | khoá chính: chủ hạm đội và id hạm đội trong state của họ |
| `tkD` | chủ hành tinh đang bị nhắm tới |
| `tu` / `den` | toạ độ xuất phát / toạ độ đích, dạng `"g:h:p"` |
| `nv` | nhiệm vụ — chỉ ghi `attack` và `transport` |
| `denT` | mốc thời gian tới đích |
| `tenA` / `lmA` | tên và liên minh của bên tấn công (để hiện ngay, không phải join) |

Chỉ mục `hamdang_tkd(tkD, denT)`. **Nhiệm vụ do thám cố tình KHÔNG được ghi vào
đây** — do thám là đi lén. `TheGioi.hamDangToi(tk)` đọc bảng này và trả về danh
sách gắn vào `st.pvpToi` khi client gọi `/api/state` hoặc `/api/lam`; danh sách đó
**không chứa đội hình hạm đội** — muốn biết địch mang gì thì phải do thám ngược lại.
Dòng cũ hơn 24 giờ được dọn mỗi giờ (`hdDonRac`).

**`npc`** — trạng thái các đế quốc NPC: `key` (toạ độ `"g:h:p"`), `data` (JSON của
NPC: tên, liên minh, điểm, công nghệ, hạm đội, phòng thủ, tài nguyên), `t` (lần ghi
cuối). NPC **dùng chung**: ai đánh xuống thì cả server thấy nó yếu đi, và nó hồi
phục dần theo `G.npcHoiPhuc`. Ô nào chưa ai chạm tới thì không có dòng nào —
`G.coNPC(seed, c)` sinh lại tất định từ hạt giống.

**`pl`** — bãi phế liệu: `td` (toạ độ), `kl` (Kim Loại), `tt` (Tinh Thể). Cũng là
tài sản chung: xác tàu của trận đánh giữa hai người khác vẫn vét được bằng Tàu Thu Hồi.

**`lm`** — liên minh: `ten` (PK, dạng `"[TAG] Tên"`), `tag`, `chu` (id người lập),
`tao`, `mota`. Số thành viên và tổng điểm **không lưu ở đây** mà tính bằng
sub-query trên `dq.lm`.

**`bangtin`** — bảng tin toàn server: `id`, `khi`, `loai`, `noi`. `loai` hiện có
`'tk'` (người mới nhận hành tinh), `'lm'` (lập / gia nhập liên minh), `'tran'`
(một trận PvP vừa xong), `'tiepte'` (một người chở tài nguyên cho người khác).
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

**`cauhinh`** — cặp `k` / `v` cho cấu hình server. Hiện dùng hai khoá: `seed`
(hạt giống vũ trụ, sinh một lần rồi giữ vĩnh viễn) và `moLuc` (lúc mở server).

### Bộ đệm NPC và phế liệu

`G.npc()` / `G.pheLieu()` bị gọi rất nhiều lần trong một lượt tua, nên
`server/world.js` có một bộ đệm đếm tham chiếu: `batDau()` mở phạm vi, `ketThuc()`
đóng, và chỉ khi tầng ngoài cùng đóng thì mọi NPC / phế liệu đã bị chạm mới được
ghi xuống database trong **một** giao dịch.

## 4. Bảng API

Tất cả trả JSON, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
Token gửi qua header **`x-thdc-token`**. Lỗi luôn có dạng `{ "loi": "..." }`.

| Đường dẫn | Phương thức | Token | Dữ liệu vào | Dữ liệu ra |
|---|---|---|---|---|
| `/api/thongtin` | GET | không | — | `{seed, soNguoi, soHT, tocDo, tocDoBay, chuKy, phienBan, now}` |
| `/api/dangky` | POST | không | `{ten, mk, hienthi}` | `{token, ten, nha:{g,h,p}}` · 400 sai định dạng · 409 tên đã có · 429 quá nhanh (8 lần / 10 giây) |
| `/api/dangnhap` | POST | không | `{ten, mk}` | `{token, ten}` · 401 sai mật khẩu · 429 quá nhanh (8 lần / 10 giây) |
| `/api/dangxuat` | GET/POST | **có** | — | `{ok:true}` (xoá dòng `phien`) |
| `/api/state` | GET | **có** | — | `{st, sv, toi:{ten, tk}}` — `st` là state đã tua tới hiện tại, `sv` là gói `/api/thongtin` |
| `/api/lam` | POST | **có** | `{ten, dl}` | `{loi, st, sv}` — `ten` là khoá trong `G.HANHDONG`, `dl` là dữ liệu của hành động · 400 hành động không tồn tại · 503 đế quốc đang bị xử lý |
| `/api/he` | GET | **có** | query `?g=&h=` | `{g, h, o:[…15 ô…]}`; mỗi ô có `loai` = `toi` / `nguoi` / `npc` / `trong`, kèm `key`, `c`, `debris` |
| `/api/xephang` | GET | **có** | — | `{ds:[{hang, ten, lm, diem, ht, ta}]}` — tối đa 200 người |
| `/api/lm` | GET | **có** | — | `{ds:[{ten, tag, sl, diem, chu, mota}], tv:[{ten, diem, ht, ta}]}` (`tv` = thành viên liên minh của mình) |
| `/api/lmtao` | POST | **có** | `{ten, tag}` | `{loi, st, sv}` — lập liên minh rồi tự gia nhập · 400 tên/thẻ sai hoặc đã tồn tại |
| `/api/bangtin` | GET | **có** | — | `{bt:[…40 tin…], tran:[…20 trận…]}` |
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
- Riêng hành động `lmvao`: sau khi bộ luật chạy xong, `server/api.js` đối chiếu tên
  liên minh với bảng `lm`; nếu không có thật thì gỡ `st.lm`, lưu lại và trả 400.
- Danh sách hành động (`G.HANHDONG` trong `js/actions.js`, 17 hành động):
  `xay`, `huyxay`, `nc`, `huync`, `dong`, `huydong`, `ban`, `mua`, `gui`, `goive`,
  `doihuong`, `lmvao`, `lmra`, `doctin`, `docHet`, `xoatin`, `doiTenHT`.
- Client (`web/js/mp.js`) gọi `/api/state` mỗi 8 giây và mỗi lần tab được hiện lại;
  `/api/he`, `/api/xephang`, `/api/lm`, `/api/bangtin` gọi khi mở màn tương ứng.
  Không có WebSocket — tất cả là polling.

## 5. Luồng PvP

Đây là chỗ khác biệt lớn nhất so với bản một người: một lượt tua của người A phải
mở và sửa state của người B.

### Khi hạm đội của A tới hành tinh của B

1. **Scheduler hoặc một hành động** gọi `TheGioi.tick(tkA)`. Hàm này đánh dấu
   `dangTick.add(tkA)`, đẩy `tkA` vào `chuStack`, rồi gọi `G.tick(st, now)`.
2. Dòng thời gian chạy tới mốc `f.den_t` và gọi `G.hamToiDich(st, f)`
   (`js/fleet.js`). Nhiệm vụ là `attack`.
3. `G.oHanhTinh(st, f.den)` hỏi **hook `oNguoi`** →
   `TheGioi.oNguoi()` tra `SELECT … FROM ht … WHERE td=?`. Nếu có chủ và chủ đó
   **không phải** `chuStack` hiện tại thì trả về ô `{loai:'nguoi', tk, ten, lm, diem,
   online, bo, …}`.
4. `G.hamToiDich` thấy `o.loai === 'nguoi'` nên **giao lại cho hook `danhNguoi`**
   và không tự xử lý gì thêm — bộ luật không biết database, đó là việc của server.
5. `TheGioi.danhNguoi(st, f, o, veNha)`:
   1. Nếu `dangTick` đã chứa `tkB` (tức đế quốc B đang được tua ở một khung ngăn xếp
      khác) → **hoãn**: `f.den_t = st.now + 20`, hạm đội vẫn đang bay, thử lại sau
      20 giây. Đây là cơ chế chống đệ quy.
   2. Nạp state của B, `dangTick.add(tkB)`, `chuStack.push(tkB)`.
   3. **Tua B tới đúng mốc hạm đội tới**: `G.tick(d.st, st.now)`.
   4. Tìm lại hành tinh của B theo toạ độ. Nếu B đã không còn giữ toạ độ đó →
      gửi tin "Mục tiêu đã biến mất", lưu B, hạm đội quay về.
   5. **Bảo vệ người chơi mới, kiểm tra hai chiều** theo `G.C.BAO_VE_MOI_DIEM`
      (5.000 điểm) và `G.C.BAO_VE_MOI_TY_LE` (5 lần): chặn cả trường hợp người mạnh
      đánh người mới, và trường hợp người mới đang được bảo vệ mà đi đánh người mạnh.
      Bị chặn thì gửi tin cho A, lưu B, hạm đội quay về.
   6. `G.danhTran(...)` — **cùng bộ mô phỏng 6 vòng, phòng thủ hai lớp** như bản một
      người, hạt ngẫu nhiên là `G.hash(f.id + ':' + st.now + ':' + o.key)` nên trận
      đánh tái lập được. Ghi lại hạm đội còn sống của A, hạm đội và phòng thủ còn
      sống của B.
   7. **Chia chiến lợi phẩm**: nếu A thắng, `G.chiaHang` lấy tối đa
      `G.C.CUOP_TOI_DA` (50%) tài nguyên của hành tinh B, giới hạn bởi khoang hàng
      còn trống của hạm đội A. Tài nguyên bị **trừ thật** khỏi hành tinh B và cộng
      vào `f.cargo`. Cập nhật `stats` (thắng/thua, cướp, tàu mất, tàu diệt) cho
      **cả hai** state.
   8. **Phế liệu chung**: `G.pheLieu(st, o.key)` đi qua hook nên xác tàu đọng vào
      bảng `pl` — ai cũng vét được.
   9. **Ghi báo cáo cho cả hai bên**: A nhận tin `tran` "Báo cáo chiến đấu … — <tên B>",
      B nhận tin `tran` "BỊ TẤN CÔNG tại … — <tên A>". Cả hai tin đều mang cờ
      `pvp: true` và tên đối thủ.
   10. **Ghi sổ chung**: một dòng `tran` (ai đánh ai, kết quả, cướp, tàu mất) và một
       dòng `bangtin` loại `'tran'` cho bảng tin toàn server.
   11. **Lưu B** (`TheGioi.luu(tkB, d.st)` — ghi `dq` và ghi lại các dòng `ht` của B),
       rồi `finally` gỡ `chuStack` và `dangTick` của B.
   12. Nếu hạm đội A bị xoá sổ thì xoá luôn; còn tàu thì `veNha(null)` cho bay về.
6. Quay lại `TheGioi.tick(tkA)`: dòng thời gian của A chạy tiếp, kết thúc bằng
   `TheGioi.luu(tkA, st)`.

### Do thám người thật

`doThamNguoi` chạy cùng khuôn: hoãn 20 giây nếu đối phương đang bị tua, nạp và tua
B, tính mức chi tiết báo cáo theo chênh lệch **Công Nghệ Tình Báo** và số tàu do
thám, cho **Trung Tâm Tình Báo** của B bắn hạ một phần tàu (`0.05 × cấp intel` cộng
phần bù nếu B mạnh hơn về tình báo, trần 90% mỗi chiếc), ghi báo cáo vào hộp tin và
`st.spy[key]` của A, đồng thời gửi tin "Bị do thám tại …" cho B. Mức chi tiết:
1 = tài nguyên, 2 = thêm hạm đội, 3 = thêm phòng thủ, 4 = thêm công nghệ,
5 = thêm công trình.

### Tiếp tế người thật

Nhiệm vụ **Vận Chuyển** (`transport`) tới hành tinh của người chơi khác đi qua hook
`tangNguoi` — cùng khuôn với hai luồng trên: hoãn 20 giây nếu đối phương đang bị
tua, khoang hàng trống thì quay về ngay, đối phương đã rời toạ độ thì mang hàng về.
Kho bên nhận chỉ chứa tới **150% dung tích**; phần dư được mang về chứ không bốc hơi.
Cả hai bên nhận tin `ham` ("Đã tiếp tế …" / "Được tiếp tế từ …"), và một dòng
`bangtin` loại `'tiepte'` được ghi cho bảng tin toàn server.

Nhiệm vụ **Triển Khai** (`deploy`) thì không có hook: chở tàu sang hành tinh người
khác vẫn bị coi là "không phải hành tinh của ta" và hạm đội mang hàng quay về.

### Chống đệ quy

Không dùng lock của database mà dùng hai cấu trúc trong bộ nhớ tiến trình:

- `dangTick` — `Set` các tài khoản **đang** được tua. `TheGioi.tick()` thấy tài khoản
  đã có trong `Set` thì trả `null` ngay (API trả 503 "Đế quốc đang được xử lý, thử
  lại sau một nhịp"). `danhNguoi` / `doThamNguoi` thấy đối phương đã có trong `Set`
  thì **hoãn 20 giây** thay vì chờ, nhờ vậy hai hạm đội bay chéo vào nhau cùng lúc
  không gây đệ quy vô hạn.
- `chuStack` — ngăn xếp "đang xử lý state của ai". `oNguoi()` dùng đỉnh ngăn xếp để
  không coi hành tinh của chính chủ là mục tiêu địch; dòng `tran` dùng đáy ngăn xếp
  (`chuStack[0]`) làm bên tấn công.

Vì cả hai đều nằm trong bộ nhớ, mô hình này chỉ đúng khi có **một tiến trình server
duy nhất** ghi vào file database. Không chạy hai instance trên cùng một file `.db`.

### Giới hạn đã biết

- **Không tua ngược được.** `G.tick(d.st, st.now)` chỉ tiến, không lùi
  (`if (now <= st.lastTick) return`). Nếu state của B đã được scheduler tua **quá**
  mốc `f.den_t` của hạm đội A, trận đánh vẫn diễn ra nhưng **trên state của B ở thời
  điểm muộn hơn** — B có thể đã kịp xây thêm phòng thủ hoặc đã tiêu bớt tài nguyên
  trong khoảng lệch đó. Sai lệch bị chặn trên bởi nhịp scheduler (`THDC_NHIP`) và
  bởi việc `keTiep` luôn khớp mốc sự kiện gần nhất, nên thực tế thường là vài giây.
- **Báo động trước không lộ đội hình.** Bên phòng thủ thấy được ai đang đánh mình,
  từ toạ độ nào và còn bao lâu (bảng `hamdang` → `st.pvpToi`), nhưng **không** thấy
  địch mang những tàu gì — muốn biết thì phải do thám ngược lại. Nhiệm vụ do thám
  của đối phương thì không hiện ở đây. Riêng đợt tấn công của NPC vẫn đi qua `st.toi`
  của `G.hepRaid`, là một cơ chế khác nằm trong state.
- **Không có tấn công phối hợp.** Mỗi hạm đội tới đích là một trận riêng, đánh xong
  là xong; không có cơ chế gộp nhiều hạm đội đến gần nhau thành một trận.
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
- Không dùng cookie nên **không có bề mặt CSRF**; ngược lại, token nằm trong
  `localStorage` nên phải chặn XSS — mọi chuỗi do người chơi nhập đều đi qua
  `U.esc()` trước khi vào HTML, và tên chỉ huy / tên hành tinh bị lọc `< > & "`
  ngay ở tầng nhập.

### Chống lạm dụng

- **Giới hạn tần suất** (`API.gioiHan`, cửa sổ trượt 10 giây):
  **8 yêu cầu / 10 giây theo IP** cho `/api/dangky` và `/api/dangnhap` — hai đường
  dẫn này gọi scrypt nên rất tốn CPU, phải siết chặt hơn; **40 yêu cầu / 10 giây
  theo token** cho phần còn lại. Vượt ngưỡng trả **429**. Bảng đếm tự xoá khi vượt
  5.000 khoá để không phình bộ nhớ.
- **Giới hạn kích thước body**: 96 KiB (`BODY_MAX`). Vượt là huỷ kết nối ngay giữa
  luồng, không đọc hết. JSON sai cú pháp trả lỗi rõ ràng.
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
