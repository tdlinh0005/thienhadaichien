# Trung tâm Chỉ huy Hybrid — Implementation Plan

Ngày: 2026-08-25 · Cập nhật: 2026-08-26 · Trạng thái: Gate A/P0 đã duyệt; Phase 1–3 hoàn tất ở mức code, visual browser/Gate B đang chờ

Design source of truth: [`../../../design.md`](../../../design.md) · UX/IA spec:
[`../specs/2026-08-25-trung-tam-chi-huy-hybrid-design.md`](../specs/2026-08-25-trung-tam-chi-huy-hybrid-design.md) ·
Mindmap định hướng: [`../mindmaps/2026-08-25-trung-tam-chi-huy-review.html`](../mindmaps/2026-08-25-trung-tam-chi-huy-review.html) ·
Mindmap implementation P1–P2: [`../mindmaps/2026-08-26-phase-1-2-implementation-review.md`](../mindmaps/2026-08-26-phase-1-2-implementation-review.md) ·
Mindmap review P3: [`../mindmaps/2026-08-26-phase-3-implementation-review.md`](../mindmaps/2026-08-26-phase-3-implementation-review.md)

> Mục tiêu: chuyển 15 màn solo và 17 màn multiplayer sang một Command Workbench
> dùng chung, theo tỷ lệ 70% Command Center / 20% Operations Console / 10%
> cinematic atmosphere, không thay luật game, API hoặc state schema.

## 0. Ràng buộc toàn cục

- Không implement trước khi Gate A được duyệt.
- Không thêm framework hoặc runtime dependency.
- Không sửa `js/engine.js`, `js/actions.js`, `js/fleet.js`, `js/data.js`, `server/*`,
  database, API hoặc game formulas trong đợt này.
- Không reset/stash/checkout file dirty của người dùng. Patch trên working copy và
  reconcile có chủ đích.
- Giữ `data-act`, `data-man`, `data-live`, screen id và DOM id đang được logic/test
  dùng cho tới khi có test bảo vệ migration tương ứng.
- Ma trận đa hành tinh v1 chỉ đọc. Không batch build/research/fleet hoặc bulk action.
- Action cuối trong luồng chiến đấu vẫn đi qua validation/engine/server hiện hữu;
  UI chỉ preload context và form.
- Một writer tại một thời điểm cho `js/ui.js` và `css/style.css`; reviewer/tester
  không sửa cùng file trong lúc writer đang làm.

## 1. Baseline đã xác minh

- `npm test`: xanh, gồm 241 smoke assertions và 333 server assertions.
- Solo: 15 destination từ `U.MAN` trong `js/ui.js`.
- Multiplayer: 17 destination do `web/js/mp.js` đang ghi đè toàn bộ `U.MAN`.
- `U.ve()` thay toàn bộ `#noidung.innerHTML`; signature thay đổi quá thường xuyên
  có thể làm mất focus và nội dung form.
- `tools/build.js` hiện chỉ inline `css/style.css`.
- UI worktree đang overlap ở `css/style.css`, `web/index.html`, `web/js/mp.js`;
  `server/api.js` và `server/index.js` là thay đổi ngoài scope redesign.
- `css/style.css` hiện thiếu dấu `}` đóng media query cuối file và tham chiếu một
  số biến không tồn tại. Đây là lỗi cần merge có chủ đích, không được reset.

## 2. Phạm vi file dự kiến

### Tạo

- `css/tokens.css` — token semantic và alias tương thích từ `design.md`.

### Sửa

- `css/style.css`
- `index.html`
- `web/index.html`
- `js/ui.js`
- `js/app.js`
- `js/main.js`
- `web/js/mp.js`
- `tools/build.js`
- `tools/test-mp-ui.mjs`

### Sinh lại, không sửa tay

- `dist/thien-ha-dai-chien.html`
- `dist/artifact.html`

### Không sửa

- `js/engine.js`, `js/actions.js`, `js/fleet.js`, `js/data.js`
- `server/api.js`, `server/index.js` và toàn bộ `server/*`

## 3. Dependency map

