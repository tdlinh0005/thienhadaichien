# Thiết kế bộ lập lịch sự kiện bền vững

**Ngày:** 2026-08-23
**Trạng thái:** Hướng thiết kế đã phê duyệt; đặc tả chi tiết chờ duyệt cuối
**Phạm vi:** máy chủ mô phỏng Node.js và SQLite; không thay đổi luật chơi hay giao diện trong tài liệu này.

## 1. Mục tiêu và không-mục-tiêu

Mục tiêu là thay cơ chế process timer/quét `dq.keTiep` hiện tại bằng một hàng đợi SQLite dùng chung cho wake record authoritative và sự kiện liên tài khoản, tồn tại qua khởi động lại máy chủ. Deadline/domain payload vốn nằm trong `dq.state` vẫn là dữ liệu game canonical. Mọi chuyển đổi trạng thái mô phỏng authoritative chỉ đi qua một writer sở hữu lease; vì vậy một sự kiện chỉ có thể được áp dụng một lần theo thứ tự thời gian xác định. Thiết kế phải sửa tính đúng lịch sử PvP, giới hạn một lượt `G.tick` ở 50.000 sự kiện, ngăn một job độc làm tắc hàng, cho phép retry/backoff/quarantine, và phơi bày đủ readiness, health và metrics để vận hành an toàn.

Hệ thống tiếp tục dùng Node core và SQLite qua `node:sqlite`; không thêm dependency runtime, daemon hàng đợi, Redis, dịch vụ đám mây hay worker process. Runtime tối thiểu là Node.js 22.5, theo hợp đồng runtime hiện tại của dự án. SQLite được lưu cùng dữ liệu máy chủ.

Không-mục-tiêu:

- Không phân phối writer theo cụm, không có active-active, không có sharding hay đúng-một-lần xuyên nhiều máy.
- Không thay luật combat, công thức phần thưởng, giao thức client hiện hữu, hay tự động chạy job do quản trị viên tạo tùy ý.
- Cleanup, heartbeat, và wake-up timer không mang deadline game authoritative có thể tiếp tục là process timer; chúng không được dùng để quyết định hoặc áp dụng kết quả gameplay.
- Không ghi payload người chơi, token, chat, tên hiển thị hoặc thông số chiến đấu chi tiết vào metrics/log ngoài mã định danh đã băm/rút gọn theo chính sách ở mục 12.
- Không hứa xử lý “thời gian thực” từng mili-giây; độ trễ wake-up được đo và cảnh báo, còn ngữ nghĩa game luôn dựa trên timestamp hiệu lực của sự kiện.

## 2. Bất biến hệ thống

1. Một database có tối đa một **writer lease** còn hạn tại một thời điểm. Chỉ lease holder được lấy và chuyển trạng thái job, chạy gameplay command, gọi `advanceTo`, hoặc ghi bất kỳ dữ liệu game nào.
2. Claim/retry metadata có thể commit riêng, nhưng effect game, projection, successor job, immutable application record và chuyển `COMPLETED` luôn xảy ra trong cùng một outer `BEGIN IMMEDIATE`. Nếu transaction effect thất bại, toàn bộ effect cùng không có hiệu lực; không có transaction lồng nhau và không có `await` bên trong.
3. Mỗi job có `idempotency_key` bất biến và duy nhất. Xử lý lại cùng key không tạo thêm hiệu ứng; ghi nhận đã áp dụng dựa trên khóa này trong transaction.
4. Thứ tự claim toàn cục là `(eligible_at_ms ASC, priority ASC, sequence ASC, id ASC)`, trong đó pending dùng `scheduled_at_s * 1000`, retry dùng `retry_at_ms`. `sequence` là số nguyên tăng đơn điệu được cấp trong transaction tạo job; `id` chỉ là tie-break cuối. Watermark interaction vẫn dùng `scheduled_at_s` gốc, không dùng thời điểm retry.
5. Job game được áp dụng tại `effective_at_s = scheduled_at_s`, không phải thời điểm CPU thực sự xử lý. Engine tiếp tục dùng Unix epoch **giây** qua `st.lastTick`/`st.now`; không tạo `G.nowMs` và không đổi save hiện hữu sang mili-giây trong công việc này.
6. PvP chỉ tạo snapshot bất biến tại arrival timestamp `T`, sau global advance barrier; không được đọc state trước `T` hoặc state thay đổi sau `T` khi resolve.
7. Một lời gọi `advanceTo` xử lý nhiều nhất 50.000 job/game tick có hiệu lực. Cạn ngân sách là kết quả hợp lệ, không phải lỗi và không được tự động bỏ qua phần còn lại.
8. Job lỗi không được giữ lease mãi: nó rời `RUNNING` thành `RETRY_WAIT` hoặc `QUARANTINED` trong transaction khôi phục. Job quarantine không được tự động chạy lại.
9. Deadline/effective time gameplay dùng Unix epoch seconds UTC (`*_at_s`, `INTEGER`) để khớp `G.tick`, `den_t`, `lastTick`, `keTiep`, `hamdang` và `hamgiu`. Lease, retry, lock, duration quan sát và timestamp vận hành dùng epoch milliseconds (`*_at_ms`). Chuyển đổi duy nhất là `now_s = Math.floor(clock.nowMs() / 1000)`; sequence phân xử mọi event cùng giây, không round-trip giây ↔ mili-giây cho logic game.
10. `dq.state` là nguồn chân lý duy nhất của tài sản, fleet và queue nội bộ; `hamdang`/`hamgiu` chỉ là projection có thể dựng lại. `event_jobs` sở hữu lịch chạy/idempotency, không chứa bản sao tài sản và không tạo đường kích hoạt thứ hai cho cùng deadline.

