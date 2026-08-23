# Thiết kế chất lượng và khả năng bảo trì

**Ngày:** 2026-08-23  
**Trạng thái:** Hướng thiết kế đã phê duyệt; đặc tả chi tiết chờ duyệt cuối  
**Phạm vi:** hạ tầng kiểm chứng, hợp đồng phiên bản, các điểm ghép kiểm thử của máy chủ và lộ trình tách mã. Tài liệu này không thay đổi luật chơi, giao diện hay giao thức nghiệp vụ.

## Mục tiêu

1. Mọi thay đổi có thể lặp lại trên máy phát triển và CI: dùng đúng Node, đúng dependency phát triển và cùng một tập lệnh kiểm tra.
2. Chặn lỗi trước khi phát hành bằng các cổng độc lập cho cú pháp, lint, phiên bản, artefact, lõi luật, HTTP/server, tải và UI Chromium.
3. Giữ hai cách chơi hiện có: mở trực tiếp `index.html` cho một người và chạy Node cho nhiều người; không thêm dependency lúc chạy.
4. Làm rõ ba khái niệm đang dễ lẫn: phiên bản phát hành, nhãn lịch sử của bản phục dựng và phiên bản schema state.
5. Làm máy chủ dựng được trong test mà không mở cổng, không đọc đồng hồ thật, không gọi `process.exit`, và có log có cấu trúc.
6. Giảm dần `eval` và các file JavaScript quá lớn qua facade ổn định, từng đợt nhỏ có test hồi quy; không thay lại toàn bộ hệ module trong một PR.

## Không làm

- Không thay đổi cân bằng, luật mô phỏng, nội dung lịch sử, schema nghiệp vụ hay endpoint đã công bố.
- Không biến client một người thành ứng dụng cần bundler, HTTP, Node, import ES module hay package từ npm.
- Không thêm framework web, ORM, logger bên thứ ba, test runner bên thứ ba hoặc dependency runtime.
- Không đổi tên/xóa đồng loạt API `G.*`, URL `/api/*`, khóa `localStorage`, trường state hoặc tên script trong một lần.
- Không coi một bản artefact trong `dist/` là nguồn chân lý; artefact luôn là kết quả xác định của mã nguồn.

## Chính sách dependency và môi trường chạy

Node `>=22.5` tiếp tục là điều kiện chạy vì server dùng `node:sqlite`. `package.json` giữ `dependencies` rỗng; production chạy bằng `node server/index.js`, không cần `npm install --production` để có thư viện ứng dụng.

Chỉ Playwright được thêm cho kiểm thử UI và chỉ ở `devDependencies`. Khi triển khai, maintainer phải kiểm tra release Playwright hiện tồn tại, tương thích với Node 22.5 bằng metadata chính thức của npm, rồi ghi **một** số phiên bản chính xác (không `^`, `~`, `latest` hoặc range) vào `devDependencies.playwright`. Ngay sau đó phải tạo và commit `package-lock.json` bằng npm của Node CI. Spec này cố ý không đoán trước một số Playwright của tương lai. Chromium được tải bởi chính Playwright trong job UI, không được commit vào repository.

Không dùng `npx` để tự cài package ở CI. Các lệnh CI gọi binary đã lock bằng `npx --no-install playwright ...` hoặc script npm. Người dùng mở `index.html` trực tiếp vẫn chỉ tải CSS/JS tương đối trong repository; game không phát sinh fetch dependency, import map hay service bắt buộc.

## Hợp đồng phiên bản

Ba giá trị có trách nhiệm khác nhau:

| Giá trị | Nguồn chân lý | Ý nghĩa và quy tắc |
|---|---|---|
| Phiên bản phát hành | `package.json.version` | SemVer canonical của repository/phát hành, hiện là `1.36.0`. Chỉ tăng bằng thay đổi chủ ý; không dùng nó để quyết định migration state. |
| Nhãn lịch sử | hằng `G.PHIEN_BAN_LICH_SU` trong dữ liệu client, với giá trị hiện tại `1.35b-r2` | Nhãn mô tả bản tư liệu/bản phục dựng hiển thị trong game. Nó không phải SemVer release, không được so sánh để nâng dữ liệu và phải được ghi rõ là nhãn lịch sử ở nơi hiển thị/API. Tên cũ `G.VERSION` chỉ là alias đọc tương thích trong một release rồi chuyển mọi consumer nội bộ sang tên mới. |
| Schema state | `G.STATE_VERSION`, hiện là `6`, kèm marker `moHinhCT`, `moHinhNhip`, `moHinhQuyDao` | Hợp đồng dữ liệu save. Chỉ migration tuần tự `G.nangCapState` được tăng giá trị này; save lớn hơn bị từ chối, migration phải idempotent byte-for-byte. `cauhinh.stateVersion` trong SQLite luôn bằng giá trị sau khi server bootstrap hoàn tất. |

