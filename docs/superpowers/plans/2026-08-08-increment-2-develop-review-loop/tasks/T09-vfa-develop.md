# Task T09: Workflow — `vfa-develop`

## References
- Read: `../shared/interfaces.md` — §1, §4, §5, §6, §7, §8 (ALL authoritative for this task)
- Read: `../shared/conventions.md` — workflow script constraints
- Read: `workflows/vfa-survey.workflow.js` (increment 1) — house style, nested-call pattern
- Read: `../knowledge/iron-law.md`

## Dependencies
- Depends on: T02, T03b, T04b, T05, T06, T07, T08 (and increment 1's `vfa-survey`)
- Depended on by: T10, T11

## What this is

The pipeline: survey → plan → partition → wave 1 in parallel (coder → verifier → **review
loop**) → typed result. Every verdict is derived in JS. The workflow never merges and never
blocks on a human. This file is the single place the review-loop contract (interfaces §7)
becomes executable control flow.

## Scope
**Files:**
- Create: `workflows/vfa-develop.workflow.js`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Copy schema literals (WORK_ORDERS, CODER_RESULT, VERIFY, FINDINGS) verbatim from
  interfaces §1/§4/§5/§6 — scripts cannot import.
- **Substitute `<plugin-root>` when building prompts.** `plannerPrompt` and `verifierPrompt`
  each name a CLI under this plugin's `lib/`, but both agents run with their cwd in the
  TARGET repo (`args.roots`), so a bare relative path resolves to the wrong place. Pass the
  plugin's absolute root into those prompts (see interfaces, "`<plugin-root>`"). No prompt
  may reach an agent still containing the literal placeholder.
- Every `agent()` call: fully-qualified `agentType` (`vf-agentics:planner` etc.), explicit
  `phase`, explicit `effort`.
- Intelligence dial exactly as the design §6 prescribes:
  `const judge = args.intelligence === 'max' ? { model: 'fable' } : {}` spread into
  planner/reviewer calls; coder additionally gets `{ model: 'fable' }` only on `max`.
- Wrap the whole body so that ANY unexpected throw still returns the documented shape with
  the failure inside `coverage` (interfaces §8 error contract).

## Negative Constraints (DO NOT)
- Do NOT write a round cap, a `for (round < N)`, or any counter-based loop exit — the
  `no-turn-caps` rule lints this file, and IRON LAW §1 governs it.
- Do NOT put any verdict boolean in a schema — `no-self-verdict` lints this file.
- Do NOT call `parallel()` where `pipeline()` serves — orders are independent; each flows
  coder→verify→loop without cross-order barriers.
- Do NOT let the workflow merge, touch the session tree, or clean up worktrees.

## Implementation Steps

- [ ] **Step 1: Write the meta and skeleton**

```js
export const meta = {
  name: 'vfa-develop',
  description: 'Implement a change as work orders: survey, plan, partition, then per-order coder -> verifier -> adversarial review loop. Wave 1 only; never merges.',
  phases: [
    { title: 'Survey', detail: 'nested vfa-survey, scoped to the change' },
    { title: 'Plan', detail: 'planner: work orders + declared loci + partition' },
    { title: 'Implement', detail: 'coder per order, worktree-isolated, focused commits' },
    { title: 'Verify', detail: 'discriminator + build + suite + series checks' },
    { title: 'Review', detail: 'fresh adversarial reviewer per round until zero criticals' },
  ],
}
```

- [ ] **Step 2: Survey and plan (skipped when `args.preplanned` is set)**

```js
const intelligence = args.intelligence === 'max' ? 'max' : 'normal'
const judge = intelligence === 'max' ? { model: 'fable' } : {}
const coderTier = intelligence === 'max' ? { model: 'fable' } : {}

let planned, survey = null
if (args.preplanned) {
  planned = args.preplanned
} else {
  phase('Survey')
  survey = await workflow('vfa-survey', {
    question: `What must change, and where, to implement: ${args.change}`,
    roots: args.roots || '.', notes: args.notes || '', intelligence,
  })
  phase('Plan')
  planned = await agent(plannerPrompt(args, survey), {
    agentType: 'vf-agentics:planner', effort: 'high',
    schema: WORK_ORDERS, phase: 'Plan', ...judge,
  })
}
const partition = JSON.parse(planned.partition_raw)   // planner pasted it raw; a paraphrase dies here, loudly
const wave1 = (partition.waves[0] || [])
const deferred = partition.waves.slice(1).flat()
const coupled = partition.coupled
```

- [ ] **Step 3: The per-order chain — `pipeline(wave1, implement, verifyAndReview)`**

Per order: dispatch `coder` with `isolation: 'worktree'` (its result carries worktree,
branch, base_sha, head_sha per CODER_RESULT). `blocked`/`needs_context` → escalation
`coder_blocked`, chain ends for that order. Then the verify/fix loop: dispatch `verifier`
(worktree path, base_sha, locus, build/suite commands from `args.notes` or repo defaults,
new-test list from the coder's commits); compute `verifyOk` (the §5 derivation, verbatim);
on failure dispatch a coder fix round in the SAME worktree (no isolation flag) and re-verify;
escalate `verify_failed_repeatedly` when a verify-fix round lands no new commits (compare
head SHAs — computed progress, not a counter).

- [ ] **Step 4: The review loop — interfaces §7 made literal**

```js
async function reviewLoop(wo, coderRes, advisories) {
  const trail = []
  let priorCriticals = [], lastHead = coderRes.head_sha, round = 0
  while (true) {
    round += 1
    const review = await agent(reviewerPrompt(wo, coderRes, advisories, priorCriticals, lastHead), {
      agentType: 'vf-agentics:reviewer', effort: 'high',
      schema: FINDINGS, phase: 'Review', ...judge,
    })
    const criticals = review.findings.filter(f => f.severity === 'critical')
    trail.push({ round, findings: review.findings, fix_commits: [] })
    if (criticals.length === 0) return { approved: trail }         // computed exit — the ONLY exit
    const stuck = review.fix_verdicts.some(v =>
      (v.status === 'not_fixed' || v.status === 'regressed') &&
      priorCriticals.some(p => p.id === v.id && p.stuckOnce))       // same id, second consecutive round
    if (stuck) return { escalation: esc(wo, 'review_not_converging', criticals, trail, coderRes) }
    const fix = await agent(coderFixPrompt(wo, coderRes, criticals), {
      agentType: 'vf-agentics:coder', effort: 'medium', schema: CODER_RESULT,
      phase: 'Review', ...coderTier,
    })
    if (fix.status === 'blocked' || fix.status === 'needs_context' || fix.commits.length === 0)
      return { escalation: esc(wo, 'no_fix_progress', criticals, trail, coderRes) }
    trail[trail.length - 1].fix_commits = fix.commits.map(c => c.sha)
    const verify = await agent(verifierPrompt(wo, fix), { agentType: 'vf-agentics:verifier',
      effort: 'low', schema: VERIFY, phase: 'Verify' })
    if (!verifyOk(verify)) { /* one more fix attempt; no-progress -> escalate as Step 3 */ }
    priorCriticals = criticals.map(c => ({ ...c,
      stuckOnce: review.fix_verdicts.some(v => v.id === c.id && v.status !== 'fixed') }))
    lastHead = fix.head_sha
  }
}
```

The `stuckOnce` bookkeeping is the non-convergence rule of interfaces §7.3: a critical id
reported unfixed in two CONSECUTIVE rounds escalates. Note what is absent: no round
counter appears in any exit condition.

- [ ] **Step 5: Budget and error hygiene**

Every `agent()` in the chain is `.catch`-wrapped: a thrown budget error converts the
in-flight order to an escalation `{reason: 'budget'}` with the trail so far (IRON LAW §6).
A `null` agent return (user skip / terminal error) becomes the same escalation with
`reason` preserved in the object's `trail` notes — never a silent drop (§5).

- [ ] **Step 6: Assemble the return** — exactly interfaces §8: `implemented` from approved
  chains (with `open_majors` = non-critical findings of each LAST round), `escalations`,
  `coupled`, `deferred`, `survey_coverage` passed through unmodified, `coverage` derived:

```js
const complete = escalations.length === 0 && coupled.length === 0 && deferred.length === 0
  && (survey ? survey.coverage.complete : true)
```

- [ ] **Step 7: Lint and static checks**

Run: `node tools/lint.mjs` → `OK: no findings` (this file must pass `no-turn-caps`,
`no-self-verdict`, `no-schema-bounds`, `workflow-meta`, `no-imports`,
`qualified-agent-types`, `coverage-block`).

- [ ] **Step 8: Commit**

```bash
git add workflows/vfa-develop.workflow.js
git commit -m "$(cat <<'EOF'
feat(workflows): add vfa-develop with the adversarial review loop

Survey -> plan -> partition -> wave-1 pipeline of coder -> verifier ->
review loop. Exit only on JS-computed zero criticals; convergence-based
escalation; never merges; waves 2+ return as deferred.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node tools/lint.mjs` exits 0 — all seven applicable rules pass
- [ ] Schemas byte-match interfaces §1/§4/§5/§6; `verifyOk` byte-matches §5's derivation
- [ ] No counter-based exit anywhere; both escalation reasons from §7.3 implemented
- [ ] Return shape matches §8 including the `complete` derivation
- [ ] No files outside Scope were modified
