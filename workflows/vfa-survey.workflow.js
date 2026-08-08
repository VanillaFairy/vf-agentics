export const meta = {
  name: 'vfa-survey',
  description: 'Gather evidence about a question across the local repos, git history, and vendor documentation. Returns structured findings plus a coverage block — never a conclusion.',
  whenToUse: 'The shared evidence phase for investigate, diagnose, develop and ue-develop. Call it via workflow("vfa-survey", args) as a nested step; it is rarely invoked directly.',
  phases: [
    { title: 'Plan' },
    { title: 'Scout' },
    { title: 'History' },
    { title: 'Docs' },
    { title: 'Analyze' },
  ],
}

// ---------------------------------------------------------------- schemas
//
// No minItems / maxItems / minLength / maxLength anywhere. Structured outputs do not
// support those constraints: they are stripped before the request or validated
// client-side, so a violation becomes a retry or a dropped result rather than a cap.
// Every bound below lives in the prompt as behaviour and is enforced in JS after the call.

const PLAN = {
  type: 'object',
  additionalProperties: false,
  required: ['topics', 'docs_needed', 'docs_question', 'history_needed', 'history_question'],
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'find'],
        properties: { key: { type: 'string' }, find: { type: 'string' } },
      },
    },
    docs_needed: { type: 'boolean' },
    docs_question: { type: 'string' },
    history_needed: { type: 'boolean' },
    history_question: { type: 'string' },
  },
}