## 3. Thành phần và luồng dữ liệu

`SchedulerStore` là lớp SQLite duy nhất đọc/ghi các bảng scheduler. `SchedulerWriter` sở hữu lease, wake-up timer, vòng drain và `MutationGate`. Mọi endpoint ghi — gồm gameplay, account/session, chat, alliance và cleanup có mutation — phải qua `MutationGate.runCommand`; process standby hoặc draining từ chối trước khi đụng DB. GET cần state đã tua cũng đi qua gate; GET thuần đọc không được tự gọi `G.tick`. `GameAdvanceService` là nơi duy nhất được phép gọi `G.tick`; `EventReducer` dispatch theo `kind`, xác thực stable reference/revision, tạo snapshot tại thời điểm hiệu lực và stage mutation vào Unit-of-Work do writer sở hữu.

Trong multiplayer durable mode có hai lớp job, với đúng một owner cho mỗi deadline:

- `ACCOUNT_ADVANCE` là wake record bền cho local deadline gần nhất của một đế quốc. Payload chỉ giữ account ID và revision; event/domain payload vẫn ở `dq.state`. Engine thêm classifier chi tiết nhưng giữ `G.sukienKe` numeric cho caller cũ: factory server chỉ tạo successor từ deadline `local`, không tạo wake thứ hai cho deadline đã được phân loại `external`.
- Các tương tác liên tài khoản (`PVP_RESOLVE` và những hook transport/espionage/missile cần state nhiều chủ) có job explicit với stable internal reference. Fleet/tài sản vẫn ở `dq.state`; server-side tick gặp deadline này trả control-flow `BLOCKED_EXTERNAL(ref, atS)` nếu không chạy dưới reducer của đúng job, tuyệt đối không tự resolve hoặc đổi timestamp. `BLOCKED_EXTERNAL` không phải failure: không tăng attempt/retry. `ACCOUNT_ADVANCE` được phép commit local progress tới cùng giây rồi hoàn tất; nếu không còn local event, nó không tạo successor cho external ref. Reducer explicit truyền đúng `allowExternalRef` sau khi đã xử lý local prelude. Solo tiếp tục dùng facade `G.tick` với state local và không cần SQLite queue.

Migration thêm `dq.revision INTEGER NOT NULL DEFAULT 0`; mọi save authoritative tăng revision đúng một lần trong outer transaction. `ACCOUNT_ADVANCE` dùng revision đó để phát hiện wake cũ. Job liên tài khoản không stale chỉ vì player revision đổi trước `T`; reducer xác minh stable fleet/match reference và điều kiện nghiệp vụ tại `T`.

Luồng bình thường:

1. `MutationGate` trước tiên drain mọi global barrier có `scheduled_at_s <= now_s`, rồi mới chạy command người chơi; vì thế request tới ở hoặc sau `T` không thể chen một mutation “trước T”. Command tạo/cancel/reconcile event cùng transaction với state nguồn qua `SchedulerStore`.
2. Writer đang có lease đọc job eligible theo thứ tự bất biến, atomically claim một job với `locked_by` và `locked_until_ms`.
3. Writer gọi global advance barrier tại `job.scheduled_at_s` với phần ngân sách còn lại; barrier không cho bất cứ account nào vượt thời điểm một game event liên tài khoản đang chờ.
4. Trong một outer Unit-of-Work, reducer kiểm tra lease generation, stage game/projection, ghi snapshot/application, cập nhật revision và chuyển job `COMPLETED`; nếu reducer tạo event kế tiếp, event đó nhận `sequence` mới trong transaction này.
5. Writer tiếp tục tới khi hết job đến hạn, đến wake-up kế tiếp, lease mất, hoặc đã dùng đủ 50.000 tick.

Wake-up luôn đặt ở `min(next_eligible_at_ms, clock.nowMs() + scheduler_poll_ms)`. Poll là cơ chế an toàn khi thông báo nội bộ bị mất, không phải nguồn chân lý.

## 4. Dữ liệu SQLite và vòng đời job

Các bảng scheduler nằm trong đúng database hiện hữu được chọn bởi `THDC_DB`, mặc định `server/data/thdc.db`; chúng không có file database riêng. Việc này giữ mutation game và scheduler trong một transaction SQLite nguyên tử. Kết nối writer bật `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout` hữu hạn và chạy migrations trước khi nhận traffic.

### 4.1 Bảng

```sql
CREATE TABLE scheduler_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE scheduler_lease (
  lease_name TEXT PRIMARY KEY CHECK (lease_name = 'global-writer'),
  owner_id TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  heartbeat_at_ms INTEGER NOT NULL,
  generation INTEGER NOT NULL
);

CREATE TABLE event_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  scheduled_at_s INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  sequence INTEGER NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN
    ('PENDING','RUNNING','RETRY_WAIT','COMPLETED','CANCELLED','QUARANTINED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  expected_revision INTEGER,
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  retry_at_ms INTEGER,
  locked_by TEXT,
  locked_until_ms INTEGER,
  completed_at_ms INTEGER,
  cancelled_at_ms INTEGER,
  cancel_reason TEXT,
  quarantined_at_ms INTEGER,
  error_code TEXT,
  error_message_safe TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  CHECK (attempt >= 0 AND max_attempts >= 1)
);

CREATE INDEX event_jobs_due_idx
  ON event_jobs(state, scheduled_at_s, priority, sequence, id);
CREATE INDEX event_jobs_retry_idx
  ON event_jobs(state, retry_at_ms, priority, sequence, id);
CREATE INDEX event_jobs_aggregate_idx
  ON event_jobs(aggregate_type, aggregate_id, state);

CREATE TABLE event_applications (
  idempotency_key TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES event_jobs(id),
  effective_at_s INTEGER NOT NULL,
  applied_at_ms INTEGER NOT NULL,
  snapshot_json TEXT,
  snapshot_sha256 TEXT,
  result_json TEXT NOT NULL
);
```

