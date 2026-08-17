export const meta = {
  name: 'vfa-probe',
  description: 'Adversarially probe a written artefact — a design, a proposal, a spec — with independent analysts who receive the document and the target repository\'s own guidance and nothing from its author. Rules on the design severity ladder; the gate is computed.',
  phases: [
    { title: 'Axes', detail: 'read the target repo\'s own review guidance for what to attack' },
    { title: 'Probe', detail: 'one analyst per axis, in parallel, artefact-only handoff' },
  ],
}

// ---------------------------------------------------------------- why this exists
//
// This repository had the adversarial-probe pattern twice and could reach it from neither:
// welded into `skills/design/SKILL.md` step 3, where it only runs inside a design interview,
// and in `agents/reviewer.md`, which is adversarial but speaks entirely in acceptance
// criteria, commit series and declared loci — none of which a written proposal has. Probing
// anything else meant improvising a probe, and an improvised probe is run by the document's
// own author, which is the one reviewer guaranteed to share its blind spots.
//
// Two properties are the whole point, and both are structural rather than asked-for:
//
//   1. ARTEFACT-ONLY HANDOFF. A prober receives the document and the repository. It never
//      receives the author's reasoning, summary, or "what I was going for". A prober given
//      the intent probes the intent; a prober given the document probes the thing that will
//      actually be implemented, which is the only thing anyone will read later.
//   2. THE GATE IS COMPUTED. Probers return findings on a fixed ladder and have no way to
//      say a design is sound. Whether ratification is blocked is a count of open ambiguities,
//      computed here — the same discipline every other verdict in this plugin follows, for
//      the same reason: the moment a schema offers a verdict, the exit condition migrates
//      out of JS and into a model's self-assessment.

// ---------------------------------------------------------------- schemas
//
// No minItems / maxItems / minLength / maxLength anywhere — structured outputs do not
// support them, so a bound written here would silently do nothing or turn a good result into
// a dropped one. Bounds live in the prompt as behaviour and are enforced in JS.

const AXES = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'axes', 'guidance_read', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'no_guidance_found', 'unreadable'] },
    axes: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['key', 'charge', 'source'],
      properties: {
        key: { type: 'string' },      // short slug, used as the agent label
        charge: { type: 'string' },   // what to attack, in the repository's own vocabulary
        source: { type: 'string' },   // the file that asked for it — '' for the standing axes
      } } },
    guidance_read: { type: 'array', items: { type: 'string' } },  // files actually opened
    notes: { type: 'string' },
  },
}

// `severity` is the design ladder, not the code one. The code ladder is verbatim-diffed and
// speaks in acceptance criteria and commit series; a probe holding it would invent a mapping
// to a document that has neither and rule badly in both directions.
const PROBE_FINDINGS = {
  type: 'object', additionalProperties: false,
  required: ['findings', 'notes'],
  properties: {
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['severity', 'section', 'claim', 'evidence'],
      properties: {
        severity: { type: 'string', enum: ['ambiguity', 'gap', 'note'] },
        section: { type: 'string' },   // where in the artefact, as the artefact names it
        claim: { type: 'string' },     // the defect, falsifiably stated
        evidence: { type: 'string' },  // the text or code that makes it real
      } } },
    notes: { type: 'string' },
  },
}

// ---------------------------------------------------------------- inputs

const input = typeof args === 'string' ? { artifact: args } : (args || {})
const artifact = typeof input.artifact === 'string' ? input.artifact.trim() : ''
const roots = input.roots || '.'
const context = typeof input.context === 'string' ? input.context : ''

// The four axes that run whatever the repository asks for. They are not a house style: each
// names a defect class that a document can carry all the way to implementation before anyone
// notices, which is exactly the class worth paying a probe to find.
const STANDING = [
  { key: 'ambiguity', source: '', charge:
    'Contract ambiguity. Hunt terms, interfaces and field names the document leaves readable ' +
    'two ways. The archetype: one name carrying two incompatible definitions in the same ' +
    'document — every consumer implements one of them and the mismatch is invisible until ' +
    'integration. Also hunt the quieter form: a rule stated once loosely and once precisely, ' +
    'where a reader cannot tell which governs.' },
  { key: 'invariants', source: '', charge:
    'Unnamed invariants. Find what the design silently relies on and never states — an ' +
    'ordering it assumes, a uniqueness it needs, a thing it believes cannot be empty or ' +
    'null, a caller it assumes has already checked something. An invariant nobody wrote down ' +
    'is one nobody will preserve, and it breaks at the first change made by someone who was ' +
    'not in the room.' },
  { key: 'yagni', source: '', charge:
    'YAGNI. Find machinery the document builds for a requirement nobody stated — an ' +
    'abstraction with one implementation, a configuration surface nothing configures, a ' +
    'plugin point selected at runtime by nothing. Be specific about what would have to ' +
    'become true for it to earn its place, so the author can answer.' },
  { key: 'reinvention', source: '', charge:
    'Reinvention. Is anything here rebuilding something that already exists — in this ' +
    'repository, in its declared dependencies, in the language\'s standard library, or as a ' +
    'well-known tool? Read the repository to answer, do not reason from memory. YAGNI ' +
    'catches building what nobody asked for; it will never catch building what everybody ' +
    'asked for and somebody already shipped.' },
]

