// test/independence.test.mjs — pins the partition contract of
// docs/.../increment-2-develop-review-loop/shared/interfaces.md §2.
//
// What §2 fixes, and therefore what this file asserts:
//   - Two orders are independent iff their loci are disjoint AND neither touches a
//     designated shared file. Any order touching a shared file is coupled.
//   - Wave packing is first-fit in input order: an order joins the EARLIEST wave in
//     which it is pairwise independent of EVERY member of that wave.
//   - `waves` never contains an empty wave; `coupled` preserves input order.
//   - Path comparison is exact string equality after normalizing `\` to `/`. No globbing,
//     no prefix matching, no directory semantics.
//   - Locus and shared-file entries are OPAQUE STRINGS. A non-file sentinel such as
//     `__editor__` is a valid designated shared resource and needs no special handling.
//   - Duplicate ids and an empty locus throw `TypeError`.
//   - The function is pure: it does not mutate its arguments and holds no state.
//
// Why this matters downstream: the partition decides which work orders are implemented
// concurrently in isolated worktrees and which are routed to the main session. Getting it
// wrong does not fail loudly — it produces either silent file conflicts between parallel
// coders or needless serialization.
//
// DELIBERATELY NOT PINNED (open spec questions, escalated rather than guessed — do not
// read the absence of these assertions as permission to do anything in particular):
//   - Order of ids WITHIN a single wave. §2 states "input order preserved" for `coupled`
//     but says nothing for waves. Every fixture below whose wave holds two or more ids is
//     arranged so input order and id order agree, so both readings pass.
//   - Case sensitivity. "Exact string equality" is case-sensitive, but `src/A.js` and
//     `src/a.js` are the same file on Windows and macOS.
//   - Whether a designated shared file that appears in NO locus is an error, a warning, or
//     a no-op. Every shared file in every fixture below appears in at least one locus.
//   - Whether a path repeated within a single order's own locus is legal, deduped, or a
//     TypeError.
//   - The wording of any thrown message, and behaviour for malformed input beyond the two
//     documented throw conditions (missing `locus`, non-array `locus`, missing
//     `sharedFiles` argument, non-string entries).
//   - The CLI wrapper. Conventions say only the pure core is unit-tested; the CLI is
//     smoke-tested at T03b and exercised end-to-end at T11.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partition } from '../lib/independence.mjs'

/** A minimal work order. §2 types the parameter structurally as `{id, locus}`. */
const wo = (id, ...locus) => ({ id, locus })

// --- required case 1: disjoint loci share a wave -----------------------------------------

test('two orders with disjoint loci land in one wave', () => {
  const out = partition([wo('W1', 'src/a.js'), wo('W2', 'src/b.js')], [])

  assert.deepEqual(out, { waves: [['W1', 'W2']], coupled: [] })
})

// --- required case 2: one overlapping path splits the wave -------------------------------

test('two orders sharing one path land in consecutive waves', () => {
  // The loci are not identical — they collide on exactly one entry, which is enough.
  const out = partition(
    [wo('W1', 'src/a.js', 'src/shared.js'), wo('W2', 'src/b.js', 'src/shared.js')],
    [],
  )

  assert.deepEqual(out, { waves: [['W1'], ['W2']], coupled: [] })
})

// --- required case 3: a designated shared file couples the order -------------------------

test('an order touching a designated shared file is coupled and appears in no wave', () => {
  // W1 collides with nothing; it is coupled purely because config.js is designated.
  const out = partition(
    [wo('W1', 'src/config.js'), wo('W2', 'src/a.js')],
    ['src/config.js'],
  )

  assert.deepEqual(out, { waves: [['W2']], coupled: ['W1'] })
})

// --- required case 4: normalization on the locus side ------------------------------------

test('a locus written with backslashes matches a shared file written with slashes', () => {
  // A planner on Windows can emit either separator. Comparing raw strings leaves the order
  // in a wave, and a parallel coder then edits a designated shared file.
  const out = partition([wo('W1', 'src\\a.js')], ['src/a.js'])

  assert.deepEqual(out, { waves: [], coupled: ['W1'] })
})

// --- required case 5: first-fit, checked against every member ----------------------------

test('an order colliding with the first wave member opens the next wave', () => {
  // W3 is disjoint from W2 (the most recently added member) but collides with W1. An
  // implementation that only compares against the last member packs W3 into wave 1.
  const out = partition(
    [wo('W1', 'src/a.js'), wo('W2', 'src/b.js'), wo('W3', 'src/a.js', 'src/c.js')],
    [],
  )

  assert.deepEqual(out, { waves: [['W1', 'W2'], ['W3']], coupled: [] })
})

// --- required case 6: empty input ---------------------------------------------------------

test('no work orders yields no waves and no coupled ids', () => {
  // Not `{ waves: [[]], coupled: [] }` — §2 says waves never contains an empty wave.
  const out = partition([], [])

  assert.deepEqual(out, { waves: [], coupled: [] })
})

// --- required case 7: a single work order -------------------------------------------------