`payload_json` là schema-versioned, canonical JSON được stringify với thứ tự key cố định; `payload_sha256` phát hiện corruption hoặc thay payload dưới cùng idempotency key. Nó không được sửa sau insert và không chứa inventory/fleet snapshot. `snapshot_json` chỉ dùng cho reducer cần lát cắt bất biến như PvP, được tạo tại `effective_at_s`, canonicalize rồi hash; nó không được log hoặc trả qua API. `scheduler_meta.sequence` giữ bộ đếm sequence; tăng và insert job phải nằm trong một `BEGIN IMMEDIATE` transaction.

Migration cùng đợt thêm `dq.revision`. `hamdang` và `hamgiu` không nhận JSON gameplay mới: chúng tiếp tục được xóa/dựng lại từ `dq.state` trong cùng Unit-of-Work sau khi ghi toàn bộ state. `event_jobs` không thay thế canonical state; nó chỉ đánh thức `ACCOUNT_ADVANCE` hoặc điều phối một stable external interaction.

### 4.2 Trạng thái và chuyển đổi

`PENDING` là job chưa đến hạn; `RETRY_WAIT` là job đợi `retry_at_ms`; `RUNNING` chỉ tồn tại khi lease holder đang xử lý; `COMPLETED`, `CANCELLED`, `QUARANTINED` là trạng thái lưu trữ terminal của job. Claim chỉ chấp nhận `PENDING` với `scheduled_at_s <= now_s` hoặc `RETRY_WAIT` với `retry_at_ms <= now_ms`; câu lệnh claim phải kiểm tra `locked_until_ms IS NULL OR locked_until_ms < now_ms` và đổi thành `RUNNING` trong cùng transaction.

Claim định nghĩa `eligible_at_ms = retry_at_ms` cho `RETRY_WAIT`, ngược lại là `scheduled_at_s * 1000`. Một CTE/statement atomic chọn theo `(eligible_at_ms ASC, priority ASC, sequence ASC, id ASC)` rồi claim; không ghép hai query có thể đảo thứ tự. Barrier watermark là khái niệm riêng: nó lấy `MIN(scheduled_at_s)` của interaction liên tài khoản chưa được resolve, kể cả đang `RETRY_WAIT` hoặc `QUARANTINED`, nên backoff không cho world vượt mốc hiệu lực gốc.

Khi có watermark `T`, claim gameplay tạm loại job có `scheduled_at_s > T`; các job đó không được claim rồi quay vòng chỉ để bị clamp. Writer vẫn được xử lý job gameplay `<= T` và maintenance không advance world. Khi interaction tại `T` resolve/invalidate hợp lệ, claim window mới mở sang timestamp tiếp theo.

Khi khởi động hoặc mỗi vòng poll, writer phục hồi `RUNNING` có `locked_until_ms < now_ms`: tăng `attempt` một lần, rồi chuyển `RETRY_WAIT` hoặc `QUARANTINED`. Không có đường chuyển terminal về trạng thái chạy. Cancel chỉ cho phép từ `PENDING`/`RETRY_WAIT`; cancel `RUNNING` trả xung đột và chờ job kết thúc, cancel terminal trả kết quả idempotent hiện trạng.

Reducer chèn `event_applications`, mutation game/projection và chuyển `COMPLETED` trong cùng outer Unit-of-Work. `INSERT ... ON CONFLICT DO NOTHING` là hàng rào idempotency cuối: nếu conflict, reducer đọc record đã commit và không áp dụng mutation lần nữa. Do đó crash trước commit không để lại effect/application/completion nào; crash sau commit chỉ tạo lần xử lý lặp vô hại. Claim `RUNNING` đã commit trước effect được recovery theo lease, nhưng không bao giờ được coi là bằng chứng rằng gameplay đã áp dụng.

## 5. Tạo, hủy và đối soát event

Mỗi kiểu event có hàm factory nhận `aggregate`, `expectedRevision` (nullable), `scheduledAtS`, `payload` và `idempotencyKey`. Factory từ chối `scheduledAtS` không phải số nguyên an toàn, payload không khớp schema, hoặc key đã tồn tại với hash khác. Nếu key đã tồn tại với hash giống, nó trả job hiện hữu; không tạo bản sao. Key chuẩn là `<kind>:<aggregate_type>:<aggregate_id>:<revision-or-ref>:<purpose>` và không chứa PII.

Tạo event và thay đổi aggregate nguồn xảy ra trong một transaction. `ACCOUNT_ADVANCE` luôn mang `expected_revision=dq.revision`; revision lệch là wake cũ, được `CANCELLED` với `cancel_reason='STALE_REVISION'` và transaction save hiện hành phải đã tạo successor. Job interaction liên tài khoản để `expected_revision` null, dùng stable reference gồm owner account, fleet ID, launch timestamp, target và effective timestamp; player revision thay đổi trước `T` không làm event stale. Reconcile dùng revision đặc biệt `-1` và chỉ tiến trình startup có lease được tạo. Không dùng timestamp cập nhật theo giây như một revision giả.

Lệnh cancel cần `id` hoặc idempotency key, actor authorization và `reason` thuộc enum `SUPERSEDED`, `ENTITY_REMOVED`, `STALE_REVISION`, `OPERATOR_CANCELLED`. `OPERATOR_CANCELLED` chỉ dùng cho local/reconcile job chưa effect; interaction global chỉ được giải phóng bằng reducer invalidation nghiệp vụ hoặc lệnh CLI resolve có audit, không bằng cancel tùy ý. Lệnh không xóa hàng để duy trì audit và idempotency.

