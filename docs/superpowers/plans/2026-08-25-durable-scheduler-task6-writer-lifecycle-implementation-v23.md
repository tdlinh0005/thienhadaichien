# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V23

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for each code wave and `superpowers:verification-before-completion` before reporting completion.

**Goal:** Implement Task 6 durable scheduler writer lifecycle with authoritative parent73 plus overlay8 runtime coverage, preserving Tasks 1-5 contracts and avoiding Task7+ scope.

**Architecture:** V23 supersedes V22's prose-delta weakness with an exact standalone artifact producer. It keeps `parent runtime=73 + overlay=8 => N=81`, final scheduler TAP `244/243/0/1`, and all V22 logic fixes. V23 additionally fixes startup overlay duplicate/vacuous assertions, wires reviewer artifact validation into report append + Stage-B, and makes helper/overlay extraction mechanically reproducible from fresh `/tmp`.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.

## Global constraints

- Preserve V1-V22 plan artifacts. This planning task creates only this V23 file.
- Implementation may edit exactly six Task6-owned files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- Parent runtime registrations: `73`.
- Overlay runtime registrations: `8`.
- Mechanical count: `N=81`.
- Expected final scheduler TAP: `244 tests`, `243 pass`, `0 fail`, `1 skipped`.
- Root supplies `TASK6_V23_APPROVED_SHA`; the plan never embeds its own hash.

Pinned authority hashes:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md
93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
```

## Exact implementation scope

Retain V22 production contracts:

- Store primitives: `quarantineClaimedRaw`, `retargetOwnedPendingAccountAdvanceForCommand`, `validateBlockedAccountAdvanceForDependency`, `listExpiredRunningForRecovery`, `listOwnedRunningForRecovery`.
- Writer: lifecycle/status/cache/private seams, timers, startup recovery, global/account claim, failure settlement, crash hooks, `advanceDueInCurrentUow`, `runCommand`, direct external continuation, public five-key `advanceTo`.
- Index: exact exports `{taoScheduler, inRange, resolveDurableSchedulerOptions}` and Task7-private non-enumerable bridge seams.
- Cutover: exact synchronous `runMaintenanceCutover({kho, clock, ownerId})` from parent lines `15279-15316`.
- CLI: exact exports `{parseArgs, runCli, main}`, strict grammar `--db <file> --action cutover`, safe code-only stderr, close precedence.

## Standalone V23 artifact producer

Run this script from repo root after the implementer has applied Task6 code and appended the V23 helper/parent/overlay slices to `tools/test-scheduler.js`. It creates every `/tmp/task6-v23-*` artifact from fresh `/tmp`; there is no human synthesis step.

```bash
cat > /tmp/task6-v23-produce-artifacts.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
rm -f /tmp/task6-v23-*
test -n "${TASK6_V23_APPROVED_SHA:-}"
case "$TASK6_V23_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V23_APPROVED_SHA}" -eq 64

plan='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md'
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'
task5='docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md'
v21='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md'
v22='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md'
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'

printf '%s  %s\n' "$TASK6_V23_APPROVED_SHA" "$plan" > /tmp/task6-v23-approved-plan.sha256
cat > /tmp/task6-v23-authorities.sha256 <<'EOF'
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md
93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
EOF
sha256sum -c /tmp/task6-v23-approved-plan.sha256
sha256sum -c /tmp/task6-v23-authorities.sha256

cat > /tmp/task6-v23-tap-normalize.sh <<'EOF'
normalize_tap_for_hash() {
  sed -E '/^[[:space:]]+duration_ms:/d;/^# duration_ms /d' "$1"
}
EOF
sha256sum /tmp/task6-v23-tap-normalize.sh > /tmp/task6-v23-tap-normalize.sh.sha256

