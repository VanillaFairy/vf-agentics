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
//
// Field semantics go in `description`, never in a comment like this one. Comments are
// stripped before the schema reaches the model, so a contract written only in a comment
// binds nobody — and the coverage fields are load-bearing.

// The coverage contract every evidence-gathering agent answers to. Completeness is DERIVED
// in JS from stop_reason, and a resume is driven by not_reached, so both have to arrive
// filled in.
//
// no_match and not_reached stay separate on purpose. "I looked and it is not there" is a
// FINDING — often the one that decides the question. "I never looked" is a HOLE. Merging them
// is exactly how a truncated search gets read as a clean result, and it also poisons the
// resume loop: the next round is handed things already established as absent and pays to
// re-search them.
const coverageFields = (searchedDescription) => ({
  searched: {
    type: 'array',
    items: { type: 'string' },
    description: searchedDescription +
      ' This is the evidence trail behind stop_reason. Without it your completeness claim is ' +
      'an unverifiable self-report, and nobody can resume where you stopped.',
  },
  stop_reason: {
    type: 'string',
    enum: ['exhausted', 'budget', 'stuck'],
    description:
      '"exhausted" — every candidate your searches turned up has been triaged and you can ' +
      'name the surface that covers the request. "budget" — the work was larger than one ' +
      'pass and you stopped partway. "stuck" — you could not find a way forward. Only ' +
      '"exhausted" counts as a complete result, so claim it only when it is true. The other ' +
      'two are not failures: the caller will resume you.',
  },
  no_match: {
    type: 'string',
    description:
      'What you searched for and genuinely did not find. This is a finding, not a gap — it ' +
      'tells the caller the thing is absent. Empty only if everything you looked for was there.',
  },
  not_reached: {
    type: 'string',
    description:
      'What you never searched at all, named specifically enough for someone else to pick it ' +
      'up without redoing your work. Must be non-empty whenever stop_reason is not ' +
      '"exhausted": a search you do not describe cannot be resumed and will be recorded as a ' +
      'dead end instead. Never merge this with no_match.',
  },
})

const COVERAGE_FIELDS = ['searched', 'stop_reason', 'no_match', 'not_reached']

const PLAN = {
  type: 'object',
  additionalProperties: false,
  required: ['topics', 'docs_needed', 'docs_question', 'history_needed', 'history_question'],
  properties: {
    topics: {
      type: 'array',
      description: 'The independent search topics this question decomposes into.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'find'],
        properties: {
          key: { type: 'string', description: 'Short kebab-case identifier, unique within the plan.' },
          find: {
            type: 'string',
            description: 'A precise instruction for a read-only search agent: what to find and where to look.',
          },
        },
      },
    },
    docs_needed: {
      type: 'boolean',
      description: 'True only if answering the question needs vendor or standards documentation that is not in these repositories.',
    },
    docs_question: {
      type: 'string',
      description: 'The documentation question. Required and non-empty whenever docs_needed is true — a true flag with no question means the track is skipped entirely.',
    },
    history_needed: {
      type: 'boolean',
      description: 'True only if answering the question needs git history rather than the current tree.',
    },
    history_question: {
      type: 'string',
      description: 'The history question. Required and non-empty whenever history_needed is true — a true flag with no question means the track is skipped entirely.',
    },
  },
}

const HITS = {
  type: 'object',
  additionalProperties: false,
  required: ['hits'].concat(COVERAGE_FIELDS),
  properties: {
    hits: {
      type: 'array',
      description: 'One entry per location found. Locations only — no analysis, no recommendations.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'line', 'note'],
        properties: {
          path: { type: 'string', description: 'Path to the file containing the hit.' },
          line: { type: 'integer', description: 'Line number of the hit.' },
          note: { type: 'string', description: 'What is at that line, in one line.' },
        },
      },
    },
    ...coverageFields('Every grep pattern, glob, and path you actually searched.'),
  },
}

