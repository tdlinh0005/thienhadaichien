# Thiết kế hiện đại hoá giao diện — Đài chỉ huy quỹ đạo

**Ngày:** 2026-08-23  
**Trạng thái:** Hướng thiết kế đã phê duyệt; đặc tả chi tiết chờ duyệt cuối  
**Tham chiếu hình ảnh:** `docs/superpowers/specs/assets/thdc-orbital-command-reference.png` — chỉ là tham chiếu thiết kế, không phải asset runtime.

## Mục tiêu và phạm vi

Làm mới toàn bộ giao diện vanilla JavaScript cho cả chơi một người và nhiều người theo hướng **Đài chỉ huy quỹ đạo**: tối, nhiều lớp thông tin, bề mặt kính/kim loại tiết chế, điểm nhấn cyan cho điều khiển và amber cho hành động/quy mô đế quốc. Người chơi phải luôn thấy tình trạng sáu tài nguyên: **Kim Loại, Thạch Anh, Nhiên Liệu, Thực Phẩm, Galana, Kỹ Thuật**; Điện là chỉ số vận hành, không thay thế một trong sáu tài nguyên.

Thiết kế bao gồm màn khởi động/xác thực, khung điều hướng, mọi màn vận hành, bảng, biểu mẫu, hộp thoại, thông báo, chat và trạng thái mạng. Thiết kế không thay đổi công thức, luật, thứ tự hành động, dữ liệu lưu, API, quyền máy chủ, nội dung game hoặc số lượng/chức năng các mục menu. Không thêm framework, thư viện giao diện, hệ thống định tuyến mới hay yêu cầu ảnh bitmap ngoài hình tham chiếu.

## Hiện trạng và ràng buộc

- Hai entry point giữ riêng: `index.html` (một người, lưu cục bộ) và `web/index.html` (đăng nhập/máy chủ); chúng dùng cùng `css/style.css`, `js/ui.js`, `js/app.js`.
- `js/ui.js` dựng toàn bộ khung và nội dung bằng render lại DOM; `U.live()` chỉ cập nhật các số có `data-live`. `web/js/mp.js` đồng bộ định kỳ và chỉ gọi render đầy đủ khi chữ ký trạng thái thay đổi để không làm mất dữ liệu đang gõ.
- `js/app.js` là tầng bắt sự kiện UI và chuyển mọi hành động qua `APP.lam`; với nhiều người, `web/js/mp.js` là nguồn chân lý kết nối/API, còn máy chủ quyết định kết quả. Giao diện không được tự kết luận luật chơi.
- CSS hiện là một tệp, không có phụ thuộc runtime; các test hiện có là smoke luật/server và Playwright cho giao diện nhiều người.
- Bản mới phải chạy được trên cùng các URL, `id`, `data-act`, `data-man`, đối tượng toàn cục `U`, `APP`, `MP`, payload hành động và save cũ. Giữ nguyên thứ tự tương đối của 10 script facade hiện hữu; đặc tả chất lượng được phép chèn module nội bộ ngay trước facade sở hữu nó, với HTML, build manifest và server loader được cập nhật/kiểm tra đồng bộ. Không đổi nhãn/tên sáu tài nguyên trong dữ liệu hay logic.

## Kiến trúc thông tin đáp ứng

Khung game có bốn vùng theo thứ tự đọc: thanh lệnh đế quốc, dải cảnh báo, điều hướng nhiệm vụ, và khu vực tác vụ. Thanh lệnh luôn cho biết hành tinh đang chọn, sáu tài nguyên, Điện, bảo trì và trạng thái mạng (nhiều người); chỉ số có thể thu gọn nhưng không bị loại bỏ. Dải cảnh báo ưu tiên theo mức: nguy hiểm, cảnh báo, thông tin thành công; mỗi cảnh báo dẫn tới màn hoặc hành động liên quan khi khả thi.

