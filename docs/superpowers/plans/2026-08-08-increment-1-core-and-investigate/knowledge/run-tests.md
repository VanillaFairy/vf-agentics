# Run Tests

From the plugin root (`vf-agentics/`):

```bash
node --test test/
```

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
