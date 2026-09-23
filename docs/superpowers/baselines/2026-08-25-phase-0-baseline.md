<!-- Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 -->

# Phase 0 — Baseline và khóa contract giao diện

Ngày chụp: 2026-08-25  
Gate A: đã được duyệt bởi chủ dự án  
Kết luận Gate P0: **ĐẠT CÓ ĐIỀU KIỆN — sẵn sàng review, chưa được sửa production**

Nguồn thiết kế khóa: [`design.md`](../../../design.md)  
Implementation plan: [`2026-08-25-trung-tam-chi-huy-hybrid.md`](../plans/2026-08-25-trung-tam-chi-huy-hybrid.md)  
Inventory máy-đọc-được: [`2026-08-25-ui-contract-inventory.json`](./2026-08-25-ui-contract-inventory.json)

## 1. Phạm vi và nguyên tắc bảo toàn

Phase này chỉ đọc production, chụp baseline và tạo hai artifact trong
`docs/superpowers/baselines/`. Không sửa, reset, stash, checkout, format hay
stage bất kỳ file production nào. 32 ảnh và hai bản build kiểm chứng chỉ nằm
trong `/tmp`.

Baseline được lấy tại:

- commit `51f5101466242a880177a44d62c471b2c826a3fa`, nhánh `main`;
- so với upstream: ahead 38, behind 0;
- tracked diff có 5 file, 92 dòng thêm, 2 dòng xóa;
- SHA-256 của `git diff --binary`:
  `45dcd24c0daee03d0d2a87ed439799672e75ff07f38b0fe199ac1ccd30b9c58f`.

| File dirty có trước Phase 0 | +/- | SHA-256 nội dung |
|---|---:|---|
| `css/style.css` | +7 / -1 | `0d6a802ce9bdd0ec92b22dd70d1c00357f1facc76e74a88dafbf11f18cda5812` |
| `server/api.js` | +17 / -0 | `815ce42cb477f2b9a16cb0995c2dc1dc5f10294a504beaacef9076e3554892bc` |
| `server/index.js` | +13 / -0 | `706ce5b115a80fa2b9e419ad110e29f63f70028c9f34b34bd0d3257aabbcbd01` |
| `web/index.html` | +14 / -0 | `8e70543330b485ba8ccf64cafa289c78c802d6cf2b5e1ab456d6200cd3ffdc26` |
| `web/js/mp.js` | +41 / -1 | `b173311a160f78cbd5959a2ca35856a0ac3580a4a515f05b929f1e3d3b7cfaa7` |

Hai hash `server/*` được đối chiếu lại cuối Phase 0 và không đổi. Các thay đổi
server là ngoài scope redesign, phải tiếp tục được giữ nguyên.

## 2. Contract inventory

Inventory JSON lưu vị trí nguồn, hash, tập đích, renderer, icon, action handler,
`data-live`, `data-man`, DOM id, direct binding, class/CSS và các assertion.
Tóm tắt:

| Contract | Baseline |
|---|---|
| Destination solo | 15 |
| Destination multiplayer | 17 |
| Chung giữa hai mode | 14 |
| Hợp hai mode | 18 |
| Renderer cho destination | 18/18 |
| Giá trị `data-act` tĩnh / handler | 77 / 79 |
| Live key thực tế | 12 |
| Inline `style=` | 124 |
| Static duplicate HTML id | 0 |

Thứ tự destination:

- Solo: `tongquan, tainguyen, congtrinh, nghiencuu, xuong, phongthu, hamdoi,
  thienha, lienminh, taichinh, xephang, mophong, tinnhan, huongdan, nhatky`.
- Multiplayer: `tongquan, tainguyen, congtrinh, nghiencuu, xuong, phongthu,
  hamdoi, thienha, lienminh, taichinh, xephang, bangtin, chat, mophong,
  tinnhan, huongdan, taikhoan`.
- Solo-only: `nhatky`; multiplayer-only: `bangtin, chat, taikhoan`.

12 live key phải giữ nguyên:

`res.metal`, `rate.metal`, `res.crystal`, `rate.crystal`, `res.deut`,
`rate.deut`, `res.food`, `rate.food`, `galana`, `rate.galana`,
`tech`, `rate.tech`.

Các class hành vi không được đổi nghĩa trong migration:
`.dem`, `.mo-ra`, `.oke`, `.kd-form`.

Assertion inventory hiện tại:

- PASS: số destination; mọi menu item có renderer; mọi `data-act` tĩnh có
  handler; không trùng static HTML id.