cat > /tmp/task6-v23-inventory.sh <<'EOF'
repo_inventory() {
python3 - <<'PY'
import hashlib, os, stat, subprocess
excluded = {
  'docs/superpowers/reports',
  'docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
}
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if record:
        meta, path = record.split(b'\t', 1)
        tracked[path.decode()] = meta.split()[0].decode()
paths = set(tracked)
for dirpath, dirnames, filenames in os.walk('.', topdown=True, followlinks=False):
    dirnames[:] = [d for d in dirnames if d != '.git']
    rel = dirpath[2:] if dirpath.startswith('./') else dirpath
    for name in list(dirnames):
        p = os.path.join(rel, name) if rel else name
        try: st = os.lstat(p)
        except FileNotFoundError: continue
        if stat.S_ISLNK(st.st_mode):
            paths.add(p); dirnames.remove(name)
    for name in filenames:
        paths.add(os.path.join(rel, name) if rel else name)
for p in sorted(paths):
    if p in excluded: continue
    try: st = os.lstat(p)
    except FileNotFoundError:
        print(p + '\tmissing\t-\t-\t-\t-\t' + tracked.get(p, '-')); continue
    fs_mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    git_mode = tracked.get(p, '-')
    if stat.S_ISLNK(st.st_mode):
        print(p + '\tsymlink\t' + fs_mode + '\t' + str(st.st_size) + '\t-\t' + os.readlink(p) + '\t' + git_mode)
    elif stat.S_ISREG(st.st_mode):
        data = open(p, 'rb').read()
        print(p + '\tfile\t' + fs_mode + '\t' + str(len(data)) + '\t' + hashlib.sha256(data).hexdigest() + '\t-\t' + git_mode)
    elif stat.S_ISDIR(st.st_mode):
        print(p + '\tdir\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
    else:
        print(p + '\tother\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
PY
}
EOF
sha256sum /tmp/task6-v23-inventory.sh > /tmp/task6-v23-inventory.sh.sha256
. /tmp/task6-v23-inventory.sh
repo_inventory > /tmp/task6-v23-pre-inventory.tsv
sha256sum /tmp/task6-v23-pre-inventory.tsv > /tmp/task6-v23-pre-inventory.tsv.sha256

node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v23-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v23-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v23-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v23-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v23-baseline.tap
node - <<'NODE' /tmp/task6-v23-baseline.tap > /tmp/task6-v23-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v23-baseline-names.txt > /tmp/task6-v23-baseline-names.txt.sha256

node - <<'NODE' > /tmp/task6-v23-prefix.tsv
const fs = require('fs'), crypto = require('crypto');
const data = fs.readFileSync('tools/test-scheduler.js');
for (const marker of [
  '// TASK6_V23_HELPERS_START',
  '// TASK6_V23_HELPERS_END',
  '// TASK6_V23_PARENT_TESTS_START',
  '// TASK6_V23_PARENT_TESTS_END',
  '// TASK6_V23_OVERLAY_TESTS_START',
  '// TASK6_V23_OVERLAY_TESTS_END'
]) {
  if (data.includes(Buffer.from(marker))) throw new Error('TASK6_V23_ALREADY_PRESENT');
}
console.log([data.length, crypto.createHash('sha256').update(data).digest('hex')].join('\t'));
NODE
sha256sum /tmp/task6-v23-prefix.tsv > /tmp/task6-v23-prefix.tsv.sha256

cat > /tmp/task6-v23-helper-imports.js <<'EOF'
var {
  GameAdvanceService,
  toPublicAdvanceResult
} = require('../server/scheduler/advance-service.js');
var {
  EventReducer,
  resolveCanonicalGlobalInCurrentUow
} = require('../server/scheduler/reducers.js');
var {SchedulerStore} = require('../server/scheduler/store.js');
EOF
sed -n '6411,6470p' "$parent" > /tmp/task6-v23-helper-base.js
sed -n '7601,7609p' "$parent" > /tmp/task6-v23-helper-advance.js
sed -n '7677,7702p' "$parent" > /tmp/task6-v23-helper-pvp-base.js
sed -n '7748,7802p' "$parent" > /tmp/task6-v23-helper-exec-a.js
sed -n '7813,7850p' "$parent" > /tmp/task6-v23-helper-exec-b.js
sed -n '7855,7904p' "$parent" > /tmp/task6-v23-helper-account.js
sed -n '8134,8144p' "$parent" > /tmp/task6-v23-helper-local.js
awk '/^\/\/ TASK6_V23_HELPER_FIXED_PVP_START$/{flag=1; next} /^\/\/ TASK6_V23_HELPER_FIXED_PVP_END$/{flag=0} flag' "$plan" > /tmp/task6-v23-helper-fixed-pvp.js
test -s /tmp/task6-v23-helper-fixed-pvp.js
cat /tmp/task6-v23-helper-imports.js \
  /tmp/task6-v23-helper-base.js \
  /tmp/task6-v23-helper-advance.js \
  /tmp/task6-v23-helper-pvp-base.js \
  /tmp/task6-v23-helper-fixed-pvp.js \
  /tmp/task6-v23-helper-exec-a.js \
  /tmp/task6-v23-helper-exec-b.js \
  /tmp/task6-v23-helper-account.js \
  /tmp/task6-v23-helper-local.js > /tmp/task6-v23-expected-helper-slice.js
test -s /tmp/task6-v23-expected-helper-slice.js
set +e
rg -n '^[[:space:]]*test[[:space:]]*\(' /tmp/task6-v23-expected-helper-slice.js
rg_status=$?
set -e
if [ "$rg_status" -eq 0 ]; then exit 1; fi
if [ "$rg_status" -ne 1 ]; then exit "$rg_status"; fi
sha256sum /tmp/task6-v23-expected-helper-slice.js > /tmp/task6-v23-expected-helper-slice.js.sha256

python3 - <<'PY' > /tmp/task6-v23-parent73-names.txt
from pathlib import Path
text = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md').read_text()
body = text.split("cat > /tmp/task6-v20-parent73-names.txt <<'EOF'\n", 1)[1].split("\nEOF\nwc -l /tmp/task6-v20-parent73-names.txt", 1)[0]
print(body, end='')
PY
wc -l /tmp/task6-v23-parent73-names.txt | grep -E '^73 '
sha256sum /tmp/task6-v23-parent73-names.txt > /tmp/task6-v23-parent73-names.txt.sha256
sed -n '10886,11844p' "$parent" > /tmp/task6-v23-parent-block-1.md
sed -n '11848,12485p' "$parent" > /tmp/task6-v23-parent-block-2.md
sed -n '12489,12833p' "$parent" > /tmp/task6-v23-parent-block-3.md
sed -n '12837,13070p' "$parent" > /tmp/task6-v23-parent-block-4.md
python3 - <<'PY' /tmp/task6-v23-parent-block-1.md /tmp/task6-v23-parent-block-2.md /tmp/task6-v23-parent-block-3.md /tmp/task6-v23-parent-block-4.md > /tmp/task6-v23-expected-parent-slice.js
import pathlib, sys
for filename in sys.argv[1:]:
    in_js = False
    for line in pathlib.Path(filename).read_text().splitlines(True):
        if line.strip() == '```js':
            in_js = True; continue
        if in_js and line.strip() == '```':
            in_js = False; continue
        if in_js:
            sys.stdout.write(line)
PY
test -s /tmp/task6-v23-expected-parent-slice.js
sha256sum /tmp/task6-v23-expected-parent-slice.js > /tmp/task6-v23-expected-parent-slice.js.sha256

python3 - <<'PY' > /tmp/task6-v23-expected-overlay.js
from pathlib import Path
v21 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md').read_text()
body = v21.split('// TASK6_V21_PLAN_OVERLAY_JS_START\n', 1)[1].split('// TASK6_V21_PLAN_OVERLAY_JS_END', 1)[0]
body = body.replace('task6v21', 'task6v23').replace('TASK6V21', 'TASK6V23')
body = body.replace('Task 6 v21 overlay', 'Task 6 v23 overlay')
plan = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md').read_text()
def repl(name):
    return plan.split('// TASK6_V23_REPLACEMENT_START ' + name + '\n', 1)[1].split('// TASK6_V23_REPLACEMENT_END ' + name, 1)[0]
def replace_test(src, title, replacement):
    needle = "test('" + title + "'"
    start = src.index(needle)
    nxt = src.find("\ntest('Task 6 v23 overlay ", start + 1)
    end = len(src) if nxt == -1 else nxt + 1
    return src[:start] + replacement + src[end:]
for key, title in [
    ('STARTUP', 'Task 6 v23 overlay startup renews after recovery before ready and publishes after commit'),
    ('DUE61', 'Task 6 v23 overlay advance due keeps live order and enqueues continuation at sixty one'),
    ('CUTOVER', 'Task 6 v23 overlay maintenance cutover validates guards and release precedence'),
    ('CLI', 'Task 6 v23 overlay scheduler cutover CLI grammar lifecycle and exact exports'),
    ('EXACT_NULL', 'Task 6 v23 overlay exact null partial retains running lock without lifecycle calls')
]:
    body = replace_test(body, title, repl(key))
if any(s in body for s in ['task6v21','TASK6V21','Task 6 v21 overlay']):
    raise SystemExit('TASK6_V23_OVERLAY_V21_LEAK')
print(body, end='')
PY
node --check /tmp/task6-v23-expected-overlay.js
sha256sum /tmp/task6-v23-expected-overlay.js > /tmp/task6-v23-expected-overlay.js.sha256

cat > /tmp/task6-v23-overlay8-red-contracts.tsv <<'EOF'
Task 6 v23 overlay raw quarantine store primitive preserves attempt without parsing invalid payload	TASK6V23_RED_001_RAW_QUARANTINE_STORE	missing quarantineClaimedRaw
Task 6 v23 overlay status cache private seams bridge seams and exact scheduler exports	TASK6V23_RED_002_STATUS_EXPORTS	missing bridge._datDatabaseClosing
Task 6 v23 overlay retarget and blocked descriptor store primitives use dependency source account	TASK6V23_RED_003_RETARGET_DESCRIPTOR	missing retargetOwnedPendingAccountAdvanceForCommand
Task 6 v23 overlay startup renews after recovery before ready and publishes after commit	TASK6V23_RED_004_STARTUP_RENEW	missing listExpiredRunningForRecovery
Task 6 v23 overlay advance due keeps live order and enqueues continuation at sixty one	TASK6V23_RED_005_DUE61_ORDER	missing advanceDueInCurrentUow
Task 6 v23 overlay maintenance cutover validates guards and release precedence	TASK6V23_RED_006_CUTOVER_RELEASE	missing runMaintenanceCutover
Task 6 v23 overlay scheduler cutover CLI grammar lifecycle and exact exports	TASK6V23_RED_007_CLI	missing runCli
Task 6 v23 overlay exact null partial retains running lock without lifecycle calls	TASK6V23_RED_008_EXACT_NULL_PARTIAL	missing executeClaimedInCurrentUow
EOF
cut -f1 /tmp/task6-v23-overlay8-red-contracts.tsv > /tmp/task6-v23-overlay8-names.txt
wc -l /tmp/task6-v23-overlay8-names.txt | grep -E '^8 '
python3 - <<'PY'
from pathlib import Path
text = Path('/tmp/task6-v23-expected-overlay.js').read_text()
actual = [line.strip().split("'",2)[1] for line in text.splitlines()
          if line.strip().startswith("test('Task 6 v23 overlay ")]
expected = Path('/tmp/task6-v23-overlay8-names.txt').read_text().splitlines()
if actual != expected: raise SystemExit('TASK6_V23_OVERLAY_NAME_MISMATCH')
PY
sha256sum /tmp/task6-v23-overlay8-red-contracts.tsv > /tmp/task6-v23-overlay8-red-contracts.tsv.sha256
sha256sum /tmp/task6-v23-overlay8-names.txt > /tmp/task6-v23-overlay8-names.txt.sha256

cat > /tmp/task6-v23-six-meta.sh <<'EOF'
make_six_meta() {
python3 - <<'PY'
import hashlib, os, stat, subprocess
paths = ['server/scheduler/store.js','server/scheduler/writer.js','server/scheduler/index.js','server/scheduler/cutover.js','tools/scheduler-cutover.js','tools/test-scheduler.js']
tracked = {}
raw = subprocess.check_output(['git','ls-files','--stage','-z'])
for record in raw.split(b'\0'):
    if record:
        meta, path = record.split(b'\t',1); tracked[path.decode()] = meta.split()[0].decode()
for p in paths:
    st = os.lstat(p); mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
        raise SystemExit('SIX_FILE_MODE_INVALID ' + p + ' ' + mode)
    git_mode = tracked.get(p, '-')
    if git_mode not in ('-', '100644'): raise SystemExit('SIX_TRACKED_MODE_INVALID ' + p + ' ' + git_mode)
    data = open(p,'rb').read()
    print('\t'.join([p,'file',mode,git_mode,str(len(data)),hashlib.sha256(data).hexdigest()]))
PY
}
EOF
sha256sum /tmp/task6-v23-six-meta.sh > /tmp/task6-v23-six-meta.sh.sha256

cat > /tmp/task6-v23-red-parser.sh <<'EOF'
parse_overlay_red_tap() {
  tap_file="$1"; expected_name="$2"; expected_message="$3"
  node - "$tap_file" "$expected_name" "$expected_message" <<'NODE'
const fs = require('fs');
const [tapFile, expectedName, expectedMessage] = process.argv.slice(2);
const lines = fs.readFileSync(tapFile, 'utf8').split(/\n/);
const start = lines.findIndex((line) => line === '# Subtest: ' + expectedName);
if (start < 0) throw new Error('TASK6_V23_RED_SUBTEST_MISSING');
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) if (lines[i].startsWith('# Subtest: ')) { end = i; break; }
const block = lines.slice(start, end).join('\n');
const escaped = expectedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (!new RegExp('^not ok [0-9]+ - ' + escaped + '$', 'm').test(block)) throw new Error('TASK6_V23_RED_STATUS_MISSING');
if (!block.includes(expectedMessage)) throw new Error('TASK6_V23_RED_MESSAGE_MISSING');
if (!block.includes("code: 'ERR_ASSERTION'")) throw new Error('TASK6_V23_RED_ASSERTION_CODE_MISSING');
for (const banned of ['MODULE_NOT_FOUND','ReferenceError','TypeError','SQLITE_','MISSING_PREREQUISITE','is not defined','fixture setup','fixture job must','idempotency_key','TICK_TARGET_INVALID','TASK6V23_FIXTURE_']) {
  if (block.includes(banned)) throw new Error('TASK6_V23_RED_BANNED_' + banned);
}
NODE
}
EOF
sha256sum /tmp/task6-v23-red-parser.sh > /tmp/task6-v23-red-parser.sh.sha256

cat > /tmp/task6-v23-write-report-base.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
mkdir -p docs/superpowers/reports
chmod 0755 docs/superpowers/reports
touch "$report"
chmod 0644 "$report"
reviewers="$(mktemp /tmp/task6-v23-reviewers.XXXXXX)"
awk 'BEGIN{FS="\t"} $1=="reviewer"{print}' "$report" > "$reviewers" || true
tmp="$(mktemp /tmp/task6-v23-report.XXXXXX)"
{
  echo 'task=durable-scheduler-task6-writer-lifecycle'
  echo 'plan_version=V23'
  echo "plan_v23_sha=$(cut -d' ' -f1 /tmp/task6-v23-approved-plan.sha256)"
  echo 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3'
  echo 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf'
  echo 'v21_contract_sha=34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a'
  echo 'v22_contract_sha=93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6'
  echo 'counts=parent runtime=73 + overlay=8 => N=81'
  echo 'stage_a_counts=244 tests / 243 pass / 0 fail / 1 skipped'
  echo "pre_inventory_sha=$(cut -d' ' -f1 /tmp/task6-v23-pre-inventory.tsv.sha256)"
  echo "post_inventory_sha=$(cut -d' ' -f1 /tmp/task6-v23-post-inventory.tsv.sha256)"
  echo "helper_slice_sha=$(cut -d' ' -f1 /tmp/task6-v23-expected-helper-slice.js.sha256)"
  echo "parent73_names_sha=$(cut -d' ' -f1 /tmp/task6-v23-parent73-names.txt.sha256)"
  echo "overlay8_names_sha=$(cut -d' ' -f1 /tmp/task6-v23-overlay8-names.txt.sha256)"
  echo "parent_slice_sha=$(cut -d' ' -f1 /tmp/task6-v23-expected-parent-slice.js.sha256)"
  echo "overlay_slice_sha=$(cut -d' ' -f1 /tmp/task6-v23-expected-overlay.js.sha256)"
  echo "overlay_red_evidence_sha=$(cut -d' ' -f1 /tmp/task6-v23-red-evidence.tap.sha256)"
  echo "stage_a_script_sha=$(cut -d' ' -f1 /tmp/task6-v23-stage-a.sh.sha256)"
  echo "report_producer_sha=$(cut -d' ' -f1 /tmp/task6-v23-write-report-base.sh.sha256)"
  echo "review_bundle_sha=$(cut -d' ' -f1 /tmp/task6-v23-review-bundle.tsv.sha256)"
  echo "stage_a_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v23-stage-a.normalized.tap.sha256)"
  echo "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v23-stage-a-throw.normalized.tap.sha256)"
  echo 'node_check_status=PASS'
  echo 'whitespace_status=PASS'
  echo 'inventory_status=PASS'
  echo 'stage_a_status=PASS'
  while IFS= read -r row; do echo "six_meta=$row"; done < /tmp/task6-v23-six-meta.sealed.tsv
  cat "$reviewers"
} > "$tmp"
mv "$tmp" "$report"
chmod 0644 "$report"
rm -f "$reviewers"
EOF
chmod +x /tmp/task6-v23-write-report-base.sh
sha256sum /tmp/task6-v23-write-report-base.sh > /tmp/task6-v23-write-report-base.sh.sha256

cat > /tmp/task6-v23-stage-a.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
sha256sum -c /tmp/task6-v23-approved-plan.sha256
sha256sum -c /tmp/task6-v23-stage-a.sh.sha256
sha256sum -c /tmp/task6-v23-authorities.sha256
sha256sum -c /tmp/task6-v23-tap-normalize.sh.sha256
sha256sum -c /tmp/task6-v23-inventory.sh.sha256
sha256sum -c /tmp/task6-v23-pre-inventory.tsv.sha256
sha256sum -c /tmp/task6-v23-baseline-names.txt.sha256
sha256sum -c /tmp/task6-v23-prefix.tsv.sha256
sha256sum -c /tmp/task6-v23-expected-helper-slice.js.sha256
sha256sum -c /tmp/task6-v23-expected-parent-slice.js.sha256
sha256sum -c /tmp/task6-v23-parent73-names.txt.sha256
sha256sum -c /tmp/task6-v23-expected-overlay.js.sha256
sha256sum -c /tmp/task6-v23-overlay8-red-contracts.tsv.sha256
sha256sum -c /tmp/task6-v23-overlay8-names.txt.sha256
sha256sum -c /tmp/task6-v23-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v23-six-meta.sh.sha256
sha256sum -c /tmp/task6-v23-six-meta.sealed.tsv.sha256
sha256sum -c /tmp/task6-v23-write-report-base.sh.sha256
for part in helper parent overlay; do
  case "$part" in
    helper) start='// TASK6_V23_HELPERS_START'; end='// TASK6_V23_HELPERS_END'; expected=/tmp/task6-v23-expected-helper-slice.js; current=/tmp/task6-v23-current-helper-slice.js ;;
    parent) start='// TASK6_V23_PARENT_TESTS_START'; end='// TASK6_V23_PARENT_TESTS_END'; expected=/tmp/task6-v23-expected-parent-slice.js; current=/tmp/task6-v23-current-parent-slice.js ;;
    overlay) start='// TASK6_V23_OVERLAY_TESTS_START'; end='// TASK6_V23_OVERLAY_TESTS_END'; expected=/tmp/task6-v23-expected-overlay.js; current=/tmp/task6-v23-current-overlay.js ;;
  esac
  node - "$start" "$end" > "$current" <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const [rawStart, rawEnd] = process.argv.slice(2);