Điều hướng nhóm các mục hiện có thành: **Đế quốc** (Tổng Quan, Tài Nguyên, Công Trình, Nghiên Cứu, Xưởng, Phòng Thủ), **Hạm đội** (Hạm Đội, Thiên Hà, Máy Tính Trận), **Cộng đồng** (Liên Minh, Xếp Hạng, Tin Nhắn; thêm Bảng Tin và Chat ở nhiều người), **Hệ thống** (Hướng Dẫn, Nhật Ký & Lưu hoặc Tài Khoản). Nhóm là cách trình bày; từng đích `data-man` và khả năng của từng chế độ giữ nguyên.

Nội dung màn dùng tiêu đề rõ mục tiêu, một dải tóm tắt/bước kế tiếp khi cần, rồi các panel tác vụ và dữ liệu liên quan. Thông tin cần quyết định (chi phí, điều kiện, thời gian, hàng đợi, rủi ro) đứng cạnh nút hành động; thông tin tham khảo đi sau. Bảng thiên hà, xếp hạng, báo cáo và hàng đợi vẫn là bảng dữ liệu, không biến thành các thẻ làm mất khả năng đối chiếu.

| Khổ màn hình | Bố cục và ưu tiên |
| --- | --- |
| Desktop ≥ 1200px | Điều hướng bên trái cố định trong vùng đọc; thanh lệnh một hàng; nội dung tối đa hai cột theo ngữ cảnh; bảng rộng cuộn trong vùng bảng. |
| Tablet 768–1199px | Thanh lệnh chia hai hàng có chủ đích; điều hướng thành drawer mở bằng nút; panel hai cột chỉ khi mỗi cột còn đọc được; bộ lọc/bộ điều khiển thiên hà xếp dòng. |
| Mobile < 768px | Một cột; thanh lệnh ưu tiên hành tinh, cảnh báo và chỉ số thiết yếu, sáu tài nguyên nằm trong vùng có thể mở/đóng ngay dưới thanh; drawer phủ nội dung; biểu mẫu theo chiều dọc, nút xác nhận toàn chiều rộng; bảng không co ép mà cuộn ngang trong khung có nhãn. |

Không có cuộn ngang ở cấp trang. Các bảng, mã/tọa độ, chat và hộp thoại tự xử lý tràn trong vùng của chúng.

## Ngôn ngữ hình ảnh

Token CSS dùng biến nghĩa, không rải mã màu theo từng màn:

