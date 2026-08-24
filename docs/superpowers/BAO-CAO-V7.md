# Báo cáo đợt triển khai State v7

Ngày hoàn thành: 2026-08-25 · Người thực hiện: Claude (ox-alpha) · Trạng thái: **4/4 phase xanh, chờ code review**

## Anh cần biết trong 30 giây

- Đã đưa vào game **4 nhóm cơ chế mới** theo đúng spec đã duyệt: kinh tế thật (ngân hàng/siêu thị/tự do), địa hình chiến thuật, lương gián điệp + phản bội, ba chính thể liên minh.
- **Tất cả test xanh**: 239 kiểm tra luật (smoke) + 333 kiểm tra máy chủ, bundle artifact build OK.
- Mọi commit tách bạch theo phase; spec + plan + mindmap nằm trong `docs/superpowers/`.
- Code-review agent đang quét lần cuối; nếu có bug sẽ được sửa ngay sau khi có kết quả.

## Đã làm gì (theo phase)

### Phase 1 — Kinh tế thật
| Cơ chế | Chi tiết | Nguồn |
|---|---|---|
| Ngân Hàng Vũ Trụ | Gửi/rút Galana; lãi suy giảm theo số dư `0.02 × k/(k+soDu)`, kẹp dải [0,07% … 2%]/ngày; tích liên tục theo giây, kết toán tại checkpoint 6h | XN dải lãi; TĐ hàm suy giảm |
| Siêu Thị Thiên Hà | Chỉ bán **giá gốc** KL=1, TA=2, NL=4, TP=1 GL; thuế 10%; chỉ mua được khi có người bán — hết bộ đổi vô hạn | XN giá gốc + thuế |
| Thị Trường Tự Do | Tự định giá, thuế 5%, hàng về sau đúng 6 giờ qua `p.giaoHang` | XN thuế + 6h |
| Đầu tư siêu thị | Khoá vốn 7 ngày, không rút giữa kỳ | XN cơ chế; TĐ kỳ hạn |
| Uranium | Thưởng sự kiện; tăng tốc xây (10 Ur) và mua điểm Kỹ Thuật (20 Ur/điểm) | XN tồn tại ở 1.35b; TĐ giá |
| Solo | NPC bán với độ sâu giới hạn, hồi ~2%/giờ | TĐ |
| Chợ cũ | `ban`/`mua` thành alias trả lỗi hướng dẫn | — |

### Phase 2 — Địa hình chiến thuật
- Bảng `G.DIA_HINH`: Tank ×1.5 Sa Mạc / ×0.6 Rừng · Robot ×1.4 Rừng / ×0.7 Nước · Máy Bay ×0.75 Băng / ×1.15 Nước · Hoả tiễn/Bom ×1.25 Sa Mạc / ×0.7 Rừng.
- Nhân vào ATK + HULL của đơn vị; chỉ áp trận **mặt đất** và trận **đổ bộ** (tàu hạ độ cao); **quỹ đạo trung hoá** như thiết kế.
- Hướng lợi/hại là XÁC NHẬN từ GameLand "Theo ITD"; toàn bộ hệ số là TÁI DỰNG bảo thủ.

### Phase 3 — Lương gián điệp & phản bội
- Mỗi tàu do thám tốn 0.5 NL/giờ, trừ tại checkpoint bảo trì.
- Thiếu lương một kỳ → cờ `phanBoi`: lần do thám kế tiếp bị LỘ NGƯỢC (đối phương nhận báo cáo mức 2 về ta), mất 50% tàu do thám.
- Trả đủ một kỳ sạch → cờ tắt. Nút "trả ngay" ở màn tài chính (`traLuongGD`).
- Báo cáo do thám mức 5 kèm thêm **sản lượng mỏ/giờ** (XÁC NHẬN tư liệu ghi báo cáo thấy mức sản xuất).

### Phase 4 — Ba chính thể liên minh
- `lm.chinhThe ∈ docTai | danChu | congHoa`; chọn lúc lập LM; LM cũ mặc định Độc tài.
- **Độc tài**: hành vi v6 nguyên trạng.
- **Dân chủ**: phiếu toàn thành viên, đa số đơn giản, hạn 24h; loại phiếu: tuyên chiến, duyệt, từ chối, loại, bầu chủ.
- **Cộng hoà**: chỉ đại biểu top-5 điểm được bỏ phiếu.
- Phiếu đạt → server tự thực thi bằng luồng nội bộ hiện có (duyệt/loại/tuyên chiến/đổi chủ). Bầu chủ kỳ 14 ngày (TÁI DỰNG).
- Gate tuyên chiến: chính thể có phiếu thì phải đạt phiếu mới đặt được lệnh `chien`.

