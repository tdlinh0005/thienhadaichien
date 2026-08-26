# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V27

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`. Execute in order. This plan is a corrective successor to V26 and must be treated as immutable after approval.

**Goal:** Implement Task6 writer lifecycle/global watermark/retry/backoff/quarantine with the accepted Task5 seams and a reproducible pre-edit/TDD/post-edit validation workflow.

**Architecture:** V27 preserves V26 production contracts and counts (`parent73 + overlay8 = N81`) but fixes the remaining workflow hazards. The composer captures V26’s outer/inner composer in memory and writes only `/tmp/task6-v27-phase0.sh`; it never overwrites the currently executing composer. PhaseA and report generation reject symlink ancestors before mutation, base and StageB report writes use same-filesystem candidates, and exact-null overlay setup keeps one owner/token with no local `SchedulerWriter` alias.

**Tech Stack:** Node.js built-in test runner (`node --test --test-isolation=none --test-reporter=tap`), SQLite scheduler store, existing Task1-5 modules, shell/Python/Node validation scripts.

**Spec:** `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` Task6 section beginning around line 10866, accepted Task5 remediation plan, live accepted Task1-5 code.

---

## Global constraints

- Preserve V1-V26 plan artifacts. V27 planning creates only this file.
- Implementation may modify only:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- Counts: `parent runtime=73 + overlay=8 => N=81`; final scheduler TAP `244 tests / 243 pass / 0 fail / 1 skipped`.
- Root supplies `TASK6_V27_APPROVED_SHA`; the plan never embeds its own hash.

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md
93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md
721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v23.md
9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md
4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v25.md
e424505449fc09992e0ddafd80e53227741f487dcddc14efc5b8ba698f7b0277  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v26.md
```

## V27 workflow

1. Before any source/test/report edit, run the composer below. It writes `/tmp/task6-v27-phase0.sh` and runs Phase0 once.
2. Create minimal skeleton exports in the six owned files.
3. Append sealed V27 helper/parent/overlay slices.
4. Run RED exactly once: `. /tmp/task6-v27-artifacts/env.sh && "$TASK6_V27_DIR/red-run.sh"`.
5. Implement GREEN in the six owned files.
6. Run PhaseA: `. /tmp/task6-v27-artifacts/env.sh && "$TASK6_V27_DIR/phase-a.sh"`.
7. Run two fresh Sol/high reviews over the exact V27 review bundle. Then set reviewer artifact paths and run StageB.

## V27 composer

Run this from repo root before edits:

```bash
cat > /tmp/task6-v27-compose-and-run-phase0.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

test -n "${TASK6_V27_APPROVED_SHA:-}"
case "$TASK6_V27_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V27_APPROVED_SHA}" -eq 64

python3 - <<'TASK6_V27_COMPOSER_PY'
from pathlib import Path

V26_SHA = 'e424505449fc09992e0ddafd80e53227741f487dcddc14efc5b8ba698f7b0277'
v26_path = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v26.md')
v26 = v26_path.read_text()

outer_sh = v26.split("cat > /tmp/task6-v26-compose-and-run-phase0.sh <<'SH'\n", 1)[1].split("\nSH\n```", 1)[0]
outer_py = outer_sh.split("python3 - <<'TASK6_V26_COMPOSER_PY'\n", 1)[1].split("\nTASK6_V26_COMPOSER_PY", 1)[0]
capture = {}
outer_py = outer_py.replace("Path('/tmp/task6-v26-compose-and-run-phase0.sh').write_text(src)", "capture['intermediate'] = src")
exec(compile(outer_py, '<task6-v26-outer-composer>', 'exec'), {'Path': Path, 'capture': capture})
intermediate = capture['intermediate']
inner_py = intermediate.split("python3 - <<'TASK6_V26_COMPOSER_PY'\n", 1)[1].split("\nTASK6_V26_COMPOSER_PY", 1)[0]
capture = {}
inner_py = inner_py.replace("Path('/tmp/task6-v26-phase0.sh').write_text(src)", "capture['phase0'] = src")
exec(compile(inner_py, '<task6-v26-inner-composer>', 'exec'), {'Path': Path, 'capture': capture})
src = capture['phase0']
src = src.replace('V26', 'V27').replace('v26', 'v27')