```text
Gate A: design + spec + mindmaps
  → P0 baseline/contracts
  → P1 tokens + build
  → P2 shell + IA + navigation
  → P3 alert model + situation strip + Command Workbench
  → Gate B: 3 prototype
  → P4 page-family migration
  → P5 combat corridor
  → P6 auth + responsive + accessibility + polish
  → Gate C: functional review
  → P7 verification + visual review
  → Gate D: release-ready
```

P4 có thể chia theo domain sau P2/P3, nhưng các batch cùng sửa `js/ui.js` phải
tuần tự hoặc được chia bằng patch không chồng lấn và merge qua một writer.

---

## Phase 0 — Bảo toàn worktree và khóa contract

**Files:** không sửa production file.

- [x] Ghi lại `git status --short`, diff và hash của năm file đang dirty trước khi
  làm; cuối mỗi phase đối chiếu hai file `server/*` không bị redesign chạm vào.
- [x] Không dùng `git stash`, `git reset`, `git checkout --`, `git add -A` hoặc
  autoformat toàn repo.
- [x] Kiểm và ghi inventory đầy đủ:
  - 15 destination solo / 17 destination multiplayer;
  - mọi `data-act`, `data-man`, `data-live`;
  - DOM id được query trong `js/app.js`, `js/main.js`, `web/js/mp.js`;
  - class render từ `js/ui.js` và `web/js/mp.js`;
  - action binding riêng solo/MP.
- [x] Chạy `node --check` cho các JS liên quan, `npm test`, build ra `/tmp` và
  `npm run test:ui` nếu môi trường browser sẵn sàng; phân loại lỗi baseline với
  regression mới.
- [x] Chụp baseline vào `/tmp` ở 1440, 960, 414 và 320px cho Tổng Quan, Thiên Hà,
  Tài Nguyên và auth; không commit ảnh tạm.
- [x] Viết test trước cho set destination, hook điều hướng và input focus để bảo vệ
  migration shell.

**Gate P0**

- [x] Có inventory machine-checkable và baseline xanh hoặc có danh sách lỗi sẵn có.
- [x] Không file production nào thay đổi ở phase này.

---

### P1.0 — Reconciliation trước token

- [x] Thêm `tools/test-ui-contracts.js` vào `npm test`; khóa exact 15 solo / 17
  multiplayer, renderer/icon, `data-act`, `data-man`, 12 `data-live`, CSS vars.
- [x] Sửa brace/biến CSS dirty và progress bar; bổ sung icon `taikhoan`.
- [x] Giữ focus/value/selection khi full render cùng context; không phục hồi qua
  navigation và không phát input đệ quy cho `#f-mission`.
- [x] Đồng bộ UI suite: 17 màn, finance market, state v7 trong compatibility
  slot `thdc_save_v6`, focus text/number và geometry progress.
- [x] Chợ MP áp dụng state authoritative, giữ projection PvP, nạp dataset theo
  tab và dùng global `choId` khi huỷ.
- [x] Không expose/gọi admin speed endpoint chưa có authorization contract.
- [x] `npm test`: 33 UI contracts + 241 luật + 333 server assertions; build
  standalone/artifact ra `/tmp` thành công.
- [ ] Rerun browser-native suite/ảnh P1.0 ngoài sandbox; môi trường hiện tại chặn
  bind server và Unix socket của Chromium.

---

## Phase 1 — Tokens và nền visual 70/20/10

**Files:** `css/tokens.css`, `css/style.css`, `index.html`, `web/index.html`,
`tools/build.js`.

### 1.1 Token source

- [x] Tạo `css/tokens.css` từ các block Theme/Typography/Spacing/Motion trong
  `design.md`: deep navy, một accent amber, semantic status colors, focus double
  ring, boundary đạt 3:1, typography và sizing shell.
- [x] Thêm alias legacy trong giai đoạn chuyển tiếp, ví dụ:
  `--den → --color-paper`, `--panel → --color-paper-2`, `--cam → --color-accent`,
  `--chu → --color-ink`, `--mo → --color-muted`.