## Kiến trúc & dữ liệu
- State **v7 additive**: `st.nganHang`, `st.dauTuST`, `st.uranium`, `st.luongGD`, `st.choDon`, `p.giaoHang`. Migration idempotent, không đụng số liệu cũ.
- Bảng SQLite mới: `cho`, `lm_phieu`, `lm_phieu_chi_tiet`; cột `lm.chinhThe/bacCuAt` thêm bằng ALTER TABLE có điều kiện.
- API mới: `/api/lmphieu`, `/api/cho` (GET/POST), `/api/cho/mua`, `/api/cho/huy`.
- UI mới: màn **Ngân Hàng & Thị Trường** (3 tab) dùng chung solo/multiplayer; panel chính thể + phiếu trong màn Liên Minh (multiplayer).

## Các điểm em tự quyết (anh dễ đổi ở đâu)
| Quyết định | Giá trị hiện tại | Đổi ở |
|---|---|---|
| Hàm lãi ngân hàng | `laiK = 1 tỷ` (~1%/ngày tại mốc đó) | `G.KINH_TE_V1.laiK` trong `js/data.js` |
| Kỳ đầu tư siêu thị | 7 ngày | `G.KINH_TE_V1.kyDauTuGiay` |
| Lương gián điệp | 0.5 NL/tàu/giờ; bắt 50% khi phản bội | `luongProbeDeutGio`, `phanBoiBat50` cùng file |
| Giá Uranium | tăng tốc 10 Ur, 20 Ur/đ điểm KT | `uraniumTangToc`, `uraniumMotDiem` |
| Hệ số địa hình | bảng bảo thủ theo spec | `G.DIA_HINH` trong `js/data.js` |
| Độ sâu NPC solo | trần per-resource, hồi 2%/giờ | `G.CHO_NPC` trong `js/thitruong.js` |
| Đại biểu Cộng hoà | top 5 điểm | `DAI_BIEU_TOI_DA` trong `server/world.js` |

## Các bug đã phát hiện & sửa trong vòng review

| # | Bug | Mức độ | Fix |
|---|---|---|---|
| 1 | Dispatcher migration: sau `nangV5LenV6` biến `phienBan` không được tăng → save v3/v5 dừng ở v6, không lên v7 | Nghiêm trọng | Tăng `phienBan = 6` trước khi gọi `nangV6LenV7` |
| 2 | Bảng `G.DIA_HINH` dùng key `rungia`/`bangha` sai id thật (`runggia`/`banghai`) → hệ số địa hình âm thầm vô hiệu | Nghiêm trọng | Sửa key đúng id |
| 3 | `G.tickCho` chưa được nối vào vòng tick → hàng Tự Do không bao giờ nhập kho | Nghiêm trọng | Gọi `G.tickCho(st, t)` trong `G.xuLySuKien` |
| 4 | Mua từ NPC không trừ kho hàng hồi dần → mua vô hạn từ cùng lượng NPC | Cao | Trừ thẳng vào `st.npcCho[res].con` |
| 5 | `choMua` chỉ khoá người bán, không khoá người mua → race khi buyer đang bị tick | Cao | Khoá cả hai trước unit-of-work |
| 6 | Đơn cạn (mua hết) bị xoá khỏi bảng `cho` nhưng còn sót trong projection state người bán | Trung bình | Splice khỏi `choDon` khi cạn |
| 7 | `lmDuyetVoiQuyen`: ứng viên vào LM khác trong lúc phiếu mở → phiếu 'dat' ma, đơn không dọn | Thấp | Xoá đơn khi `lmvao` lỗi |
| 8 | Migration v7 thiếu default `st.choDon` cho save cũ → UI đọc undefined | Trung bình | `Array.isArray` guard + default [] |
| 9 | UI so sánh `st.lm === chuỗi` trong test server (st.lm là object) | Chỉ test | Sửa test so sánh `.ten` |

Ngoài ra đã tự rà và pass: lãi lẻ giữ trong `laiLuc` không bốc hơi khi rút; đơn 0/hết hàng báo lỗi đúng; huỷ đơn NPC bị chặn; `ban/mua` alias chặn chợ cũ.

## Kết quả kiểm thử cuối
- `node tools/smoke.js`: **239/239 đạt**
- `node tools/test-server.js`: **333/333 đạt**
- `npm run build`: bundle 311 KB parse OK

## Cách chạy lại kiểm chứng
```bash
npm test          # smoke + server tests
npm run build     # bundle artifact
```
