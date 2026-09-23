<!-- Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 -->

# Design — Thiên Hà Đại Chiến · Trung tâm Chỉ huy

Design system đã được chốt để redesign toàn bộ giao diện solo và multiplayer.
Mọi thay đổi UI về sau phải đọc file này trước. Khi cần mở rộng hệ thống, sửa
file này trước rồi mới tạo ngoại lệ ở từng màn.

## Product context

- **Người dùng chính:** người đã hiểu vòng lặp game chiến thuật, thường vào
  2–5 phút để kiểm tra tình hình, xử lý việc khẩn và lên lịch phát triển.
- **Người dùng phụ:** người mới; được hỗ trợ bằng phân tầng thông tin, trạng thái
  rỗng có chỉ dẫn và đường dẫn hành động, không bằng cách làm toàn bộ app thưa đi.
- **Công việc chính:** nhìn thấy tình hình → nhận ra việc cần xử lý → thực hiện
  hành động → xác nhận trạng thái mới.
- **Thiết bị:** desktop là trải nghiệm chính; mobile dùng để kiểm tra nhanh,
  xử lý cảnh báo và thao tác ngắn.
- **Giọng điệu:** technical · commanding · cinematic restrained.

## Design thesis

**Thấy tình hình trước. Chọn hành động sau.**

Tỷ lệ định hướng đã duyệt:

- 70% **Trung tâm Chỉ huy:** kiến trúc thông tin và luồng quản lý.
- 20% **Console Vận hành:** mật độ hợp lý, bảng biểu và thao tác nhanh.
- 10% **Buồng lái Điện ảnh:** nền, wordmark, trạng thái chiến sự và chuyển cảnh.

Phong cách điện ảnh là lớp không khí, không phải lớp phủ lên mọi panel. Nội dung
ứng dụng không dùng glassmorphism. Blur chỉ dành cho modal, sheet và popover nằm
trên nội dung khác.

Các nguyên tắc UX bắt buộc:

- **Exception first:** việc nguy hiểm hoặc đang tắc đứng trước số liệu bình thường.
- **Scope certainty:** mọi dữ liệu/action nói rõ “Toàn đế quốc” hoặc hành tinh +
  tọa độ; action khác hành tinh đổi scope trước khi đổi màn.
- **Evidence beside action:** cảnh báo đặt hậu quả cạnh đúng một hành động xử lý.
- **Scan before read:** bảng/list để so sánh, card chỉ dành cho một quyết định.
- **Progressive disclosure:** năm workspace luôn thấy; detail mở khi cần.
- **Mobile outcome parity:** mobile xử lý được việc khẩn, không chỉ xem trạng thái.

## Genre

**Atmospheric**, với lớp ứng dụng mang tính utilitarian/technical.

- Canvas tối, tĩnh; tối đa hai vùng sáng nền rất mờ ở màn đăng nhập.
- Một accent thương hiệu: cam–hổ phách.
- Cyan, xanh, vàng và đỏ chỉ là màu trạng thái có ngữ nghĩa; không được dùng làm
  accent trang trí.
- Không gradient chữ, không glow chữ, không nền sao chuyển động liên tục.

## Signature

**Dải tình hình chiến dịch** là chi tiết nhận diện của sản phẩm. Nó luôn trả lời
bốn câu hỏi bằng dữ liệu thật:

1. Đang xem toàn đế quốc hay một hành tinh cụ thể?
2. Việc khẩn nhất là gì?
3. Hàng đợi và hạm đội nào đang chạy?
4. Hành động tiếp theo nằm ở đâu?

Trên mobile, dải này thu gọn thành hành tinh hiện tại, một cảnh báo ưu tiên và
nút mở bảng tài nguyên; không nhồi toàn bộ chip vào sticky header.

## Macrostructure family

- **Entry/auth:** Split Studio, tỷ lệ 5/7. Một nửa mang chất thế giới game;
  một nửa là form đăng nhập/đăng ký rõ ràng. Không dùng fake browser/device frame.
- **App:** **Command Workbench**, biến thể ứng dụng của Workbench. Khung cố định
  gồm workspace rail → secondary navigation → situation strip → page header →
  work area → contextual detail. Nội dung thật của game là trọng tâm.
- **Help/content:** Long Document, một cột 60–65ch, không animation reveal.