// History and docs return narrative evidence, so `findings` stays prose. They answer the same
// coverage contract as the scouts anyway: without it, a channel that stalled halfway is
// indistinguishable from one that finished, because both arrive as a confident essay. That
// was increment 1's stated limitation — the side channels reported completeness only as prose
// nothing read in JS, so a truncated-but-returned channel still left coverage.complete true.
const evidenceSchema = (findingsDescription, searchedDescription) => ({
  type: 'object',
  additionalProperties: false,
  required: ['findings'].concat(COVERAGE_FIELDS),
  properties: {
    findings: { type: 'string', description: findingsDescription },
    ...coverageFields(searchedDescription),
  },
})

const HISTORY = evidenceSchema(
  'The commits that matter, in the format your agent instructions specify: sha, date, author, ' +
  'subject, and the path:line of what changed. Include ruled-out candidates where they save ' +
  'the reader work. Never guess a commit.',
  'Every ref, path, and date range you actually searched, plus the git commands behind them.',
)

const DOCS = evidenceSchema(
  'The facts you established, each with the URL that owns it on the same line. Mark a claim ' +
  '"unconfirmed" when only a secondary source carries it.',
  'Every search query and URL you actually read.',
)

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'conclusion', 'evidence', 'risks'],
  properties: {
    topic: { type: 'string', description: 'The topic key you were given, copied exactly.' },
    conclusion: { type: 'string', description: 'The answer to this topic, in one or two sentences, stated first.' },
    evidence: {
      type: 'array',
      items: { type: 'string' },
      description: 'The two to four facts that decide the conclusion, each carrying a path:line, a commit, or a URL.',
    },
    risks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Risks and unknowns, only where they change the decision. Put an inadequate search surface here rather than accepting it silently.',
    },
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

// The runtime does not expose a workflow's own run id to its script, so it cannot be
// written into `resumable` — and a null there is indistinguishable from a field nobody
// filled in. The Workflow launch result carries the real id; the caller records it at
// launch and pairs it with `remaining`.
const RUN_ID = 'unknown-to-script: pair `remaining` with the runId from the Workflow launch result'

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
    resumable: { runId: RUN_ID, remaining: dropped.concat(incomplete) },
  }
}

// Every exit path below returns this shape. A caller that receives `undefined` cannot tell
// "nothing found" from "nothing ran", and that is the failure this plugin exists to prevent.
//
// The parameter is named `coverageBlock` so the key can be written out as `coverage:` without
// reading as a redundant `coverage: coverage`. Style only — `coverage-block` understands ES
// shorthand in every position, so `{ …, coverage }` would lint clean too.
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
  `Leave a question field as an empty string when its flag is false. When a flag is true ` +
  `the matching question must be non-empty — a true flag with no question skips the track ` +
  `entirely and the answer silently loses that evidence.\n` +
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
// Both run alongside the scouts. IRON LAW §5: a side-channel failure must not discard the
// scout and analyst work already paid for, so nothing here rejects.
//
// Every outcome is recorded, including the one that used to vanish: a track the planner
// marked necessary and then gave no question for. That case reported as neither researched
// nor failed — the channel silently never ran, and coverage still came back complete.

function sideChannel(name, needed, ask, launch) {
  if (!needed) {
    return Promise.resolve({ requested: false, result: null, error: '' })
  }
  if (!(ask || '').trim()) {
    log(`WARNING: ${name} was marked necessary but the planner produced no question for it.`)
    return Promise.resolve({
      requested: true,
      result: null,
      error: 'the planner marked it necessary and then produced no question, so nothing was searched',
    })
  }
  return launch(ask).then(
    (result) => result
      ? { requested: true, result, error: '' }
      : { requested: true, result: null, error: 'the agent returned no result' },
    (e) => {
      log(`WARNING: ${name} failed: ${e && e.message}`)
      return { requested: true, result: null, error: (e && e.message) || 'unknown error' }
    },
  )
}

const historyChannel = sideChannel(
  'git history search', plan.history_needed, plan.history_question,
  (ask) => agent(
    `${ask}\n\nRepositories: ${roots}\nContext: ${question}`,
    { agentType: 'vf-agentics:historian', effort: 'low', schema: HISTORY,
      phase: 'History', label: 'history' },
  ),
)