| Nhóm | Token và ý nghĩa |
| --- | --- |
| Nền/bề mặt | `--bg-space`, `--bg-command`, `--surface-1`, `--surface-2`, `--surface-raised`, `--border-subtle`, `--border-strong` cho nền không gian, bảng điều khiển và tầng nổi. |
| Chữ | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse`; số liệu dùng font tabular/monospace riêng qua `--font-data`. |
| Tín hiệu | `--signal-cyan` (điều hướng/focus), `--signal-amber` (lệnh chính), `--state-success`, `--state-warning`, `--state-danger`, `--state-info`; màu luôn đi kèm chữ hoặc biểu tượng. |
| Nhịp điệu | thang khoảng cách 4/8/12/16/24/32 px, bán kính 6/10/14 px, bóng nổi nhẹ và viền 1 px; không dùng gradient hoặc phát sáng để truyền tải trạng thái duy nhất. |

Các component nhất quán gồm Command Bar, Resource Readout, Alert Rail, Mission Navigation/Drawer, Surface Panel, Stat/Queue Card, Action Button (primary/secondary/destructive), Form Field + trợ giúp/lỗi, Data Table, Status Chip, Empty/Loading/Error State, Toast và Modal. Mỗi component chỉ đổi cách nhìn; nhãn, giá trị, điều kiện, `data-*` và thao tác hiện tại giữ nguyên.

## Hành vi theo thiết bị

Desktop tối ưu cho giám sát và so sánh: resources luôn nhìn thấy, menu mở, bảng có cột ổn định và nhãn hàng/cột không mơ hồ. Tablet ưu tiên thao tác một tay ngang/dọc: drawer, vùng bấm lớn, panel không ép nội dung. Mobile ưu tiên vòng lặp quyết định ngắn: xem cảnh báo → chọn hành tinh/màn → nhập → xác nhận; drawer đóng sau khi đổi màn, focus trở về nút mở drawer khi đóng, và thanh lệnh không che trường đang nhập. Hover chỉ là tăng cường; mọi hành động có trạng thái focus, active và disabled tương đương.

## Hợp đồng khả năng tiếp cận

- Dùng landmark và tên truy cập được: `header`, `nav` có nhãn, `main` có tiêu đề màn, `footer`; logo/trang tổng quan là control thật. Mục đang chọn biểu thị bằng `aria-current="page"`.
- Điều hướng drawer là control có `aria-expanded`/`aria-controls`; `Escape` đóng drawer, khóa cuộn nền khi mở trên mobile và trả focus về nút mở. Tab/Shift+Tab không đi vào nội dung bị drawer che.
- Form dùng `label` liên kết control, mô tả/đơn vị/giới hạn qua `aria-describedby`, lỗi theo trường và summary lỗi liên kết; trạng thái disabled phải nêu lý do ngắn. Nhập số vẫn cho phép bàn phím và không chỉ dựa vào nút “tối đa”.
- Hộp thoại có `role="dialog"`, `aria-modal="true"`, tiêu đề có tên, focus ban đầu hợp lý, vòng focus bên trong, `Escape` nếu thao tác không phá huỷ và trả focus về control đã mở. Xác nhận phá huỷ nêu rõ đối tượng/hậu quả và không mặc định focus vào nút phá huỷ.
- Mọi lần `U.ve()` thay thế DOM phải chụp và khôi phục focus hợp lệ (theo `id`/vai trò hoặc control khởi phát), giá trị đang nhập và vị trí cuộn vùng nội dung khi phần tử tương ứng còn tồn tại; không đánh cắp focus trong `U.live()`. Render do đồng bộ nhiều người không được làm mất dữ liệu chat/form đang gõ.
- Toast, kết quả hành động và thay đổi cảnh báo dùng live region không chen ngang (`role="status"`); lỗi chặn hành động dùng `role="alert"`. Chat là log có nhãn và `aria-live="polite"`; tin mới chỉ được đọc khi người dùng không đang nhập, giữ vị trí cuộn nếu họ đang xem tin cũ, và có nút/nhãn “tin mới” để quay xuống đáy.
- Mục tiêu chạm/click tối thiểu 44 × 44 CSS px, khoảng cách đủ tránh chạm nhầm; liên kết trong hàng bảng không biến toàn hàng thành control mơ hồ. Focus thấy rõ, độ tương phản chữ/trạng thái đạt WCAG AA, hỗ trợ phóng to 200%, `prefers-reduced-motion` và không dùng màu đơn độc.
- Bảng dùng `caption` hoặc nhãn tương đương, `th`/`scope`, tiêu đề dính khi phù hợp; vùng cuộn có thể focus bằng bàn phím, có tên mô tả và vẫn cho người đọc màn hình hiểu quan hệ hàng/cột.

## Ranh giới thành phần và luồng dữ liệu

| Tệp | Sở hữu sau thiết kế | Không sở hữu |
| --- | --- | --- |
| `index.html` | Cấu trúc semantic của khởi động một người, shell game, landmark, container live/toast/modal. | Luật, state, API nhiều người. |
| `web/index.html` | Cấu trúc semantic đăng nhập/đăng ký và shell nhiều người; trạng thái mạng trong Command Bar. | Xác thực phía máy chủ, luật game. |
| `css/style.css` | Token, layout đáp ứng, component state, focus, motion và print/overflow cần thiết. | Nội dung/giá trị do JS sinh ra. |
| `js/ui.js` | Renderer màn dùng chung, component markup, metadata truy cập, snapshot/restore UI, cập nhật số live. | Gọi API và quyết định nghiệp vụ. |
| `js/app.js` | Event delegation và chuyển input UI thành `APP.lam`/hành động hiện hữu; thông báo kết quả. | Cách lấy state local/server. |
| `web/js/mp.js` | Đồng bộ, loading/error/network state, renderer đặc thù multiplayer (chat/bảng tin/tài khoản), giữ input/scroll qua poll. | Thẩm quyền thay đổi state; server vẫn là nguồn chân lý. |

Luồng chuẩn: người chơi thao tác control → `js/app.js`/handler MP kiểm tra dữ liệu trình bày tối thiểu → `APP.lam` hoặc tải dữ liệu → local engine hay API server trả state/kết quả → adapter cập nhật state → `js/ui.js` render phần thay đổi hoặc `U.live()` cập nhật số → live region thông báo. Các UI state ngắn hạn (màn đang mở, hành tinh chọn, drawer/modal, draft, focus, scroll, bộ lọc) tách khỏi state game và không được đưa vào save/API trừ khi giao thức hiện có đã yêu cầu.

## Loading, lỗi và trạng thái rỗng

Mỗi vùng tải có skeleton hoặc dòng “Đang tải …” đúng kích thước gần nội dung cuối; giữ nội dung cũ có nhãn “đang làm mới” khi dữ liệu nền đang về. Lỗi mạng hiển thị chip kết nối và cảnh báo có thể hành động (“Thử lại”), giữ dữ liệu xác nhận gần nhất, không giả vờ dữ liệu cũ là mới. Lỗi server/validation hiện ngay control liên quan và qua toast/live region; nút đang gửi bị khóa, có trạng thái đang xử lý, sau đó được mở lại bất kể thành công/thất bại. Danh sách rỗng giải thích ngắn trạng thái và lối đi tiếp theo nhưng không che giấu control hợp lệ. Phiên hết hạn quay về đăng nhập với thông báo rõ và không để lại nội dung game tương tác.

## Tương thích ngược

Giữ nguyên URL `/`, `/motnguoi`, alias `/solo`, các API, thứ tự tương đối facade, localStorage key/token, save schema, selector/ID được test, `data-act`, `data-man`, cấu trúc payload và mọi nhãn game có nghĩa luật. CSS mới không được phụ thuộc font/network ngoài; nếu font hệ thống thiếu thì fallback vẫn có số canh cột. Màn một người tiếp tục lưu/tải/xuất/nhập như cũ; màn nhiều người tiếp tục poll, báo mạng, login/register/logout và chỉ server quyết định hành động. Bản cũ không cần migration dữ liệu để dùng UI mới.

## Tiêu chí chấp nhận và kiểm thử

1. Các entrypoint thực tế `index.html` trực tiếp ở gốc (một người), `/motnguoi` và alias `/solo` trên máy chủ (một người), cùng `/` hoặc `/index.html` trên máy chủ (nhiều người) đều hiển thị đúng hướng Đài chỉ huy quỹ đạo, nhất quán với `docs/superpowers/specs/assets/thdc-orbital-command-reference.png`. Bitmap này chỉ là tham chiếu thiết kế; bản chạy không thêm asset runtime bắt buộc.
2. Trong game, sáu tài nguyên Kim Loại, Thạch Anh, Nhiên Liệu, Thực Phẩm, Galana, Kỹ Thuật luôn truy cập được từ Command Bar; Điện và bảo trì vẫn thấy được; mọi số thay đổi live không gây nhảy focus.
3. Mọi màn solo và multiplayer hiện hữu mở được, toàn bộ hành động `data-act` tiếp tục gửi đúng payload/kết quả như trước; multiplayer vẫn tôn trọng server-authoritative và polling không làm mất draft chat/form.
4. Ở 1440×900, 1024×768, 768×1024, 390×844 và zoom 200%, không có cuộn ngang trang, control quan trọng không bị che/cắt, drawer/modal/bảng hoạt động đúng mô tả theo thiết bị.
5. Có thể hoàn thành đăng ký/đăng nhập, chọn màn/hành tinh, xây/đóng, giao dịch, gửi hạm đội, chat, thao tác liên minh và lưu/tải solo chỉ bằng bàn phím; focus được giữ/khôi phục qua render, drawer và dialog.
6. Bộ assertion Playwright tự viết không có lỗi nghiêm trọng về landmark, tên control, dialog, focus visible, label, table headers, keyboard flow và overflow. Kiểm tra contrast tự động dùng computed color trên các cặp token/bề mặt được khai báo; checklist thủ công xác nhận các trường hợp transparency, live region/chat không đọc lặp và không kéo người đang xem tin cũ xuống đáy. Không cần thêm dependency accessibility runtime hay dev-only.
7. `npm test`, `npm run test:ui` và `npm run build` đều thành công; Playwright bổ sung snapshot/behavior cho các breakpoint, drawer, modal, form preservation, chat scroll/live update, trạng thái loading/lỗi mạng, alias `/solo`, và luồng `file://` mở trực tiếp root `index.html` rồi tạo/lưu/nạp game mà không phát sinh request dependency. Test luật/server tiếp tục là hàng rào chống đổi cơ chế.