def script_body(src, name):
    start = f"cat > \"$TASK6_V27_DIR/{name}\" <<'EOF'\n"
    end = f"\nEOF\nchmod +x \"$TASK6_V27_DIR/{name}\""
    return src.split(start, 1)[1].split(end, 1)[0]

def replace_script(src, name, body):
    old = script_body(src, name)
    return src.replace(old, body)

src = src.replace(
    "4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v25.md\nEOF",
    "4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v25.md\n"
    f"{V26_SHA}  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v26.md\nEOF"
)

report_new = r'''#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V27_DIR:-/tmp/task6-v27-artifacts}"
report="${TASK6_V27_REPORT:-docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md}"
python3 - "$report" <<'PY'
import os, pathlib, stat, sys
report = pathlib.Path(sys.argv[1])
cur = pathlib.Path('.')
for part in report.parent.parts:
    cur = cur / part
    if cur.exists() or cur.is_symlink():
        st = os.lstat(cur)
        if stat.S_ISLNK(st.st_mode): raise SystemExit('TASK6_V27_REPORT_PARENT_SYMLINK')
        if not stat.S_ISDIR(st.st_mode): raise SystemExit('TASK6_V27_REPORT_PARENT_NOT_DIR')
if report.is_symlink(): raise SystemExit('TASK6_V27_REPORT_SYMLINK')
if report.exists() and not report.is_file(): raise SystemExit('TASK6_V27_REPORT_NOT_FILE')
PY
report_dir="$(dirname "$report")"
mkdir -p "$report_dir"
test -d "$report_dir"
test ! -L "$report_dir"
chmod 0755 "$report_dir"
reviewers="$(mktemp "$dir/reviewers.XXXXXX")"
tmp=''
cleanup() {
  if [ -n "${reviewers:-}" ]; then rm -f "$reviewers"; fi
  if [ -n "${tmp:-}" ]; then rm -f "$tmp"; fi
}
trap cleanup EXIT
if [ -f "$report" ]; then
  python3 - "$report" "$dir/review-bundle.tsv.sha256" > "$reviewers" <<'PY'
import os, re, sys
report = sys.argv[1]
bundle = open(sys.argv[2]).read().split()[0] if os.path.exists(sys.argv[2]) else None
row_re = re.compile(r'^reviewer=[12] identity=[A-Za-z0-9._:@+-]{1,80} model=gpt-5\.6-sol effort=high outcome=PASS artifact=[A-Za-z0-9._/@:+-]{1,240} artifact_sha=[0-9a-f]{64} review_bundle_sha=[0-9a-f]{64}$')
rows = [line for line in open(report).read().splitlines() if line.startswith('reviewer=')]
if not rows:
    sys.exit(0)
if len(rows) != 2 or any(not row_re.fullmatch(row) for row in rows):
    raise SystemExit('TASK6_V27_STALE_REVIEWER_ROWS_INVALID')
ordinals = [row.split()[0] for row in rows]
if ordinals != ['reviewer=1', 'reviewer=2']:
    raise SystemExit('TASK6_V27_STALE_REVIEWER_ORDINALS')
ids, artifacts, hashes = set(), set(), set()
for row in rows:
    parts = dict(field.split('=', 1) for field in row.split()[1:])
    if bundle is not None and parts.get('review_bundle_sha') != bundle:
        raise SystemExit('TASK6_V27_STALE_REVIEWER_BUNDLE')
    ids.add(parts['identity']); artifacts.add(parts['artifact']); hashes.add(parts['artifact_sha'])
if len(ids) != 2 or len(artifacts) != 2 or len(hashes) != 2:
    raise SystemExit('TASK6_V27_STALE_REVIEWER_DUPLICATE')
print('\n'.join(rows))
PY
fi
tmp="$(mktemp "$report_dir/.task6-v27-base.XXXXXX")"
{
  echo 'plan_version=V27'
  echo "plan_v27_sha=$(cut -d' ' -f1 "$dir/approved-plan.sha256")"
  echo 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3'
  echo 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf'
  echo 'v20_contract_sha=1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305'
  echo 'v21_contract_sha=34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a'
  echo 'v22_contract_sha=93fd40339c146c2d644476940f08864f54b363774b2b9c694a91922c50f917f6'
  echo 'v23_contract_sha=721b193a593d9a4decd812b3fd7928a916f5a2488f1db0ad19fe399ad6712af4'
  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'
  echo 'v25_contract_sha=4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6'
  echo 'v26_contract_sha=e424505449fc09992e0ddafd80e53227741f487dcddc14efc5b8ba698f7b0277'
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
python3 - "$tmp" "$report" <<'PY'
import os, pathlib, stat, sys
tmp = pathlib.Path(sys.argv[1])
report = pathlib.Path(sys.argv[2])
st = os.lstat(tmp)
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
    raise SystemExit('TASK6_V27_REPORT_TMP_TYPE')
os.chmod(tmp, 0o644)
with open(tmp, 'rb') as f:
    os.fsync(f.fileno())
cur = pathlib.Path('.')
for part in report.parent.parts:
    cur = cur / part
    st = os.lstat(cur)
    if stat.S_ISLNK(st.st_mode): raise SystemExit('TASK6_V27_REPORT_PARENT_SYMLINK_BEFORE_REPLACE')
    if not stat.S_ISDIR(st.st_mode): raise SystemExit('TASK6_V27_REPORT_PARENT_NOT_DIR_BEFORE_REPLACE')
if report.is_symlink(): raise SystemExit('TASK6_V27_REPORT_SYMLINK_BEFORE_REPLACE')
if report.exists() and not report.is_file(): raise SystemExit('TASK6_V27_REPORT_NOT_FILE_BEFORE_REPLACE')
os.replace(tmp, report)
with open(report, 'rb') as f:
    os.fsync(f.fileno())
fd = os.open(str(report.parent), os.O_RDONLY)
try:
    os.fsync(fd)
finally:
    os.close(fd)
PY
tmp=''
rm -f "$reviewers"
reviewers=''
trap - EXIT
'''
src = replace_script(src, 'write-report-base.sh', report_new)