Đối soát chạy sau khi writer nhận lease, rồi mỗi `SCHEDULER_RECONCILE_INTERVAL_MS`. Nó quét `dq.state` canonical theo trang account ID ổn định, dựng đúng một `ACCOUNT_ADVANCE` cho `dq.keTiep`/revision và các interaction explicit còn sống, chèn thiếu bằng factory idempotent rồi cancel job không còn được stable reference trỏ tới. Một page phải commit trước khi sang page tiếp theo; đối soát bị dừng tiếp tục ở checkpoint `scheduler_meta.reconcile_cursor`. Không sửa payload/application lịch sử và không dùng `hamdang`/`hamgiu` làm nguồn canonical.

## 6. PvP đúng lịch sử, global barrier và `advanceTo`

Khi PvP bắt đầu tại `started_at_s`, transaction lưu fleet nguồn trong `dq.state` và tạo job `PVP_RESOLVE` với `scheduled_at_s = arrival_at_s = started_at_s + duration_s`, `matchId` tất định từ stable fleet reference, internal ID của attacker/defender, quy tắc chọn supporters và idempotency key `pvp-resolve:<matchId>:<arrival_at_s>`. Player revision thay đổi trước `T` không làm job stale. Payload không snapshot defender hoặc supporters, không đóng băng chỉ số combat lúc launch, và không chứa tên, email, token hoặc dữ liệu chat.

Tại giây đến `T`, writer dựng **global advance barrier** cho job liên tài khoản sớm nhất. Barrier giữ mọi `st.lastTick <= T`: trước khi bất kỳ account nào được local advance qua `T`, nó (a) quét `dq.state` canonical theo account/fleet ID để tìm mọi fleet có thể liên quan target và `T`, (b) advance các state ứng viên đúng đến `T`, rebuild projection và quét canonical lại tới fixed point, (c) kiểm tra eligibility tại chính `T`, rồi (d) tạo `combat_snapshot` bất biến từ state vừa đạt `T`. `hamdang`/`hamgiu` chỉ là optimization và cross-check; projection thiếu không được làm mất supporter, mà phải được sửa từ canonical state trong Unit-of-Work.

Snapshot gồm schema version, match ID, internal IDs, revision tại `T`, stats/trang bị và deterministic seed. Sau khi giữ writer lease nhưng trước recovery/readiness, process tạo đúng một `combat_seed_key_v1` bằng `crypto.randomBytes`, `INSERT ... ON CONFLICT DO NOTHING` trong `BEGIN IMMEDIATE`, rồi đọc lại/validate key thắng; standby không được khởi tạo key. Key lưu hex trong `cauhinh` và không rotate trong schema v1; seed 32-bit được lấy theo endian đã test từ `HMAC-SHA-256(key, matchId|arrival_at_s|schemaVersion)`. Resolver luôn nhận seed này, không được fallback `Date.now()`/`Math.random()`. Snapshot canonical, hash, result và mọi state hậu trận commit cùng `event_applications`; nếu transaction rollback, retry dựng lại cùng snapshot từ state chưa đổi. Do đó thay đổi trước `T` được tính, còn mutation người chơi đến sau khi writer đã drain barrier `T` không thể ảnh hưởng trận.

Barrier là global, không chỉ khoá người tham gia đã biết: khi có interaction liên tài khoản sớm nhất tại `T`, scheduler không cho local event của bất kỳ account nào advance qua `T` trước khi job đó được resolve hoặc bị hủy bởi một lý do nghiệp vụ xác định. Local event của các participant tới hạn trước hoặc đúng `T` được xử lý trước snapshot theo thứ tự engine hiện hữu; job global cùng giây theo `(priority, sequence, id)`. Event sau `T` chờ. `RETRY_WAIT` và `QUARANTINED` vẫn giữ watermark tại `T`; chúng không giải phóng barrier chỉ vì là trạng thái terminal lưu trữ.

Sau resolution, mọi record gameplay/audit (`tran.khi`, bulletin, message, loot/debris, cooldown và job kế tiếp) nhận effective time `T`; wall clock milliseconds chỉ dùng cho observability. Cooldown/job kế tiếp dùng `T + duration_s`, không dùng clock hiện tại. Nếu match/participant đã bị xóa hoặc không còn hợp lệ theo state tại `T`, reducer trả kết quả nghiệp vụ xác định `MATCH_INVALIDATED`, ghi application/audit và mới được giải phóng barrier; nó không đọc state sau `T` để đổi kết quả quá khứ.

Đường horizon/latest-state rebase hiện tại trong `server/world.js` bị thay thế hoàn toàn: không được dời `f.den_t` lên request horizon hoặc `max(lastTick)` vì backlog. Nếu phát hiện bất kỳ participant nào đã vượt `T`, đó là invariant violation: rollback, quarantine interaction, readiness 503 và giữ barrier để vận hành xử lý; tuyệt đối không đánh trận ở timestamp mới.

Hợp đồng chính xác của `advanceTo(targetS, budget)`:

```ts
type AdvanceResult = {
  processed: number;
  advancedToS: number;
  nextDueAtS: number | null;
  hasMoreDue: boolean;
  budgetExhausted: boolean;
};
```

`budget` phải là số nguyên từ 1 đến 50.000; caller scheduler truyền một `options.remainingBudget` dùng chung xuyên mọi `G.tick` trong cùng drain/barrier, không cấp lại 50.000 cho từng account. Hàm xử lý tối đa quota game event có `effective_at_s <= targetS`. Với job liên tài khoản tại `T`, các local event cần để dựng barrier/snapshot cũng tiêu thụ cùng counter. Mỗi state chỉ tăng `st.lastTick`/`st.now` tới event vừa xử lý và không vượt earliest global barrier. Nếu không còn event đến hạn/barrier trước `targetS`, state đang advance mới được tăng thẳng tới `targetS`.