## Triển khai theo đợt và sở hữu song song

Đợt 1 (nền tảng) do **agent Shell** sở hữu `index.html`, `web/index.html`, `css/style.css`: semantic shell, token, responsive shell, drawer/modal/toast cơ sở. Đợt 2 (màn chung) do **agent UI** sở hữu `js/ui.js`: renderer component, nhóm điều hướng, state preservation, markup truy cập và bề mặt mọi màn chung. Đợt 3 (tương tác) do **agent Interaction** sở hữu `js/app.js`: contract sự kiện, focus origin, validation/feedback sau hành động. Đợt 4 (nhiều người) do **agent Multiplayer** sở hữu `web/js/mp.js`: trạng thái poll/network/loading/chat, render đặc thù và preservation. Đợt 5 (xác nhận) do **agent QA** sở hữu `tools/test-mp-ui.mjs` và các bổ sung test chỉ sau khi API UI của các đợt trước ổn định.

Mỗi agent chỉ sửa tệp được giao; thay đổi cross-file đi qua review giao diện hợp đồng (`id`, `data-*`, aria/state UI). Shell hoàn thành trước UI/Interaction; Multiplayer có thể thực hiện song song với UI khi giữ nguyên contract renderer; QA bắt đầu fixture/test đọc-only sớm và chốt sau khi các đợt UI hoàn tất. Không agent nào sửa engine, luật hoặc server cho công việc này.

## Phụ thuộc

Đặc tả này phụ thuộc vào [thiết kế bộ lập lịch sự kiện bền vững](2026-08-23-durable-event-scheduler-design.md) để giữ đúng trạng thái/thời điểm game khi hiển thị và đồng bộ, và [thiết kế chất lượng & khả năng bảo trì](2026-08-23-quality-maintainability-design.md) để thống nhất ranh giới, regression test và tiêu chuẩn chất lượng. Hai đặc tả đó là nguồn quyết định cho contract state, API, migration và test luật; ngược lại, chúng phải tuân thủ các ràng buộc UI ở đây về selector/semantic state, thông điệp lỗi/loading và tiêu chí hồi quy. Hình tại `docs/superpowers/specs/assets/thdc-orbital-command-reference.png` chỉ là tham chiếu thiết kế, không được coi là phụ thuộc hay asset runtime; không có phụ thuộc sản phẩm hoặc dịch vụ bên ngoài.