- [x] Không alias biến semantic cũ sang màu sai nghĩa. Các biến chưa tồn tại như
  `--xanh`, `--xanh2`, `--duong` phải được migrate sang token đúng, không tạo thêm
  accent trang trí.
- [x] Màu `G.RES[].mau` chỉ dùng như data encoding ở dot/swatch/chart.

### 1.2 CSS foundation

- [x] Merge/sửa dấu `}` thiếu ở media query cuối file mà không làm mất CSS dirty
  hiện có của người dùng.
- [x] Body/UI tối thiểu 16px; dense cell 14px; utility label 12px; số dùng
  tabular numerals.
- [x] Bỏ blur khỏi panel/content; blur chỉ còn ở modal/sheet/popover.
- [x] Bỏ glow/text-shadow trang trí, gradient action cyan/green và pulse vô hạn.
- [x] Giữ tối đa nền sao/tinh vân tĩnh ở canvas/auth; không animation nền.
- [x] Tạo primitives/legacy mappings:
  - `.panel` → section surface;
  - `.the` → decision row/card;
  - `.canh` → alert item;
  - `.nut` → button;
  - `.bang-cuon` → responsive data view.
- [x] Component mới dùng token semantic; không thêm raw color/font/spacing inline.

### 1.3 HTML và build

- [x] Nạp `tokens.css` trước `css/style.css` ở solo và multiplayer với đường dẫn
  đúng cho từng entry.
- [x] Giữ font Chakra Petch + Be Vietnam Pro và fallback offline.
- [x] Sửa `tools/build.js` để inline tokens trước style vào standalone/artifact.
- [x] Sinh lại hai dist outputs qua `npm run build`, không sửa output bằng tay.

**Verification P1**

- [x] `node --check tools/build.js`
- [x] `npm test`
- [x] `npm run build`
- [ ] Mở trực tiếp solo, server MP và artifact: cùng token, không 404 stylesheet.
- [x] `rg` xác nhận selector legacy cần thiết chưa bị bỏ.

Kết quả P1 ngày 2026-08-26: 52 UI contracts + 241 luật game + 333 server
assertions đều đạt; standalone và artifact đã được kiểm cấu trúc, cùng inline
token trước legacy CSS. Browser-native vẫn để mở vì sandbox thiếu Playwright và
không cho bind server (`ERR_MODULE_NOT_FOUND` / `listen EPERM` ở lượt có runtime
cục bộ); không trình bày structural check như bằng chứng layout.

---

## Phase 2 — App shell và IA năm workspace

**Files:** `js/ui.js`, `js/app.js`, `js/main.js`, `web/js/mp.js`, hai HTML,
`css/style.css`, `tools/test-mp-ui.mjs`.

### 2.1 Registry dùng chung

- [x] Định nghĩa `U.WORKSPACES` với năm id: `chi_huy`, `phat_trien`, `tac_chien`,
  `lien_minh`, `he_thong`.
- [x] Định nghĩa một registry destination có metadata:
  `{ id, workspace, order, icon, label, modes, badge, preload }`.
- [x] Tạo `U.taoMAN(mode)` filter theo capability/mode.
- [x] Solo dùng `U.MAN = U.taoMAN('solo')`; multiplayer chỉ gọi
  `U.taoMAN('mp')`, bỏ bản sao 17 mục trong `web/js/mp.js`.
- [x] Bổ sung icon thật cho `taikhoan`; không fallback icon Tổng Quan.
- [x] Test đúng set 15/17 và đúng thứ tự/workspace.

### 2.2 Navigation contract

- [x] Tạo/refactor helpers:
  - `U.metaMan(id)`;
  - `U.denMan(man, options)`;
  - `U.veWorkspace()`;
  - `U.veMenu()`;
  - `U.veMenuNhanh()`;
  - `U.veDauMan()`;
  - `U.focusNoiDung()`.
- [x] `U.denMan()` đổi `U.pi` trước destination khi CTA có scope hành tinh,
  đồng bộ workspace, chạy preload MP nếu có, render, scroll/focus khi navigation
  do người dùng chủ động.
