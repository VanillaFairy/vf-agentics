// lib/ledger.mjs — the only writer of a run's durable records, and the reader that hands an
// agent one work order without a model in the middle.
//
// Contract: docs/superpowers/specs/2026-08-27-increment-9-contracts.md §1 and §2.
//
// Why a CLI at all. A workflow script has no filesystem, so every byte that crosses between
// disk and the script has to ride an agent — and an agent's OUTPUT is where corruption lives.
// On 2026-08-20 a recorder handed an exact `JSON.stringify` line to append un-escaped the
// Windows paths while typing the Bash command, and five of one run's ten state lines landed as
// invalid JSON. Which lines broke depended on which form of the path that dispatch happened to
// receive: non-deterministic corruption of the one file whose whole purpose is surviving a run
// that dies.
//
// The fix is not a better-instructed recorder. It is to make the append refuse a line it cannot
// prove intact: the caller mints the line, digests it, and hands the agent both. This CLI
// recomputes the digest over what actually arrived and writes only on a match. An agent can
// still mangle the copy — one will — but a mangled copy now bounces with a named reason instead
// of landing quietly. Corruption becomes impossible at rest, at the cost of being loud in
// transit, which is the trade the ledger always wanted.
//
// `order` is the same principle read backwards. Bulk plan content used to travel disk → courier
// → workflow → coder, paraphrasing at every hop; a coder that runs this itself gets the order
// byte-exact through a tool result, which is the one direction that cannot corrupt.

import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonical, digestOrder, fnv1a } from './plan-digest.mjs'

/** The two append-only files, and what each one is for. */
export const FILES = {
  // What the WORKFLOW decided: approvals, escalations, wave outcomes.
  state: 'state.jsonl',
  // What an AGENT observed, appended by that agent in the dispatch that observed it.
  journal: 'journal.jsonl',
}

/**
 * Pure. The digest a ledger line travels under.
 *
 * The same canonical form the plan manifest uses, so there is one serialization in this plugin
 * and not two. Key order is normalized, which matters here for the same reason it matters
 * there: a model re-emitting an object may reorder its keys, and that changes nothing about the
 * record and must not read as damage.
 * @param {object} entry
 * @returns {string}
 */
export const digestEntry = (entry) => fnv1a(canonical(entry))

/**
 * Pure. What is wrong with a line about to be appended, or null when nothing is.
 *
 * Deliberately thin. This is a transport check, not a schema: it verifies the two fields every
 * reader in the plugin indexes on, and leaves the rest alone. A CLI that validated the full
 * shape of every record kind would reject a line written by a newer version of the workflow
 * against an older installed lib — turning a forward-compatible append into a lost record,
 * which is the exact damage this file exists to prevent, arriving from the other side.
 * @param {unknown} entry
 * @returns {string|null}
 */
export function entryProblem(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return 'a ledger line must be a JSON object'
  }
  if (typeof entry.kind !== 'string' || entry.kind === '') {
    return 'a ledger line must carry a non-empty "kind"'
  }
  // Not `|| 0`. A line with no seq cannot be ordered against the other file, and a resume that
  // silently supplied one would be inventing this run's history rather than reading it. The
  // caller mints seq; a line arriving without one did not come from the caller intact.
  if (!Number.isInteger(entry.seq)) {
    return 'a ledger line must carry an integer "seq" — it is minted by the caller and copied, never chosen'
  }
  return null
}

/**
 * Decode a base64 payload back to the line it carries.
 *
 * The transport of last resort, and the reason it exists: a heredoc is still SHELL SYNTAX, so
 * the line inside it can be broken by things that have nothing to do with the agent's care —
 * a Windows path's backslashes, an apostrophe in a test name, a delimiter that arrived indented
 * because an editor reflowed the command. Base64 has no metacharacters at all. One opaque token
 * goes on one argv slot, and there is nothing in it for a shell to interpret.
 *
 * Field evidence for the upgrade: run 20260829-140744 lost its wave-1 line and every
 * order-escalated line to a digest mismatch that survived three attempts by the recorder, while
 * every journal line written by the working agents themselves landed. The difference was the
 * transport, not the writer.
 *
 * `Buffer.from(_, 'base64')` ignores characters outside the alphabet, so a mangled token does
 * not throw here — it decodes to something else, fails JSON.parse or the digest check, and is
 * refused with a named reason. That is the correct layering: this function decodes, and the two
 * checks that already exist decide whether what came out is trustworthy.
 */
