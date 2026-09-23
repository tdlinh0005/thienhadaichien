# Thiết kế UX/IA: Trung tâm Chỉ huy Hybrid

Ngày: 2026-08-25 · Cập nhật: 2026-08-26 · Trạng thái: Gate A đã duyệt; Phase 1–2 đã implement ở mức code

Nguồn chuẩn thị giác: [`design.md`](../../../design.md) · Mindmap review:
[`../mindmaps/2026-08-25-trung-tam-chi-huy-review.html`](../mindmaps/2026-08-25-trung-tam-chi-huy-review.html) ·
Implementation plan: [`../plans/2026-08-25-trung-tam-chi-huy-hybrid.md`](../plans/2026-08-25-trung-tam-chi-huy-hybrid.md)

## 1. Quyết định đã chốt

Giao diện mới dùng bản phối:

- **70% Command Center:** gom 15 màn solo và 17 màn multiplayer vào năm không
  gian làm việc, làm rõ scope hành tinh/toàn đế quốc và ưu tiên việc cần xử lý.
- **20% Operations Console:** tăng mật độ thông tin có chủ đích, bảng dễ quét,
  số liệu thẳng hàng và trạng thái rõ thay vì card lồng card.
- **10% Cinematic Atmosphere:** giữ chất vũ trụ ở nền, tiêu đề và tín hiệu chiến
  sự; không dùng glass/glow trên toàn bộ ứng dụng.

Đây là một lần tái cấu trúc lớp trình bày và luồng điều hướng. Luật game, schema
state, API và server-authoritative contract không thuộc phạm vi.

## 2. Bối cảnh và bằng chứng từ code hiện tại

- Solo khai báo 15 destination trong `js/ui.js`; multiplayer thay toàn bộ danh
  sách thành 17 destination trong `web/js/mp.js`.
- Menu hiện là một danh sách phẳng. Người chơi phải nhớ màn nào chứa hành động
  mình cần thay vì chọn theo mục đích quản lý.
- `U.veCanh()` tạo cảnh báo giàu nội dung nhưng chưa có cấu trúc action thống nhất.
- `U.ve()` render lại toàn màn qua `innerHTML`; các hook `data-act`, `data-live`,
  `data-man` và nhiều DOM id là contract đang vận hành, cần được bảo toàn trong
  lúc chuyển đổi.
- Cùng một layout phục vụ dữ liệu cấp hành tinh, cấp toàn đế quốc và multiplayer
  nhưng chưa luôn nói rõ scope.
- Mobile đang mang quá nhiều navigation và tài nguyên lên phần đầu trang, làm
  chậm tác vụ “vào xem nhanh rồi xử lý một việc”.

## 3. Người dùng và job-to-be-done

Người chơi chính là người quản lý một hoặc nhiều hành tinh, thường vào game theo
phiên ngắn 2–5 phút. Trong một phiên, họ cần:

1. Biết ngay hành tinh/scope đang xem.
2. Phát hiện việc khẩn trước khi đọc số liệu thường kỳ.
3. Kiểm tra tài nguyên, hàng đợi, hạm đội và bảo trì.
4. Đi tới đúng màn xử lý trong một hoặc hai thao tác.
5. Xác nhận hành động đã có hiệu lực rồi thoát hoặc chuyển hành tinh.

Người chơi multiplayer có thêm nhu cầu theo dõi chiến tranh, liên minh, tin vũ
trụ, chat và tài khoản, nhưng không cần một shell khác với solo.

## 4. Mục tiêu

- Người chơi nhận ra việc cần làm trong vòng 5 giây sau khi vào game.
- Mọi destination hiện có nằm đúng một nơi trong IA; không mất màn, không tạo
  màn trùng.
- Từ cảnh báo ưu tiên tới màn xử lý tối đa hai thao tác.
- Luồng chiến đấu chủ động không có ngõ cụt giữa Thiên Hà, Tin Nhắn, Máy Tính
  Trận và Hạm Đội.
- Cùng một metadata điều hướng phục vụ solo và multiplayer bằng capability.
- Desktop tối ưu quản trị; mobile tối ưu kiểm tra nhanh và xử lý việc khẩn.
- UI có semantic HTML, keyboard focus, trạng thái loading/error/empty và không
  dựa vào màu đơn độc.

## 5. Không thuộc phạm vi

- Không đổi cân bằng, công thức, quyền tấn công, thời gian, hàng đợi hay luật
  multiplayer.
