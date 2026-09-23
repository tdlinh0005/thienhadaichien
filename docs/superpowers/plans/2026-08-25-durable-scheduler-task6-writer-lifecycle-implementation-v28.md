# Durable Scheduler Task 6 Corrective Successor Plan V28

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion`. Treat this file as immutable only after two fresh Sol/high plan approvals.

**Goal:** Correct two authority defects found by V27 Stage A, finish Task 6, and produce auditable normal/throw evidence without weakening crash identity or hiding the upstream Task 4 omission.

**Precedence:** V28 supersedes V27's six-file scope, exact test slice, `244/243/0/1` count, Phase A/report workflow, review bundle, and final report path. V28 retains V27's production contracts, its eight overlay contracts, and its pre-GREEN RED evidence. The final V28 count is `245 tests / 244 pass / 0 fail / 1 skipped` because V28 adds one constructor regression.

## Authorities and inherited evidence

```text
4d9ae80835529ea6115e569dbb441b62f04c6577967ac417af134d74006b3c42  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v27.md
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
c3030061f1dd9fc68a3139a20fda98d38abd8070498046ab091d2c7a00d878e2  /tmp/task6-v27-artifacts/red-evidence.tap
bf3dd8bf1d3f2887587696f8708a3762a5cc06d238b29537f3c4a63b19baacbc  /tmp/task6-v27-artifacts/stage-a.tap
628c6d76118f5e453df06c6309e69d5e4f38afd8bf61656b831136b56d61c4fa  /tmp/task6-v27-artifacts/six-meta.stage-a-before.tsv
```

The inherited V27 Stage-A TAP is intentionally tainted by the defective assertion: it contains the fake sensitive message. Preserve it byte-for-byte as non-display failure evidence. Secret scanning in V28 applies only to newly generated V28 TAP.

V27 Stage A recorded `server/scheduler/writer.js` SHA `8dd300bb245587d1c3b8031088ad1a1715b0fc684b9efaee2845b05e391afac1`. Before V28 planning was frozen, the assigned GPT-5.5 implementation worker expanded the parent writer lifecycle, producing current SHA `9a1424639151fed118e766055a87871479d960cab2523f2d406157bc70e822ab`. This is an explicitly disclosed, unaccepted interim delta. V28 may establish it as the new pre-remediation baseline, but acceptance comes only from complete tests and two fresh reviews of the whole file; provenance alone is not acceptance. The other five V27 files must match `six-meta.stage-a-before.tsv` when V28 Phase0 begins, and `server/world.js` must match the V27 pre-inventory SHA `a9a56d2150e9dc38bdb5d8ca7516be3a2619204f8fdfe0543160870bd7b8b1d7`.

Do not rerun V27 Phase0 or V27 RED.

## Authorized scope

Production/test files:

- `server/world.js`
- `server/scheduler/store.js`
- `server/scheduler/writer.js`
- `server/scheduler/index.js`
- `server/scheduler/cutover.js`
- `tools/scheduler-cutover.js`
- `tools/test-scheduler.js`

Exact report:

- `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v28-report.md`

Task 7+ production work is forbidden.

## Step 1: V28 Phase0 before any new source/test edit

Root selects and exports one absolute attempt directory as `TASK6_V28_DIR`. It must match `^/tmp/task6-v28-artifacts(?:-attempt-[1-9][0-9]*)?$`, contain no symlink ancestor, and not exist; the first attempt uses `/tmp/task6-v28-artifacts`. Phase0 creates exactly that directory as mode `0700` and writes an `env.sh` exporting the same literal path. A wholly restarted V28 Phase0 uses a new versioned attempt directory; Phase-A debugging within the same approved attempt atomically replaces only its own Phase-A artifacts. No script may hardcode the first-attempt path after this selection.

Copy the V27 RED, Stage-A failure, expected helper/parent/overlay slices, `prefix.tsv`, `baseline-names.txt`, parent/overlay name lists, Stage-A-before metadata, `tap-normalize.sh`, `inventory.sh`, and `six-meta.sh` as regular mode-`0600` files under `$TASK6_V28_DIR`. Verify every available V27 sidecar before copying and copy the sidecar too. `stage-a.tap` has no sidecar because V27 stopped on failure; verify it against the pinned `bf3dd8...acbc` hash above and create a V28-local sidecar. Hash every copy. No later step depends on continued availability of `/tmp/task6-v27-artifacts`.

Generate and hash `inventory-v28.py` rather than invoking the copied V27 inventory directly. Its deterministic schema is one sorted tab-delimited row per repository-relative path: `path,type,fs_mode,size,sha_or_dash,link_target_or_dash,git_mode_or_dash`. Exact type rows are: regular file = `file,<six-digit type+permission mode>,<decimal st_size>,<sha256>,-,<git mode or ->`; directory = `dir,<mode>,-,-,-,<git mode or ->`; symlink = `symlink,<mode>,<decimal lstat size>,-,<literal readlink target>,<git mode or ->`; missing tracked path = `missing,-,-,-,-,<git mode>`; other special file = `other,<mode>,<decimal lstat size>,-,-,<git mode or ->`. It combines `git ls-files --stage -z` with an `os.walk('.', followlinks=False)`, prunes `.git`, `.agents`, and `.codex`, records directories and symlinks with `lstat`, hashes regular-file bytes, never follows links, and does not exclude `docs/superpowers/reports` or the exact report. Directory rows use `size=-`, so adding the report does not change the report-directory row. The copied V27 inventory is retained only as the audited source pattern. All Phase0/prepublish/post inventory captures invoke this one sealed V28 script.

Before establishing the baseline:

- verify the current writer has the disclosed `9a1424...2ab` SHA;
- verify the other five V27 files byte metadata-match their rows in the inherited Stage-A-before TSV;
- verify `server/world.js` has SHA `a9a56d...b1d7`;
- verify `tools/test-scheduler.js` still exactly assembles the V27 prefix plus sealed helper, parent, and overlay slices.

Safely establish the report directory before inventory capture: walk every existing ancestor with `lstat`, reject symlinks/non-directories, create only `docs/superpowers/reports` if absent, recheck it is a regular directory, and set mode `0755`. Do not create the report yet.

Record `seven-meta.pre.tsv` with path, regular-file type, mode, byte size, and SHA-256 for the seven authorized source/test files. Atomically capture `pre-inventory.tsv` with `inventory-v28.py`. Store the approved V28 SHA and all inherited hashes in `authorities.tsv`.

Bootstrap exception: creation of `$TASK6_V28_DIR`, verified V27 copies, and the first `atomic-capture.sh` write use one inline Python bootstrap whose literal source is recorded and hashed. It uses source/target `lstat`, mode-`0600` same-directory `mkstemp`, byte copy/write, file `fsync`, `os.replace`, and directory `fsync`; it rejects an existing target. After `atomic-capture.sh` exists, every artifact capture/replacement uses it.

`atomic-capture.sh` sources `env.sh`, revalidates `$TASK6_V28_DIR`, requires its target parent to be exactly that directory, rejects an existing symlink/nonregular target, and creates its mode-`0600` `mktemp` in that same directory. It runs the requested command with both stdout and stderr redirected only to the temporary file, captures the child status, `fsync`s the temporary file, calls `os.replace(temp, target)`, `fsync`s `$TASK6_V28_DIR`, and exits with the exact child status. It writes no status sidecar. Infrastructure failure exits `125`; before replacement it removes the temporary file and leaves the target unchanged, while a rare post-replacement fsync failure may leave a complete atomic target but still exits `125`. Every caller must reject `125`; targeted RED requires exact child exit `1`, and every GREEN/Phase-A capture requires exact exit `0`. Direct `>` redirection to a final artifact path is forbidden. Hash `atomic-capture.sh`; RED parsing may inspect the captured file but must not print it.

## Step 2: Exact V28 test transformations and targeted RED

Only two test changes are authorized.

### 2A. Append this exact regression after `// TASK6_V27_OVERLAY_TESTS_END`