- FAIL sẵn có: icon `taikhoan` chưa được định nghĩa; CSS lệch ngoặc; CSS dùng
  custom property chưa định nghĩa.

Lưu ý: fallback của `U.ve()` có thể che giấu renderer bị thiếu. Test migration
phải kiểm `typeof U['m_' + id] === 'function'` trực tiếp, không chỉ kiểm màn có
nội dung.

## 3. Kết quả kiểm chứng

| Kiểm chứng | Kết quả | Ghi chú |
|---|---|---|
| `node --check` cho `js/ui.js`, `js/app.js`, `js/main.js`, `web/js/mp.js`, `tools/build.js` | PASS | Không lỗi cú pháp JS |
| `npm test` — lượt baseline có quyền mở cổng | PASS | 241 smoke assertions + 333 server assertions |
| Build tương đương script npm, nhưng chỉ định output `/tmp` | PASS | `node tools/build.js /tmp/thdc-phase0-standalone.html` và bản `--artifact`; 353.639 B / 351.974 B |
| `npm run test:ui` với Playwright/Chromium hiện có | **RED baseline** | Hai assertion fail rồi timeout khi đổi thuế |
| Harness chụp riêng, solo + multiplayer | PASS phần capture | 32/32 ảnh được tạo |

### UI suite hiện hữu

Suite chạy được khi chỉ rõ Playwright và Chromium cục bộ, nhưng không thể dùng
làm gate xanh ở trạng thái hiện tại:

- assertion thanh tài nguyên còn kỳ vọng chuỗi đầy đủ “Kim Loại/Galana”, trong
  khi UI dùng ký hiệu `KL/GL`;
- menu còn khóa ở 16 mục tại `tools/test-mp-ui.mjs:205`, hiện multiplayer có 17;
- luồng Tài Nguyên còn query `#cho-metal` tại dòng 243–245, id này không còn;
- đoạn solo còn assert payload `v===6` dù engine đã ở state v7; tên key
  `thdc_save_v6` được giữ có chủ đích như compatibility slot, không phải schema;
- lần chạy baseline dừng ở thao tác đổi thuế vì không nhận được `/api/lam`.

Đây là kết hợp giữa test drift và lỗi UI/runtime sẵn có, không phải regression
do Phase 0.

Lượt kiểm cuối trong sandbox vẫn đạt 241 smoke assertions, nhưng phần server bị
chặn ngay tại `listen 0.0.0.0` với `EPERM`. Harness thử lại cũng không được cấp
cổng; vì vậy kết quả này được phân loại là giới hạn môi trường. Kết quả 333
server assertions PASS ở lượt baseline trước đó vẫn là mốc code, và hash của cả
năm file dirty không đổi giữa hai lượt.

### Ma trận ảnh

Hai mode × bốn màn × bốn viewport:

- mode: `solo`, `multiplayer`;
- màn: `auth`, `tongquan`, `tainguyen`, `thienha`;
- viewport: `1440×1000`, `960×900`, `414×896`, `320×800`.

Tên file:
`/tmp/thdc-phase0-{solo|multiplayer}-{auth|tongquan|tainguyen|thienha}-{1440|960|414|320}.png`.
Ảnh tạm không được commit và có thể mất khi môi trường `/tmp` được dọn.

## 4. Quan sát baseline theo mức độ

