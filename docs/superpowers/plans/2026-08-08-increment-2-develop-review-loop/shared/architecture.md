# Architecture — Increment 2: `develop` with commit discipline and the review loop

## What this increment builds

The `develop` skill and its `vfa-develop` workflow: survey → plan → partition → implement →
verify → **adversarial review loop** → hand back to the session for merge. Two requirements
ratified after the original design shape the whole increment:

1. **Atomic commits are the unit of work.** Every `coder` produces a series of focused,
   single-concern commits (the AND test). The commit series — not an undifferentiated diff —
   is what gets verified and reviewed.
2. **Every work order passes an adversarial review loop before merge.** A fresh `reviewer`
   per round returns typed findings; the loop exits only when the count of `critical`
   findings is zero — **computed in JS, never claimed by the reviewer**. Non-convergence
   escalates; a round counter never terminates the loop (IRON LAW §1).

## Module boundaries

| Module | Responsibility | Must NOT |
|---|---|---|
| `lib/independence.mjs` | Pure partition: work orders → waves + coupled set | Touch fs in pure functions; know about agents |
| `lib/commit-series.mjs` | Pure commit-series analysis: parse log, mechanical checks | Judge intent (that is the reviewer's job) |
| `tools/rules/no-self-verdict.mjs` | Lint: ban self-reported verdict booleans in workflow schemas | Flag mechanical fact fields (`build_ok`, `suite_pass`) |
| `agents/planner.md` | Decompose into work orders with declared loci + acceptance criteria; run the independence CLI | Implement anything |
| `agents/coder.md` | Implement ONE work order as a focused commit series inside its locus; self-review; typed status | Touch files outside its locus; modify locked tests; emit WIP commits |
| `agents/verifier.md` | Discriminator, build, suite, commit-series checks; merge an approved branch when dispatched to | Judge code quality; fix anything |
| `agents/reviewer.md` | Adversarially refute a commit series; typed findings with severities | Emit an approval verdict; edit anything |
| `workflows/vfa-develop.workflow.js` | Orchestrate the pipeline and the review loop; derive every verdict in JS | Merge into the user's branch; block on a human |
| `skills/develop/SKILL.md` | Parse args, run the workflow, implement coupled orders, merge approved branches, run integration review, surface coverage | Re-implement orchestration that belongs in the workflow |

## The three governing rules

**1. Verdicts are computed, never claimed.** The reviewer returns findings — it has no
`approved` field to set (rule-enforced). The verifier returns observed facts of command
execution. The loop's exit condition, the work order's disposition, and `coverage.complete`
are all derived in JS. This extends IRON LAW §2 from search coverage to review.

**2. The commit series is the review artifact.** Focused commits are not hygiene bolted on —
they are the input format that makes adversarial review cheap and sharp. The reviewer walks
the series commit by commit, then the whole diff. Dishonest series structure (behavior change
inside a commit presented as a refactor) is itself a critical finding.

**3. The session owns integration.** The workflow implements and approves work orders on
their own branches; it never merges into the branch the user is sitting on. The `develop`
skill merges approved branches serially, implements coupled orders itself (same commit
discipline, same review loop, dispatched via the Agent tool), and runs the final
integration review. Read-only-ness and tree ownership stay hard properties.

## Carried platform constraints (unchanged from increment 1)

- Workflow scripts cannot `import` and have no fs — schema literals are copied into the
  script; `lib/*.mjs` is reached only by an agent running `node`.
- `workflow('vfa-survey', ...)` nesting works one level deep — `vfa-develop` calls it.
- Agent types are namespaced `vf-agentics:<name>` and resolve globally.
- No `Date.now()` / `Math.random()` / argless `new Date()` in scripts.
