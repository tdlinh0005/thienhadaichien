# Thiết kế: Kinh tế thật, địa hình chiến thuật, tình báo lương, ba chính thể

Ngày: 2026-08-25 · Trạng thái: đã duyệt qua phỏng vấn · Đối tượng: state v6 → v7

Đợt phục dựng này nhắm **độ trung thành lịch sử**: đưa các cơ chế có trong tư liệu
mà bản dựng hiện tại còn thiếu (xem `docs/NGHIEN-CUU.md` mục 5) vào game. Bốn phase
trong cùng một implementation plan, mỗi phase commit riêng và phải `npm test` xanh.

Quy ước nhãn giữ nguyên như docs nghiên cứu: **[XÁC NHẬN]** = tư liệu nói trực tiếp;
**[TÁI DỰNG]** = quyết định của dự án để lấp khoảng trống; con số neo lấy đúng tư
liệu trước, cân bằng sau (quyết định của người chơi ngày 2026-08-25).

## Phạm vi chốt với người chơi

| Quyết định | Lựa chọn |
|---|---|
| Hướng đợt này | Độ trung thành lịch sử |
| Kinh tế | Bộ ba đầy đủ: Ngân hàng + Siêu Thị Thiên Hà + Thị Trường Tự Do |
| Quân sự | Hệ số theo loại hành tinh + lương gián điệp/phản bội. KHÔNG làm đơn vị tàng hình |
| Liên minh | Ba chính thể đủ cả với phiếu bầu đầy đủ |
| Chợ ở solo | NPC bán hàng (độ sâu giới hạn, hồi dần) |
| Toạ độ | Giữ 3 phần — không suy diễn phần thứ tư |
| Monetize | Uranium chỉ là tiền thưởng sự kiện, không nạp tiền thật |
| Gói kế hoạch | Một đợt, 4 phase |
| State | v7 + migration additive từ v6 |
| Neo số | Ưu tiên con số tư liệu, các hệ số khác ghi rõ [TÁI DỰNG] |
| Testing | Mở rộng tools/smoke.js + tools/test-server.js hiện có |

## Kiến trúc tổng thể

Giữ nguyên nguyên tắc "một bộ luật duy nhất": mọi luật mới nằm trong `js/*.js`,
server nạp qua `server/rules.js`, thế giới chung đi qua `G.HOOK`, server quyết định.
Client multiplayer vẫn `G.MO_PHONG_NHE` chỉ vẽ + gửi yêu cầu.

```
js/data.js        + G.DIA_HINH (hệ số địa hình), hằng số kinh tế mới trong G.C
js/engine.js      + tick lãi ngân hàng, tick giao hàng 6h, tick lương gián điệp
js/actions.js     + hành động mới: guiNH/rutNH/dauTuST, dangBan/muaHang/huyDon,
                    datLuong/traLuong, boPhieu (chính thể phiếu đi qua /api riêng)
js/combat.js      + nhân hệ số địa hình khi dựng nhóm trận
js/ui.js          + màn Ngân Hàng & Thị Trường (3 tab), panel chính thể, chỉ báo lương
web/js/mp.js      + gọi API biểu quyết, hiển thị lm_phieu
server/db.js      + bảng chung `cho`, `lm_phieu`
server/world.js   + luồng chợ chéo đế quốc, thực thi kết quả phiếu, migration v7
```

### State v7 (additive so với v6)

Mỗi đế quốc thêm (default khi migrate, không đụng dữ liệu cũ):

```js
st.v = 7;
st.nganHang = { soDu: 0 };                 // Galana gửi tiết kiệm
st.dauTuST  = 0;                           // vốn đầu tư Siêu Thị Thiên Hà đang khoá
st.uranium  = 0;                           // tiền thưởng sự kiện [1.35b]
st.luongGD  = { muc: 0, traLuc: 0, phanBoi: false };
// trong mỗi hành tinh:
p.giaoHang  = [];                          // [{donId, res, so, xongAt}] hàng đang về
```

Bảng SQLite chung:

```
cho       (id PK, loai 'sieuthi'|'tudo', tk, res, so, gia, khi, trangThai)
lm_phieu  (id PK, lm, loai, doiTuong TEXT, hetHan, ketQua NULL|'dat'|'khong')
lm_phieu_chi_tiet (id PK, phieuId FK, tkBau, giaTri 0|1)   -- UNIQUE(phieuId, tkBau)
```

