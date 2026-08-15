// lib/independence.mjs — partitions work orders into parallel waves and a coupled set.
//
// Pure core: `partition`. Contract is docs/.../increment-2-develop-review-loop/
// shared/interfaces.md §2 — read that first if this file's behaviour is ever in question.
//
// Two orders are independent iff their loci are disjoint file sets AND neither touches a
// designated shared file. Any order touching a shared file is coupled (routed to the main
// session) and is a member of no wave. The remainder is packed first-fit, in input order:
// an order joins the earliest wave in which it is pairwise independent of every existing
// member of that wave; if none fits, it opens a new wave at the end.
//
// Orders may declare `deps` — ids of orders whose outputs they build on. File-disjoint is
// not the same as build-independent: an order supplying the build manifest or shared
// constants shares no file with its consumers, yet nothing they write can compile until it
// lands. A dep forces the ordering the file test cannot see — an order is packed no earlier
// than the wave after its slowest dependency. A dep on a COUPLED order is refused outright:
// a provider routed to the bucket the pipeline does not execute would leave every consumer
// building against thin air, and that is a defect in the plan worth stopping on before
// anything is dispatched, not a scheduling preference.
//
// Locus and shared-file entries are opaque strings compared by exact equality, after
// normalizing '\' to '/' on both sides. No globbing, no prefix/suffix matching. Dep entries
// are order ids, compared exactly.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Normalize a path-like string for comparison: backslashes to forward slashes. */
function normalize(path) {
  return path.split('\\').join('/')
}

/**
 * Pure. Partition work orders into parallel waves and a coupled set.
 * @param {Array<{id: string, locus: string[], deps?: string[]}>} workOrders
 * @param {string[]} sharedFiles   repo-relative POSIX paths
 * @returns {{ waves: string[][], coupled: string[] }}
 * @throws {TypeError} on duplicate ids, a work order with an empty locus, a dep naming no
 *                     order, a dep on itself, a dependency cycle, or a dep on a coupled
 *                     order (a provider cannot be routed outside the pipeline).
 */
export function partition(workOrders, sharedFiles) {
  const seenIds = new Set()
  for (const order of workOrders) {
    if (seenIds.has(order.id)) {
      throw new TypeError(`partition: duplicate work-order id ${JSON.stringify(order.id)}`)
    }
    seenIds.add(order.id)
    if (order.locus.length === 0) {
      throw new TypeError(`partition: work order ${JSON.stringify(order.id)} has an empty locus`)
    }
  }

  for (const order of workOrders) {
    for (const dep of order.deps || []) {
      if (dep === order.id) {
        throw new TypeError(`partition: work order ${JSON.stringify(order.id)} depends on itself`)
      }
      if (!seenIds.has(dep)) {
        throw new TypeError(
          `partition: work order ${JSON.stringify(order.id)} depends on ` +
          `${JSON.stringify(dep)}, which names no work order`)
      }
    }
  }

  const sharedSet = new Set(sharedFiles.map(normalize))

  // Coupling is decided first, on the shared-file test alone. An order that would also
  // collide with a wave is still coupled, never waved.
  const coupled = []
  const coupledSet = new Set()
  const waved = []

  for (const order of workOrders) {
    if (order.locus.map(normalize).some((path) => sharedSet.has(path))) {
      coupled.push(order.id)
      coupledSet.add(order.id)
    } else {
      waved.push(order)
    }
  }

  // A provider the pipeline will never execute cannot precede anything, so this is a stop
  // condition rather than a bucket assignment: either the provider does not belong in
  // shared_files, or its consumers belong with it in the session — the planner decides,
  // before a wave of work is dispatched against a prerequisite that never lands.
  for (const order of waved) {
    for (const dep of order.deps || []) {
      if (coupledSet.has(dep)) {
        throw new TypeError(
          `partition: work order ${JSON.stringify(order.id)} depends on ` +
          `${JSON.stringify(dep)}, which is coupled — a dependency cannot be routed to the ` +
          `session bucket its consumers do not wait for; narrow shared_files or restructure ` +
          `the plan`)
      }
    }
  }

  // Pack in dependency order, breaking ties by input position, so an order is placed only
  // after every dep has a wave. Each order's floor is the wave after its slowest dep; from
  // the floor down the wave list it is first-fit exactly as before. The selection scans the
  // input left to right, so with no deps declared this reduces to plain input order.
  const waves = [] // Array<{ ids: string[], touched: Set<string> }> — internal bookkeeping only.
  const waveIndexOf = new Map()
  const placed = new Set()

  while (placed.size < waved.length) {
    const next = waved.find((order) =>
      !placed.has(order.id) && (order.deps || []).every((dep) => waveIndexOf.has(dep)))

    if (!next) {
      const stuck = waved.filter((o) => !placed.has(o.id)).map((o) => o.id)
      throw new TypeError(`partition: dependency cycle involving ${stuck.join(', ')}`)
    }

    const normLocus = next.locus.map(normalize)
    const floor = (next.deps || []).reduce((f, dep) => Math.max(f, waveIndexOf.get(dep) + 1), 0)

    let index = -1
    for (let w = floor; w < waves.length; w++) {
      if (normLocus.every((path) => !waves[w].touched.has(path))) {
        index = w
        break
      }
    }
    if (index === -1) {
      waves.push({ ids: [], touched: new Set() })
      index = waves.length - 1
    }

    waves[index].ids.push(next.id)
    for (const path of normLocus) waves[index].touched.add(path)
    waveIndexOf.set(next.id, index)
    placed.add(next.id)
  }

  // Within a wave, ids appear in input order (ruling 1) whatever order dependency
  // resolution placed them in.
  const inputIndex = new Map(workOrders.map((order, i) => [order.id, i]))
  return {
    waves: waves.map((w) => [...w.ids].sort((a, b) => inputIndex.get(a) - inputIndex.get(b))),
    coupled,
  }
}

// `import.meta.main` is undefined before Node 24.2; the argv comparison keeps the CLI
// alive there — a silently no-op CLI would hand the planner empty stdout to paste.
const isMain = import.meta.main ??
  (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)

if (isMain) {
  try {
    const inputPath = process.argv[2]
    const { work_orders, shared_files } = JSON.parse(readFileSync(inputPath, 'utf8'))
    console.log(JSON.stringify(partition(work_orders, shared_files)))
    process.exit(0)
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }))
    process.exit(1)
  }
}
