// lib/verify.mjs — the four mechanical checks of one work order, as one script.
//
// Contract: docs/superpowers/specs/2026-08-30-increment-11-contracts.md.
//
// The verifier is the most-dispatched role in the pipeline and its verify mode was ~90%
// command execution with verbatim transcription — on sonnet, once per order and once more per
// fix round. Running a command and copying its exit status is not judgment, and IRON LAW §8
// says cost comes out of method: a deterministic thing is a script. So the commit-series check,
// the build, the suite and the discriminator all happen here, in one process, and what the
// dispatch carries back is one digest-covered line of JSON.
//
// WHAT DID NOT MOVE. The verdict predicates stay caller-side, in
// workflows/vfa-develop.workflow.js and lib/run-verdict.mjs, untouched. This file decides
// nothing about whether an order passed; it observes, and the payload it prints has exactly the
// fields the caller's `verifyOk` already reads. That is the whole safety argument for letting a
// script do this work: nothing here can certify anything.
//
// ABSENT IS NOT FAILED, IN EITHER DIRECTION. `absent` means the repository defines no such
// command at this commit; `failed` means a command ran and exited non-zero. A shell cannot tell
// the two apart — a missing command and a broken build both come back non-zero — so this file
// NEVER infers `absent`. It is recorded only when the caller declares it (`--build-absent`),
// which is a fact somebody established. A command the caller did not name and did not declare
// absent is `command_unknown`: a typed error, escalated to a model, never quietly recorded as a
// repository with no build.
//
// THE ENVIRONMENT CHECK IS FIRST AND IT REFUSES. The discriminator stashes and moves HEAD. Doing
// that in the tree a human is working in destroys work, so this file establishes that it is
// standing in a LINKED worktree before it touches anything — the same refusal agents/verifier.md
// has always carried, moved from prose a model reads into a check a process makes.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { LOG_FORMAT, analyzeSeries, parseLog } from './commit-series.mjs'
import { canonical, fnv1a } from './plan-digest.mjs'
import { appendLine, digestEntry } from './ledger.mjs'

/** The last lines of suite output that travel back, verbatim. */
const TAIL_LINES = 40

/** Output buffers: a test suite's output is routinely megabytes. */
const MAX_BUFFER = 1 << 26

const posix = (p) => String(p || '').split('\\').join('/')

/** One git command inside a directory. Never throws; the caller reads the fields. */
function git(cwd, args) {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: MAX_BUFFER })
  return {
    ok: run.status === 0,
    status: run.status === null ? -1 : run.status,
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    failedToStart: Boolean(run.error),
    message: run.error ? run.error.message : '',
  }
}

/**
 * One command from the repository's own documentation, run through the platform shell.
 *
 * `ran` is false only when the SHELL could not be started. A command the shell could not find
 * exits 127, which is an observed non-zero exit and is reported as one — working out that a
 * repository defines no such command is not this function's job and is not inferrable here.
 */
function shell(cwd, command) {
  const run = spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: MAX_BUFFER })
  return {
    ran: !run.error,
    status: run.status === null ? -1 : run.status,
    output: (run.stdout || '') + (run.stderr || ''),
    message: run.error ? run.error.message : '',
  }
}

const tailOf = (text) => String(text || '').split('\n').slice(-TAIL_LINES).join('\n')

// ---------------------------------------------------------------- the environment check
//
// A linked worktree's git directory is `<common>/worktrees/<name>`; the main working tree's IS
// the common directory. That single comparison is the whole test, and it is the one git itself
// answers rather than a guess from the path's shape.

