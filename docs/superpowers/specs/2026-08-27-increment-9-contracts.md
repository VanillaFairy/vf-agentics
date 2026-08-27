# Increment 9 contracts — the deterministic ledger

Companion to increments 3 through 8, which stand except where §5 below supersedes them.

Increments 6, 7 and 8 made a run's durability progressively better recorded: per-order state
lines, agent-written journal lines, one counter across both files. What none of them touched is
**how those records reach the workflow script that reasons about them.** A workflow script has
no filesystem, so every byte crossed an agent — the courier's structured output on the way in,
the recorder's Bash command on the way out — and a model's output is where corruption lives.

Three field failures, one cause:

- **2026-08-19.** A loader asked to re-emit a 118KB plan byte-exact paraphrased 13 of 14 orders.
  The digest manifest caught it; the resume still did not work.
- **2026-08-20.** A recorder handed an exact `JSON.stringify` line to append un-escaped the
  Windows paths while typing the command. Five of ten state lines landed as invalid JSON, and
  which ones broke depended on which form of the path that dispatch received.
- **2026-08-26/27, three times.** A courier damaged the escaping in `partition_raw` — the one
  field with no digest behind it. It parsed as "no waves", which degraded the run to "every
  order is coupled" and offered four already-built, reviewed and merged orders back to the
  session to be reimplemented. One retry cost ~418k tokens and produced nothing.

Every fix so far narrowed the crack without closing it, because the architecture still routed
bytes through models.

**The asymmetry that closes it:** reading is safe. A tool result enters an agent's context
byte-exact. Only model *emission* corrupts.

> **Bytes never ride a model. References and digests do.**

---

## 1. `lib/ledger.mjs` — the only writer

Every append to `state.jsonl` and `journal.jsonl` goes through:

    node <plugin-root>/lib/ledger.mjs append <run-dir> --file state|journal [--digest <hex>]

with the line on stdin, via heredoc. The writer:

1. parses the line, and **refuses** anything that is not JSON;
2. requires a non-empty string `kind` and an integer `seq` — the two fields every reader
   indexes on. `seq` is never defaulted: a supplied one would be the writer inventing the run's
   history rather than recording it;
3. when `--digest` is given, recomputes `fnv1a(canonical(entry))` and **refuses a mismatch**;
4. re-serializes with `JSON.stringify` and appends, with a trailing newline.

**Validation is deliberately thin.** A writer that validated every record kind fully would
reject a line written by a newer workflow against an older installed lib — a lost record, which
is the damage this file exists to prevent, arriving from the other side. Unknown fields are
carried.

**Digest coverage differs by author, and must.** A `state.jsonl` line is minted by the workflow,
so every byte is known before it is handed over and it travels under a digest. A
`journal.jsonl` line carries values an agent has not observed yet, so no digest can exist for
it — the parse, the field check and the canonical re-serialization still apply. The guarantee is
therefore: **nothing unreadable can land in either file, and nothing altered can land in the
state log.**

Paths are normalized to forward slashes **at the mint**, in the workflow's line builders, and
nowhere else. Normalizing after the digest is computed would produce a line that digests
differently at the writer.

`ledger.mjs order <run-dir> <id>` and `ledger.mjs notes <run-dir>` are the read half; see §3.

## 2. `lib/run-verdict.mjs` — the resume, computed

    node <plugin-root>/lib/run-verdict.mjs <repo-root> <run-dir>

prints `{"payload": {...}, "payload_digest": "<fnv1a hex>"}` on one line. The payload is the
**whole** resume decision, computed from `plan.json`, `state.jsonl`, `journal.jsonl` and git.

The workflow dispatches ONE courier whose entire job is to run that command and paste stdout
into a single string field, then **recomputes the digest itself** over the parsed payload. A
mismatch buys one retry one tier up; a second failure halts. A payload carrying an `error` key
is a *refusal* — an answer about the run, not about the trip — and is never retried.

Consequently **`partition_raw` is no longer transported at all.** It is parsed on disk by
`partitionOf`, and the resulting wave layout travels inside the digest-covered payload. The
three failure labels it can carry — did not parse / refused / no waves array — are preserved,
because a plan the partition *refused* is a planning defect and reporting it as a parse failure
sends the reader after the wrong bug (IRON LAW §7).

### 2a. Two regimes

**CLEAN.** An empty ledger *and* no branches matching `vfa/<runstamp>-*` means there is nothing
to salvage **by definition**. The verdict reports `clean: true`, every order is `code`, and no
further git command runs. Order branches are named deterministically, so one `git branch --list`
bounds everything a dead invocation could have left; a brand-new runstamp does not ask git at
all. This is what makes opening a parked plan as cheap as planning it.

**DIRTY.** Per order, the lifecycle `code → verify → review → merge` is walked backwards and the
verdict stops at the first rung **two independent sources agree on**: the run recorded that the
stage closed, and git still holds the head it closed over. Disagreement is not a fault — it
means the branch moved after the stage closed — so everything past the last agreed stage is
redone.

### 2b. `next_action`, exhaustively

