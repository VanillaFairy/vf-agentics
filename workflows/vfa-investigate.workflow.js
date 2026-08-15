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

// The runtime does not expose a workflow's own run id to its script, so it cannot be
// written into `resumable` — and a null there is indistinguishable from a field nobody
// filled in. The Workflow launch result carries the real id; the skill records it at
// launch and pairs it with `remaining`.
const RUN_ID = 'unknown-to-script: pair `remaining` with the runId from the Workflow launch result'

// The parameter is named `coverageBlock` so the key can be written out as `coverage:` without
// reading as a redundant `coverage: coverage`. Style only, matching `vfa-survey` — the
// `coverage-block` rule understands ES shorthand, so `{ …, coverage }` would lint clean too.
function investigateResult(mode, tasks, report, coverageBlock) {
  return { question, mode, tasks, report, coverage: coverageBlock }
}

if (!question) {
  return investigateResult('report', null, null, {
    complete: false,
    dropped: [],
    incomplete: [],
    failed_channels: [],
    unreached: ['no question was supplied, so nothing was investigated'],
    resumable: { runId: RUN_ID, remaining: [] },
  })
}

// ---------------------------------------------------------------- 1. survey

phase('Survey')

// Registered workflows are plugin-namespaced, so the qualified name is tried first and the
// bare name second. A lookup failure on both is a broken reference in this plugin —
// unconditional on every machine — and it is reported as exactly that rather than as an
// environmental survey failure: the two must stay distinguishable, or the defect hides in
// a degrade path forever.
const surveyArgs = { question, roots, notes, intelligence }
const notFound = (e) => /not found/i.test((e && e.message) || '')
let survey = null
let surveyUnresolved = false

try {
  survey = await workflow('vf-agentics:vfa-survey', surveyArgs)
} catch (e) {
  if (!notFound(e)) {
    log(`WARNING: the survey threw: ${e && e.message}`)
  } else {
    try {
      survey = await workflow('vfa-survey', surveyArgs)
    } catch (e2) {
      if (notFound(e2)) surveyUnresolved = true
      else log(`WARNING: the survey threw: ${e2 && e2.message}`)
    }
  }
}

if (surveyUnresolved) {
  return investigateResult('report', null, null, {
    complete: false,
    dropped: [],
    incomplete: [],
    failed_channels: ['survey'],
    unreached: [
      'the vfa-survey sub-workflow resolved under neither "vf-agentics:vfa-survey" nor ' +
      '"vfa-survey" — a broken reference in this plugin, not an environmental failure; ' +
      'nothing was searched',
    ],
    resumable: { runId: RUN_ID, remaining: [] },
  })
}

// The survey itself never throws and always returns its documented shape, so a missing
// coverage block means something changed underneath us. Say so rather than inventing one.
if (!survey || !survey.coverage) {
  return investigateResult('report', null, null, {
    complete: false,
    dropped: [],
    incomplete: [],
    failed_channels: ['survey'],
    unreached: ['vfa-survey returned no coverage block; the evidence phase did not complete'],
    resumable: { runId: RUN_ID, remaining: [] },
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
  // `incomplete` carries topic keys and, since the evidence channels gained a stop_reason,
  // the names of channels that returned without exhausting their search. Both mean the same
  // thing to the reader — real evidence, known to be partial — so they share one caveat.
  (c.incomplete.length > 0
    ? `NOTE: these topics and evidence channels could not be searched to exhaustion: ` +
      `${c.incomplete.join(', ')}. Lead with that limit. Do not present the answer as ` +
      `settled, and say what would have to be searched to settle it.\n\n` : '') +
  (c.failed_channels.includes('history')
    ? `NOTE: the git history search did not run. Any claim about when or why something ` +
      `changed is unsupported. Say so.\n\n` : '') +
  (c.failed_channels.includes('docs')
    ? `NOTE: documentation research did not run. Any claim resting on vendor behaviour is ` +
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
  //
  // Losing tasks to the cap is a real loss of coverage, so it is recorded in BOTH places:
  // in `gaps` for the reader, and in the coverage block so `complete` goes false. Recording
  // it only in `gaps` would let a truncated task list come back `complete: true` — a partial
  // result indistinguishable from a whole one, which is the single failure this plugin
  // exists to prevent. `vfa-survey` accounts for its own topic cap the same way, by putting
  // overflow into `dropped` rather than into a side note.
  let coverage = c

  if (result.tasks.length > MAX_TASKS) {
    log(`Synthesis returned ${result.tasks.length} tasks; keeping ${MAX_TASKS}.`)
    const cut = result.tasks
      .slice(MAX_TASKS)
      .map((t) => `dropped over the ${MAX_TASKS}-task cap: ${t.subject}`)

    result.tasks = result.tasks.slice(0, MAX_TASKS)
    result.gaps = result.gaps.concat(cut)
    coverage = { ...c, complete: false, unreached: c.unreached.concat(cut) }
  }

  return investigateResult('tasks', result, null, coverage)
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
