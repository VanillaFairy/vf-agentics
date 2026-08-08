# Spec decisions — increment 2

Ambiguities the RED test authors (T03a, T04a) refused to resolve on their own, ratified here
by the supervisor before the GREEN tasks ran. Surfacing these instead of silently picking an
answer is the whole point of the red/green split — a test author who guesses turns its guess
into the specification.

Where a decision changes an authoritative contract, the contract file was edited and the edit
is named below. Everything else is recorded so the auditors (T03c, T04c) can tell a deliberate
choice from an oversight.

---

## Contract change: the `wip-subject` regex was wrong

`shared/interfaces.md` §3 specified:

```js
/^(wip|fixup!|squash!|temp|tmp)\b/i
```

That regex cannot match `fixup! x`. `\b` asserts a word boundary, which needs a word character
on exactly one side; after the `!` the next character is a space, so both sides are non-word
and the assertion fails. Same for `squash! rework`. But T04a's task file requires `fixup! x`
to be flagged, so the contract and the required behaviour contradicted each other. Verified:

| subject | old regex | new regex | required |
|---|---|---|---|
| `WIP: stuff` | ✅ | ✅ | flag |
| `fixup! x` | ❌ | ✅ | flag |
| `squash! rework the parser` | ❌ | ✅ | flag |
| `tmp thing` | ✅ | ✅ | flag |
| `wipe stale cache entries` | ✅ clean | ✅ clean | clean |
| `template rendering for the report` | ✅ clean | ✅ clean | clean |

**Decision:** §3 now reads `/^(wip\b|fixup!|squash!|temp\b|tmp\b)/i` — the boundary moves
inside the alternatives that need it. `squash! rework the parser` **does** flag.

Deliberately *not* solved by deleting `\b` outright: that would flag `template rendering` and
`wipe stale cache`, which the tests require to stay clean.

---

## `lib/independence.mjs` (T03a's questions)

1. **Within-wave id order** — **input order, and it is contract.** Revised after review: the
   first ruling left this free, which was wrong. T03b's own acceptance criteria require the CLI
   smoke test to print exactly `{"waves":[["W1","W2"]],"coupled":[]}` — a byte-exact stdout
   assertion that pins within-wave order regardless of what this document says. And §1 has the
   planner paste `partition_raw` as verbatim CLI stdout for the workflow to `JSON.parse`, so a
   stable, deterministic ordering is load-bearing rather than incidental. `interfaces.md` §2 now
   states it explicitly. T03a's tests assert it, which makes them correct rather than
   over-pinned.
2. **Case sensitivity** — comparison stays **case-sensitive**, exactly as §2 says ("exact string
   equality after normalizing `\` to `/`"). See the hazard note below.
3. **A designated shared file appearing in no locus** — silent no-op. The `@throws` list is
   exhaustive; an unreferenced shared file constrains nothing.
4. **A path repeated inside one order's own locus** — legal, and not deduped. T03b is explicitly
   forbidden from deduping caller data, and `@throws` does not cover it. It has no effect:
   partition returns ids, never loci.
5. **Malformed input beyond the two documented throws** (missing `locus`, non-array `locus`,
   non-string entries) — undefined behaviour, deliberately unpinned. A natural implementation
   throws anyway, and the CLI converts any throw into `{"error": …}` with exit 1, which is the
   loud failure IRON LAW §4 wants. Not required, not forbidden.
6. **TypeError message wording** — free. Only `instanceof TypeError` plus a non-empty message is
   contract. Nothing parses the text.
7. **Empty `workOrders` with non-empty `sharedFiles`** — `{ waves: [], coupled: [] }`, following
   from case 6. Not separately pinned.

**Both of T03a's flagged judgment calls are confirmed correct**, and both are compelled by the
contract rather than chosen:
- Normalizing the `sharedFiles` side too — §2 makes normalization a property of *the comparison*,
  and T03b's own constraints say "in both loci and shared files."
- Splitting coupled orders off *before* wave packing — a coupled order is "in no wave", so it can
  never be a wave member. Packing-then-filtering would strand orders and can emit an empty wave,
  which §2 forbids.

---

## `lib/commit-series.mjs` (T04a's questions)

1. **`fixup!` / `squash!`** — resolved by the contract change above.
2. **Finding order** — *not* part of the contract, within a commit or across commits. Consumers
   must not depend on it. T04a's tests sort before asserting, which is correct.
3. **One commit breaching on several files** — **one finding per offending file**. Each finding
   carries a single `message` that names its file, and per-file findings are what an author can
   act on. Repeated `check` ids on one sha are fine; findings are a list.
4. **Is 72 flagged?** — no. "Longer than 72" means 72 is clean, 73 flags. T04a pinned this
   correctly.
5. **`and-subject` case sensitivity** — case-**sensitive**, the literal reading of "contains
   `' and '`". It is advisory and crude by design; a missed `And` costs nothing.
6. **Empty locus `[]`** — **every file breaches.** The locus enumerates every file an order may
   touch, so an empty one permits nothing. The opposite reading ("no constraint") would silently
   disable the fence, which is the one failure this check exists to prevent. Note that
   `partition` throws on an empty locus, so this path is defensive.
7. **Case-folded locus paths** — no, case-sensitive, consistent with §2. See the hazard note.
8. **A locus entry standing for a directory** — no. Exact equality only, no globbing and no
   directory-prefix matching, same as §2. `lib/` does **not** cover `lib/parser.mjs`.
9. **Does `empty-commit` suppress subject checks?** — no. Checks are independent and compose; an
   empty commit titled `WIP: stuff` yields two findings.
10. **Does `parseLog` normalize separators?** — no. `parseLog` is a pure parser and returns paths
    exactly as git emitted them. Normalization belongs to `analyzeSeries` at comparison time.
11. **What is a file-path line?** — any non-empty line after the record header, with no trimming
    (`line !== ''`). Real git output never emits whitespace-only lines here.
12. **`subject-length` units** — JS `String.length`, i.e. UTF-16 code units. The natural reading.

---

## Known hazard, accepted deliberately: case-sensitive path comparison

Both modules compare paths case-sensitively, because §2 says "exact string equality" and the
plugin's contracts are built on it. On Windows and macOS — where this plugin actually runs —
`src/A.js` and `src/a.js` are the *same file on disk* but different strings. Two work orders
whose loci differ only in case would be judged independent, and two coders could then edit one
file in parallel worktrees.

This is recorded rather than fixed: changing it means changing the independence contract itself,
which is a design decision beyond this increment's scope, and no planner in practice emits loci
that differ only by case. Worth revisiting if a real collision ever appears.
