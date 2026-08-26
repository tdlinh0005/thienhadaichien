# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V26

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`. Execute in order. This plan is a corrective successor to V25 and must be treated as immutable after approval.

**Goal:** Implement Task6 writer lifecycle/global watermark/retry/backoff/quarantine with the accepted Task5 seams and a reproducible pre-edit/TDD/post-edit validation workflow.

**Architecture:** V26 retains V25 production contracts and counts (`parent73 + overlay8 = N81`) and composes its executable workflow from pinned V25. It then replaces only the four known-broken areas: symlink-safe report writes, same-filesystem atomic StageB report replacement, safe reviewer row grammar, and exact-null overlay lease ownership.

**Tech Stack:** Node.js built-in test runner (`node --test --test-isolation=none --test-reporter=tap`), SQLite scheduler store, existing Task1-5 modules, shell/Python/Node validation scripts.

**Spec:** `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` Task6 section beginning around line 10866, accepted Task5 remediation plan, live accepted Task1-5 code.

---

## Global constraints

- Preserve V1-V25 plan artifacts. V26 planning creates only this file.
- Implementation may modify only:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- Counts: `parent runtime=73 + overlay=8 => N=81`; final scheduler TAP `244 tests / 243 pass / 0 fail / 1 skipped`.
- Root supplies `TASK6_V26_APPROVED_SHA`; the plan never embeds its own hash.

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
```

## V26 workflow

1. Before any source/test/report edit, run the composer below. It writes `/tmp/task6-v26-phase0.sh` and runs Phase0.
2. Create minimal skeleton exports in the six owned files.
3. Append sealed V26 helper/parent/overlay slices.
4. Run RED exactly once: `. /tmp/task6-v26-artifacts/env.sh && "$TASK6_V26_DIR/red-run.sh"`.
5. Implement GREEN in the six owned files.
6. Run PhaseA: `. /tmp/task6-v26-artifacts/env.sh && "$TASK6_V26_DIR/phase-a.sh"`.
7. Run two fresh Sol/high reviews over the exact V26 review bundle. Then set reviewer artifact paths and run StageB.

## V26 composer

Run this from repo root before edits:

```bash
cat > /tmp/task6-v26-compose-and-run-phase0.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

test -n "${TASK6_V26_APPROVED_SHA:-}"
case "$TASK6_V26_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V26_APPROVED_SHA}" -eq 64

python3 - <<'TASK6_V26_COMPOSER_PY'
from pathlib import Path
v25 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v25.md').read_text()
src = v25.split("cat > /tmp/task6-v25-compose-and-run-phase0.sh <<'SH'\n", 1)[1].split("\nSH\nchmod +x /tmp/task6-v25-compose-and-run-phase0.sh", 1)[0]
src = src.replace('V25', 'V26').replace('v25', 'v26')

src = src.replace(
    "v24='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md'\nreport=",
    "v24='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md'\nv25='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v25.md'\nreport="
)
src = src.replace(
    "9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md\nEOF",
    "9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md\n4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v25.md\nEOF"
)

src = src.replace(
    "v24 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md').read_text()\n",
    "v24 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v24.md').read_text()\nv26 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v26.md').read_text()\n"
)
src = src.replace(
    "if name == 'EXACT_NULL':\n        return v24.split('// TASK6_V26_REPLACEMENT_START EXACT_NULL\\n', 1)[1].split('// TASK6_V26_REPLACEMENT_END EXACT_NULL', 1)[0]",
    "if name == 'EXACT_NULL':\n        return v26.split('// TASK6_V26_REPLACEMENT_START EXACT_NULL\\n', 1)[1].split('// TASK6_V26_REPLACEMENT_END EXACT_NULL', 1)[0]"
)

src = src.replace(
    "  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'\n  echo 'counts=parent73+overlay8=N81 final=244/243/0/1'",
    "  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'\n  echo 'v25_contract_sha=4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6'\n  echo 'counts=parent73+overlay8=N81 final=244/243/0/1'"
)

src = src.replace(
    "  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'\n"
    "  echo \"phase0_script_sha=",
    "  echo 'v24_contract_sha=9585b66e2607ea4a630c1f1a451f16acc02669c4ce4a630c52a56a06ef5b87da'\n"
    "  echo 'v25_contract_sha=4bdc2796f1c0b34d436a428d1f3ed4931732c7e644b2363819def3868871e6c6'\n"
    "  echo \"phase0_script_sha="
)

src = src.replace(
    "if any(s in body for s in ['Task 6 v21', 'TASK6V21', 'task6v21', 'Task 6 v23', 'TASK6V23', 'task6v23']):\n"
    "    raise SystemExit('TASK6_V26_OVERLAY_NAMESPACE_LEAK')\n"
    "print(body, end='')",
    "if any(s in body for s in ['Task 6 v21', 'TASK6V21', 'task6v21', 'Task 6 v23', 'TASK6V23', 'task6v23']):\n"
    "    raise SystemExit('TASK6_V26_OVERLAY_NAMESPACE_LEAK')\n"
    "exact_title = \"test('Task 6 v26 overlay exact null partial retains running lock without lifecycle calls'\"\n"
    "exact_body = body.split(exact_title, 1)[1]\n"
    "next_test = exact_body.find(\"\\ntest('Task 6 v26 overlay \")\n"
    "if next_test >= 0:\n"
    "    exact_body = exact_body[:next_test]\n"
    "if 'var token = x.lease;' not in exact_body:\n"
    "    raise SystemExit('TASK6_V26_EXACT_NULL_REUSES_LEASE_MISSING')\n"
    "forbidden_token = 'var token = ' + 'layLease(x, x.ownerId);'\n"
    "if forbidden_token in exact_body:\n"
    "    raise SystemExit('TASK6_V26_EXACT_NULL_OWNER_SWITCH')\n"
    "print(body, end='')"
)

inner_patch = r"""
src = src.replace(
    "if [ -e \"$report\" ] && [ -L \"$report\" ]; then exit 1; fi\n"
    "if [ -e \"$report\" ] && [ ! -f \"$report\" ]; then exit 1; fi\n"
    "touch \"$report\"\n"
    "test -f \"$report\"\n"
    "test ! -L \"$report\"\n"
    "chmod 0644 \"$report\"",
    "python3 - \"$report\" <<'PY'\n"
    "import os, pathlib, stat, sys\n"
    "report = pathlib.Path(sys.argv[1])\n"
    "cur = pathlib.Path('.')\n"
    "for part in report.parent.parts:\n"
    "    cur = cur / part\n"
    "    if cur.exists() or cur.is_symlink():\n"
    "        st = os.lstat(cur)\n"
    "        if stat.S_ISLNK(st.st_mode): raise SystemExit('TASK6_V26_REPORT_PARENT_SYMLINK')\n"
    "        if not stat.S_ISDIR(st.st_mode): raise SystemExit('TASK6_V26_REPORT_PARENT_NOT_DIR')\n"
    "if report.is_symlink(): raise SystemExit('TASK6_V26_REPORT_SYMLINK')\n"
    "if report.exists() and not report.is_file(): raise SystemExit('TASK6_V26_REPORT_NOT_FILE')\n"
    "PY\n"
    "touch \"$report\"\n"
    "test -f \"$report\"\n"
    "test ! -L \"$report\"\n"
    "chmod 0644 \"$report\""
)

report_old = src.split("cat > \"$TASK6_V26_DIR/write-report-base.sh\" <<'EOF'\n", 1)[1].split("\nEOF\nchmod +x \"$TASK6_V26_DIR/write-report-base.sh\"", 1)[0]
report_new = report_old.replace(
    "mkdir -p \"$(dirname \"$report\")\"\n"
    "test -d \"$(dirname \"$report\")\"\n"
    "test ! -L \"$(dirname \"$report\")\"\n"
    "chmod 0755 \"$(dirname \"$report\")\"",
    "python3 - \"$report\" <<'PY'\n"
    "import os, pathlib, stat, sys\n"
    "report = pathlib.Path(sys.argv[1])\n"
    "cur = pathlib.Path('.')\n"
    "for part in report.parent.parts:\n"
    "    cur = cur / part\n"
    "    if cur.exists() or cur.is_symlink():\n"
    "        st = os.lstat(cur)\n"
    "        if stat.S_ISLNK(st.st_mode): raise SystemExit('TASK6_V26_REPORT_PARENT_SYMLINK')\n"
    "        if not stat.S_ISDIR(st.st_mode): raise SystemExit('TASK6_V26_REPORT_PARENT_NOT_DIR')\n"
    "if report.is_symlink(): raise SystemExit('TASK6_V26_REPORT_SYMLINK')\n"
    "if report.exists() and not report.is_file(): raise SystemExit('TASK6_V26_REPORT_NOT_FILE')\n"
    "PY\n"
    "mkdir -p \"$(dirname \"$report\")\"\n"
    "test -d \"$(dirname \"$report\")\"\n"
    "test ! -L \"$(dirname \"$report\")\"\n"
    "chmod 0755 \"$(dirname \"$report\")\""
)
src = src.replace(report_old, report_new)

stage_b_old = src.split("cat > \"$TASK6_V26_DIR/stage-b.sh\" <<'EOF'\n", 1)[1].split("\nEOF\nchmod +x \"$TASK6_V26_DIR/stage-b.sh\"", 1)[0]
stage_b_new = r'''#!/usr/bin/env bash
set -euo pipefail
dir="${TASK6_V26_DIR:-/tmp/task6-v26-artifacts}"
report="${TASK6_V26_REPORT:-docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md}"
"$dir/phase-a.sh"
test -n "${TASK6_V26_REVIEWER_1_ARTIFACT:-}"
test -n "${TASK6_V26_REVIEWER_2_ARTIFACT:-}"
python3 - "$report" <<'PY'
import os, pathlib, stat, sys
report = pathlib.Path(sys.argv[1])
cur = pathlib.Path('.')
for part in report.parent.parts:
    cur = cur / part
    st = os.lstat(cur)
    if stat.S_ISLNK(st.st_mode): raise SystemExit('TASK6_V26_STAGEB_PARENT_SYMLINK')
    if not stat.S_ISDIR(st.st_mode): raise SystemExit('TASK6_V26_STAGEB_PARENT_NOT_DIR')
if report.is_symlink(): raise SystemExit('TASK6_V26_STAGEB_REPORT_SYMLINK')
if report.exists() and not report.is_file(): raise SystemExit('TASK6_V26_STAGEB_REPORT_NOT_FILE')
PY
report_dir="$(dirname "$report")"
tmp_reviewers="$(mktemp "$dir/reviewers.new.XXXXXX")"
tmp_report="$(mktemp "$report_dir/.task6-v26-report.XXXXXX")"
cleanup() { rm -f "$tmp_reviewers" "$tmp_report"; }
trap cleanup EXIT
python3 - "$TASK6_V26_REVIEWER_1_ARTIFACT" "$TASK6_V26_REVIEWER_2_ARTIFACT" > "$tmp_reviewers" <<'PY'
import hashlib, os, re, stat, sys
paths = sys.argv[1:]
if len(paths) != 2 or paths[0] == paths[1]:
    raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_PATHS')
safe_identity = re.compile(r'^[A-Za-z0-9._:@+-]{1,80}$')
safe_path = re.compile(r'^[A-Za-z0-9._/@:+-]{1,240}$')
dir = os.environ.get('TASK6_V26_DIR', '/tmp/task6-v26-artifacts')
keys = ['identity','model','effort','outcome','plan_v26_sha','stage_a_script_sha','report_producer_sha','review_bundle_sha','six_meta_sha','stage_a_normalized_tap_sha','stage_a_throw_normalized_tap_sha','overlay_red_evidence_sha']
expected = {
 'model':'gpt-5.6-sol','effort':'high','outcome':'PASS',
 'plan_v26_sha':open(os.path.join(dir,'approved-plan.sha256')).read().split()[0],
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
    if not safe_path.fullmatch(p): raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_PATH_SAFE')
    st = os.lstat(p)
    if not stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode):
        raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_TYPE')
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    if h in hashes: raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_SHA_DUP')
    hashes.add(h)
    lines = open(p).read().splitlines()
    if len(lines) != len(keys): raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_LINE_COUNT')
    parsed = {}
    for line in lines:
        if '=' not in line: raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_FORMAT')
        k, v = line.split('=', 1)
        if k in parsed: raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_DUP_KEY')
        if any(ch.isspace() for ch in k + v) or '=' in k or (k in ('identity',) and '=' in v):
            raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_UNSAFE_VALUE')
        parsed[k] = v
    if list(parsed.keys()) != keys: raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_KEYS')
    for k, v in expected.items():
        if parsed[k] != v: raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_VALUE_' + k)
    if not safe_identity.fullmatch(parsed['identity']) or parsed['identity'] in ids:
        raise SystemExit('TASK6_V26_REVIEW_ARTIFACT_IDENTITY')
    ids.add(parsed['identity'])
    print('reviewer=%d identity=%s model=%s effort=%s outcome=%s artifact=%s artifact_sha=%s review_bundle_sha=%s' % (idx, parsed['identity'], parsed['model'], parsed['effort'], parsed['outcome'], p, h, bundle))
PY
python3 - "$report" "$tmp_reviewers" "$tmp_report" <<'PY'
import os, re, sys
report, new_path, tmp_report = sys.argv[1:]
row_re = re.compile(r'^reviewer=[12] identity=[A-Za-z0-9._:@+-]{1,80} model=gpt-5\.6-sol effort=high outcome=PASS artifact=[A-Za-z0-9._/@:+-]{1,240} artifact_sha=[0-9a-f]{64} review_bundle_sha=[0-9a-f]{64}$')
new_rows = open(new_path).read().splitlines()
if len(new_rows) != 2 or any(not row_re.fullmatch(row) for row in new_rows):
    raise SystemExit('TASK6_V26_NEW_REVIEWER_ROWS_INVALID')
old_rows = [line for line in open(report).read().splitlines() if line.startswith('reviewer=')]
if old_rows and old_rows != new_rows:
    raise SystemExit('TASK6_V26_REVIEWER_STALE_OR_MISMATCH')
base = [line for line in open(report).read().splitlines() if not line.startswith('reviewer=')]
content = '\n'.join(base + new_rows) + '\n'
if any(line.startswith('reviewer=') and not row_re.fullmatch(line) for line in content.splitlines()):
    raise SystemExit('TASK6_V26_FINAL_REVIEWER_ROWS_INVALID')
with open(tmp_report, 'w') as f:
    f.write(content)
    f.flush()
    os.fsync(f.fileno())
PY
chmod 0644 "$tmp_report"
python3 - "$tmp_report" "$dir/review-bundle.tsv.sha256" <<'PY'
import re, sys
tmp_report, bundle_path = sys.argv[1:]
bundle = open(bundle_path).read().split()[0]
rows = [line for line in open(tmp_report).read().splitlines() if line.startswith('reviewer=')]
if len(rows) != 2: raise SystemExit('TASK6_V26_REVIEWER_COUNT')
ids, arts, hashes, bundles = set(), set(), set(), set()
for row in rows:
    parts = dict(field.split('=', 1) for field in row.split()[1:])
    ids.add(parts['identity']); arts.add(parts['artifact']); hashes.add(parts['artifact_sha']); bundles.add(parts['review_bundle_sha'])
if len(ids) != 2 or len(arts) != 2 or len(hashes) != 2 or bundles != {bundle}:
    raise SystemExit('TASK6_V26_REVIEWER_BINDING')
PY
mv "$tmp_report" "$report"
trap - EXIT
rm -f "$tmp_reviewers"
if command -v python3 >/dev/null 2>&1; then python3 - <<'PY'
import os
fd = os.open('docs/superpowers/reports', os.O_RDONLY)
try: os.fsync(fd)
finally: os.close(fd)
PY
fi
if rg -n '[[:blank:]]+$' "$report"; then exit 1; fi'''
src = src.replace(stage_b_old, stage_b_new)

src = src.replace(
    "if any(s in body for s in ['Task 6 v21', 'TASK6V21', 'task6v21', 'Task 6 v23', 'TASK6V23', 'task6v23']):\n"
    "    raise SystemExit('TASK6_V26_OVERLAY_NAMESPACE_LEAK')\n"
    "print(body, end='')",
    "if any(s in body for s in ['Task 6 v21', 'TASK6V21', 'task6v21', 'Task 6 v23', 'TASK6V23', 'task6v23']):\n"
    "    raise SystemExit('TASK6_V26_OVERLAY_NAMESPACE_LEAK')\n"
    "exact_title = \"test('Task 6 v26 overlay exact null partial retains running lock without lifecycle calls'\"\n"
    "exact_body = body.split(exact_title, 1)[1]\n"
    "next_test = exact_body.find(\"\\ntest('Task 6 v26 overlay \")\n"
    "if next_test >= 0:\n"
    "    exact_body = exact_body[:next_test]\n"
    "if 'var token = x.lease;' not in exact_body:\n"
    "    raise SystemExit('TASK6_V26_EXACT_NULL_REUSES_LEASE_MISSING')\n"
    "forbidden_token = 'var token = ' + 'layLease(x, x.ownerId);'\n"
    "if forbidden_token in exact_body:\n"
    "    raise SystemExit('TASK6_V26_EXACT_NULL_OWNER_SWITCH')\n"
    "print(body, end='')"
)

src = src.replace(
    "x.lease = layLease(x, x.lease.ownerId);\n    taoDqChoReconcile",
    "x.ownerId = '00000000-0000-4000-8000-000000000881';\n    x.lease = layLease(x, x.ownerId);\n    taoDqChoReconcile"
)
src = src.replace("    x.ownerId = '00000000-0000-4000-8000-000000000881';\n    x.writer = new SchedulerWriter({", "    x.writer = new SchedulerWriter({")
src = src.replace('var token = layLease(x, x.ownerId);', 'var token = x.lease;')

if '[ -e "$report" ] && [ -L "$report" ]' in src:
    raise SystemExit('TASK6_V26_DANGLING_SYMLINK_CHECK_INCOMPLETE')
if 'mktemp "$dir/report.stageb.' in src:
    raise SystemExit('TASK6_V26_STAGEB_TMP_WRONG_FS')
if 'safe_identity' not in src or 'safe_path' not in src:
    raise SystemExit('TASK6_V26_REVIEWER_SAFE_GRAMMAR_MISSING')
if 'var token = layLease(x, x.ownerId);' in src:
    raise SystemExit('TASK6_V26_EXACT_NULL_OWNER_SWITCH')
"""
src = src.replace("Path('/tmp/task6-v26-phase0.sh').write_text(src)",
    inner_patch + "\nPath('/tmp/task6-v26-phase0.sh').write_text(src)")

Path('/tmp/task6-v26-compose-and-run-phase0.sh').write_text(src)
TASK6_V26_COMPOSER_PY
chmod +x /tmp/task6-v26-compose-and-run-phase0.sh
bash -n /tmp/task6-v26-compose-and-run-phase0.sh
TASK6_V26_APPROVED_SHA="$TASK6_V26_APPROVED_SHA" /tmp/task6-v26-compose-and-run-phase0.sh
SH
```