Navigation desktop là biến thể N3 Side Rail với năm workspace có nhãn. Chuyển
nhanh dùng biến thể N13: affordance nhìn thấy được, hỗ trợ `Ctrl/Cmd + K`, nhưng
không giấu navigation chính sau phím tắt. Footer là Ft2 một dòng.

## Information architecture

### 1. Chỉ huy

- Destination: **Tổng Quan** (`tongquan`).
- Module trong Tổng Quan: Cần xử lý.
- Module trong Tổng Quan: Đang diễn ra — xây dựng, nghiên cứu, đóng tàu,
  hạm đội và hàng đang về.
- Module trong Tổng Quan: Tin mới nhất.
- Module trong Tổng Quan: Ma trận nhiều hành tinh chỉ đọc.

### 2. Phát triển

- **Tài Nguyên** (`tainguyen`)
- **Công Trình** (`congtrinh`)
- **Nghiên Cứu** (`nghiencuu`)
- **Xưởng Đóng Tàu** (`xuong`)
- **Phòng Thủ** (`phongthu`)
- **Ngân Hàng & Thị Trường** (`taichinh`)

### 3. Tác chiến

- **Thiên Hà** (`thienha`)
- **Hạm Đội** (`hamdoi`)
- **Máy Tính Trận** (`mophong`)
- **Tin Nhắn & chiến báo** (`tinnhan`)

Luồng tác chiến giữ các màn và logic hiện có nhưng nối chúng bằng hành lang ngữ
cảnh: **chọn mục tiêu → do thám → đọc báo cáo → mô phỏng → xuất kích → theo dõi**.

### 4. Liên minh

- **Liên Minh / Bộ Chỉ Huy** (`lienminh`)
- **Bảng Xếp Hạng** (`xephang`)
- **Bảng Tin Vũ Trụ** (`bangtin`, multiplayer)
- **Phòng Chat** (`chat`, multiplayer)

### 5. Hệ thống

- **Hướng Dẫn** (`huongdan`)
- **Nhật Ký & Lưu** (`nhatky`, solo)
- **Tài Khoản** (`taikhoan`, multiplayer)

Solo và multiplayer dùng chung metadata IA. Multiplayer chỉ thêm/bớt destination
bằng capability; không thay toàn bộ mảng menu bằng một bản sao riêng.

Độ phủ bắt buộc: solo có đúng 15 destination; multiplayer có đúng 17. Module
trong Tổng Quan không được tính thành destination mới và shortcut ngữ cảnh không
được nhân đôi một màn ở hai workspace.

## Shell contract

Mọi màn app dùng cùng thứ tự và scope:

1. **Workspace rail:** năm nhóm chính, badge chỉ xuất hiện khi có dữ liệu cần chú ý.
2. **Secondary navigation:** destination trong workspace đang chọn.
3. **Situation strip:** scope, cảnh báo, hàng đợi, tài nguyên tóm tắt.
4. **Page header:** `h1`, mô tả ngắn, scope hiện tại, một hành động chính.
5. **Work area:** nội dung chính; tối đa một lớp containment.
6. **Context panel:** chi tiết, filter hoặc hành động phụ; chỉ hiện khi cần.
7. **Footer:** build/version/credits một dòng, không làm sitemap.

Quy tắc scope:

- Dữ liệu theo hành tinh luôn có tên + tọa độ hành tinh cạnh tiêu đề.
- Dữ liệu toàn đế quốc được gắn nhãn “Toàn đế quốc”.
- Không trộn hai scope trong cùng một khối mà không có phân cách rõ.

Phân cấp component chuẩn:

```text
GameShell
├── CommandHeader
│   ├── Wordmark + MobileMenuTrigger
│   ├── PlanetSwitcher
│   └── GlobalActions
├── Navigation
│   ├── WorkspaceRail
│   └── DestinationNav
├── SituationStrip
│   ├── ScopeSummary
│   ├── PriorityAlert
│   ├── RunningSummary
│   └── ResourceSummary → ResourcePanel
├── PageFrame
│   ├── PageHeader
│   ├── WorkArea
│   └── ContextPanel
└── OverlayLayer
    ├── CommandPalette
    ├── Dialog / Sheet / Popover
    └── ToastRegion
```

### Alert contract

Cảnh báo là view model sinh từ state hiện có, không phải schema game mới:

```text
id · source · priority · severity · scope · pi? · title · consequence · etaAt?
action { label, man, pi? } · secondaryAction? · dedupeKey
```

- Thứ tự: P0 hạm đội địch theo ETA → P1 nợ bảo trì/thiếu tài nguyên/nghiên cứu
  retry → P2 kho/hàng đợi cần chú ý → P3 thông tin.
- Dải tình hình chỉ hiện việc cao nhất + “N việc khác”; Tổng Quan hiện danh sách
  đầy đủ theo priority/scope, không lặp nguyên cùng một khối.
- Action ở dải chỉ điều hướng, không destructive. Nếu có `pi`, đổi hành tinh trước
  khi đổi destination và chạy preload cần thiết của multiplayer.
- Text trong model phải được escape khi render. Countdown dùng `data-live`, không
  full rerender mỗi giây.

## Theme

Custom theme: **“deep-space command, restrained amber signal”**.

Axes: **dark / geometric-technical sans / warm accent**.

```css
:root {
  --color-paper:             oklch(13% 0.018 255);
  --color-paper-2:           oklch(17% 0.020 255);
  --color-paper-3:           oklch(21% 0.022 255);
  --color-surface-active:    oklch(25% 0.026 255);
  --color-ink:               oklch(94% 0.012 255);
  --color-ink-2:             oklch(79% 0.018 255);
  --color-muted:             oklch(66% 0.020 255);
  --color-rule:              oklch(32% 0.025 255);
  --color-rule-strong:       oklch(43% 0.032 255);
  --color-control-rule:      oklch(49% 0.032 255);

  --color-accent:            oklch(75% 0.170 55);
  --color-accent-ink:        oklch(16% 0.025 55);
  --color-focus-ring:        oklch(75% 0.170 55);
  --color-focus-gap:         oklch(13% 0.018 255);

  --color-info:              oklch(76% 0.120 230);
  --color-success:           oklch(75% 0.140 150);
  --color-warning:           oklch(82% 0.150 85);
  --color-danger:            oklch(70% 0.190 28);
  --color-info-surface:      oklch(20% 0.040 230);
  --color-success-surface:   oklch(20% 0.040 150);
  --color-warning-surface:   oklch(21% 0.045 85);
  --color-danger-surface:    oklch(20% 0.050 28);
}
```

- Accent chiếm tối đa 3% viewport: active indicator, primary action, focus hoặc
  một điểm nhấn trong wordmark.
- Màu semantic luôn đi kèm icon, chữ hoặc pattern; không truyền đạt bằng màu đơn độc.
- `--color-rule` dành cho divider nhẹ; input/button/table boundary dùng
  `--color-control-rule` để đạt độ nhận biết tối thiểu.
- Màu từ `G.RES[].mau` là data encoding, chỉ dùng ở dot/swatch/chart; không dùng
  làm link, action hoặc application chrome.
- Surface cao hơn sáng hơn khoảng 4% lightness; không mô phỏng chiều sâu bằng nhiều shadow.
- Mọi cặp chữ/nền và boundary phải được kiểm contrast trong trình duyệt trước khi ship.

## Typography

- **Display/data:** Chakra Petch 700 cho heading/metric lớn, 600 cho table/data.
- **Body/UI:** Be Vietnam Pro, weight 400; emphasis 600.
- **Fallback:** `"Segoe UI", Tahoma, Arial, sans-serif` khi offline.
- **Display tracking:** `-0.02em` ở heading; wordmark có thể dùng `0.04em`.
- **Numbers:** tabular numerals; tọa độ và countdown không nhảy chiều rộng.
- **Body floor:** 16px; helper/label tối thiểu 12px; không dùng body 13.5px như hiện tại.
- **Heading:** sentence case; uppercase chỉ dành cho mã ngắn hoặc tọa độ có tính máy móc.

```css
:root {
  --font-display: "Chakra Petch", "Segoe UI", sans-serif;
  --font-body: "Be Vietnam Pro", "Segoe UI", Tahoma, Arial, sans-serif;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-md: 1.125rem;
  --text-lg: 1.5rem;
  --text-xl: 2rem;
  --text-display: clamp(2rem, 4vw, 3.5rem);
}
```

## Spacing, radius, depth and z-index