const start = rawStart + '\n', end = rawEnd + '\n';
const a = text.indexOf(start), b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V23_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
  cmp -s "$expected" "$current"
done
set +e
rg -n '^[[:space:]]*test[[:space:]]*\(' /tmp/task6-v23-current-helper-slice.js
rg_status=$?
set -e
if [ "$rg_status" -eq 0 ]; then exit 1; fi
if [ "$rg_status" -ne 1 ]; then exit "$rg_status"; fi
node - <<'NODE'
const fs = require('fs');
const [len, sha] = fs.readFileSync('/tmp/task6-v23-prefix.tsv', 'utf8').trim().split('\t');
const crypto = require('crypto');
const data = fs.readFileSync('tools/test-scheduler.js').subarray(0, Number(len));
const actual = crypto.createHash('sha256').update(data).digest('hex');
if (actual !== sha) throw new Error('TASK6_V23_PREFIX_CHANGED');
NODE
. /tmp/task6-v23-six-meta.sh
make_six_meta > /tmp/task6-v23-six-meta.stage-a-before.tsv
diff -u /tmp/task6-v23-six-meta.sealed.tsv /tmp/task6-v23-six-meta.stage-a-before.tsv
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v23-stage-a.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v23-stage-a-throw.tap
for f in /tmp/task6-v23-stage-a.tap /tmp/task6-v23-stage-a-throw.tap; do
  grep -E '^# tests 244$' "$f"
  grep -E '^# pass 243$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done