- Không tạo batch build, batch research, batch fleet hoặc bất kỳ bulk action mới.
- Không thêm API hoặc dữ liệu tổng hợp server-side cho dashboard.
- Không thay router/framework; ứng dụng vẫn là vanilla HTML/CSS/JS.
- Không light theme, 3D, canvas game map hoặc animation trang trí liên tục.
- Không xóa contract cũ trước khi test đã bảo vệ các action/live update tương ứng.

## 6. Kiến trúc thông tin mục tiêu

| Workspace | Destination dùng chung | Chỉ solo | Chỉ multiplayer |
|---|---|---|---|
| **Chỉ huy** | Tổng Quan `tongquan` | — | — |
| **Phát triển** | Tài Nguyên `tainguyen`; Công Trình `congtrinh`; Nghiên Cứu `nghiencuu`; Xưởng Đóng Tàu `xuong`; Phòng Thủ `phongthu`; Ngân Hàng & Thị Trường `taichinh` | — | — |
| **Tác chiến** | Thiên Hà `thienha`; Hạm Đội `hamdoi`; Máy Tính Trận `mophong`; Tin Nhắn `tinnhan` | — | — |
| **Liên minh** | Liên Minh `lienminh`; Bảng Xếp Hạng `xephang` | — | Bảng Tin Vũ Trụ `bangtin`; Phòng Chat `chat` |
| **Hệ thống** | Hướng Dẫn `huongdan` | Nhật Ký & Lưu `nhatky` | Tài Khoản `taikhoan` |

Kiểm độ phủ:

- 14 destination dùng chung + 1 màn chỉ solo = **15 màn solo**.
- 14 destination dùng chung + 3 màn chỉ multiplayer = **17 màn multiplayer**.
- “Cần xử lý”, “Đang diễn ra”, “Tin mới nhất” và “Ma trận nhiều hành tinh” là
  module của Tổng Quan, không phải destination.
- Shortcut tới Phòng Thủ hoặc Tin Nhắn chỉ là đường đi ngữ cảnh; destination
  vẫn thuộc đúng một workspace.

### 6.1 Điều hướng theo capability

Mỗi destination có cùng metadata tối thiểu:

```text
id · label · icon · workspace · order · scope · capabilities · badgeSource
```

- `capabilities: [solo, multiplayer]` cho 14 màn dùng chung.
- `capabilities: [solo]` cho `nhatky`.
- `capabilities: [multiplayer]` cho `bangtin`, `chat`, `taikhoan`.
- Multiplayer mở rộng capability/data provider; không gán lại toàn bộ `U.MAN`.

## 7. App shell

Thứ tự phân cấp component trên desktop:

```text
AppShell
├── WorkspaceRail
├── SecondaryNavigation
├── MainFrame
│   ├── SituationStrip
│   ├── PageHeader
│   └── WorkspaceLayout
│       ├── WorkArea
│       └── ContextPanel (khi cần)
├── DialogLayer
├── ToastRegion
└── AppFooter
```

Quy tắc:

- Workspace rail trả lời “tôi đang làm loại việc gì?”.
- Secondary navigation trả lời “tôi đang ở màn nào trong nhóm đó?”.
- Situation strip luôn trả lời “scope nào, việc gì khẩn, tài nguyên/hàng đợi ra sao?”.
- Page header có đúng một `h1`, scope, mô tả ngắn và tối đa một primary action.
- Work area chỉ có một lớp containment chính; không card trong card theo quán tính.
- Context panel chỉ xuất hiện khi một selection/filter/action phụ thực sự cần nó.

### 7.1 Dải tình hình chiến dịch

Đây là signature component của redesign, dùng dữ liệu hiện có:

```text
[Hành tinh + tọa độ] [Cảnh báo ưu tiên] [Hàng đợi/hạm đội] [Tài nguyên tóm tắt]
```

- Desktop: một dải ngang, mỗi vùng có label và giá trị, không biến thành bốn card.
- Mobile: chỉ giữ hành tinh hiện tại, một cảnh báo ưu tiên và nút mở resource panel.
- Dữ liệu toàn đế quốc phải ghi rõ “Toàn đế quốc”; dữ liệu hành tinh luôn kèm
  tên và tọa độ.

### 7.2 Alert contract

Cảnh báo được chuẩn hóa thành view model, không thay đổi schema game:

```text
id
severity: info | warning | danger
scope: empire | planet
planetId? / coordinates?
title
consequence
countdown?
primaryAction: { label, screenId, context? }
secondaryAction?
dedupeKey
```

Markup hiển thị phải có: **chuyện gì xảy ra → hậu quả → hành động sửa**. Màu luôn
đi kèm icon và chữ severity. Danger liên quan an toàn có thể dùng live region
assertive; các cảnh báo còn lại dùng polite hoặc không announce lại khi rerender.