phase_a = script_body(src, 'phase-a.sh')
phase_a = phase_a.replace(
    "if [ -e docs/superpowers/reports ] && [ -L docs/superpowers/reports ]; then exit 1; fi\n"
    "mkdir -p docs/superpowers/reports\n"
    "test -d docs/superpowers/reports\n"
    "test ! -L docs/superpowers/reports\n"
    "chmod 0755 docs/superpowers/reports\n"
    "python3 - \"$report\" <<'PY'\n"
    "import os, pathlib, stat, sys\n"
    "report = pathlib.Path(sys.argv[1])\n"
    "cur = pathlib.Path('.')\n"
    "for part in report.parent.parts:\n"
    "    cur = cur / part\n"
    "    if cur.exists() or cur.is_symlink():\n"
    "        st = os.lstat(cur)\n"
    "        if stat.S_ISLNK(st.st_mode): raise SystemExit('TASK6_V27_REPORT_PARENT_SYMLINK')\n"
    "        if not stat.S_ISDIR(st.st_mode): raise SystemExit('TASK6_V27_REPORT_PARENT_NOT_DIR')\n"
    "if report.is_symlink(): raise SystemExit('TASK6_V27_REPORT_SYMLINK')\n"
    "if report.exists() and not report.is_file(): raise SystemExit('TASK6_V27_REPORT_NOT_FILE')\n"
    "PY\n"
    "touch \"$report\"",
    "python3 - \"$report\" <<'PY'\n"
    "import os, pathlib, stat, sys\n"
    "report = pathlib.Path(sys.argv[1])\n"
    "cur = pathlib.Path('.')\n"
    "for part in report.parent.parts:\n"
    "    cur = cur / part\n"
    "    if cur.exists() or cur.is_symlink():\n"
    "        st = os.lstat(cur)\n"
    "        if stat.S_ISLNK(st.st_mode): raise SystemExit('TASK6_V27_REPORT_PARENT_SYMLINK_BEFORE_MKDIR')\n"
    "        if not stat.S_ISDIR(st.st_mode): raise SystemExit('TASK6_V27_REPORT_PARENT_NOT_DIR_BEFORE_MKDIR')\n"
    "if report.is_symlink(): raise SystemExit('TASK6_V27_REPORT_SYMLINK_BEFORE_MKDIR')\n"
    "if report.exists() and not report.is_file(): raise SystemExit('TASK6_V27_REPORT_NOT_FILE_BEFORE_MKDIR')\n"
    "PY\n"
    "mkdir -p \"$(dirname \"$report\")\"\n"
    "test -d \"$(dirname \"$report\")\"\n"
    "test ! -L \"$(dirname \"$report\")\"\n"
    "chmod 0755 \"$(dirname \"$report\")\"\n"
    "touch \"$report\""
)
phase_a = phase_a.replace(
    "  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'\n"
    "  echo \"phase0_script_sha=",
    "  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'\n"
    "  echo 'v25_contract_sha=4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6'\n"
    "  echo 'v26_contract_sha=e424505449fc09992e0ddafd80e53227741f487dcddc14efc5b8ba698f7b0277'\n"
    "  echo \"phase0_script_sha="
)
src = replace_script(src, 'phase-a.sh', phase_a)