`tools/check-version.js` là cổng máy đọc được: xác nhận `package.json.version` là SemVer hợp lệ; `G.PHIEN_BAN_LICH_SU` tồn tại và khác ngữ nghĩa schema; `G.STATE_VERSION` là số nguyên dương; tên các marker hiện hành xuất hiện trong migration; API công khai trả rõ `releaseVersion`, `phienBanLichSu`, `stateVersion`. Trong một release chuyển tiếp API cũng trả `phienBan` với đúng giá trị lịch sử cũ để không làm hỏng client cũ. Cùng PR chuyển `js/main.js`, `js/ui.js`, `web/js/mp.js`, `server/api.js`, README và banner server sang tên canonical; server/Playwright test xác nhận alias `G.VERSION` và field `phienBan` legacy vẫn hiển thị đúng trong cửa sổ tương thích.

## Các cổng chất lượng cục bộ

`package.json` phải công bố các script sau; đây là hợp đồng command, không phụ thuộc vào việc developer có cài global tool nào:

| Script | Lệnh chính xác | Điều kiện đạt |
|---|---|---|
| `check:syntax` | `node tools/check-syntax.js` | Duyệt toàn bộ `js/**/*.{js,mjs}`, `server/**/*.{js,mjs}`, `tools/**/*.{js,mjs}` và `web/js/**/*.{js,mjs}`; dùng `node --check` cho từng file. Không quét `dist/` vì đó là output. |
| `lint` | `node tools/lint.js` | Lint nội bộ không dependency: không có trailing whitespace, tab trộn với indent space, dòng vượt 120 ký tự trừ URL/chuỗi tư liệu có chú thích `lint-allow-line`, hay `eval(` mới ngoài danh sách tương thích được ghi rõ. Lint chỉ báo cáo đường dẫn:dòng và exit khác 0. |
| `check:version` | `node tools/check-version.js` | Thực thi đầy đủ hợp đồng phiên bản ở phần trên mà không sửa file. |
| `build` | `node tools/build.js && node tools/build.js --artifact` | Sinh lại đúng hai artefact một file HTML. |
| `check:artifact` | `node tools/check-artifact.js` | Đọc cả hai file `dist/`, kiểm tra CSS và toàn bộ script game đã inline, không còn `script src` của game hay `link` tới `css/style.css`, có marker tương ứng với manifest nguồn canonical theo đúng thứ tự, và không có đường dẫn tuyệt đối/local máy phát triển. |
| `test:core` | `node tools/smoke.js` | Luật lõi, migration và offline tick đạt. |
| `test:server` | `node tools/test-server.js` | HTTP, xác thực, SQLite, PvP, restart và rollback nguyên tử đạt. |
| `test:scheduler` | `node --test tools/test-scheduler.js` | Lease, crash recovery, idempotency, barrier, budget 50.000, retry/quarantine và cutover đạt trên SQLite temp. |
| `test:load` | `node tools/test-tai.js 60` | Kịch bản 60 đế quốc hiện có đạt ngưỡng thời gian và tính đúng đắn của script. |
| `test:ui` | `node tools/test-mp-ui.mjs` | Chromium chạy multiplayer, `/motnguoi`, alias `/solo`, root `index.html` qua `file://`, solo migration và mobile; assertion native kiểm semantic/focus/keyboard/overflow cùng computed contrast token, không có console/page error ngoài allowlist. |
| `test:all` | `npm run check:syntax && npm run lint && npm run check:version && npm run build && npm run check:artifact && npm run test:core && npm run test:server && npm run test:scheduler && npm run test:load && npm run test:ui` | Chuỗi kiểm tra đầy đủ dành cho máy đã có Playwright Chromium. `npm test` tối thiểu chạy core, server và scheduler. |

