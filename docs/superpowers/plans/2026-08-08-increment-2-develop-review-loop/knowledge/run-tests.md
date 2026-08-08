# Run the unit tests

From the `vf-agentics` plugin root:

```
node --test
```

Runs every `test/*.test.mjs` with Node's built-in runner. Expected on a clean tree: all pass,
exit 0. To run one file:

```
node --test test/independence.test.mjs
```