stage_b = script_body(src, 'stage-b.sh')
stage_b = stage_b.replace(
    "if command -v python3 >/dev/null 2>&1; then python3 - <<'PY'\n"
    "import os\n"
    "fd = os.open('docs/superpowers/reports', os.O_RDONLY)\n"
    "try: os.fsync(fd)\n"
    "finally: os.close(fd)\n"
    "PY\nfi",
    "if command -v python3 >/dev/null 2>&1; then python3 - \"$report_dir\" <<'PY'\n"
    "import os, sys\n"
    "fd = os.open(sys.argv[1], os.O_RDONLY)\n"
    "try: os.fsync(fd)\n"
    "finally: os.close(fd)\n"
    "PY\nfi"
)
stage_b = stage_b.replace(
    "mv \"$tmp_report\" \"$report\"\n"
    "trap - EXIT",
    "if rg -n '[[:blank:]]+$' \"$tmp_report\"; then exit 1; fi\n"
    "mv \"$tmp_report\" \"$report\"\n"
    "trap - EXIT"
)
stage_b = stage_b.replace(
    "if rg -n '[[:blank:]]+$' \"$report\"; then exit 1; fi",
    ": # whitespace validated on tmp_report before atomic mv"
)
src = replace_script(src, 'stage-b.sh', stage_b)

src = src.replace(
    "if 'var token = x.lease;' not in exact_body:\n"
    "    raise SystemExit('TASK6_V27_EXACT_NULL_REUSES_LEASE_MISSING')\n",
    "if exact_body.count('var SchedulerWriter = writerModule.SchedulerWriter;') != 0:\n"
    "    raise SystemExit('TASK6_V27_EXACT_NULL_SCHEDULERWRITER_DUP')\n"
    "if 'var token = x.lease;' not in exact_body:\n"
    "    raise SystemExit('TASK6_V27_EXACT_NULL_REUSES_LEASE_MISSING')\n"
)

