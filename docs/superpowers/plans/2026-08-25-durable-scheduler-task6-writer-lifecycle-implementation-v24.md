# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V24

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for this plan. Do not spawn implementation subagents unless root explicitly asks. This plan is a corrective workflow plan for Task6 implementation; execute the checkboxes in order.

**Goal:** Implement Task6 writer lifecycle/global watermark/retry/backoff/quarantine using the accepted Task5 seams, while preserving parent Task6 runtime tests and adding the V23/V24 overlay regressions with genuine TDD ordering.

**Architecture:** V24 keeps the V23 production contracts and counts, but replaces the broken single producer with a two-phase artifact workflow. Phase0 runs before any source/test/report edit and freezes baseline/prefix/pre-inventory/expected slices/RED tooling. After skeletons and sealed test slices are appended, overlay RED runs exactly once. PhaseA runs only after GREEN implementation and produces post artifacts, report, review bundle, and Stage-A validation.

**Tech Stack:** Node.js built-in test runner with TAP, SQLite-backed scheduler store, existing `Kho`/`World`/Task5 reducer seams, shell/Python/Node validation scripts.

**Spec:** `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` Task6 section beginning around line 10866, accepted Task5 remediation plan, live accepted Task1-5 code.

---

## Global constraints

- Preserve V1-V23 plan artifacts; create only this V24 plan file during planning.
- Implementation may modify only these six Task6-owned files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- Counts remain `parent runtime=73 + overlay=8 => N=81`; final scheduler TAP is `244 tests / 243 pass / 0 fail / 1 skipped`.
- Root supplies `TASK6_V24_APPROVED_SHA`. V24 never embeds its own hash; scripts compare the externally approved hash.
- V24 uses pinned V23 only as an immutable source for the corrected overlay bodies and contracts. V23 workflow commands are not reused.

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md
93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md
721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md
```

## Retained production contracts

V24 retains the V23 production scope and corrections:

- Store primitives: `quarantineClaimedRaw(token, rawRow, failure, nowMs)`, `retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs)`, `validateBlockedAccountAdvanceForDependency(token, accountId, revision, dependencyJobId, targetS, nowMs)`, `listExpiredRunningForRecovery(token, nowMs)`, `listOwnedRunningForRecovery(token, nowMs)`.
- Writer lifecycle/status/private seams, startup renew-before-ready, timers, global/account claim, failure settlement, `advanceDueInCurrentUow`, `runCommand`, direct external continuation, public five-key `advanceTo`.
- Index public exports exactly `{taoScheduler, inRange, resolveDurableSchedulerOptions}` and non-enumerable Task7 bridge seams `_datSignalHandlerInstalled`, `_beginStop`, `_waitForStopFinalization`, `_datDatabaseClosing`.
- Cutover exact synchronous `runMaintenanceCutover({kho, clock, ownerId})`.
- CLI exact exports `{parseArgs, runCli, main}`, strict grammar `--db <file> --action cutover`, safe code-only stderr, close precedence.

## Required execution order

Do not reorder these phases.

1. **Phase0 before edits:** run `/tmp/task6-v24-phase0.sh` before changing any source/test/report file. It freezes baseline `163`, prefix bytes, pre-inventory, expected helper/parent/overlay slices, overlay contracts, RED parser/runner, and Stage scripts.
2. **Skeletons:** create minimal module skeletons/exports in the six owned files only, enough for `tools/test-scheduler.js` to load.
3. **Append sealed test slices:** append helper, parent73, and overlay8 slices from the Phase0 artifact directory to `tools/test-scheduler.js` between the V24 markers.
4. **RED:** run `/tmp/task6-v24-red-run.sh` exactly once. It must produce 8 RED cases, each failing at the targeted first assertion with `ERR_ASSERTION` and the exact sentinel/message. Loader, fixture, TypeError, SQL, marker, and helper failures are rejected.
5. **GREEN:** implement Task6 production code in the six owned files until the full scheduler suite reaches `244/243/0/1`.
6. **PhaseA:** run `/tmp/task6-v24-phase-a.sh`; it validates slices, prefix, post-inventory allowlist, six metadata, fresh normal/throw TAP, report draft, and review bundle.
7. **Reviews and StageB:** launch two fresh Sol/high reviews over the PhaseA bundle and exact six-file metadata. Append only machine-validated reviewer artifacts, then run `/tmp/task6-v24-stage-b.sh`.

## Phase0 script: run before any source/test/report edit

Create and run this from repo root before changing files:

```bash
cat > /tmp/task6-v24-phase0.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

test -n "${TASK6_V24_APPROVED_SHA:-}"
case "$TASK6_V24_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V24_APPROVED_SHA}" -eq 64