const HITS = {
  type: 'object',
  additionalProperties: false,
  required: ['hits', 'searched', 'stop_reason', 'uncovered'],
  properties: {
    hits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'line', 'note'],
        properties: { path: { type: 'string' }, line: { type: 'integer' }, note: { type: 'string' } },
      },
    },
    // Every pattern, glob and path actually searched. The evidence behind stop_reason —
    // without it, completeness is an unverifiable self-report.
    searched: { type: 'array', items: { type: 'string' } },
    // exhausted = the search surface is covered. Anything else is not complete.
    stop_reason: { type: 'string', enum: ['exhausted', 'budget', 'stuck'] },
    // Searched with no match, plus anything never reached. Must be non-empty whenever
    // stop_reason is not "exhausted".
    uncovered: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'conclusion', 'evidence', 'risks'],
  properties: {
    topic: { type: 'string' },
    conclusion: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

// ---------------------------------------------------------------- inputs

const input = typeof args === 'string' ? { question: args } : (args || {})
const question = input.question || ''
const roots = input.roots || '.'
const notes = input.notes || ''
const maxTopics = input.max_topics || 4
const maxRounds = input.max_rounds || 3

// The intelligence dial. `normal` inherits each agent's frontmatter model; `max` overrides
// the judging tier to fable. Spreading {} rather than passing model: undefined keeps the
// frontmatter default authoritative.
const intelligence = input.intelligence === 'max' ? 'max' : 'normal'
const judge = intelligence === 'max' ? { model: 'fable' } : {}

// ---------------------------------------------------------------- coverage
//
// IRON LAW §4 as a data structure. `complete` is DERIVED here and never taken from an
// agent: an agent cannot assert its own completeness, because that is exactly the
// laundering §2 forbids.

function coverageOf(dropped, incomplete, failedChannels, unreached) {
  return {
    complete:
      dropped.length === 0 &&
      incomplete.length === 0 &&
      failedChannels.length === 0 &&
      unreached.length === 0,
    dropped,
    incomplete,
    failed_channels: failedChannels,
    unreached,
    resumable: { runId: null, remaining: dropped.concat(incomplete) },
  }
}

// Every exit path below returns this shape. A caller that receives `undefined` cannot tell
// "nothing found" from "nothing ran", and that is the failure this plugin exists to prevent.
//
// `coverage:` is written out in full rather than as ES shorthand. The `coverage-block` rule
// looks for a literal `coverage:` inside a returned object literal — a documented limitation,
// since telling shorthand from a plain identifier needs a parser this repo deliberately does
// not have. Naming the parameter `coverageBlock` keeps the explicit key from reading as a
// redundant `coverage: coverage`, and keeps the rule genuinely able to tell the key's presence
// from its absence.
function surveyResult(topics, verdicts, history, docs, coverageBlock) {
  return { question, topics, verdicts, history, docs, coverage: coverageBlock }
}

if (!question) {
  return surveyResult([], [], null, null,
    coverageOf([], [], [], ['no question was supplied, so nothing was searched']))
}

log(`Question: ${question}`)

// ---------------------------------------------------------------- 1. plan

phase('Plan')

const plan = await agent(
  `Break this investigation into at most ${maxTopics} independent search topics.\n\n` +
  `QUESTION: ${question}\n` +
  `REPOSITORIES: ${roots}\n` +
  (notes ? `BACKGROUND SUPPLIED BY THE USER:\n${notes}\n` : '') +
  `\nEach topic must be answerable by searching the current code on its own, with no ` +
  `dependency on the other topics. Give each a short kebab-case key and a precise ` +
  `instruction for a read-only search agent: what to find, and where to look. Return no ` +
  `more than ${maxTopics} topics — merge related ones rather than exceeding that.\n\n` +
  `Set history_needed if answering the question requires git history rather than the ` +
  `current tree: when a behaviour changed, which commit introduced or removed something, ` +
  `why code is the way it is, or any regression. Put that question in history_question. ` +
  `A search of the current tree cannot answer these, so getting this flag wrong produces ` +
  `a confident wrong answer.\n\n` +
  `Set docs_needed only if answering the question requires vendor or standards ` +
  `documentation that is not in these repositories. Put that question in docs_question.\n\n` +
  `Leave the question fields as empty strings when the matching flag is false.\n` +
  `Do not search anything yourself. Plan only.`,
  { agentType: 'vf-agentics:analyst', effort: 'medium', schema: PLAN, label: 'plan', ...judge },
).catch((e) => {
  log(`WARNING: planning failed: ${e && e.message}`)
  return null
})

if (!plan || !plan.topics || plan.topics.length === 0) {
  return surveyResult([], [], null, null,
    coverageOf([], [], [], ['planning produced no topics, so nothing was searched']))
}

// The schema cannot cap array length, so enforce it here.
const overflow = []
if (plan.topics.length > maxTopics) {
  for (const t of plan.topics.slice(maxTopics)) overflow.push(t.key)
  log(`Planner returned ${plan.topics.length} topics; keeping ${maxTopics}, escalating: ${overflow.join(', ')}`)
  plan.topics = plan.topics.slice(0, maxTopics)
}

log(`Plan: ${plan.topics.length} topic(s)` +
    `${plan.history_needed ? ' + git history' : ''}` +
    `${plan.docs_needed ? ' + documentation' : ''}`)

// ------------------------------------------------- 2. history and docs
//
// Both run alongside the scouts, and both are caught. IRON LAW §5: a side-channel failure
// must not discard the scout and analyst work already paid for.

const historyPromise = plan.history_needed && plan.history_question
  ? agent(
      `${plan.history_question}\n\nRepositories: ${roots}\nContext: ${question}`,
      { agentType: 'vf-agentics:historian', effort: 'low', phase: 'History', label: 'history' },
    ).catch((e) => {
      log(`WARNING: git history search failed: ${e && e.message}`)
      return null
    })
  : Promise.resolve('')

const docsPromise = plan.docs_needed && plan.docs_question
  ? agent(
      `Research this against primary sources and report the facts with URLs.\n\n` +
      `${plan.docs_question}\n\nContext: ${question}`,
      { agentType: 'vf-agentics:doc-researcher', effort: 'low', phase: 'Docs', label: 'docs' },
    ).catch((e) => {
      log(`WARNING: documentation research failed: ${e && e.message}`)
      return null
    })
  : Promise.resolve('')

// -------------------------------------------------- 3. scout -> 4. analyze

const partial = []

// Search to exhaustion. IRON LAW §3: an incomplete scout is RESUMED, never reported as a
// result. Every exit path returns an object, so a failed round costs its own hits and
// nothing else.
async function scoutUntilComplete(topic) {
  const hits = []
  const searched = []
  let round = 0
  let found = null

  while (round < maxRounds) {
    round++
    const prompt = round === 1
      ? `${topic.find}\n\nRepositories: ${roots}\n\n` +
        `Report every location you find. If there are more than about 40, report the most ` +
        `relevant, set stop_reason to "budget", and name the rest in uncovered.`
      : `Continue an unfinished search — do not start over.\n\n` +
        `ORIGINAL REQUEST: ${topic.find}\n` +
        `Repositories: ${roots}\n\n` +
        `ALREADY SEARCHED (do not repeat these):\n${searched.join('\n')}\n\n` +
        `ALREADY FOUND (do not report these again):\n` +
        hits.map((h) => `${h.path}:${h.line}`).join('\n') +
        `\n\nSTILL UNCOVERED — this is your job now:\n${found.uncovered}`

    try {
      found = await agent(prompt, {
        agentType: 'vf-agentics:scout', effort: 'low', schema: HITS,
        phase: 'Scout', label: `scout:${topic.key}${round > 1 ? `#${round}` : ''}`,
      })
    } catch (e) {
      log(`${topic.key}: round ${round} threw (${e && e.message}); keeping what was found.`)
      partial.push(topic.key)
      return { hits, searched, complete: false,
               uncovered: `round ${round} failed before completion: ${e && e.message}` }
    }

    if (!found) {
      log(`${topic.key}: round ${round} returned nothing; keeping what was found.`)
      partial.push(topic.key)
      return { hits, searched, complete: false, uncovered: `round ${round} produced no result` }
    }

    hits.push(...(found.hits || []))
    searched.push(...(found.searched || []))

    if (found.stop_reason === 'exhausted') {
      return { hits, searched, complete: true, uncovered: found.uncovered || '' }
    }

    // Not exhausted but nothing named as uncovered: another round would be handed an empty
    // task and would return "exhausted" having done nothing. Treat it as the dead end it is
    // rather than paying for a round that launders it into completeness.
    if (!(found.uncovered || '').trim()) {
      log(`${topic.key}: stop_reason "${found.stop_reason}" with no uncovered detail — treating as a dead end.`)
      partial.push(topic.key)
      return { hits, searched, complete: false,
               uncovered: `search stopped as "${found.stop_reason}" without naming what was missed` }
    }

    log(`${topic.key}: incomplete after round ${round} (${found.stop_reason}), resuming.`)
  }

  partial.push(topic.key)
  log(`ESCALATION: ${topic.key} still incomplete after ${maxRounds} rounds.`)
  return { hits, searched, complete: false, uncovered: found.uncovered || '' }
}

const findings = await pipeline(
  plan.topics,

  (topic) => scoutUntilComplete(topic),

  (found, topic) => agent(
    `Answer this part of a larger question, using the locations below as your starting point.\n\n` +
    `OVERALL QUESTION: ${question}\n` +
    `THIS TOPIC: ${topic.find}\n\n` +
    `LOCATIONS FOUND (read only what you need, in line ranges):\n` +
    JSON.stringify(found.hits, null, 1) +
    `\n\nSEARCH SURFACE ACTUALLY COVERED:\n${found.searched.join('\n')}` +
    (found.uncovered ? `\n\nNOT COVERED: ${found.uncovered}` : '') +
    (found.complete
      ? `\n\nThe search was exhausted. Judge the search surface above for yourself: if it ` +
        `does not actually cover the topic, say so in risks rather than accepting it.`
      : `\n\nWARNING: the search did NOT finish and is not exhaustive. Your conclusion ` +
        `inherits that limit — state what it rests on and what would change it.`) +
    `\n\nDo not search yourself. Judge what these show. Set topic to exactly "${topic.key}".`,
    { agentType: 'vf-agentics:analyst', effort: 'high', schema: VERDICT,
      phase: 'Analyze', label: `analyze:${topic.key}`, ...judge },
  ),
)

// ---------------------------------------------------------- 5. account

const verdicts = findings.filter(Boolean)
const covered = new Set(verdicts.map((v) => v.topic))
const dropped = plan.topics.map((t) => t.key).filter((k) => !covered.has(k)).concat(overflow)

if (dropped.length > 0) log(`WARNING: no result for topic(s): ${dropped.join(', ')}`)
if (partial.length > 0) log(`WARNING: could not search to exhaustion: ${partial.join(', ')}`)

const history = await historyPromise
const docs = await docsPromise

const failedChannels = []
if (plan.history_needed && history === null) failedChannels.push('history')
if (plan.docs_needed && docs === null) failedChannels.push('docs')

// Overflow topics are already counted in `dropped` above — they were planned and produced
// no result. They are deliberately NOT also listed in `unreached`: double-reporting would
// make coverage read worse than it is and duplicate them in resumable.remaining.
const unreached = []

// A topic that produced a verdict but never exhausted its search is still incomplete. One
// that produced nothing at all is already in `dropped`, so this filter prevents it being
// counted twice.
const incomplete = partial.filter((k) => covered.has(k))

return surveyResult(
  // Includes overflow, so the caller sees every topic that was planned — not just the
  // ones that survived the cap.
  plan.topics.map((t) => t.key).concat(overflow),
  verdicts,
  history || null,
  docs || null,
  coverageOf(dropped, incomplete, failedChannels, unreached),
)
