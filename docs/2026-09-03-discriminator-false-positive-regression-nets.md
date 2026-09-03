# The discriminator misfires on regression-net orders

**Observed:** 2026-09-03, run `20260902-124933` (eva-plays-2, "asset manifest as data"),
order `real-bundle-tests`. Cost: two escalations, roughly 25 minutes of agent time across two
invocations, and a human override.

## What happened

`real-bundle-tests` is a test-only order. Two files, no production code. It asserts two things
about the data the game actually ships:

- the real `core.json` obeys every composed-set rule — no duplicate ids, insets that fit their
  frames, the composed id set equal to the generated module's;
- the word-card texture row declares all four nine-slice insets, which `WordCard` throws at
  runtime without.

The verifier's **discriminator** rewound the repository to the order's base SHA, ran the new
tests there, and reported:

```
tests/unit/assetBundles.test.ts  does not discriminate: failed_on_base=false, passes_now=true
tests/unit/assetManifest.test.ts does not discriminate: failed_on_base=false, passes_now=true
```

Three criticals, `verify_failed_repeatedly`, escalated. Nothing merged.

## Why it is wrong here

The discriminator asks: *did this test fail before the change it is testing?* That is the right
question for a test that exists to pin a behaviour change, and it catches the real problem of
tests written to be green.

It is the wrong question for a test that exists to pin **existing correct data**. These
assertions say "the shipped bundle is still valid". The bundle was valid before the order too —
that is the point. The only way to make them fail on base would be to break the data first.

The plan knew this. The order is `role: none`, and its own context calls it:

> defence in depth over real data, not the only thing watching

and its acceptance criterion 2 states the check that *does* fit:

> The new cases actually bite: temporarily deleting `slices` from prop.woodboard's row in
> core.json makes the card-texture case fail, and temporarily duplicating a row id across the
> bundle makes the composed-rules case fail.

That criterion was run by hand and passed cleanly. Deleting the insets failed exactly one case
(`prop.woodboard slices: expected undefined to be defined`) and nothing else. Duplicating a row
id failed all three composed-rules cases (`id "tile.grass" is claimed by two bundles`). The
tests bite. They bite when the **data** breaks, not when the **code** is rewound.

So the pipeline held back a correct order for two rounds, and the only way through was a human
overriding a safety gate — which is the most expensive possible resolution and teaches the
operator to distrust the gate.

## The compounding failure

The second escalation reason was:

```
two consecutive fix rounds landed commits without changing what fails
```

That rule assumes a fix round *can* change what fails. Here it could not: no commit inside the
order's locus (two test files) can make a test fail against a base where the data is already
correct. The coder spent two rounds trying, and did produce one genuine improvement along the
way, but the loop was unwinnable by construction. The convergence rule turned a
wrong-question verdict into a second, more confident-sounding wrong-question verdict.

## What to change

Roughly in order of cost.

**1. Short-circuit an unwinnable discriminator loop to the human on round 1.** When a
discriminator failure is byte-identical across a round and the order carries no `red` role,
another fix round cannot help. Escalate immediately with the discriminator output and the
order's acceptance criteria side by side, rather than buying a second round to learn the same
thing. Cheapest change, and it caps the damage of every remaining case below.

**2. Let an order declare that its tests pin data, not a behaviour change.** The planner
already assigns roles (`red` / `green` / `refactor` / `none`). A regression-net order needs its
own marker — say `pins: 'data'` — and when it is set the discriminator's base-failure question
is not asked, because it is known not to apply. Without a marker the planner has no way to tell
the verifier what kind of test it commissioned, and the verifier is left inferring it from a
heuristic that has no way to be right.

**3. Better: let the order carry a machine-readable mutation spec.** The plan already wrote the
correct check in prose — *delete this field, that case must fail; duplicate this id, those
cases must fail*. If the planner emitted that as data alongside the acceptance criteria, the
verifier could run it, and a regression net would be verified **more** strictly than the
discriminator manages, not less. This is the version that adds real assurance rather than just
removing a false alarm: it proves the net catches what it was built to catch.

**4. Fall back to routing, not refusing.** Where none of the above applies and the
discriminator still fails, present it as a finding for a person with the order's own criteria
quoted, rather than as a critical that blocks. A mechanical check that cannot be right for a
whole class of order should not have the last word on that class.

## Two unrelated defects seen in the same run

Worth recording while they are in front of us; neither is about the discriminator.

**The cwd leak still bites.** The retry invocation created its worktree at
`…/worktrees/vf-agentics-develop-8a30f0/.claude/worktrees/vfa-real-bundle-tests` — nested
inside the *calling session's* worktree, because the workflow inherited the orchestrating
session's Bash cwd rather than resolving against the run's recorded `roots`. It did not kill
this run, since `roots` came off disk for everything else, but the worktree landed somewhere
nobody would look for it. Worktree paths should be resolved from `roots`, never from cwd.

**A ledger write was refused on a digest mismatch, silently costing the next resume.** The run
reported:

```
merges this run found already in git (generator-red, generator-green, swap, save-route,
index-docs, kb-docs, art-briefs) were not written to state.jsonl
(digest mismatch: the caller minted 03590476, this line digests to 9403ebb9)
```

The refusal is correct behaviour — an unreadable line is worse than a missing one. But the
consequence is that seven merges that genuinely happened are absent from `state.jsonl`, so the
next resume must re-derive them from git. The `kb` channel failed in the same invocation, so
the run's `discovered` entries were never deposited either. Both showed up only as
`coverage.failed_channels`, which is easy to read past. A refused ledger write should retry
with a freshly minted digest before giving up, and a failed channel should be surfaced as
prominently as an escalation, since it silently degrades every later invocation.

## Also worth noting: the review layer paid for itself here

Against the same run, the adversarial reviewers found three real defects the mechanical checks
did not, in work that had already passed build, lint and 1470 tests:

- a dev-server plugin that never regenerated at startup, because Vite sets
  `ignoreInitial: true` and chokidar raises no `add` for a file already on disk — found
  independently by two reviewers, with the Vite internals cited by line;
- a module whose write target was fixed at import time, making the only natural test for it
  destructive to the shipped source;
- an integration finding whose correct fix ran *opposite* to the one proposed, because the
  review had run against a merge with two coupled orders still missing.

That last one is a general hazard worth stating in the skill: an integration review over a
partial merge can be accurate about the state it saw and still point the wrong way once the
missing orders land. A run that ends with coupled orders outstanding should say so on every
integration finding it reports.