const ladderText =
  `THE LADDER — rule every finding on exactly one of these three, and no other vocabulary:\n` +
  `- ambiguity — a term, contract, or interface the design leaves readable two ways. Blocks ` +
  `ratification.\n` +
  `- gap — a growth axis or requirement the design names but cannot absorb without rework. ` +
  `Resolved, or explicitly accepted by the user with the cost stated. Never silently carried.\n` +
  `- note — advisory. Recorded, never blocks.\n\n` +
  `Inflation and deflation are both failures here. An ambiguity blocks a document from being ` +
  `ratified, so calling a preference an ambiguity spends a person's afternoon; calling a ` +
  `genuine double-definition a note ships it into every consumer.\n\n`

function axesPrompt() {
  return `Read this repository's own guidance and report what a design review here must ` +
    `attack. You are not reviewing anything yet.\n\n` +
    `REPOSITORY: ${roots}\n\n` +
    `Read its CLAUDE.md, AGENTS.md, any specs or architecture notes under docs/, and any ` +
    `contributing or review guidance you find. Report the files you actually opened in ` +
    `guidance_read — a list of what you looked at is what tells your caller whether the axes ` +
    `below rest on anything.\n\n` +
    `Return one axis per distinct thing this project asks reviewers to check, phrased as a ` +
    `charge to an agent that will attack the document on that axis alone, IN THIS ` +
    `REPOSITORY'S OWN VOCABULARY. A project that mandates its own review style is satisfied ` +
    `by this probe rather than double-probed, and a project whose vocabulary nobody here has ` +
    `heard of gets probed in that vocabulary anyway — which is the entire reason this step ` +
    `exists instead of a hardcoded list.\n\n` +
    `Name the file each axis came from in source. An axis you cannot trace to a file in this ` +
    `repository is an axis you invented; do not return it. Four standing axes (contract ` +
    `ambiguity, unnamed invariants, YAGNI, reinvention) are added by your caller — do not ` +
    `repeat them, and do not omit a repo axis because it looks similar to one of them.\n\n` +
    `A repository with no review guidance at all is a real finding: return ` +
    `no_guidance_found with what you looked for. Never invent axes to fill the list.`
}

function probePrompt(axis) {
  return `Attack this document on ONE axis. You are a probe, not a reviewer: your job is to ` +
    `find where it is wrong, not to appraise it. A document that survives you is not thereby ` +
    `endorsed — you have no way to endorse anything, and your caller computes what your ` +
    `findings mean.\n\n` +
    `THE ARTEFACT — read it in full before you write anything:\n${artifact}\n\n` +
    `REPOSITORY it will be implemented in: ${roots}\n` +
    `Read the code. A claim about what this document would do to this repository is worth ` +
    `something only if you looked; "this may conflict with the existing design" without a ` +
    `path and a line is not a finding.\n\n` +
    (context ? `WHAT THIS DOCUMENT IS FOR:\n${context}\n\n` : '') +
    `YOUR AXIS — ${axis.key}${axis.source ? ' (from ' + axis.source + ')' : ''}:\n` +
    `${axis.charge}\n\n` +
    `Stay on it. Other probes hold the other axes, and a probe that wanders reports what ` +
    `three others already have while its own axis goes unexamined.\n\n` +
    ladderText +
    `Every finding is falsifiable: claim states the defect so it could be shown wrong, and ` +
    `evidence quotes the document or cites the code that makes it real. section names where ` +
    `in the artefact, using the artefact's own section names so a human can find it.\n\n` +
    `You have the document and the repository. You do not have the author's reasoning, and ` +
    `that is deliberate: an author's account of what they meant talks you into reading the ` +
    `document as they intended rather than as it is written, and what gets implemented is ` +
    `what is written. If a passage only makes sense once you assume what they meant, that ` +
    `assumption is the finding.\n\n` +
    `Finding nothing on your axis after an honest attack IS your report. Do not pad it — a ` +
    `manufactured ambiguity costs a person a real conversation about a non-problem.`
}

