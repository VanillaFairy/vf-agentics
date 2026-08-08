# Run Tests

From the plugin root (`vf-agentics/`):

```bash
node --test
```

**Do not pass `test/` as an argument.** On Node 26.5.1 (this machine, Windows),
`node --test test/` and `node --test test` both fail with:

```
Error: Cannot find module 'C:\...\vf-agentics\test'
  code: 'MODULE_NOT_FOUND'
```

Node treats the bare positional argument as a module to load rather than a directory to
scan, and exits `1` without running anything. Bare `node --test` uses Node's default test
discovery and finds everything under `test/` correctly. This was hit independently by three
agents in wave 1 and confirmed by the supervisor.

Run a single file while iterating:

```bash
node --test test/no-turn-caps.test.mjs
```

Run one named test:

```bash
node --test --test-name-pattern="flags maxTurns" test/no-turn-caps.test.mjs
```

## Notes

- Node 26.5.1. The runner is built in — there is no `package.json`, no install step, and no
  dependencies. This matches the `reasonable` plugin's convention.
- `.mjs` files are ESM natively. Do not add `"type": "module"` anywhere.
- Exit code is non-zero if any test fails, so this is safe to chain with `&&`.
- A file with zero tests **passes**. If you expect tests and see `pass 0`, your file name is
  wrong — it must end in `.test.mjs` and live under `test/`.
