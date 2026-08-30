// test/verify.test.mjs — lib/verify.mjs, against real repositories.
//
// These are slow tests: each one builds a git repository, cuts a linked worktree and runs a real
// node test suite inside it, several times. That cost is the point — the whole value of this file
// is that the discriminator moves HEAD, restores files, runs a suite there and puts the tree back,
// and none of that is observable against a mock.
//
// The properties worth pinning, in the order they matter:
//
//   the environment refusal — the procedure stashes and moves HEAD, so it must refuse the tree a
//     human is working in BEFORE it touches anything;
//   absent is never inferred — a command nobody named is not a repository with no command;
//   a failed measurement never wears a clean one's shape — an unreadable series is an error with
//     an empty findings array, and the error is what the caller routes on;
//   the tree is put back — a worktree left detached strands every later fix commit;
//   the log format is IMPORTED — a checkpoint trailer with an ordinary subject is only detectable
//     through lib/commit-series.mjs's own format string, so this file re-implementing it would
//     silently stop finding them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { verify, parseArgs, isTestPath, worktreeProblem } from '../lib/verify.mjs'
import { canonical, fnv1a } from '../lib/plan-digest.mjs'

const CLI = fileURLToPath(new URL('../lib/verify.mjs', import.meta.url))
const BRANCH = 'vfa/20260830-090000-W1'

// This file runs under `node --test`, and the fixtures' own suites are `node --test` too.
// Node marks its test children with NODE_TEST_CONTEXT and a grandchild that sees it refuses to
// run any file at all — silently, with exit 0, which would make every fixture suite "pass". The
// variable is this runner's private business and has no place in a repository's own commands.
delete process.env.NODE_TEST_CONTEXT

const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
const rev = (cwd, ref) => git(cwd, 'rev-parse', ref).stdout.trim()

const BUILD = 'node tools/build.mjs'
const SUITE = 'node --test'
const TEST_ONE = 'node --test {file}'

const WIDGET_TEST = [
  "import { test } from 'node:test'",
  "import assert from 'node:assert/strict'",
  "import { label } from '../src/widget.mjs'",
  '',
  "test('the widget is labelled hi', () => {",
  "  assert.equal(label(), 'hi')",
  '})',
  '',
].join('\n')

/** A repository with a passing suite, a build command, and one source file to change. */
function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), 'vfa-verify-')).split('\\').join('/')
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  git(dir, 'init', '-q', '-b', 'main', '.')
  git(dir, 'config', 'user.email', 't@t')
  git(dir, 'config', 'user.name', 't')
  git(dir, 'config', 'commit.gpgsign', 'false')

  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'test'))
  mkdirSync(join(dir, 'tools'))

  writeFileSync(join(dir, 'src', 'widget.mjs'), "export const label = () => 'plain'\n")
  writeFileSync(join(dir, 'tools', 'build.mjs'), '// a build that succeeds\n')
  writeFileSync(join(dir, 'test', 'base.test.mjs'), [
    "import { test } from 'node:test'",
    "test('the base suite passes', () => {})",
    '',
  ].join('\n'))

  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'init')
  return dir
}

/**
 * One order's worktree, cut from main and carrying its series.
 * `implemented: false` is a RED order — the new test lands and nothing makes it pass.
 */
function order(t, { implemented = true, trailer = '' } = {}) {
  const dir = repository(t)
  const base = rev(dir, 'HEAD')
  const worktree = dir + '/wt'

  git(dir, 'worktree', 'add', '-q', '-b', BRANCH, worktree, 'main')
  writeFileSync(join(worktree, 'test', 'widget.test.mjs'), WIDGET_TEST)
  if (implemented) writeFileSync(join(worktree, 'src', 'widget.mjs'), "export const label = () => 'hi'\n")

  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-qm', 'feat: label the widget hi' + (trailer ? '\n\n' + trailer : ''))

  return { dir, worktree, base, head: rev(worktree, 'HEAD') }
}

const options = (over = {}) => parseArgs([
  '--worktree', over.worktree,
  '--base', over.base,
  '--head', over.head,
  '--locus', 'src/widget.mjs',
  '--locus', 'test/widget.test.mjs',
  '--build', BUILD,
  '--suite', SUITE,
  '--test-one', TEST_ONE,
  ...(over.extra || []),
])

// ---------------------------------------------------------------- the environment refusal