Sau `npm run build`, cổng artefact của PR chạy thêm `git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html`; vì vậy một thay đổi nguồn làm output khác mà không commit output sẽ thất bại. Khi chỉ kiểm tra local, developer chạy cùng lệnh để thấy diff trước khi commit.

## CI tái lập được

Workflow GitHub Actions chạy trên Ubuntu và checkout đầy đủ. Hợp đồng `engines.node` giữ `>=22.5` cho đến khi một thay đổi được duyệt chủ ý đổi mức hỗ trợ. Các job `quality`, `artifact-and-core` và `server` dùng matrix `node: ["22.5.x", "24.x"]`: nhánh đầu xác nhận mức Node tối thiểu được hỗ trợ, nhánh sau xác nhận dòng Node phát hành hiện hành. Cú pháp `22.5.x` và `24.x` để runner chọn patch mới nhất của đúng dòng, không khẳng định một patch tương lai chưa được kiểm chứng. `load` và `ui` chạy Node `24.x` để tránh nhân đôi bài đo tốn thời gian.

Trong mọi biến thể job, bước dependency là `npm ci`; job phải thất bại nếu không có lockfile hoặc lockfile không khớp `package.json`. Job UI chạy ngay sau bước này `npx --no-install playwright install --with-deps chromium`, rồi mới chạy test UI; vì vậy browser luôn đến từ Playwright đã lock, không phải cache hoặc package được cài ngầm. Không dùng cache dependency trong lần thiết lập đầu; cache chỉ được bật sau và khóa theo hash của `package-lock.json`.

| Job | Lệnh sau `npm ci` | Mục đích |
|---|---|---|
| `quality` (matrix `22.5.x`, `24.x`) | `npm run check:syntax && npm run lint && npm run check:version` | Lỗi tĩnh, contract phiên bản và cấm `eval` mới ở cả mức tối thiểu lẫn dòng Node hiện hành. |
| `artifact-and-core` (matrix `22.5.x`, `24.x`) | `npm run build && npm run check:artifact && git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html && npm run test:core` | Artefact xác định và luật browser/server chung ở cả hai dòng Node. |
| `server` (matrix `22.5.x`, `24.x`) | `npm run test:server && npm run test:scheduler` | Hành vi HTTP/SQLite authoritative cùng fault matrix scheduler ở cả hai dòng Node. |
| `load` (Node `24.x`) | `npm run test:load` | Hồi quy hiệu năng ở tải chuẩn 60 đế quốc trên dòng Node hiện hành. |
| `ui` (Node `24.x`) | `npx --no-install playwright install --with-deps chromium && npm run test:ui` | Sau `npm ci`, cài Chromium bằng Playwright đã lock rồi chạy luồng thật. |

Mọi biến thể matrix của ba job đầu, cùng `load` và `ui`, là required checks của nhánh chính. Log giữ output của script, version Node/npm, và screenshot UI chỉ khi job thất bại; database test và token không được upload. Một PR sửa engine/server phải chạy toàn bộ matrix cùng hai job Node 24.x. PR chỉ sửa docs có thể dùng workflow path-filter để bỏ `load` và `ui`, nhưng vẫn chạy `quality` trên cả hai dòng Node và kiểm tra working tree sạch; thay đổi `package.json`, lockfile, `js/`, `server/`, `tools/`, `index.html`, `web/` hoặc `css/` luôn kích hoạt đủ matrix và hai job Node 24.x.

## Máy chủ: factory, đồng hồ và quan sát

Tách phần khởi động khỏi `server/index.js` thành `server/app.js` với API ổn định:

```js
function taoUngDung(options) // -> { server, kho, tg, api, start, stop, nhip, donRac }
```

