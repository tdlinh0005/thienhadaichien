# Durable Store Task 2 remediation design

**Date:** 2026-08-24  
**Status:** User-approved direction; written-spec review pending  
**Parent design:** `2026-08-23-durable-event-scheduler-design.md`  
**Affected implementation-plan task:** Task 2 at the pre-remediation plan SHA
`cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3`

## Purpose

This amendment preserves the approved durable-scheduler architecture while
making Task 2 executable under strict TDD and closing Store-boundary defects
found during preflight. No Task-2 source was dispatched before these findings.
Task 1 remains complete and is the immutable source baseline.

The selected approach is a focused repair of Task 2 rather than bypassing the
plan or splitting the Store contract across new production modules. All Store
invariants still belong to one `SchedulerStore` boundary; the implementation
plan will be rewritten into one unambiguous test phase and one unambiguous
production body.

## Alternatives considered

1. **Repair Task 2 in place — selected.** Keep the public Store boundary and
   downstream task ordering, but fix the TDD protocol, tests, authoritative
   reloads, replay ordering, and SQL binding. This has the smallest integration
   cost and directly matches the parent design.
2. **Let the implementer infer corrections from contradictory fragments —
   rejected.** This would make source output nondeterministic and invalidate the
   frozen-plan and independent-review controls used successfully by Task 1.
3. **Split Task 2 into separate scheduling and replay/application tasks —
   rejected for now.** The split would clarify file size, but would force broad
   renumbering and downstream interface changes without improving the single
   authoritative SQLite boundary. Later modularization may refactor internals
   only after the behavior is proven.

## Scope and ownership

Task 2 may create or modify only:

- `server/scheduler/store.js`;
- `tools/test-scheduler.js`;
- the controller-authorized Task-2 implementation report.

It must not modify the migration, database bridge, scheduler contract,
package/lockfiles, artifacts, other scheduler modules, parent design, frozen
plan during source dispatch, or the Git index. `sweepDeletedAccountOrphans`
will move to Task 4 beside its owning `invalidateGlobalJob` implementation;
Task 2 must not expose a method that calls a future undefined method.

The canonical resolution-claim error is
`JOB_RESOLUTION_CLAIM_INVALID`, matching the existing tests and implementation
intent. The superseded prose name `RESOLUTION_JOB_NOT_CLAIMABLE` is removed.

## TDD and assembly protocol

All 34 Task-2 top-level tests, including the eight reconcile/token/dependency
tests that were previously embedded in the production step, must be assembled
before any Store production file exists. The remediation scenarios in this
amendment are added as sequential assertions/fixtures inside the applicable 34
cases; they must not add hidden `test()`/`t.test()` registrations that change
the TAP topology. The Task-1 test baseline remains byte-for-byte preserved and
ordered.

The Store import must be lazy. A missing Store module is resolved only inside
registered Task-2 test execution or a cleanup-safe fixture boundary. The
fixture must resolve the Store constructor before creating a temp database, or
must close and remove the database directory on every constructor/import
failure. No top-level missing-module import may abort before TAP registration.

The sole Task-2 RED runs the global positive-count block exactly once. In the
restricted sandbox its required shape is:

- 62 tests total;
- 27 Task-1 passes;
- 34 Task-2 failures caused by the missing Store module;
- one existing socket-bind skip;
- nonzero Node status, positive TAP count, and zero RED-predicate status.

Any other count or root cause stops dispatch. After the RED, production is
assembled from one canonical standalone Store body with no retained,
superseded, or replacement fragments. The sole Task-2 GREEN must be 62 tests,
61 pass, zero fail, one socket skip. It is followed immediately by `npm test`,
then the controller-defined direct/deprecation, syntax, lint, scope, snapshot,
index, line-width, whitespace, and temp-delta gates. Known Foundation sandbox
blockers are recorded, never relabeled as passes.

## Canonical serialization and schedule identity

`canonicalJson` recursively sorts object keys and preserves array order before
`JSON.stringify`. `sha256` hashes the exact UTF-8 canonical string. Tests must
use hand-derived nested-object/array strings and at least one literal known
SHA-256 vector; production serialization or hashing must not calculate its own
expected values.

Schema-v0 payload acceptance must prove that the stored `payload_json` and
`payload_sha256` are canonical schema v1, not merely that input validation did
not throw. Same-idempotency-key tests must independently vary payload,
scheduled time, maximum attempts, and the existing aggregate/source/revision
identity fields so a weakened `sameScheduledJob` cannot pass.

Every public job lookup that promises a job ID validates the exact lowercase
UUID-v4 form generated for scheduler rows before querying. Uppercase aliases,
wrong UUID versions/variants, whitespace, and non-strings throw
`SCHEDULER_JOB_ID_INVALID`; they are not treated as normal cache misses.