export TASK6_V24_DIR="${TASK6_V24_DIR:-/tmp/task6-v24-artifacts}"
case "$TASK6_V24_DIR" in /tmp/task6-v24-artifacts|/tmp/task6-v24-artifacts/*) ;; *) exit 1 ;; esac
rm -rf "$TASK6_V24_DIR"
mkdir -p "$TASK6_V24_DIR"

plan='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md'
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'
task5='docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md'
v20='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md'
v21='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md'
v22='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md'
v23='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md'
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'

printf '%s  %s\n' "$TASK6_V24_APPROVED_SHA" "$plan" > "$TASK6_V24_DIR/approved-plan.sha256"
cat > "$TASK6_V24_DIR/authorities.sha256" <<'EOF'
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md
93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md
721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md
EOF
sha256sum -c "$TASK6_V24_DIR/approved-plan.sha256"
sha256sum -c "$TASK6_V24_DIR/authorities.sha256"

cat > "$TASK6_V24_DIR/env.sh" <<EOF
export TASK6_V24_DIR='$TASK6_V24_DIR'
export TASK6_V24_REPORT='$report'
EOF

cat > "$TASK6_V24_DIR/tap-normalize.sh" <<'EOF'
normalize_tap_for_hash() {
  sed -E '/^[[:space:]]+duration_ms:/d;/^# duration_ms /d' "$1"
}
EOF
sha256sum "$TASK6_V24_DIR/tap-normalize.sh" > "$TASK6_V24_DIR/tap-normalize.sh.sha256"

cat > "$TASK6_V24_DIR/inventory.sh" <<'EOF'
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
    if p in excluded:
        continue
    try:
        st = os.lstat(p)
    except FileNotFoundError:
        print(p + '\tmissing\t-\t-\t-\t-\t' + tracked.get(p, '-'))
        continue
    fs_mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    git_mode = tracked.get(p, '-')
    if stat.S_ISLNK(st.st_mode):
        print(p + '\tsymlink\t' + fs_mode + '\t' + str(st.st_size) + '\t-\t' + os.readlink(p) + '\t' + git_mode)
    elif stat.S_ISREG(st.st_mode):
        with open(p, 'rb') as f:
            h = hashlib.sha256(f.read()).hexdigest()
        print(p + '\tfile\t' + fs_mode + '\t' + str(st.st_size) + '\t' + h + '\t-\t' + git_mode)
    elif stat.S_ISDIR(st.st_mode):
        print(p + '\tdir\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
    else:
        print(p + '\tother\t' + fs_mode + '\t' + str(st.st_size) + '\t-\t-\t' + git_mode)
PY
}
EOF
sha256sum "$TASK6_V24_DIR/inventory.sh" > "$TASK6_V24_DIR/inventory.sh.sha256"
. "$TASK6_V24_DIR/inventory.sh"
repo_inventory > "$TASK6_V24_DIR/pre-inventory.tsv"
sha256sum "$TASK6_V24_DIR/pre-inventory.tsv" > "$TASK6_V24_DIR/pre-inventory.tsv.sha256"

node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > "$TASK6_V24_DIR/baseline.tap"
grep -E '^# tests 163$' "$TASK6_V24_DIR/baseline.tap"
grep -E '^# pass 162$' "$TASK6_V24_DIR/baseline.tap"
grep -E '^# fail 0$' "$TASK6_V24_DIR/baseline.tap"
grep -E '^# skipped 1$' "$TASK6_V24_DIR/baseline.tap"
node - "$TASK6_V24_DIR/baseline.tap" > "$TASK6_V24_DIR/baseline-names.txt" <<'NODE'
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
process.stdout.write(Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]).join('\n') + '\n');
NODE
wc -l "$TASK6_V24_DIR/baseline-names.txt" | grep -E '^163 '
sha256sum "$TASK6_V24_DIR/baseline-names.txt" > "$TASK6_V24_DIR/baseline-names.txt.sha256"

node > "$TASK6_V24_DIR/prefix.tsv" <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const data = fs.readFileSync('tools/test-scheduler.js');
const text = data.toString('utf8');
for (const marker of [
  '// TASK6_V24_HELPERS_START',
  '// TASK6_V24_HELPERS_END',
  '// TASK6_V24_PARENT_TESTS_START',
  '// TASK6_V24_PARENT_TESTS_END',
  '// TASK6_V24_OVERLAY_TESTS_START',
  '// TASK6_V24_OVERLAY_TESTS_END'
]) {
  if (text.includes(marker)) throw new Error('TASK6_V24_MARKER_ALREADY_PRESENT');
}
process.stdout.write(String(data.length) + '\t' + crypto.createHash('sha256').update(data).digest('hex') + '\n');
NODE
sha256sum "$TASK6_V24_DIR/prefix.tsv" > "$TASK6_V24_DIR/prefix.tsv.sha256"

cat > "$TASK6_V24_DIR/helper-imports.js" <<'EOF'
const assert = require('assert/strict');
const test = require('node:test');
const { taoKhoTam } = require('../server/kho.js');
const { taoWorld } = require('../server/world.js');
const { taoClock } = require('../server/clock.js');
const { GameAdvanceService, toPublicAdvanceResult } = require('../server/scheduler/advance-service.js');
const { EventReducer, resolveCanonicalGlobalInCurrentUow } = require('../server/scheduler/reducers.js');
const { SchedulerStore } = require('../server/scheduler/store.js');
const { taoScheduler } = require('../server/scheduler/index.js');
const { runMaintenanceCutover } = require('../server/scheduler/cutover.js');
EOF
sed -n '6411,6470p' "$parent" > "$TASK6_V24_DIR/helper-base.js"
sed -n '7601,7609p' "$parent" > "$TASK6_V24_DIR/helper-advance.js"
sed -n '7677,7702p' "$parent" > "$TASK6_V24_DIR/helper-pvp-base.js"
sed -n '7748,7802p' "$parent" > "$TASK6_V24_DIR/helper-exec-a.js"
sed -n '7813,7850p' "$parent" > "$TASK6_V24_DIR/helper-exec-b.js"
sed -n '7855,7904p' "$parent" > "$TASK6_V24_DIR/helper-account.js"
sed -n '8134,8144p' "$parent" > "$TASK6_V24_DIR/helper-local.js"
awk '/^\/\/ TASK6_V23_HELPER_FIXED_PVP_START$/{flag=1; next} /^\/\/ TASK6_V23_HELPER_FIXED_PVP_END$/{flag=0} flag' "$v23" > "$TASK6_V24_DIR/helper-fixed-pvp.js"
test -s "$TASK6_V24_DIR/helper-fixed-pvp.js"
cat "$TASK6_V24_DIR/helper-imports.js" \
  "$TASK6_V24_DIR/helper-base.js" \
  "$TASK6_V24_DIR/helper-advance.js" \
  "$TASK6_V24_DIR/helper-pvp-base.js" \
  "$TASK6_V24_DIR/helper-fixed-pvp.js" \
  "$TASK6_V24_DIR/helper-exec-a.js" \
  "$TASK6_V24_DIR/helper-exec-b.js" \
  "$TASK6_V24_DIR/helper-account.js" \
  "$TASK6_V24_DIR/helper-local.js" > "$TASK6_V24_DIR/expected-helper-slice.js"
node --check "$TASK6_V24_DIR/expected-helper-slice.js"
set +e
rg -n '^[[:space:]]*test[[:space:]]*\(' "$TASK6_V24_DIR/expected-helper-slice.js"
helper_rg_status=$?
set -e
if [ "$helper_rg_status" -eq 0 ]; then exit 1; fi
if [ "$helper_rg_status" -ne 1 ]; then exit "$helper_rg_status"; fi
sha256sum "$TASK6_V24_DIR/expected-helper-slice.js" > "$TASK6_V24_DIR/expected-helper-slice.js.sha256"

python3 > "$TASK6_V24_DIR/parent73-names.txt" <<'PY'
from pathlib import Path
v20 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md').read_text()
body = v20.split("cat > /tmp/task6-v20-parent73-names.txt <<'EOF'\n", 1)[1].split("\nEOF", 1)[0]
names = [line for line in body.split('\n') if line]
if len(names) != 73:
    raise SystemExit('TASK6_V24_PARENT73_COUNT')
print('\n'.join(names))
PY
wc -l "$TASK6_V24_DIR/parent73-names.txt" | grep -E '^73 '
sha256sum "$TASK6_V24_DIR/parent73-names.txt" > "$TASK6_V24_DIR/parent73-names.txt.sha256"

sed -n '10886,11844p' "$parent" > "$TASK6_V24_DIR/parent-block-1.md"
sed -n '11848,12485p' "$parent" > "$TASK6_V24_DIR/parent-block-2.md"
sed -n '12489,12833p' "$parent" > "$TASK6_V24_DIR/parent-block-3.md"
sed -n '12837,13070p' "$parent" > "$TASK6_V24_DIR/parent-block-4.md"
python3 "$TASK6_V24_DIR/parent-block-1.md" "$TASK6_V24_DIR/parent-block-2.md" "$TASK6_V24_DIR/parent-block-3.md" "$TASK6_V24_DIR/parent-block-4.md" > "$TASK6_V24_DIR/expected-parent-slice.js" <<'PY'
import sys
from pathlib import Path
out = []
for path in sys.argv[1:]:
    text = Path(path).read_text()
    parts = text.split('```js')
    for part in parts[1:]:
        out.append(part.split('```', 1)[0].lstrip('\n').rstrip() + '\n')
if not out:
    raise SystemExit('TASK6_V24_PARENT_BLOCK_EMPTY')
print(''.join(out), end='')
PY
test -s "$TASK6_V24_DIR/expected-parent-slice.js"
node --check "$TASK6_V24_DIR/expected-parent-slice.js"
sha256sum "$TASK6_V24_DIR/expected-parent-slice.js" > "$TASK6_V24_DIR/expected-parent-slice.js.sha256"

python3 > "$TASK6_V24_DIR/expected-overlay.js" <<'PY'
from pathlib import Path
v21 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md').read_text()
body = v21.split('// TASK6_V21_PLAN_OVERLAY_JS_START\n', 1)[1].split('// TASK6_V21_PLAN_OVERLAY_JS_END', 1)[0]
body = body.replace('task6v21', 'task6v24').replace('TASK6V21', 'TASK6V24')
body = body.replace('Task 6 v21 overlay', 'Task 6 v24 overlay')
v23 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md').read_text()
v24 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md').read_text()
def repl(name):
    if name == 'EXACT_NULL':
        return v24.split('// TASK6_V24_REPLACEMENT_START EXACT_NULL\n', 1)[1].split('// TASK6_V24_REPLACEMENT_END EXACT_NULL', 1)[0]
    body = v23.split('// TASK6_V23_REPLACEMENT_START ' + name + '\n', 1)[1].split('// TASK6_V23_REPLACEMENT_END ' + name, 1)[0]
    return body.replace('task6v23', 'task6v24').replace('TASK6V23', 'TASK6V24').replace('Task 6 v23 overlay', 'Task 6 v24 overlay')
def replace_test(src, title, replacement):
    start = src.index("test('" + title + "'")
    nxt = src.find("\ntest('Task 6 v24 overlay ", start + 1)
    if nxt < 0:
        nxt = len(src)
    return src[:start] + replacement + src[nxt:]
for name, title in [
    ('STARTUP', 'Task 6 v24 overlay startup renews after recovery before ready and publishes after commit'),
    ('DUE61', 'Task 6 v24 overlay advance due keeps live order and enqueues continuation at sixty one'),
    ('CUTOVER', 'Task 6 v24 overlay maintenance cutover validates guards and release precedence'),
    ('CLI', 'Task 6 v24 overlay scheduler cutover CLI grammar lifecycle and exact exports'),
    ('EXACT_NULL', 'Task 6 v24 overlay exact null partial retains running lock without lifecycle calls')
]:
    body = replace_test(body, title, repl(name))
if any(s in body for s in ['Task 6 v21', 'TASK6V21', 'task6v21', 'Task 6 v23', 'TASK6V23', 'task6v23']):
    raise SystemExit('TASK6_V24_OVERLAY_NAMESPACE_LEAK')
print(body, end='')
PY
node --check "$TASK6_V24_DIR/expected-overlay.js"
sha256sum "$TASK6_V24_DIR/expected-overlay.js" > "$TASK6_V24_DIR/expected-overlay.js.sha256"

cat > "$TASK6_V24_DIR/overlay8-red-contracts.tsv" <<'EOF'
Task 6 v24 overlay raw quarantine store primitive preserves attempt without parsing invalid payload	TASK6V24_RED_001_RAW_QUARANTINE_STORE	missing quarantineClaimedRaw
Task 6 v24 overlay status cache private seams bridge seams and exact scheduler exports	TASK6V24_RED_002_STATUS_EXPORTS	missing bridge._datDatabaseClosing
Task 6 v24 overlay retarget and blocked descriptor store primitives use dependency source account	TASK6V24_RED_003_RETARGET_DESCRIPTOR	missing retargetOwnedPendingAccountAdvanceForCommand
Task 6 v24 overlay startup renews after recovery before ready and publishes after commit	TASK6V24_RED_004_STARTUP_RENEW	missing listExpiredRunningForRecovery
Task 6 v24 overlay advance due keeps live order and enqueues continuation at sixty one	TASK6V24_RED_005_DUE61_ORDER	missing advanceDueInCurrentUow
Task 6 v24 overlay maintenance cutover validates guards and release precedence	TASK6V24_RED_006_CUTOVER_RELEASE	missing runMaintenanceCutover
Task 6 v24 overlay scheduler cutover CLI grammar lifecycle and exact exports	TASK6V24_RED_007_CLI	missing runCli
Task 6 v24 overlay exact null partial retains running lock without lifecycle calls	TASK6V24_RED_008_EXACT_NULL_PARTIAL	missing executeClaimedInCurrentUow
EOF
cut -f1 "$TASK6_V24_DIR/overlay8-red-contracts.tsv" > "$TASK6_V24_DIR/overlay8-names.txt"
wc -l "$TASK6_V24_DIR/overlay8-names.txt" | grep -E '^8 '
python3 "$TASK6_V24_DIR/expected-overlay.js" "$TASK6_V24_DIR/overlay8-names.txt" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text()
actual = re.findall(r"test\('([^']+)'", text)
expected = Path(sys.argv[2]).read_text().splitlines()
if actual != expected:
    raise SystemExit('TASK6_V24_OVERLAY_NAME_MISMATCH')
PY
sha256sum "$TASK6_V24_DIR/overlay8-red-contracts.tsv" > "$TASK6_V24_DIR/overlay8-red-contracts.tsv.sha256"
sha256sum "$TASK6_V24_DIR/overlay8-names.txt" > "$TASK6_V24_DIR/overlay8-names.txt.sha256"

cat > "$TASK6_V24_DIR/escape-test-name.js" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
node --check "$TASK6_V24_DIR/escape-test-name.js"
sha256sum "$TASK6_V24_DIR/escape-test-name.js" > "$TASK6_V24_DIR/escape-test-name.js.sha256"

cat > "$TASK6_V24_DIR/red-parser.sh" <<'EOF'
parse_overlay_red_tap() {
  node - "$1" "$2" "$3" <<'NODE'
const fs = require('fs');
const [file, name, expectedMessage] = process.argv.slice(2);
const tap = fs.readFileSync(file, 'utf8');
const lines = tap.split(/\r?\n/);
const start = lines.findIndex((line) => line === '# Subtest: ' + name);
if (start < 0) throw new Error('TASK6_V24_RED_SUBTEST_MISSING');
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('# Subtest: ')) { end = i; break; }
}
const block = lines.slice(start, end).join('\n');
const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (!new RegExp('^not ok [0-9]+ - ' + escaped + '$', 'm').test(block)) throw new Error('TASK6_V24_RED_STATUS_MISSING');
if (!block.includes(expectedMessage)) throw new Error('TASK6_V24_RED_MESSAGE_MISSING');
if (!block.includes("code: 'ERR_ASSERTION'")) throw new Error('TASK6_V24_RED_ASSERTION_CODE_MISSING');
for (const banned of ['MODULE_NOT_FOUND','ReferenceError','TypeError','SQLITE_','MISSING_PREREQUISITE','is not defined','fixture setup','fixture job must','idempotency_key','TICK_TARGET_INVALID','TASK6V24_FIXTURE_']) {
  if (block.includes(banned)) throw new Error('TASK6_V24_RED_BANNED_' + banned);
}
NODE
}
EOF
sha256sum "$TASK6_V24_DIR/red-parser.sh" > "$TASK6_V24_DIR/red-parser.sh.sha256"

cat > "$TASK6_V24_DIR/red-run.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V24_DIR:-/tmp/task6-v24-artifacts}"
sha256sum -c "$dir/red-parser.sh.sha256"
sha256sum -c "$dir/escape-test-name.js.sha256"
sha256sum -c "$dir/overlay8-red-contracts.tsv.sha256"
. "$dir/red-parser.sh"
test ! -e "${TASK6_V24_DIR:-/tmp/task6-v24-artifacts}/red-evidence.tap"
: > "${TASK6_V24_DIR:-/tmp/task6-v24-artifacts}/red-evidence.tap"
while IFS="$(printf '\t')" read -r name sentinel expected_message; do
  pattern="$(node "$dir/escape-test-name.js" "$name")"
  tmp="$(mktemp "$dir/red.XXXXXX.tap")"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"; rm -f "$tmp"; exit 1
  fi
  parse_overlay_red_tap "$tmp" "$name" "$sentinel $expected_message"
  printf '%s\nname=%s\nsentinel=%s\nexpected_message=%s\n' '### TASK6_V24_OVERLAY_RED_CASE_START' "$name" "$sentinel" "$expected_message" >> "$dir/red-evidence.tap"
  cat "$tmp" >> "$dir/red-evidence.tap"
  printf '%s\n' '### TASK6_V24_OVERLAY_RED_CASE_END' >> "$dir/red-evidence.tap"
  rm -f "$tmp"
done < "$dir/overlay8-red-contracts.tsv"
grep -c '^### TASK6_V24_OVERLAY_RED_CASE_START$' "$dir/red-evidence.tap" | grep -E '^8$'
sha256sum "$dir/red-evidence.tap" > "$dir/red-evidence.tap.sha256"
EOF
chmod +x "$TASK6_V24_DIR/red-run.sh"
sha256sum "$TASK6_V24_DIR/red-run.sh" > "$TASK6_V24_DIR/red-run.sh.sha256"
bash -n "$TASK6_V24_DIR/red-run.sh"

cat > "$TASK6_V24_DIR/six-meta.sh" <<'EOF'
make_six_meta() {
python3 - <<'PY'
import hashlib, os, stat, subprocess
paths = [
 'server/scheduler/store.js',
 'server/scheduler/writer.js',
 'server/scheduler/index.js',
 'server/scheduler/cutover.js',
 'tools/scheduler-cutover.js',
 'tools/test-scheduler.js',
]
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if record:
        meta, path = record.split(b'\t', 1)
        tracked[path.decode()] = meta.split()[0].decode()
for p in paths:
    st = os.lstat(p)
    if not stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode):
        raise SystemExit('TASK6_V24_META_TYPE_' + p)
    fs_mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    git_mode = tracked.get(p, '-')
    with open(p, 'rb') as f:
        data = f.read()
    print('\t'.join([p, 'file', fs_mode, git_mode, str(len(data)), hashlib.sha256(data).hexdigest()]))
PY
}
EOF
sha256sum "$TASK6_V24_DIR/six-meta.sh" > "$TASK6_V24_DIR/six-meta.sh.sha256"
. "$TASK6_V24_DIR/six-meta.sh"
make_six_meta > "$TASK6_V24_DIR/six-meta.pre.tsv"
sha256sum "$TASK6_V24_DIR/six-meta.pre.tsv" > "$TASK6_V24_DIR/six-meta.pre.tsv.sha256"

cat > "$TASK6_V24_DIR/write-report-base.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V24_DIR:-/tmp/task6-v24-artifacts}"
report="${TASK6_V24_REPORT:-docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md}"
mkdir -p "$(dirname "$report")"
test -d "$(dirname "$report")"
test ! -L "$(dirname "$report")"
chmod 0755 "$(dirname "$report")"
reviewers="$(mktemp "$dir/reviewers.XXXXXX")"
if [ -f "$report" ]; then awk '/^reviewer=/{print}' "$report" > "$reviewers"; fi
tmp="$(mktemp "$dir/report.XXXXXX")"
{
  echo 'plan_version=V24'
  echo "plan_v24_sha=$(cut -d' ' -f1 "$dir/approved-plan.sha256")"
  echo 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3'
  echo 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf'
  echo 'v20_contract_sha=1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305'
  echo 'v21_contract_sha=34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a'
  echo 'v22_contract_sha=93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6'
  echo 'v23_contract_sha=721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4'
  echo 'counts=parent73+overlay8=N81 final=244/243/0/1'
  echo "pre_inventory_sha=$(cut -d' ' -f1 "$dir/pre-inventory.tsv.sha256")"
  echo "six_meta_pre_sha=$(cut -d' ' -f1 "$dir/six-meta.pre.tsv.sha256")"
  echo "post_inventory_sha=$(cut -d' ' -f1 "$dir/post-inventory.tsv.sha256")"
  echo "baseline_names_sha=$(cut -d' ' -f1 "$dir/baseline-names.txt.sha256")"
  echo "prefix_sha=$(cut -f2 "$dir/prefix.tsv")"
  echo "prefix_len=$(cut -f1 "$dir/prefix.tsv")"
  echo "helper_slice_sha=$(cut -d' ' -f1 "$dir/expected-helper-slice.js.sha256")"
  echo "parent73_names_sha=$(cut -d' ' -f1 "$dir/parent73-names.txt.sha256")"
  echo "parent_slice_sha=$(cut -d' ' -f1 "$dir/expected-parent-slice.js.sha256")"
  echo "overlay8_names_sha=$(cut -d' ' -f1 "$dir/overlay8-names.txt.sha256")"
  echo "overlay_slice_sha=$(cut -d' ' -f1 "$dir/expected-overlay.js.sha256")"
  echo "overlay_red_evidence_sha=$(cut -d' ' -f1 "$dir/red-evidence.tap.sha256")"
  echo "phase0_script_sha=$(cut -d' ' -f1 "$dir/phase0-script.sha256")"
  echo "phase_a_script_sha=$(cut -d' ' -f1 "$dir/phase-a.sh.sha256")"
  echo "stage_a_script_sha=$(cut -d' ' -f1 "$dir/phase-a.sh.sha256")"
  echo "stage_b_script_sha=$(cut -d' ' -f1 "$dir/stage-b.sh.sha256")"
  echo "report_producer_sha=$(cut -d' ' -f1 "$dir/write-report-base.sh.sha256")"
  echo "review_bundle_sha=$(cut -d' ' -f1 "$dir/review-bundle.tsv.sha256")"
  echo "stage_a_normalized_tap_sha=$(cut -d' ' -f1 "$dir/stage-a.normalized.tap.sha256")"
  echo "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 "$dir/stage-a-throw.normalized.tap.sha256")"
  echo 'stage_a_counts=244 tests / 243 pass / 0 fail / 1 skipped'
  while IFS= read -r row; do echo "six_meta=$row"; done < "$dir/six-meta.sealed.tsv"
  cat "$reviewers"
} > "$tmp"
mv "$tmp" "$report"
chmod 0644 "$report"
rm -f "$reviewers"
EOF
chmod +x "$TASK6_V24_DIR/write-report-base.sh"
sha256sum "$TASK6_V24_DIR/write-report-base.sh" > "$TASK6_V24_DIR/write-report-base.sh.sha256"

cat > "$TASK6_V24_DIR/phase-a.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V24_DIR:-/tmp/task6-v24-artifacts}"
report="${TASK6_V24_REPORT:-docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md}"
sha256sum -c "$dir/approved-plan.sha256"
sha256sum -c "$dir/phase-a.sh.sha256"
sha256sum -c "$dir/stage-b.sh.sha256"
sha256sum -c "$dir/authorities.sha256"
sha256sum -c "$dir/tap-normalize.sh.sha256"
sha256sum -c "$dir/inventory.sh.sha256"
sha256sum -c "$dir/pre-inventory.tsv.sha256"
sha256sum -c "$dir/six-meta.pre.tsv.sha256"
sha256sum -c "$dir/baseline-names.txt.sha256"
sha256sum -c "$dir/prefix.tsv.sha256"
sha256sum -c "$dir/expected-helper-slice.js.sha256"
sha256sum -c "$dir/expected-parent-slice.js.sha256"
sha256sum -c "$dir/parent73-names.txt.sha256"
sha256sum -c "$dir/expected-overlay.js.sha256"
sha256sum -c "$dir/overlay8-red-contracts.tsv.sha256"
sha256sum -c "$dir/overlay8-names.txt.sha256"
sha256sum -c "$dir/red-run.sh.sha256"
sha256sum -c "$dir/red-parser.sh.sha256"
sha256sum -c "$dir/escape-test-name.js.sha256"
sha256sum -c "$dir/red-evidence.tap.sha256"
sha256sum -c "$dir/six-meta.sh.sha256"
sha256sum -c "$dir/write-report-base.sh.sha256"

node - "$dir/prefix.tsv" "$dir/expected-helper-slice.js" "$dir/expected-parent-slice.js" "$dir/expected-overlay.js" <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [prefixPath, helperPath, parentPath, overlayPath] = process.argv.slice(2);
const [lenRaw, sha] = fs.readFileSync(prefixPath, 'utf8').trim().split('\t');
const len = Number(lenRaw);
const current = fs.readFileSync('tools/test-scheduler.js');
const prefix = current.subarray(0, len);
const prefixHash = crypto.createHash('sha256').update(prefix).digest('hex');
if (prefixHash !== sha) throw new Error('TASK6_V24_PREFIX_CHANGED');
const helper = fs.readFileSync(helperPath, 'utf8');
const parent = fs.readFileSync(parentPath, 'utf8');
const overlay = fs.readFileSync(overlayPath, 'utf8');
const suffix =
  '// TASK6_V24_HELPERS_START\n' + helper + '// TASK6_V24_HELPERS_END\n' +
  '// TASK6_V24_PARENT_TESTS_START\n' + parent + '// TASK6_V24_PARENT_TESTS_END\n' +
  '// TASK6_V24_OVERLAY_TESTS_START\n' + overlay + '// TASK6_V24_OVERLAY_TESTS_END\n';
const expected = Buffer.concat([prefix, Buffer.from(suffix, 'utf8')]);
if (!current.equals(expected)) throw new Error('TASK6_V24_APPEND_SUFFIX_MISMATCH');
const text = current.toString('utf8');
for (const marker of [
  '// TASK6_V24_HELPERS_START',
  '// TASK6_V24_HELPERS_END',
  '// TASK6_V24_PARENT_TESTS_START',
  '// TASK6_V24_PARENT_TESTS_END',
  '// TASK6_V24_OVERLAY_TESTS_START',
  '// TASK6_V24_OVERLAY_TESTS_END'
]) {
  const matches = text.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
  if (matches.length !== 1) throw new Error('TASK6_V24_MARKER_COUNT_' + marker);
}
NODE

for part in helper parent overlay; do
  case "$part" in
    helper) start='// TASK6_V24_HELPERS_START'; end='// TASK6_V24_HELPERS_END'; expected="$dir/expected-helper-slice.js"; current="$dir/current-helper-slice.js" ;;
    parent) start='// TASK6_V24_PARENT_TESTS_START'; end='// TASK6_V24_PARENT_TESTS_END'; expected="$dir/expected-parent-slice.js"; current="$dir/current-parent-slice.js" ;;
    overlay) start='// TASK6_V24_OVERLAY_TESTS_START'; end='// TASK6_V24_OVERLAY_TESTS_END'; expected="$dir/expected-overlay.js"; current="$dir/current-overlay.js" ;;
  esac
  node - "$start" "$end" > "$current" <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const [rawStart, rawEnd] = process.argv.slice(2);
const start = rawStart + '\n';
const end = rawEnd + '\n';
const a = text.indexOf(start), b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V24_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
  cmp -s "$expected" "$current"
done

set +e
rg -n '^[[:space:]]*test[[:space:]]*\(' "$dir/current-helper-slice.js"
helper_rg_status=$?
set -e
if [ "$helper_rg_status" -eq 0 ]; then exit 1; fi
if [ "$helper_rg_status" -ne 1 ]; then exit "$helper_rg_status"; fi

node - "$dir/prefix.tsv" <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [len, sha] = fs.readFileSync(process.argv[2], 'utf8').trim().split('\t');
const data = fs.readFileSync('tools/test-scheduler.js').subarray(0, Number(len));
const actual = crypto.createHash('sha256').update(data).digest('hex');
if (actual !== sha) throw new Error('TASK6_V24_PREFIX_CHANGED');
NODE

. "$dir/six-meta.sh"
make_six_meta > "$dir/six-meta.stage-a-before.tsv"
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > "$dir/stage-a.tap"
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > "$dir/stage-a-throw.tap"
for f in "$dir/stage-a.tap" "$dir/stage-a-throw.tap"; do
  grep -E '^# tests 244$' "$f"
  grep -E '^# pass 243$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done
. "$dir/tap-normalize.sh"
normalize_tap_for_hash "$dir/stage-a.tap" > "$dir/stage-a.normalized.tap"
normalize_tap_for_hash "$dir/stage-a-throw.tap" > "$dir/stage-a-throw.normalized.tap"
sha256sum "$dir/stage-a.normalized.tap" > "$dir/stage-a.normalized.tap.sha256"
sha256sum "$dir/stage-a-throw.normalized.tap" > "$dir/stage-a-throw.normalized.tap.sha256"

node - "$dir/stage-a.tap" "$dir/baseline-names.txt" "$dir/parent73-names.txt" "$dir/overlay8-names.txt" <<'NODE'
const fs = require('fs');
const [tapPath, baselinePath, parentPath, overlayPath] = process.argv.slice(2);
const tap = fs.readFileSync(tapPath, 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
const baseline = fs.readFileSync(baselinePath, 'utf8').trim().split('\n');
const parent = fs.readFileSync(parentPath, 'utf8').trim().split('\n');
const overlay = fs.readFileSync(overlayPath, 'utf8').trim().split('\n');
if (names.length !== 244) throw new Error('TASK6_V24_NAME_COUNT_' + names.length);
if (new Set(names).size !== names.length) throw new Error('TASK6_V24_DUPLICATE_TEST_NAMES');
if (names.join('\n') !== [...baseline, ...parent, ...overlay].join('\n')) throw new Error('TASK6_V24_NAME_ORDER_CHANGED');
NODE

make_six_meta > "$dir/six-meta.stage-a-after.tsv"
diff -u "$dir/six-meta.stage-a-before.tsv" "$dir/six-meta.stage-a-after.tsv"
cp "$dir/six-meta.stage-a-after.tsv" "$dir/six-meta.sealed.tsv"
sha256sum "$dir/six-meta.sealed.tsv" > "$dir/six-meta.sealed.tsv.sha256"

mkdir -p docs/superpowers/reports
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
chmod 0755 docs/superpowers/reports
touch "$report"
chmod 0644 "$report"
. "$dir/inventory.sh"
repo_inventory > "$dir/post-inventory.tsv"
python3 - "$dir/pre-inventory.tsv" "$dir/post-inventory.tsv" <<'PY'
from pathlib import Path
import sys
pre = {line.split('\t',1)[0]: line for line in Path(sys.argv[1]).read_text().splitlines()}
post = {line.split('\t',1)[0]: line for line in Path(sys.argv[2]).read_text().splitlines()}
allowed = {'server/scheduler/store.js','server/scheduler/writer.js','server/scheduler/index.js','server/scheduler/cutover.js','tools/scheduler-cutover.js','tools/test-scheduler.js'}
bad = [k for k in sorted(set(pre) | set(post)) if pre.get(k) != post.get(k) and k not in allowed]
if bad:
    raise SystemExit('TASK6_V24_SCOPE_DIFF ' + ','.join(bad))
PY
sha256sum "$dir/post-inventory.tsv" > "$dir/post-inventory.tsv.sha256"

{
  echo "plan_v24_sha=$(cut -d' ' -f1 "$dir/approved-plan.sha256")"
  echo 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3'
  echo 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf'
  echo 'v20_contract_sha=1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305'
  echo 'v21_contract_sha=34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a'
  echo 'v22_contract_sha=93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6'
  echo 'v23_contract_sha=721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4'
  echo "phase0_script_sha=$(cut -d' ' -f1 "$dir/phase0-script.sha256")"
  echo "six_meta_pre_sha=$(cut -d' ' -f1 "$dir/six-meta.pre.tsv.sha256")"
  echo "phase_a_script_sha=$(cut -d' ' -f1 "$dir/phase-a.sh.sha256")"
  echo "stage_a_script_sha=$(cut -d' ' -f1 "$dir/phase-a.sh.sha256")"
  echo "stage_b_script_sha=$(cut -d' ' -f1 "$dir/stage-b.sh.sha256")"
  echo "report_producer_sha=$(cut -d' ' -f1 "$dir/write-report-base.sh.sha256")"
  echo "helper_slice_sha=$(cut -d' ' -f1 "$dir/expected-helper-slice.js.sha256")"
  echo "parent73_names_sha=$(cut -d' ' -f1 "$dir/parent73-names.txt.sha256")"
  echo "parent_slice_sha=$(cut -d' ' -f1 "$dir/expected-parent-slice.js.sha256")"
  echo "overlay8_names_sha=$(cut -d' ' -f1 "$dir/overlay8-names.txt.sha256")"
  echo "overlay_slice_sha=$(cut -d' ' -f1 "$dir/expected-overlay.js.sha256")"
  echo "overlay_red_evidence_sha=$(cut -d' ' -f1 "$dir/red-evidence.tap.sha256")"
  echo "six_meta_sha=$(cut -d' ' -f1 "$dir/six-meta.sealed.tsv.sha256")"
  echo "stage_a_normalized_tap_sha=$(cut -d' ' -f1 "$dir/stage-a.normalized.tap.sha256")"
  echo "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 "$dir/stage-a-throw.normalized.tap.sha256")"
  echo 'stage_a_counts=244/243/0/1'
  while IFS= read -r row; do echo "six_meta=$row"; done < "$dir/six-meta.sealed.tsv"
} > "$dir/review-bundle.tsv"
sha256sum "$dir/review-bundle.tsv" > "$dir/review-bundle.tsv.sha256"

"$dir/write-report-base.sh"
test -f "$report"
test ! -L "$report"
test "$(python3 - <<'PY'
import os, stat
print(format(stat.S_IMODE(os.lstat('docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md').st_mode), '04o'))
PY
)" = 0644
if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js "$report"; then exit 1; fi
for required in \
  "plan_v24_sha=$(cut -d' ' -f1 "$dir/approved-plan.sha256")" \
  "review_bundle_sha=$(cut -d' ' -f1 "$dir/review-bundle.tsv.sha256")" \
  "report_producer_sha=$(cut -d' ' -f1 "$dir/write-report-base.sh.sha256")" \
  'v23_contract_sha=721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4' \
  'stage_a_counts=244 tests / 243 pass / 0 fail / 1 skipped'; do
  grep -F "$required" "$report"
done
while IFS= read -r row; do grep -F "six_meta=$row" "$report"; done < "$dir/six-meta.sealed.tsv"
EOF
chmod +x "$TASK6_V24_DIR/phase-a.sh"
sha256sum "$TASK6_V24_DIR/phase-a.sh" > "$TASK6_V24_DIR/phase-a.sh.sha256"

cat > "$TASK6_V24_DIR/stage-b.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V24_DIR:-/tmp/task6-v24-artifacts}"
report="${TASK6_V24_REPORT:-docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md}"
"$dir/phase-a.sh"
test -n "${TASK6_V24_REVIEWER_1_ARTIFACT:-}"
test -n "${TASK6_V24_REVIEWER_2_ARTIFACT:-}"
python3 - "$TASK6_V24_REVIEWER_1_ARTIFACT" "$TASK6_V24_REVIEWER_2_ARTIFACT" >> "$report" <<'PY'
import hashlib, os, stat, sys
paths = sys.argv[1:]
if len(paths) != 2 or paths[0] == paths[1]:
    raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_PATHS')
dir = os.environ.get('TASK6_V24_DIR', '/tmp/task6-v24-artifacts')
keys = ['identity','model','effort','outcome','plan_v24_sha','stage_a_script_sha','report_producer_sha','review_bundle_sha','six_meta_sha','stage_a_normalized_tap_sha','stage_a_throw_normalized_tap_sha','overlay_red_evidence_sha']
expected = {
 'model':'gpt-5.6-sol','effort':'high','outcome':'PASS',
 'plan_v24_sha':open(os.path.join(dir,'approved-plan.sha256')).read().split()[0],
 'stage_a_script_sha':open(os.path.join(dir,'phase-a.sh.sha256')).read().split()[0],
 'report_producer_sha':open(os.path.join(dir,'write-report-base.sh.sha256')).read().split()[0],
 'review_bundle_sha':open(os.path.join(dir,'review-bundle.tsv.sha256')).read().split()[0],
 'six_meta_sha':open(os.path.join(dir,'six-meta.sealed.tsv.sha256')).read().split()[0],
 'stage_a_normalized_tap_sha':open(os.path.join(dir,'stage-a.normalized.tap.sha256')).read().split()[0],
 'stage_a_throw_normalized_tap_sha':open(os.path.join(dir,'stage-a-throw.normalized.tap.sha256')).read().split()[0],
 'overlay_red_evidence_sha':open(os.path.join(dir,'red-evidence.tap.sha256')).read().split()[0],
}
ids, hashes = set(), set()
bundle = expected['review_bundle_sha']
for idx, p in enumerate(paths, 1):
    st = os.lstat(p)
    if not stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode):
        raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_TYPE')
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    if h in hashes:
        raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_SHA_DUP')
    hashes.add(h)
    lines = open(p).read().splitlines()
    if len(lines) != len(keys):
        raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_LINE_COUNT')
    parsed = {}
    for line in lines:
        if '=' not in line:
            raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_FORMAT')
        k, v = line.split('=', 1)
        if k in parsed:
            raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_DUP_KEY')
        parsed[k] = v
    if list(parsed.keys()) != keys:
        raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_KEYS')
    for k, v in expected.items():
        if parsed[k] != v:
            raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_VALUE_' + k)
    if not parsed['identity'] or parsed['identity'] in ids:
        raise SystemExit('TASK6_V24_REVIEW_ARTIFACT_IDENTITY')
    ids.add(parsed['identity'])
    print('reviewer=%d identity=%s model=%s effort=%s outcome=%s artifact=%s artifact_sha=%s review_bundle_sha=%s' % (idx, parsed['identity'], parsed['model'], parsed['effort'], parsed['outcome'], p, h, bundle))
PY
chmod 0644 "$report"
python3 - "$report" "$dir/review-bundle.tsv.sha256" <<'PY'
import re, sys
report = open(sys.argv[1]).read().splitlines()
bundle = open(sys.argv[2]).read().split()[0]
rows = [line for line in report if line.startswith('reviewer=')]
if len(rows) != 2:
    raise SystemExit('TASK6_V24_REVIEWER_COUNT')
ids, artifacts, hashes, bundles = set(), set(), set(), set()
for row in rows:
    parts = dict(field.split('=', 1) for field in row.split()[1:])
    ids.add(parts['identity']); artifacts.add(parts['artifact']); hashes.add(parts['artifact_sha']); bundles.add(parts['review_bundle_sha'])
    if parts['model'] != 'gpt-5.6-sol' or parts['effort'] != 'high' or parts['outcome'] != 'PASS':
        raise SystemExit('TASK6_V24_REVIEWER_VALUE')
if len(ids) != 2 or len(artifacts) != 2 or len(hashes) != 2 or bundles != {bundle}:
    raise SystemExit('TASK6_V24_REVIEWER_BINDING')
PY
if rg -n '[[:blank:]]+$' "$report"; then exit 1; fi
EOF
chmod +x "$TASK6_V24_DIR/stage-b.sh"
sha256sum "$TASK6_V24_DIR/stage-b.sh" > "$TASK6_V24_DIR/stage-b.sh.sha256"

cp /tmp/task6-v24-phase0.sh "$TASK6_V24_DIR/phase0-script.sh"
sha256sum "$TASK6_V24_DIR/phase0-script.sh" > "$TASK6_V24_DIR/phase0-script.sha256"

echo "TASK6_V24_DIR=$TASK6_V24_DIR"
echo "Phase0 complete. Append sealed slices after skeletons; run $TASK6_V24_DIR/red-run.sh once; run $TASK6_V24_DIR/phase-a.sh after GREEN."
SH
chmod +x /tmp/task6-v24-phase0.sh
TASK6_V24_APPROVED_SHA="$TASK6_V24_APPROVED_SHA" /tmp/task6-v24-phase0.sh
```

Phase0 deliberately deletes only `$TASK6_V24_DIR`, not `/tmp/task6-v24-phase0.sh`, so the script cannot remove itself.

## Append sealed slices after skeletons

After creating minimal skeleton exports in the six owned files, append the sealed slices with `apply_patch` only. The appended byte ranges must match these exact artifacts:

```text
$TASK6_V24_DIR/expected-helper-slice.js
$TASK6_V24_DIR/expected-parent-slice.js
$TASK6_V24_DIR/expected-overlay.js
```

The marker layout in `tools/test-scheduler.js` must be exactly:

```js
// TASK6_V24_HELPERS_START
<bytes of expected-helper-slice.js>
// TASK6_V24_HELPERS_END
// TASK6_V24_PARENT_TESTS_START
<bytes of expected-parent-slice.js>
// TASK6_V24_PARENT_TESTS_END
// TASK6_V24_OVERLAY_TESTS_START
<bytes of expected-overlay.js>
// TASK6_V24_OVERLAY_TESTS_END
```

Do not copy Markdown fences. `rg '^```' tools/test-scheduler.js` must return no matches.

## RED command

Run this exactly once after skeletons and appended sealed slices, before GREEN implementation:

```bash
set -euo pipefail
. /tmp/task6-v24-artifacts/env.sh
"$TASK6_V24_DIR/red-run.sh"
sha256sum -c "$TASK6_V24_DIR/red-evidence.tap.sha256"
```

This red runner has no inline JavaScript heredoc inside command substitution. It obtains the escaped full-name regex from `$TASK6_V24_DIR/escape-test-name.js`, so the V23 duplicate-`pattern` heredoc bug is not possible.

## PhaseA command after GREEN

Run after all implementation tests pass locally:

```bash
set -euo pipefail
. /tmp/task6-v24-artifacts/env.sh
"$TASK6_V24_DIR/phase-a.sh"
```

PhaseA creates post artifacts only after GREEN code exists. It recomputes current six-file metadata before and after the fresh TAP runs, diffs them, validates the pre/post inventory allowlist against the Phase0 pre-inventory, writes the draft report, and rejects report mode/content errors.

## Review bundle and StageB

Reviewer artifact schema is exact 12-key V22-compatible shape and has no extra/missing/duplicate keys. V24 keeps V20/V21/V22/V23/Phase0/StageB hashes in the report and review bundle, but reviewer artifacts intentionally bind only the 12 review-facing fields below:

```text
identity=<distinct reviewer id>
model=gpt-5.6-sol
effort=high
outcome=PASS
plan_v24_sha=<approved V24 plan sha>
stage_a_script_sha=<PhaseA script sha; V22-compatible key name>
report_producer_sha=<report producer sha>
review_bundle_sha=<review bundle sha>
six_meta_sha=<six metadata sha>
stage_a_normalized_tap_sha=<fresh StageA normal TAP sha>
stage_a_throw_normalized_tap_sha=<fresh StageA throw-deprecation TAP sha>
overlay_red_evidence_sha=<frozen RED evidence sha>
```

After two genuine fresh Sol/high PASS reviews, root sets `TASK6_V24_REVIEWER_1_ARTIFACT` and `TASK6_V24_REVIEWER_2_ARTIFACT` to two distinct regular non-symlink files and runs:

```bash
set -euo pipefail
. /tmp/task6-v24-artifacts/env.sh
"$TASK6_V24_DIR/stage-b.sh"
```

StageB reruns PhaseA before appending reviewers, validates the exact artifact key set and digest bindings, appends validator-produced reviewer lines to the report, and revalidates the final report.

## V24 override overlay body

Phase0 uses this body only for the exact-null partial overlay. This replaces V23's invalid World/qB setup with a direct Store-created `ACCOUNT_ADVANCE` and a smoke assertion that `claimNext` returns the exact scheduled job before the reducer target path runs.

```js
// TASK6_V24_REPLACEMENT_START EXACT_NULL
test('Task 6 v24 overlay exact null partial retains running lock without lifecycle calls', function () {
  var sentinel = 'TASK6V24_RED_008_EXACT_NULL_PARTIAL';
  var writerModule = require('../server/scheduler/writer.js');
  task6v24RequireFunction(writerModule, 'SchedulerWriter', sentinel, 'export.SchedulerWriter');
  task6v24RequireFunction(writerModule.SchedulerWriter.prototype, 'executeClaimedInCurrentUow', sentinel);
  var SchedulerWriter = writerModule.SchedulerWriter;
  var T = 1_800_010_081, accountId = 880_081, revision = 7, x = taoWorldSchedulerTam();
  try {
    x.clock.setS(T - 1);
    x.lease = layLease(x, x.lease.ownerId);
    taoDqChoReconcile(x, accountId, revision);
    x.accountJob = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(x.lease, accountId, revision, T, x.clock.nowMs());
    }, {immediate: true});
    assert.ok(x.accountJob && x.accountJob.id, 'TASK6V24_FIXTURE_ACCOUNT_JOB_CREATED');
    var loaded = x.store.getById(x.accountJob.id);
    assert.equal(loaded.id, x.accountJob.id, 'TASK6V24_FIXTURE_ACCOUNT_JOB_LOADABLE');
    assert.equal(loaded.kind, 'ACCOUNT_ADVANCE', 'TASK6V24_FIXTURE_ACCOUNT_KIND');
    assert.equal(Number(loaded.aggregate_id), accountId, 'TASK6V24_FIXTURE_ACCOUNT_ID');
    assert.equal(Number(loaded.expected_revision), revision, 'TASK6V24_FIXTURE_ACCOUNT_REVISION');
    assert.equal(Number(loaded.scheduled_at_s), T, 'TASK6V24_FIXTURE_ACCOUNT_TARGET');
    x.reducer = new EventReducer({kho: x.kho, world: x.world, store: x.store,
      clock: x.clock, advanceService: x.service});
    x.ownerId = '00000000-0000-4000-8000-000000000881';
    x.writer = new SchedulerWriter({
      ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: 1_000, leaseMs: 15_000, manualDrain: true
    });
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
      assert.equal(executable.id, x.accountJob.id, sentinel + ' exact executable id');
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
      assert.ok(claimed && claimed.id, 'TASK6V24_FIXTURE_ACCOUNT_JOB_CLAIMED');
      assert.equal(claimed.id, x.accountJob.id, 'TASK6V24_FIXTURE_ACCOUNT_EXACT_CLAIM');
      beforeLock = task6v24LockProjection(task6v24RawJob(x.kho, claimed.id));
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
      afterLock = task6v24LockProjection(task6v24RawJob(x.kho, claimed.id));
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
// TASK6_V24_REPLACEMENT_END EXACT_NULL
```

## Self-audit checklist

- [ ] Phase0 runs before any source/test/report edit and captures baseline `163`, prefix, and pre-inventory.
- [ ] Parent73 names artifact emits exactly one final newline; `wc -l` is `73`.
- [ ] Phase0 cleanup deletes only `$TASK6_V24_DIR`; no script self-delete.
- [ ] RED runner verifies `red-parser.sh.sha256` before sourcing, has no command-substitution heredoc, and has no duplicated `pattern=` line.
- [ ] Expected overlay uses V24 namespace and extracts corrected V23 body replacements mechanically from pinned V23.
- [ ] Due61 overlay asserts `continuationActive false -> true` with literal message `continuation initially inactive`, then proves timer count increases after command.
- [ ] PhaseA creates prerequisites before consumption: current slices, six metadata, TAP hashes, post inventory, report draft, review bundle.
- [ ] Report is excluded from repo inventory content diff and separately enforced as real non-symlink mode `0644`; reports directory is real non-symlink mode `0755`.
- [ ] StageB validates reviewer artifacts by exact key order, distinct identities, distinct paths, distinct artifact hashes, and exact digest bundle.