## V26 exact-null overlay authority

The composer uses this body for the exact-null overlay. It acquires the scheduler lease with the final writer owner before scheduling the account wake, then reuses the same token; it never attempts to switch owners while the earlier lease is still live.

```js
// TASK6_V26_REPLACEMENT_START EXACT_NULL
test('Task 6 v26 overlay exact null partial retains running lock without lifecycle calls', function () {
  var sentinel = 'TASK6V26_RED_008_EXACT_NULL_PARTIAL';
  var writerModule = require('../server/scheduler/writer.js');
  task6v26RequireFunction(writerModule, 'SchedulerWriter', sentinel, 'export.SchedulerWriter');
  task6v26RequireFunction(writerModule.SchedulerWriter.prototype, 'executeClaimedInCurrentUow', sentinel);
  var SchedulerWriter = writerModule.SchedulerWriter;
  var T = 1_800_010_081, accountId = 880_081, revision = 7, x = taoWorldSchedulerTam();
  try {
    x.clock.setS(T - 1);
    x.ownerId = '00000000-0000-4000-8000-000000000881';
    x.lease = layLease(x, x.ownerId);
    taoDqChoReconcile(x, accountId, revision);
    x.accountJob = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(x.lease, accountId, revision, T, x.clock.nowMs());
    }, {immediate: true});
    assert.ok(x.accountJob && x.accountJob.id, 'TASK6V26_FIXTURE_ACCOUNT_JOB_CREATED');
    var loaded = x.store.getById(x.accountJob.id);
    assert.equal(loaded.id, x.accountJob.id, 'TASK6V26_FIXTURE_ACCOUNT_JOB_LOADABLE');
    assert.equal(loaded.kind, 'ACCOUNT_ADVANCE', 'TASK6V26_FIXTURE_ACCOUNT_KIND');
    assert.equal(Number(loaded.aggregate_id), accountId, 'TASK6V26_FIXTURE_ACCOUNT_ID');
    assert.equal(Number(loaded.expected_revision), revision, 'TASK6V26_FIXTURE_ACCOUNT_REVISION');
    assert.equal(Number(loaded.scheduled_at_s), T, 'TASK6V26_FIXTURE_ACCOUNT_TARGET');
    installAdvanceServiceFixture(x);
    x.reducer = new EventReducer({kho: x.kho, world: x.world, store: x.store,
      clock: x.clock, advanceService: x.service});
    x.writer = new SchedulerWriter({
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
      assert.ok(claimed && claimed.id, 'TASK6V26_FIXTURE_ACCOUNT_JOB_CLAIMED');
      assert.equal(claimed.id, x.accountJob.id, 'TASK6V26_FIXTURE_ACCOUNT_EXACT_CLAIM');
      beforeLock = task6v26LockProjection(task6v26RawJob(x.kho, claimed.id));
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
      afterLock = task6v26LockProjection(task6v26RawJob(x.kho, claimed.id));
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
// TASK6_V26_REPLACEMENT_END EXACT_NULL
```