## Lease and claim authority

Every state-changing Store method proves the live owner/generation/expiry at
entry and retains its conditional SQL fence. In particular, `claimNext` calls
`assertLiveLease(token, nowMs)` before its atomic claim. A stale token must
throw `LEASE_LOST` both when eligible work exists and when the queue is empty;
lease loss must never be indistinguishable from “no work.”

Claim ordering remains the approved single-statement order:
`eligible_at_ms`, `priority`, `sequence`, then `id`. Strict expiry uses
`expires_at_ms < nowMs`; equality still belongs to the current holder. Retry,
recovery, and watermark behavior remain unchanged except where authoritative
validation below rejects stale caller objects.

## Authoritative executable and application boundary

`loadExecutableJob` is the sole execution reload. It re-reads the persisted
row and requires all of the following at `nowMs`:

- state is `RUNNING`;
- `locked_by` equals the lease owner;
- `locked_generation` equals the lease generation;
- `locked_until_ms > nowMs`;
- the writer lease itself remains live;
- payload bytes, canonical form, hash, schema, values, and stable identity are
  valid.

`insertApplication` never trusts a previously claimed JavaScript object. It
calls the authoritative executable reload immediately before validation and
insertion, then uses only the reloaded row for job ID, idempotency key, replay
linkage, effective-time checks, and immutable result validation. A claimed
object that has since moved to `RETRY_WAIT`, `QUARANTINED`, a terminal state,
or another lock cannot create an application. The regression sequence is:
claim, commit transient failure, reuse the old object in a new immediate UoW;
the result must be `PAYLOAD_INTEGRITY` and zero application rows.

Task 5's richer PvP application validator must retain this authoritative
reload rule when it replaces the Task-2 method.

## Replay logical ordering

A replay child executes the quarantined root's logical barrier position, not
the child's later physical sequence. The Store owns this fact. Every loaded or
listed global barrier row receives a uniform self/root decoration. For a
non-replay global row, `root` is the row itself. For a replay, `root` is the
validated row named by `replay_of_job_id`. The exact fields are:

- `logical_root_id = root.id`;
- `logical_key = root.idempotency_key`;
- `logical_scheduled_at_s = Number(root.scheduled_at_s)`;
- `logical_priority = Number(root.priority)`;
- `logical_sequence = Number(root.sequence)`;
- `logical_order_id = root.id`.

Caller-supplied logical fields are ignored. The root must be the exact
`replay_of_job_id`, have valid lineage, and have one active replacement. The
same authoritative decorator is used by barrier listing and executable load,
so Writer and Store cannot compare different tuples for the same logical job.

The regression creates quarantined root A, its later-sequence replay child A,
and a later same-time root B. Barrier listing selects child A at root A's
tuple; claim plus executable load preserves that tuple. Attempting to park
child A behind its own ID must throw `BARRIER_PRECEDING_ORDER_INVALID` without
changing its persisted state. This prevents self-predecessor replay loops.

## Terminal resolution semantics

One authoritative terminal-result classifier consumes the already validated
persisted application and executable job. It yields exactly one of:

- success for `ACCOUNT_ADVANCED` on `ACCOUNT_ADVANCE`;
- success for `PVP_RESOLVED` on `PVP_RESOLVE`;
- success for `EXTERNAL_RESOLVED` on `EXTERNAL_RESOLVE`;
- success for `REPLAYED` only on a validated replay child;
- success for an approved `RECOVERED_LATEST_STATE` cutover result;
- cancellation with its exact code for the four reasons below.

Successful effects use `completeApplied`. It authoritatively reloads the
executable and application, invokes the shared classifier, and permits only a
success-class result. A cancellation-class application passed to
`completeApplied` throws `JOB_COMPLETION_RESULT_INVALID` before mutation.
Missing/corrupt application evidence retains `APPLICATION_REQUIRED` or
`PAYLOAD_INTEGRITY`. A zero-row completion update rechecks the lease: lease loss
throws `LEASE_LOST`; otherwise it throws `JOB_COMPLETION_CONFLICT`.

`finishResolved` is the explicit application-backed cancellation path and
accepts only state `CANCELLED` with one of:

- `STALE_REVISION`;
- `MATCH_INVALIDATED`;
- `ENTITY_REMOVED`;
- `OPERATOR_CONFIRMED_INVALID`.

The immutable stored application must be loaded and validated, and its exact
classifier result must be cancellation with a `code` equal to the cancellation
reason. Free text, a successful result paired with cancellation, or two
individually allowed but mismatched codes all fail before mutation.
`RESOLVED_BY_REPLAY` remains private to `terminalizeReplaySource`; callers
cannot pass it to `finishResolved`.