const decodeB64 = (token) => {
  try {
    return Buffer.from(String(token), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

/**
 * Append one verified line. Returns `{ ok, path, digest }` or `{ ok: false, error }`.
 *
 * Append, never read-then-write. A rewrite has a window where the file is truncated, and a run
 * that dies inside it loses every line rather than one. `appendFileSync` creates the file when
 * it is absent, so there is no case that needs a read first.
 *
 * The line is re-serialized here rather than written as it arrived. Whatever whitespace or key
 * order the transport introduced, what lands on disk is one canonical line of JSON that the
 * tolerant readers cannot trip over.
 *
 * @param {string} runDir absolute path to the run directory
 * @param {'state'|'journal'} file
 * @param {string} raw the line as it arrived
 * @param {string} expected the digest the caller minted
 */
export function appendLine(runDir, file, raw, expected) {
  const name = FILES[file]
  if (!name) return { ok: false, error: 'unknown ledger file: ' + file }

  let entry
  try {
    entry = JSON.parse(raw)
  } catch (err) {
    return { ok: false, error: 'the line is not JSON (' + err.message + ') — it did not survive transcription' }
  }

  const problem = entryProblem(entry)
  if (problem) return { ok: false, error: problem }

  const actual = digestEntry(entry)
  if (expected && actual !== expected) {
    return {
      ok: false,
      error: 'digest mismatch: the caller minted ' + expected + ', this line digests to ' +
        actual + ' — something changed between there and here, so it is refused rather than ' +
        'written. Copy the object again, exactly as it was handed to you.',
    }
  }

  const path = join(runDir, name)
  try {
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8')
  } catch (err) {
    return { ok: false, error: 'the append failed: ' + err.message }
  }

  return { ok: true, path, digest: actual }
}

/**
 * One work order, read straight off disk, with the digest recomputed over it.
 *
 * The digest travels back so its consumer can confirm the order it is about to implement is the
 * order the plan was ratified with — `plan.json` is a file on a disk somebody can edit, and a
 * pinned digest is the difference between reading a plan and reading THE plan.
 *
 * A miss returns the ids that are there. Never a nearest match: a near-miss id is how one
 * order's context lands under another order's name.
 */
export function readOrder(runDir, id) {
  let plan
  try {
    plan = JSON.parse(readFileSync(join(runDir, 'plan.json'), 'utf8'))
  } catch (err) {
    return { error: 'plan.json could not be read: ' + err.message }
  }

  const orders = Array.isArray(plan.work_orders) ? plan.work_orders : []
  const order = orders.find((wo) => wo && wo.id === id)

  if (!order) {
    return { error: 'no work order with id ' + JSON.stringify(id), ids: orders.map((wo) => wo && wo.id) }
  }

  return { order, digest: digestOrder(order) }
}

/**
 * The run's settled-evidence payload, whole.
 *
 * It is the largest string in the envelope and the one every coder needs verbatim, which is
 * precisely the combination that made it a transcription hazard while it travelled through the
 * workflow. Fetched here it travels disk → tool result and cannot be paraphrased.
 */
export function readNotes(runDir) {
  try {
    const plan = JSON.parse(readFileSync(join(runDir, 'plan.json'), 'utf8'))
    return { caller_notes: typeof plan.caller_notes === 'string' ? plan.caller_notes : '' }
  } catch (err) {
    return { error: 'plan.json could not be read: ' + err.message }
  }
}

/** Everything after `--name`, or '' when the flag is absent. */
const flag = (argv, name) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : ''
}

const readStdin = () => {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/**
 * The line's own bytes, from a FILE or from an argv token or from stdin.
 *
 * base64 on one argv slot has a ceiling nothing about the encoding can lift: a command line is
 * finite, and Windows caps a process's at 8191 characters. `lib/kb.mjs` hit exactly that in run
 * 20260902-124933 and grew `--b64-file`; the state ledger did not, and in the same run seven
 * merges that genuinely happened went unrecorded when their line came back refused. A wave line
 * is as large as the wave was interesting — the merged ids, the escalated ids, and every
 * discovery the wave's coders reported.
 *
 * A path is short whatever the line weighs, and reading it is the safe direction: a file's bytes
 * reach this process without crossing a model at all. `--b64` stays for small lines and for
 * every caller already written against it; when both are given the file wins, because it is the
 * one that cannot have been truncated on the way in.
 */
const lineBytes = (argv) => {
  const path = flag(argv, 'b64-file')
  if (path) return decodeB64(readFileSync(path, 'utf8').trim())

  const token = flag(argv, 'b64')
  return token ? decodeB64(token) : readStdin()
}

// The CLI, guarded the way this plugin's other libs are. `import.meta.main` is undefined before
// Node 24.2; the argv comparison keeps the CLI alive there — a silently no-op ledger would tell
// every agent its record was written while nothing reached the disk.
const isMain = import.meta.main ??
  (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)

if (isMain) {
  try {
    const [command, runDir, ...rest] = process.argv.slice(2)

    if (command === 'append') {
      // --b64 (or --b64-file, for a line too long for one command line) when the caller could
      // encode the line — the workflow mints state lines whole; stdin when it could not, a
      // journal line being filled in by the agent that observed it, so there is nothing to
      // encode ahead of time. All three end in the same two checks.
      const out = appendLine(runDir, flag(process.argv, 'file') || 'state',
        lineBytes(process.argv), flag(process.argv, 'digest'))
      console.log(JSON.stringify(out))
      process.exit(out.ok ? 0 : 1)
    }

    if (command === 'order') {
      const out = readOrder(runDir, rest[0])
      console.log(JSON.stringify(out))
      process.exit(out.error ? 1 : 0)
    }

    if (command === 'notes') {
      const out = readNotes(runDir)
      console.log(JSON.stringify(out))
      process.exit(out.error ? 1 : 0)
    }

    throw new Error('unknown command ' + JSON.stringify(command || '') +
      ' — expected append, order or notes')
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }))
    process.exit(1)
  }
}