Khi hết budget, hàm dừng sau phần tử cuối, trả `budgetExhausted=true`, `hasMoreDue=true`, `advancedToS` bằng giây hiệu lực cuối và **không** gán `lastTick/now=targetS`. Event còn lại cùng giây vẫn phải chạy ở batch sau dù `lastTick === targetS`; engine dựa vào `nextDueAtS <= targetS`, không chỉ điều kiện `lastTick < targetS`. Writer commit partial state cùng successor `ACCOUNT_ADVANCE`, rồi reschedule batch qua `setImmediate` và renew lease giữa các batch. Không reducer nào được gọi ngoài job đã claim/MutationGate.

`G.tick(st, targetS, options)` giữ tên/signature hai tham số tương thích và trả thêm `AdvanceResult`; caller cũ có thể bỏ qua kết quả. Guard cứng `if (processedThisAdvance >= 50_000) return partial` tồn tại ở lớp game lẫn writer để sai sót caller không thể vượt giới hạn. Solo/UI thấy partial phải tiếp tục bằng một lượt event-loop sau, không spin đồng bộ. Job tự sinh thêm job cùng timestamp nhận `sequence` mới, xếp sau event đã tồn tại và chịu phần ngân sách còn lại.

## 7. Công bằng, retry và quarantine

FIFO theo `(eligible_at_ms, priority, sequence, id)` áp dụng cho mọi job đã eligible. `priority` chỉ là giá trị cố định theo `kind`, được ghi lúc tạo (ví dụ `PVP_RESOLVE=50`, `ACCOUNT_ADVANCE=100`, reconcile `200`); không có API nâng ưu tiên runtime. Retry bị dời tới `retry_at_ms`, vì thế một job local độc không chặn job độc lập tới hạn sau nó. Riêng interaction global vẫn giữ barrier ở `scheduled_at_s` trong lúc backoff; writer có thể xử lý job khác không vượt watermark nhưng không được phá lịch sử để tăng throughput.

Các lỗi được phân loại trước khi transaction kết thúc:

- Lỗi nghiệp vụ xác định (`STALE_REVISION`, stable entity không còn tồn tại/không còn hợp lệ tại `T`) ghi application với mã allowlist rồi chuyển `CANCELLED`, không retry; đây là resolution hợp lệ nên được giải phóng barrier.
- Lỗi transient SQLite busy/IO, lỗi process tạm thời, hoặc dependency nội bộ timeout chuyển `RETRY_WAIT`.
- Payload/snapshot hash hoặc schema sai, participant đã vượt barrier, invariant hỏng, exception không phân loại, hoặc cạn `max_attempts` chuyển `QUARANTINED`.

Backoff là `min(SCHEDULER_RETRY_MAX_MS, SCHEDULER_RETRY_BASE_MS * 2^(attempt - 1)) + deterministicJitter(job.id, attempt, 0..999)`. `attempt` tăng đúng một lần cho mỗi failure/recovery từ lease hết hạn. Mặc định `base=1.000`, `max=300.000`, `max_attempts=8`; các giá trị có thể cấu hình trong giới hạn mục 12. Quarantine giữ job và lỗi đã làm sạch, tăng metric, ghi log cảnh báo một lần và làm readiness fail nếu số quarantine vượt ngưỡng.

Chỉ `tools/scheduler-cli.js` chạy local dưới service user được inspect/replay/resolve quarantine, luôn ghi audit. Replay tạo **job mới** với key `manual-replay:<old-id>:<nonce>`, giữ `scheduled_at_s` và stable aggregate reference; payload chỉ được sao chép sau khi hash/schema đã hợp lệ. Job cũ vẫn `QUARANTINED`, nhưng barrier gắn với aggregate unresolved, nên chỉ application nghiệp vụ thành công của replay hoặc quyết định invalidation explicit có reason allowlist mới giải phóng nó. MVP không có endpoint HTTP cho thao tác này.

## 8. Writer, lease, startup và shutdown

`owner_id` là UUID process-instance tạo khi boot, không phải PID. Acquire lease dùng `BEGIN IMMEDIATE`: insert hàng lease nếu chưa có, hoặc update chỉ khi `expires_at_ms < now_ms`; mỗi thành công tăng `generation`. Heartbeat gia hạn mỗi `SCHEDULER_LEASE_MS / 3` và update có điều kiện `owner_id` cùng `generation`; số row update khác 1 nghĩa là lease đã mất. Mặc định lease là 15.000 ms, poll 1.000 ms, nên một process bị pause không được coi là owner sau 15 giây. Writer nhận `clock` từ `taoUngDung`; chỉ adapter production gọi `Date.now()`.

`SchedulerWriter.start()` điều khiển acquire/standby/recovery và chỉ bắt đầu drain sau khi giữ lease. Process không có lease vẫn mở ba endpoint quan sát, nhưng `/readyz` là 503 và toàn bộ gameplay `/api/*` — kể cả GET có thể tick hay ghi session timestamp — bị từ chối trước DB mutation. Trong triển khai single-process bình thường, điều này biến restart chồng lấn thành standby an toàn.

Startup theo thứ tự bắt buộc:

1. Mở SQLite, bật pragma, kiểm tra backup/migration và schema version tương thích.
2. Bind HTTP listener ở trạng thái `recovering`; `/healthz` hoạt động, `/readyz` và gameplay API trả 503 reason an toàn.
3. Thử acquire `global-writer`; nếu chưa được, chuyển `standby` và thử lại theo poll trong khi listener vẫn chỉ phục vụ observability.
4. Khi có lease: khởi tạo/đọc `combat_seed_key_v1` nguyên tử, recover expired `RUNNING`, thực hiện reconcile checkpointed, rồi tính backlog/oldest due.
5. Chuyển `ready` khi migration/recovery xong, lease còn hợp lệ và backlog/quarantine dưới ngưỡng; drain overdue theo batch 50.000 qua `setImmediate`, không chạy vòng synchronous vô hạn trước khi event loop nhận kết nối.

Shutdown SIGTERM/SIGINT: chuyển `draining`, trả readiness 503, ngừng admission gameplay, gọi `server.close(callback)` để ngừng nhận kết nối mới, hủy wake-up, rồi chờ **cả** callback/đếm request in-flight về 0 và outer Unit-of-Work kết thúc trong `SCHEDULER_SHUTDOWN_GRACE_MS` (mặc định 10.000). Sau đó release lease có điều kiện owner/generation và mới đóng database. Nếu hết grace, rollback UoW chưa commit, hủy socket còn mở theo policy server, đóng DB, đặt exit code và để lease expiry/recovery quy định xử lý lại. Không được đánh dấu `COMPLETED` trước khi game mutation commit.

## 9. Migration, cutover và rollback

Migration có số phiên bản tăng đơn điệu trong `scheduler_meta.schema_version` và chạy trong transaction riêng, idempotent. Trước cutover phải tạo bản backup SQLite nhất quán; migration schema được serialize bằng `BEGIN IMMEDIATE` và chỉ tạo bảng/index scheduler, `dq.revision`, lease row cùng feature flag deterministic `scheduler_mode='legacy'`. Random seed và backfill mutable không chạy trước lease; `combat_seed_key_v1` được holder khởi tạo theo mục 6/8. Deadline state/DB tiếp tục là giây; chỉ metadata lease/retry/audit vận hành dùng mili-giây.

Cutover thực hiện một lần trong maintenance window:

1. Dừng admission mutation cũ, chờ Unit-of-Work đang chạy kết thúc và lấy snapshot `dq.state` nhất quán.
2. Gán revision ban đầu, đọc mỗi `dq.keTiep`/event tương lai từ `dq.state`, tạo `ACCOUNT_ADVANCE` và interaction job idempotent theo stable identity, rồi rebuild/validate `hamdang`/`hamgiu` từ state canonical. Hệ thống hiện tại không có legacy timer ID, match row hoặc application record độc lập; import không được bịa snapshot quá khứ hay nhân đôi tài sản sang job.
3. Xác nhận mỗi deadline multiplayer có đúng một đường chạy: local qua `ACCOUNT_ADVANCE`, interaction qua explicit reducer; server-side hook cũ không còn tự resolve interaction. Ghi `scheduler_mode='durable'` cùng checkpoint import trong transaction cuối.
4. Start writer. Event tương lai giữ `scheduled_at_s` gốc. Event overdue chưa resolve không thể tái dựng past state, nên được resolve một lần tại `cutover_at_s` bằng latest state đang có và audit bắt buộc `recovered-latest-state`; job/application lưu cả timestamp gốc lẫn timestamp recovery, không tuyên bố đã resolve đúng lịch sử.

Rollback chỉ hợp lệ trước khi mode durable xử lý một job: đặt lại `scheduler_mode='legacy'`, xóa các job import chưa chạy và tái kích hoạt đường xử lý `dq.state` từ snapshot. Sau job durable đầu tiên commit, rollback nhị phân **không được phép** vì có thể đảo thứ tự/nhân đôi hiệu ứng. Khi đó đường rollback an toàn là dừng service, khôi phục backup SQLite trước cutover, khởi động version cũ và chấp nhận mất mọi mutation sau thời điểm backup; runbook phải nêu rõ cửa sổ mất dữ liệu. Version cũ phải từ chối mở database có `schema_version` mới hơn thay vì cố đọc.

## 10. API và vận hành

MVP chỉ có ba endpoint quan sát dưới đây. Chúng không phơi payload raw, không có endpoint scheduler admin/cancel/replay và không yêu cầu giao diện game biết job state nội bộ.

| Endpoint | Mã thành công | Nội dung |
|---|---:|---|
| `GET /healthz` | 200 | Process còn chạy và event loop phản hồi; không phụ thuộc lease hay backlog. |
| `GET /readyz` | 200/503 | 200 chỉ khi DB mở, migrations xong, writer có lease, recovery xong, không shutdown, quarantine/backlog dưới ngưỡng. 503 trả các mã reason không PII. |
| `GET /metrics` | 200 | Prometheus text exposition, bị giới hạn bởi deployment hoặc reverse proxy; không thêm package. |

Biến môi trường và validation khởi động:

| Biến | Mặc định | Ràng buộc |
|---|---:|---|
| `THDC_DB` | `server/data/thdc.db` | database game+scheduler chung; không phải `:memory:` trong production |
| `SCHEDULER_LEASE_MS` | `15000` | 3000–60000 |
| `SCHEDULER_POLL_MS` | `1000` | 100–10000, nhỏ hơn lease/3 |
| `SCHEDULER_LOG_TICKS` | `0` | `0`/`1`; bật summary drain đã scrub, không log payload |
| `SCHEDULER_RETRY_BASE_MS` | `1000` | 100–60000 |
| `SCHEDULER_RETRY_MAX_MS` | `300000` | base–3600000 |
| `SCHEDULER_MAX_ATTEMPTS` | `8` | 1–20 |
| `SCHEDULER_MAX_QUARANTINED_READY` | `0` | 0–10000 |
| `SCHEDULER_MAX_BACKLOG_AGE_MS` | `60000` | 1000–3600000 |
| `SCHEDULER_SHUTDOWN_GRACE_MS` | `10000` | 1000–60000 |