```js
test('Task 6 v28 world constructor installs supplied scheduler and preserves legacy mode', function () {
  var sentinel = 'TASK6_V28_RED_WORLD_CONSTRUCTOR_NOT_INSTALLED';
  var clock = {nowMs: function () { return 1_700_000_000_000; }};
  var scheduler = {};
  ['assertLiveLease', 'replaceAccountAdvance', 'listDerivedJobsForAccount',
    'schedule', 'invalidateGlobalJob', 'prepareDeletedAccountJobResolution']
    .forEach(function (name) { scheduler[name] = function () {}; });
  var durable = new TheGioi({}, {clock: clock, scheduler: scheduler});
  var legacy = new TheGioi({}, {clock: clock});
  if (durable._scheduler !== scheduler || durable.scheduler !== scheduler) {
    throw new Error(sentinel);
  }
  assert.equal(legacy._scheduler, null);
  assert.equal(legacy.scheduler, null);
});
```

No other suffix text is allowed. Its exact ordered name is the 245th test. Run once before the production constructor fix:

```bash
set +e
"$TASK6_V28_DIR/atomic-capture.sh" "$TASK6_V28_DIR/v28-red-world-constructor.tap" \
node --test --test-isolation=none \
  --test-name-pattern='^Task 6 v28 world constructor installs supplied scheduler and preserves legacy mode$' \
  --test-reporter=tap tools/test-scheduler.js
status=$?
set -e
test "$status" -eq 1
grep -Fq 'TASK6_V28_RED_WORLD_CONSTRUCTOR_NOT_INSTALLED' \
  "$TASK6_V28_DIR/v28-red-world-constructor.tap"
grep -Eq '^# tests 1$' "$TASK6_V28_DIR/v28-red-world-constructor.tap"
grep -Eq '^# pass 0$' "$TASK6_V28_DIR/v28-red-world-constructor.tap"
grep -Eq '^# fail 1$' "$TASK6_V28_DIR/v28-red-world-constructor.tap"
grep -Eq '^# skipped 0$' "$TASK6_V28_DIR/v28-red-world-constructor.tap"
```