Migration v6→v7 chạy trong `TheGioi.nangCapDuLieu()`: gắn default cho mọi đế quốc,
LM cũ nhận `chinhThe:'docTai'`. State mới hơn engine → từ chối khởi động (giữ nguyên
hành vi v6). Bản một người đọc key v7 rồi fallback v6→v3, giữ key cũ làm dự phòng.

## Phase 1 — Kinh tế thật

**Ngân Hàng Vũ Trụ** [XÁC NHẬN lãi ~2%/ngày, dải 0,07–2% từ GameLand]:
lãi liên tục theo giây trong `G.tick`, công thức suy giảm theo số dư —
`laiNam = 0.02 × k/(k+soDu)` kẹp `[0.0007/ngày … 0.02/ngày]`, hằng số `k` là
[TÁI DỰNG] chọn sao cho số dư cỡ 1 tỷ nhận ~1%/ngày. Rút về ngay được.
Lãi kết toán vào `soDu`, không tràn sang tài nguyên khác.

**Đầu Tư Siêu Thị** [XÁC NHẬN có cơ chế, không rút giữa kỳ]: kỳ 7 ngày [TÁI DỰNG].
Hết kỳ nhận vốn + phần chia lợi nhuận thuế siêu thị theo tỉ trọng góp. Đây là bể
hấp thụ Galana chống lạm phát.

**Siêu Thị Thiên Hà** [XÁC NHẬN giá gốc, thuế 10%]: người chơi đăng bán KL/TA/NL/TP
đúng **giá gốc** KL=1, TA=2, NL=4, TP=1 GL/đơn vị. Người mua trả GL, thuế 10% vào
quỹ siêu thị (chia cho người đầu tư). Hàng có sẵn mới mua được. Solo: NPC bán với
độ sâu giới hạn mỗi loại, hồi dần theo giờ [TÁI DỰNG].

**Thị Trường Tự Do** [XÁC NHẬN thuế 5%, hàng đến sau 6 giờ]: người bán tự đặt giá,
thuế 5%, hàng bay về `p.giaoHang` của người mua, tick xử lý khi tới hạn. Solo dùng
cùng code, đơn đối tác là NPC. Chặn self-trade; giới hạn 20 đơn mở/người [TÁI DỰNG].

**Kỹ Thuật = 10 GL**: chỉ ghi neo giá vào docs/xếp hạng, không mở mua bán [XÁC NHẬN "không thể trao đổi"].

**Uranium** [XÁC NHẬN tồn tại ở 1.35b, cách phát là TÁI DỰNG]: thưởng sự kiện/kỷ niệm
do admin cấp, dùng tăng tốc xây và mua điểm công nghệ; không chuyển nhượng.

**Chợ cũ bị thay thế**: `ban`/`mua` thành alias trả lỗi hướng dẫn; tỷ giá cố định
`G.C.TY_GIA` xoá khỏi đường dùng, giữ hằng để migration cũ đọc.

## Phase 2 — Chiến đấu theo địa hình

[XÁC NHẬN hướng từng loại hành tinh từ GameLand; toàn bộ hệ số là TÁI DỰNG bảo thủ]

Bảng `G.DIA_HINH[chungQuan][loaiHT]` nhân vào ATK/HP lúc `G.danhTran` dựng nhóm:

| Quân chủng | Sa Mạc | Rừng | Nước | Băng | Ôn Hoà |
|---|---|---|---|---|---|
| Tank | 1.50 | 0.60 | 0.80 | 1.00 | 1.00 |
| Robot | 0.90 | 1.40 | 0.70 | 1.00 | 1.00 |
| Máy Bay (CD/TK) | 1.00 | 0.90 | 1.15 | 0.75 | 1.10 |
| Hỏa tiễn/Boom | 1.25 | 0.70 | 1.00 | 1.00 | 1.00 |