. /tmp/task6-v23-tap-normalize.sh
normalize_tap_for_hash /tmp/task6-v23-stage-a.tap > /tmp/task6-v23-stage-a.normalized.tap
normalize_tap_for_hash /tmp/task6-v23-stage-a-throw.tap > /tmp/task6-v23-stage-a-throw.normalized.tap
sha256sum /tmp/task6-v23-stage-a.normalized.tap > /tmp/task6-v23-stage-a.normalized.tap.sha256
sha256sum /tmp/task6-v23-stage-a-throw.normalized.tap > /tmp/task6-v23-stage-a-throw.normalized.tap.sha256
node - <<'NODE' /tmp/task6-v23-stage-a.tap
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
const baseline = fs.readFileSync('/tmp/task6-v23-baseline-names.txt', 'utf8').trim().split('\n');
const parent = fs.readFileSync('/tmp/task6-v23-parent73-names.txt', 'utf8').trim().split('\n');
const overlay = fs.readFileSync('/tmp/task6-v23-overlay8-names.txt', 'utf8').trim().split('\n');
if (names.length !== 244) throw new Error('TASK6_V23_NAME_COUNT_' + names.length);
if (names.join('\n') !== [...baseline, ...parent, ...overlay].join('\n')) throw new Error('TASK6_V23_NAME_ORDER_CHANGED');
NODE
make_six_meta > /tmp/task6-v23-six-meta.stage-a-after.tsv
diff -u /tmp/task6-v23-six-meta.stage-a-before.tsv /tmp/task6-v23-six-meta.stage-a-after.tsv
mkdir -p docs/superpowers/reports
chmod 0755 docs/superpowers/reports
touch "$report"
chmod 0644 "$report"
. /tmp/task6-v23-inventory.sh
repo_inventory > /tmp/task6-v23-post-inventory.tsv
python3 - <<'PY'
from pathlib import Path
pre = {line.split('\t',1)[0]: line for line in Path('/tmp/task6-v23-pre-inventory.tsv').read_text().splitlines()}
post = {line.split('\t',1)[0]: line for line in Path('/tmp/task6-v23-post-inventory.tsv').read_text().splitlines()}
allowed = {'server/scheduler/store.js','server/scheduler/writer.js','server/scheduler/index.js','server/scheduler/cutover.js','tools/scheduler-cutover.js','tools/test-scheduler.js'}
bad = [k for k in sorted(set(pre) | set(post)) if pre.get(k) != post.get(k) and k not in allowed]
if bad: raise SystemExit('TASK6_V23_SCOPE_DIFF ' + ','.join(bad))
PY
sha256sum /tmp/task6-v23-post-inventory.tsv > /tmp/task6-v23-post-inventory.tsv.sha256
{
  echo "plan_v23_sha=$(cut -d' ' -f1 /tmp/task6-v23-approved-plan.sha256)"
  echo 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3'
  echo 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf'
  echo 'v21_contract_sha=34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a'
  echo 'v22_contract_sha=93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6'
  echo "stage_a_script_sha=$(cut -d' ' -f1 /tmp/task6-v23-stage-a.sh.sha256)"
  echo "report_producer_sha=$(cut -d' ' -f1 /tmp/task6-v23-write-report-base.sh.sha256)"
  echo "helper_slice_sha=$(cut -d' ' -f1 /tmp/task6-v23-expected-helper-slice.js.sha256)"
  echo "parent_slice_sha=$(cut -d' ' -f1 /tmp/task6-v23-expected-parent-slice.js.sha256)"
  echo "overlay_slice_sha=$(cut -d' ' -f1 /tmp/task6-v23-expected-overlay.js.sha256)"
  echo "overlay_red_evidence_sha=$(cut -d' ' -f1 /tmp/task6-v23-red-evidence.tap.sha256)"
  echo "six_meta_sha=$(cut -d' ' -f1 /tmp/task6-v23-six-meta.sealed.tsv.sha256)"
  echo "stage_a_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v23-stage-a.normalized.tap.sha256)"
  echo "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v23-stage-a-throw.normalized.tap.sha256)"
  echo 'stage_a_counts=244/243/0/1'
  while IFS= read -r row; do echo "six_meta=$row"; done < /tmp/task6-v23-six-meta.sealed.tsv
} > /tmp/task6-v23-review-bundle.tsv
sha256sum /tmp/task6-v23-review-bundle.tsv > /tmp/task6-v23-review-bundle.tsv.sha256
/tmp/task6-v23-write-report-base.sh
test -f "$report"
test ! -L "$report"
test "$(python3 - <<'PY'
import os, stat
print(format(stat.S_IMODE(os.lstat('docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md').st_mode), '04o'))
PY
)" = 0644
if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js "$report"; then exit 1; fi
grep -F "plan_v23_sha=$(cut -d' ' -f1 /tmp/task6-v23-approved-plan.sha256)" "$report"
grep -F "review_bundle_sha=$(cut -d' ' -f1 /tmp/task6-v23-review-bundle.tsv.sha256)" "$report"
grep -F "report_producer_sha=$(cut -d' ' -f1 /tmp/task6-v23-write-report-base.sh.sha256)" "$report"
grep -F 'v21_contract_sha=34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a' "$report"
grep -F 'stage_a_counts=244 tests / 243 pass / 0 fail / 1 skipped' "$report"
while IFS= read -r row; do grep -F "six_meta=$row" "$report"; done < /tmp/task6-v23-six-meta.sealed.tsv
EOF
chmod +x /tmp/task6-v23-stage-a.sh
sha256sum /tmp/task6-v23-stage-a.sh > /tmp/task6-v23-stage-a.sh.sha256

. /tmp/task6-v23-six-meta.sh
make_six_meta > /tmp/task6-v23-six-meta.sealed.tsv
sha256sum /tmp/task6-v23-six-meta.sealed.tsv > /tmp/task6-v23-six-meta.sealed.tsv.sha256
SH
chmod +x /tmp/task6-v23-produce-artifacts.sh
sha256sum /tmp/task6-v23-produce-artifacts.sh > /tmp/task6-v23-produce-artifacts.sh.sha256
```

## RED evidence and helper smoke

After appending V23 slices and before green implementation, run isolated RED exactly once:

```bash
set -euo pipefail
. /tmp/task6-v23-red-parser.sh
test ! -e /tmp/task6-v23-red-evidence.tap
: > /tmp/task6-v23-red-evidence.tap
while IFS="$(printf '\t')" read -r name sentinel expected_message; do
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v23-red.XXXXXX.tap)"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"; rm -f "$tmp"; exit 1
  fi
  parse_overlay_red_tap "$tmp" "$name" "$sentinel $expected_message"
  printf '%s\nname=%s\nsentinel=%s\nexpected_message=%s\n' '### TASK6_V23_OVERLAY_RED_CASE_START' "$name" "$sentinel" "$expected_message" >> /tmp/task6-v23-red-evidence.tap
  cat "$tmp" >> /tmp/task6-v23-red-evidence.tap
  printf '%s\n' '### TASK6_V23_OVERLAY_RED_CASE_END' >> /tmp/task6-v23-red-evidence.tap
  rm -f "$tmp"