| ID | Mức | Quan sát và bằng chứng | Điều kiện trước khi đi sâu vào Phase 1 |
|---|---|---|---|
| S01 | **Release blocker, ngoài scope redesign** | Dirty diff thêm `POST /api/admin/tocdo` tại `server/api.js:146–152` trong nhánh công khai, trước auth, không kiểm token/role; bất kỳ client nào chạm được server đều có thể đổi tốc độ. Control tương ứng còn hiện ngay trên auth screen. | Không sửa trong redesign. Owner server phải quyết định mô hình quyền và có security test riêng trước release; Phase 1 tuyệt đối không coi endpoint này là contract đã được duyệt. |
| B01 | Blocker | Multiplayer ném `Cannot set properties of null (setting 'onclick')` ở `web/js/mp.js:718`: nút `#mo-cauhinh` chỉ được chèn sau khi request async hoàn tất. Exception xảy ra trước auto-login token và `APP.batDauNhip()`. | Reconcile phần dirty có chủ đích; không reset thay đổi của người dùng. Thêm guard/bind sau khi DOM tồn tại. |
| B02 | Blocker | `css/style.css` có brace balance `+1`; block mới cuối file nằm trong media query chưa đóng. Ba biến `--xanh`, `--xanh2`, `--duong` chưa định nghĩa. | Khóa test CSS syntax/token rồi sửa tại bước foundation đầu tiên. |
| B03 | Cao | Progress dân số dùng `span.bar` inline; ảnh desktop và mobile cho thấy gradient cao hàng chục pixel, tràn khỏi thẻ và che pill/nút Thuế. | Tạo primitive progress có kích thước/display rõ ràng và test không overlap. |
| B04 | Cao | Gọi `U.ve()` khi focus ở `#ct-sl-metalMine` làm mất focus và đổi giá trị `17 → 1`. | Viết test focus/input preservation trước migration shell; chỉ render lại khi signature thực sự đổi. |
| B05 | Cao | Root báo không horizontal overflow vì đang clip, nhưng phần tử bên trong vẫn vượt viewport: Thiên Hà vượt ở 414 px; Tài Nguyên và Thiên Hà vượt ở 320 px, bảng Thiên Hà tới khoảng 478–491 px. | Chọn card/stack hoặc scroll container có affordance rõ; test element bounds, không chỉ `scrollWidth`. |
| B06 | Trung bình | Cả 32 trạng thái không có `h1` hoặc `h2`; nội dung bắt đầu từ `h3`. | Thiết lập heading hierarchy và landmark trong shell/page header. |
| B07 | Trung bình | `taikhoan` thiếu icon và đang rơi về icon Tổng Quan. | Bổ sung icon cùng hệ nét ở migration IA. |
| B08 | Trung bình | UI suite cũ khóa copy/id/count/state version đã thay đổi và abort sớm, nên chưa bảo vệ đủ 17 màn. | Sửa contract test trước thay đổi diện rộng; thêm exact set, navigation hook và focus test. |
| B09 | Thấp | 124 inline style làm semantic tokens/responsive khó quản lý; 92 occurrence nằm trong `js/ui.js`. | Chuyển dần sang primitives/classes theo page family, không rewrite mù. |

Khi harness cố ý chặn request ngoài, console ghi lỗi tải Google Fonts. Ảnh vẫn
render bằng fallback; đây là bài kiểm fallback/offline, không được xếp là
regression logic.

## 5. Đánh giá Gate P0

- [x] Đã ghi worktree, diff fingerprint, per-file hash và ownership.
- [x] Có inventory machine-checkable cho destination/hook/DOM/class/action.
- [x] Syntax, unit/server test và build đã chạy.
- [x] UI baseline đỏ đã được phân loại, không bị trình bày thành regression mới.
- [x] Đủ 32 ảnh ở 4 viewport; không commit ảnh tạm.
- [x] Không file production nào bị Phase 0 sửa.
- [x] Executable contract/focus tests đã được tạo ở nhịp P1.0 trước migration
  visual diện rộng.

Vì hai tiêu chí Gate P0 trong implementation plan đều đã đạt — có inventory và
danh sách lỗi baseline; không đổi production — Gate P0 **đủ điều kiện để review**.
Tuy nhiên Phase 1 chỉ nên bắt đầu bằng một nhịp “P1.0 reconciliation + test
guards” xử lý B01/B02 và khóa contract/focus, sau đó mới phát token và thay shell.

## 6. Phạm vi được phép ở nhịp kế tiếp

Nếu Gate P0 được duyệt, nhịp đầu của Phase 1 nên giới hạn ở:

1. thêm executable contract test cho exact destination set, renderer, hook và
   focus/input preservation;
2. reconcile lỗi async binding trong `web/js/mp.js` và ngoặc/biến CSS đang dirty;
3. tạo `tokens.css`, nối build và HTML theo source of truth `design.md`;
4. chạy lại syntax, 241 + 333 assertions, UI contract test và chụp diff ở bốn
   viewport trước khi đụng shell/IA.

Không mở rộng sang API, state schema, công thức game hoặc `server/*`.

## 7. Cập nhật sau Gate P0 — 2026-08-26

- Gate P0 đã được duyệt và P1.0 reconciliation hoàn tất.
- `tools/test-ui-contracts.js` đạt 33 contract: exact destination/action/live
  hooks, CSS/token health, MP boot, focus/input và các invariant chợ.
