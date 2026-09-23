# Mindmap review — Phase 1–2 Command Workbench

Ngày: 2026-08-26 · Phạm vi: token, visual foundation, app shell và IA năm
workspace · Trạng thái: code/contract/build đạt; visual browser đang chờ.

```mermaid
mindmap
  root((THĐC · P1–P2))
    HuongThietKe[70 / 20 / 10]
      CommandCenter[70% Command Center]
      Operations[20% Operations Console]
      Atmosphere[10% cinematic restraint]
    Phase1[Phase 1 · Nền visual]
      Tokens[64 semantic tokens]
      Type[16px body · 14px dense · 12px label]
      Contrast[Text và control contrast đạt tính toán]
      Restraint[Không action gradient · glow · pulse]
      Build[Tokens inline trước legacy CSS]
    Phase2[Phase 2 · Shell và IA]
      Registry[18 canonical destinations]
        Solo[15 solo]
        Multiplayer[17 multiplayer]
      Workspaces[5 workspaces]
        ChiHuy[Chỉ huy]
        PhatTrien[Phát triển]
        TacChien[Tác chiến]
        LienMinh[Liên minh]
        HeThong[Hệ thống]
      Navigation[Unified navigation]
        Desktop[Desktop rail + secondary nav]
        Compact[Compact active-label rail]
        Mobile[Mobile bottom nav + sheet]
        Palette[Đi tới + Ctrl/Cmd+K]
      Stability[Stable interaction contract]
        Focus[Giữ value · selection · focus khi sync]
        Preload[MP preload theo metadata]
        Semantics[Button · ARIA · one h1]
    Evidence[Bằng chứng]
      Contracts[96 UI contracts]
      Game[241 game assertions]
      Server[333 server assertions]
      Dist[2 standalone builds]
      Integrity[Server hashes giữ nguyên]
    Pending[Chưa xác nhận]
      Browser[Playwright chưa có trong môi trường]
      Viewports[Chưa có ảnh 1440 · 960 · 414 · 320 mới]
      Input[Chưa walkthrough mouse + keyboard thật]
    Next[Phase 3]
      Alerts[Alert presentation model]
      Strip[Situation Strip]
      Overview[Tổng Quan task-first]
      GateB[Gate B chỉ mở sau 3 prototype]
```

## Evidence ledger

| Hạng mục | Kết quả |
|---|---|
| `npm test` | 96 UI contracts + 241 luật game + 333 server assertions đạt |
| Syntax | `js/ui.js`, `js/app.js`, `js/main.js`, `web/js/mp.js`, test và build scripts đạt |
| Build | `dist/thien-ha-dai-chien.html` và `dist/artifact.html` sinh lại thành công |
| Server ngoài scope | `server/api.js` và `server/index.js` giữ đúng hash baseline |
| Browser-native | Chưa chạy: thiếu Playwright (`ERR_MODULE_NOT_FOUND`) |

## Điểm review

- Phase 1–2 đã đủ bằng chứng để tiếp tục phát triển code sang Phase 3.
- Chưa dùng kết quả structural test thay cho bằng chứng layout, mouse hoặc
  keyboard thật.
- Gate B chưa mở: cần hoàn thiện Tổng Quan, Thiên Hà và Tài Nguyên rồi chụp bốn
  viewport theo plan trước khi nhân rộng migration qua toàn bộ page family.

Liên kết: [implementation plan](../plans/2026-08-25-trung-tam-chi-huy-hybrid.md) ·
[UX/IA spec](../specs/2026-08-25-trung-tam-chi-huy-hybrid-design.md) ·
[mindmap định hướng Gate A](2026-08-25-trung-tam-chi-huy-review.html).