test('it refuses the repository\'s main working tree, where moving HEAD destroys work', (t) => {
  const dir = repository(t)

  const problem = worktreeProblem(dir)
  assert.ok(problem, 'the main working tree is exactly what this procedure must not touch')
  assert.equal(problem.kind, 'main_worktree')

  const payload = verify(options({ worktree: dir, base: rev(dir, 'HEAD'), head: rev(dir, 'HEAD') }))
  assert.equal(payload.stop_reason, 'environment_broken')
  assert.equal(payload.error.kind, 'main_worktree')
  assert.deepEqual(payload.discriminator, [], 'nothing was measured, so nothing is reported')
  assert.deepEqual(payload.series_findings, [])
})

test('a path that is no working tree at all is refused before anything runs', (t) => {
  const dir = repository(t)

  assert.equal(worktreeProblem('').kind, 'no_worktree',
    'no worktree at all is the case that used to be a sentence in a prompt')
  assert.equal(worktreeProblem(dir + '/nowhere').kind, 'no_worktree')

  const outside = mkdtempSync(join(tmpdir(), 'vfa-not-a-repo-')).split('\\').join('/')
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  assert.equal(worktreeProblem(outside).kind, 'no_worktree')
})

test('a linked worktree is accepted', (t) => {
  const { worktree } = order(t)
  assert.equal(worktreeProblem(worktree), null)
})

// ---------------------------------------------------------------- the green series

test('a green series: build passes, suite passes, and the new test discriminates', (t) => {
  const { worktree, base, head } = order(t)

  const payload = verify(options({ worktree, base, head }))

  assert.equal(payload.stop_reason, 'completed')
  assert.equal(payload.error, null)
  assert.equal(payload.build, 'passed')
  assert.equal(payload.suite, 'passed')
  assert.deepEqual(payload.failing_tests, [])
  assert.deepEqual(payload.series_findings, [], 'both changed files are inside the declared locus')
  assert.deepEqual(payload.discriminator, [
    { test_id: 'test/widget.test.mjs', failed_on_base: true, passes_now: true },
  ])
  assert.ok(payload.notes.includes(BUILD), 'the commands actually run are named')
})

test('the worktree is left on its branch, clean, whatever the discriminator checked out', (t) => {
  const { worktree, base, head } = order(t)

  verify(options({ worktree, base, head }))

  assert.equal(git(worktree, 'branch', '--show-current').stdout.trim(), BRANCH)
  assert.equal(git(worktree, 'status', '--porcelain').stdout.trim(), '')
  assert.equal(rev(worktree, 'HEAD'), head)
})

test('uncommitted work in the worktree survives the discriminator', (t) => {
  const { worktree, base, head } = order(t)
  writeFileSync(join(worktree, 'src', 'scratch.txt'), 'not committed\n')

  const payload = verify(options({ worktree, base, head }))

  assert.equal(payload.stop_reason, 'completed')
  assert.match(git(worktree, 'status', '--porcelain').stdout, /scratch\.txt/,
    'the stash was popped — uncommitted work is nobody else\'s to discard')
})

// ---------------------------------------------------------------- the red series

test('a red order: its test fails now and at base, and the failure is placed in its own file', (t) => {
  const { worktree, base, head } = order(t, { implemented: false })

  const payload = verify(options({ worktree, base, head }))

  assert.equal(payload.stop_reason, 'completed')
  assert.equal(payload.error, null, 'a red suite is an observation, not a broken environment')
  assert.equal(payload.build, 'passed')
  assert.equal(payload.suite, 'failed')
  assert.deepEqual(payload.discriminator, [
    { test_id: 'test/widget.test.mjs', failed_on_base: true, passes_now: false },
  ])

  const files = payload.failing_tests.map((f) => f.file)
  assert.ok(files.length > 0, 'a suite that failed while naming nothing is failing everywhere')
  assert.deepEqual([...new Set(files)], ['test/widget.test.mjs'],
    'every failure is placed in the order\'s own test file, repo-relative')
  assert.ok(payload.failing_tests.every((f) => f.id.trim() !== ''))
})

// ---------------------------------------------------------------- absent, and unknown

test('an absent build command is recorded absent only when somebody declared it so', (t) => {
  const { worktree, base, head } = order(t)

  const declared = verify(parseArgs([
    '--worktree', worktree, '--base', base, '--head', head,
    '--locus', 'src/widget.mjs', '--locus', 'test/widget.test.mjs',
    '--build-absent', '--suite', SUITE, '--test-one', TEST_ONE,
  ]))

  assert.equal(declared.build, 'absent')
  assert.equal(declared.stop_reason, 'completed')
  assert.equal(declared.error, null, 'a repository with no build command is a fact, not a fault')
  assert.equal(declared.suite, 'passed')
})