done < /tmp/task6-v23-overlay8-red-contracts.tsv
grep -c '^### TASK6_V23_OVERLAY_RED_CASE_START$' /tmp/task6-v23-red-evidence.tap | grep -E '^8$'
sha256sum /tmp/task6-v23-red-evidence.tap > /tmp/task6-v23-red-evidence.tap.sha256
```

Case 001 is the live helper smoke: it constructs `taoWriterFixture()`, which uses fixed `taoPvpFixtureAt()`, and the parser rejects `TASK6V23_FIXTURE_`, `TICK_TARGET_INVALID`, `TypeError`, and `idempotency_key` before accepting the exact missing-target assertion.

## Review append and Stage-B

Stage-B must validate reviewer artifacts and append the validator output to the report, not hand-edit reviewer lines:

```bash
cat > /tmp/task6-v23-append-reviewers.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
python3 - <<'PY' "$TASK6_V23_REVIEWER_1_ARTIFACT" "$TASK6_V23_REVIEWER_2_ARTIFACT" >> "$report"
import hashlib, os, stat, sys
paths = sys.argv[1:]
if len(paths) != 2 or paths[0] == paths[1]: raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_PATHS')
keys = ['identity','model','effort','outcome','plan_v23_sha','v21_contract_sha','stage_a_script_sha','report_producer_sha','review_bundle_sha','six_meta_sha','stage_a_normalized_tap_sha','stage_a_throw_normalized_tap_sha','overlay_red_evidence_sha']
expected = {
 'model':'gpt-5.6-sol','effort':'high','outcome':'PASS',
 'plan_v23_sha':open('/tmp/task6-v23-approved-plan.sha256').read().split()[0],
 'v21_contract_sha':'34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a',
 'stage_a_script_sha':open('/tmp/task6-v23-stage-a.sh.sha256').read().split()[0],
 'report_producer_sha':open('/tmp/task6-v23-write-report-base.sh.sha256').read().split()[0],
 'review_bundle_sha':open('/tmp/task6-v23-review-bundle.tsv.sha256').read().split()[0],
 'six_meta_sha':open('/tmp/task6-v23-six-meta.sealed.tsv.sha256').read().split()[0],
 'stage_a_normalized_tap_sha':open('/tmp/task6-v23-stage-a.normalized.tap.sha256').read().split()[0],
 'stage_a_throw_normalized_tap_sha':open('/tmp/task6-v23-stage-a-throw.normalized.tap.sha256').read().split()[0],
 'overlay_red_evidence_sha':open('/tmp/task6-v23-red-evidence.tap.sha256').read().split()[0],
}
ids, hashes = set(), set()
for path in paths:
    st = os.lstat(path)
    if not stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode): raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_TYPE')
    data = open(path,'rb').read(); h = hashlib.sha256(data).hexdigest()
    if h in hashes: raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_SHA_DUP')
    hashes.add(h)
    lines = data.decode('utf-8').splitlines()
    if len(lines) != 13: raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_LINE_COUNT')
    parsed = {}
    for line in lines:
        if '=' not in line: raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_FORMAT')
        k,v = line.split('=',1)
        if k in parsed: raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_DUP_KEY')
        parsed[k]=v
    if list(parsed.keys()) != keys: raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_KEYS')
    for k,v in expected.items():
        if parsed[k] != v: raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_VALUE_' + k)
    if not parsed['identity'] or parsed['identity'] in ids: raise SystemExit('TASK6_V23_REVIEW_ARTIFACT_IDENTITY')
    ids.add(parsed['identity'])
    print('reviewer\tidentity={}\tmodel=gpt-5.6-sol\teffort=high\toutcome=PASS\treview_bundle_sha={}\tartifact_sha={}'.format(parsed['identity'], parsed['review_bundle_sha'], h))
PY
chmod 0644 "$report"
SH
chmod +x /tmp/task6-v23-append-reviewers.sh
/tmp/task6-v23-append-reviewers.sh
/tmp/task6-v23-stage-a.sh
python3 - <<'PY'
rows = [line for line in open('docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md') if line.startswith('reviewer\t')]
if len(rows) != 2: raise SystemExit('TASK6_V23_REVIEWER_COUNT')
ids, bundles, arts = set(), set(), set()
bundle = open('/tmp/task6-v23-review-bundle.tsv.sha256').read().split()[0]
for row in rows:
    parts = dict(field.split('=',1) for field in row.rstrip('\n').split('\t')[1:])
    ids.add(parts.get('identity')); bundles.add(parts.get('review_bundle_sha')); arts.add(parts.get('artifact_sha'))
