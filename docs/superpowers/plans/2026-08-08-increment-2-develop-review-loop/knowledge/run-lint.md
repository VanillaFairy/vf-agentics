# Run the lint

From the `vf-agentics` plugin root:

```
node tools/lint.mjs
```

Lints every declarative artifact (agents, workflows, skills) with the rules in
`tools/rules/`. Expected on a clean tree: `OK: no findings`, exit 0. Any finding is
`<file>:<line>  [<rule>] <message>`, exit 1.
