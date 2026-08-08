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
// Locus and shared-file entries are opaque strings compared by exact equality, after
// normalizing '\' to '/' on both sides. No globbing, no prefix/suffix matching.

import { readFileSync } from 'node:fs'

/** Normalize a path-like string for comparison: backslashes to forward slashes. */
function normalize(path) {
  return path.split('\\').join('/')
}

/**
 * Pure. Partition work orders into parallel waves and a coupled set.
 * @param {Array<{id: string, locus: string[]}>} workOrders
 * @param {string[]} sharedFiles   repo-relative POSIX paths
 * @returns {{ waves: string[][], coupled: string[] }}
 * @throws {TypeError} on duplicate ids or a work order with an empty locus.
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

  const sharedSet = new Set(sharedFiles.map(normalize))

  const coupled = []
  const waves = [] // Array<{ ids: string[], touched: Set<string> }> — internal bookkeeping only.

  for (const order of workOrders) {
    const normLocus = order.locus.map(normalize)

    if (normLocus.some((path) => sharedSet.has(path))) {
      coupled.push(order.id)
      continue
    }

    const wave = waves.find((w) => normLocus.every((path) => !w.touched.has(path)))
    if (wave) {
      wave.ids.push(order.id)
      for (const path of normLocus) wave.touched.add(path)
    } else {
      waves.push({ ids: [order.id], touched: new Set(normLocus) })
    }
  }

  return { waves: waves.map((w) => w.ids), coupled }
}

if (import.meta.main) {
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
