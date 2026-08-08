# Task T16: `vfa-investigate` — the synthesis tail

## References
- Read: `../shared/interfaces.md` — **§4 the TASKS schema, §5 coverage, §6 survey contract, §7 this workflow's contract**
- Read: `workflows/vfa-survey.workflow.js` (T15) — what you consume
- Read: `../knowledge/iron-law.md` — §4
- Read: `../knowledge/run-lint.md`

## Dependencies
- Depends on: T15
- Depended on by: T17, T18

## What this workflow is

The thin half. `vfa-survey` does the expensive work; this adds one synthesis agent and returns a
report or a task list. Keeping it thin is the point — it demonstrates that the nested-core split
works, which is the main thing increment 1 is proving.

**The one rule that matters here:** `coverage` is passed through **unmodified**. Do not recompute
it, soften it, summarize it, or fold it into the prose. A caller must be able to see that the
evidence was partial even when the report reads smoothly. That is IRON LAW §4 at this boundary.

## Scope
**Files:**
- Create: `workflows/vfa-investigate.workflow.js`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Call the survey with `workflow('vfa-survey', {...})`. Nesting is **one level only**, which is
  fine: nothing here nests twice.
- Forward `intelligence` into the nested call so the shared core follows the parent's dial.
- Feed the coverage facts into the synthesis prompt as instructions, so the prose itself names
  what was missing — while still returning the structured block untouched.

## Negative Constraints (DO NOT)
- Do NOT re-implement searching. If you find yourself calling `vf-agentics:scout` here, stop.
- Do NOT modify, recompute, or omit `coverage`.
- Do NOT `import`, use `Date.now()`, `Math.random()`, schema length bounds, or turn caps.
- Do NOT derive tasks from the prose form by hand — set the mode and let the schema do it.

## Implementation Steps

- [ ] **Step 1: Confirm the core is in place**

Run: `node --test test/ && node tools/lint.mjs`
Expected: all green. Confirm `workflows/vfa-survey.workflow.js` exists.

- [ ] **Step 2: Write the workflow**

Create `workflows/vfa-investigate.workflow.js` with exactly this content:

```js
export const meta = {
  name: 'vfa-investigate',
  description: 'Answer one large question about the local codebase from evidence — current code, git history and vendor documentation — and return an ordered task list or a written report.',
  whenToUse: 'Use for "can we replace X with Y", "how does subsystem X work", "when did X break", or any question needing several parts of the codebase read, plus history or external documentation, before a decision.',
  phases: [
    { title: 'Survey' },
    { title: 'Synthesize' },
  ],
}

// ---------------------------------------------------------------- schema
//
// No minItems / maxItems / minLength / maxLength. The task ceiling is expressed in the
// prompt as behaviour and enforced in JS below.

const TASKS = {
  type: 'object',
  additionalProperties: false,
  required: ['tasks', 'summary', 'gaps'],
  properties: {
    summary: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'subject', 'description', 'activeForm', 'blocked_by'],
        properties: {
          ref: { type: 'string' },
          subject: { type: 'string' },
          description: { type: 'string' },
          activeForm: { type: 'string' },
          blocked_by: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

// ---------------------------------------------------------------- inputs

const input = typeof args === 'string' ? { question: args } : (args || {})
const question = input.question || ''
const roots = input.roots || '.'
const notes = input.notes || ''
const asTasks = Boolean(input.as_tasks)
const intelligence = input.intelligence === 'max' ? 'max' : 'normal'
const judge = intelligence === 'max' ? { model: 'fable' } : {}

const MAX_TASKS = 12

function investigateResult(mode, tasks, report, coverage) {
  return { question, mode, tasks, report, coverage }
}

if (!question) {
  return investigateResult('report', null, null, {
    complete: false,
    dropped: [],
    incomplete: [],
    failed_channels: [],
    unreached: ['no question was supplied, so nothing was investigated'],
    resumable: { runId: null, remaining: [] },
  })
}

// ---------------------------------------------------------------- 1. survey

phase('Survey')

const survey = await workflow('vfa-survey', {
  question,
  roots,
  notes,
  intelligence,
})

// The survey never throws and always returns its documented shape, so a missing coverage
// block means something changed underneath us. Say so rather than inventing one.
if (!survey || !survey.coverage) {
  return investigateResult('report', null, null, {
    complete: false,
    dropped: [],
    incomplete: [],
    failed_channels: ['survey'],
    unreached: ['vfa-survey returned no coverage block; the evidence phase did not complete'],
    resumable: { runId: null, remaining: [] },
  })
}

const c = survey.coverage

// ---------------------------------------------------------------- 2. synthesize

phase('Synthesize')

// The structured coverage block is returned untouched. These lines exist so the PROSE also
// names what was missing — a report that reads smoothly while resting on two-thirds of the
// evidence is exactly what IRON LAW §4 forbids.
const caveats =
  (c.dropped.length > 0
    ? `NOTE: these topics produced no result and are missing from the evidence: ` +
      `${c.dropped.join(', ')}. Name them and say what they would have answered.\n\n` : '') +
  (c.incomplete.length > 0
    ? `NOTE: these topics could not be searched to exhaustion: ${c.incomplete.join(', ')}. ` +
      `Lead with that limit. Do not present the answer as settled, and say what would have ` +
      `to be searched to settle it.\n\n` : '') +
  (c.failed_channels.includes('history')
    ? `NOTE: the git history search failed. Any claim about when or why something changed ` +
      `is unsupported. Say so.\n\n` : '') +
  (c.failed_channels.includes('docs')
    ? `NOTE: documentation research failed. Any claim resting on vendor behaviour is ` +
      `unsupported. Say so.\n\n` : '') +
  (c.unreached.length > 0
    ? `NOTE: not reached at all: ${c.unreached.join('; ')}.\n\n` : '')

const evidence =
  `PER-TOPIC FINDINGS:\n${JSON.stringify(survey.verdicts, null, 1)}\n\n` +
  (survey.history ? `GIT HISTORY:\n${survey.history}\n\n` : '') +
  (survey.docs ? `EXTERNAL DOCUMENTATION:\n${survey.docs}\n\n` : '') +
  caveats

if (asTasks) {
  const result = await agent(
    `Turn this investigation into an ordered task list.\n\n` +
    `QUESTION: ${question}\n\n` + evidence +
    `Subjects are imperative and short. Every description must stand alone — carry the ` +
    `path:line references and enough context to act on without seeing this investigation. ` +
    `"ref" is a local id used only by blocked_by. Put anything the investigation could not ` +
    `establish in "gaps"; do not invent a task to paper over it. Return at most ` +
    `${MAX_TASKS} tasks — merge rather than exceed.`,
    { agentType: 'vf-agentics:analyst', effort: 'high', schema: TASKS,
      label: 'synthesize:tasks', ...judge },
  ).catch((e) => {
    log(`WARNING: task synthesis failed: ${e && e.message}`)
    return null
  })

  if (!result) {
    return investigateResult('tasks', null, null, {
      complete: false,
      dropped: c.dropped,
      incomplete: c.incomplete,
      failed_channels: c.failed_channels.concat(['synthesis']),
      unreached: c.unreached.concat(['synthesis failed; the evidence was gathered but not turned into tasks']),
      resumable: c.resumable,
    })
  }

  // The schema cannot cap array length, so enforce it here.
  if (result.tasks.length > MAX_TASKS) {
    log(`Synthesis returned ${result.tasks.length} tasks; keeping ${MAX_TASKS}.`)
    const cut = result.tasks.slice(MAX_TASKS).map((t) => t.subject)
    result.tasks = result.tasks.slice(0, MAX_TASKS)
    result.gaps = result.gaps.concat(cut.map((s) => `dropped over the ${MAX_TASKS}-task cap: ${s}`))
  }

  return investigateResult('tasks', result, null, c)
}

const report = await agent(
  `Write the final answer to this question.\n\n` +
  `QUESTION: ${question}\n\n` + evidence +
  `Lead with the recommendation in one or two sentences. Then the reasons that decide it, ` +
  `each tied to a path:line, a commit, or a URL. Then risks and open questions, only where ` +
  `they change the decision. Do not restate the question. Do not list options you rejected.`,
  { agentType: 'vf-agentics:analyst', effort: 'high', label: 'synthesize', ...judge },
).catch((e) => {
  log(`WARNING: report synthesis failed: ${e && e.message}`)
  return null
})

if (!report) {
  return investigateResult('report', null, null, {
    complete: false,
    dropped: c.dropped,
    incomplete: c.incomplete,
    failed_channels: c.failed_channels.concat(['synthesis']),
    unreached: c.unreached.concat(['synthesis failed; the evidence was gathered but not written up']),
    resumable: c.resumable,
  })
}

return investigateResult('report', null, report, c)
```

- [ ] **Step 3: Verify the lint accepts it**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

- [ ] **Step 4: Prove coverage passthrough by inspection**

Run: `grep -n "coverage" workflows/vfa-investigate.workflow.js`

Read every hit. Confirm that on the two success paths the block returned is `c` — the survey's
own object — and not a reconstruction. The four failure paths build a block deliberately, because
there is a new failure to record; each of those carries the survey's `dropped`, `incomplete` and
`resumable` forward rather than resetting them.

- [ ] **Step 5: Run the full suite**

Run: `node --test test/ && node tools/lint.mjs`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add workflows/vfa-investigate.workflow.js
git commit -m "$(cat <<'EOF'
feat(workflows): add vfa-investigate

The thin synthesis tail over vfa-survey: report or task list. Passes the
survey's coverage block through untouched, and feeds its facts into the
prompt so the prose names the gaps too (IRON LAW §4).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/ && node tools/lint.mjs` succeeds
- [ ] Success paths return the survey's `coverage` object unmodified
- [ ] Failure paths carry `dropped`, `incomplete` and `resumable` forward
- [ ] `intelligence` is forwarded into the nested `workflow('vfa-survey', …)` call
- [ ] No scout or historian is called from this file
- [ ] The `MAX_TASKS` cap is enforced in JS, not in the schema
- [ ] No files outside Scope were modified