Phân lớp: **mặt đất nhận hệ số đầy đủ**; **quỹ đạo trung bình hoá về 1** (chiến
tranh vũ trụ không chịu địa hình) — tức quỹ đạo chỉ nhận hiệu ứng gián tiếp qua
thành phần máy bay/hỏa tiễn phóng từ mặt đất nếu có. Phòng thủ mặt đất theo loại
hành tinh (`thuDat`) hiện có giữ nguyên, cộng thêm với bảng trên.

## Phase 3 — Lương gián điệp & phản bội

[XÁC NHẬN "không trả lương thì phản bội" từ GVN + GameLand; ngưỡng/lương là TÁI DỰNG]

- Mỗi tàu do thám "làm việc" tiêu **lương NL nhỏ/giờ** trừ vào Nhiên Liệu đế quốc
  tại checkpoint bảo trì; thiếu qua một kỳ → `luongGD.phanBoi = true`.
- Phản bội: lần do thám kế tiếp của bạn vào bất kỳ ai bị lộ ngược — đối phương nhận
  báo cáo tình báo về đế quốc bạn (mức 2) + tin cảnh báo; tàu do thám bị bắt 50%.
- Trả đủ lương (nút trả ngay hoặc tự trừ kỳ sau) xoá cờ sau một kỳ sạch.
- Báo cáo do thám mức cao nhất thêm **sản lượng mỏ** [XÁC NHẬN báo cáo thấy mức sản xuất].

## Phase 4 — Ba chính thể liên minh

[XÁC NHẬN tên ba chính thể từ GVN; toàn bộ cơ chế phiếu là TÁI DỰNG vì nguồn không mô tả]

`lm.chinhThe ∈ docTai | danChu | congHoa`, chọn lúc lập LM; LM cũ migrate về `docTai`.
(Tên giá trị giữ camelCase ngắn cho khớp phong cách id hiện có trong code.)

- **Độc tài**: hành vi hiện tại giữ nguyên — chủ duyệt/loại/tuyên chiến/chuyển quyền trực tiếp.
- **Dân chủ**: đa số đơn giản toàn thành viên, hạn phiếu 24 giờ. Có phiếu: tuyên chiến,
  duyệt/từ chối đơn, loại thành viên, bầu chủ kỳ 14 ngày (ứng viên ra tranh, nhiều phiếu
  hơn chủ đương nhiệm thì đổi chủ).
- **Cộng hoà**: như Dân chủ nhưng chỉ **đại biểu = top 5 điểm** được bầu; đại biểu tái tính mỗi kỳ.

Bảng `lm_phieu` dùng chung; đủ đa số hoặc hết hạn → server thực thi kết quả bằng
chính luồng nội bộ hiện có (gọi lại path `/api/lmduyet`… trong unit-of-work).
Chủ Độc tài bỏ qua bảng phiếu. Phiếu tuyên chiến đạt → mới được đặt lệnh `chien`.

## Testing

Mở rộng khuôn hiện có, không framework mới:

- `tools/smoke.js` (test:luat): lãi ngân hàng đúng dải; đơn chợ trừ/khoá tài sản
  đúng thứ tự; hệ số địa hình nhân đúng lớp; phiếu đạt đa số thực thi đúng;
  phản bội kích hoạt đúng ngưỡng; giao hàng 6h tới hạn đúng.
- `tools/test-server.js` (test:server): chợ chéo hai đế quốc qua bảng `cho`; phiếu
  LM với hai tài khoản thật; migration v6→v7 giữ save; NPC siêu thị hồi hàng;
  restart server mất dữ liệu chợ đang mở không crash.
- Sau mỗi phase: `npm test` xanh + `npm run build` bundle artifact không vỡ.

## Error handling

Mọi hành động mới qua validation chuẩn `soDuong/chuoi/tdParse`, id phải tồn tại
trong bảng dữ liệu; lỗi trả `{loi}`; mutation chéo đế quốc bọc unit-of-work SQLite
như PvP hiện tại; migration rollback sạch; client cũ gửi payload thiếu trường mới
→ engine dùng default, không crash.

## Không thuộc phạm vi (YAGNI)

Đơn vị tàng hình/robot trá hình · toạ độ 4 phần · nạp tiền thật/Uranium mua bằng
tiền · bất tín nhiệm · nhiều server liên thông · giao diện 3D Blue tái tạo screenshot
· chat tự dịch · Hội Đồng Bảo An như tổ chức chơi được.
