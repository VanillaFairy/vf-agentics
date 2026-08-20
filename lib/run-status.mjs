// lib/run-status.mjs — derives the state of every vf-agentics run in a repository from the
// artifacts those runs already wrote. Nothing here is stored; everything is recomputed.
//
// Pure core: `partitionOf`, `deriveRun`, `statusOf`. Contract is
// docs/superpowers/specs/2026-08-16-increment-4-contracts.md §3.
//
// Why derive rather than store. A status field is a claim, and a claim outlives the thing it
// described: a run interrupted between merging its last order and appending its state line
// would carry `integrated` forever while its own state.jsonl said otherwise, and the file
// that was wrong would be the one a human read. plan.json and state.jsonl cannot be wrong
// about themselves — one records what was decided, the other is append-only and records what
// happened — so the status is a function over them, computed on every call.
//
// The one input that cannot come from those two files is whether the integration head has
// reached the user's branch. That is a fact about git, so it is *passed in* rather than read
// here: the pure core stays testable without a repository, and the CLI below is the only
// part that shells out.
//
// Four statuses and a fifth that is not a status. `planned`, `in-flight`, `integrated` and
// `landed` describe progress. `unreadable` describes this tool's inability to tell — a run
// whose plan will not parse has not failed, it has gone unmeasured, and IRON LAW §2 forbids
// writing one as the other. A caller that treats `unreadable` as `planned` re-plans work that
// may already have merged.
//
// `landed` here means one thing only: **this run's integration head reached its own
// `base_ref` branch.** A programme has a `landed` of its own — a slice whose work reached the
// user's branch — and the two are different scopes, deliberately. A run that landed on its
// programme branch is finished as a run and has not reached the user at all.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Where a run's artifacts live inside the target repository. */
export const RUNS_DIR = '.claude/vfa/runs'

/**
 * Pure. Read the waved and coupled sets out of a plan's stored partition output.
 *
 * `partition_raw` is the verbatim stdout of lib/independence.mjs, kept as a string on
 * purpose so a paraphrase dies at JSON.parse rather than downstream. The same property
 * makes it the thing that can be unreadable here, and an unreadable partition means the
 * waved set is unknown — which makes every completeness question about the run unanswerable
 * rather than answered pessimistically.
 *
 * @param {object} plan parsed plan.json
 * @returns {{ waved: string[], coupled: string[], waves: number, note: string|null }}
 */
export function partitionOf(plan) {
  const unknown = (note) => ({ waved: [], coupled: [], waves: 0, note })

  let parsed
  try {
    parsed = JSON.parse(plan.partition_raw ?? '')
  } catch (err) {
    return unknown('partition_raw is not JSON: ' + err.message)
  }

  if (parsed && parsed.error) return unknown('the partition refused this plan: ' + parsed.error)
  if (!parsed || !Array.isArray(parsed.waves)) return unknown('partition output carries no waves array')

  return {
    waved: parsed.waves.flat(),
    coupled: Array.isArray(parsed.coupled) ? parsed.coupled : [],
    waves: parsed.waves.length,
    note: null,
  }
}

/**
 * Pure. The status word alone.
 *
 * `landedInTree` is a tri-state and the third state is load-bearing: `null` means git was
 * never asked or could not answer (a deleted branch, an object this clone does not have),
 * and reading that as `false` would report a landed change as merely integrated forever.
 *
 * @param {{ hasState: boolean, unreached: string[], landedInTree: boolean|null }} facts
 */
export function statusOf({ hasState, unreached, landedInTree }) {
  if (!hasState) return 'planned'
  if (unreached.length > 0) return 'in-flight'
  return landedInTree === true ? 'landed' : 'integrated'
}

/**
 * Pure. Reduce one run's artifacts to a row.
 *
 * @param {string} runstamp
 * @param {object|null} plan parsed plan.json, or null when it could not be read
 * @param {Array<object>} state parsed state.jsonl entries, oldest first
 * @param {boolean|null} landedInTree git's answer, or null when it could not be asked
 * @param {string[]} readNotes what the reader could not read, carried in rather than lost
 * @param {Array<object>} journal parsed journal.jsonl entries — what agents observed
 */