- `npm test` đạt 33 UI contracts + 241 luật + 333 server assertions.
- B01–B04, B07–B08 đã có fix/guard; B05–B06 tiếp tục thuộc migration shell.
- UI không expose hoặc gọi endpoint `/api/admin/tocdo` chưa có authorization;
  S01 vẫn là release blocker phía server và không bị coi là contract UI.
- Browser-native layout/focus chưa rerun được trong sandbox hiện tại do
  `listen EPERM`/Chromium crashpad; suite đã được đồng bộ và chờ chạy local.

## 8. Cập nhật Phase 1 — 2026-08-26

- `css/tokens.css` là source semantic độc lập, khớp exact 64 token trong
  `design.md`; 18 alias legacy trỏ đúng nghĩa và được nạp trước `css/style.css`.
- Foundation chuyển body về 16px, bảng 14px, label/helper tối thiểu 12px; control
  mobile giữ 44px, focus dùng double ring thống nhất và auth dài có thể cuộn.
- Panel/content không còn blur, glow, text-shadow, action gradient hay pulse vô
  hạn; modal là nơi duy nhất còn backdrop blur và auth chỉ có hai vùng sáng tĩnh.
- Màu `G.RES[].mau` đã rút khỏi chữ UI, chỉ còn đi qua dot/swatch data encoding.
- `npm test` đạt 52 UI contracts + 241 luật + 333 server assertions; hai dist
  được sinh lại và đều inline token trước legacy CSS.
- Hash `server/api.js` và `server/index.js` vẫn đúng baseline; redesign không sửa
  hai file server dirty ngoài scope.
- Browser-native visual verification vẫn chờ môi trường có Playwright + quyền
  bind server; `npm run test:ui` hiện dừng ở `ERR_MODULE_NOT_FOUND`.

## 9. Cập nhật Phase 2 — 2026-08-26

- Một registry canonical 18 destination tạo đúng 15 màn solo và 17 màn
  multiplayer theo năm workspace; MP không còn sao chép cả `U.MAN`.
- Shell chung có workspace rail/bottom nav, secondary destination nav, page
  header một `h1`, command palette “Đi tới…” và semantic button/ARIA contract.
- `U.denMan()` là đường điều hướng duy nhất: cập nhật hành tinh, workspace và màn
  trước render; preload MP theo metadata; chỉ focus/scroll khi người dùng chủ động.
- Full render cùng context giữ value/selection/focus; background sync không gọi
  focus. Khoảng cách mới dùng token và contract chặn spacing inline quay lại.
- `npm test` đạt 96 UI contracts + 241 luật + 333 server assertions; build lại
  `dist/thien-ha-dai-chien.html` và `dist/artifact.html` thành công.
- Hash server vẫn là `815ce42…892bc` (`server/api.js`) và `706ce5b…bd01`
  (`server/index.js`); redesign không sửa hai file dirty ngoài scope.
- `npm run test:ui` vẫn dừng trước khi mở browser vì thiếu Playwright
  (`ERR_MODULE_NOT_FOUND`); chưa có bằng chứng viewport/mouse/keyboard mới.

## 10. Cập nhật Phase 3 — 2026-08-26

- Alert presentation model chuẩn hoá P0–P3, dedupe theo sự kiện và giữ ETA sớm
  nhất; renderer escape toàn bộ text từ state.
- Situation Strip chỉ hiện việc ưu tiên nhất, scope, việc đang chạy và resource
  summary; mobile giữ hành tinh, top alert và resource disclosure.
- Live region tách khỏi countdown: chỉ inbound attack dùng assertive; P1/P2
  polite một lần; tick cập nhật `data-live` mà không full render hoặc đổi focus.
- Tổng Quan đã thành Command Workbench task-first: Attention Queue, Empire
  Snapshot, Planet Matrix chỉ đọc, Operations Queue, Fleet Watch và Recent Intel.
- Thuế, đổi tên, bỏ hoang, huỷ xây/đóng tàu vẫn còn; action tổng hợp giữ đúng
  `data-pi` để không thao tác nhầm hành tinh.
- Contract suite đạt 151/151; game suite đạt 241/241; server suite đạt 333/333;
  hai dist build thành công và `git diff --check` sạch.
- Hash server vẫn là `815ce42…892bc` (`server/api.js`) và `706ce5b…bd01`
  (`server/index.js`). `js/actions.js`, `js/engine.js`, `js/fleet.js`, state schema
  và action payload không đổi. Playwright đã tìm thấy nhưng browser/socket bị
  sandbox chặn `EPERM`, nên Gate B chưa có bằng chứng visual mới.