const docsChannel = sideChannel(
  'documentation research', plan.docs_needed, plan.docs_question,
  (ask) => agent(
    `Research this against primary sources and report the facts with URLs.\n\n` +
    `${ask}\n\nContext: ${question}`,
    { agentType: 'vf-agentics:doc-researcher', effort: 'low', schema: DOCS,
      phase: 'Docs', label: 'docs' },
  ),
)

// -------------------------------------------------- 3. scout -> 4. analyze

const partial = []

// Search to exhaustion. IRON LAW §3: an incomplete scout is RESUMED, never reported as a
// result. Every exit path returns an object, and every incomplete exit records the topic —
// an interrupted search has to be as visible downstream as one that simply ran out of rounds.
async function scoutUntilComplete(topic) {
  const hits = []
  const searched = []
  const noMatch = []
  let round = 0
  let found = null

  function incomplete(notReached) {
    partial.push(topic.key)
    return { hits, searched, complete: false, noMatch: noMatch.join('\n'), notReached }
  }

  while (round < maxRounds) {
    round++
    const prompt = round === 1
      ? `${topic.find}\n\nRepositories: ${roots}\n\n` +
        `Report every location you find. If there are far more than about 40, report the ` +
        `most relevant, set stop_reason to "budget", and name the rest in not_reached.`
      : `Continue an unfinished search — do not start over.\n\n` +
        `ORIGINAL REQUEST: ${topic.find}\n` +
        `Repositories: ${roots}\n\n` +
        `ALREADY SEARCHED (do not repeat these):\n${searched.join('\n')}\n\n` +
        `ALREADY FOUND (do not report these again):\n` +
        hits.map((h) => `${h.path}:${h.line}`).join('\n') +
        `\n\nSTILL NOT REACHED — this is your job now:\n${found.not_reached}`

    try {
      found = await agent(prompt, {
        agentType: 'vf-agentics:scout', effort: 'low', schema: HITS,
        phase: 'Scout', label: `scout:${topic.key}${round > 1 ? `#${round}` : ''}`,
      })
    } catch (e) {
      log(`${topic.key}: round ${round} threw (${e && e.message}); keeping what was found.`)
      return incomplete(`round ${round} failed before completion: ${e && e.message}`)
    }

    if (!found) {
      log(`${topic.key}: round ${round} returned nothing; keeping what was found.`)
      return incomplete(`round ${round} produced no result`)
    }

    hits.push(...(found.hits || []))
    searched.push(...(found.searched || []))
    if ((found.no_match || '').trim()) noMatch.push(found.no_match.trim())

    if (found.stop_reason === 'exhausted') {
      return { hits, searched, complete: true, noMatch: noMatch.join('\n'), notReached: '' }
    }

    // Not exhausted but nothing named as unreached: another round would be handed an empty
    // task and would return "exhausted" having done nothing. Treat it as the dead end it is
    // rather than paying for a round that launders it into completeness.
    if (!(found.not_reached || '').trim()) {
      log(`${topic.key}: stop_reason "${found.stop_reason}" with nothing named as unreached — treating as a dead end.`)
      return incomplete(`search stopped as "${found.stop_reason}" without naming what was missed`)
    }

    log(`${topic.key}: incomplete after round ${round} (${found.stop_reason}), resuming.`)
  }

  log(`ESCALATION: ${topic.key} still incomplete after ${maxRounds} rounds.`)
  return incomplete(found.not_reached || '')
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
    (found.noMatch ? `\n\nSEARCHED AND NOT FOUND (this is evidence of absence):\n${found.noMatch}` : '') +
    (found.notReached ? `\n\nNEVER SEARCHED: ${found.notReached}` : '') +
    (found.complete
      ? `\n\nThe search was exhausted. Judge the search surface above for yourself: if it ` +
        `does not actually cover the topic, say so in risks rather than accepting it.`
      : `\n\nWARNING: the search did NOT finish and is not exhaustive. Your conclusion ` +
        `inherits that limit — state what it rests on and what would change it.`) +
    `\n\nDo not search yourself. Judge what these show. Set topic to exactly "${topic.key}".`,
    { agentType: 'vf-agentics:analyst', effort: 'high', schema: VERDICT,
      phase: 'Analyze', label: `analyze:${topic.key}`, ...judge },
  ).catch((e) => {
    // The only unguarded agent call would be this one. The reconciliation below already
    // assumes a failed item arrives as falsy; catching here makes that true whatever
    // pipeline() does with a rejection, and keeps the promise in §6 that survey never throws.
    // The topic then falls into `dropped`, so coverage.complete goes false rather than the
    // whole run dying and the caller getting nothing it can reason about.
    log(`${topic.key}: analysis failed (${e && e.message}); reporting the topic as dropped.`)
    return null
  }),
)

