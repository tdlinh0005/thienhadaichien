# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V25

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`. Execute in order. Do not edit source/test files while authoring or reviewing this plan.

**Goal:** Implement Task6 writer lifecycle/global watermark/retry/backoff/quarantine with genuine TDD, preserving accepted Task5 seams and fixing the V24 workflow blockers.

**Architecture:** V25 retains V24 production contracts and overlay count (`parent73 + overlay8 = N81`) but replaces V24 artifact generation with a corrected composer. The composer reads pinned V24, namespace-converts it to V25, and mechanically replaces the broken Phase0/PhaseA/report/reviewer sections with exact V25 implementations. This avoids hand-merging 900+ lines while still producing standalone executable scripts from a fresh `/tmp`.

**Tech Stack:** Node.js built-in test runner (`node --test --test-isolation=none --test-reporter=tap`), SQLite scheduler store, existing Task1-5 scheduler modules, shell/Python/Node validation scripts.

**Spec:** `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` Task6 section beginning around line 10866, accepted Task5 remediation plan, live accepted Task1-5 code.

---

## Global constraints

- Preserve V1-V24 plan artifacts. V25 planning creates only this file.
- Implementation may modify only these six Task6-owned files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- Counts remain `parent runtime=73 + overlay=8 => N=81`; final scheduler TAP is `244 tests / 243 pass / 0 fail / 1 skipped`.
- Root supplies `TASK6_V25_APPROVED_SHA`; V25 never embeds its own hash.
- Phase0 runs before any source/test/report edit. Phase0 must tolerate missing Task6-created files. PhaseA must require all six owned files to be regular non-symlink files with filesystem mode `100644`.

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md
93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md
721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md
9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md
```

## V25 workflow order

1. Before edits, run the V25 composer below. It creates `/tmp/task6-v25-phase0.sh` and immediately runs Phase0.
2. Create minimal skeleton exports in the six owned files only.
3. Append Phase0-sealed helper/parent/overlay slices between V25 markers in `tools/test-scheduler.js`.
4. Run RED exactly once: `. /tmp/task6-v25-artifacts/env.sh && "$TASK6_V25_DIR/red-run.sh"`.
5. Implement GREEN in the six owned files only.
6. Run PhaseA: `. /tmp/task6-v25-artifacts/env.sh && "$TASK6_V25_DIR/phase-a.sh"`.
7. Launch two fresh Sol/high reviews over the exact V25 review bundle and six metadata. Then set `TASK6_V25_REVIEWER_1_ARTIFACT` and `TASK6_V25_REVIEWER_2_ARTIFACT` and run StageB.

## V25 composer: exact executable producer

Run from repo root before any source/test/report edit:

```bash
cat > /tmp/task6-v25-compose-and-run-phase0.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

test -n "${TASK6_V25_APPROVED_SHA:-}"
case "$TASK6_V25_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V25_APPROVED_SHA}" -eq 64

python3 - <<'TASK6_V25_COMPOSER_PY'
from pathlib import Path
v24_path = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md')
text = v24_path.read_text()
src = text.split("cat > /tmp/task6-v24-phase0.sh <<'SH'\n", 1)[1].split("\nSH\nchmod +x /tmp/task6-v24-phase0.sh", 1)[0]
src = src.replace('V24', 'V25').replace('v24', 'v25')

authority_old = """721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md
EOF"""
authority_new = """721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md
9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md
EOF"""
src = src.replace(authority_old, authority_new)
src = src.replace(
    "v23='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md'\nreport=",
    "v23='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md'\nv24='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md'\nreport="
)
src = src.replace(
    "python3 \"$TASK6_V25_DIR/parent-block-1.md\" \"$TASK6_V25_DIR/parent-block-2.md\" \"$TASK6_V25_DIR/parent-block-3.md\" \"$TASK6_V25_DIR/parent-block-4.md\" > \"$TASK6_V25_DIR/expected-parent-slice.js\" <<'PY'",
    "python3 - \"$TASK6_V25_DIR/parent-block-1.md\" \"$TASK6_V25_DIR/parent-block-2.md\" \"$TASK6_V25_DIR/parent-block-3.md\" \"$TASK6_V25_DIR/parent-block-4.md\" > \"$TASK6_V25_DIR/expected-parent-slice.js\" <<'PY'"
)
src = src.replace(
    "python3 \"$TASK6_V25_DIR/expected-overlay.js\" \"$TASK6_V25_DIR/overlay8-names.txt\" <<'PY'",
    "python3 - \"$TASK6_V25_DIR/expected-overlay.js\" \"$TASK6_V25_DIR/overlay8-names.txt\" <<'PY'"
)

helper_imports_old = src.split("cat > \"$TASK6_V25_DIR/helper-imports.js\" <<'EOF'\n", 1)[1].split("\nEOF\nsed -n '6411,6470p'", 1)[0]
helper_imports_new = """var task6v25AdvanceModule = task5Lazy('advance');
var GameAdvanceService = task6v25AdvanceModule.GameAdvanceService;
var toPublicAdvanceResult = task6v25AdvanceModule.toPublicAdvanceResult;
var task6v25ReducersModule = task5Lazy('reducers');
var EventReducer = task6v25ReducersModule.EventReducer;
var resolveCanonicalGlobalInCurrentUow = task6v25ReducersModule.resolveCanonicalGlobalInCurrentUow;
var SchedulerStore = task2StoreModule().SchedulerStore;"""
src = src.replace(helper_imports_old, helper_imports_new)

six_meta_old = src.split("cat > \"$TASK6_V25_DIR/six-meta.sh\" <<'EOF'\n", 1)[1].split("\nEOF\nsha256sum \"$TASK6_V25_DIR/six-meta.sh\"", 1)[0]
six_meta_new = r'''make_six_meta_pre() {
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
    git_mode = tracked.get(p, '-')
    try:
        st = os.lstat(p)
    except FileNotFoundError:
        print('\t'.join([p, 'missing', '-', git_mode, '-', '-', '-']))
        continue
    fs_mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if stat.S_ISLNK(st.st_mode):
        print('\t'.join([p, 'symlink', fs_mode, git_mode, str(st.st_size), '-', os.readlink(p)]))
    elif stat.S_ISREG(st.st_mode):
        with open(p, 'rb') as f:
            data = f.read()
        print('\t'.join([p, 'file', fs_mode, git_mode, str(len(data)), hashlib.sha256(data).hexdigest(), '-']))
    elif stat.S_ISDIR(st.st_mode):
        print('\t'.join([p, 'dir', fs_mode, git_mode, '-', '-', '-']))
    else:
        print('\t'.join([p, 'other', fs_mode, git_mode, str(st.st_size), '-', '-']))
PY
}
make_six_meta_final() {
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
        raise SystemExit('TASK6_V25_META_FINAL_TYPE_' + p)
    if stat.S_IMODE(st.st_mode) != 0o644:
        raise SystemExit('TASK6_V25_META_FINAL_MODE_' + p)
    fs_mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    git_mode = tracked.get(p, '-')
    with open(p, 'rb') as f:
        data = f.read()
    print('\t'.join([p, 'file', fs_mode, git_mode, str(len(data)), hashlib.sha256(data).hexdigest(), '-']))
PY
}'''
src = src.replace(six_meta_old, six_meta_new)
src = src.replace('make_six_meta > "$TASK6_V25_DIR/' + 'six-meta.pre.tsv"', 'make_six_meta_pre > "$TASK6_V25_DIR/six-meta.pre.tsv"')
src = src.replace('make_six_meta > "$dir/six-meta.stage-a-before.tsv"', 'make_six_meta_final > "$dir/six-meta.stage-a-before.tsv"')
src = src.replace('make_six_meta > "$dir/six-meta.stage-a-after.tsv"', 'make_six_meta_final > "$dir/six-meta.stage-a-after.tsv"')

report_old = src.split("cat > \"$TASK6_V25_DIR/write-report-base.sh\" <<'EOF'\n", 1)[1].split("\nEOF\nchmod +x \"$TASK6_V25_DIR/write-report-base.sh\"", 1)[0]
report_new = r'''#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V25_DIR:-/tmp/task6-v25-artifacts}"
report="${TASK6_V25_REPORT:-docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md}"
mkdir -p "$(dirname "$report")"
test -d "$(dirname "$report")"
test ! -L "$(dirname "$report")"
chmod 0755 "$(dirname "$report")"
reviewers="$(mktemp "$dir/reviewers.XXXXXX")"
if [ -f "$report" ]; then
  python3 - "$report" "$dir/review-bundle.tsv.sha256" > "$reviewers" <<'PY'
import re, sys
report = sys.argv[1]
bundle = open(sys.argv[2]).read().split()[0] if __import__('os').path.exists(sys.argv[2]) else None
rows = [line for line in open(report).read().splitlines() if line.startswith('reviewer=')]
if not rows:
    sys.exit(0)
if len(rows) != 2:
    raise SystemExit('TASK6_V25_STALE_REVIEWER_ROW_COUNT')
seen = set()
for row in rows:
    fields = row.split()
    if fields[0] in seen:
        raise SystemExit('TASK6_V25_DUP_REVIEWER_ORDINAL')
    seen.add(fields[0])
    parts = dict(field.split('=', 1) for field in fields[1:])
    if bundle is not None and parts.get('review_bundle_sha') != bundle:
        raise SystemExit('TASK6_V25_STALE_REVIEWER_BUNDLE')
    if parts.get('model') != 'gpt-5.6-sol' or parts.get('effort') != 'high' or parts.get('outcome') != 'PASS':
        raise SystemExit('TASK6_V25_STALE_REVIEWER_VALUE')
print('\n'.join(rows))
PY
fi
tmp="$(mktemp "$dir/report.XXXXXX")"
{
  echo 'plan_version=V25'
  echo "plan_v25_sha=$(cut -d' ' -f1 "$dir/approved-plan.sha256")"
  echo 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3'
  echo 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf'
  echo 'v20_contract_sha=1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305'
  echo 'v21_contract_sha=34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a'
  echo 'v22_contract_sha=93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6'
  echo 'v23_contract_sha=721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4'
  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'
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
  echo "stage_a_script_sha=$(cut -d' ' -f1 "$dir/phase-a.sh.sha256")"
  echo "stage_b_script_sha=$(cut -d' ' -f1 "$dir/stage-b.sh.sha256")"
  echo "report_producer_sha=$(cut -d' ' -f1 "$dir/write-report-base.sh.sha256")"
  echo "review_bundle_sha=$(cut -d' ' -f1 "$dir/review-bundle.tsv.sha256")"
  echo "stage_a_normalized_tap_sha=$(cut -d' ' -f1 "$dir/stage-a.normalized.tap.sha256")"
  echo "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 "$dir/stage-a-throw.normalized.tap.sha256")"
  echo 'stage_a_counts=244 tests / 243 pass / 0 fail / 1 skipped'
  while IFS= read -r row; do echo "six_meta_pre=$row"; done < "$dir/six-meta.pre.tsv"
  while IFS= read -r row; do echo "six_meta=$row"; done < "$dir/six-meta.sealed.tsv"
  cat "$reviewers"
} > "$tmp"
mv "$tmp" "$report"
chmod 0644 "$report"
rm -f "$reviewers"'''
src = src.replace(report_old, report_new)
src = src.replace('sha256sum -c "$dir/approved-plan.sha256"\n', 'sha256sum -c "$dir/approved-plan.sha256"\nsha256sum -c "$dir/phase0-script.sha256"\n', 1)
src = src.replace(
    'mkdir -p docs/superpowers/reports\n'
    'test -d docs/superpowers/reports\n'
    'test ! -L docs/superpowers/reports\n'
    'chmod 0755 docs/superpowers/reports\n'
    'touch "$report"\n'
    'chmod 0644 "$report"',
    'if [ -e docs/superpowers/reports ] && [ -L docs/superpowers/reports ]; then exit 1; fi\n'
    'mkdir -p docs/superpowers/reports\n'
    'test -d docs/superpowers/reports\n'
    'test ! -L docs/superpowers/reports\n'
    'chmod 0755 docs/superpowers/reports\n'
    'if [ -e "$report" ] && [ -L "$report" ]; then exit 1; fi\n'
    'if [ -e "$report" ] && [ ! -f "$report" ]; then exit 1; fi\n'
    'touch "$report"\n'
    'test -f "$report"\n'
    'test ! -L "$report"\n'
    'chmod 0644 "$report"'
)

red_run_old = src.split("cat > \"$TASK6_V25_DIR/red-run.sh\" <<'EOF'\n", 1)[1].split("\nEOF\nchmod +x \"$TASK6_V25_DIR/red-run.sh\"", 1)[0]
red_run_new = r'''#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V25_DIR:-/tmp/task6-v25-artifacts}"
sha256sum -c "$dir/approved-plan.sha256"
sha256sum -c "$dir/authorities.sha256"
sha256sum -c "$dir/red-run.sh.sha256"
sha256sum -c "$dir/red-parser.sh.sha256"
sha256sum -c "$dir/escape-test-name.js.sha256"
sha256sum -c "$dir/overlay8-red-contracts.tsv.sha256"
sha256sum -c "$dir/prefix.tsv.sha256"
sha256sum -c "$dir/expected-helper-slice.js.sha256"
sha256sum -c "$dir/expected-parent-slice.js.sha256"
sha256sum -c "$dir/expected-overlay.js.sha256"
node - "$dir/prefix.tsv" "$dir/expected-helper-slice.js" "$dir/expected-parent-slice.js" "$dir/expected-overlay.js" <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [prefixPath, helperPath, parentPath, overlayPath] = process.argv.slice(2);
const [lenRaw, sha] = fs.readFileSync(prefixPath, 'utf8').trim().split('\t');
const len = Number(lenRaw);
const current = fs.readFileSync('tools/test-scheduler.js');
const prefix = current.subarray(0, len);
const prefixHash = crypto.createHash('sha256').update(prefix).digest('hex');
if (prefixHash !== sha) throw new Error('TASK6_V25_RED_PREFIX_CHANGED');
const helper = fs.readFileSync(helperPath, 'utf8');
const parent = fs.readFileSync(parentPath, 'utf8');
const overlay = fs.readFileSync(overlayPath, 'utf8');
const suffix =
  '// TASK6_V25_HELPERS_START\n' + helper + '// TASK6_V25_HELPERS_END\n' +
  '// TASK6_V25_PARENT_TESTS_START\n' + parent + '// TASK6_V25_PARENT_TESTS_END\n' +
  '// TASK6_V25_OVERLAY_TESTS_START\n' + overlay + '// TASK6_V25_OVERLAY_TESTS_END\n';
const expected = Buffer.concat([prefix, Buffer.from(suffix, 'utf8')]);
if (!current.equals(expected)) throw new Error('TASK6_V25_RED_APPEND_SUFFIX_MISMATCH');
const text = current.toString('utf8');
for (const marker of [
  '// TASK6_V25_HELPERS_START',
  '// TASK6_V25_HELPERS_END',
  '// TASK6_V25_PARENT_TESTS_START',
  '// TASK6_V25_PARENT_TESTS_END',
  '// TASK6_V25_OVERLAY_TESTS_START',
  '// TASK6_V25_OVERLAY_TESTS_END'
]) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.match(new RegExp(escaped, 'g')) || [];
  if (matches.length !== 1) throw new Error('TASK6_V25_RED_MARKER_COUNT_' + marker);
}
NODE
node --check tools/test-scheduler.js
. "$dir/red-parser.sh"
test ! -e "$dir/red-evidence.tap"
: > "$dir/red-evidence.tap"
while IFS="$(printf '\t')" read -r name sentinel expected_message; do
  pattern="$(node "$dir/escape-test-name.js" "$name")"
  tmp="$(mktemp "$dir/red.XXXXXX.tap")"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"; rm -f "$tmp"; exit 1
  fi
  parse_overlay_red_tap "$tmp" "$name" "$sentinel $expected_message"
  printf '%s\nname=%s\nsentinel=%s\nexpected_message=%s\n' '### TASK6_V25_OVERLAY_RED_CASE_START' "$name" "$sentinel" "$expected_message" >> "$dir/red-evidence.tap"
  cat "$tmp" >> "$dir/red-evidence.tap"
  printf '%s\n' '### TASK6_V25_OVERLAY_RED_CASE_END' >> "$dir/red-evidence.tap"
  rm -f "$tmp"
done < "$dir/overlay8-red-contracts.tsv"
grep -c '^### TASK6_V25_OVERLAY_RED_CASE_START$' "$dir/red-evidence.tap" | grep -E '^8$'
sha256sum "$dir/red-evidence.tap" > "$dir/red-evidence.tap.sha256"'''
src = src.replace(red_run_old, red_run_new)

src = src.replace(
    "  echo 'v23_contract_sha=721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4'\n"
    '  echo "phase0_script_sha=',
    "  echo 'v23_contract_sha=721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4'\n"
    "  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'\n"
    '  echo "phase0_script_sha='
)
src = src.replace(
    """  echo "report_producer_sha=$(cut -d' ' -f1 "$dir/write-report-base.sh.sha256")"
  echo "helper_slice_sha=""",
    """  echo "report_producer_sha=$(cut -d' ' -f1 "$dir/write-report-base.sh.sha256")"
  echo "baseline_names_sha=$(cut -d' ' -f1 "$dir/baseline-names.txt.sha256")"
  echo "helper_slice_sha="""
)

stage_b_old = src.split("cat > \"$TASK6_V25_DIR/stage-b.sh\" <<'EOF'\n", 1)[1].split("\nEOF\nchmod +x \"$TASK6_V25_DIR/stage-b.sh\"", 1)[0]
stage_b_new = r'''#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V25_DIR:-/tmp/task6-v25-artifacts}"
report="${TASK6_V25_REPORT:-docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md}"
"$dir/phase-a.sh"
test -n "${TASK6_V25_REVIEWER_1_ARTIFACT:-}"
test -n "${TASK6_V25_REVIEWER_2_ARTIFACT:-}"
tmp_reviewers="$(mktemp "$dir/reviewers.new.XXXXXX")"
tmp_report="$(mktemp "$dir/report.stageb.XXXXXX")"
python3 - "$TASK6_V25_REVIEWER_1_ARTIFACT" "$TASK6_V25_REVIEWER_2_ARTIFACT" > "$tmp_reviewers" <<'PY'
import hashlib, os, stat, sys
paths = sys.argv[1:]
if len(paths) != 2 or paths[0] == paths[1]:
    raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_PATHS')
dir = os.environ.get('TASK6_V25_DIR', '/tmp/task6-v25-artifacts')
keys = ['identity','model','effort','outcome','plan_v25_sha','stage_a_script_sha','report_producer_sha','review_bundle_sha','six_meta_sha','stage_a_normalized_tap_sha','stage_a_throw_normalized_tap_sha','overlay_red_evidence_sha']
expected = {
 'model':'gpt-5.6-sol','effort':'high','outcome':'PASS',
 'plan_v25_sha':open(os.path.join(dir,'approved-plan.sha256')).read().split()[0],
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
        raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_TYPE')
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    if h in hashes:
        raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_SHA_DUP')
    hashes.add(h)
    lines = open(p).read().splitlines()
    if len(lines) != len(keys):
        raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_LINE_COUNT')
    parsed = {}
    for line in lines:
        if '=' not in line:
            raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_FORMAT')
        k, v = line.split('=', 1)
        if k in parsed:
            raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_DUP_KEY')
        parsed[k] = v
    if list(parsed.keys()) != keys:
        raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_KEYS')
    for k, v in expected.items():
        if parsed[k] != v:
            raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_VALUE_' + k)
    if not parsed['identity'] or parsed['identity'] in ids:
        raise SystemExit('TASK6_V25_REVIEW_ARTIFACT_IDENTITY')
    ids.add(parsed['identity'])
    print('reviewer=%d identity=%s model=%s effort=%s outcome=%s artifact=%s artifact_sha=%s review_bundle_sha=%s' % (idx, parsed['identity'], parsed['model'], parsed['effort'], parsed['outcome'], p, h, bundle))
PY
python3 - "$report" "$tmp_reviewers" "$tmp_report" <<'PY'
import sys
report, new_path, tmp_report = sys.argv[1:]
new_rows = open(new_path).read().splitlines()
old_rows = [line for line in open(report).read().splitlines() if line.startswith('reviewer=')]
if old_rows and old_rows != new_rows:
    raise SystemExit('TASK6_V25_REVIEWER_STALE_OR_MISMATCH')
base = [line for line in open(report).read().splitlines() if not line.startswith('reviewer=')]
with open(tmp_report, 'w') as f:
    f.write('\n'.join(base + new_rows) + '\n')
PY
mv "$tmp_report" "$report"
chmod 0644 "$report"
rm -f "$tmp_reviewers" "$tmp_report"
python3 - "$report" "$dir/review-bundle.tsv.sha256" <<'PY'
report, bundle_path = __import__('sys').argv[1:]
bundle = open(bundle_path).read().split()[0]
rows = [line for line in open(report).read().splitlines() if line.startswith('reviewer=')]
if len(rows) != 2:
    raise SystemExit('TASK6_V25_REVIEWER_COUNT')
ids, arts, hashes, bundles = set(), set(), set(), set()
for row in rows:
    parts = dict(field.split('=', 1) for field in row.split()[1:])
    ids.add(parts['identity']); arts.add(parts['artifact']); hashes.add(parts['artifact_sha']); bundles.add(parts['review_bundle_sha'])
    if parts['model'] != 'gpt-5.6-sol' or parts['effort'] != 'high' or parts['outcome'] != 'PASS':
        raise SystemExit('TASK6_V25_REVIEWER_VALUE')
if len(ids) != 2 or len(arts) != 2 or len(hashes) != 2 or bundles != {bundle}:
    raise SystemExit('TASK6_V25_REVIEWER_BINDING')
PY
if rg -n '[[:blank:]]+$' "$report"; then exit 1; fi'''
src = src.replace(stage_b_old, stage_b_new)

src = src.replace("echo \"Phase0 complete. Append sealed slices after skeletons; run $TASK6_V25_DIR/red-run.sh once; run $TASK6_V25_DIR/phase-a.sh after GREEN.\"", "echo \"Phase0 complete. six-meta.pre tolerates missing files; final six-meta requires regular 100644. Append sealed slices after skeletons; run $TASK6_V25_DIR/red-run.sh once; run $TASK6_V25_DIR/phase-a.sh after GREEN.\"")

if ('make_six_meta > "$TASK6_V25_DIR/' + 'six-meta.pre.tsv"') in src:
    raise SystemExit('TASK6_V25_PRE_META_STILL_STRICT')
if src.count('cat "$reviewers"') != 1:
    raise SystemExit('TASK6_V25_REVIEWER_CAT_COUNT')
if 'make_six_meta_final > "$dir/six-meta.stage-a-before.tsv"' not in src:
    raise SystemExit('TASK6_V25_FINAL_META_MISSING')
Path('/tmp/task6-v25-phase0.sh').write_text(src)
TASK6_V25_COMPOSER_PY
chmod +x /tmp/task6-v25-phase0.sh
bash -n /tmp/task6-v25-phase0.sh
TASK6_V25_APPROVED_SHA="$TASK6_V25_APPROVED_SHA" /tmp/task6-v25-phase0.sh
SH
chmod +x /tmp/task6-v25-compose-and-run-phase0.sh
TASK6_V25_APPROVED_SHA="$TASK6_V25_APPROVED_SHA" /tmp/task6-v25-compose-and-run-phase0.sh
```

