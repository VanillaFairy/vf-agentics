# Field audit: the ten latest eva-plays-2 sessions

2026-08-29 (committed 2026-08-30 as the evidence record behind the cost/lanes/KB plan).
Question examined: was vf-agentics worth using, or would a naive direct "do X" have
served better? Sessions identified by transcript activity (file mtimes were bulk-touched
and unreliable); transcripts read in full, cross-checked against the repository's git
history and `.claude/vfa/runs/` ledgers.

## Scorecard

| Session (date) | Task | Mode | Cost | Outcome |
|---|---|---|---|---|
| 4c39167d (08-26) | Stage 5, first try | develop 0.16.0 | 35k tokens, 2 min | aborted false start |
| faa58813 (08-26→27) | Stage 5 run | develop 0.16.0, 5 workflow launches | 343k main + agents, overnight | coder correctly blocked on a wrong plan with no channel to say so; Haiku courier corrupted `partition_raw` in transit; quota hit mid-run; 4 plugin findings |
| 07c1140d (08-27) | migration + programme develop | develop 1.0.0 | ~102k | process management, superseded |
| 13b11b82 (08-27) | Stage 5 finish | develop 1.0.0 | ~228k main | the clear pipeline win: content breadth merged green (`a211e9a`), ~15 focused commits; then 10 worktrees / 23 branches cleaned **by hand** |
| 10e1170e (08-28) | fluency-model design | /design | 65k, 12 min | cheap, sharp survey evidence; no ratified artifact — user pivoted |
| 09644843 (08-28) | disable day-night, config sleep | direct + ad-hoc experts/probe | ~171k real output | landed `746cbd9` (+634) in ~37 min of the ask itself; hand-rolled probe caught a real metrics double-count |
| aa3f2f9d (08-28) | day-script rework, 26 orders | develop 1.0.0 | ~1.05M tokens, 28 agents, 43 min | one red test file on a side branch; 25 min / 206k on planning alone; account limit killed the run AND the ledger writer — `state.jsonl` never written; parked |
| 3bc4fdbe (08-29) | config file feature | direct | 237k, 35 min | ~1,300 lines, 62 tests, 4 clean commits, zero corrections — the naive baseline at its best |
| 7055be02 (08-29) | UI redesign | frontend-design + develop | ~1.49M total, 2h44m | wave 1 merged; wave 2 all 5 orders falsely escalated (red-green wave poisoning); 13 orders never dispatched; the entire visible redesign then written directly in ~25 min / 17 commits; reviewers caught 2 real bugs |
| 561049ee (08-29) | redesign part 2 | develop 1.0.1 | in flight at audit time | run 20260829-164855, wave 1 approved, nothing merged |

Three clear direct-mode wins, two outright pipeline losses, one pipeline win, one false
start, one cheap design pass, one process session, one still running.

## Reference numbers used as plan baselines

- Survey: ~400–500k tokens and 3–4 minutes of scout/analyst fan-out per develop run
  (9 scouts + 8 analysts observed on run 20260828-142354; per-agent 20–43k).
- Planner: 25.4 minutes / 206k tokens for the 26-order plan of run 20260828-142354,
  of which one order executed before the run died.
- Per-order ladder: a red/green pair ≈ 10–12 dispatches for one behavior (coder,
  verifier round(s), opus reviewer, merge, courier lines — twice).
- Field example of the overhead floor: a 5-line camera-rounding fix (`ec81a78`)
  carried its own 48-line pinned red test (`cb18355`) through dedicated worktrees.
- Cleanup debt: 10 worktrees / 23 branches swept by hand on 08-27; 11 stale branches
  on 08-20 including one orphaned test stranded on a branch tip (feature shipped
  untested).
- Token accounting source: the Workflow engine's own accounting — `budget.spent()`,
  the run's final totals, and per-agent totals in the run's transcript directory.

## Conclusions carried into the plan

1. Below a task-size threshold, direct sessions beat the pipeline — seven of ten
   sessions were better served direct. Hence the triage gate.
2. The consistently valuable parts were the periphery: probe, adversarial reviewers,
   and the discriminator caught real would-have-shipped defects (upside-down
   boulders, the art-brief pipeline bug, a metrics double-count). The losses
   concentrate in the scheduler and the courier path.
3. Develop's burn rate (~1–1.5M tokens, multi-hour) structurally collides with the
   5-hour usage quota; two of ten sessions were maimed by mid-run 429s.
4. Sessions rebuilt missing features by hand (branch GC, knowledge routing) — each
   such reconstruction marks a feature the pipeline owes.
