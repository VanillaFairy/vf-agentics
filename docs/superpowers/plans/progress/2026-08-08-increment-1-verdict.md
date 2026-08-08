# Increment 1 — Verdict (T18)

**Branch:** `increment-1-core-and-investigate` · 50 commits off `master` @ `ea8d207`
**Executed with:** subagent-driven-development — parallel waves, worktree isolation, two-stage
review, adversarial-TDD triads with a supervisor-run separation gate.

---

## 1. Static — Part A: ALL PASS

| Check | Result |
|---|---|
| A1 full suite | **129 tests, 129 pass, 0 fail, 0 skipped, 0 todo** |
| A2 lint | `OK: no findings`, `exit=0` |
| A3 placeholders | none in `agents/ workflows/ skills/ tools/ CLAUDE.md .claude-plugin/` |
| A4 rule↔test pairing | 7 rules, 7 test files, no gaps |
| A5 marketplace | `vf-agentics@0.1.0`, `"source": "./vf-agentics"`; the three siblings intact at their original versions |
| A6 separation | **held for every triad** — see below |

### A6 detail

| Triad | Tests commit | Implementation commit | Verdict |
|---|---|---|---|
| coverage-block | `acc93bd` | `0f763c9` (+ fix `66160f4`) | separate ✅ |
| workflow-meta | `895514f` | `c6d170a` | separate ✅ |
| coverage-block gaps (audit-spawned) | `0e644e1` | `66160f4` | separate ✅ |

`check-separation.sh` was run by the supervisor — never the implementer — before each GREEN
merge. All three returned **separation verified**: locked tests present at RED, RED an ancestor
of GREEN, and **GREEN changed zero locked test files**. Distinct authorship was confirmed
out-of-band by subagent id, since all commits share one git identity.

---

## 2. Live — Parts B, C, D, E: **NOT OBSERVED**

Not run, and therefore **not passed**. T18 states the standard itself: *"An unobserved check is
not a passed check — that is the law applied to this task."* Recording them as anything other
than unobserved would be precisely the laundering the IRON LAW forbids.

They require installing the plugin and starting a **fresh session** — neither is possible from
inside the session that built it. Specifically outstanding:

- **B1–B3** install; all four agents resolve as `vf-agentics:*`; the skill is discoverable
- **C2** the nested `▸ vfa-survey` group appears under the parent run. *This is the single most
  important unobserved check* — nesting is the mechanism increments 2–4 all assume works
- **C3** `scout` runs on Sonnet, `analyst` on Opus (the cost model of the whole design)
- **C4/C5** returned shape carries all six coverage keys; the skill leads with the gap
- **D1** an unsatisfiable topic is reported, not hidden
- **D2** a side-channel failure does not discard paid work
- **D3** the resume loop actually fires (`scout:<topic>#2`)
- **E1/E2** parity against the sibling `investigate` plugin

**To run them:** install `vf-agentics` from the `vanillafairy` marketplace, restart, then
`/investigate report how does the lint orchestrator load and apply rules` and watch `/workflows`.

---

## 3. Defects found and fixed during execution

None of these were in the plan's task list; all were found by executing it.

| # | Defect | Found by |
|---|---|---|
| 1 | `node --test test/` fails `MODULE_NOT_FOUND` on Node 26.5.1 — and had been copied verbatim into the plugin's own `CLAUDE.md` | all three wave-1 agents independently |
| 2 | `loadRules` accepted any rule shape; a typo'd export threw an unattributed `TypeError` on the first file scanned, killing every other rule's run | T03 code-quality review |
| 3 | **Agent frontmatter unparseable on any Windows checkout.** Two CRLF faults: exact `indexOf('---')` never matched `"---\r"`, and `(.*)$` could not match a line ending in `\r` because JS treats it as a line terminator | integration — invisible to all four authoring agents, whose Write tool emits LF |
| 4 | **`coverage-block` silently accepted a workflow with no coverage block.** The returned-object span was measured on blanked source but sliced from the original, so a `coverage:` inside a prompt string satisfied the rule | adversarial audit T06c |
| 5 | ES shorthand `{ …, coverage }` rejected — tripped `vfa-survey`, the first real workflow written against the rule | T15 |
| 6 | **A truncated task list returned `coverage.complete: true`.** Cap-dropped tasks went to `tasks.gaps`, which nothing read | final whole-implementation review |
| 7 | The analyze stage was the only unguarded `agent()` call, inside `pipeline()` — breaking survey's documented "never throws" | final review |

Defects 3, 4 and 6 are each an instance of the exact failure the plugin exists to prevent,
found in the machinery built to prevent it.

---

## 4. Carried forward to increment 2

1. **`workflow-meta` is blind to `phase: 'X'` option keys.** `vfa-survey` expresses 4 of its 5
   phases that way (needed for per-topic and concurrent attribution). Confirmed: a typo'd
   `phase: 'Analyse'` yields **zero findings**. The rule validates 1 of 5 phases in the only
   real workflow. Needs its own RED/GREEN triad.
2. **`no-turn-caps` never runs on `agents/*.md`** — `applies` covers `.workflow.js` and
   `SKILL.md` only. Agent prompt bodies are entirely unlinted, and they are the likeliest place
   to write a turn cap. `CLAUDE.md`'s enforcement table claims §1 is covered; against that
   surface it is not.
3. **Side channels have no machine-checked completeness.** `history` and `doc-researcher` report
   it as prose; only `scout` has `stop_reason`. A truncated-but-returned channel leaves
   `complete: true`. Now stated in `interfaces.md` §5.
4. **Two tests read outside the repo** (`../../.claude-plugin/marketplace.json`), so the suite is
   not hermetic — a clone elsewhere fails two tests. The manifest/marketplace **version equality**
   is also unchecked; both only match a semver regex.
5. **`SKIP_DIRS` matches basename at any depth** — a future skill named `test`, or one bundling
   its own `docs/`, is silently unlinted forever.
6. **`SKILL.md` has no frontmatter rule.** The one declarative artifact class with no lint.
7. `coverage.resumable` cannot resume: `runId` is null *and* `remaining` carries topic keys
   without the planner's `find` instruction.
8. `blankStringsAndComments` is duplicated byte-identically in two rules by design; nothing
   pins them equal.

---

## 5. Verdict

**Increment 1 is complete and statically verified. It is not live-verified.**

Every task in the plan landed, both adversarial triads held their separation, and the branch is
green on 129 tests and a clean lint. Seven real defects were caught and fixed along the way,
four of them by machinery the plan itself set up — the audits, the reviews, and the role
separation each earned their cost by finding something a single agent would have shipped.

The live half of T18 is genuinely outstanding and should gate any claim that increment 1 works,
as opposed to that it builds and lints.
