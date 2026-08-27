export const meta = {
  name: 'vfa-survey',
  description: 'Gather evidence about a question across the local repos, git history, and vendor documentation. Returns structured findings plus a coverage block — never a conclusion.',
  whenToUse: 'The shared evidence phase for investigate, develop, find-existing-solutions and design. Call it via workflow("vfa-survey", args) as a nested step; it is rarely invoked directly.',
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

// The coverage contract every evidence-gathering agent answers to: the scouts, the historian
// and the doc-researcher alike. Completeness is DERIVED in JS from stop_reason, and a resume
// is driven by not_reached, so both have to arrive filled in.
//
// no_match and not_reached stay separate on purpose. "I looked and it is not there" is a
// FINDING — often the one that decides the question. "I never looked" is a HOLE. Merging them
// is exactly how a truncated search gets read as a clean result, and it also poisons the
// resume loop: the next round is handed things already established as absent and pays to
// re-search them.
// Every coverage field is ALWAYS present — an empty string is the correct value for "nothing
// to carry", and each description says so outright. The earlier wording ("must be non-empty
// whenever stop_reason is not exhausted") read to an exhausted agent as "must be non-empty",
// so it omitted the field it had nothing for, tripped required-field validation, re-submitted
// the same shape until the platform killed it, and a finished search was dropped whole.
const coverageFields = (searchedDescription) => ({
  searched: {
    type: 'array',
    items: { type: 'string' },
    description: searchedDescription +
      ' Always include this field. It is the evidence trail behind stop_reason: without it ' +
      'your completeness claim is an unverifiable self-report, and nobody can resume where ' +
      'you stopped.',
  },
  stop_reason: {
    type: 'string',
    enum: ['exhausted', 'unfinished', 'stuck'],
    description:
      'Always include this field. "exhausted" — every candidate your searches turned up has ' +
      'been triaged and you can name the surface that covers the request. "unfinished" — ' +
      'one pass could not cover the surface; you are handing back an honest partial and the ' +
      'caller will resume you until the search is done. "stuck" — you could not find a way ' +
      'forward. Cost, effort already spent, and the size of your report are never reasons ' +
      'to stop: never stop because the work feels large. Only "exhausted" counts as a ' +
      'complete result, so claim it only when it is true. The other two are not failures: ' +
      'the caller will resume you.',
  },
  no_match: {
    type: 'string',
    description:
      'What you searched for and genuinely did not find. This is a finding, not a gap — it ' +
      'tells the caller the thing is absent. Send an empty string — never omit the field — ' +
      'when everything you looked for was there.',
  },
  not_reached: {
    type: 'string',
    description:
      'What you never searched at all, named specifically enough for someone else to pick it ' +
      'up without redoing your work. Send an empty string when stop_reason is "exhausted"; ' +
      'otherwise it must name what remains — a search you do not describe cannot be resumed ' +
      'and will be recorded as a dead end instead. Never merge this with no_match.',
  },
})

// Only the payload field goes in `required`. The coverage fields are demanded by their
// descriptions and normalized in JS after the call — never by the validator: a required
// field whose semantics are conditional is a deadlock, observed in the field. An agent
// with nothing to put in it omits it, validation rejects the whole report, the agent
// re-submits the same shape until the platform kills it, and evidence already gathered is
// dropped — the exact trade this file's header forbids for minItems-style bounds. Absence
// is normalized in the safe direction: a missing stop_reason never reads as "exhausted",
// so sloppiness degrades toward incomplete, never toward false completeness.

const PLAN = {
  type: 'object',
  additionalProperties: false,
  required: [
    'topics', 'common_ground',
    'docs_needed', 'docs_question', 'history_needed', 'history_question',
  ],
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
    common_ground: {
      type: 'string',
      description:
        'A precise search instruction, in the same form as a topic\'s, for ground several ' +
        'topics would each need to read — a shared configuration object, a subsystem they all ' +
        'touch. It is scouted ONCE and what it finds is handed to every analyst alongside its ' +
        'own topic, so naming it here replaces the same files being searched and read once per ' +
        'topic. Send an empty string — never omit the field — when the topics genuinely share ' +
        'no ground.',
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
  required: ['hits'],
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
  required: ['findings'],
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
const maxTopics = input.max_topics || 8

// The intelligence dial. Three positions, each naming the judging tier rather than inheriting
// it: `low` is sonnet, `normal` is opus, `max` is fable. The judging tier in this workflow is
// the analysts — the one that plans the topics and the ones that rule on them.
//
// Every caller derives the position from the model it is running (fable → max, opus → normal,
// sonnet and below → low), and `develop` forwards its own dial into this nested call, so a run
// dialled to `low` reaches its analysis through this line and nowhere else. A position this
// script did not recognise is served as `normal`: dispatching at one tier while the caller
// reports the one it typed bills a run at one price and describes it at another.
const JUDGE_TIER = { low: { model: 'sonnet' }, normal: { model: 'opus' }, max: { model: 'fable' } }
const intelligence = Object.hasOwn(JUDGE_TIER, input.intelligence) ? input.intelligence : 'normal'
const judge = JUDGE_TIER[intelligence]

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
  `dependency on the other topics — the shared ground below is the one exception to that, ` +
  `because it reaches every topic's analyst. Give each a short kebab-case key and a precise ` +
  `instruction for a read-only search agent: what to find, and where to look. Size each ` +
  `topic so a single search agent can exhaust it in one pass — one subsystem, one named ` +
  `concern. Prefer more, smaller topics over one merged catch-all: a kitchen-sink topic ` +
  `forces a partial first pass, and everything later is built on what these searches ` +
  `return.\n\n` +
  `When several topics would each need to read the same files, do NOT fold that surface ` +
  `into each of them. Name it once in common_ground, as a precise instruction for a single ` +
  `search agent: it is searched once, and every analyst receives what it finds alongside ` +
  `its own topic's locations. Then confine each topic's instruction to what is unique to ` +
  `that topic. Send an empty string when the topics genuinely share no ground.\n\n` +
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

// The cap in the prompt is sizing guidance to the planner, never a licence to drop work:
// every topic the planner decided the question needs gets searched. Cutting the list here
// would undersurvey the one stage everything else is built on — the earlier behaviour of
// slicing the overflow off produced runs whose plans rested on evidence nobody gathered.
// Cost is controlled by method — cheap scouts, tight schemas — not by cutting work (§8).
if (plan.topics.length > maxTopics) {
  log(`Planner returned ${plan.topics.length} topics (asked for at most ${maxTopics}); searching all of them.`)
}

// The ground the planner says several topics would each have to read. Read defensively: a
// plan from before this field existed is not a broken plan, it is a plan with no shared
// ground, and it must degrade to exactly that rather than throwing on the way past.
const commonFind = (plan.common_ground || '').trim()

log(`Plan: ${plan.topics.length} topic(s)` +
    `${commonFind ? ' + common ground' : ''}` +
    `${plan.history_needed ? ' + git history' : ''}` +
    `${plan.docs_needed ? ' + documentation' : ''}`)

// ---------------------------------------------------------- 2. the resume engine
//
// Drives one evidence agent to exhaustion (IRON LAW §3): the scouts, the historian and the
// doc-researcher all go through here. Every stop condition is about the GOAL, and none is a
// counter or a budget (§1): the loop ends when the agent exhausts the surface, when it
// dead-ends without naming what is left, when a round errors out, or when a round covers no
// new ground — the observable form of "stuck". Cost never ends it: a search still finding
// new ground keeps going, however many rounds that takes, because every later stage is built
// on what this one returns and is far more expensive to mislead than to wait for.
//
// `absorb(found)` folds one round into the caller's accumulators and returns true when the
// round gained new ground. Progress is judged on evidence actually gained, never on the
// agent's account of itself: a round that re-treads old ground while naming the same
// remainder would otherwise be resumed forever.
async function resumeToExhaustion({ key, prompt, launch, absorb }) {
  let round = 0
  let prev = null
  while (true) {
    round++
    let found
    try {
      found = await launch(prompt(round, prev), round)
    } catch (e) {
      log(`${key}: round ${round} threw (${e && e.message}); keeping what was found.`)
      return { exhausted: false, notReached: `round ${round} failed before completion: ${e && e.message}` }
    }
    if (!found) {
      log(`${key}: round ${round} returned nothing; keeping what was found.`)
      return { exhausted: false, notReached: `round ${round} produced no result` }
    }

    const progressed = absorb(found)
    prev = found

    if (found.stop_reason === 'exhausted') {
      return { exhausted: true, notReached: '' }
    }

    // Not exhausted but nothing named as unreached: another round would be handed an empty
    // task and would return "exhausted" having done nothing. Treat it as the dead end it is
    // rather than paying for a round that launders it into completeness.
    if (!(found.not_reached || '').trim()) {
      const reason = found.stop_reason || 'unstated'
      log(`${key}: stop_reason "${reason}" with nothing named as unreached — treating as a dead end.`)
      return { exhausted: false, notReached: `search stopped as "${reason}" without naming what was missed` }
    }

    if (!progressed) {
      log(`${key}: round ${round} covered no new ground — stopping as stuck rather than looping.`)
      return { exhausted: false, notReached: found.not_reached }
    }

    log(`${key}: unfinished after round ${round} (${found.stop_reason || 'unstated'}), resuming.`)
  }
}

// ------------------------------------------------- 3. history and docs
//
// Both run alongside the scouts, and both are driven through the same resume engine: a
// historian that hands back an honest partial is resumed until the search is done, exactly
// like a scout — before this, the channels were single-shot and a truncated one was merely
// recorded. IRON LAW §5 still holds: a side-channel failure must not discard the scout and
// analyst work already paid for, so nothing here rejects.
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

// A channel's rounds accumulate prose findings rather than hit lists, so the engine's
// progress measure is the searched surface — the one part of the contract that is
// deduplicable — and the merged rounds keep the shape every consumer already reads:
// findings plus the coverage fields. Returns null when no round ever produced a result,
// which sideChannel records as the failed channel it is.
async function channelToExhaustion({ key, first, launch }) {
  const findings = []
  const searched = []
  const noMatch = []
  const seen = new Set()
  let sawResult = false

  const absorb = (found) => {
    sawResult = true
    const before = seen.size
    if ((found.findings || '').trim()) findings.push(found.findings.trim())
    for (const s of found.searched || []) {
      const k = String(s).trim()
      if (k && !seen.has(k)) { seen.add(k); searched.push(s) }
    }
    if ((found.no_match || '').trim()) noMatch.push(found.no_match.trim())
    return seen.size > before
  }

  const prompt = (round, prev) => round === 1
    ? first
    : `Continue an unfinished search — do not start over.\n\n` +
      `ORIGINAL REQUEST:\n${first}\n\n` +
      `ALREADY SEARCHED (do not repeat these):\n${searched.join('\n')}\n\n` +
      `ALREADY ESTABLISHED (do not re-derive these):\n${findings.join('\n\n')}\n\n` +
      `STILL NOT REACHED — this is your job now:\n${prev.not_reached}`

  const end = await resumeToExhaustion({ key, prompt, launch, absorb })
  if (!sawResult) return null
  return {
    findings: findings.join('\n\n'),
    searched,
    stop_reason: end.exhausted ? 'exhausted' : 'unfinished',
    no_match: noMatch.join('\n'),
    not_reached: end.notReached,
  }
}

const historyChannel = sideChannel(
  'git history search', plan.history_needed, plan.history_question,
  (ask) => channelToExhaustion({
    key: 'history',
    first: `${ask}\n\nRepositories: ${roots}\nContext: ${question}`,
    launch: (p, round) => agent(p, {
      agentType: 'vf-agentics:historian', effort: 'low', schema: HISTORY,
      phase: 'History', label: `history${round > 1 ? `#${round}` : ''}` }),
  }),
)

const docsChannel = sideChannel(
  'documentation research', plan.docs_needed, plan.docs_question,
  (ask) => channelToExhaustion({
    key: 'docs',
    first: `Research this against primary sources and report the facts with URLs.\n\n` +
      `${ask}\n\nContext: ${question}`,
    launch: (p, round) => agent(p, {
      agentType: 'vf-agentics:doc-researcher', effort: 'low', schema: DOCS,
      phase: 'Docs', label: `docs${round > 1 ? `#${round}` : ''}` }),
  }),
)

// -------------------------------------------------- 4. scout -> 5. analyze

const partial = []

// Search to exhaustion. IRON LAW §3: an incomplete scout is RESUMED, never reported as a
// result. The engine owns the stop conditions; this wrapper owns what a scout accumulates —
// deduplicated hits and searched surface, which double as the engine's progress measure.
async function scoutUntilComplete(topic) {
  const hits = []
  const searched = []
  const noMatch = []
  const seen = new Set()

  const absorb = (found) => {
    const before = seen.size
    for (const h of found.hits || []) {
      const k = `hit:${h.path}:${h.line}`
      if (!seen.has(k)) { seen.add(k); hits.push(h) }
    }
    for (const s of found.searched || []) {
      const k = `searched:${String(s).trim()}`
      if (String(s).trim() && !seen.has(k)) { seen.add(k); searched.push(s) }
    }
    if ((found.no_match || '').trim()) noMatch.push(found.no_match.trim())
    return seen.size > before
  }

  // The shared ground is searched once, by its own scout, so every other scout is told to
  // leave it alone. Without this the topics that share a surface each re-read it, and each
  // of their analysts then pays to read the same code again — the redundancy this field
  // exists to remove. The common scout itself is never handed the exclusion.
  const exclude = commonFind && topic.key !== 'common-ground'
    ? `\n\nA separate scout covers this shared ground — do not search it:\n${commonFind}`
    : ''

  const prompt = (round, prev) => round === 1
    ? `${topic.find}${exclude}\n\nRepositories: ${roots}\n\n` +
      `Report every location you find, and search to exhaustion: you stop when the surface ` +
      `is covered or you are genuinely stuck, never because the list is getting long or ` +
      `the work feels large. If one pass truly cannot cover the request, report what you ` +
      `have, set stop_reason to "unfinished", and name exactly what remains in ` +
      `not_reached — you will be resumed until the search is done.`
    : `Continue an unfinished search — do not start over.\n\n` +
      `ORIGINAL REQUEST: ${topic.find}${exclude}\n` +
      `Repositories: ${roots}\n\n` +
      `ALREADY SEARCHED (do not repeat these):\n${searched.join('\n')}\n\n` +
      `ALREADY FOUND (do not report these again):\n` +
      hits.map((h) => `${h.path}:${h.line}`).join('\n') +
      `\n\nSTILL NOT REACHED — this is your job now:\n${prev.not_reached}`

  const launch = (p, round) => agent(p, {
    agentType: 'vf-agentics:scout', effort: 'low', schema: HITS,
    phase: 'Scout', label: `scout:${topic.key}${round > 1 ? `#${round}` : ''}`,
  })

  const end = await resumeToExhaustion({ key: topic.key, prompt, launch, absorb })
  if (!end.exhausted) partial.push(topic.key)
  return { hits, searched, complete: end.exhausted, noMatch: noMatch.join('\n'), notReached: end.notReached }
}

// Launched before the pipeline rather than inside it: it is one search whose result every
// topic's analyst reads, so it runs alongside the topic scouts instead of after them. It is
// an ordinary scout in every other respect — same labels, same phase, same resume to
// exhaustion, and the same entry in `partial` when it does not get there.
const commonGround = commonFind
  ? scoutUntilComplete({ key: 'common-ground', find: commonFind })
  : Promise.resolve(null)

// What the shared scout found, written into every analyst's evidence. The warning is the
// load-bearing half: an analyst reasoning over a shared surface nobody finished searching
// must be able to say what its conclusion rests on (IRON LAW §4).
function sharedGroundSection(common) {
  if (!common) return ''
  return `\n\nSHARED GROUND (scouted once for every topic — treat it as part of your evidence):\n` +
    JSON.stringify(common.hits, null, 1) +
    `\n\nSHARED GROUND SEARCH SURFACE COVERED:\n${common.searched.join('\n')}` +
    (common.noMatch
      ? `\n\nSHARED GROUND SEARCHED AND NOT FOUND (this is evidence of absence):\n${common.noMatch}`
      : '') +
    (common.complete
      ? ''
      : `\n\nWARNING: the shared-ground search did NOT finish. It never reached: ` +
        `${common.notReached}. Anything you conclude from the shared ground inherits that ` +
        `limit — state what your conclusion rests on.`)
}

const findings = await pipeline(
  plan.topics,

  (topic) => scoutUntilComplete(topic),

  async (found, topic) => agent(
    `Answer this part of a larger question, using the locations below as your starting point.\n\n` +
    `OVERALL QUESTION: ${question}\n` +
    `THIS TOPIC: ${topic.find}\n\n` +
    `LOCATIONS FOUND (read only what you need, in line ranges):\n` +
    JSON.stringify(found.hits, null, 1) +
    `\n\nSEARCH SURFACE ACTUALLY COVERED:\n${found.searched.join('\n')}` +
    (found.noMatch ? `\n\nSEARCHED AND NOT FOUND (this is evidence of absence):\n${found.noMatch}` : '') +
    (found.notReached ? `\n\nNEVER SEARCHED: ${found.notReached}` : '') +
    sharedGroundSection(await commonGround) +
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

// ---------------------------------------------------------- 6. account

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

const unreached = []

// A topic that produced a verdict but never exhausted its search is still incomplete. One
// that produced nothing at all is already in `dropped`, so this filter prevents it being
// counted twice.
const droppedKeys = new Set(dropped)
const incomplete = partial.filter((k) => !droppedKeys.has(k)).concat(truncatedChannels)

return surveyResult(
  plan.topics.map((t) => t.key),
  verdicts,
  channelEvidence(history),
  channelEvidence(docs),
  coverageOf(dropped, incomplete, failedChannels, unreached),
)