test('a single work order occupies one wave', () => {
  const out = partition([wo('W1', 'src/a.js', 'src/b.js')], [])

  assert.deepEqual(out, { waves: [['W1']], coupled: [] })
})

// --- required case 8: duplicate ids --------------------------------------------------------

test('duplicate ids throw a TypeError', () => {
  // Ids are the workflow's handle on every worktree, branch, and review trail. Two orders
  // answering to 'W1' silently collapse the run's bookkeeping.
  assert.throws(
    () => partition([wo('W1', 'src/a.js'), wo('W1', 'src/b.js')], []),
    TypeError,
  )
})

// --- required case 9: empty locus ----------------------------------------------------------

test('an empty locus throws a TypeError', () => {
  // An order that declares no files is independent of everything, so it would silently
  // pack into wave 1 and then breach its locus on its first edit.
  assert.throws(() => partition([wo('W1')], []), TypeError)
})

// --- required case 10: coupled preserves input order ---------------------------------------

test('coupled preserves input order across several coupled orders', () => {
  // Ids are deliberately NOT in ascending order: sorting by id, or grouping by which
  // shared file was touched, both produce ['W2', 'W3'] instead.
  const out = partition(
    [
      wo('W3', 'src/types.d.ts'),
      wo('W1', 'src/a.js'),
      wo('W2', 'src/config.js', 'src/b.js'),
      wo('W4', 'src/c.js'),
    ],
    ['src/config.js', 'src/types.d.ts'],
  )

  assert.deepEqual(out, { waves: [['W1', 'W4']], coupled: ['W3', 'W2'] })
})

// --- wave packing: the parts first-fit actually means ---------------------------------------

test('a wave member in the middle of the wave still blocks a later order', () => {
  // W4 collides with W2 only. Comparing against the first member, or against the last,
  // both put W4 in wave 1 alongside the order it conflicts with.
  const out = partition(
    [wo('W1', 'src/a.js'), wo('W2', 'src/b.js'), wo('W3', 'src/c.js'), wo('W4', 'src/b.js')],
    [],
  )

  assert.deepEqual(out, { waves: [['W1', 'W2', 'W3'], ['W4']], coupled: [] })
})

test('an order rejected by wave 1 joins an existing later wave rather than opening a new one', () => {
  // W4 collides with wave 1 (via W3) but is independent of wave 2. First-fit means it
  // backfills wave 2. An implementation that opens a fresh wave on every collision, or
  // that only ever appends to the newest wave, produces three waves here.
  const out = partition(
    [wo('W1', 'src/a.js'), wo('W2', 'src/a.js'), wo('W3', 'src/b.js'), wo('W4', 'src/b.js')],
    [],
  )

  assert.deepEqual(out, { waves: [['W1', 'W3'], ['W2', 'W4']], coupled: [] })
})

// --- coupling wins over, and is removed before, wave packing --------------------------------

test('an order that both collides and touches a shared file is coupled, not waved', () => {
  // W2 overlaps W1 AND touches config.js. Coupling is not a fallback for orders that
  // happen to fit nowhere — it is decided first, on the shared-file test alone.
  const out = partition(
    [wo('W1', 'src/a.js'), wo('W2', 'src/a.js', 'src/config.js'), wo('W3', 'src/b.js')],
    ['src/config.js'],
  )

  assert.deepEqual(out, { waves: [['W1', 'W3']], coupled: ['W2'] })
})

test('an order colliding only with a coupled order still lands in wave 1', () => {
  // W2 overlaps W1, but W1 is coupled and is therefore a member of no wave — so W2 is
  // pairwise independent of every member of wave 1, which is empty when it arrives.
  // An implementation that packs everything and then strips the coupled ids afterwards
  // leaves W2 stranded in a second wave (and can emit an empty wave doing it).
  const out = partition(
    [wo('W1', 'src/config.js', 'src/a.js'), wo('W2', 'src/a.js'), wo('W3', 'src/b.js')],
    ['src/config.js'],
  )

  assert.deepEqual(out, { waves: [['W2', 'W3']], coupled: ['W1'] })
})

test('when every order is coupled, waves is empty rather than holding an empty wave', () => {
  const out = partition(
    [wo('W1', 'src/config.js', 'src/a.js'), wo('W2', 'src/config.js', 'src/b.js')],
    ['src/config.js'],
  )

  assert.deepEqual(out, { waves: [], coupled: ['W1', 'W2'] })
})

// --- path normalization applies to the comparison, so to both operands -----------------------

test('a shared file written with backslashes matches a POSIX locus entry', () => {
  // §2 makes normalization a property of the comparison, not of one side of it.
  const out = partition([wo('W1', 'src/a.js'), wo('W2', 'src/b.js')], ['src\\a.js'])

  assert.deepEqual(out, { waves: [['W2']], coupled: ['W1'] })
})

test('two loci are compared after normalization, not raw', () => {
  // No shared files at all here — this is the order-versus-order disjointness test.
  // Normalizing only when checking sharedFiles puts these two in the same wave, and two
  // coders then edit src/a.js concurrently in separate worktrees.
  const out = partition([wo('W1', 'src\\a.js'), wo('W2', 'src/a.js')], [])

  assert.deepEqual(out, { waves: [['W1'], ['W2']], coupled: [] })
})