// ---------------------------------------------------------- 5. account

// Reconcile by pipeline index, not by the topic string the analyst echoed back. pipeline()
// preserves order, so this is exact and needs no cooperation from the model — a verdict that
// came back under a mistyped key used to be counted as dropped and included as evidence at
// the same time.
const verdicts = []
const dropped = []
plan.topics.forEach((topic, i) => {
  if (findings[i]) verdicts.push(findings[i])
  else dropped.push(topic.key)
})
dropped.push(...overflow)

if (dropped.length > 0) log(`WARNING: no result for topic(s): ${dropped.join(', ')}`)
if (partial.length > 0) log(`WARNING: could not search to exhaustion: ${partial.join(', ')}`)

const history = await historyChannel
const docs = await docsChannel

// A requested channel that produced nothing — it threw, it returned nothing, or the planner
// asked for it and then gave it no question. All three mean the same thing downstream: the
// evidence is not there, and any claim resting on it is unsupported.
const failedChannels = []
if (history.requested && !history.result) failedChannels.push('history')
if (docs.requested && !docs.result) failedChannels.push('docs')

// A channel that RETURNED but did not exhaust its search is not a failure and not a success.
// It belongs with the partially-searched topics: real evidence, known to be incomplete, and
// resumable. Before the channels carried a stop_reason this case was invisible, and a
// half-read history left coverage.complete true.
const truncatedChannels = []
if (history.result && history.result.stop_reason !== 'exhausted') truncatedChannels.push('history')
if (docs.result && docs.result.stop_reason !== 'exhausted') truncatedChannels.push('docs')

if (truncatedChannels.length > 0) {
  log(`WARNING: evidence channel(s) returned without exhausting the search: ${truncatedChannels.join(', ')}`)
}

// Compose what the channel established WITH the limits of how it established it, so the
// evidence and its coverage travel as one string. Consumers interpolate this into a synthesis
// prompt under their own heading, which is why no heading appears here.
function channelEvidence(channel) {
  if (!channel.requested || !channel.result) return null
  const r = channel.result
  return r.findings +
    (r.no_match ? `\n\nLooked for and did not find: ${r.no_match}` : '') +
    (r.stop_reason === 'exhausted'
      ? ''
      : `\n\nCOVERAGE LIMIT (${r.stop_reason}) — never reached: ${r.not_reached}. Any claim ` +
        `depending on the unreached part is provisional. Say so rather than presenting it ` +
        `as settled.`)
}

// Overflow topics are already counted in `dropped` above — they were planned and produced
// no result. They are deliberately NOT also listed in `unreached`: double-reporting would
// make coverage read worse than it is and duplicate them in resumable.remaining.
const unreached = []

// A topic that produced a verdict but never exhausted its search is still incomplete. One
// that produced nothing at all is already in `dropped`, so this filter prevents it being
// counted twice.
const droppedKeys = new Set(dropped)
const incomplete = partial.filter((k) => !droppedKeys.has(k)).concat(truncatedChannels)

return surveyResult(
  // Includes overflow, so the caller sees every topic that was planned — not just the
  // ones that survived the cap.
  plan.topics.map((t) => t.key).concat(overflow),
  verdicts,
  channelEvidence(history),
  channelEvidence(docs),
  coverageOf(dropped, incomplete, failedChannels, unreached),
)
