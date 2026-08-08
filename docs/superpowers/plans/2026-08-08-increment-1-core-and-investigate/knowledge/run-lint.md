# Run the Lint

From the plugin root (`vf-agentics/`):

```bash
node tools/lint.mjs
```

## Expected output

Clean:

```
OK: no findings
```

With findings — one line each, exit code 1:

```
workflows/vfa-survey.workflow.js:42  [no-turn-caps] agent capped by turns; IRON LAW §1 forbids counter-based termination
agents/scout.md:0  [agent-frontmatter] missing required frontmatter key: model
```

## Notes

- Exit code is `1` when there is at least one finding, `0` otherwise. Chain it in verification
  steps: `node tools/lint.mjs && node --test test/`.
- The walk skips `.git`, `node_modules`, `docs`, and `test`. The lint checks the plugin's
  **runtime artifacts**, not the plan or its own tests — a rule file containing the literal string
  `maxTurns` as a test fixture must not trip its own rule.
- Line `0` means "this finding is about the file as a whole" (a missing block, a missing key)
  rather than a specific line.
- Until T04–T10 land, `tools/rules/` is empty and the lint trivially reports `OK: no findings`.
  That is correct: an orchestrator with no rules has nothing to say.