Tương thích một release: nếu không có `SCHEDULER_POLL_MS`, giá trị legacy `THDC_NHIP` được validate rồi dùng làm poll; nếu không có `SCHEDULER_LOG_TICKS`, `THDC_AM=1` bật summary tương đương `scheduler.tick`. Biến mới luôn ưu tiên biến cũ; khi dùng alias, server log một deprecation warning đã scrub. Ở factory, precedence là `options.schedulerPollMs` → alias `options.tickMs` → env mới → env cũ → default. Không bỏ `THDC_NHIP`/`THDC_AM` trước major release hoặc migration note được duyệt.

Metrics tối thiểu: `scheduler_writer_lease_held` (0/1), `scheduler_jobs_pending`, `scheduler_jobs_retry_wait`, `scheduler_jobs_running`, `scheduler_jobs_quarantined`, `scheduler_due_backlog`, `scheduler_oldest_due_age_ms`, `scheduler_job_attempts_total{kind,outcome}`, `scheduler_job_duration_ms` histogram, `scheduler_advance_processed`, `scheduler_advance_budget_exhausted_total`, `scheduler_lease_acquire_total{outcome}`, `scheduler_reconcile_total{outcome}`, `scheduler_last_successful_drain_timestamp_ms`. Label `kind` lấy từ allowlist cố định; không có job id, account id hay error text làm label.

## 11. Xử lý sự cố

| Tình huống | Hành vi bắt buộc |
|---|---|
| Crash giữa claim và commit | Job còn `RUNNING`, lease hết hạn, owner sau recover và retry/quarantine theo attempt; mutation chưa commit hoặc application idempotent chặn lặp. |
| SQLite busy/locked | Retry bounded theo backoff; log mã `SQLITE_BUSY`; không spin và không drop job. |
| Disk full/corrupt DB | Dừng writer, readiness 503, giữ HTTP health; báo lỗi có action khôi phục backup, không tiếp tục mutation suy đoán. |
| Mất lease lúc drain | Dừng lấy job mới; transaction hiện tại chỉ commit nếu conditional lease check vẫn đúng, nếu không rollback; readiness 503. |
| Backlog vượt tuổi ngưỡng | Writer vẫn drain theo thứ tự, readiness 503, metric/alert tăng; không ưu tiên bằng cách phá thứ tự. |
| Poison job | Quarantine theo mục 7; job local không chặn aggregate độc lập, còn interaction global giữ barrier tại `scheduled_at_s` cho tới replay/invalidation có audit. |
| Payload bị sửa/hỏng | So hash/schema, quarantine mã `PAYLOAD_INTEGRITY`; không deserialise thực thi hay eval payload. |
| Clock lùi | `effectiveNowMs = max(last_effective_now_ms, clock.nowMs())`, rồi `now_s=floor(effectiveNowMs/1000)`; không giảm bất kỳ `st.lastTick`; log cảnh báo đã scrub. |

## 12. Bảo mật và quyền riêng tư

SQLite file và thư mục cha phải thuộc user service, mode tối đa `0600`/`0700`; process từ chối `THDC_DB` vượt allowlist deployment. Mọi SQL dùng prepared statements. `kind`, state, priority, payload schema và command reason đều allowlist; JSON parse có giới hạn kích thước 64 KiB/job và kiểm tra schema trước reducer. Không có code/function tên lấy từ payload.

`/metrics` chỉ dành cho mạng monitor theo giới hạn deployment/reverse proxy. CLI quarantine chỉ được chạy bởi user service vận hành và phải ghi audit local; không có role HTTP mới trong MVP. Nhật ký chỉ gồm `job_id` UUID rút gọn, kind allowlist, state, attempt, age và `error_code`; `error_message_safe` giới hạn 256 ký tự, scrub UUID account/tên/token/JSON payload trước ghi. Không log snapshot combat hoặc SQL statement chứa data. Bản backup chịu cùng chính sách mã hóa at-rest, retention và access audit như database game.

## 13. Tương thích

Game service chỉ dùng interface scheduler: `runCommand`, `schedule`, `cancel`, `reconcile`, `advanceTo`, `getStatus`; không được phụ thuộc bảng trực tiếp. Client API gameplay giữ nguyên response/contract; thay đổi observable duy nhất là completion lịch sử đúng hơn sau restart và transient 503/retry feedback khi writer chưa ready. Client không nhận hoặc phụ thuộc job state scheduler nội bộ.

Payload dùng `schemaVersion`; reducer phải đọc phiên bản hiện tại và đúng một phiên bản trước đó trong thời gian migration rolling. Migration payload luôn tạo job mới/canonical, không update payload đã applied. Node version dưới 22.5 bị fail-fast với thông báo runtime rõ ràng thay vì fallback dependency. `THDC_DB`, `THDC_PROXY` giữ nguyên; `THDC_NHIP`/`THDC_AM` dùng alias có precedence/deprecation theo mục 10 trong cửa sổ tương thích.

## 14. Tiêu chí chấp nhận và kiểm thử