// --- exact equality: no globbing, no prefixes, no suffixes ------------------------------------

test('shared-file matching is exact, not prefix, suffix, or substring', () => {
  // W2 ends with the shared path; W3 starts with it. Neither is src/config.js.
  const out = partition(
    [wo('W1', 'src/config.js'), wo('W2', 'lib/src/config.js'), wo('W3', 'src/config.js.bak')],
    ['src/config.js'],
  )

  assert.deepEqual(out, { waves: [['W2', 'W3']], coupled: ['W1'] })
})

test('locus overlap is exact — one path merely prefixing another is not a collision', () => {
  const out = partition([wo('W1', 'src/a.js'), wo('W2', 'src/a.js.map')], [])

  assert.deepEqual(out, { waves: [['W1', 'W2']], coupled: [] })
})

// --- opaque strings: non-file sentinels are ordinary shared resources -------------------------

test('a designated non-file sentinel couples the order that declares it', () => {
  // §2: increment 4 designates `__editor__` for the editor-bound tree. Exact equality
  // already routes it; an implementation that tries to look like a path (checking for a
  // dot, an extension, a separator) drops the sentinel on the floor.
  const out = partition(
    [wo('W1', 'src/a.js', '__editor__'), wo('W2', 'src/b.js')],
    ['__editor__'],
  )

  assert.deepEqual(out, { waves: [['W2']], coupled: ['W1'] })
})

test('two orders declaring the same sentinel are not independent', () => {
  // Nothing is designated shared here, so the sentinel is just a resource both orders
  // claim — which makes their loci non-disjoint.
  const out = partition(
    [wo('W1', '__editor__', 'src/a.js'), wo('W2', '__editor__', 'src/b.js')],
    [],
  )

  assert.deepEqual(out, { waves: [['W1'], ['W2']], coupled: [] })
})

// --- validation is unconditional and covers the whole input -----------------------------------

test('an empty locus on a later order throws, not just one on the first', () => {
  assert.throws(
    () => partition([wo('W1', 'src/a.js'), wo('W2'), wo('W3', 'src/b.js')], []),
    TypeError,
  )
})

test('non-adjacent duplicate ids throw even when the duplicates would be coupled', () => {
  // Comparing only consecutive orders misses this; so does validating only the orders
  // that survive the shared-file split.
  assert.throws(
    () => partition(
      [wo('W1', 'src/config.js'), wo('W2', 'src/b.js'), wo('W1', 'src/config.js', 'src/c.js')],
      ['src/config.js'],
    ),
    TypeError,
  )
})

test('the thrown TypeError carries a non-empty message', () => {
  // `throw new TypeError()` satisfies the type check and tells the planner nothing.
  // The wording is deliberately not pinned.
  assert.throws(
    () => partition([wo('W1', 'src/a.js'), wo('W1', 'src/b.js')], []),
    (err) => {
      assert.ok(err instanceof TypeError)
      assert.equal(typeof err.message, 'string')
      assert.ok(err.message.trim().length > 0, 'TypeError message was empty')
      return true
    },
  )
})

// --- purity ------------------------------------------------------------------------------------

test('partition does not mutate its arguments', () => {
  // The caller (T05/T09) reuses the same work-order objects for dispatch, and
  // `partition_raw` is pasted verbatim into the planner's output. Normalizing separators
  // in place would rewrite the loci the coders are later held to.
  const orders = [
    { id: 'W1', locus: ['src\\a.js', 'src/config.js'] },
    { id: 'W2', locus: ['src/b.js'] },
  ]
  const sharedFiles = ['src/config.js']
  const ordersBefore = structuredClone(orders)
  const sharedBefore = structuredClone(sharedFiles)

  partition(orders, sharedFiles)

  assert.deepEqual({ orders, sharedFiles }, { orders: ordersBefore, sharedFiles: sharedBefore })
})

test('partition is deterministic — the same input gives the same answer whatever ran before it', () => {
  // Conventions: no module-level mutable state. A cached wave list or a shared `seen` set
  // that survives between calls poisons the second run of a session.
  const orders = [wo('W1', 'src/a.js'), wo('W2', 'src/a.js'), wo('W3', 'src/b.js')]
  const first = partition(orders, [])

  partition([wo('W1', 'src/config.js'), wo('W9', 'src/z.js')], ['src/config.js'])
  partition([], [])

  assert.deepEqual(partition(orders, []), first)
})

test('work-order fields beyond id and locus are ignored', () => {
  // §1 work orders also carry title, acceptance, and context; the same objects reach
  // partition unchanged.
  const out = partition(
    [
      {
        id: 'W1',
        title: 'Add the parser',
        locus: ['src/a.js'],
        acceptance: ['it parses'],
        context: 'background',
      },
      wo('W2', 'src/b.js'),
    ],
    [],
  )

  assert.deepEqual(out, { waves: [['W1', 'W2']], coupled: [] })
})