Ví dụ ánh xạ:

| Cảnh báo | Primary action |
|---|---|
| Hạm đội địch đang tới | “Xem hạm đội” → `hamdoi` |
| Nợ bảo trì | “Mở tài chính” → `taichinh` |
| Thiếu thực phẩm/điện | “Xem tài nguyên” → `tainguyen` |
| Nghiên cứu lỡ kỳ | “Xem nghiên cứu” → `nghiencuu` |
| Kho đầy | “Mở công trình” hoặc “Mở thị trường”, tùy nguyên nhân có sẵn |

## 8. Tổng Quan task-first

Tổng Quan không phải một bộ sưu tập KPI. Thứ tự nội dung:

1. **Cần xử lý:** tối đa các việc có hậu quả gần nhất, action đi thẳng tới màn xử lý.
2. **Đang diễn ra:** xây dựng, nghiên cứu, đóng tàu, hạm đội và hàng đang về.
3. **Tình hình đế quốc:** các số liệu cốt lõi có cùng nhịp đọc.
4. **Ma trận hành tinh:** chỉ đọc ở v1; so sánh tài nguyên, điện, dân số, hàng đợi
   và mức cảnh báo bằng dữ liệu client hiện có.
5. **Tin mới nhất:** chiến báo, do thám hoặc sự kiện cần đọc.

Không có batch action trong ma trận đa hành tinh. Người chơi chọn một hành tinh
rồi đi tới destination tương ứng để hành động theo contract hiện tại.

## 9. Luồng người dùng chính

### 9.1 Phiên 2–5 phút

```text
Vào game
→ Tổng Quan + scope hiện tại
→ quét cảnh báo / tài nguyên / hàng đợi
→ chọn việc ưu tiên
→ destination xử lý
→ thực hiện action hiện có
→ thấy trạng thái đã cập nhật
→ chuyển hành tinh hoặc thoát
```

### 9.2 Tấn công chủ động

```text
Thiên Hà: chọn mục tiêu
→ kiểm quyền/luật bảo vệ
→ Hạm Đội: gửi do thám
→ Tin Nhắn: đọc báo cáo
→ Máy Tính Trận: nạp báo cáo + hạm đội ta
→ điều chỉnh đội hình hoặc chấp nhận rủi ro
→ Hạm Đội: xuất kích
→ theo dõi / gọi về / đổi mục tiêu theo luật hiện có
→ Tin Nhắn: đọc chiến báo
→ Thiên Hà: thu hồi phế liệu nếu cần
```

Mỗi bước phải giữ context mục tiêu bằng state/parameter hiện có khi có thể. Nếu
không thể truyền tự động, UI phải nói rõ bước kế tiếp và không giả vờ đã nạp dữ liệu.

### 9.3 Phòng thủ khi có hạm đội địch

```text
Situation strip: báo động + countdown
→ Hạm Đội: xem mục tiêu/thời gian đến
→ chọn giữ lực lượng, cho bay đi, tăng phòng thủ hoặc nhờ đồng minh
→ sau va chạm: Tin Nhắn
→ sửa tổn thất / thu hồi phế liệu
```

## 10. Họ màn và component

| Họ màn | Màn đại diện | Mẫu bố cục |
|---|---|---|
| Command dashboard | `tongquan` | task queue + live operations + read-only matrix |
| Resource/status | `tainguyen` | summary strip + comparison rows + contextual action |
| Catalog/queue | `congtrinh`, `nghiencuu`, `xuong`, `phongthu` | queue trước, catalog sau; cost/requirement/action thẳng hàng |
| Dense operations | `thienha`, `hamdoi`, `xephang`, `bangtin` | table/list ưu tiên; selection mở context panel |
| Guided workflow | `mophong`, fleet dispatch | step context rõ, validation cạnh input, summary trước commit |
| Communication | `tinnhan`, `chat`, `lienminh` | master/detail hoặc thread; unread và timestamp dễ quét |
| Long document | `huongdan` | một cột 60–65ch, heading hierarchy, mục lục gọn |
| Settings/record | `taichinh`, `nhatky`, `taikhoan` | section rõ, dangerous action tách riêng |

Shared component contract gồm: button, field, select, data row/table, status badge,
countdown, progress, queue item, alert, empty state, skeleton/loading, inline error,
dialog, toast và disclosure. Component phải đủ default/hover/focus/active/disabled/
loading/error/success trước khi nhân rộng qua các màn.

## 11. Responsive

- **320–639:** bottom navigation năm workspace; secondary navigation mở sheet;
  situation strip thu gọn; resource panel theo yêu cầu; context nằm dưới nội dung.