if len(ids) != 2 or bundles != {bundle} or len(arts) != 2: raise SystemExit('TASK6_V23_REVIEWER_BINDING')
PY
```

## V23 helper fixed PvP block

```js
// TASK6_V23_HELPER_FIXED_PVP_START
function task6v23AdvanceFixtureAccount(x, accountId, atS) {
  x.clock.setS(atS);
  damBaoLeaseFixture(x);
  x.kho.trongGiaoDich(function () {
    var mutation = taoMutationTam(x.lease, {value: 50_000}, x.clock.nowMs());
    x.world.trongMutationScheduler(mutation, function () {
      x.service.advanceTo(mutation, accountId, atS, undefined);
    });
  }, {immediate: true});
}
function taoPvpFixtureAt(arrivalAtS) {
  var x = taoWorldSchedulerTam(), alliance = 'LienMinh' + x.target;
  x.clock.setS(arrivalAtS - 120);
  x.lease = layLease(x, '00000000-0000-4000-8000-000000000006');
  x.supporter = themTaiKhoan(x.kho, 'supporter-' + path.basename(x.file), giayTuClock(x.clock));
  x.unrelatedAccount = themTaiKhoan(x.kho, 'unrelated-' + path.basename(x.file), giayTuClock(x.clock));
  x.kho.trongGiaoDich(function () {
    var mutation = taoMutationTam(x.lease, undefined, x.clock.nowMs());
    x.world.trongMutationScheduler(mutation, function () {
      x.world.taoDeQuoc(x.supporter, 'Supporter', {mutation: mutation});
      x.world.taoDeQuoc(x.unrelatedAccount, 'Unrelated', {mutation: mutation});
    });
  }, {immediate: true});
  x.kho.q.lmThem.run(alliance, 'LM' + x.target, x.target, arrivalAtS - 90_000, null);
  x.kho.q.chienThemTK.run(x.attacker, x.target, arrivalAtS - 90_000);
  var defender = coDinhTimeline(docState(x.kho, x.target), arrivalAtS - 120);
  defender.lm = {ten: alliance};
  luuQuaMutation(x, x.target, defender);
  var supporter = coDinhTimeline(docState(x.kho, x.supporter), arrivalAtS - 120);
  supporter.lm = {ten: alliance};
  supporter.fleets.push(holdAt(supporter, x.targetHome, x.target, arrivalAtS));
  luuQuaMutation(x, x.supporter, supporter);
  var unrelated = coDinhTimeline(docState(x.kho, x.unrelatedAccount), arrivalAtS - 120);
  luuQuaMutation(x, x.unrelatedAccount, unrelated);
  var attacker = coDinhTimeline(docState(x.kho, x.attacker), arrivalAtS - 120);
  attacker.fleets.push(attackTo(attacker, x.targetHome));
  luuQuaMutation(x, x.attacker, attacker);
  installAdvanceServiceFixture(x);
  task6v23AdvanceFixtureAccount(x, x.attacker, arrivalAtS);
  var row = x.kho.db.prepare(
    "SELECT idempotency_key FROM event_jobs WHERE kind='PVP_RESOLVE' " +
    'ORDER BY sequence LIMIT 1'
  ).get();
  assert.ok(row && row.idempotency_key, 'TASK6V23_FIXTURE_PVP_JOB_CREATED');
  x.pvpStoredJob = x.store.getByIdempotencyKey(row.idempotency_key);
  assert.ok(x.pvpStoredJob && x.pvpStoredJob.id, 'TASK6V23_FIXTURE_PVP_JOB_LOADABLE');
  x.pvpJob = x.pvpStoredJob;
  x.pvpExecutable = null;
  x.reducer = new EventReducer({
    kho: x.kho, world: x.world, store: x.store,
    clock: x.clock, advanceService: x.service
  });
  return x;
}
function tuaFixtureQuaDichVu(x, accountId, atS) {
  task6v23AdvanceFixtureAccount(x, accountId, atS);
}
// TASK6_V23_HELPER_FIXED_PVP_END
```

## V23 replacement overlay bodies

```js
// TASK6_V23_REPLACEMENT_START STARTUP
test('Task 6 v23 overlay startup renews after recovery before ready and publishes after commit', async function () {
  var sentinel = 'TASK6V23_RED_004_STARTUP_RENEW';
  var x;
  var timers = taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }});
  x = taoWriterFixture({manualDrain: false, timers: timers});
  var order = [], entryNow, resumeCalls = 0, finalFenceCalls = 0;
  var resumedJobId = null, beforeResumeLock = null, afterResumeRow = null;
  try {
    ['listExpiredRunningForRecovery', 'listOwnedRunningForRecovery', 'resumeOwnedRunning']
      .forEach(function (name) { task6v23RequireFunction(x.store, name, sentinel); });
    task6v23RequireFunction(x.writer, 'refreshLeasePhaseInCurrentUow', sentinel);
    x.clock.setS(x.pvpJob.scheduled_at_s);
    var setupToken = layLease(x, x.ownerId);
    var setupNow = x.clock.nowMs();
    var ownedRunning = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(setupToken, x.pvpJob.id, setupNow, 15_000, {allowFuturePending: true});
    }, {immediate: true});
    resumedJobId = ownedRunning.id;
    beforeResumeLock = task6v23LockProjection(task6v23RawJob(x.kho, resumedJobId));
    var originalExpired = x.store.listExpiredRunningForRecovery;
    var originalOwned = x.store.listOwnedRunningForRecovery;
    var originalRecover = x.store.recoverExpiredRunning;
    var originalRenew = x.store.renewLease;
    var originalResume = x.store.resumeOwnedRunning;
    var originalFence = x.writer.refreshLeasePhaseInCurrentUow;
    x.store.listExpiredRunningForRecovery = function () { order.push('listExpired'); return originalExpired.apply(this, arguments); };
    x.store.listOwnedRunningForRecovery = function () { order.push('listOwned'); return originalOwned.apply(this, arguments); };
    x.store.recoverExpiredRunning = function () { order.push('recover'); x.clock.advanceMs(14_900); return originalRecover.apply(this, arguments); };
    x.store.renewLease = function (token, nowMs, leaseMs) {
      order.push('renew:' + nowMs);
      assert.equal(x.writer.ready, false, sentinel + ' renew before ready');
      assert.equal(timers.soDangCho(), 0, sentinel + ' no timer before commit');
      assert.ok(nowMs >= entryNow + 14_900, sentinel + ' fresh post-recovery now');
      return originalRenew.apply(this, arguments);
    };
    x.store.resumeOwnedRunning = function (token, jobId, nowMs, lockMs) {
      resumeCalls++;
      order.push('resume:' + jobId);
      assert.equal(jobId, resumedJobId, sentinel + ' resumes staged owned job');
      assert.equal(x.writer.ready, false, sentinel + ' resume before ready');
      assert.equal(timers.soDangCho(), 0, sentinel + ' no timer before resume commit');
      afterResumeRow = originalResume.apply(this, arguments);
      return afterResumeRow;
    };
    x.writer.refreshLeasePhaseInCurrentUow = function () {
      finalFenceCalls++;
      order.push('finalFence');
      assert.equal(x.writer.ready, false, sentinel + ' final fence before ready');
      assert.equal(timers.soDangCho(), 0, sentinel + ' no timer before final fence commit');
      return originalFence.apply(this, arguments);
    };
    entryNow = x.clock.nowMs();
    await x.writer.start();
    assert.deepEqual(order.map(function (item) { return item.split(':')[0]; }),
      ['listExpired', 'listOwned', 'recover', 'renew', 'resume', 'finalFence'],
      sentinel + ' exact recovery order');
    assert.equal(resumeCalls, 1, sentinel + ' one owned resume');
    assert.equal(finalFenceCalls, 1, sentinel + ' one final fence');
    assert.ok(Number(afterResumeRow.locked_until_ms) > Number(beforeResumeLock.locked_until_ms), sentinel + ' lock rebased');
    var readyStatus = x.writer.status();
    assert.equal(readyStatus.ready, true, sentinel + ' ready after commit');
    assert.ok(readyStatus.wakeTimerActive || readyStatus.pollTimerActive ||
      readyStatus.heartbeatTimerActive || readyStatus.continuationActive,
      sentinel + ' public status exposes timer');
    assert.ok(timers.soDangCho() > 0, sentinel + ' timers after commit');
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});
// TASK6_V23_REPLACEMENT_END STARTUP