checks = {
    'TASK6_V27_REPORT_BASE_TMP_WRONG_FS': 'mktemp "$dir/report.XXXXXX"' not in src,
    'TASK6_V27_REPORT_BASE_TMP_MISSING': 'mktemp "$report_dir/.task6-v27-base.XXXXXX"' in src,
    'TASK6_V27_REPORT_BASE_ATOMIC_REPLACE_MISSING': 'os.replace(tmp, report)' in src,
    'TASK6_V27_STAGEB_FSYNC_HARDCODED': "fd = os.open('docs/superpowers/reports', os.O_RDONLY)" not in src,
    'TASK6_V27_STAGEB_TMP_WHITESPACE_MISSING': "if rg -n '[[:blank:]]+$' \"$tmp_report\"; then exit 1; fi" in src,
    'TASK6_V27_PHASEA_PREWRITE_LSTAT_MISSING': 'TASK6_V27_REPORT_PARENT_SYMLINK_BEFORE_MKDIR' in src,
    'TASK6_V27_REVIEW_BUNDLE_V25_MISSING': 'v25_contract_sha=4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6' in phase_a,
    'TASK6_V27_REVIEW_BUNDLE_V26_MISSING': f'v26_contract_sha={V26_SHA}' in phase_a,
    'TASK6_V27_EXACT_NULL_DUP_GUARD_MISSING': 'TASK6_V27_EXACT_NULL_SCHEDULERWRITER_DUP' in src,
}
for code, ok in checks.items():
    if not ok:
        raise SystemExit(code)

