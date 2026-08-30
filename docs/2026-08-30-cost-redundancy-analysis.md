# Cost-redundancy analysis: unjustified steps in the develop pipeline

2026-08-30. The evidence record behind the cost half of the cost/lanes/KB plan.
Baselines from [2026-08-29-eva-plays-2-field-audit.md](2026-08-29-eva-plays-2-field-audit.md).

## The five unjustified costs, ranked by savings

1. **The red/green split as two full work orders.** Each half pays the entire
   per-order toll (coder, verifier round(s), opus reviewer, merge, branch, worktree,
   state lines): ~10–12 dispatches per TDD'd behavior. The 5-line camera fix is the
   poster child. The hold-until-pair machinery (`455500e`) manages a hazard the
   split itself created. The split buys one real thing — the green coder's locus
   cannot touch tests — which a single-series lane must replace by other means.
2. **The verifier is a sonnet agent doing ~90% script work.** Its verify mode runs
   four commands and transcribes output verbatim; verdicts are already computed
   caller-side. It is the most-dispatched role in the pipeline. A `lib/verify.mjs`
   CLI riding a courier-grade dispatch preserves every measurement at a fraction of
   the cost; judgment (choosing an unnamed build command, `environment_broken`
   triage) becomes the escalation path, not the default.
3. **Whole-plan planning beyond the horizon of certainty.** 206k tokens / 25 minutes
   planned 26 orders of which one executed; field history says plans are wrong by
   wave 2. Plan the frontier, elaborate later slices against merged reality.
4. **No run-end garbage collection.** Merged branches and worktrees are never
   cleaned by the pipeline; sessions do it by hand every time, and one sweep found a
   test stranded on a branch tip (shipped untested).
5. **Docs orders ride the code lane.** Build + suite + discriminator against prose
   is vacuous verification; one field run spent a full pipeline pass and ten review
   rounds on a single 531-line document.

## Heavy but justified — explicitly not on the list

The opus reviewer (repeatedly caught real would-have-shipped defects), the
fresh-instance-per-round rule (anti-anchoring), wave-level integration verification
(merge breakage is real and was caught being real), and the discriminator (the single
highest-value mechanical check; nothing else closes the passes-for-the-wrong-reason
hole). Cost reduction never comes out of verdict predicates.

## Rough economics

A clean order today: coder + sonnet-verifier + opus-reviewer + merge + courier lines
≈ 5–6 dispatches; a red/green pair ≈ 10–12. With items 1–2 landed, a TDD'd behavior
drops to ≈ 4–6 dispatches with the red-work opus floor intact (savings are dispatch
count and executor class, never tier where the tiering doctrine sets an ALWAYS).