| value | when | what the run does |
|---|---|---|
| `none` | merged per the log, or an ancestor of the integration branch **with a second witness** | nothing |
| `merge` | approval record, and git's head equals the head it closed over | merged as it stands: no coder, no verifier, no second review |
| `review` | green measurement at exactly git's head | straight to review; the measurement is not re-bought |
| `verify` | commits with no usable record, or a recorded `coder-done` | measured, then reviewed, as if fresh |
| `continue-series` | commits, no `coder-done` for this order, **and** the run has one elsewhere | a coder carries the series on from its last commit |
| `code` | no branch, or a branch with no commits | implemented from scratch |

**Ancestry alone never lands an order.** A coder cuts its branch *at* the integration head, so a
branch whose coder died before its first commit is an ancestor of the integration branch too,
and reports identically to a genuinely merged one. A second witness is required: the approval
line, or the merging agent's own `merge-observed`. The two fail independently, which is the
point of having both.

**`continue-series` requires positive evidence of the dialect.** Absence of `coder-done` means
"the coder never finished" only if this run's coders were writing that line at all — every run
planned before increment 9 has commits and no `coder-done` anywhere. So the rung fires only when
some *other* order in the same run recorded one; otherwise the older, safe reading applies and
the series is measured as it stands.

**Escalations are reported, never acted on.** The payload carries `escalated`, `escalated_wave`
and `escalated_seq` alongside the action the order would otherwise take. Whether an escalation
is retried is the caller's policy (`retry_escalated`), and the underlying stage must survive so
that a retry resumes rather than rebuilds.

### 2c. What the payload does NOT carry

`context`, `acceptance`, the plan's own `notes`, `shared_files`, and `caller_notes`. The first
two are fetched by their consumer (§3); the middle two were never read on the resume path at
all; `caller_notes` is described by `caller_notes_len` and `caller_notes_digest` and fetched.

This is a hard rule rather than an optimization: **transcription fidelity falls off with payload
length**, which is the lesson of all three incidents above. A field that travels must earn it.
The payload for a nine-order run measures ~13KB against the 118KB the old loader carried.

### 2d. Derivation is duplicated, deliberately

`verifyOk` and the journal parser exist in both `lib/run-verdict.mjs` and the workflow script,
which cannot import. A resume must re-derive a measurement's verdict with the *same* function
that derived it the first time, or an order green in one invocation is red in the next for no
visible reason. The copies are pinned by `test/run-verdict.test.mjs`, exactly as the plan digest
is pinned across its two homes.

**No verdict is ever stored.** Agents record what they observed; pass and fail are computed. That
is what lets an agent write its own durability record without certifying its own work.

## 3. Reference dispatch

An agent that needs a work order's prose fetches it:

    node <plugin-root>/lib/ledger.mjs order <run-dir> <id>

and **confirms the printed digest** against the one its dispatch quotes. A mismatch means
`plan.json` is not the plan this run was ratified with: the agent stops and implements nothing.

This applies on a **resume**. On a **fresh run** the orders arrive in the planner's own return —
authored there, not copied from anywhere — so quoting them carries no transcription risk, and a
digest computed over them would be a claim about a file the script never read. The rule is
therefore: *quote what this script authored, fetch what it did not.*

`caller_notes` follows the same rule, via `ledger.mjs notes`.

## 4. New record kinds

Additive. Every kind from increments 6 and 7 parses exactly as before.

| kind | file | writer | why it exists |
|---|---|---|---|
| `order-escalated` | state | workflow | An escalation that reaches only the wave line is lost when the invocation dies mid-wave — so a resume re-dispatches an order that already defeated a coder, a verifier or a review loop, at full price. Carries `reason`. |
| `coder-done` | journal | the coder | Git shows commits on a branch whether the coder finished or died mid-series. Only the author knows which, and the difference decides `verify` versus `continue-series`. |
| `review-observed` | journal | the reviewer | One line per round: rounds already spent become visible instead of restarting from zero. |
| `discovery` | journal | whoever learned it | Wave lines re-listed every discovery cumulatively; in one field run that was most of `state.jsonl` by volume. Journalled once by its discoverer, unioned by the verdict. |

## 5. What increment 9 supersedes

- **Increment 6 §2's transport**, not its line shape. The shape stands; `cat >> state.jsonl` as
  the write mechanism does not.
- **Increment 7 §4's transport**, likewise: journal lines still say what an agent observed, and
  still go through the writer.
- **The resume fan** (increment 6): `RESUME_INDEX`, `ORDER_SLICE`, the per-order courier and its
  retry ladder are withdrawn. The fan bounded each *order* by its own size and left the index —
  including `partition_raw` — riding a model unchecked. One digest-covered payload replaces it.
- **The scavenge agent** is withdrawn as *reconnaissance*. Every question it answered is computed
  in `gitFacts`. What remains is a narrow worktree-creation dispatch that fires only when a
  salvaged order has commits and no tree — an action, not a question.
- **The in-script replay** of `state.jsonl` and `journal.jsonl` moves to `replay()` in the lib.

Increment 8 §1's counter is unchanged and is now seeded from `seq_max` in the payload.

## 6. Rules that carry forward

Any change to the plan envelope's field list still cites increment 5 §1. Any change to a
`state.jsonl` line still cites increment 6 §2. Any change to a `journal.jsonl` line still cites
increment 7 §4. Any change to `seq` still cites increment 8 §3. **Any change to the verdict
payload's field list cites §2c above**, and must answer the question that section exists to ask:
does this field have to travel, or can its consumer read it?