`options` nhận `rootDir`, `port`, `dbPath`, `clock`, `logger`, `env`, `schedulerPollMs`, `schedulerLogTicks`, alias chuyển tiếp `tickMs`, và `cleanupMs`; mọi trường có default production tương đương contract scheduler. Precedence poll là `schedulerPollMs` → `tickMs` → `SCHEDULER_POLL_MS` → `THDC_NHIP` → default; logging tương tự qua `SCHEDULER_LOG_TICKS` rồi `THDC_AM`. `clock` bắt buộc cung cấp `nowMs()`; factory suy ra giây game bằng `Math.floor(clock.nowMs()/1000)`. Cả `TheGioi`, `API`, cleanup phiên/chat và scheduler nhận clock đó thay vì gọi rải rác `Date.now()`; chỉ adapter production được gọi `Date.now()`. Test dùng fake clock đơn điệu để ép deadline mà không sleep; production dùng `{ nowMs: () => Date.now() }`.

`logger` có bốn hàm `debug(info)`, `info(info)`, `warn(info)`, `error(info)`, trong đó `info` là object JSON-serializable có ít nhất `event`, `at`, và khi phù hợp `route`, `accountId`, `durationMs`, `count`, `error`. Mặc định adapter chuyển thành console hiện tại để không cần package. Không log password, salt, session token, request body hay nguyên state. Sự kiện tối thiểu: `server.started`, `server.stopped`, `scheduler.tick`, `scheduler.error`, `http.error`, `migration.completed`, `migration.failed`, `db.opened`, `db.closed`.

`start()` mới gọi `listen`; factory tự nó không bind port và không cài signal handler. Sau DB migration, `start()` bind listener ở trạng thái `recovering|standby`: chỉ `/healthz`, `/readyz`, `/metrics` hoạt động, còn gameplay API trả 503 tới khi writer có lease và recovery hoàn tất. `stop()` idempotent: chuyển `draining`, ngừng nhận gameplay command, đóng HTTP listener, dừng scheduler/cleanup, kết thúc hoặc rollback UoW đang chạy, đóng kho rồi resolve Promise; không gọi `process.exit`. `server/index.js` chỉ là entrypoint production: tạo factory từ `process.env`, gọi `start`, cài SIGINT/SIGTERM gọi `stop` rồi đặt `process.exitCode`. Test mới dùng factory với `port: 0`, DB temp và fake logger/clock, nhưng vẫn giữ một integration test spawn `server/index.js` để bảo vệ signal, env và entrypoint production. Các export cũ `{ server, kho, tg, api }` còn là facade đọc tương thích trong một release; chúng không được gây bind port khi module chỉ được `require`.

Trước khi scheduler ghi game, `Kho` có Unit-of-Work re-entrant với đúng một outer `BEGIN IMMEDIATE`. Scheduler/mutation gate sở hữu outer transaction; `TheGioi` chỉ stage rồi ghi vào context đó, mọi lời gọi lồng nhau dùng cùng context và không tự `BEGIN`/`COMMIT`. Effect game, projection, successor job, application record và completion cùng commit hoặc rollback. Không có `await`, network I/O hay callback bất đồng bộ bên trong transaction; test bắt lỗi nested transaction và xác nhận rollback xuyên nhiều account.

## Bỏ `eval` theo từng bước

Hiện `server/rules.js` đọc rồi `eval` các file browser. Thay thế theo bốn PR tuần tự, mỗi PR giữ nguyên thứ tự `data, util, galaxy, combat, engine, fleet, actions` và chạy core/server/load:

1. Tạo `tools/source-manifest.js` làm nguồn thứ tự canonical cho rules, solo và multiplayer; `index.html`/`web/index.html` vẫn chứa thẻ script tĩnh để chạy `file://`, còn build/checker xác nhận chúng khớp manifest. Tạo `server/rules-loader.js` có `napLuat({ rootDir, requireFn, globalObject })`; đảm bảo `globalObject.window` tồn tại và `require` từng file trong nhóm rules từ manifest. Các file hiện tại đã tự gắn `window.G`, nên CommonJS cache đủ thay cho đọc-file/eval. `server/rules.js` chỉ re-export `{ G, THU_TU, napLuat }` từ loader để mọi consumer cũ không đổi.
2. Thêm test loader nạp đúng thứ tự, trả một `G` có `STATE_VERSION`, và lỗi nêu đúng tên file nếu một file mất. Test isolation dùng process con, không xóa global/cache của test khác.
3. Sau khi loader ổn định, đổi từng nhóm file tách ra thành file CommonJS-compatible nhưng vẫn gắn API lên `window.G` trong browser. Không dùng `eval`, `Function`, `vm.runIn*` hay loader runtime tự viết thay thế.
4. Xóa code đọc-file/eval cũ chỉ khi `rg "\\beval\\s*\\(" server js tools web` trả không có kết quả ngoài fixture kiểm tra lint có chú thích; `lint` biến điều kiện này thành gate vĩnh viễn.