- [x] Poll/sync background không gọi focus và không cướp input.
- [x] Chuyển nav `<a>` không `href` sang button/link semantic; active có
  `aria-current="page"`.
- [x] Desktop: rail năm workspace + secondary destination nav.
- [x] 320–639: bottom workspace nav + secondary sheet.
- [x] 640–959: icon rail, nhưng workspace đang chọn có label nhìn thấy.
- [x] Thêm affordance “Đi tới…” và `Ctrl/Cmd+K`; command palette chỉ tìm/điều
  hướng destination có sẵn, không giấu nav chính.
- [x] Gom toggle menu/resource vào action delegation, không để handler trùng giữa
  `main.js` và `mp.js`.

### 2.3 Stable shell

- [x] Hai entry HTML có cùng semantic shell contract hoặc được renderer chung tạo
  ra; MP chỉ thêm global action theo capability.
- [x] Tách shell ổn định khỏi work area để `U.ve()` không thay toàn bộ navigation,
  focus, sheet và command palette mỗi lần dữ liệu đổi.
- [x] Giữ `data-act`, `data-man`, `data-live` và các id cũ trong giai đoạn chuyển.

**Verification P2**

- [x] Solo đủ 15, MP đủ 17; registry, renderer và delegated route được contract test.
- [ ] Mouse, Tab, Enter, Space và Ctrl/Cmd+K hoạt động.
- [x] `aria-current`, `aria-expanded`, `aria-controls` đúng ở semantic/contract layer.
- [x] Poll/sync không xóa nội dung input đang gõ hoặc cướp focus theo unit contract.
- [x] Không còn sidebar phẳng 15/17 mục cùng trọng lượng.

Kết quả P2 ngày 2026-08-26: `npm test` đạt 96 UI contracts + 241 luật game +
333 server assertions; syntax checks và hai dist build đều đạt. Kiểm thử mouse/
keyboard/viewport thực trên browser chưa thể chạy vì môi trường thiếu Playwright
(`ERR_MODULE_NOT_FOUND`), nên mục đó và ảnh review vẫn để mở.

---

## Phase 3 — Alert model, Situation Strip và Command Workbench

**Files:** chủ yếu `js/ui.js`, `js/app.js`, `css/style.css`; test UI.

### 3.1 Presentation model

- [x] Tạo `U.tinhViecCanXuLy(st)` trả alert view model từ state hiện có:
  `id/source/priority/severity/scope/pi/title/consequence/etaAt/action/dedupeKey`.
- [x] Escape text ở renderer; không nhét raw HTML từ state vào model.
- [x] Sort P0 inbound attack theo ETA → P1 maintenance/food/power/research retry
  → P2 capacity/queue → P3 info.
- [x] Dedupe cùng sự kiện; group theo priority/scope ở Tổng Quan.
- [x] `data-live` cập nhật countdown; không đưa raw time/resource vào signature
  gây full rerender mỗi giây.
- [x] Tạo `U.tomTatHanhTinh(st, p, pi)` và `U.sigTrangThaiUI(st)` chỉ chứa threshold/
  enum/boolean cần đổi cấu trúc.

### 3.2 Signature situation strip

- [x] Render scope, một cảnh báo ưu tiên + tổng việc còn lại, running summary và
  resource summary trên desktop.
- [x] Mobile chỉ render hành tinh, cảnh báo cao nhất và resource trigger.
- [x] CTA strip chỉ điều hướng, không có destructive action.
- [x] Danger assertive chỉ cho tấn công sắp tới; phần còn lại polite/không announce
  lặp sau rerender.

### 3.3 Tổng Quan task-first

- [x] Refactor `U.m_tongquan()` thành:
  - Attention Queue;
  - Empire Snapshot nhỏ gọn;
  - Planet Matrix full-width, chỉ đọc;
  - Operations Queue;
  - Fleet Watch / Recent Intel.
- [x] Tạo `data-act="den-viec"` với `data-pi` + `data-man`; route helper đổi đúng
  hành tinh rồi mở đúng màn.