// TASK6_V23_REPLACEMENT_START DUE61
test('Task 6 v23 overlay advance due keeps live order and enqueues continuation at sixty one', async function () {
  var sentinel = 'TASK6V23_RED_005_DUE61_ORDER';
  var x = taoWriterFixture({manualDrain: false});
  var timers = taoBoHenGia(x.clock);
  var processed = [], closureRan = false, helperCalls = 0;
  try {
    task6v23RequireFunction(x.writer, 'advanceDueInCurrentUow', sentinel);
    x.writer.timers = timers;
    await x.writer.start();
    var beforeCommandTimerCount = timers.soDangCho();
    assert.equal(x.writer.status().continuationActive, false, sentinel + ' continuation initially inactive');
    var originalAll = x.kho.q.dqDenHan.all;
    var originalDirect = x.writer.directAccountOutcomeInCurrentUow;
    var originalHelper = x.writer.advanceDueInCurrentUow;
    var nowS = Math.floor(x.clock.nowMs() / 1000);
    var mixed = [{tk: 3, keTiep: nowS - 2}, {tk: 1, keTiep: nowS - 1}, {tk: 2, keTiep: nowS - 1}];
    for (var i = 4; i <= 61; i++) mixed.push({tk: i, keTiep: nowS});
    x.kho.q.dqDenHan.all = function (queryNowS, limit) {
      assert.equal(limit, 61, sentinel + ' limit plus one');
      assert.ok(queryNowS >= nowS, sentinel + ' query now');
      return mixed.slice();
    };
    x.writer.directAccountOutcomeInCurrentUow = function (mutation, accountId, targetS) {
      processed.push(Number(accountId));
      assert.ok(targetS <= Math.floor(x.clock.nowMs() / 1000), sentinel + ' target not future');
      return {partial: false, processed: 1, advancedToS: targetS, nextDueAtS: null, hasMoreDue: false, budgetExhausted: false};
    };
    x.writer.advanceDueInCurrentUow = function () { helperCalls++; return originalHelper.apply(this, arguments); };
    var result = await x.scheduler.runCommand({name: 'advance-due', run: function () { closureRan = true; return 'closure'; }});
    assert.equal(helperCalls, 1, sentinel + ' helper once');
    assert.deepEqual(processed.slice(0, 3), [3, 1, 2], sentinel + ' live order');
    assert.equal(processed.length, 60, sentinel + ' first sixty');
    assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'}, sentinel + ' partial');
    assert.equal(closureRan, false, sentinel + ' closure skipped');
    assert.equal(x.writer.status().continuationActive, true, sentinel + ' continuation status');
    assert.ok(timers.soDangCho() > beforeCommandTimerCount, sentinel + ' continuation timer armed');
    x.kho.q.dqDenHan.all = originalAll;
    x.writer.directAccountOutcomeInCurrentUow = originalDirect;
    x.writer.advanceDueInCurrentUow = originalHelper;
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});
// TASK6_V23_REPLACEMENT_END DUE61

// TASK6_V23_REPLACEMENT_START CUTOVER
test('Task 6 v23 overlay maintenance cutover validates guards and release precedence', function () {
  var sentinel = 'TASK6V23_RED_006_CUTOVER_RELEASE';
  var cutover = require('../server/scheduler/cutover.js');
  var storeModule = require('../server/scheduler/store.js');
  var runMaintenanceCutover = cutover.runMaintenanceCutover;
  task6v23RequireFunction(cutover, 'runMaintenanceCutover', sentinel);
  var originalAcquire = storeModule.SchedulerStore.prototype.acquireLease;
  var originalRelease = storeModule.SchedulerStore.prototype.releaseLease;
  var originalWriteAudit = storeModule.SchedulerStore.prototype.writeAudit;
  try {
    var success = taoKhoTam(), acquired = null, released = null;
    try {
      storeModule.SchedulerStore.prototype.acquireLease = function () {
        acquired = originalAcquire.apply(this, arguments);
        return acquired;
      };
      storeModule.SchedulerStore.prototype.releaseLease = function (token) {
        released = token;
        return originalRelease.apply(this, arguments);
      };
      var result = runMaintenanceCutover({kho: success.kho, clock: fakeClock(NOW_MS),
        ownerId: '00000000-0000-4000-8000-000000000501'});
      assert.deepEqual(result, {mode: 'durable', imported: 0, recovered: 0}, sentinel + ' exact result');
      assert.equal(released.ownerId, acquired.ownerId, sentinel + ' release same owner');
      assert.equal(Number(released.generation), Number(acquired.generation), sentinel + ' release same generation');
      assert.equal(success.kho.cauhinh('seed'), null, sentinel + ' no legacy seed');
      assert.match(success.kho.cauhinh('combat_seed_key_v1'), /^[0-9a-f]{64}$/, sentinel + ' combat seed');
      assert.deepEqual(success.kho.db.prepare(
        "SELECT action,job_id,detail_safe FROM scheduler_audit WHERE action='CUTOVER' ORDER BY id DESC LIMIT 1"
      ).get(), {action: 'CUTOVER', job_id: null, detail_safe: 'fresh-only'}, sentinel + ' audit');
      assert.throws(function () {
        runMaintenanceCutover({kho: success.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000505'});
      }, /SCHEDULER_CUTOVER_ALREADY_DURABLE/, sentinel + ' already durable');
    } finally { dongKhoTam(success); }
    var nonempty = taoKhoTam();
    try {
      var legacyId = Number(nonempty.kho.db.prepare(
        'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
      ).run('v23-cutover-legacy', 'V23 Cutover Legacy', 'h', 's', 1, 1).lastInsertRowid);
      nonempty.kho.db.prepare(
        'INSERT INTO dq(' +
        'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
        'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(legacyId, '{"legacy":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
      assert.throws(function () {
        runMaintenanceCutover({kho: nonempty.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000502'});
      }, /SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED/, sentinel + ' nonempty fresh DB');
    } finally { dongKhoTam(nonempty); }
    var primary = taoKhoTam(), primaryReleased = false;
    try {
      storeModule.SchedulerStore.prototype.writeAudit = function () {
        throw new Error('PRIMARY_WRITE_AUDIT_FAILURE');
      };
      storeModule.SchedulerStore.prototype.releaseLease = function () {
        primaryReleased = true;
        throw new Error('RELEASE_FAILURE');
      };
      assert.throws(function () {
        runMaintenanceCutover({kho: primary.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000503'});
      }, /PRIMARY_WRITE_AUDIT_FAILURE/, sentinel + ' primary over release');
      assert.equal(primaryReleased, true, sentinel + ' release attempted after primary');
    } finally { dongKhoTam(primary); }
    var releaseOnly = taoKhoTam();
    try {
      storeModule.SchedulerStore.prototype.writeAudit = originalWriteAudit;
      storeModule.SchedulerStore.prototype.releaseLease = function () {
        throw new Error('RELEASE_ONLY_FAILURE');
      };
      assert.throws(function () {
        runMaintenanceCutover({kho: releaseOnly.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000504'});
      }, /RELEASE_ONLY_FAILURE/, sentinel + ' release only');
    } finally { dongKhoTam(releaseOnly); }
  } finally {
    storeModule.SchedulerStore.prototype.acquireLease = originalAcquire;
    storeModule.SchedulerStore.prototype.releaseLease = originalRelease;
    storeModule.SchedulerStore.prototype.writeAudit = originalWriteAudit;
  }
});
// TASK6_V23_REPLACEMENT_END CUTOVER

// TASK6_V23_REPLACEMENT_START CLI
test('Task 6 v23 overlay scheduler cutover CLI grammar lifecycle and exact exports', async function () {
  var sentinel = 'TASK6V23_RED_007_CLI';
  var cli = require('./scheduler-cutover.js');
  var priorExitCode = process.exitCode;
  try {
    task6v23RequireFunction(cli, 'runCli', sentinel);
    assert.deepEqual(Object.keys(cli).sort(), ['main', 'parseArgs', 'runCli'].sort(), sentinel + ' exports');
    assert.deepEqual(cli.parseArgs(['--db', '/tmp/game.sqlite', '--action', 'cutover']),
      {dbPath: '/tmp/game.sqlite', action: 'cutover'}, sentinel + ' valid grammar');
    [
      ['--action', 'cutover', '--db', '/tmp/game.sqlite'],
      ['--db', '', '--action', 'cutover'],
      ['--db', '/tmp', '--action', 'cutover'],
      ['--db', '/tmp/game.sqlite', '--action', 'cutover', '--action', 'cutover'],
      ['--db', '/tmp/game.sqlite', '--unknown', 'cutover'],
      ['--db', '/tmp/game.sqlite'],
      ['--db', '/tmp/game.sqlite', '--action', 'cutover', 'extra']
    ].forEach(function (argv) {
      assert.throws(function () { cli.parseArgs(argv); }, /SCHEDULER_CLI_ARGS_INVALID/,
        sentinel + ' invalid grammar ' + argv.join(' '));
    });
    var x = taoKhoTam(), closed = 0, originalDong = x.kho.dong.bind(x.kho);
    x.kho.dong = function () { closed++; return originalDong(); };
    try {
      var result = await cli.runCli(['--db', x.file, '--action', 'cutover'], {
        makeOwnerId: function () { return '00000000-0000-4000-8000-000000000601'; },
        clock: fakeClock(NOW_MS),
        openKho: function () { return x.kho; }
      });
      assert.equal(result.exitCode, 0, sentinel + ' success exit');
      assert.equal(closed, 1, sentinel + ' success closes');
      assert.equal(result.stderr, '', sentinel + ' success stderr');
      assert.equal(result.stdout, JSON.stringify({action: 'cutover', mode: 'durable',
        imported: 0, recovered: 0}) + '\n', sentinel + ' success stdout');
    } finally { removeDb(x.file); }
    var unsafe = await cli.runCli(['--db', '/tmp/game.sqlite', '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000602'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { throw new Error('contains secret payload'); }
    });
    assert.equal(unsafe.stderr, 'SCHEDULER_CUTOVER_FAILED\n', sentinel + ' safe generic error');
    var primaryClose = taoKhoTam(), primaryCloseCount = 0, primaryCloseReal = primaryClose.kho.dong.bind(primaryClose.kho);
    primaryClose.kho.dong = function () {
      primaryCloseCount++;
      primaryCloseReal();
      throw Object.assign(new Error('bad close'), {code: 'BAD_CLOSE'});
    };
    try {
      var legacyId = Number(primaryClose.kho.db.prepare(
        'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
      ).run('v23-cli-legacy', 'V23 CLI Legacy', 'h', 's', 1, 1).lastInsertRowid);
      primaryClose.kho.db.prepare(
        'INSERT INTO dq(' +
        'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
        'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(legacyId, '{"legacy":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
      var primaryWins = await cli.runCli(['--db', primaryClose.file, '--action', 'cutover'], {
        makeOwnerId: function () { return '00000000-0000-4000-8000-000000000603'; },
        clock: fakeClock(NOW_MS),
        openKho: function () { return primaryClose.kho; }
      });
      assert.equal(primaryWins.stderr, 'SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED\n', sentinel + ' primary over close');
      assert.equal(primaryCloseCount, 1, sentinel + ' primary close attempted');
    } finally { removeDb(primaryClose.file); }
    var closeDb = taoKhoTam(), closeCount = 0, realClose = closeDb.kho.dong.bind(closeDb.kho);
    closeDb.kho.dong = function () {
      closeCount++;
      realClose();
      throw Object.assign(new Error('bad close'), {code: 'BAD_CLOSE'});
    };
    var closeOnly = await cli.runCli(['--db', closeDb.file, '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000604'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { return closeDb.kho; }
    });
    assert.equal(closeOnly.exitCode, 1, sentinel + ' close-only exit');
    assert.equal(closeOnly.stdout, '', sentinel + ' close-only stdout');
    assert.equal(closeOnly.stderr, 'BAD_CLOSE\n', sentinel + ' close-only code');
    assert.equal(closeCount, 1, sentinel + ' close-only count');
    removeDb(closeDb.file);
    var out = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var err = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var mainResult = await cli.main(['--db', '/tmp', '--action', 'cutover'], {}, {stdout: out, stderr: err}, {});
    assert.equal(mainResult.exitCode, 1, sentinel + ' main result');
    assert.equal(process.exitCode, 1, sentinel + ' process exitCode');
    assert.equal(err.chunks.join(''), 'SCHEDULER_CLI_ARGS_INVALID\n', sentinel + ' main stderr');
  } finally {
    process.exitCode = priorExitCode;
  }
});
// TASK6_V23_REPLACEMENT_END CLI

// TASK6_V23_REPLACEMENT_START EXACT_NULL
test('Task 6 v23 overlay exact null partial retains running lock without lifecycle calls', function () {
  var sentinel = 'TASK6V23_RED_008_EXACT_NULL_PARTIAL';
  var T = 1_800_010_081, x = taoWorldSchedulerTam();
  try {
    x.clock.setS(T - 1);
    x.lease = layLease(x, x.lease.ownerId);
    installAdvanceServiceFixture(x);
    var state = coDinhTimeline(docState(x.kho, x.attacker), T - 1);
    state.planets[0].qB = [{id: 'metalMine', n: 1, xong: T, tg: 0}];
    luuQuaMutation(x, x.attacker, state);
    var accountRow = x.kho.db.prepare(
      "SELECT idempotency_key FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' ORDER BY sequence DESC LIMIT 1"
    ).get();
    assert.ok(accountRow && accountRow.idempotency_key, 'TASK6V23_FIXTURE_ACCOUNT_JOB_CREATED');
    x.accountJob = x.store.getByIdempotencyKey(accountRow.idempotency_key);
    assert.ok(x.accountJob && x.accountJob.id, 'TASK6V23_FIXTURE_ACCOUNT_JOB_LOADABLE');
    x.reducer = new EventReducer({kho: x.kho, world: x.world, store: x.store,
      clock: x.clock, advanceService: x.service});
    x.ownerId = '00000000-0000-4000-8000-000000000881';
    x.writer = new SchedulerWriter({
      ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: 1_000, leaseMs: 15_000, manualDrain: true
    });
    task6v23RequireFunction(x.writer, 'executeClaimedInCurrentUow', sentinel);
    x.clock.setS(T);
    var token = layLease(x, x.ownerId);
    x.writer.leaseToken = token;
    var forbidden = ['checkpointPartial', 'blockOwnedAccountAdvance', 'insertApplication',
      'finishResolved', 'completeApplied', 'completeAccountAdvanceAndScheduleSuccessor',
      'releaseBlockedAccountDependents'];
    var calls = {}, faultCalls = 0, recordJobCalls = 0;
    forbidden.forEach(function (name) {
      if (typeof x.store[name] === 'function') {
        calls[name] = 0;
        var real = x.store[name].bind(x.store);
        x.store[name] = function () { calls[name]++; return real.apply(null, arguments); };
      }
    });
    x.writer.callFaultHook = function () { faultCalls++; };
    var prepareCalls = 0, applyCalls = 0, effectSeen = null, beforeLock = null, afterLock = null, outcome = null;
    var prepared = {kind: 'partial', deferredExternal: false,
      advanceResult: {processed: 0, advancedToS: T, nextDueAtS: T, hasMoreDue: true, budgetExhausted: true}};
    x.reducer.prepare = function (mutation, executable) {
      prepareCalls++;
      assert.equal(executable.kind, 'ACCOUNT_ADVANCE', sentinel + ' branded account executable');
      return prepared;
    };
    x.reducer.applyPrepared = function (mutation, actualPrepared) {
      applyCalls++;
      assert.equal(actualPrepared, prepared, sentinel + ' prepared identity');
      effectSeen = {checkpointRevision: null, saveReceipt: null};
      return effectSeen;
    };
    x.kho.trongGiaoDich(function () {
      var nowMs = x.clock.nowMs();
      var claimed = x.store.claimNext(token, nowMs, T, 15_000);
      beforeLock = task6v23LockProjection(task6v23RawJob(x.kho, claimed.id));
      var mutation = taoMutationTam(token, {value: 0}, nowMs);
      var originalRecordJob = mutation.recordJob;
      if (typeof originalRecordJob === 'function') {
        mutation.recordJob = function () {
          recordJobCalls++;
          return originalRecordJob.apply(this, arguments);
        };
      }
      outcome = x.world.trongMutationScheduler(mutation, function () {
        return x.writer.executeClaimedInCurrentUow(mutation, claimed, nowMs, {executionTargetS: T});
      });
      afterLock = task6v23LockProjection(task6v23RawJob(x.kho, claimed.id));
    }, {immediate: true});
    assert.equal(prepareCalls, 1, sentinel + ' prepare once');
    assert.equal(applyCalls, 1, sentinel + ' apply once');
    assert.equal(Object.getPrototypeOf(effectSeen), Object.prototype, sentinel + ' plain effect');
    assert.deepEqual(Object.keys(effectSeen), ['checkpointRevision', 'saveReceipt'], sentinel + ' exact key order');
    assert.equal(Object.getOwnPropertySymbols(effectSeen).length, 0, sentinel + ' no symbols');
    assert.deepEqual(effectSeen, {checkpointRevision: null, saveReceipt: null}, sentinel + ' exact null wrapper');
    assert.equal(outcome.partial, true, sentinel + ' partial outcome');
    assert.deepEqual(afterLock, beforeLock, sentinel + ' running lock unchanged');
    forbidden.forEach(function (name) { assert.equal(calls[name] || 0, 0, sentinel + ' zero ' + name); });
    assert.equal(recordJobCalls, 0, sentinel + ' zero recordJob');
    assert.equal(faultCalls, 0, sentinel + ' zero fault hook');
  } finally { x.dong(); }
});
// TASK6_V23_REPLACEMENT_END EXACT_NULL
```

## Self-audit checklist

- [ ] V23 is a new file; V22 and all source/test files are preserved.
- [ ] `/tmp/task6-v23-produce-artifacts.sh` creates all V23 artifact dependencies from fresh `/tmp`.
- [ ] Startup overlay has one `var timers` declaration, creates a real owned `RUNNING` row, asserts exactly one resume, asserts renew-before-resume-before-final-fence, and uses `writer.status()` for timer booleans.
- [ ] Due61 uses `manualDrain:false`, fake timers, and `writer.status().continuationActive`.
- [ ] Report producer `chmod 0644 "$report"` occurs after `mv`.
- [ ] RED parser is ordinal-independent and fail-closed.
- [ ] Reviewer append command writes validator output to the report and Stage-B validates two distinct identity/path/artifact hashes bound to the exact digest bundle.