## Chia module JavaScript không big-bang

Mục tiêu là giảm file lớn mà không buộc client/browser đổi cách nạp. Mỗi đợt tạo các file dưới `js/core/` hoặc `js/ui/` gắn chức năng vào `window.G`; `tools/source-manifest.js`, `index.html`, `web/index.html`, build tool và loader server thêm script theo thứ tự ngay trước facade tương ứng. Checker xác nhận hai HTML và output build khớp manifest; không hard-code con số 10 sau khi module đầu tiên được tách. Các facade gốc `js/engine.js`, `js/fleet.js`, `js/actions.js`, `js/ui.js`, `js/app.js`, `js/main.js` vẫn tồn tại theo cùng thứ tự tương đối, giữ mọi tên `G.*` công khai, và chỉ điều phối/adapter trong suốt giai đoạn tách.

Trình tự biên giới bắt buộc:

1. Tách hàm thuần không I/O từ `util.js` và bảng/hàm tra cứu thuần từ `data.js`; không đổi shape `G`.
2. Tách state creation, validation và migration từ `engine.js` thành `js/core/state.js`; facade `engine.js` vẫn công bố `G.moiGame`, `G.nangCapState`, `G.tick` theo tên và tham số cũ.
3. Tách sản xuất, bảo trì và queue thành `js/core/economy.js` và `js/core/timeline.js`; chỉ facade điều phối thứ tự event, smoke bảo vệ result byte-for-byte của migration.
4. Tách route/action thuần của `actions.js` và lifecycle/PvP của `fleet.js`; `server/world.js` vẫn gọi public `G` cũ, còn HTTP không biết file mới.
5. Tách renderer và presenter từ `ui.js`, sau đó tách điều phối DOM từ `app.js`; `main.js` giữ bootstrap solo/localStorage. Spec UI song hành quyết định cấu trúc màn hình, không được trộn tái thiết kế UI vào PR này.
6. Khi một facade không còn logic, giữ facade chuyển tiếp tối thiểu một release; chỉ xóa sau khi `index.html`, build, rules loader, smoke và test UI không còn tham chiếu trực tiếp file/biểu tượng cũ.

Mỗi PR tách đúng một boundary, có test trước/sau và không vừa đổi logic luật vừa di chuyển code. Không dùng import ES module, dynamic import hoặc bundler: thứ tự script explicit là một phần contract của opening `index.html` trực tiếp và artifact single-file.

## Tương thích ngược và rollback

Save/browser: migration schema cũ tiếp tục tuần tự và idempotent; save state mới hơn luôn bị từ chối không ghi đè. Database: bootstrap vẫn nâng toàn bộ hoặc rollback giao dịch, không được đưa schema state nửa chừng. API: thêm trường version mới là additive; giữ `phienBan` legacy trong một release. Server: factory mới giữ default URL, static routes, env `PORT`, `THDC_DB`, `THDC_NHIP`, `THDC_AM`, `THDC_PROXY` và response hiện hữu.

Rollback phát hành là checkout về commit trước **chỉ khi database chưa được migration schema state mới**. Nếu có migration state mới, rollback code bị chặn bởi check state-version; khôi phục backup SQLite đã chụp trước migration hoặc phát hành bản forward-fix, tuyệt đối không hạ `v` trong JSON. Với tách module, mỗi PR vẫn có facade nên rollback đơn giản là revert PR; với lockfile/Playwright, revert đồng thời `package.json` và `package-lock.json` rồi dùng `npm ci`. Artefact rollback phải được build lại từ commit rollback, không sửa tay `dist/`.

## Phụ thuộc vào spec song hành

- [Hiện đại hóa UI](2026-08-23-ui-modernization-design.md) định nghĩa màn hình, selector và tiêu chí UX. Spec này cung cấp job Chromium, quy tắc không phá `index.html` trực tiếp và facade UI để migration có chỗ ghép ổn định; UI spec không được yêu cầu framework/runtime dependency trái với chính sách ở đây.
- [Bộ lập lịch sự kiện bền vững](2026-08-23-durable-event-scheduler-design.md) định nghĩa ownership và tính bền vững của event. Spec này cung cấp clock injectable, Unit-of-Work outer, scheduler lifecycle, log `scheduler.*`, scheduler test gate, load gate và rollback schema; scheduler spec phải dùng `taoUngDung` thay vì tự tạo interval/đồng hồ riêng.