- [x] Planet Matrix dùng dữ liệu client hiện có: điện, kho, dân/ủng hộ, xây, tàu,
  nghiên cứu, mức cảnh báo. Trạng thái thiếu dữ liệu phải nói “Chưa có dữ liệu”.
- [x] Không có checkbox chọn nhiều hành tinh hoặc bulk CTA.
- [x] Strip chỉ hiện việc cao nhất; dashboard hiện danh sách đầy đủ, không lặp
  nguyên một alert hai lần trong cùng viewport.

**Verification P3**

- [ ] Việc khẩn nằm trong viewport đầu ở 1440, 960, 414 và 320px.
- [x] Alert → màn xử lý: một click; alert hành tinh khác đổi đúng `U.pi`.
- [x] Chuyển tới một hành tinh + destination bất kỳ tối đa hai thao tác.
- [ ] Nhiều alert không đẩy work area khỏi fold.
- [x] Không full rerender mỗi giây và không mất input/focus.

Kết quả P3 ngày 2026-08-26: 151 UI contracts, 241 luật game và 333 server
assertions đạt trong `npm test`; syntax, `git diff --check` và hai dist build đều
đạt. Contract đã khóa exact alert schema, ETA/dedupe, XSS escape,
assertive/polite one-shot, threshold theo từng resource, live tick có cache,
partial/null state không crash, cross-planet route, focus/disclosure qua full
render, viewport guard cho sheet và responsive priority view tới 959px.
`js/actions.js`, `js/engine.js`, `js/fleet.js` và action
payload không đổi; hai hash server giữ nguyên. Playwright 1.60.0 và Chromium có
trên máy, nhưng MCP trỏ tới revision 1229 không tồn tại; browser local và server
localhost đều bị sandbox chặn syscall/socket với `EPERM`. Runner
`npm run test:visual` đã được thêm cho exact 4 viewport × 3 màn, nhưng vì chưa
có ảnh browser mới nên hai mục viewport/fold ở trên và toàn bộ Gate B vẫn để mở.

### Gate B — Prototype review

- [ ] Tổng Quan: hierarchy task-first + matrix chỉ đọc.
- [ ] Thiên Hà: dense operations + context panel.
- [ ] Tài Nguyên: data page + responsive priority view.
- [ ] Mỗi prototype có ảnh 1440, 960, 414 và 320px; chỉ nhân rộng sau khi duyệt.

---

## Phase 4 — Migrate theo page family

Không thay business logic; chỉ chuyển cấu trúc trình bày, semantics và responsive.

### Shared component contract

- [ ] Hoàn thiện Button, Field, Select, Tabs, StatusBadge, ResourceValue, Progress,
  QueueItem, Alert, ResponsiveDataView, EmptyState, Skeleton, InlineError, Dialog,
  Toast và Disclosure.
- [ ] Mỗi control có default, hover, focus, active, disabled, loading, error, success.
- [ ] Page header có đúng một `h1`, scope rõ và tối đa một primary action.
- [ ] Tối đa một containment layer; bỏ card-in-card.

### Batch A — Phát triển

**Functions:** `U.m_tainguyen`, `U.m_congtrinh`, `U.m_nghiencuu`, `U.m_xuong`,
`U.m_phongthu`, `U.m_taichinh`.

- [ ] Queue/điểm nghẽn đứng trước catalog.
- [ ] Cost, requirement, status và action thẳng cột.
- [ ] Trạng thái thiếu điện/tài nguyên/kho đầy có chữ + icon, không chỉ màu.
- [ ] Inline style mới được thay bằng token/class.

### Batch B — Tác chiến và dữ liệu dày

**Functions:** `U.m_thienha`, `U.m_hamdoi`, `U.m_mophong`, `U.m_tinnhan`,
`U.m_xephang`.

- [ ] Table/list ưu tiên khả năng quét; selection mở context panel/drawer.
- [ ] Target/mission/ETA/fuel/slot có hierarchy thống nhất.
- [ ] Trạng thái quyền tấn công và luật bảo vệ nói rõ lý do + bước tiếp theo.

### Batch C — Liên minh và hệ thống