/** @returns {{kind: string, message: string}|null} */
export function worktreeProblem(worktree) {
  if (!worktree) {
    return {
      kind: 'no_worktree',
      message: 'no worktree path was given. This procedure stashes and moves HEAD, so it will ' +
        'not run without one.',
    }
  }
  if (!existsSync(worktree)) {
    return { kind: 'no_worktree', message: posix(worktree) + ' does not exist' }
  }

  const inside = git(worktree, ['rev-parse', '--is-inside-work-tree'])
  if (inside.failedToStart) {
    return { kind: 'no_worktree', message: 'git could not be run: ' + inside.message }
  }
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return {
      kind: 'no_worktree',
      message: posix(worktree) + ' is not inside a git working tree: ' +
        (inside.stderr.trim() || 'git rev-parse --is-inside-work-tree said ' +
          JSON.stringify(inside.stdout.trim())),
    }
  }

  const gitDir = git(worktree, ['rev-parse', '--absolute-git-dir'])
  let common = git(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!common.ok) {
    // `--path-format` is git 2.31+. The older spelling answers relative to the worktree, so it
    // is resolved here rather than compared as it stands.
    const relative = git(worktree, ['rev-parse', '--git-common-dir'])
    common = { ok: relative.ok, stdout: relative.ok ? resolve(worktree, relative.stdout.trim()) : '' }
  }

  if (!gitDir.ok || !common.ok || !common.stdout.trim()) {
    return {
      kind: 'no_worktree',
      message: 'git could not say where this working tree\'s git directory is, so whether it is ' +
        'a linked worktree cannot be established — and an unanswered question is not a yes',
    }
  }

  if (posix(resolve(gitDir.stdout.trim())) === posix(resolve(common.stdout.trim()))) {
    return {
      kind: 'main_worktree',
      message: posix(worktree) + ' is the repository\'s MAIN working tree, not a worktree cut ' +
        'for this order. The discriminator stashes and moves HEAD, and doing that in the tree ' +
        'somebody is working in destroys work. Create a throwaway worktree at the pre-change ' +
        'SHA and point this at that instead.',
    }
  }

  return null
}

// ---------------------------------------------------------------- test files
//
// Which of a change's files are tests, by a CLOSED pattern set rather than by judgment. The set
// is stated here and in the contracts doc, and the notes say how many changed files matched, so
// an empty discriminator is always accompanied by the number it was drawn from — "this order
// added no tests" and "the pattern matched none of its files" are different sentences.

const TEST_PATH_PATTERNS = [
  /(^|\/)tests?\//i,
  /(^|\/)spec\//i,
  /(^|\/)__tests__\//i,
  /\.(test|spec)\.[A-Za-z0-9]+$/i,
  /(^|\/)test_[^/]+\.[A-Za-z0-9]+$/i,
  /_test\.[A-Za-z0-9]+$/i,
  /(^|\/)[A-Za-z0-9]+(Test|Tests|Spec)\.[A-Za-z0-9]+$/,
]

/** Pure. Whether a repo-relative path is a test file under the closed pattern set. */
export const isTestPath = (path) => {
  const p = posix(path)
  return TEST_PATH_PATTERNS.some((re) => re.test(p))
}

// ---------------------------------------------------------------- failing tests
//
// The load-bearing half of a failure is its FILE: a red order passes when every failure sits in
// the tests it owns, and an order owns files rather than test ids. So a failure this scanner
// cannot place against a real test file is not reported as an unplaceable entry and is not
// dropped either — it raises `suite_failures_unnamed`, and a model reads the output instead.
// Guessing the file is the one move that turns a detectable problem into a wrong verdict.

const FAILURE_MARKERS = [
  /^\s*not ok \d+\s*-?\s*(.+)$/i,                    // TAP
  /^\s*[\u2716\u2717\u00d7]\s+(.+?)(?:\s+\(\d[^)]*\))?\s*$/, // node --test spec reporter
  /^\s*FAILED\s+(.+)$/,                              // pytest
  /^\s*---\s*FAIL:\s*(.+)$/,                         // go
  /^\s*FAIL\s+(.+)$/,                                // jest, go package lines
  /^\s*\u25cf\s+(.+)$/,                              // jest failure detail
  /^\s*test\s+(.+?)\s+\.\.\.\s*FAILED\s*$/,          // cargo
]