export function deriveRun(runstamp, plan, state = [], landedInTree = null, readNotes = [],
                          journal = []) {
  const notes = readNotes.slice()

  // A merge each merging agent recorded itself, in the dispatch that performed it. It answers
  // the same question a wave line's `merged` answers and it survives what a wave line does
  // not: the wave line is written when the whole wave ends, so a run killed between a merge
  // and the end of its wave leaves merges in git that no wave line mentions. Reading only the
  // wave lines then reports those orders unreached forever — which invites re-planning work
  // that has already landed, the one misreport this file exists to refuse.
  const merges = journal.filter((e) => e && e.kind === 'merge-observed')
  const observedMerges = [...new Set(merges.filter((e) => e.order).map((e) => e.order))]
  const observedHeads = merges.map((e) => e.head_sha).filter(Boolean)

  // Three line types share the log. A line with no `kind` predates the later types, and every
  // line written then was a wave line — reading it as one is the file's own history, not a
  // guess. Splitting them here keeps every count below asking the question it means to ask:
  // `state.length` as a wave count once silently included order lines.
  //
  // `order-verified` lines are counted as state and nothing more. A verified order is not an
  // approved one, and folding it into `approved_unmerged` would report work as review-passed
  // that no reviewer has looked at.
  const waveLines = state.filter((e) => (e.kind || 'wave') === 'wave')
  const orderLines = state.filter((e) => e.kind === 'order-approved')
  // Two eras of the same evidence: the retired `order-verified` state line, and the
  // `verify-observed` journal line that replaced it. Both say a measurement was recorded for
  // an order — and no more than that. Whether it was GREEN is a derivation over the recorded
  // facts, run by `develop` when it resumes, against the order's role and locus. This file has
  // no business repeating that computation: a second implementation of "was this green" is a
  // second thing to drift, and the field is informational either way.
  const measuredIds = [...new Set(
    state.filter((e) => e.kind === 'order-verified').map((e) => e.order)
      .concat(journal.filter((e) => e && e.kind === 'verify-observed').map((e) => e.order))
      .filter(Boolean),
  )]

  if (!plan) {
    return {
      runstamp, change: '', base_branch: '', base_sha: '', programme: '', slice: '',
      planned_at: plannedAt(runstamp),
      orders: 0, waved: [], coupled: [], merged: [], unreached: [], escalated: [],
      approved_unmerged: [], measured_unapproved: [],
      waves_total: 0, waves_recorded: new Set(waveLines.map((e) => e.wave)).size,
      integration_head: '', status: 'unreadable', label: 'unreadable', notes,
    }
  }

  const { waved, coupled, waves, note } = partitionOf(plan)
  if (note) notes.push(note)

  // Merged is a union across waves; a resumed run's log carries one entry per wave and an
  // order merges exactly once. Escalated is a union for the same reason. The journal's own
  // merges join the union rather than replacing it: the two sources fail independently, and
  // an order named by either really did merge.
  const merged = [...new Set(waveLines.flatMap((e) => e.merged || []).concat(observedMerges))]
  const escalated = [...new Set(waveLines.flatMap((e) => e.escalated || []))]
  const last = waveLines.length > 0 ? waveLines[waveLines.length - 1] : null

  // Two sources, one question: which orders are finished and sitting in git unmerged. The
  // wave line's snapshot answers it for a merge run that stopped; the order lines answer it
  // for a run that died mid-wave, which the wave-grained log could not see at all. Neither is
  // unioned across waves — an order merged later would otherwise read as forever unmerged —
  // so both are filtered against what actually merged.
  const approvedUnmerged = [...new Set(
    (last && last.approved_unmerged ? last.approved_unmerged : [])
      .concat(orderLines.map((e) => e.order).filter(Boolean)),
  )].filter((id) => !merged.includes(id))

  // What the pipeline planned to land and did not. Escalated, blocked and never-dispatched
  // orders all live here together on purpose: from the outside they are one question — is
  // this run finished — and splitting them would invite a caller to check only one.
  const mergedSet = new Set(merged)
  const unreached = waved.filter((id) => !mergedSet.has(id))

  // Every line counts as state, whatever its kind and whichever file it is in. A run that died
  // mid-wave has verified or approved orders and no wave line — calling it `planned` invites
  // re-planning work that is sitting green and reviewed on its branches, which is exactly the
  // wrong invitation for the one run most worth resuming. A journal line alone says the same
  // thing: an agent got far enough to have something to record.
  const status = note
    ? 'unreadable'
    : statusOf({ hasState: state.length > 0 || journal.length > 0, unreached, landedInTree })

  return {
    runstamp,
    change: plan.change || '',
    base_branch: plan.base_branch || '',
    base_sha: plan.base_sha || '',
    // Which programme and slice this run implements, '' for an ordinary run. Without these
    // two columns a programme cannot attribute its own runs, and progress one level up has to
    // be stored as a claim instead of derived — which is the failure this whole file exists
    // to refuse, reproduced one level up.
    programme: plan.programme || '',
    slice: plan.slice || '',
    planned_at: plannedAt(runstamp),
    orders: (plan.work_orders || []).length,
    waved,
    coupled,
    merged,
    unreached,
    escalated,
    approved_unmerged: approvedUnmerged,
    waves_total: waves,
    // Distinct wave numbers, not lines. A resume that finds merges git holds and the log does
    // not appends a corrective line against the wave those merges belonged to, so a second
    // line can carry a number already recorded — and counting lines would report more waves
    // than the run has.
    waves_recorded: new Set(waveLines.map((e) => e.wave)).size,
    measured_unapproved: measuredIds
      .filter((id) => !merged.includes(id) && !approvedUnmerged.includes(id)),
    // The wave line's head when there is one, and otherwise the last merge an agent recorded
    // for itself. A run killed before any wave ended has a real integration head — every merge
    // it made produced one — and reporting '' there sends a human looking for a branch the row
    // says nothing about, on exactly the run most worth looking at.
    integration_head: (last && last.integration_head) ||
      (observedHeads.length > 0 ? observedHeads[observedHeads.length - 1] : ''),
    status,
    label: labelOf(status, coupled, escalated),
    notes,
  }
}