**Functions:** `U.m_lienminh`, `U.m_huongdan`, `U.m_nhatky` và trong MP:
`U.m_bangtin`, `U.m_chat`, `U.m_taikhoan`.

- [ ] Help theo Long Document 60–65ch, heading đúng thứ tự.
- [ ] Communication dùng master/detail hoặc thread dễ quét unread/timestamp.
- [ ] Dangerous action tách riêng và có label đầy đủ.

### Responsive cho mọi batch

- [ ] Mobile table chuyển priority row/card/disclosure có label; horizontal scroll
  chỉ là ngoại lệ có chủ đích.
- [ ] Action label một dòng, hit target ≥44×44px.
- [ ] Context panel là drawer/below dưới 1280px.
- [ ] Không duplicate DOM id; mọi action/live hook cũ vẫn chạy.

**Gate P4**

- [ ] Đủ toàn bộ 15/17 màn; mỗi màn đúng một `h1`.
- [ ] Không mất action, id hoặc live update.
- [ ] Empty/loading/error state có nội dung và bước tiếp theo.

---

## Phase 5 — Hành lang tác chiến

**Files/functions:** `js/ui.js` (`U.veDoTham`, `U.m_tinnhan`, `U.mpMoi`,
`U.mpNapDoTham`, `U.m_mophong`, action Thiên Hà/Hạm Đội); `js/app.js` cho action
điều hướng/preload; `web/js/mp.js` chỉ khi cần preload capability.

- [ ] Báo cáo do thám có CTA “Mô phỏng trận”, nạp đúng report/context hiện có.
- [ ] Simulator lưu `target`/`spyKey` ở presentation state, không state schema game.
- [ ] Kết quả mô phỏng có CTA “Chuẩn bị xuất kích”.
- [ ] CTA chỉ preload mục tiêu, mission và đội hình bên ta vào form Hạm Đội.
- [ ] Người chơi vẫn xem preview, validation, fuel/time/slot/capacity và tự bấm
  “Xuất kích”; không auto-send, không bypass permission.
- [ ] Theo dõi/gọi về/đổi mục tiêu vẫn dùng contract hiện hữu.
- [ ] Kết quả quay về Tin Nhắn; shortcut thu hồi phế liệu trở lại Thiên Hà.

**Verification P5**

- [ ] Thiên Hà → do thám → Tin Nhắn → Máy Tính Trận → Hạm Đội hoàn tất không ngõ cụt.
- [ ] Báo cáo → simulator: một action.
- [ ] Simulator → fleet form đã điền: một action.
- [ ] Solo, NPC và MP permission states giữ nguyên kết quả luật.
- [ ] Không request API mới và không tự gửi lệnh.

---

## Phase 6 — Auth, responsive, accessibility và polish

### Auth

- [ ] Solo và multiplayer dùng Split Studio 5/7; giữ toàn bộ input/action id.
- [ ] Atmosphere chỉ ở canvas/abstract geometry tĩnh; form rõ, không fake device.

### Responsive

- [ ] Kiểm 320, 375, 414, 768, 960, 1280 và 1440px.
- [ ] `html, body` không horizontal scroll toàn trang.
- [ ] 960–1279 là single work area; context drawer/below.
- [ ] ≥1280 mới dùng layout 8/4; ≥1440 dùng 9/3 và max-width 1600px.
- [ ] Mobile hoàn tất được alert action và tác vụ ngắn, không chỉ xem.

### Accessibility/state

- [ ] Nâng modal/dialog: role/semantic `<dialog>`, focus trap, Escape, backdrop,
  restore focus.
- [ ] Field có label/description/error mapping; invalid state announce đúng.
- [ ] Toast `aria-live="polite"`; danger nghiêm trọng mới assertive.
- [ ] Focus double ring cam + gap nhìn được trên canvas và button accent.
- [ ] Keyboard-only hoàn thành navigation, alert action, form và dialog.
- [ ] `prefers-reduced-motion`: bỏ spatial motion, opacity ≤150ms.
- [ ] Font network bị chặn vẫn dùng fallback và không đổi layout nghiêm trọng.

### Cinematic polish cuối cùng