// Runner summary lines wear the same marker as a real failure and name no test. Counting one as
// a failure attributes it to whatever file was printed last, which is how a fence check ends up
// ruling on a line that is not a test at all.
//
// The trailing guard is a negative lookahead rather than `\b`, and the difference is a whole
// class of red order. `\b` treats `/` as a boundary, so `tests/unit/x.test.ts` — the id vitest
// and jest print on their `FAIL <path>` line — read as the summary word `tests` and was thrown
// away. The suite then failed while naming nothing, which raises `suite_failures_unnamed`,
// which is `environment_broken`, which `verifiable()` refuses: in run 20260902-124933 a correct
// red order could not be verified at all, and the fix round dispatched at it had no defect to
// find. A summary word is followed by a space or the end of the line; a path continues into
// its own next segment, and every character that can do that is excluded here.
const SUMMARY_ID = /^(failing tests?:?|tests?|suites?|pass|fail|cancelled|skipped|todo|duration_ms)(?![\w/\\.-])/i

/**
 * Every path-shaped token in a line that names an existing test file, REPO-RELATIVE.
 *
 * Repo-relative is not cosmetic: the caller intersects these paths against the order's declared
 * locus, which is repo-relative, so an absolute path reported here matches no fence and reads as
 * collateral damage. Runners print all of it — relative paths, absolute paths, and `file://`
 * URLs in stack frames — so every form is normalized to the one the fence is written in.
 */