/**
 * Pure. The status word plus every qualifier that makes it less than it sounds.
 *
 * `integrated` and `landed` are claims about the WAVED set only. A run's coupled orders were
 * routed to the session and its escalations were routed to a human, and neither leaves a
 * trace in state.jsonl — so a run can be genuinely `landed` with three coupled orders nobody
 * ever implemented. Printing the bare word there is IRON LAW §4 reproduced in a status
 * column: a partial result wearing a complete one's label. So the word never travels alone.
 */
export function labelOf(status, coupled, escalated) {
  const qualifiers = []
  if (coupled.length > 0) qualifiers.push(`${coupled.length} coupled, not tracked here`)
  if (escalated.length > 0) qualifiers.push(`${escalated.length} escalated`)
  return qualifiers.length > 0 ? `${status} (${qualifiers.join('; ')})` : status
}

/**
 * Pure. A runstamp is `YYYYMMDD-HHMMSS`; this is the ISO instant it names, or '' when the
 * directory name is not one. No clock is consulted — age is the CLI's business, because a
 * pure function that reads the wall clock is not testable and not pure.
 */
export function plannedAt(runstamp) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(runstamp || '')
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : ''
}

// ---------------------------------------------------------------- the reader
//
// Everything below touches the filesystem or git. It is deliberately separated from the
// core above so the arithmetic can be tested without building a repository per case.