## V26 verification notes

- PhaseA checks report parent chain using `lstat` and rejects dangling symlinks via `report.is_symlink()` before any `touch`, `chmod`, or write.
- StageB temp report is created in `$(dirname "$report")`, not `/tmp`; the final `mv` is same-filesystem atomic.
- StageB validates reviewer artifacts and final reviewer rows against safe no-whitespace/no-`=` grammar before writing the temp report. Failure leaves the repo report unchanged.
- Exact-null setup uses the same owner/token for scheduling, writer ownership, claim, and mutation.
- V25 fixes remain: pre metadata tolerates missing files; final metadata requires regular `100644`; helper imports are minimal; RED validates self/provenance/suffix and `node --check tools/test-scheduler.js`.

## Self-audit checklist

- [ ] Composer shell and Python compile.
- [ ] Generated Phase0, PhaseA, StageB, report producer, and RED runner all pass `bash -n`.
- [ ] Generated PhaseA contains no `[ -e "$report" ] && [ -L "$report" ]`; it uses direct symlink/lstat checks before write.
- [ ] Generated StageB contains `mktemp "$report_dir/.task6-v26-report.XXXXXX"` and no `mktemp "$dir/report.stageb`.
- [ ] Generated StageB contains `safe_identity`, `safe_path`, and validates final temp report before same-FS `mv`.
- [ ] Overlay extraction yields 8 V26 tests and exact-null contains `var token = x.lease`, not `layLease(x, x.ownerId)` after scheduling.