```css
:root {
  --space-3xs: 0.125rem;
  --space-2xs: 0.25rem;
  --space-xs: 0.5rem;
  --space-sm: 0.75rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  --space-3xl: 4rem;

  --radius-control: 0.375rem;
  --radius-panel: 0.5rem;
  --radius-pill: 999px;
  --rule-thin: 1px;

  --size-control: 2.75rem;
  --size-header: 3.5rem;
  --size-situation: 3rem;
  --size-workspace-rail: 4.5rem;
  --size-secondary-nav: 13.5rem;
  --size-context-panel: 20rem;
  --size-content-max: 100rem;

  --z-base: 1;
  --z-raised: 10;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal: 400;
  --z-toast: 500;
  --z-tooltip: 600;
}
```

- Radius pill chỉ dùng cho trạng thái ngắn, không dùng cho mọi button/card.
- Card-in-card bị cấm. Group bằng gap, heading, rule hoặc surface shift.
- Một shadow “whisper” cho overlay; panel thường không có shadow/glow.

## Motion

```css
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms;
  --dur-short: 220ms;
  --dur-long: 360ms;
}
```

- Không page-load stagger trên app; dữ liệu phải xuất hiện ngay.
- Chỉ animate `transform` và `opacity` cho menu, drawer, modal, toast.
- Số liệu cập nhật dùng crossfade nhẹ khi cần, không pulse vô hạn.
- `prefers-reduced-motion` chuyển mọi spatial motion thành opacity ≤150ms.

## Microinteractions and states

- Mọi interactive control có đủ: default · hover · focus · active · disabled ·
  loading · error · success.
- Hit target mobile tối thiểu 44×44px.
- Focus ring xuất hiện tức thì và thống nhất: viền cam `--color-focus-ring` 2px,
  cách control 2px bằng `--color-focus-gap`. Cặp ring + gap áp dụng trên cả
  control nền tối lẫn nền accent để không tạo thêm một accent thị giác.
- Thành công nhìn thấy trực tiếp thì im lặng; toast dành cho lỗi, async result
  không thấy ngay hoặc hành động có Undo.
- Hover tooltip chờ 800ms; focus tooltip hiện tức thì.
- Modal ưu tiên `<dialog>`; nếu chưa chuyển được thì phải có role, focus trap,
  restore focus, Escape và backdrop close.

## CTA and copy voice

- Nút dùng động từ cụ thể: “Xây 5”, “Bắt đầu nghiên cứu”, “Mở Thiên Hà”,
  “Mô phỏng trận”, “Xuất kích”.
- Không dùng “OK”, “Submit”, “Tiếp tục” khi có thể gọi đúng hành động.
- Cảnh báo gồm: chuyện gì xảy ra → hậu quả → hành động sửa.
- Empty state gồm: cái gì đang trống → vì sao quan trọng → một hành động tiếp theo.
- Primary action: accent dùng tiết chế, hình chữ nhật bo 6px, label một dòng.
- Secondary action: outlined/quiet; destructive action có chữ và icon, không chỉ đỏ.

## Responsive behavior

- **320–639px:** bottom navigation năm workspace; secondary nav là sheet;
  situation strip thu gọn; resource panel mở theo yêu cầu; detail nằm dưới nội dung.
- **640–959px:** rail icon thu gọn nhưng workspace được chọn vẫn có nhãn nhìn
  thấy; secondary nav là disclosure; bảng ưu tiên cột quan trọng.
- **960–1279px:** rail + secondary navigation đầy đủ; context panel chuyển thành
  drawer hoặc đặt dưới nội dung, không ép ba cột trong viewport hẹp.
- **1280–1439px:** rail + secondary navigation đầy đủ; content/detail theo tỷ lệ 8/4.
- **≥1440px:** content/detail theo tỷ lệ 9/3; giới hạn độ dài dòng và chiều rộng bảng.

Kiểm bắt buộc ở 320, 375, 414, 768, 960, 1280 và 1440px. `html` và
`body` dùng `overflow-x: clip`. Clickable label không xuống hai dòng. Bảng rộng
phải biến thành priority view/card hoặc disclosure trên mobile, không chỉ cuộn ngang.

## Accessibility contract