## Exact-null overlay source

The V25 composer obtains most overlay bodies from pinned V23 through the V24 algorithm, but obtains `EXACT_NULL` from this V25 marker. This avoids V23's broken World/qB fixture path. The first RED assertion checks for `SchedulerWriter.prototype.executeClaimedInCurrentUow`; fixture setup runs only after that target exists.

```js
// TASK6_V25_REPLACEMENT_START EXACT_NULL
test('Task 6 v25 overlay exact null partial retains running lock without lifecycle calls', function () {
  var sentinel = 'TASK6V25_RED_008_EXACT_NULL_PARTIAL';
  var writerModule = require('../server/scheduler/writer.js');
  task6v25RequireFunction(writerModule, 'SchedulerWriter', sentinel, 'export.SchedulerWriter');
  task6v25RequireFunction(writerModule.SchedulerWriter.prototype, 'executeClaimedInCurrentUow', sentinel);
  var SchedulerWriter = writerModule.SchedulerWriter;
  var T = 1_800_010_081, accountId = 880_081, revision = 7, x = taoWorldSchedulerTam();
  try {
    x.clock.setS(T - 1);
    x.lease = layLease(x, x.lease.ownerId);
    taoDqChoReconcile(x, accountId, revision);
    x.accountJob = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(x.lease, accountId, revision, T, x.clock.nowMs());
    }, {immediate: true});
    assert.ok(x.accountJob && x.accountJob.id, 'TASK6V25_FIXTURE_ACCOUNT_JOB_CREATED');
    var loaded = x.store.getById(x.accountJob.id);
    assert.equal(loaded.id, x.accountJob.id, 'TASK6V25_FIXTURE_ACCOUNT_JOB_LOADABLE');
    assert.equal(loaded.kind, 'ACCOUNT_ADVANCE', 'TASK6V25_FIXTURE_ACCOUNT_KIND');
    assert.equal(Number(loaded.aggregate_id), accountId, 'TASK6V25_FIXTURE_ACCOUNT_ID');
    assert.equal(Number(loaded.expected_revision), revision, 'TASK6V25_FIXTURE_ACCOUNT_REVISION');
    assert.equal(Number(loaded.scheduled_at_s), T, 'TASK6V25_FIXTURE_ACCOUNT_TARGET');
    installAdvanceServiceFixture(x);
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
      assert.ok(claimed && claimed.id, 'TASK6V25_FIXTURE_ACCOUNT_JOB_CLAIMED');
      assert.equal(claimed.id, x.accountJob.id, 'TASK6V25_FIXTURE_ACCOUNT_EXACT_CLAIM');
      beforeLock = task6v25LockProjection(task6v25RawJob(x.kho, claimed.id));
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
      afterLock = task6v25LockProjection(task6v25RawJob(x.kho, claimed.id));
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
// TASK6_V25_REPLACEMENT_END EXACT_NULL
```