Path('/tmp/task6-v27-phase0.sh').write_text(src)
TASK6_V27_COMPOSER_PY
chmod +x /tmp/task6-v27-phase0.sh
bash -n /tmp/task6-v27-phase0.sh
TASK6_V27_APPROVED_SHA="$TASK6_V27_APPROVED_SHA" /tmp/task6-v27-phase0.sh
SH
chmod +x /tmp/task6-v27-compose-and-run-phase0.sh
bash -n /tmp/task6-v27-compose-and-run-phase0.sh
TASK6_V27_APPROVED_SHA="$TASK6_V27_APPROVED_SHA" /tmp/task6-v27-compose-and-run-phase0.sh
```

## V27 exact-null overlay authority

The composer uses this body for the exact-null overlay. It acquires the scheduler lease with the final writer owner before scheduling the account wake, reuses that same token, and avoids a local `SchedulerWriter` alias so the composed test cannot contain duplicate declarations.

```js
// TASK6_V27_REPLACEMENT_START EXACT_NULL
test('Task 6 v27 overlay exact null partial retains running lock without lifecycle calls', function () {
  var sentinel = 'TASK6V27_RED_008_EXACT_NULL_PARTIAL';
  var writerModule = require('../server/scheduler/writer.js');
  task6v27RequireFunction(writerModule, 'SchedulerWriter', sentinel, 'export.SchedulerWriter');
  task6v27RequireFunction(writerModule.SchedulerWriter.prototype, 'executeClaimedInCurrentUow', sentinel);
  var T = 1_800_010_081, accountId = 880_081, revision = 7, x = taoWorldSchedulerTam();
  try {
    x.clock.setS(T - 1);
    x.ownerId = '00000000-0000-4000-8000-000000000881';
    x.lease = layLease(x, x.ownerId);
    taoDqChoReconcile(x, accountId, revision);
    x.accountJob = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(x.lease, accountId, revision, T, x.clock.nowMs());
    }, {immediate: true});
    assert.ok(x.accountJob && x.accountJob.id, 'TASK6V27_FIXTURE_ACCOUNT_JOB_CREATED');
    var loaded = x.store.getById(x.accountJob.id);
    assert.equal(loaded.id, x.accountJob.id, 'TASK6V27_FIXTURE_ACCOUNT_JOB_LOADABLE');
    assert.equal(loaded.kind, 'ACCOUNT_ADVANCE', 'TASK6V27_FIXTURE_ACCOUNT_KIND');
    assert.equal(Number(loaded.aggregate_id), accountId, 'TASK6V27_FIXTURE_ACCOUNT_ID');
    assert.equal(Number(loaded.expected_revision), revision, 'TASK6V27_FIXTURE_ACCOUNT_REVISION');
    assert.equal(Number(loaded.scheduled_at_s), T, 'TASK6V27_FIXTURE_ACCOUNT_TARGET');
    installAdvanceServiceFixture(x);
    x.reducer = new EventReducer({kho: x.kho, world: x.world, store: x.store,
      clock: x.clock, advanceService: x.service});
    x.writer = new writerModule.SchedulerWriter({
      ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: 1_000, leaseMs: 15_000, manualDrain: true
    });
    x.clock.setS(T);
    var token = x.lease;
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
      assert.ok(claimed && claimed.id, 'TASK6V27_FIXTURE_ACCOUNT_JOB_CLAIMED');
      assert.equal(claimed.id, x.accountJob.id, 'TASK6V27_FIXTURE_ACCOUNT_EXACT_CLAIM');
      beforeLock = task6v27LockProjection(task6v27RawJob(x.kho, claimed.id));
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
      afterLock = task6v27LockProjection(task6v27RawJob(x.kho, claimed.id));
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
// TASK6_V27_REPLACEMENT_END EXACT_NULL
```

## V27 verification notes

- Composer heredoc closes before chmod/bash-n/invoke; the composer writes only `/tmp/task6-v27-phase0.sh`.
- PhaseA does a full existing-ancestor `lstat` walk and report symlink/nonregular check before any `mkdir`, `chmod`, `touch`, or report write.
- Base report producer writes its candidate under `$(dirname "$report")/.task6-v27-base.XXXXXX`, validates/chmods/fsyncs it, then uses `os.replace(tmp, report)` and fsyncs the actual computed report directory.
- StageB validates trailing whitespace on `$tmp_report` before atomic `mv`, then fsyncs the computed `$report_dir`; no hardcoded `docs/superpowers/reports` path remains.
- StageB reviewer artifact validation and final reviewer rows keep V26 safe no-whitespace/no-`=` grammar.
- PhaseA review bundle includes `v25_contract_sha` and `v26_contract_sha`.
- Exact-null setup uses the same owner/token for scheduling, writer ownership, claim, and mutation; exact-null body has no local `var SchedulerWriter = writerModule.SchedulerWriter;`.

## Self-audit checklist

- [ ] Composer shell and Python compile.
- [ ] Generated Phase0, PhaseA, StageB, report producer, and RED runner all pass `bash -n`.
- [ ] Generated report producer contains `mktemp "$report_dir/.task6-v27-base.XXXXXX"`, `os.replace(tmp, report)`, and no `mktemp "$dir/report.XXXXXX"`.
- [ ] Generated PhaseA contains `TASK6_V27_REPORT_PARENT_SYMLINK_BEFORE_MKDIR` before `mkdir -p "$(dirname "$report")"`.
- [ ] Generated StageB contains `mktemp "$report_dir/.task6-v27-report.XXXXXX"`, validates `"$tmp_report"` whitespace before `mv`, and fsyncs `sys.argv[1]` from `$report_dir`.
- [ ] Overlay extraction yields 8 V27 tests; exact-null contains `var token = x.lease`, no exact-null `var token = layLease(...)`, and zero exact-null local `SchedulerWriter` aliases.
- [ ] Single-shot clean composer test: `rm -f /tmp/task6-v27-compose-and-run-phase0.sh /tmp/task6-v27-phase0.sh; TASK6_V27_APPROVED_SHA=<approved-v27-sha> bash <(awk '/^cat > \\/tmp\\/task6-v27-compose-and-run-phase0\\.sh <<\\x27SH\\x27$/{flag=1} flag{print} /^TASK6_V27_APPROVED_SHA=\"\\$TASK6_V27_APPROVED_SHA\" \\/tmp\\/task6-v27-compose-and-run-phase0\\.sh$/{print; exit}' docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v27.md); test -s /tmp/task6-v27-phase0.sh; test -s /tmp/task6-v27-artifacts/env.sh`.