// ---------------------------------------------------------------- run

if (!artifact) {
  return {
    artifact: '',
    axes: [],
    findings: [],
    ambiguities: [],
    ratifiable: false,
    coverage: {
      complete: false,
      dropped: [],
      incomplete: [],
      failed_channels: [],
      unreached: ['no artefact path was supplied, so nothing was probed'],
      resumable: { runId: 'unknown-to-script', remaining: [] },
    },
  }
}

phase('Axes')

const discovered = await agent(axesPrompt(), {
  agentType: 'vf-agentics:analyst', effort: 'low', schema: AXES,
  phase: 'Axes', label: 'axes',
}).catch((e) => {
  log(`WARNING: reading the repository's review guidance failed: ${e && e.message}`)
  return null
})

const failedChannels = []
const repoAxes = discovered && discovered.stop_reason === 'completed'
  ? (discovered.axes || []).filter((a) => a && a.key && a.charge)
  : []

if (!discovered || discovered.stop_reason === 'unreadable') {
  // Degraded, not fatal: the four standing axes still run. But a probe that never read the
  // project's own rules is a narrower probe than the one that was asked for, and IRON LAW §5
  // says a failed side channel travels in the result rather than in a log line.
  failedChannels.push('repo-axes')
  log('WARNING: probing on the standing axes only — this repository\'s own guidance was not read.')
} else if (discovered.stop_reason === 'no_guidance_found') {
  log('This repository states no review guidance; probing on the standing axes.')
}

const axes = STANDING.concat(repoAxes)

phase('Probe')
log(`Probing ${artifact} on ${axes.length} axes: ${axes.map((a) => a.key).join(', ')}.`)

// parallel(), not pipeline(): every probe is a leaf. There is no second stage to feed, and
// the barrier costs nothing because nothing waits on the slowest one but the report itself.
const reports = await parallel(axes.map((axis) => () =>
  agent(probePrompt(axis), {
    agentType: 'vf-agentics:analyst', effort: 'high', schema: PROBE_FINDINGS,
    phase: 'Probe', label: `probe:${axis.key}`,
  })))

// Reconcile by index. An axis whose probe died is an axis nobody attacked, and it has to be
// reported as unexamined rather than quietly counted among the ones that found nothing —
// those two look identical in a findings list and mean opposite things.
const findings = []
const unexamined = []

axes.forEach((axis, i) => {
  const report = reports[i]

  if (!report) {
    unexamined.push(axis.key)
  } else {
    for (const f of report.findings || []) {
      findings.push({ ...f, axis: axis.key, id: `P${findings.length + 1}` })
    }
  }
})

if (unexamined.length > 0) {
  failedChannels.push('probe')
  log(`WARNING: no report from ${unexamined.length} axis/axes: ${unexamined.join(', ')}.`)
}

const ambiguities = findings.filter((f) => f.severity === 'ambiguity')
const gaps = findings.filter((f) => f.severity === 'gap')

log(`${findings.length} finding(s): ${ambiguities.length} ambiguity, ${gaps.length} gap, ` +
  `${findings.length - ambiguities.length - gaps.length} note.`)

// The gate, computed. `ratifiable` is a count of open ambiguities and the fact that every
// axis was actually attacked — never a prober's opinion that the document is sound. An
// unexamined axis makes it false for the same reason a partial survey makes a plan
// incomplete: nobody looked, and nobody-looked is not the same as nothing-there.
const ratifiable = ambiguities.length === 0 && unexamined.length === 0

return {
  artifact,
  axes: axes.map((a) => ({ key: a.key, source: a.source || '' })),
  guidance_read: discovered ? (discovered.guidance_read || []) : [],
  findings,
  ambiguities,
  ratifiable,
  coverage: {
    complete: unexamined.length === 0 && failedChannels.length === 0,
    dropped: unexamined,
    incomplete: [],
    failed_channels: failedChannels,
    unreached: unexamined.map((key) =>
      key + ': no probe reported on this axis, so nothing here was examined for it')
      .concat(failedChannels.includes('repo-axes')
        ? ['this repository\'s own review guidance was never read, so the probe covered the ' +
           'four standing axes only and anything this project specifically asks reviewers to ' +
           'check went unchecked']
        : []),
    resumable: {
      runId: 'unknown-to-script: pair with the runId from the Workflow launch result',
      remaining: unexamined,
    },
  },
}