## V25 verification notes

- Phase0 pre metadata uses `make_six_meta_pre`; it records each of the six paths as `missing`, `file`, `symlink`, `dir`, or `other` with deterministic fields and never `lstat`-fails on missing writer/index/cutover/CLI files.
- PhaseA final metadata uses `make_six_meta_final`; it fails unless all six paths are regular non-symlink files with filesystem mode `100644`.
- Report producer emits `cat "$reviewers"` exactly once. Existing reviewer rows are either zero rows or exactly two current-bundle rows; stale/partial/duplicate rows fail.
- StageB is idempotent: if the report already contains the exact two current reviewer rows it rewrites canonically without duplicating; if existing rows differ from the current artifacts, it fails.
- RED runner still verifies `red-parser.sh.sha256` before sourcing and the full-name regex is produced by `escape-test-name.js`, not inline heredoc command substitution.

## Self-audit checklist

- [ ] `bash -n /tmp/task6-v25-compose-and-run-phase0.sh` passes after extraction from this plan.
- [ ] Composed `/tmp/task6-v25-phase0.sh` passes `bash -n`.
- [ ] Composer static guards pass: no strict `make_six_meta` in Phase0 pre, exactly one `cat "$reviewers"`, and final metadata uses `make_six_meta_final`.
- [ ] Current workspace missing files (`writer.js`, `index.js`, `cutover.js`, `tools/scheduler-cutover.js`) are represented as deterministic `missing` rows in pre metadata.
- [ ] Overlay extraction still yields exactly 8 V25 tests and `EXACT_NULL` contains `replaceAccountAdvance` plus `TASK6V25_FIXTURE_ACCOUNT_EXACT_CLAIM`.