- **640–959:** rail icon; secondary navigation disclosure; bảng dùng priority view
  hoặc chuyển row thành card có nhãn.
- **960–1279:** rail + secondary navigation; context dùng drawer hoặc nằm dưới.
- **1280–1439:** content/context 8/4 khi cần.
- **≥1440:** content/context 9/3, có max-width theo loại nội dung.

Kiểm tại 320, 375, 414, 768, 960, 1280 và 1440px. Không có horizontal scroll
toàn trang; bảng chỉ được scroll trong container khi priority/card view không phù hợp.

## 12. Accessibility và copy

- `aria-current` cho navigation; `aria-expanded`/`aria-controls` cho sheet/drawer.
- Focus ring cam 2px + gap nền 2px, nhìn được trên nền tối lẫn nền accent.
- Hit target mobile tối thiểu 44×44px.
- Label gắn với field; error có `aria-describedby` và `aria-invalid`.
- Dialog trap/restore focus, Escape đóng; toast dùng live region đúng mức.
- `prefers-reduced-motion` bỏ spatial motion; không có pulse vô hạn.
- Nút gọi đúng hành động: “Mô phỏng trận”, “Xuất kích”, “Mở tài chính”; tránh
  “OK”, “Submit” hoặc icon-only cho action quan trọng.

## 13. Tiêu chí nghiệm thu

### IA và chức năng

- [ ] Solo render đúng 15 destination; multiplayer đúng 17.
- [ ] Mỗi destination nằm đúng một workspace và điều hướng được.
- [ ] Không thay luật game, API, state schema hoặc kết quả action.
- [ ] Các hook `data-act`, `data-live`, `data-man` và id đang dùng còn hoạt động
  hoặc được migrate cùng test tương ứng.
- [ ] Cảnh báo ưu tiên có action đúng destination và giữ đúng scope.
- [ ] Ma trận đa hành tinh v1 chỉ đọc, không có bulk action.
- [ ] Luồng chiến đấu đi hết chuỗi mà không mất context quan trọng hoặc ngõ cụt.

### Thị giác và khả dụng

- [ ] Một custom theme deep navy + amber, semantic colors chỉ cho status.
- [ ] Không blanket glass, không card lồng card quá một lớp, không glow trang trí.
- [ ] Dải tình hình chiến dịch xuất hiện nhất quán ở mọi app screen.
- [ ] Page header có đúng một `h1`, scope rõ và tối đa một primary action.
- [ ] Bảng/số liệu quét được, tabular numerals, body text tối thiểu 16px.
- [ ] Keyboard hoàn tất navigation, dialog và action chính; focus luôn nhìn thấy.
- [ ] Không scroll ngang toàn trang ở bảy viewport bắt buộc.
- [ ] Reduced motion và offline font fallback hoạt động.

### Kỹ thuật

- [ ] `npm test`, `npm run build` và MP UI test xanh.
- [ ] Có visual regression/screenshot review cho ba prototype: Tổng Quan, Thiên Hà,
  Tài Nguyên trước khi nhân rộng.
- [ ] Có screenshot review cuối cho năm workspace ở solo và destination riêng MP.

## 14. Rủi ro và giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Full `innerHTML` rerender làm mất focus hoặc announce lặp | Chia shell ổn định khỏi work area; test focus/aria-live; migrate theo phase |
| MP override menu gây drift | Một registry + capability, không còn hai bản sao toàn mảng |
| CSS mới phá selector/hook cũ | Lập inventory, legacy alias tạm thời, test trước khi xóa |
| Dashboard muốn dữ liệu chưa có | Chỉ dùng selector/client state hiện có; ghi empty/unknown trung thực |
| Đa hành tinh dẫn tới bulk action ngoài scope | V1 chỉ đọc; action luôn drill-down về một hành tinh |
| 960px quá chật cho ba cột | Context panel thành drawer/below tới 1279px |
| Dirty worktree chồng thay đổi UI đang có | Baseline diff, không reset; reconcile có chủ đích ở Phase 0 |

## 15. Decision gates

1. **Gate A — tài liệu hiện tại:** duyệt IA năm workspace, dải tình hình, v1 đa
   hành tinh chỉ đọc và thứ tự luồng chiến đấu.
2. **Gate B — ba prototype:** duyệt Tổng Quan, Thiên Hà và Tài Nguyên ở desktop +
   mobile trước khi mở rộng.
3. **Gate C — chức năng:** đủ 15/17 màn, không đổi luật, không bulk action, luồng
   chiến đấu không ngõ cụt.
4. **Gate D — release:** test, accessibility, responsive và screenshot review đạt.

Chỉ bắt đầu implementation sau Gate A.