Hash the complete RED TAP and do not run it again.

### 2B. Define the sole permitted parent-slice replacement

The fenced snippets below are displayed without their source indentation. The transformation script must prefix every nonempty line in both old and new snippets with exactly eight ASCII spaces before matching/replacing. It requires exactly one byte occurrence of each prefixed old fragment, performs the replacement, then requires zero old and exactly one new occurrence. This algorithm, its unprefixed literal fragments, and the produced `expected-parent-v28.js` are hashed.

Replace the old crash setup/assertion:

```js
x.writer.setFaultHook(function (stage) {
  if (stage === 'after-game-mutation') {
    var crash = new Error('payload password=never-log');
    crash.code = 'INJECTED_CRASH';
    throw crash;
  }
});
await x.writer.start();
await assert.rejects(x.writer.drainNow(), /INJECTED_CRASH/);
```

with exactly:

```js
var injectedCrash = new Error('payload password=never-log');
injectedCrash.code = 'INJECTED_CRASH';
var injectedMessage = injectedCrash.message;
x.writer.setFaultHook(function (stage) {
  if (stage === 'after-game-mutation') throw injectedCrash;
});
await x.writer.start();
var caughtCrash = null;
try { await x.writer.drainNow(); }
catch (error) { caughtCrash = error; }
assert.equal(caughtCrash !== null, true);
assert.equal(caughtCrash === injectedCrash, true);
assert.equal(caughtCrash && caughtCrash.code === 'INJECTED_CRASH', true);
assert.equal(caughtCrash && caughtCrash.message === injectedMessage, true);
```

Replace:

```js
assert.doesNotMatch(JSON.stringify(errors), /super-secret|payload_json|password/i);
```

with exactly:

```js
assert.equal(/super-secret|payload_json|password/i.test(JSON.stringify(errors)), false);
```

This test-only repair must not wrap, clone, mutate, or replace the production Error.

## Step 3: Constructor GREEN and artifact

In `server/world.js`, normalize `options` at constructor entry, retain the clock fallback, initialize all current fields, then add exactly after field initialization:

```js
if (options.scheduler) this.datScheduler(options.scheduler);
```

Do not construct/discover a Store, install an advance service, monkey-patch prototypes, or reconcile prior legacy writes.

Rerun the exact name-pattern command from Step 2A through `atomic-capture.sh` into `v28-green-world-constructor.tap`. Require exit 0 and exact targeted counts `1 test / 1 pass / 0 fail / 0 skipped`. Hash it.

## Step 4: Mechanical test integrity

Generate these artifacts:

- `expected-helper-v28.js`: byte-identical to V27 expected helper;
- `expected-parent-v28.js`: V27 expected parent after exactly the two replacements in Step 2B, each with one old occurrence and one new occurrence;
- `expected-overlay-v28.js`: byte-identical to V27 expected overlay;
- `expected-v28-suffix.js`: exact Step 2A regression bytes;
- `names-v28.txt`: V27 ordered 244 names plus the exact V28 name.

Before every full run, extract and compare the current helper/parent/overlay blocks to those expected artifacts, require the exact V28 suffix immediately after the V27 overlay end, assert no other trailing bytes, require exactly 245 unique ordered names, and verify the original V27 prefix hash. Hash all integrity artifacts.

## Step 5: Finish Task 6 GREEN

Continue the six V27 production files from root causes while preserving the eight passing overlays:

- exact committed metric `recordJob` ABI;
- barrier-first drain, continuation queues, and one shared 50,000 primitive budget;
- direct-account continuation parking and external dependency validation;
- exact-null partial with no lifecycle/metric/fault calls;
- startup recover/renew/resume/final-fence ordering;
- raw quarantine without payload parsing;
- cache-only recursively cloned status after DB close;
- fresh-only cutover and strict CLI/error precedence.

Use targeted name-pattern runs for debugging. Do not weaken any other test or expected domain result.

## Step 6: Phase A and sealed review bundle

Capture `seven-meta.phase-a-before.tsv`. Run syntax checks for all seven files, then capture raw output without displaying it:

```bash
"$TASK6_V28_DIR/atomic-capture.sh" "$TASK6_V28_DIR/phase-a.tap" \
  node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js
"$TASK6_V28_DIR/atomic-capture.sh" "$TASK6_V28_DIR/phase-a-throw.tap" \
  node --throw-deprecation --test --test-isolation=none --test-reporter=tap \
  tools/test-scheduler.js
```

Both must exit 0 and report exactly `245/244/0/1`. Run one nonprinting scanner over all four newly generated V28 TAP files (targeted RED, targeted GREEN, normal, throw); it fails if any contains `payload password=never-log` or `password=super-secret`. Normalize only `duration_ms` lines using the copied-and-hash-verified V27 normalizer, hash raw and normalized TAP, and capture `seven-meta.phase-a-after.tsv`; require byte identity with the before file. Copy the latter atomically to `seven-meta.sealed.tsv` and hash it.

Create and hash `stage-b-producer.sh` first. It is deterministic; its only variable inputs are two reviewer artifact paths. Create `base-evidence.tsv` with exactly these keys in this order, one `key=value` row each, no duplicate keys, no whitespace, and lowercase 64-hex values except `phase_a_counts`:

```text
plan_v28_sha
plan_v27_sha
parent_task6_sha
task5_remediation_sha
v20_contract_sha
v27_red_evidence_sha
v27_failed_stage_a_sha
v27_stage_a_before_meta_sha
v28_targeted_red_sha
v28_targeted_green_sha
prefix_sha
helper_v28_sha
parent_v28_sha
overlay_v28_sha
suffix_v28_sha
names_v28_sha
phase_a_raw_tap_sha
phase_a_throw_raw_tap_sha
phase_a_normalized_tap_sha
phase_a_throw_normalized_tap_sha
seven_meta_sha
pre_inventory_sha
inventory_script_sha
atomic_capture_script_sha
stage_b_producer_sha
phase_a_counts
```

`phase_a_counts` is exactly `245/244/0/1`; all other values are exact hashes. Generate `base-report.md` with these exact bytes, where `<base-evidence-bytes>` includes its one existing final newline:

````text
# Durable Scheduler Task 6 V28 Evidence

```text
<base-evidence-bytes>```
````

There is exactly one final newline after the closing fence and no reviewer block. Construct it by byte concatenation of the literal header/fence, the validated TSV bytes, and literal closing fence; hash both files.

Create `review-bundle.tsv` as `base-evidence.tsv` followed by exactly `base_evidence_sha=<sha>` and `base_report_sha=<sha>`. Validate the same grammar and hash it. No source/test mutation is permitted after this point without repeating Step 6 and both reviews.

## Step 7: Two fresh implementation reviews

Run two independent fresh `gpt-5.6-sol`/high reviews over the same sealed bundle and all seven files:

- logic reviewer: behavior, lifecycle ordering, crash identity, budget/barrier/replay/null correctness;
- scope reviewer: exact test transformations, inventory plan, hashes, base report/producer safety, exports, cutover/CLI.

Each regular non-symlink reviewer artifact must contain exactly these newline-delimited keys with safe values and no whitespace or extra `=`:

```text
identity=
model=gpt-5.6-sol
effort=high
outcome=PASS
plan_v28_sha=
review_bundle_sha=
seven_meta_sha=
phase_a_normalized_tap_sha=
phase_a_throw_normalized_tap_sha=
base_report_sha=
stage_b_producer_sha=
```

Require exactly eleven rows in the displayed order and exactly one final newline. Keys match `^[a-z0-9_]+$`. `identity` matches `^[a-z0-9_:-]{3,80}$`; the two identities differ. `model`, `effort`, and `outcome` equal the displayed literals. Every `_sha` value is lowercase 64-hex and equals the corresponding sealed artifact. Reject any whitespace, NUL, additional `=`, duplicate/unknown/missing key, symlink, nonregular file, or mode other than `0600`/`0644`. A failed review returns findings to GPT-5.5; any edit restarts Step 6 with two fresh reviewers. These reviews are distinct from the two pre-execution V28 plan approvals.

## Step 8: Atomic report publication and final inventory

First recompute all seven source/test metadata and require byte identity with `seven-meta.sealed.tsv`; require every path to be a regular non-symlink with mode `100644`. Only then may Stage B validate reviewer artifacts and produce a report candidate.

The final candidate bytes are exactly `base-report.md`, one additional newline, literal heading `## Implementation reviews`, one blank line, opening fence `````text``, newline, then 22 rows: the eleven reviewer keys prefixed `reviewer_1.` followed by the eleven keys prefixed `reviewer_2.`, preserving artifact order, then the literal closing fence and one final newline. Require no trailing whitespace, every base field, both distinct identities, and no other reviewer block. Hash the candidate.

Before publication, capture `prepublish-inventory.tsv`. Compare it with `pre-inventory.tsv`, permitting content/size/SHA changes only to the seven authorized source/test files; all seven must remain regular non-symlinks with the exact Phase0 mode `100644` and must equal `seven-meta.sealed.tsv`. The exact report must still be absent and no other path/type/mode/content may differ. Hash this successful prepublication inventory.

Synthesize `expected-post-inventory.tsv` from `prepublish-inventory.tsv` by adding exactly the inventory-schema row for the final report candidate: exact path, type `file`, mode `100644`, exact byte size/SHA, link target `-`, and git mode `-`. Hash it.

Only after those checks, rewalk report ancestors, reject symlinks/non-directories and a symlink/nonregular existing target, then copy the already-hashed candidate to a same-filesystem temporary regular file under `docs/superpowers/reports`, set mode `0644`, `fsync` it, atomically replace only the exact report path, and `fsync` the report directory.

After publication:

1. Atomically capture and hash `post-inventory.tsv` with the same copied-and-hash-verified inventory implementation as Phase0; require it byte-identical to `expected-post-inventory.tsv`.
2. Recompute seven-file metadata and require byte identity with `seven-meta.sealed.tsv`.
3. Validate the final report is a regular non-symlink mode-`0644` file, byte-identical to the hashed final candidate, and contains the exact base/reviewer grammar above.
4. Recheck all artifact/report ancestors and target types.
5. Atomically write `completion-attestation.tsv` in the artifact directory with exactly these rows: `outcome=PASS`, `report_sha`, `prepublish_inventory_sha`, `expected_post_inventory_sha`, `post_inventory_sha`, `seven_meta_sha`, `review_bundle_sha`, `reviewer_1_artifact_sha`, and `reviewer_2_artifact_sha`. Hash it. All `_sha` values are lowercase 64-hex. This separate attestation avoids an impossible self-referential report/inventory hash while binding the published report to the final verified inventory.

Final acceptance requires targeted RED/targeted GREEN, normal and throw `245/244/0/1`, no fake sensitive values in any of the four newly generated V28 TAP files, exact test integrity, byte-identical expected/actual final inventory, unchanged sealed seven files, two fresh Sol/high `PASS` implementation reviews, and a valid hashed completion attestation.
