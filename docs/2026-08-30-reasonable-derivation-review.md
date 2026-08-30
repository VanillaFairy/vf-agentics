# Derivation review: what vf-agentics should take from `reasonable`

2026-08-30. The evidence record behind the ported mechanisms in the cost/lanes/KB
plan. Source examined: `../reasonable` at v3.6.2 (parked 2026-08-16).

## Worth deriving

1. **Capability over discipline — by tool allowlist.** The blind-test-writer carries
   no Bash, so it cannot *execute* the implementation (`agents/blind-test-writer.md`
   frontmatter: `tools: Read, Edit, Write, Grep, Glob`). Note the honest limit: it
   can still read implementation files; blindness to source text is constitution
   prose, not capability. Allowlists are harness-native and carry zero cross-session
   surface.
2. **Applicability triage as a first-class verdict.** "Not applicable — choose
   freely" routes small work to a lighter path instead of engaging the machinery.
3. **The brownfield characterization layer.** `characterizer` role, `baseline.json`
   per-test `{id, locus, fileHash}`, clause provenance, and the **reverse
   discriminator** (mutate the clause's locus at HEAD, run only that test, require
   RED — proof an existing test still has teeth). This is the designed fence for
   "this refactor obsoletes half the suite."
4. **Trust invalidation by event, never by churn re-check** (architecture §16) —
   with the correction adjudicated on 2026-08-30: for a knowledge base that persists
   across runs, the sound event log is **git** (`git log <observed_at>..HEAD --
   <about>`), not the run ledger, because hand commits and direct sessions never
   write ledger lines.
5. **Doctrine, convergent:** "deterministic pipeline with stochastic nodes — model
   judgment lives inside nodes, never between them"; dynamism as "variable iteration
   count, fixed shape"; and "a model writing the orchestration script would be the
   governed editing the enforcement layer" (architecture §4, §10) — the standing
   argument for closed lane catalogues over planner-composed process graphs.
6. **Checkpoint commits as crash anchors** (mechanism #3) — adopted only in the
   deliberate-stop form; see the ruling below.

## Explicitly not derived

- **The ceremony:** intention oracle, inbox, supervision dial, vertical-slice
  routing, the 23-agent roster. The field audit's lesson is that mechanisms pay and
  ceremony costs; `reasonable` was parked while the leaner sibling got hardened.
- **One-run-per-slice orthodoxy** — vf-agentics' whole-partition execution plus
  seam-stop fits the quota-limited reality better.

## Postscript — the no-hooks ruling (2026-08-30)

`reasonable`'s hook layer (PreToolUse fence, Stop auto-commit, SessionStart
reconciliation) was initially slated for porting and is **ruled out** on the owner's
field experience with it in `reasonable`, reinforced by the interference analysis:
plugin hooks fire in every session on the machine (a universal process-spawn tax on
unrelated work), and any path-shaped scoping rule risks fencing other plugins'
agents — the harness's `wf_*` worktrees are shared territory. Sound scoping by
`agent_type` exists but does not remove the tax or the operational fragility.
Consequences for the plan: capability lives in tool allowlists only; locus
enforcement stays post-hoc via `commit-series.mjs` (the audit of record); the
crash-path auto-commit (Stop hook) has no replacement — checkpoint commits cover
deliberate stops only, and the first-commit-early rule is the only guard that
survives a hard kill. Also noted from the sibling's own source: its fence never
policed the Bash channel for locus (`lib/fence.mjs:303`), so the ported fence could
not have delivered "zero out-of-locus writes" mechanically anyway.