test('a build command nobody named escalates rather than reading as a repository with none', (t) => {
  const { worktree, base, head } = order(t)

  const payload = verify(parseArgs([
    '--worktree', worktree, '--base', base, '--head', head,
    '--locus', 'src/widget.mjs', '--locus', 'test/widget.test.mjs',
    '--suite', SUITE, '--test-one', TEST_ONE,
  ]))

  assert.equal(payload.build, 'absent')
  assert.equal(payload.stop_reason, 'environment_broken',
    'a caller that never reads `error` must still fail safe')
  assert.equal(payload.error.kind, 'command_unknown')
  assert.match(payload.error.message, /build/)
})

test('a failing build is an observed exit, and its output travels as evidence', (t) => {
  const { worktree, base, head } = order(t)
  writeFileSync(join(worktree, 'tools', 'build.mjs'), 'process.exit(3)\n')

  const payload = verify(options({ worktree, base, head }))

  assert.equal(payload.build, 'failed')
  assert.equal(payload.stop_reason, 'completed', 'a broken build is a fact to report')
  assert.match(payload.notes, /exited 3/)
})

// ---------------------------------------------------------------- a measurement that failed

test('a series that could not be read is an error, never an empty findings array', (t) => {
  const { worktree, head } = order(t)

  const payload = verify(options({ worktree, base: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', head }))

  assert.deepEqual(payload.series_findings, [])
  assert.equal(payload.stop_reason, 'environment_broken')
  assert.equal(payload.error.kind, 'series_unreadable',
    'an empty findings array means "checked, found nothing" and must not be reachable any other way')
})

test('a changed test file with no way to run one test escalates instead of skipping it', (t) => {
  const { worktree, base, head } = order(t)

  const payload = verify(parseArgs([
    '--worktree', worktree, '--base', base, '--head', head,
    '--locus', 'src/widget.mjs', '--locus', 'test/widget.test.mjs',
    '--build', BUILD, '--suite', SUITE,
  ]))

  assert.deepEqual(payload.discriminator, [])
  assert.equal(payload.error.kind, 'command_unknown')
  assert.match(payload.error.message, /single-test/)
})

// ---------------------------------------------------------------- the imported log format

test('a checkpoint trailer under an ordinary subject is still a blocking finding', (t) => {
  // The trailer is the load-bearing half of the mark and the subject here is unremarkable, so
  // this only ever fires through lib/commit-series.mjs's own LOG_FORMAT. A log format
  // re-implemented in this file would pass every other test in it and silently lose this one.
  const { worktree, base, head } = order(t, { trailer: 'vfa-checkpoint: ran long' })

  const payload = verify(options({ worktree, base, head }))

  const checkpoint = payload.series_findings.find((f) => f.check === 'checkpoint-commit')
  assert.ok(checkpoint, 'the checkpoint mark reached the findings through the shared format')
  assert.equal(checkpoint.blocking, true)
})

test('a commit outside the declared locus is a blocking finding', (t) => {
  const { worktree, base, head } = order(t)

  const payload = verify(parseArgs([
    '--worktree', worktree, '--base', base, '--head', head,
    '--locus', 'test/widget.test.mjs',
    '--build', BUILD, '--suite', SUITE, '--test-one', TEST_ONE,
  ]))

  const breach = payload.series_findings.find((f) => f.check === 'locus-breach')
  assert.ok(breach)
  assert.match(breach.message, /src\/widget\.mjs/)
})

// ---------------------------------------------------------------- verbatim output

test('suite_output_tail is the suite\'s own last lines, byte for byte', (t) => {
  const { worktree, base, head } = order(t, { implemented: false })

  const payload = verify(options({ worktree, base, head }))

  const direct = spawnSync(SUITE, { cwd: worktree, shell: true, encoding: 'utf8' })
  const expected = ((direct.stdout || '') + (direct.stderr || '')).split('\n').slice(-40).join('\n')

  // Timings differ run to run; the SHAPE and the content that is not a clock must not.
  const scrub = (text) => text.replace(/\(\d+(\.\d+)?ms\)/g, '(Xms)')
    .replace(/duration_ms [\d.]+/g, 'duration_ms X')
  assert.equal(scrub(payload.suite_output_tail), scrub(expected))
  assert.ok(payload.suite_output_tail.split('\n').length <= 40)
})

// ---------------------------------------------------------------- the integration head

test('integration mode measures the merged head and reports honest emptiness', (t) => {
  const { worktree } = order(t)

  const payload = verify(parseArgs([
    '--worktree', worktree, '--mode', 'integration', '--build', BUILD, '--suite', SUITE,
  ]))

  assert.equal(payload.stop_reason, 'completed')
  assert.equal(payload.build, 'passed')
  assert.equal(payload.suite, 'passed')
  assert.deepEqual(payload.series_findings, [])
  assert.deepEqual(payload.discriminator, [])
  assert.match(payload.notes, /merged head/)
})

// ---------------------------------------------------------------- the transport

test('the CLI prints one line whose digest covers the payload it carries', (t) => {
  const { worktree, base, head } = order(t)

  const run = spawnSync(process.execPath, [CLI,
    '--worktree', worktree, '--base', base, '--head', head,
    '--locus', 'src/widget.mjs', '--locus', 'test/widget.test.mjs',
    '--build', BUILD, '--suite', SUITE, '--test-one', TEST_ONE,
  ], { encoding: 'utf8' })

  assert.equal(run.status, 0, 'a payload was printed, which is what this tool produces')
  assert.equal(run.stdout.trim().split('\n').length, 1, 'ONE line, for a courier to paste')

  const parsed = JSON.parse(run.stdout)
  assert.equal(fnv1a(canonical(parsed.payload)), parsed.payload_digest)

  const tampered = { ...parsed.payload, suite: 'absent' }
  assert.notEqual(fnv1a(canonical(tampered)), parsed.payload_digest,
    'a payload that drifted by one field digests differently, which is the whole point')
})

test('a typed error still travels under a digest, and still exits 0', (t) => {
  const dir = repository(t)

  const run = spawnSync(process.execPath, [CLI, '--worktree', dir, '--base', rev(dir, 'HEAD'),
    '--head', rev(dir, 'HEAD'), '--build', BUILD, '--suite', SUITE], { encoding: 'utf8' })

  assert.equal(run.status, 0,
    'a refusal is a measurement outcome, and a non-zero exit would read as the tool failing')
  const parsed = JSON.parse(run.stdout)
  assert.equal(parsed.payload.error.kind, 'main_worktree')
  assert.equal(fnv1a(canonical(parsed.payload)), parsed.payload_digest)
})

test('base64 command transport decodes to the same commands', () => {
  const encoded = Buffer.from('npm run build --workspace "a b"', 'utf8').toString('base64')
  assert.equal(parseArgs(['--build-b64', encoded]).build, 'npm run build --workspace "a b"')
})

// ---------------------------------------------------------------- the journal

test('the observation is journalled by the process that observed it', (t) => {
  const { dir, worktree, base, head } = order(t)
  const runDir = dir + '/run'
  mkdirSync(runDir)

  const run = spawnSync(process.execPath, [CLI,
    '--worktree', worktree, '--base', base, '--head', head,
    '--locus', 'src/widget.mjs', '--locus', 'test/widget.test.mjs',
    '--build', BUILD, '--suite', SUITE, '--test-one', TEST_ONE,
    '--journal', runDir, '--seq', '7', '--order', 'W1', '--branch', BRANCH,
  ], { encoding: 'utf8' })

  const parsed = JSON.parse(run.stdout)
  assert.equal(parsed.payload.journal.written, true)

  const lines = spawnSync(process.execPath, ['-e',
    'process.stdout.write(require("fs").readFileSync(process.argv[1],"utf8"))',
    runDir + '/journal.jsonl'], { encoding: 'utf8' }).stdout.trim().split('\n')

  assert.equal(lines.length, 1)
  const line = JSON.parse(lines[0])
  assert.equal(line.kind, 'verify-observed')
  assert.equal(line.seq, 7, 'the seq is copied from the dispatch, never chosen here')
  assert.equal(line.order, 'W1')
  assert.equal(line.branch, BRANCH)
  assert.equal(line.head_sha, head)
  assert.equal(line.build, 'passed')
  assert.equal(line.suite, 'passed')
  assert.deepEqual(line.discriminator, parsed.payload.discriminator)
  assert.deepEqual(Object.keys(line).sort(), [
    'base_sha', 'branch', 'build', 'discriminator', 'failing_tests', 'head_sha', 'kind',
    'order', 'seq', 'series_findings', 'stop_reason', 'suite', 'worktree',
  ], 'the line shape is increment 7 §4\'s, unchanged')
})

// ---------------------------------------------------------------- the closed pattern set

test('the test-file pattern set recognises the shapes it claims to', () => {
  for (const path of ['test/a.test.mjs', 'tests/b.py', 'src/__tests__/c.js', 'spec/d.rb',
    'lib/e.spec.ts', 'pkg/f_test.go', 'app/test_g.py', 'src/WidgetTest.java']) {
    assert.ok(isTestPath(path), path + ' should read as a test file')
  }
  for (const path of ['src/widget.mjs', 'docs/testing.md', 'latest/thing.js', 'src/protest.c']) {
    assert.ok(!isTestPath(path), path + ' should not read as a test file')
  }
})