- [ ] Accent cam ≤3% viewport ở app.
- [ ] Không glass panel/glow/text-gradient/pulse vô hạn.
- [ ] Cinematic emphasis chỉ ở auth, wordmark, planet heading và alert chiến sự.

---

## Phase 7 — Test, review và bàn giao

### 7.1 Automated UI coverage

Mở rộng `tools/test-mp-ui.mjs`:

- [ ] Kiểm exact destination sets thay vì count cũ hard-code.
- [ ] Kiểm năm workspace, secondary nav, `aria-current` và command palette.
- [ ] Inject maintenance debt, food/power deficit, research retry, inbound attack;
  kiểm priority, dedupe, scope và CTA.
- [ ] Kiểm Planet Matrix và cross-planet route.
- [ ] Kiểm do thám → simulator → fleet form.
- [ ] Kiểm input/focus không mất sau sync/poll.
- [ ] Kiểm dialog trap/restore focus và live region.
- [ ] Loop 320/375/414/768/960/1280/1440, assert:
  - `scrollWidth <= clientWidth`;
  - action label quan trọng không xuống hai dòng;
  - menu/sheet/dialog nằm trong viewport;
  - context panel đúng mode.
- [ ] Emulate reduced motion và chặn font network.
- [ ] Audit `pageerror`/console error.

### 7.2 Lệnh gate

```bash
node --check js/ui.js
node --check js/app.js
node --check js/main.js
node --check web/js/mp.js
node --check tools/build.js
npm test
npm run build
npm run test:ui
git diff --check
```

### 7.3 Manual/visual matrix

- [ ] Solo + multiplayer.
- [ ] New game, đa hành tinh, kho đầy, thiếu điện, thiếu thực phẩm, nợ bảo trì,
  research retry, inbound PvP và mất mạng.
- [ ] Năm workspace ở 1440/960/414/320.
- [ ] Auth solo/MP.
- [ ] So baseline theo hierarchy, số thao tác xử lý việc, khả năng đọc bảng và
  độ ổn định focus.
- [ ] Reviewer độc lập kiểm UI regression, accessibility và accidental game logic change.

### Gate C — Functional review

- [ ] Đủ 15/17 màn; không đổi luật/API/schema.
- [ ] Không bulk action; combat corridor không ngõ cụt.
- [ ] Hook, action, input và live update không regression.

### Gate D — Release-ready

- [ ] Toàn bộ automated gate xanh.
- [ ] Responsive/accessibility matrix đạt.
- [ ] Visual review được duyệt trước khi merge/release.
- [ ] Diff cuối không chạm `server/*` do redesign và không ghi đè thay đổi dirty
  ban đầu của người dùng.

## 4. Rủi ro trọng yếu

| Rủi ro | Biện pháp |
|---|---|
| `U.ve()` xóa form/focus | Shell ổn định; signature chỉ threshold; số dùng `U.live`; focus chỉ sau nav chủ động |
| Solo/MP lệch menu | Một registry + `U.taoMAN(mode)`; MP filter/extend capability |
| Alert quá nhiều | Strip chỉ top alert + count; dashboard group toàn bộ |
| Cross-planet route sai scope | `U.denMan()` đổi `U.pi` trước destination; test từng CTA |
| Workflow vô tình bypass luật | Chỉ preload form; commit cuối vẫn qua validation hiện hữu |
| Mobile table vỡ | Priority view/card/disclosure; overflow assertions ở bảy width |
| `tokens.css` không vào artifact | Build inline tokens trước style; test direct-open/artifact |
| Ghi đè dirty worktree | Baseline diff/hash; patch nhỏ; không reset; đối chiếu file ngoài scope |
| Hai người sửa chung renderer | Một writer cho `ui.js`/`style.css`, reviewer chỉ đọc/test |

## 5. Handoff sau khi anh duyệt

Lệnh bắt đầu không phải “rewrite toàn bộ”. Bắt đầu bằng Phase 0, rồi dừng ở mỗi
Gate. Gate B là điểm quyết định có nhân rộng design qua 15/17 màn hay điều chỉnh
ba prototype trước.
