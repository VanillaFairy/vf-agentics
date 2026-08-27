// test/harness/resume-fixture.mjs — turn a plan-and-ledger fixture into what a resume actually
// receives: one courier answer carrying lib/run-verdict.mjs's stdout.
//
// The point of routing fixtures through the real lib rather than hand-writing payloads is that
// the scenario tests then exercise the SAME derivation the run uses. A hand-written verdict
// would pin what the test author believed the ladder decides; this pins what it decides. The
// digest is computed the same way too, so a scenario that wants to test the transport ladder
// can damage the payload and watch the recomputation catch it.

import { deriveVerdict } from '../../lib/run-verdict.mjs'
import { canonical, fnv1a } from '../../lib/plan-digest.mjs'

/**
 * Git facts in the shape lib/run-verdict.mjs gathers them, built from a list of branch rows.
 * `clean` is what the short-circuit reports: no ledger and no branches.
 */
export function gitFacts(rows = [], over = {}) {
  const branches = {}
  for (const row of rows) {
    branches[row.id] = {
      branch: row.branch,
      head_sha: row.head_sha,
      base_sha: row.base_sha,
      commits: row.commits || [],
      worktree: row.worktree || '',
      dirty: row.dirty || [],
      already_merged: row.already_merged === true,
    }
  }
  return {
    clean: rows.length === 0 && over.clean !== false,
    branches,
    integration_branch: over.integration_branch || '',
    integration_head: over.integration_head || '',
    ...over,
  }
}

/**
 * Expand a fixture into the single 'resume-verdict' dispatch answer.
 *
 * @param {object} v
 *   v.stop_reason  'loaded' | 'unreadable'
 *   v.plan         { work_orders, partition_raw, blocking_gaps, plan_path, ... } or null
 *   v.envelope     the conditions the plan was written under
 *   v.state        parsed state.jsonl entries (serialized back to a file here)
 *   v.journal_raw  journal.jsonl verbatim
 *   v.git          gitFacts(...) — what branches this run holds
 *   v.runstamp     defaults to the last segment of the plan path
 * @param {(envelope: object) => object} [damage] mutate the payload after it is computed, to
 *   test the transport ladder. The digest is taken BEFORE damage, so the mismatch is real.
 */
export function resumeVerdict(v, damage) {
  const env = v.envelope || {}
  const planObj = v.plan
    ? {
      ...env,
      work_orders: v.plan.work_orders || [],
      partition_raw: v.plan.partition_raw || '',
      blocking_gaps: v.plan.blocking_gaps || [],
      plan_path: v.plan.plan_path || '',
      shared_files: v.plan.shared_files || [],
      notes: v.plan.notes || '',
    }
    : null

  const runstamp = v.runstamp ||
    String((v.plan && v.plan.plan_path) || '').replace(/\/+$/, '').split('/').pop() || ''

  const stateRaw = (v.state || []).map((e) => JSON.stringify(e)).join('\n')
  const git = v.git || gitFacts([], { clean: (v.state || []).length === 0 && !v.journal_raw })

  const payload = v.stop_reason === 'unreadable' || !planObj
    ? { stop_reason: 'unreadable', runstamp, clean: false, orders: [],
        notes: v.notes ? [v.notes] : ['plan.json could not be read'] }
    : deriveVerdict(runstamp, planObj, stateRaw, v.journal_raw || '', git, [])

  const envelopeOut = { payload, payload_digest: fnv1a(canonical(payload)) }
  if (damage) damage(envelopeOut)

  return {
    'resume-verdict': {
      stop_reason: 'loaded',
      payload_raw: JSON.stringify(envelopeOut),
      notes: v.notes || '',
    },
  }
}
