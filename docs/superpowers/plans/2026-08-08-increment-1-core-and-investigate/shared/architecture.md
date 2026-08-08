# Architecture

## What this repo is

A Claude Code plugin. Its **runtime artifacts are declarative**, not executable by us:

- `agents/*.md` — YAML frontmatter + prompt body. Consumed by Claude Code's agent registry.
- `workflows/*.workflow.js` — JS executed by the `Workflow` tool in a restricted sandbox.
- `skills/*/SKILL.md` — YAML frontmatter + instructions. Consumed by the `Skill` tool.

None of these can be `import`ed and unit-tested. That is a platform fact, not a shortcoming of
the plan.

## Therefore: the lint engine is the test surface

`tools/` holds ordinary Node ESM that **we** run, and it is where all real logic and all real
unit tests live. Its job is to mechanically enforce the IRON LAW and the platform constraints
across the declarative artifacts.

```
tools/
├── lint.mjs                  # orchestrator: loads rules, walks files, formats findings
└── rules/
    ├── no-schema-bounds.mjs
    ├── no-turn-caps.mjs
    ├── coverage-block.mjs
    ├── workflow-meta.mjs
    ├── no-imports.mjs
    ├── qualified-agent-types.mjs
    └── agent-frontmatter.mjs
test/
└── <one .test.mjs per module above>
```

**One rule per module.** This is deliberate and load-bearing for execution: the plan's file
conflict rule forbids two independent tasks touching the same file, so a single `lint.mjs`
containing every rule would serialize seven tasks that are otherwise independent.

## Module boundaries

| Module | Responsibility | Must NOT |
|---|---|---|
| `tools/lint.mjs` | Load rules, walk the tree, map violations to findings, format output, set exit code | Contain any rule logic |
| `tools/rules/*.mjs` | One rule. Pure function over source text. | Touch the filesystem, know about other rules |
| `agents/*.md` | One agent's identity, fences, and method | Contain workflow orchestration |
| `workflows/vfa-survey.workflow.js` | Gather evidence; return findings + coverage | Draw conclusions or synthesize prose |
| `workflows/vfa-investigate.workflow.js` | Synthesize survey output into a report or task list | Re-implement searching |
| `skills/investigate/SKILL.md` | Parse args, call the workflow, surface coverage | Contain orchestration logic |

## The one architectural rule that governs everything

**Survey ends at evidence, never at an answer.**

`vfa-survey` returns structured findings and stops. Increment 1 has one consumer
(`vfa-investigate`), but increments 2–4 add three more. If survey ever returns prose
conclusions, none of them will compose.

## Design decisions carried from the spec

- **Rules are pure functions over source text.** No filesystem access inside a rule — the
  orchestrator reads files and hands over strings. Makes every rule trivially testable.
- **Findings are data, not printed strings.** Formatting happens once, in the orchestrator.
- **`complete` is computed, never claimed.** Derived in JS from `stop_reason` enums.
- **Agents that find are separate from agents that judge.** `analyst` has no search tools by
  design; it is handed locations by `scout`.
