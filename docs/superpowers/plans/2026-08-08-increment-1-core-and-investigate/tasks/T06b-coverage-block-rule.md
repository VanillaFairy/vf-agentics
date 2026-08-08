# Task T06b: Coverage-block rule — IMPLEMENTATION

**Role:** `green` — you make the locked tests pass. **You write no tests.**

## References
- Read: `test/coverage-block.test.mjs` — **the locked spec, authored by T06a**
- Read: `../shared/interfaces.md` — §1 rule contract, §5 the coverage block
- Read: `../knowledge/iron-law.md` — §4
- Read: `../knowledge/run-tests.md`
- Read: `../knowledge/run-lint.md`

## Dependencies
- Depends on: T06a (authored the tests)
- Depended on by: T06c (audits your work), T15

## Scope
**Files:**
- Create: `tools/rules/coverage-block.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Negative Constraints (DO NOT)
- **Do NOT modify `test/coverage-block.test.mjs`** — it was authored by T06a and is locked. If a
  test is wrong, **escalate**; never edit it, never delete it, never `skip` it.
- Do NOT add a parser dependency. This repo has none.
- Do NOT implement "every return must carry coverage". T06a's tests deliberately pin the weaker
  rule; the stronger one needs a real parser and is covered by review at T18.
- Do NOT touch the filesystem inside `check`.

## Algorithm

The only hard part is distinguishing real source from the enormous prompt strings that make up
most of a workflow script. Strip those first, then the rest is straightforward.

**Step A — blank out strings and comments.** Replace the *contents* of every string literal,
template literal, line comment, and block comment with spaces, preserving length and newlines so
line numbers stay correct. Keep the delimiters. Template interpolations (`${…}`) are blanked
along with the rest of the template — the code inside them cannot contain the workflow's return.

Use this helper verbatim; it is mechanical and getting it subtly wrong costs hours:

```js
/**
 * Replace the contents of strings and comments with spaces, preserving length and
 * newlines so line numbers survive. Delimiters are kept so brace scanning still sees
 * balanced structure outside them.
 */
function blankStringsAndComments(source) {
  const out = source.split('')
  let i = 0
  const n = source.length

  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }

  while (i < n) {
    const c = source[i]
    const next = source[i + 1]

    if (c === '/' && next === '/') {
      let j = i + 2
      while (j < n && source[j] !== '\n') j++
      blank(i, j)
      i = j
      continue
    }

    if (c === '/' && next === '*') {
      let j = i + 2
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) j++
      blank(i, Math.min(j + 2, n))
      i = j + 2
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue }
        if (source[j] === c) break
        j++
      }
      blank(i + 1, j)
      i = j + 1
      continue
    }

    i++
  }

  return out.join('')
}
```

**Step B — V1 and V3.** On the blanked source:
- V3: any line whose trimmed text matches `/^return\s*;?$/` is a bare return → violation at that
  line.
- V1: if there is no match for `/\breturn\s*\{/` anywhere → one violation at line 0.

**Step C — V2.** For each `/\breturn\s*\{/` match in the blanked source, brace-match forward from
the `{` (increment on `{`, decrement on `}`, stop at zero) to get the object's span. Test the
**original** source over that span for `/(?:^|[{,\s])coverage\s*:/`. If no returned object
matches, emit one violation at line 0.

Testing the original text over the span is what makes case 7 work: the span is computed from
blanked source (so prompt braces cannot mislead it), but a `coverage` key inside a blanked string
has become spaces and cannot match.

**Step D — line numbers.** Convert an index to a 1-indexed line with
`source.slice(0, index).split('\n').length`.

## Implementation Steps

- [ ] **Step 1: Read the locked tests**

Run: `cat test/coverage-block.test.mjs`

Read every case. These are your specification — not this task file, and not your own judgement
about what the rule "should" do. Where the two disagree, the tests win; if you believe a test is
genuinely wrong, stop and escalate.

- [ ] **Step 2: Run the tests to confirm they currently fail**

Run: `node --test test/coverage-block.test.mjs`
Expected: FAIL — `Cannot find module '../tools/rules/coverage-block.mjs'`.

- [ ] **Step 3: Implement the rule**

Create `tools/rules/coverage-block.mjs` exporting `id`, `applies`, `check` per
`../shared/interfaces.md` §1, using the algorithm above.

- `id = 'coverage-block'`
- `applies = /\.workflow\.js$/`
- Open the file with a header comment explaining what it enforces and naming the accepted
  limitation, matching the house style of the other rule modules.

Messages must name `coverage` and cite IRON LAW §4 — T06a's tests assert on stable fragments, not
exact wording, so phrase them to be genuinely useful in a terminal.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/coverage-block.test.mjs`
Expected: PASS — every test T06a wrote, with none skipped and none modified.

- [ ] **Step 5: Confirm the test file is untouched**

Run: `git diff --name-only HEAD -- test/coverage-block.test.mjs`
Expected: no output. Any output is a boundary violation — revert it.

- [ ] **Step 6: Verify integration**

Run: `node tools/lint.mjs && node --test test/`
Expected: `OK: no findings`, then all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/rules/coverage-block.mjs
git commit -m "$(cat <<'EOF'
feat(lint): enforce IRON LAW §4 — every workflow returns coverage

Blanks strings and comments before brace-scanning, so a `coverage` key
inside a prompt literal cannot satisfy the rule.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] Every test in `test/coverage-block.test.mjs` passes, none skipped or modified
- [ ] `git diff --name-only HEAD -- test/coverage-block.test.mjs` is empty
- [ ] `check` is pure and synchronous
- [ ] No dependency was added
- [ ] `node tools/lint.mjs && node --test test/` succeeds
- [ ] No files outside Scope were modified
