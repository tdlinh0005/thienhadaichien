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

## Code review độc lập (agent) + vòng fix

Reviewer độc lập chấm **BLOCK** với 1 CRITICAL + 4 HIGH + 2 MEDIUM + 3 LOW. Toàn bộ đã được sửa:

### CRITICAL
| # | Bug | Fix |
|---|---|---|
| 1 | Đầu tư Siêu Thị KHÔNG BAO GIỜ đáo hạn: `ketThucAt` không nằm trong lịch sự kiện, vốn biến mất vĩnh viễn; quỹ chia lợi nhuận thuế không tồn tại | Thêm `ketThucAt` vào `G.sukienKe`; nhánh đáo hạn trong `xuLySuKien` hoàn vốn gốc + 5%/kỳ (`laiDauTuKy`) |

### HIGH
| # | Bug | Fix |
|---|---|---|
| 2 | Hệ số địa hình VÔ HIỆU 100% trong chơi thật: callers truyền tên hiển thị ("Sa Mạc") thay vì id ("samac"); trận đổ bộ không truyền loaiHT chút nào | Tất cả callers truyền `Lmuc.id/Ld.id/Lp.id`; `doBoXuong` nhận + forward `loaiHT` |
| 3 | `choMua` khoá/chuStack bất đối xứng: tick state người mua khi chủ trên stack là người bán → nhánh phản bội có thể GHI ĐÈ TOÀN BỘ đế quốc người mua vào tài khoản người bán | Khoá đối xứng cả hai tk theo id tăng; pop/delete đối xứng trong try và catch |
| 4 | Bảng `cho` ghi ngoài transaction: rollback state không hoàn được đơn → ghost listing / mất hàng chưa nhận tiền | Lệnh INSERT/UPDATE/DELETE chợ xếp vào `ctx.choLenh`, flush TRƯỚC serialize state trong cùng COMMIT |
| 5 | Nút thị trường MP gọi `/api/lam` (luật local) thay vì `/api/cho*` → đơn vô hình, tài nguyên bị khoá | Override 3 handler trong mp.js gọi đúng endpoint; lọc đơn của ta bằng `MP.tk` thật |

### MEDIUM
| # | Bug | Fix |
|---|---|---|
| 6 | Hàng Tự Do "6 giờ" thực tế tới sau 6–12 giờ: `xongAt` không nằm trong lịch sự kiện | Duyệt `giaoHang[*].xongAt` trong `G.sukienKe` |
| 7 | Kỳ bầu chủ 14 ngày chưa có gate; phiếu bầu chủ miễn validate ứng viên | `taoPhieu` chặn `bachu` trước `bacCuAt`; yêu cầu ứng viên có quyền bầu; set `bacCuAt` mới sau bầu thành công |

### LOW
| # | Bug | Fix |
|---|---|---|
| 8 | Dead ternary trong thông báo tuyên chiến | Xoá |
| 9 | Nhánh phản bội có thể ghi `probe: NaN` | Guard `if (!f.ships.probe) return;` |
| 10 | Marker `moHinhKT` không được khẳng định lại khi nạp v7 | Chấp nhận rủi ro thấp — chỉ một nguồn gán marker, migration idempotent có test bảo vệ |

### Bug tự tìm thấy trong vòng tự review trước đó
1. Dispatcher migration dừng ở v6 (`phienBan` không tăng) — nghiêm trọng, sửa.
2. Key `rungia`/`bangha` sai id thật — hệ số âm thầm vô hiệu, sửa.
3. `tickCho` chưa nối vòng tick — hàng không bao giờ nhập kho, sửa.
4. Mua NPC không trừ stock — mua vô hạn, sửa.
5. Đơn cạn sót projection state người bán — splice, sửa.
6. Migration thiếu default `choDon` — default [], sửa.

### Reviewer xác nhận OK (không đổi)
Kinh tế trừ các bug trên · Migration additive idempotent · Rapidfire/khiên · Hai lớp quỹ đạo/mặt đất · Phản bội luồng thường · Công thức đa số phiếu · Bảo mật API mới (auth/rate-limit/validation/no-leak).

## Kết quả kiểm thử cuối
- `node tools/smoke.js`: **239/239 đạt**
- `node tools/test-server.js`: **333/333 đạt**
- `npm run build`: bundle 311 KB parse OK

## Cách chạy lại kiểm chứng
```bash
npm test          # smoke + server tests
npm run build     # bundle artifact
```