Thứ tự tích hợp: factory/clock và version contract trước; sau đó durable scheduler có thể dùng seams; UI migration chạy trên facade đã ổn định; cuối cùng từng đợt module split. CI gates có thể được thêm ngay từ PR đầu và trở thành điều kiện merge cho tất cả PR sau.

## Phân công song song, tích hợp và review

| Workstream | Chủ sở hữu | Ranh giới không chồng chéo |
|---|---|---|
| Chất lượng/CI | người phụ trách spec này | `package.json`, lockfile, workflow, tool check/lint/version/artifact và docs CI. Không đổi luật game. |
| Scheduler bền vững | người phụ trách durable-event spec | event persistence, thứ tự xử lý và migration scheduler; dùng factory/clock/log interface đã chốt. |
| UI hiện đại hóa | người phụ trách UI spec | HTML/CSS/render/presenter/selector và UI tests; không thêm runtime dependency hay đổi API server không có contract. |
| Core/server boundary | một reviewer tích hợp được chỉ định | factory, loader, facade module, compatibility và thứ tự script; chỉ merge sau khi ba workstream trên rebase. |

Mỗi PR phải nhỏ, một ownership và một boundary, có mô tả lệnh đã chạy. PR thay interface `taoUngDung`, clock, logger, loader order, version payload hoặc facade `G.*` cần review chéo của người phụ trách scheduler và UI trước merge. Người tích hợp rebase theo thứ tự ở phần phụ thuộc, chạy `npm run test:all` trên tip chung, kiểm tra `git diff --check` và artefact diff, rồi mới merge. Không merge đồng thời hai PR sửa cùng manifest/lockfile; gộp chúng theo thứ tự để lockfile chỉ có một nguồn thay đổi.

## Tiêu chí chấp nhận

- Repository có `package-lock.json`; `npm ci` sạch trên cả Node `22.5.x` và `24.x`; `engines.node` vẫn là `>=22.5`, `dependencies` vẫn rỗng và Playwright là dev dependency đúng một version pin đã kiểm chứng.
- Toàn bộ matrix `quality`/`artifact-and-core`/`server` trên Node `22.5.x` và `24.x`, cùng `load`/`ui` trên Node `24.x`, là required và xanh trên tip chung; UI chỉ cài Chromium sau `npm ci` qua Playwright đã lock, không tự tải/cài package ngoài lockfile.
- `npm run check:syntax`, `npm run lint`, `npm run check:version`, `npm run build`, `npm run check:artifact`, `npm run test:core`, `npm run test:server`, `npm run test:scheduler`, `npm run test:load`, `npm run test:ui` đều pass; sau build, `git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html` pass.
- Mở `index.html` bằng `file://` vẫn khởi tạo game solo, lưu/nạp localStorage và không phát sinh request dependency; hai artefact vẫn chạy độc lập.
- `package.json.version`, nhãn lịch sử và `G.STATE_VERSION` được trả/hiển thị theo contract, save v6 hợp lệ được giữ nguyên, save tương lai bị từ chối và DB config trùng `G.STATE_VERSION` sau bootstrap.
- Test có thể dựng hai server với DB/clock/logger khác nhau, cổng `0`, rồi `start`/`stop` idempotent mà không exit process, còn interval hay file DB test; một bài spawn entrypoint production vẫn pass signal/env shutdown.
- Scheduler và mọi gameplay mutation dùng cùng outer Unit-of-Work, không có nested `BEGIN`; fault injection chứng minh game state, projection, successor job, application và completion rollback/commit nguyên tử.
- `rg "\\beval\\s*\\(" server js tools web` không có vi phạm hợp đồng; loader server nạp cùng bộ luật theo thứ tự chuẩn mà không đọc rồi eval text.
- Mỗi bước tách module giữ facade/API/URL/localStorage/state cũ, có test hồi quy tương ứng, và không có PR big-bang đổi module system.