1. Restart giữa mọi điểm fault-injection (trước claim, sau claim, sau application insert, sau game mutation, trước completion) không làm mất hoặc nhân đôi kết quả; `event_applications` có đúng một record/key.
2. Hai process trỏ cùng DB chỉ có một process có `scheduler_writer_lease_held=1`; standby không ghi game/job, takeover xảy ra sau expiry và generation thay đổi.
3. 50.001 event cùng giây trả partial sau đúng 50.000; `st.lastTick`/`st.now` không nhảy quá event cuối, batch sau xử lý event 50.001 dù cùng timestamp, và event loop vẫn phản hồi `/healthz`.
4. Job local độc retry tám lần theo backoff/jitter rồi quarantine; một job aggregate độc lập đến hạn sau nó vẫn hoàn tất. Interaction global poison giữ barrier/readiness 503 cho tới replay hoặc invalidation có audit.
5. Hai trận PvP cùng state tại arrival `T` cho cùng seed/snapshot và kết quả dù server restart hoặc backlog; thay đổi attacker/defender/supporter trước `T` được phản ánh, mutation admitted sau barrier `T` không phản ánh; application và mọi report ghi `effective_at_s=scheduled_at_s=T`.
6. Creation lặp cùng key/hash tạo một row; key cùng nhưng payload khác bị từ chối; cancellation lặp an toàn; revision stale tạo `CANCELLED` không retry.
7. Reconcile sau crash tạo thiếu đúng một lần, cancel orphan còn sống, tiếp tục từ checkpoint, và không động terminal job.
8. Cutover import event future canonical từ `dq.state`, rebuild/validate `hamdang`/`hamgiu`; event overdue unresolved được resolve tại cutover/latest state kèm audit `recovered-latest-state`; rollback trước job durable đầu tiên thành công, sau commit durable binary rollback bị chặn và runbook backup là đường khôi phục duy nhất.
9. `/healthz`, `/readyz`, `/metrics` phản ánh đúng mất lease, backlog, quarantine và shutdown; metrics/log snapshot không chứa PII, payload, job/account ID đầy đủ hay label cardinality không giới hạn.
10. Test chạy bằng Node built-in test runner và SQLite temp file; không thêm dependency runtime. Kiểm tra migration upgrade/downgrade compatibility, outer Unit-of-Work không nested transaction, SIGTERM grace, disk/SQLite lỗi mô phỏng, HMAC seed qua restart và property test thứ tự `(eligible_at_ms, priority, sequence, id)` cùng barrier theo `scheduled_at_s`.

## 15. Triển khai theo giai đoạn và quyền sở hữu song song

Các giai đoạn chỉ mở sau khi giai đoạn trước có test xanh; chủ sở hữu không cùng sửa file trong một giai đoạn. Tất cả thay đổi code dùng Node built-in test runner và review transaction boundary.

| Giai đoạn | Chủ sở hữu file độc quyền | Deliverable và cổng kiểm tra |
|---|---|---|
| 1. Nền SQLite/UoW | `server/db.js`, `server/scheduler/store.js`, `server/scheduler/migrations.js`, `tools/test-scheduler.js` | Schema, `dq.revision`, sequence, idempotency, lease, outer `BEGIN IMMEDIATE` và migration; test crash/nested transaction. |
| 2. Tiến trình writer | `server/scheduler/writer.js`, `server/scheduler/advance-service.js`, `tools/test-scheduler.js` | MutationGate, claim, global barrier, budget 50k, wake-up, retry/quarantine, startup/shutdown. |
| 3. Reducer game | `js/fleet.js`, `server/world.js`, `server/scheduler/reducers.js`, `tools/test-tai.js` | PvP snapshot tại arrival `T`, revision và reducer transactional; không sửa store/writer. |
| 4. Cutover | `server/scheduler/cutover.js`, `server/db.js`, `tools/test-scheduler.js`, `docs/MAY-CHU.md` | Import canonical `dq.state`, rebuild projection, overdue audit và rollback runbook checks. |
| 5. Ops và tích hợp | `server/app.js`, `server/index.js`, `server/api.js`, `server/scheduler/metrics.js`, `tools/scheduler-cli.js`, `tools/test-server.js` | Health/readiness/metrics, local quarantine CLI, transient 503 feedback và redact; không tạo admin endpoint. |
| 6. E2E và phát hành | `tools/test-scheduler.js`, `tools/test-server.js`, `tools/test-tai.js`, `docs/MAY-CHU.md` | Fault matrix, load/backlog test, migration rehearsal và alert runbook. |

Nếu cấu trúc repo dùng tên khác, người lập kế hoạch phải ánh xạ từng trách nhiệm sang file thật trước khi sửa; quyền sở hữu trách nhiệm và ranh giới module ở bảng vẫn giữ nguyên. Không agent nào đồng thời chỉnh migration/store với reducer PvP hoặc endpoint ops. Integration owner chỉ tích hợp commit đã pass test thành phần, rồi chạy toàn bộ test suite và rehearsal migration trên copy database.

## 16. Phụ thuộc đặc tả liên quan

Triển khai phụ thuộc vào đặc tả UI ở `docs/superpowers/specs/2026-08-23-ui-modernization-design.md`: UI tiếp tục chỉ dùng gameplay API hiện hữu, không tiêu thụ scheduler job state, metrics hay endpoint quản trị. UI chỉ hiển thị transient 503/retry feedback theo contract gameplay và không được tự retry scheduler, tự cancel hoặc suy ra kết quả PvP từ clock trình duyệt.

Triển khai cũng phụ thuộc đặc tả chất lượng ở `docs/superpowers/specs/2026-08-23-quality-maintainability-design.md`: outer Unit-of-Work, clock injectable, ma trận fault-injection, observability và release gate của đặc tả đó bổ sung nhưng không thay thế các bất biến và tiêu chí chấp nhận tại đây. Accessibility thuộc đặc tả UI. Khi có mâu thuẫn, tính đúng dữ liệu, idempotency, single-writer và privacy của tài liệu này ưu tiên; UI/quality phải điều chỉnh để tuân thủ.