/** Parse a JSONL file leniently: a malformed line is a note, never a throw. */
function readJsonl(dir, file, notes) {
  let raw
  try {
    raw = readFileSync(join(dir, file), 'utf8')
  } catch {
    return []   // absence is a fact about how far the run got, not a failure to read it.
  }

  const entries = []
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return
    try {
      entries.push(JSON.parse(line))
    } catch {
      notes.push(`${file} line ${i + 1} is not JSON and was skipped`)
    }
  })
  return entries
}

/** state.jsonl: what the workflow decided. Absent means no wave completed — a fact. */
const readState = (dir, notes) => readJsonl(dir, 'state.jsonl', notes)

/**
 * journal.jsonl: what an agent observed, appended by that agent as it observed it.
 *
 * Read here for one reason. A merge is durable in git the instant it happens, while the wave
 * line recording it is written only when the whole wave ends — and a run has already died in
 * that gap. Without the journal this tool keeps calling those orders unreached forever, which
 * is the one misreport that matters: it invites re-planning work that has already merged.
 *
 * A torn line is expected rather than alarming — several agents append here and a kill can
 * land mid-write — so it is skipped and noted like any other, and nothing downstream depends
 * on the journal being complete.
 */
const readJournal = (dir, notes) => readJsonl(dir, 'journal.jsonl', notes)

/**
 * Ask git whether `ancestor` has reached `descendant`. Exit 0 is yes, 1 is no, and anything
 * else — most often 128, a ref or object this clone does not have — is `null`: git was asked
 * and could not answer, which is not the same as answering no.
 */
export function isAncestor(root, ancestor, descendant) {
  if (!ancestor || !descendant) return null

  const run = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant],
    { encoding: 'utf8' })

  if (run.error || run.status === null) return null
  if (run.status === 0) return true
  if (run.status === 1) return false
  return null
}

/** Every run directory in a repository, newest first. Runstamps sort lexicographically. */
export function readRuns(root) {
  let dirs
  try {
    dirs = readdirSync(join(root, RUNS_DIR), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'archived')
      .map((e) => e.name)
      .sort()
      .reverse()
  } catch {
    return []   // no runs directory: this repository has never been planned against.
  }

  return dirs.map((runstamp) => {
    const dir = join(root, RUNS_DIR, runstamp)
    const notes = []

    let plan = null
    try {
      plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'))
    } catch (err) {
      notes.push('plan.json could not be read: ' + err.message)
    }

    const state = readState(dir, notes)
    const journal = readJournal(dir, notes)
    // The head to ask git about comes from the last WAVE line: an order-approved line records
    // no integration head, and reading its empty string would ask git about nothing. A merge
    // the journal recorded is the fallback, and the better answer when the wave line that
    // would have carried the head was never written at all.
    const waveLines = state.filter((e) => (e.kind || 'wave') === 'wave')
    const merges = journal.filter((e) => e && e.kind === 'merge-observed' && e.head_sha)
    const head = waveLines.length > 0 && waveLines[waveLines.length - 1].integration_head
      ? waveLines[waveLines.length - 1].integration_head
      : (merges.length > 0 ? merges[merges.length - 1].head_sha : '')
    const branch = plan && plan.base_branch ? plan.base_branch : ''

    return deriveRun(runstamp, plan, state, isAncestor(root, head, branch), notes, journal)
  })
}

// The CLI, guarded the way this plugin's other libs are. `import.meta.main` is undefined
// before Node 24.2; the argv comparison keeps the CLI alive there — a silently no-op CLI
// would tell the `runs` skill that a repository full of parked work has none.
const isMain = import.meta.main ??
  (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)

if (isMain) {
  try {
    const root = process.argv[2] || process.cwd()
    const now = Date.now()

    // Age belongs here rather than in the core: the CLI is allowed a clock. It is the
    // cheapest predictor of how much of the drift gate is about to fire on a resume.
    const runs = readRuns(root).map((run) => ({
      ...run,
      age_days: run.planned_at
        ? Math.floor((now - Date.parse(run.planned_at + 'Z')) / 86400000)
        : null,
    }))

    console.log(JSON.stringify({ runs }))
    process.exit(0)
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }))
    process.exit(1)
  }
}
