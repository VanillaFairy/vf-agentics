# Increment 26 contracts — what a dispatch costs

Companion to increments 3 through 25, which stand. Nothing here changes a verdict predicate, a
schema, a `state.jsonl` or `journal.jsonl` line, `seq`, or any agent's `tools:` line. It adds two
verbatim blocks and removes two lines they supersede. Every clause is prose an agent reads, so
every effect below is advisory and is measured rather than assumed.

The measurements behind it were taken on 2026-09-16 from agent transcripts, the same way
increment 25's were: `message.usage` summed per agent, never the workflow's own
`subagent_tokens`, which increment 25 §4b found low by a factor of 28.

---

## 1. The two blocks

**`dispatch-economy`** — what a dispatcher owes. Two copies:

- `skills/develop/SKILL.md`, beside the direct-session path. That is the one place a session
  running this plugin dispatches an agent itself — a fresh reviewer over a hand-written diff.
  Every other dispatch in the plugin is made by workflow code.
- `CLAUDE.md`, for whoever writes a workflow, since a workflow's topology is decided by its
  author and not by a model at run time.

**`dispatched-economy`** — what a dispatched agent owes. Eight copies, each a closing
`## What a turn costs` section in `agents/{analyst,coder,doc-researcher,historian,planner,reviewer,scout,test-author}.md`.

Both ids join `REQUIRED_IDS` in `test/verbatim-blocks.test.mjs`. A copy that drifts from its
siblings, or an id that disappears, fails the suite.

### 1a. Superseded lines

- `agents/analyst.md` Method step 2, "Read line ranges, not whole files." Removed; the block's
  second clause carries it.
- `agents/scout.md` Method step 2, "Read line ranges, not whole files. Use the `offset` and
  `limit` parameters." Removed, the steps renumbered, and the Output section's "point 3 above"
  now reads "point 2 above".

One home per rule. The analyst line was present during the 2026-09-04 probe, and seven files
were still read whole by 12 to 16 of its 16 analysts — a rule stated twice in one file is not
stated harder.

## 2. Why the constitution and not the prompt body

Parallel agents share the system prompt and nothing else. In the measured 2026-09-04 probe,
fifteen of sixteen analysts opened by reading the same 5,059 cached tokens — harness plus
constitution — and each wrote its own ~3.2k prompt body fresh, although every body was
identical up to the axis line. A workflow's prompt is one content block and the cache matches at
block boundaries, so a body that differs anywhere in its tail misses whole.

A rule in the constitution is therefore paid once per agent type; the same rule appended to each
workflow prompt is paid once per dispatch, at cache-write price. It would also need a JS copy in
five workflow scripts that cannot import, and a test pinning those copies to the markdown — for
nothing the constitution does not already reach.

## 3. Who carries none of it

`ground`, `kb`, `run-state` and `verifier` run one command and paste its stdout under a digest.
"Locate a passage with Grep" has nothing to locate in that job, and "the shape you were asked
for" is already the digest-covered payload. Adding the block would put an irrelevant rule in
front of the four agents whose whole value is doing exactly one thing.

## 4. What it was measured to buy

An A/B on 2026-09-16: one orchestrator given `dispatch-economy` and one given nothing, each asked
to verify four claims about vf-agentics that all rest on the same two files — `CLAUDE.md` and
`workflows/vfa-develop.workflow.js` — with no citations supplied and no tools of its own, so every
locating decision had to live in the agents it designed. Both plans were then run for real.

| | agents | billed |
|---|---|---|
| without the block | 1 mapper + 4 verifiers | 606,598 |
| with the block | 4 verifiers | 443,256 |

The whole difference is the mapper: 118,155 tokens for an agent whose findings every downstream
verifier was told to re-confirm for itself. The four matched verifiers cost 488,443 against
443,256, which is inside the 96k–150k spread of a single claim between runs.

**Neither arm built shared ground.** All eight verifiers, including the four working under the
instruction to resolve shared evidence once and hand out excerpts, kept Read, Grep and Glob and
located the same evidence independently. The block buys agent-count discipline. It does not buy
the mechanism behind increment 25's 68× — and that is why shared ground in this plugin is code
(`lib/citations.mjs`, `common_ground`), and why this increment adds none.

A first run of the same A/B, on four claims about four unrelated subsystems, produced identical
plans in both arms. That is the block working as written — there was no overlap to share, and it
did not invent any.

`dispatched-economy` has not been measured. Its expected effect is fewer whole-file reads by
probe analysts now that increment 25 hands them excerpts. The next probe's transcripts settle it:
count `Read` calls per file per analyst, and compare against the 2026-09-04 run.

## 5. What is deliberately not built, and what is open

- **No copy in workflow prompt strings.** §2.
- **No instruction-built shared ground.** §4.
- **No hook, and no lint rule on dispatch shape.** Prevention stays post-hoc (ruled 2026-08-30),
  and a dispatch's shape is a workflow author's design decision rather than a pattern a regex
  can find.
- **Open: the design skill re-probes whole.** Its step 3 gate re-runs the full probe after the
  user resolves a round's ambiguities, which the block's last clause forbids a dispatcher. A
  narrowed re-probe needs a probe input naming the axes and sections to re-attack, and none
  exists yet. Until it does, the design skill and this block disagree, and the block does not win
  by being newer — the gate reading governs, as the 2026-09-03 adversary ruling records.