function testPathsIn(text, worktree) {
  const root = resolve(worktree)
  const found = []

  for (const raw of String(text || '').split(/[\s,'"()[\]]+/)) {
    if (!raw) continue

    let token = posix(raw)
    if (token.startsWith('file://')) {
      token = token.slice('file://'.length)
      if (/^\/[A-Za-z]:/.test(token)) token = token.slice(1)
      try {
        token = decodeURIComponent(token)
      } catch { /* a token that is not valid percent-encoding is used as it stands */ }
    }

    // pytest writes `path::id`; runners and stack frames write `path:line:col`.
    token = token.split('::')[0].replace(/:\d+(:\d+)?$/, '').replace(/^\.\//, '')
    if (!token) continue

    const abs = resolve(root, token)
    const rel = posix(relative(root, abs))
    if (!rel || rel.startsWith('..')) continue
    if (!isTestPath(rel) || !existsSync(abs)) continue

    found.push(rel)
  }

  return found
}

/**
 * Pure-ish (it stats the worktree). Failures named by a suite's own output.
 * @returns {{failures: Array<{file: string, id: string}>, markers: number, unplaced: number}}
 */
export function extractFailures(output, worktree) {
  const hits = []
  let current = ''

  for (const raw of String(output || '').split('\n')) {
    const line = raw.replace(/\r$/, '')
    const paths = testPathsIn(line, worktree)
    if (paths.length > 0) current = paths[paths.length - 1]

    for (const marker of FAILURE_MARKERS) {
      const match = line.match(marker)
      if (!match) continue

      const id = match[1].trim()
      if (!id || SUMMARY_ID.test(id)) break

      const inline = testPathsIn(id, worktree)
      hits.push({ id, file: inline.length > 0 ? inline[0] : current })
      break
    }
  }

  // Two passes, because a runner names one failure TWICE and only one of the two occurrences
  // carries a path: node's reporter streams `✖ <name>` with no file context around it, then
  // repeats every failure in an epilogue under `test at <path>:<line>`. Counting the streamed
  // occurrence as unplaceable would escalate every red order in the pipeline for no reason.
  const placed = new Map()
  for (const hit of hits) if (hit.file && !placed.has(hit.id)) placed.set(hit.id, hit.file)

  const failures = []
  const seen = new Set()
  let unplaced = 0

  for (const hit of hits) {
    const id = hit.id
    const file = hit.file || placed.get(id) || ''

    if (!file) {
      unplaced += 1
      continue
    }

    const key = file + '\u0000' + id
    if (seen.has(key)) continue
    seen.add(key)
    failures.push({ file, id })
  }

  return { failures, markers: hits.length, unplaced }
}

// ---------------------------------------------------------------- the checks

/** The commit-series findings, or the reason they could not be measured. */
function seriesOf(worktree, base, locus) {
  const log = git(worktree, ['log', '--reverse', '--format=' + LOG_FORMAT, '--name-only',
    base + '..HEAD'])

  if (!log.ok) {
    return {
      findings: [],
      error: {
        kind: 'series_unreadable',
        message: 'git log ' + base + '..HEAD did not run: ' +
          (log.stderr.trim() || log.message || 'exit ' + log.status),
      },
    }
  }

  try {
    return { findings: analyzeSeries(parseLog(log.stdout), locus), error: null }
  } catch (err) {
    // parseLog throws on a truncated stream. An empty findings array means "checked, found
    // nothing"; a failed measurement must never wear that shape.
    return {
      findings: [],
      error: { kind: 'series_unreadable', message: 'the commit series could not be read: ' + err.message },
    }
  }
}

/** One command's outcome as the caller's enum, plus what it printed. */
function runNamedCommand(worktree, command, declaredAbsent, what) {
  if (declaredAbsent) {
    return {
      outcome: 'absent',
      output: '',
      note: 'no ' + what + ' command: the dispatch declared this repository defines none',
      error: null,
    }
  }
  if (!command) {
    return {
      outcome: 'absent',
      output: '',
      note: 'the ' + what + ' command was neither named nor declared absent',
      error: {
        kind: 'command_unknown',
        message: 'no ' + what + ' command was named and none was declared absent. A command ' +
          'nobody named is not a repository with no command, and this script does not go ' +
          'looking — that is judgment, and it escalates.',
      },
    }
  }

  const run = shell(worktree, command)
  if (!run.ran) {
    return {
      outcome: 'absent',
      output: '',
      note: 'the ' + what + ' command could not be started: ' + run.message,
      error: {
        kind: 'shell_refused',
        message: 'the shell could not start ' + JSON.stringify(command) + ': ' + run.message,
      },
    }
  }

  return {
    outcome: run.status === 0 ? 'passed' : 'failed',
    output: run.output,
    note: what + ': ' + JSON.stringify(command) + ' exited ' + run.status,
    error: null,
  }
}

/** The single-test command for one file, from the dispatch's template. */
const singleTestCommand = (template, file) =>
  template.includes('{file}') ? template.split('{file}').join(file) : template + ' ' + file

/**
 * The discriminator: does each new test fail WITHOUT the source change?
 *
 * The new tests are restored onto the base tree before they are run there. A test the change
 * ADDED does not exist at base and cannot be run at all; one it MODIFIED reverts to its old
 * content, which passes — and recording that as `failed_on_base: false` fails perfectly correct
 * work. Restoring the tests under measurement is what makes this a discriminator rather than a
 * coin flip.
 *
 * The tree is always put back. A worktree left on a detached HEAD strands every commit a later
 * fix round makes in it, so a restore that did not happen is `tree_not_restored` — loud, not
 * silent.
 */
function discriminate(worktree, base, head, files, template) {
  const entries = []
  const notes = []

  const now = new Map()
  for (const file of files) {
    const run = shell(worktree, singleTestCommand(template, file))
    now.set(file, { passes: run.ran && run.status === 0, status: run.status, ran: run.ran })
  }

  const dirty = git(worktree, ['status', '--porcelain']).stdout.trim() !== ''
  let stashed = false

  if (dirty) {
    const stash = git(worktree, ['stash', 'push', '--include-untracked', '-m', 'vfa-verify'])
    if (!stash.ok) {
      return {
        entries: [],
        notes: [],
        error: {
          kind: 'base_checkout_refused',
          message: 'the worktree has uncommitted changes and git refused to stash them, so the ' +
            'base could not be checked out without discarding work: ' +
            (stash.stderr.trim() || 'git stash push failed'),
        },
      }
    }
    stashed = true
  }

  const unstash = () => {
    if (!stashed) return null
    const pop = git(worktree, ['stash', 'pop'])
    return pop.ok ? null : 'the stash could not be popped: ' + (pop.stderr.trim() || 'git stash pop failed')
  }

  const moved = git(worktree, ['-c', 'advice.detachedHead=false', 'checkout', base])
  if (!moved.ok) {
    const left = unstash()
    return {
      entries: [],
      notes: [],
      error: {
        kind: 'base_checkout_refused',
        message: 'git refused to check out the base ' + base + ': ' +
          (moved.stderr.trim() || 'git checkout failed') + (left ? ' — and ' + left : ''),
      },
    }
  }

  let unrunnable = null
  const restored = git(worktree, ['checkout', head, '--', ...files])

  if (restored.ok) {
    for (const file of files) {
      const run = shell(worktree, singleTestCommand(template, file))
      // 127 is the shell's own "no such command". A test that cannot be LAUNCHED at base was not
      // measured there, and recording that as a failure is the laundering IRON LAW §2 forbids.
      if (!run.ran || run.status === 127) {
        unrunnable = unrunnable || {
          kind: 'test_unrunnable',
          message: file + ' could not be RUN at ' + base + ' (' +
            (run.ran ? 'the shell reported command not found' : run.message) +
            '). Unobserved and failed are different answers.',
        }
        continue
      }
      const head_status = now.get(file)
      entries.push({
        test_id: file,
        failed_on_base: run.status !== 0,
        passes_now: head_status ? head_status.passes : false,
      })
      notes.push(file + ': exit ' + run.status + ' at base, exit ' +
        (head_status ? head_status.status : '?') + ' at head')
    }
  } else {
    unrunnable = {
      kind: 'test_unrunnable',
      message: 'the tests under measurement could not be restored onto the base tree: ' +
        (restored.stderr.trim() || 'git checkout <head> -- <tests> failed') +
        ' — without them this measures the OLD tests, which is not a discriminator',
    }
  }

  const back = git(worktree, ['checkout', '-f', '-'])
  const left = unstash()
  const attached = git(worktree, ['symbolic-ref', '-q', 'HEAD'])

  if (!back.ok || !attached.ok || left) {
    return {
      entries,
      notes,
      error: {
        kind: 'tree_not_restored',
        message: 'the worktree was not put back the way it was found' +
          (back.ok ? '' : ': ' + (back.stderr.trim() || 'git checkout -f - failed')) +
          (attached.ok ? '' : '; HEAD is detached, and a commit made there is unreachable once ' +
            'the worktree is removed') +
          (left ? '; ' + left : ''),
      },
    }
  }

  return { entries, notes, error: unrunnable }
}

// ---------------------------------------------------------------- the whole measurement

/** The default payload: every field present, nothing observed yet. */
const blank = () => ({
  stop_reason: 'completed',
  build: 'absent',
  suite: 'absent',
  suite_output_tail: '',
  failing_tests: [],
  discriminator: [],
  series_findings: [],
  notes: '',
  error: null,
  journal: null,
})

/**
 * Run every check the options ask for and return the payload the caller's verdict reads.
 *
 * `stop_reason` is `environment_broken` whenever `error` is non-null, and that pairing is load
 * bearing: a caller that never looks at `error` still fails safe, because `verifiable()` reads
 * `stop_reason` and nothing green can be computed from a broken measurement.
 *
 * @param {object} options see parseArgs
 */
export function verify(options) {
  const payload = blank()
  const notes = []
  const errors = []
  const worktree = posix(options.worktree || '')

  const broken = worktreeProblem(options.worktree)
  if (broken) {
    payload.stop_reason = 'environment_broken'
    payload.error = broken
    payload.notes = broken.message
    return payload
  }

  const integration = options.mode === 'integration'
  notes.push((integration ? 'integration head' : 'order series') + ' in ' + worktree)

  if (!integration) {
    const series = seriesOf(options.worktree, options.base, options.locus)
    payload.series_findings = series.findings
    if (series.error) errors.push(series.error)
    else {
      notes.push('series: ' + series.findings.length + ' finding(s) over ' + options.base +
        '..HEAD against ' + options.locus.length + ' declared locus path(s)')
    }
  } else {
    // Honest emptiness. There is no single declared locus at the merged head and no one change
    // under test, so neither check is asked for — and the caller knows it did not ask.
    notes.push('series check and discriminator not run: this is the merged head, which has no ' +
      'single declared locus and no one change under test')
  }

  const build = runNamedCommand(options.worktree, options.build, options.buildAbsent, 'build')
  payload.build = build.outcome
  notes.push(build.note)
  if (build.error) errors.push(build.error)
  // A failed build's own output. The caller turns `build === 'failed'` into a fix-round finding
  // whose evidence is `notes`, and "exit 1" alone sends a coder to look for a defect it has not
  // been shown.
  if (build.outcome === 'failed') notes.push('build output tail:\n' + tailOf(build.output))

  const suite = runNamedCommand(options.worktree, options.suite, options.suiteAbsent, 'suite')
  payload.suite = suite.outcome
  payload.suite_output_tail = tailOf(suite.output)
  notes.push(suite.note)
  if (suite.error) errors.push(suite.error)

  if (payload.suite === 'failed') {
    const found = extractFailures(suite.output, options.worktree)
    payload.failing_tests = found.failures
    notes.push('failing tests: ' + found.failures.length + ' placed from ' + found.markers +
      ' failure marker(s)')

    if (found.failures.length === 0 || found.unplaced > 0) {
      errors.push({
        kind: 'suite_failures_unnamed',
        message: 'the suite failed and ' +
          (found.failures.length === 0
            ? 'no failure could be attributed to a test file'
            : found.unplaced + ' failure(s) could not be attributed to a test file') +
          '. A failure with no usable path cannot be placed against a declared locus, and a ' +
          'suite that failed while naming nothing is treated as failing everywhere — so this ' +
          'is read by a model rather than guessed at.',
      })
    }
  }

  if (!integration) {
    const diff = git(options.worktree, ['diff', '--name-only', options.base + '..' + options.head])
    if (!diff.ok) {
      errors.push({
        kind: 'series_unreadable',
        message: 'git diff --name-only ' + options.base + '..' + options.head + ' did not run: ' +
          (diff.stderr.trim() || 'exit ' + diff.status),
      })
    } else {
      const changed = diff.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
      const tests = changed.filter(isTestPath)
        .filter((f) => existsSync(resolve(options.worktree, f)))

      notes.push('discriminator: ' + changed.length + ' changed file(s), ' + tests.length +
        ' matched the test-file pattern')

      if (tests.length === 0) {
        notes.push('discriminator empty: this order added no test this pattern recognises, which ' +
          'is a fact about the diff and not a check that passed')
      } else if (!options.testOne) {
        errors.push({
          kind: 'command_unknown',
          message: 'this order changed ' + tests.length + ' test file(s) and no single-test ' +
            'command template was named, so the discriminator could not ask its question',
        })
      } else {
        const run = discriminate(options.worktree, options.base, options.head, tests, options.testOne)
        payload.discriminator = run.entries
        notes.push(...run.notes)
        if (run.error) errors.push(run.error)
      }
    }
  }

  if (errors.length > 0) {
    payload.stop_reason = 'environment_broken'
    // The kind is the FIRST problem in check order and the message names every one: a caller
    // routing on `kind` gets the earliest cause, which is the one the others usually follow from.
    payload.error = {
      kind: errors[0].kind,
      message: errors.map((e) => e.message).join(' — also: '),
    }
  }

  payload.notes = notes.join('; ')
  return payload
}

// ---------------------------------------------------------------- the journal
//
// Written HERE rather than typed into a second command by the dispatch, and that is the point of
// the whole increment applied to its own record: this line carries ten fields including three
// nested arrays, and asking an agent to copy them out of the payload and into a shell heredoc is
// exactly the transcription hazard the script exists to remove. The durability rule is satisfied
// strictly — the line is written in the execution that made the observation, with no window at
// all between them — and the line's SHAPE is unchanged (increment 7 §4 stands).
//
// `seq` is copied from the dispatch, never chosen. It is the run's own ordering, minted by the
// caller, and a number chosen here would order two records confidently and wrongly.

function journalLine(options, payload, head) {
  return {
    kind: 'verify-observed',
    seq: options.seq,
    order: options.order,
    branch: options.branch,
    worktree: posix(options.worktree),
    base_sha: options.base,
    head_sha: head,
    stop_reason: payload.stop_reason,
    build: payload.build,
    suite: payload.suite,
    failing_tests: payload.failing_tests,
    discriminator: payload.discriminator,
    series_findings: payload.series_findings,
  }
}

// ---------------------------------------------------------------- the CLI

const decodeB64 = (token) => {
  try {
    return Buffer.from(String(token), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

/**
 * Pure. The options one invocation carries.
 *
 * Commands may arrive base64-encoded. They are free shell text minted by the caller — a build
 * command with a quote in it typed onto an agent's command line is the same hazard the state
 * ledger already solved that way, so the same transport is offered here.
 */
export function parseArgs(argv) {
  const options = {
    worktree: '', mode: 'order', base: '', head: '', locus: [],
    build: '', suite: '', testOne: '', buildAbsent: false, suiteAbsent: false,
    journal: '', seq: 0, order: '', branch: '',
  }

  const value = (i) => (i + 1 < argv.length ? argv[i + 1] : '')

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--worktree': options.worktree = value(i); i++; break
      case '--mode': options.mode = value(i); i++; break
      case '--base': options.base = value(i); i++; break
      case '--head': options.head = value(i); i++; break
      case '--locus': options.locus.push(value(i)); i++; break
      case '--build': options.build = value(i); i++; break
      case '--build-b64': options.build = decodeB64(value(i)); i++; break
      case '--suite': options.suite = value(i); i++; break
      case '--suite-b64': options.suite = decodeB64(value(i)); i++; break
      case '--test-one': options.testOne = value(i); i++; break
      case '--test-one-b64': options.testOne = decodeB64(value(i)); i++; break
      case '--build-absent': options.buildAbsent = true; break
      case '--suite-absent': options.suiteAbsent = true; break
      case '--journal': options.journal = value(i); i++; break
      case '--seq': options.seq = Number.parseInt(value(i), 10); i++; break
      case '--order': options.order = value(i); i++; break
      case '--branch': options.branch = value(i); i++; break
      default: break
    }
  }

  return options
}

const isMain = import.meta.main ??
  (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)

if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const payload = verify(options)

    // The observed head, not the expected one. A journal line is a record of what was seen.
    const observed = options.worktree && !payload.error
      ? git(options.worktree, ['rev-parse', 'HEAD']).stdout.trim()
      : ''

    if (options.journal && options.order && Number.isInteger(options.seq)) {
      const line = journalLine(options, payload, observed || options.head)
      const written = appendLine(options.journal, 'journal', JSON.stringify(line), digestEntry(line))
      payload.journal = { written: written.ok === true, error: written.ok ? '' : String(written.error) }
    }

    console.log(JSON.stringify({ payload, payload_digest: fnv1a(canonical(payload)) }))
    // Exit 0 whenever a digest-covered payload was printed. A typed error is a MEASUREMENT
    // OUTCOME, not a tool failure, and a non-zero exit there would have the dispatch report the
    // command as unrunnable — which is a different answer, about the machine rather than the run.
    process.exit(0)
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }))
    process.exit(1)
  }
}