- Navigation dùng button/link semantic và có trạng thái hiện tại bằng `aria-current`.
- Menu mobile có `aria-expanded`, `aria-controls` và accessible name.
- Label có `for`; error dùng `aria-describedby` + `aria-invalid`.
- Modal/dialog trap focus và trả focus về trigger.
- Toast có `aria-live="polite"`; cảnh báo an toàn nghiêm trọng mới dùng assertive.
- Không dựa vào hover, màu hoặc icon đơn độc.
- Heading theo đúng `h1 → h2 → h3`; mỗi màn có đúng một `h1`.

## Per-page allowances

- **Auth:** được dùng hai vùng sáng nền tĩnh và một hình học SVG/CSS trừu tượng.
- **App:** không enrichment; dữ liệu và trạng thái là hình ảnh chính.
- **Help:** typography only; hình minh họa chỉ khi giải thích cơ chế thật.
- **Thiên Hà:** bảng/bản đồ có thể dùng màu semantic nhiều hơn, nhưng action chính
  vẫn chỉ dùng accent thương hiệu.

## What every screen must share

- Cùng shell, palette, font, spacing, focus treatment và CTA voice.
- Cùng page header và cách biểu thị scope hành tinh/toàn đế quốc.
- Cùng empty/loading/error patterns.
- Cùng metadata navigation cho solo/multiplayer.

## What screens may vary

- Dashboard: workbench bất đối xứng, ưu tiên task/status.
- Data-heavy screens: tabular spec sheet, filter/action bar.
- Build/research/unit screens: catalogue có phân nhóm và detail disclosure.
- Combat flow: workflow corridor nối các màn hiện hữu.
- Help: Long Document.

## Explicit removals from the current visual layer

- Glass/blur trên mọi `.panel`.
- Glow và text-shadow trang trí.
- Header mobile chứa toàn bộ chip tài nguyên nhiều hàng.
- Sidebar phẳng 15/17 mục cùng trọng lượng.
- Panel title uppercase 10–12px ở mọi nơi.
- Inline colour/font values mới; mọi giá trị mới đi qua token.

## Compatibility and migration

- Không đổi luật game, schema state, API hay server-authoritative contract.
- Giữ `data-act`, `data-man`, `data-live` và các ID được action/test dùng cho tới
  khi có test thay thế tương đương.
- Giai đoạn chuyển đổi định nghĩa alias legacy (`--den`, `--cam`, …) trỏ vào token
  mới; xóa alias chỉ sau khi `rg` xác nhận không còn consumer.
- Solo và multiplayer phải render cùng component contract.

## Exports

Project vẫn là vanilla HTML/CSS/JS; các export dưới đây là dữ liệu tham chiếu,
không cho phép thêm Tailwind, shadcn hay dependency mới.

### tokens.css

Khối token trong các mục Theme, Typography, Spacing và Motion là nguồn để tạo
`/css/tokens.css` khi implementation bắt đầu; đường dẫn nằm trong static allowlist
hiện hữu để không mở rộng surface phục vụ file của server.

### Tailwind v4 reference

```css
@theme {
  --color-paper: oklch(13% 0.018 255);
  --color-ink: oklch(94% 0.012 255);
  --color-accent: oklch(75% 0.170 55);
  --font-display: "Chakra Petch", sans-serif;
  --font-body: "Be Vietnam Pro", sans-serif;
  --spacing-md: 1rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG reference

```json
{
  "color": {
    "paper": { "$value": "oklch(13% 0.018 255)", "$type": "color" },
    "ink": { "$value": "oklch(94% 0.012 255)", "$type": "color" },
    "accent": { "$value": "oklch(75% 0.170 55)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Chakra Petch", "$type": "fontFamily" },
    "body": { "$value": "Be Vietnam Pro", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui reference

```css
:root {
  --background: 13% 0.018 255;
  --foreground: 94% 0.012 255;
  --primary: 75% 0.170 55;
  --primary-foreground: 16% 0.025 55;
  --muted: 21% 0.022 255;
  --muted-foreground: 66% 0.020 255;
  --border: 32% 0.025 255;
  --ring: 75% 0.170 55;
  --radius: 0.5rem;
}
```

## Review gate

Implementation chỉ bắt đầu sau khi mindmap và implementation plan đi kèm file
này được duyệt. Mọi thay đổi phạm vi phải quay lại cập nhật bộ ba tài liệu trước.