`finishResolved` applies this exact validation and error precedence:

1. a state other than `CANCELLED` throws `JOB_TERMINAL_STATE_INVALID`;
2. a reason outside the four-value allowlist throws
   `JOB_TERMINAL_REASON_INVALID`;
3. a non-live owner/generation/expiry throws `LEASE_LOST`;
4. a row that is no longer the caller's live persisted executable throws
   `PAYLOAD_INTEGRITY` through `loadExecutableJob`;
5. no application row throws `APPLICATION_REQUIRED`;
6. malformed/corrupt application identity, JSON, hash, or result shape throws
   `PAYLOAD_INTEGRITY`;
7. a valid application classified as success, or whose cancellation code
   differs from `reason`, throws
   `JOB_TERMINAL_RESULT_MISMATCH`;
8. if the final conditional update changes zero rows, Store rechecks the lease:
   lease loss throws `LEASE_LOST`, otherwise it throws
   `JOB_TERMINAL_CONFLICT`.

Preimplementation tests cover both directions. `completeApplied` must reject
an account `STALE_REVISION` application and a global `MATCH_INVALIDATED`
application without changing job state. `finishResolved` must reject a success
application and every mismatched allowed reason. The old replay-watermark test
that inserted `MATCH_INVALIDATED` must terminalize the replay child through
`finishResolved(..., 'CANCELLED', 'MATCH_INVALIDATED', ...)`, not through
`completeApplied`.

## Account adoption and deferred orphan cleanup

`adoptAccountAdvanceForCommand` validates `accountId` as a positive safe
integer and binds `String(accountId)` directly to `aggregate_id=@accountId`.
It must not rely on SQLite casting a JavaScript number to text, because
`node:sqlite` may bind the number as REAL and produce `"1.0"` instead of the
canonical stored `"1"`.

The adoption regression inserts a canonical account wake with aggregate ID
`"1"`, then proves numeric API input `1` adopts that row. Invalid, fractional,
zero, negative, and unsafe IDs fail before SQL mutation.

Orphan sweeping is omitted from Task 2. Task 4 will add it only after
`invalidateGlobalJob` exists and will test deleted local and global aggregates
together. No placeholder or unresolved Store method call is permitted.

## Error handling and privacy

Boundary errors remain stable and non-sensitive:

- stale ownership: `LEASE_LOST`;
- invalid persisted/caller execution proof: `PAYLOAD_INTEGRITY`;
- nonclaimable explicit resolution: `JOB_RESOLUTION_CLAIM_INVALID`;
- malformed/noncanonical job UUID lookup: `SCHEDULER_JOB_ID_INVALID`;
- invalid adoption account: `ACCOUNT_ADVANCE_ADOPTION_INVALID`;
- invalid terminal state: `JOB_TERMINAL_STATE_INVALID`;
- invalid terminal reason: `JOB_TERMINAL_REASON_INVALID`;
- missing application: `APPLICATION_REQUIRED`;
- cancellation result passed to successful completion:
  `JOB_COMPLETION_RESULT_INVALID`;
- final completion conflict under a still-live lease:
  `JOB_COMPLETION_CONFLICT`;
- valid but mismatched application result: `JOB_TERMINAL_RESULT_MISMATCH`;
- final conditional-update conflict under a still-live lease:
  `JOB_TERMINAL_CONFLICT`.

Existing safe error scrubbing, payload bounds, no-PII status surfaces, retry
classification, and exact application conflict target remain binding.

## Verification and acceptance

The rewritten implementation plan is dispatchable only after independent
logic and runtime reviews approve the same exact SHA and confirm:

1. all 34 Task-2 tests precede RED and the full 62-test RED/GREEN topology is
   mechanically possible;
2. the standalone Store extraction is unique, parses, has fixed line/byte/hash
   identity, and contains no undefined Store call;
3. replay root decoration is identical at barrier-list and executable-load
   boundaries;
4. stale application objects, stale/empty claims, cancellation mismatches,
   canonicalization mutations, v0 non-normalization, UUID misuse, schedule
   identity changes, terminal success/cancellation parity, and numeric adoption
   casting each have a preimplementation RED;
5. Task-1 source hashes and every protected package/artifact/source path remain
   unchanged;
6. Step 5 records only commit intent while the Git index is read-only.

Task 2 is complete only after its strict RED/GREEN evidence, immediate
aggregate gate, direct gates, report, controller verification, and two final
independent code/scope approvals. No Task 3 source begins earlier.
