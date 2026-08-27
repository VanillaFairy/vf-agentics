# vf-agentics — adversarial scenario review

Produced 2026-08-27 by 16 adversarial analysts (fable tier), one per scenario cluster of
[the scenario catalogue](2026-08-27-scenario-catalogue.md), each judging correctness under
adversarial conditions plus fit against the six main requirements (R1..R6). Run wf_ce7dcd7a-29e.

Coverage: complete — every scenario probed. Verdicts: 42 holds, 61 holds_with_risk, 7 broken. 75 improvements proposed.

Verdict meanings: **holds** — mechanism verified, survives adversarial probing. **holds_with_risk** — works, but a named condition defeats it. **broken** — defeatable now. **unverifiable** — cited mechanism not confirmable in source.

## A-engine — A. Survey core (shared evidence engine)

### A1 — holds

C:\work\claude\vanillafairy\vf-agentics\workflows\vfa-survey.workflow.js — planner dispatch :280-313 (analyst agentType, PLAN schema); one scout per topic via pipeline :582-585 driving scoutUntilComplete :503-554; common-ground scout :560-562; historian/doc-researcher side channels :473-494 through the same resume engine; one analyst per topic :587-613; coverage derived in JS by coverageOf :244-257 and returned :677-683. All catalogue citations land where claimed.

> **Improvement (minor, R1 R3):** Have the planner rate each topic's judgment difficulty and dispatch each per-topic analyst at the matching tier, instead of applying the single survey-wide judge tier (JUDGE_TIER resolved once at :228-230, spread into every analyst at :309 and :603-604).
>
> **Why:** An 8-topic survey at max buys eight fable analysts at high effort even when several topics are mechanical lookups a sonnet could rule on — per-topic tiering is the cost reduction R3 mandates and the task-granular dial R1 asks for, which today stops at the survey boundary.

### A2 — holds_with_risk

vfa-survey.workflow.js:213-214 (`question = input.question || ''`) and :269-272 (`if (!question)` returns empty result with unreached 'no question was supplied'). No trim anywhere: a whitespace-only question is truthy, bypasses the guard, and buys a judge-tier planner call before dying at the :315-318 zero-topics exit — the catalogue's 'blank/whitespace' claim overstates the guard. Worse, the catalogue's own Observed incidents record an argless resume (resumeFromRunId) hitting exactly this guard: question '' returned a coverage-honest empty result in 5 ms, and the run's prior spend was stranded because the guard makes a lost-args resume indistinguishable from a legitimately empty fresh run.

> **Improvement (major, R5 R3):** Trim the question at intake and make the blank-question exit's unreached line name the argless-resume case ('if this is a resume, re-invoke with the original args'), with consuming SKILL.md files recording that args must be re-passed alongside resumeFromRunId.
>
> **Why:** The 2026-08-27 field incident: a resume silently lost the workflow args, the guard returned a normal-shaped empty result, and an entire interrupted survey's cache became unreachable — an actionable halt message is the difference between resuming and re-buying the run.

### A3 — holds

vfa-survey.workflow.js:310-313 (`.catch` on the planner call returns null after logging) and :315-318 (`!plan || !plan.topics || plan.topics.length === 0` returns the empty result with unreached 'planning produced no topics, so nothing was searched'). Missing coverage fields elsewhere normalize toward incomplete, never toward exhausted (:373, :380-384), so a degraded plan cannot launder into completeness.

> **Improvement (minor, R3 R6):** Filter topics whose `find` is blank in JS (schema bounds are stripped by the platform, :16-19, so PLAN's required fields accept empty strings) and record them in unreached instead of dispatching a scout and an analyst on an empty charge.
>
> **Why:** The 0.12.1 deadlock postmortem proves models blank or omit schema fields under pressure; today a blank-find topic dispatches a chargeless scout, then an analyst rules on nothing, and that verdict enters evidence with coverage.complete potentially true — a fabricated-confidence seed the vfa-probe workflow already filters for its own axes.

### A4 — holds_with_risk

vfa-survey.workflow.js:325-327 — overflow beyond maxTopics(8) is logged and every topic is still searched (pipeline maps plan.topics wholesale at :582); no slicing exists anywhere in the file, matching IRON LAW §8 and serving R2. Risk: this branch is the one pre-dispatch point where the script already knows the run is outsized, and its only act is a log line — nothing pre-judges whether N scouts-to-exhaustion plus N analysts fit the hosting session (R5's early-detection clause; the catalogue's Observed incidents show a session limit killing 16 dispatched agents with zero salvage).

> **Improvement (major, R5 R2):** When the plan exceeds maxTopics, return a resumable checkpoint-shaped result (complete:false, resumable.remaining naming the unsearched batches) or process topics in persisted batches, letting the caller split the survey instead of buying one monolithic pass.
>
> **Why:** Prevents the observed doomed-work day — a large dispatch started whole and killed whole by a session limit with nothing salvageable — by converting the one advance warning the script already has into a split decision, which is how R2's completion guarantee survives R5's session reality.

### A5 — holds

vfa-survey.workflow.js:329-332 — `const commonFind = (plan.common_ground || '').trim()` degrades an absent/null field to empty; every downstream use gates on commonFind (:527 exclusion, :560 launch, :334-337 log), so a pre-0.16 plan yields exactly 'no shared ground' with no throw path. Commit bc58c9f itself not verifiable from the working tree, but the mechanism is confirmed in source.

### A6 — holds_with_risk

vfa-survey.workflow.js:353-393 — `while (true)` with all five claimed exits verified: exhausted :373-375, thrown round keeping work :361-364, null round :365-368, dead-end on blank not_reached with the laundering rationale in the comment :377-384, stuck on no new dedup keys :386-389; `round` exists only for labels/logs (:548, :391), never as a stop. R6 audit clean: all round bookkeeping — dedup, progress judgment, resume-prompt assembly, channel merging, coverage derivation — is script-side JS (:435-471, :503-554, :244-257); nothing deterministic rides a model. Risk (R2-vs-R5): completion is guaranteed only while the session survives — every absorbed round lives in script memory, agents are read-only (agents/scout.md:4 tools Read/Grep/Glob; doc-researcher.md:73-77 'You do not write files'), and the harness caches only completed calls, so the 2026-08-27 incident (11 agents started, 0 completed, ~525k tokens, zero salvage) is the exact cost of a mid-loop kill.

> **Improvement (major, R5 R2):** Persist each completed round durably (a courier-journal per the increment-7 pattern develop already uses, since scouts themselves are write-less by design) and add a pre-round session-fit check that ends the invocation early-and-resumable instead of dispatching a round likely to be killed.
>
> **Why:** Turns the observed total-loss day — a session limit landing mid-survey and vaporizing every finished round — into a resume that costs only the interrupted round, which is R5's whole clause and the only way R2's must-finish survives a host the workflow cannot control.

### A6 — holds_with_risk

vfa-survey.workflow.js:509-521 and :442-451 — the stuck exit's progress measure is byte-exact string dedup of `searched` entries and hit keys (`seen.has(k)`); a scout that re-treads the same surface but rewords each search description registers new keys every round, so `progressed` stays true, the same not_reached is re-fed (:544, :460), and the loop continues indefinitely — the stuck exit (:386-389) fires only on byte-identical re-reporting. Field analog cited in the catalogue: the review loop's 5-7 round sampling-variance churn (C12, 0.11.0) needed its own detector for the same phenomenon class.

> **Improvement (minor, R3 R5):** Strengthen the progress measure for non-exhausted rounds: count a round as progress only on new hits or a materially changed not_reached remainder (normalized comparison), so paraphrased re-treads of the same surface reach the stuck exit.
>
> **Why:** Prevents an unbounded-round money pit that both burns spend inside the chosen level (R3) and, by running long, walks the survey into the session-limit death R5 exists to pre-empt.

## A-channels — A. Survey core (shared evidence engine)

### A7 — holds_with_risk

workflows/vfa-survey.workflow.js:531-552 builds the resume prompt with ALREADY SEARCHED / ALREADY FOUND / STILL NOT REACHED and pushes the topic key into partial[] on a non-exhausted end; :675 folds partial into coverage.incomplete (filtered against dropped); agents/scout.md:57-61 orders 'do not start over' (catalogue's scout.md:42 cite is off by a section but the mechanism exists). The defeat: resumeToExhaustion (:373-391) resumes ANY non-exhausted round — including a self-declared 'stuck' — whenever not_reached is non-empty and the round added any new `searched` string (absorb, :515-518 counts searched-surface growth as progress even with zero new hits). The resume prompt itself commands 'do not repeat these', so a scout facing an unreachable remainder (a path outside its roots, a surface its Read/Grep/Glob toolset cannot touch) obediently mints new search keys every round while returning the same not_reached, and is resumed indefinitely; nothing compares not_reached across rounds. The loop ends only when the session/usage limit kills the whole run — the exact incident class in the catalogue's Observed Incidents. test/vfa-survey-scenarios.test.mjs:181-202 pins unbounded resume as intended; :204-219 pins stuck-detection only for byte-identical rounds.

> **Improvement (major, R5 R3):** Add a goal-shaped dead-end exit to resumeToExhaustion: a round that gains no new hits and repeats the previous round's not_reached verbatim (or a round self-reporting 'stuck' whose remainder is unchanged) ends as stuck/incomplete-resumable instead of another round.
>
> **Why:** An unreachable remainder currently costs the rest of the session — obedient non-repetition manufactures 'progress' every round until the usage limit lands and kills every in-flight agent with nothing cached, the doomed-lengthy-work failure R5 names; this exit costs one extra round instead and stays a goal condition, not a counter.

### A8 — holds

workflows/vfa-survey.workflow.js:412-418 — a channel flagged needed with a blank question returns {requested:true, result:null, error:'the planner marked it necessary and then produced no question...'} plus a WARNING log; :638-640 counts any requested-but-resultless channel into failed_channels, so coverage.complete goes false. Pinned by test/vfa-survey-scenarios.test.mjs:84-99 (whitespace-only question, failed_channels ['history'], log asserted). Null/undefined ask survives the (ask || '').trim() guard; the planner schema (:125-135) keeps the field a string, so no malformed shape reaches it.

### A9 — holds

workflows/vfa-survey.workflow.js:419-427 — launch resolved falsy or rejected both map to {requested:true, result:null, error} without rejecting, so scout/analyst work already paid for survives (test/vfa-survey-scenarios.test.mjs:101-112 asserts verdicts kept); :638-640 derives failed_channels. The downstream-prose claim is real: vfa-investigate.workflow.js:178-180 injects 'NOTE: the git history search did not run. Any claim about when or why...' into synthesis when failed_channels includes 'history'. Edge checked: a channel that returns a round then throws on resume keeps sawResult=true in channelToExhaustion (:442-470) and lands in incomplete (A10's bucket), not failed_channels — partial work is kept, correctly distinguished from total failure.

### A10 — holds

workflows/vfa-survey.workflow.js:646-651 — a returned channel with stop_reason!=='exhausted' joins truncatedChannels, concatenated into coverage.incomplete at :675 (distinct from failed_channels); :657-667 appends 'COVERAGE LIMIT (<reason>) — never reached: ...' to the channel's findings string so evidence and its limit travel as one string. channelToExhaustion sets stop_reason binary exhausted/unfinished (:467), so no third value leaks. Pinned by test/vfa-survey-scenarios.test.mjs:287-300 (findings-only report reads incomplete, evidence kept) and :304-327 (resume spent first, resumable.remaining includes the channel). Missing agent stop_reason degrades to unfinished via the !== check — the safe direction.

### A11 — holds

workflows/vfa-survey.workflow.js:527-529 — every topic scout except the common one gets the do-not-search exclusion; :560-562 launches one common-ground scout through the same resume engine, whose unexhausted end joins partial[] like any topic; :567-580 — sharedGroundSection writes the hits, surface, evidence-of-absence, and (when unfinished) the 'WARNING: the shared-ground search did NOT finish... never reached: ...' block into every analyst prompt via `await commonGround` at :596. Pinned by test/vfa-survey-scenarios.test.mjs:358-396 (searched once, excluded from topic scouts, delivered to every analyst) and :413-437 (unfinished shared scout lands in incomplete and resumable.remaining, WARNING asserted). The awaited commonGround promise cannot realistically reject: resumeToExhaustion catches launch throws and absorb guards every optional field, so the analyst-side .catch gap at :605 is unreachable through this path.

### A12 — holds

workflows/vfa-survey.workflow.js:605-613 — the analyst call carries .catch→null so a rejection can never escape whatever pipeline() does with it; :622-627 reconciles by plan.topics index (findings[i]), never by the echoed topic string, dropping missing slots into dropped[]. The order-preserving null-slot pipeline contract is documented and executed at test/harness/workflow-host.mjs:9-12 and :52-64 (out.push per item, sequential); production runtime is outside this repo, but the .catch means the only assumption left is order preservation. Both faces pinned: test/vfa-survey-scenarios.test.mjs:116-129 (mistyped echo still counted, complete=true) and :131-143 (dead analyst → dropped exactly once, never also incomplete).

> **Improvement (minor, R6):** After index reconciliation, overwrite findings[i].topic = topic.key in JS before pushing to verdicts.
>
> **Why:** The mistyped echo the comment at :619-621 documents as a live incident still rides verbatim into synthesis — vfa-investigate.workflow.js:188 JSON.stringifies the verdicts whole — so a report can attribute a conclusion to a topic key that exists nowhere in the plan or the coverage block; one deterministic line closes it.

### A13 — holds_with_risk

Confirmed everywhere cited: workflows/vfa-survey.workflow.js:78-85 (only payload in `required`, coverage demanded by descriptions, normalized in JS, absence degrades toward incomplete), :39-76 (always-include/empty-string wording in every coverage field description), agents/scout.md:36-40, agents/historian.md:52-59, agents/doc-researcher.md:25-32 (identical prose contract per charter). The safe direction is real and tested for stop_reason: test/vfa-survey-scenarios.test.mjs:275-285 (no stop_reason → incomplete, evidence kept). The asymmetry is the risk: stop_reason:'exhausted' with `searched` omitted or empty derives complete=true — pinned as intended at test :263-273 — even though the schema's own description (:44-46) calls searched 'the evidence trail behind stop_reason: without it your completeness claim is an unverifiable self-report'. A no-op or hallucinating agent's bare 'exhausted' (zero hits, zero searched) is accepted as a whole result; the only guard is prose delegated to the analyst's judgment (:597-599 'Judge the search surface above for yourself'), and the 0.12.1 field history proves agents do violate the prose demand under exactly this contract.

> **Improvement (major, R6 R2):** In JS, treat stop_reason==='exhausted' arriving with an empty normalized `searched` array as a dead end: keep the hits, mark the topic/channel incomplete-resumable, never complete.
>
> **Why:** It closes the one remaining path where JS-invented emptiness launders an unverifiable self-report into coverage.complete=true — the plugin's named single failure mode — with a deterministic script check instead of the model-side prose judgment that currently backstops it, and unlike the 0.12.1 validator deadlock it demotes rather than drops, so no finished evidence is ever thrown away.

## B-investigate — B. Investigate

### B1 — holds_with_risk

SKILL.md:25-50 parses intelligence/mode/roots; SKILL.md:57-66 launches 'vf-agentics:vfa-investigate' and records runId, then 'let it run in the background' with no limit preflight; SKILL.md:73-78 lands tasks via TaskList/TaskCreate/TaskUpdate addBlockedBy. Nothing in workflow.js:1-267 writes any state to disk — no journal, no run dir — so a session kill mid-survey loses every in-flight agent (the observed incident: 11 started, 0 completed, nothing salvageable). CLAUDE.md's agent-written durability ('journal.jsonl ... written by whoever performs the action') is implemented only for develop.

> **Improvement (critical, R5 R3 R2):** Extend the 0.14.0 agents-write-own-records durability to the investigate/survey evidence agents — each scout/analyst journals its completed finding in the execution that produced it — and add a skill-level preflight in Step 2 that splits or defers the pass when a session limit is near.
>
> **Why:** Prevents the observed day where a session restart lost all 11 in-flight agents and a usage limit killed 16 mid-pass with ~525k tokens spent and zero completed work salvageable.

### B2 — holds

SKILL.md:91-95: 'hand back result.report as it stands', no summarising, and 'you write it. The agents in this plugin are read-only by design'. workflow.js:244-254 produces the report via a single judge-tier analyst and :267 returns it verbatim in the result.

### B3 — holds_with_risk

SKILL.md:80-89: TodoWrite fallback, emit in blocked_by order, 'After <subject>:' prefixes, say aloud ordering is advisory. tools/rules/task-tool-fallback.mjs:43-71 enforces the TodoWrite token in any SKILL.md naming Task tools, and :26-31 honestly documents that the check is presence-only (vacuous pass accepted). Defeating sequence: SKILL.md:82-83 orders 'treat a failure there as this branch rather than as an error to retry', so a transient TaskUpdate/TaskCreate failure AFTER earlier TaskCreates succeeded (tools provably present) instructs a full TodoWrite re-emit — duplicating already-created tasks and orphaning the real ones with no edges; the skill never addresses a torn landing.

> **Improvement (minor, R2):** In SKILL.md Step 3, distinguish first-call failure (tools absent, fall back whole) from mid-sequence failure (torn landing: name what already landed, finish or fix only the remainder, never re-emit the full list).
>
> **Why:** Prevents a transient mid-sequence host error from producing duplicate task lists — a torn landing wearing the shape of a clean fallback, the exact IRON LAW §4 failure the rule exists to catch.

### B4 — holds_with_risk

workflow.js:90-99: `if (!question)` returns an honest empty coverage block, nothing dispatched — confirmed, and it is exactly what the observed argless resume hit (empty result in 5ms). Two defeats: (1) the resume path — SKILL.md:61-63 says record the runId but no resume procedure exists anywhere in the skill, nothing warns args must be re-passed, and resumable carries only {runId: placeholder, remaining} (workflow.js:97, :81); (2) `input.question || ''` (:63) does not trim, so a whitespace-only question passes this guard AND survey's identical one (vfa-survey.workflow.js:214, :269) and buys a judge-tier planner call on a blank question.

> **Improvement (major, R5 R6):** Carry the full launch args in the coverage.resumable block ({runId, remaining, args: {question, roots, notes, as_tasks, intelligence}}) and add a resume procedure to SKILL.md that re-passes them; trim the question at :63 while there.
>
> **Why:** Makes an args-carrying resume mechanical instead of memory-dependent, preventing the observed day a scriptPath+resumeFromRunId relaunch ran argless and returned an empty result in 5ms after the original run's spend.

### B5 — holds_with_risk

workflow.js:110-143 as cited: qualified name tried (:116), bare name second (:122), double not-found returns failed_channels:['survey'] with the 'broken reference in this plugin, not an environmental failure' message (:130-143). Defeating condition: the classification rests entirely on `/not found/i` matching the host's error message text (:111); a host whose lookup error reads e.g. 'Unknown workflow' leaves surveyUnresolved false, survey stays null, and the run falls into the B6 branch (:147-156) reporting 'the evidence phase did not complete' — the broken-reference/environmental distinction the comment at :106-109 declares essential silently collapses. Coverage stays honest (complete:false, failed_channels:['survey']) either way, so the loss is diagnostic, not laundering.

### B6 — holds_with_risk

workflow.js:147-156: `if (!survey || !survey.coverage)` returns failed_channels:['survey'] — exists as cited, and covers the null/missing-key form of the catalogued trigger 'malformed survey result'. Defeat: a coverage block that is present but torn (missing any of the four arrays) passes the guard and throws TypeError at :169/:174/:184 (`c.dropped.length` etc.); vfa-investigate has no top-level catch (develop does, C22 at its :4263), so that exit returns nothing at all — the one shape of failure the plugin exists to prevent. Reaching it requires survey's shape to drift, which is precisely the premise the guard's own comment (:145-146) accepts as real.

> **Improvement (minor, R2 R5):** Normalize the survey coverage shape in JS (default the four arrays) or wrap the workflow body in the same top-level catch develop has, returning investigateResult with failed_channels:['pipeline'].
>
> **Why:** Closes the only exit path where investigate can die with no coverage block returned, keeping shape drift underneath it a degraded result instead of an uncaught throw with nothing resumable.

### B7 — holds_with_risk

workflow.js:204-218 (tasks) and :251-265 (report): synthesis .catch→null, 'synthesis' joins failed_channels, unreached notes evidence was gathered but not turned into tasks/report — mechanism exists exactly as cited. Defeat of R5/IRON LAW §5 intent: both failure returns are investigateResult(mode, null, null, coverage) and the result shape (:86-88) has no evidence field, so survey.verdicts/history/docs — fully gathered and paid for, present in-script at :187-191 — are discarded from the return; the only recovery is a full re-run, whose resume path is the args-dropping one from B4.

> **Improvement (major, R2 R3 R5):** Include the gathered evidence (survey verdicts, history, docs) in the synthesis-failure returns so the session can hand-synthesize or retry synthesis alone without re-buying the survey.
>
> **Why:** A synthesis-agent death after a complete multi-hundred-k-token survey currently returns only coverage arrays; this makes the paid-for evidence reach the user instead of dying inside the script.

### B8 — holds

workflow.js:75 MAX_TASKS=12; :230-239 enforces in JS: overflow subjects recorded in result.gaps (:237) AND coverage.unreached with complete forced false (:238) — both places, as claimed; :13-14 documents why the schema cannot bound the array (no-schema-bounds). The cut loses the dropped tasks' descriptions/edges, but the loss is named in both reader-facing and machine-facing channels, which is the contract.

### B9 — holds

SKILL.md:97-121: Step 4 'not optional', gap leads when complete is false (:100-102), the four arrays glossed (:104-111), task mode must also read result.tasks.gaps (:113-115). workflow.js:167-185 mirrors every coverage array into NOTE lines inside the synthesis prompt; :29-33 makes gaps the schema-required place synthesis records holes ('Never invent a task to paper over one of these'). Skill-side enforcement is prose on the session, but that is the plugin's declared decidable/review split (task-tool-fallback.mjs:18-23).

## C-entry — C. Develop

### C1 — holds

SKILL.md:122-129 dirty-tree gate + gitignore; workflow.js:1296 vfa/<runstamp>-integration; :2422 orderBranch dash form; :2218-2269 verifyUntilGreen with computed noProgress escalation; :2345 review success exit is open.length===0 only; :1627+4017-4046 --no-ff merges; :4056-4090 per-wave verify; :4099-4119 wave record degrade; :4139-4168 single integration reviewer; SKILL.md:262-305 human-gated user-branch merge; SKILL.md:449 cleanup after acceptance. R4 is served per order via the role enum (workflow.js:45, 404-406, 1107-1123). gotchas.md:100 cite not opened; the dash mechanism is verified in code.

> **Improvement (major, R1 R3):** Add a per-order intelligence hint to the plan schema (beside the existing per-order role field) and map judge/coderTier per dispatch within the user-set ceiling, instead of the single run-wide applyIntelligence dial (workflow.js:669-683).
>
> **Why:** A run mixing one contract-critical order with five trivial ones currently buys top-tier judging for all six or cheap judging for all six — per-order tiering is R1's literal demand and cuts judge cost on every mixed run without weakening the hard orders.

### C2 — holds_with_risk

Guard exists in-script at workflow.js:3054-3151; comparison is (r.change||'').trim() === change.trim() at :3112-3114 — outer trim only, so interior whitespace rewrap, case drift, or rewording plans a full duplicate. Both compared strings ride models with no digest: the planner types the change into plan.json (workflow.js:1074, 1145-1148) and a low-effort verifier copies rows back under prose-only verbatim instructions (:1274-1277, EXISTING_RUNS :167-186), the exact paraphrase-corruption class CLAUDE.md documents, while the resume-verdict channel recomputes a digest (:2751-2755) and this one does not. Also a minutes-wide TOCTOU window: two concurrent fresh invocations both pass the guard before either planner writes a run directory.

> **Improvement (major, R3 R6):** Normalize interior whitespace (collapse /\s+/ to one space) on both sides of the existing-run compare (:3112) and the resume change guard (:2807), and move the observation onto the digest-courier pattern — have lib/run-status.mjs print rows with a payload digest the script recomputes, as lib/run-verdict.mjs already does.
>
> **Why:** Prevents the documented multi-million-token duplicate-run day (0.9.0 postmortem) recurring via a rewrapped change string or a courier that paraphrases one row, the plugin's own field-observed corruption class.

### C3 — holds_with_risk

Checkpoint verified at workflow.js:3450-3516 and SKILL.md:169-173; gaps re-adopted on resume at :2947. Defeat: gapsWithhold requires wavedCount > 0 (:3451), so a plan whose orders are all coupled never checkpoints, and blockingGaps appears nowhere else in the workflow (only :3450-3503) — the flagged evidence gaps vanish from the result while the session is told to implement the coupled orders itself.

> **Improvement (major, R2):** When blockingGaps is non-empty and wavedCount === 0, still exit through the blocking_gaps checkpoint (or at minimum copy each gap into coverage.unreached beside the coupled notes).
>
> **Why:** Stops a fully-coupled plan from silently dropping planner-flagged blocking evidence gaps — the session would otherwise hand-implement orders against evidence the change itself demanded and never got, with a coverage block that says nothing about it.

### C4 — holds

planOnly read at workflow.js:592; checkpoint precedence gaps > stale > plan_only at :3458-3460; honest unpersisted-plan hint at :3463-3467; skill handling at SKILL.md:174-177; resume with plan_only re-parks because the gate is computed after the loader on both paths.

> **Improvement (major, R5 R3):** Compute a pre-dispatch size estimate from the persisted plan (orders x waves x expected dispatches per stage) and, above a threshold, surface it at the checkpoint and default pause_between_waves on, so long runs are split across invocations instead of started whole.
>
> **Why:** R5's early-detection clause currently has no mechanical carrier — plan_only and pause are caller-triggered only — and the catalogue's live incidents (16 agents killed mid-flight, ~525k tokens with zero completed agents; 11 started / 0 completed) are exactly the doomed-dispatch day this estimate prevents.

### C5 — holds_with_risk

Drift gated to resumed runs at workflow.js:3406/3421; failed observation fails closed via anchorLost -> staleWithhold (:3430-3432, :3456); per-order rulings and withheld ids in coverage (:3522-3533); DRIFT sited before worktree setup (:3404 vs :3535); rewritten-history anchors either diff honestly or trigger anchor_unreachable (driftPrompt :1256-1261). Defeat: a resume whose envelope lacks base_sha/branch — a case the planner prompt itself manufactures (:1169-1171) — skips the gate with one log line (:3446-3448), no checkpoint, no failed_channels, no unreached entry: fails silently open where a dead observation fails closed. Secondary: user_head and moved_files ride an un-digested low-effort model (:3422-3436); the prompt admits a dropped path is an invisible collision (:1252-1255).

> **Improvement (major, R5):** Treat a resumed run with no recorded drift anchor like anchorLost — withhold at the stale checkpoint, or at minimum add 'run-state' to failed_channels and an unreached entry saying staleness was never checked.
>
> **Why:** Closes the fail-open branch where a parked plan resumes against a possibly-moved tree with a clean coverage block, making a partial staleness check indistinguishable from a passed one — the exact failure the plugin exists to prevent.

### C6 — holds_with_risk

Refusal exists at workflow.js:908-925 with SHA_RE = /^[0-9a-f]{7,40}$/i (:480). Defeatable now: '<sha>~0' or '<sha>^{}' passes the regex yet re-resolves to itself, permanently and silently blinding the drift gate the refusal protects; a 64-hex SHA-256 id also passes. A legitimate 7-40-char all-hex branch name is falsely refused, but loudly and cheaply.

> **Improvement (minor, R5):** Extend the input refusal to sha-with-revision-suffix forms (trailing ~N / ^ / ^{}) and 64-hex object ids.
>
> **Why:** A caller pasting '<sha>~0' today parks a plan whose drift check compares the anchor to the anchor forever, so a moved tree is reported unchanged on every future resume — the silent direction of exactly the failure the existing refusal was built to make loud.

### C7 — holds

SKILL.md:181-183 says an empty checkpoint.resume_path means the planner could not persist and re-invocation replans from scratch; the workflow says the same in the checkpoint's unreached text (workflow.js:3466-3467), still returns the orders in the result (workOrders at :3497-3498), and the planner is charged to return '' rather than a path it did not create (:1152-1153).

## C-loop — C. Develop

### C8 — holds

workflows/vfa-develop.workflow.js:955-975 dispatch() catches a throw and a null return and routes both to haltedEsc(); :977-981 haltedEsc logs ESCALATION, appends a synthetic runtimeFinding to the trail, reason defaults 'budget' or is 'incoherent_result' (:970-971). Coherence exactly as cited: :482-493 coherentCoder flags done-with-no-commits and sha/head incoherence; :499-505 coherentNewSeries flags landed work with no worktree/branch; :507-519 coherentContinuation deliberately allows done-with-no-commits on a continued series. Adversarial residue: a coder fabricating a schema-valid, coherence-passing result (invented shas, named branch) passes this gate, but the verifier is then dispatched at the claimed worktree/branch (:2220-2224) and its facts fail the order loudly — no silent path exists.

### C9 — holds

workflows/vfa-develop.workflow.js:2526-2532 (fresh coder) and :2489-2494 (continuation) route status blocked/needs_context to esc(wo,'coder_blocked',...) with the summary in the finding; :2534-2541 additionally escalates a finished status with an empty commit series. implement() has no retry branch anywhere; the escalation shape carries state.branch and state.worktree (:933-942), so commits a blocked coder did land stay findable for retry_escalated.

### C10 — holds

workflows/vfa-develop.workflow.js:2595-2600 lostChain() builds a 'budget' escalation with a named runtimeFinding. It is wired at both loss points: :2552-2554 (verifyAndReview receives carried without state) and :3971-3972 (an order missing from the pipeline() results — chains are matched by id at :3933-3936, not by position, per the comment at :3931-3932). The escalation is pushed at :3974-3976, so an order whose whole stage vanished still appears in the result instead of silently dropping.

### C11 — holds_with_risk

workflows/vfa-develop.workflow.js:2218-2269 verifyUntilGreen loops on verifyOk (:2233) with no counter; :2206-2208 noProgress is blocked/needs_context OR zero commits OR unchanged head_sha; :2259-2266 escalates 'verify_failed_repeatedly'. Defeating sequence: a coder that lands one ineffective commit per fix round moves head_sha every time, so noProgress never fires; nothing compares the failing facts between rounds (the loop re-derives verifyFailureFindings at :2241 fresh each round), so an environment-caused or misdiagnosed red repeats identically until the platform's budget throw ends it as a generic 'budget' escalation via dispatch().

> **Improvement (major, R2 R3 R5):** Escalate 'verify_failed_repeatedly' when the failing-fact set (build status, failing_tests file+id pairs, non-discriminating entries) is unchanged across two consecutive fix rounds even though commits landed — the verify-side analogue of the review loop's §7.3(b) same-id-twice exit, still fact-shaped and counter-free.
>
> **Why:** Prevents the day a coder grinds attempt-commits against a red it cannot fix (flaky or platform-specific test, broken toolchain) in an unbounded loop that ends only when the usage limit kills the whole invocation mid-wave, taking every parallel order's session with it.

### C12 — holds_with_risk

All three computed exits exist as cited: workflows/vfa-develop.workflow.js:2345 (open.length===0 is the only success), :2349-2353 'review_not_converging' (same id unfixed two consecutive rounds), :2362-2368 'review_churn' (churned && churnedLastRound), :2383-2389 'no_fix_progress'; the open set folds prior blockers ruled not_fixed/regressed (:2322-2326) and fixes are re-verified before re-review (:2398); skills/develop/SKILL.md:236-260 is a verbatim copy and test/verbatim-blocks.test.mjs exists. But the flagged pathological alternation IS reachable: round N mints blocker X (churn-shaped — marker set at :2369), round N+1 rules X not_fixed exactly once (stuck cannot fire because unfixedLastRound was empty at :2404, and churned goes false, RESETTING the marker), round N+2 rules X fixed and mints Y (churn true again but the marker was just cleared) — a period-2 cycle where fixes always land commits, no id is unfixed twice consecutively, and no two churn rounds are adjacent. All three exits are defeated; only the platform's budget throw ends it. test/vfa-develop-review-tuning.test.mjs:120-132 pins the marker reset but only over a sequence that happens to converge in round 4.

> **Improvement (major, R3 R5):** Make churn detection survive one interposed carry round — e.g., escalate 'review_churn' once two churn-shaped rounds have occurred and every blocker id the loop ever minted has been ruled fixed, regardless of adjacency (a fact about the whole trail, not a counter).
>
> **Why:** Caps the interleaved form of the field-observed 11-round sampling-variance loop, which today burns a fable/opus reviewer + coder + verifier per cycle indefinitely until the account's usage limit kills the run mid-wave.

### C13 — holds_with_risk

workflows/vfa-develop.workflow.js:1642-1645 orders the merge agent to NEVER resolve, report conflicting paths verbatim, and stop; :4033-4040 sets integration.merge_stopped_at and lineStopped on any non-mergeOk result; :4017-4021 and :4048 turn every later approved order in the wave into approved_unmerged with its branch untouched; :3870-3873 defers all subsequent waves' pending orders; skills/develop/SKILL.md:264-272 frames the conflict as a planner defect and forbids hand-merging. The risk: the never-resolve rule is prose only — the merging agent (verifier charter, tools Bash/Read/Grep, agents/verifier.md:4) can resolve a conflict through Bash and report completed with a real read-back sha, which coherentMerge (:534-539) and mergeOk (:410-411) cannot distinguish from a clean merge; by this repo's own standard (CLAUDE.md: 'a skill instruction guards only the callers that read it'), the pipeline's one mutating git step is guarded below its own bar.

> **Improvement (major, R6):** Script the merge (R6): a lib/ CLI in the independence.mjs/ledger.mjs pattern that runs git merge --no-ff, aborts and prints the conflicting paths as JSON on any conflict, with the agent pasting its stdout verbatim — removing the model's discretion at the merge.
>
> **Why:** Prevents a helpfulness-trained model from silently resolving a conflict and corrupting the integration head that every later wave builds on — a defect that is undetectable downstream because the resolved merge produces a genuine sha and green-looking state.

### C14 — holds

workflows/vfa-develop.workflow.js:3543-3579: setup agent failure is caught (.catch→null at :3551-3554), coherentSetup (:541-549) rejects a 'completed' result missing worktree/branch/head sha, and the combined gate at :3556-3560 returns before any order dispatch with failedChannels 'integration' (:3561), deferred = waves.flat() (:3565) keeping the full plan resumable, and extraUnreached stating the plan is intact and why nothing ran (:3573-3577). A setup agent that lies coherently (nonexistent worktree) is caught at the first merge, which cds there and fails into the loud merge-stopped path (:4033-4040).

### GAP1 — broken

R1 (per-task configurable intelligence) has no mechanism at task granularity: the intelligence dial is run-wide — JUDGE_TIER/applyIntelligence at workflows/vfa-develop.workflow.js:669-683 set one judge model and one coderTier for the whole run; WORK_ORDER_ITEM (:33-62) carries role/contract/locus but no tier or weight field; every dispatch hardcodes effort and spreads the run-wide tier (coder 'high' + coderTier :2510-2513, verifier 'low' :2220-2224, reviewer 'high' + judge :2307-2312, fix rounds 'medium' + coderTier :2250-2254, :2372-2376). A ten-order run with one hard order prices all ten reviews at the same tier.

> **Improvement (major, R1 R3):** Add a planner-emitted per-order weight field to WORK_ORDER_ITEM (citing the increment-5 §1 envelope registry), clamped in JS to the run dial as a ceiling so the no-self-upgrade rule at :646-656 is preserved, and spread it into the coder/reviewer/fix dispatch sites in place of the run-wide judge/coderTier.
>
> **Why:** Wins direct token cost the run-wide dial cannot: trivial orders stop paying opus/fable review rounds while the one genuinely hard order in a run can be judged at the tier its stakes deserve — R1's stated requirement, currently unimplementable without raising the whole run.

### GAP2 — holds

The probe premise ('coder discipline is one fixed shape') is false at order grain — R4's shape judgment already exists end-to-end: role is a REQUIRED enum none/red/green/refactor on every work order (workflows/vfa-develop.workflow.js:33-45, required precisely so absence cannot silently restore the ordinary verdict); the planner is charged with the judgment itself, including 'when in doubt leave role none' and the do-not-split cost argument (:1107-1124); the coder's charge changes per role (roleSection :1369-1417, fix prompt :1508, agents/coder.md:73-89); the verifier's computed verdict inverts per role (redVerifyOk/refactorVerifyOk :387-408; role-specific failure findings :2115-2117); the reviewer's attack premise changes per role (:1872-1901); and wave verification carries the red/green carve-out (:416-424). The 'in between' shape is role none with tests committed alongside the feature (agents/coder.md:49-50). What is fixed regardless of shape is commit hygiene (agents/coder.md:52-65), which is shape-independent by design. No improvement — the requirement is served.

## C-post — C. Develop

### C15 — holds_with_risk

workflow.js:4056-4090 (wave verify, lineStopped on failure or dead verifier), :422-424 waveVerifyOk, :373-374 failuresConfinedTo (empty failing_tests never excused), :2165-2178 excusedRedFiles; SKILL.md:196-206 matches. Defeat: waveLine (workflow.js:1787-1798) carries no verify fields and waveVerifyPrompt (:1648-1668) has no journalSection, so the verify outcome is never durable; a resume of a run whose recorded wave failed verification (or returned 'unobserved', :4066) finds those orders landed and dispatches wave k+1 from that head — only the reconcile path (:3710-3752) re-verifies, and only when merges were unrecorded. Guarded by SKILL.md:307-310 prose alone.

> **Improvement (major, R2 R5 R3):** Persist the wave-verify outcome in the wave line (the tolerant ledger parser already carries extra fields, workflow.js:1776-1781) and have the resume path re-run the head verification the reconcile path already runs whenever the last recorded wave lacks a recorded pass.
>
> **Why:** Prevents a blind resume from building wave k+1 on a head the previous invocation measured red — the seven-orders-escalate-for-someone-else's-defect cascade (workflow.js:4052-4054) resurrected across an invocation boundary, currently blocked only by skill prose the resume never re-checks.

### C16 — holds_with_risk

workflow.js:4099-4119 as cited: ack checked (stop_reason !== 'recorded'), 'run-state' joins failedChannels, extraUnreached warns about re-dispatch, run continues; extraUnreached is a conjunct of complete (:860-862) so the loss forces complete=false; appendState chain survives a failed link (:1758-1770). Defeat: the sibling per-order writes at :2581 and :2583 discard the ack entirely — an order-approved/order-escalated line the run-state agent failed to write reaches no failedChannels entry and no coverage line, so only the wave line's failure is ever reported.

> **Improvement (minor, R5 R3):** Check the appendState ack at workflow.js:2581/2583 the way :4112 does, pushing 'run-state' and an extraUnreached line when a per-order record was not written.
>
> **Why:** A run whose order records silently fail today reports complete=true with clean coverage while its durable record holds nothing, and the next resume re-buys a full review per order it cannot trust.

### C17 — holds

workflow.js:4126-4129 sets lineStopped only when more waves remain, and sits AFTER the wave record (:4099), so a kill during the pause loses nothing; later iterations concat pending into deferred (:3870-3873); deferred flows into unreached and resumable.remaining (:869-879); SKILL.md:50-52 documents the opt-in, :307-310 the re-invocation.

> **Improvement (major, R5 R3):** Add a skill-layer trigger (or a pause-after-wave input beside the existing flag) telling the session to choose staged wave-boundary invocations when its budget is already deep — the workflow mechanism at :4126 exists complete; only a trigger is missing, and pause is off by default (SKILL.md:50-52) with nothing anywhere predicting a session-limit hit.
>
> **Why:** Both documented field incidents (a hard-killed run re-buying survey/plan/half of wave 1, and 16 probe agents killed mid-flight by a usage limit) would have become clean wave-boundary resumes instead of mid-wave losses — R5's early-detection clause is currently served by no mechanism at all.

### C18 — holds

workflow.js:4144-4157: .catch→null, failedChannels gains 'integration-review', extraUnreached states plainly that nothing has seen the merged change whole, extraRemaining gains 'integration'; criticals (:4159-4168) go to extraUnreached/remaining with no fix loop (comment :4133-4137; SKILL.md:276-279 forbids opening one without the human); complete=false via the extraUnreached conjunct (:860-862).

### C19 — holds

workflow.js:2843-2848 adopts escalatedPrior from the verdict; :3014-3019 retry_escalated is the only clearing lever and stage records are kept for the retry; :3835-3844 carried into escalations with reason 'carried_forward', empty trail, and the recorded cause when the order-escalated line carried one (:3826-3833); excluded from dispatch (:3860) and from salvage lists (:3025-3028), consumers blocked through the dep gate naming the root (:3895-3909). SKILL.md:185-194 matches: escalations first, carried_forward offered retry_escalated, empty trail never filled with a guess.

### C20 — holds

workflow.js:3895-3909: an order with an unlanded dep is never dispatched, pushed as {id, blocked_by} with root-cause chaining across topologically ordered waves (:3885, :3905-3907) so a wave-3 consumer names the wave-1 escalation, not the nearest link; blockedNote reaches coverage.unreached and remaining (:4218-4221). SKILL.md:208-216 carries the never-re-invoke-while-open rule and names the seven-orders field failure.

### C21 — holds_with_risk

SKILL.md:218-234 as cited: full order bodies (workflow.js:749-765 adds a digest-pinned fetch command on resumes), deps honored, contract majors held open, throwaway worktree at the pre-change SHA before the verifier, then the verbatim review contract (SKILL.md:236-260) pinned by test/verbatim-blocks.test.mjs:28. The verifier charter itself stashes and restores a dirty tree around the discriminator (agents/verifier.md:50, :59-60), so the wreck is mitigated; the residual named condition is prose-only enforcement of the throwaway-worktree rule (SKILL.md:227-228 admits it lives nowhere else in the runtime files) — a session that lost that instruction and a verifier killed mid-discriminator leave the user's live checkout moved to the base SHA with work in a stash.

### C22 — holds

workflow.js:4263-4291: the catch returns developResult with complete=false, failed_channels concat ['pipeline'], and resumable naming integration when merges landed. Every identifier the catch touches is declared before the try (orders/coupled/deferred/blocked/etc. :2608-2662, integration :776, RUN_ID :737; try opens :2664), and pre-try code cannot throw uncaught: change is coerced at :563-564, resolvePluginRoot guards env access (:704-718), and the early exits (:889-900, :908-911) all route through developResult.

## D-ledger — D. Run state and resume

### D1 — holds_with_risk

workflow.js:1787-1835 state builders mint seq via nextSeq(); :1747-1748 counter, :2913 seeded from verdict.seq_max; journalSection workflow.js:1333-1363 with coder-done :1471, verify-observed :1605, merge-observed :1638; verdicts derived not stored run-verdict.mjs:57-103. But ledger.mjs:108 checks the digest only when supplied ('expected &&') and the CLI defaults --digest to '' (ledger.mjs:196-197), so increment-9 §1's 'nothing altered can land in the state log' holds only while the haiku recorder retypes the flag intact.

> **Improvement (minor, R5 R6):** Make ledger.mjs refuse a --file state append that arrives without a digest, since every state line is workflow-minted and always has one.
>
> **Why:** A recorder that drops the flag while retyping the command — the exact failure class (2026-08-20) the writer was built for — can currently land a subtly altered approval or escalation line that the next resume trusts as ground truth.

### D2 — holds_with_risk

run-state.md:74-80 retry once then stop_reason unwritable and caller keeps going; verifier.md:115-118 'return your result anyway'; workflow.js:1750-1770 appendState .catch-swallow with chain survival. But only wave-close and reconcile inspect the recorder result (workflow.js:4112-4119, :3725-3732); the per-order appends at :2581-2583 discard it, and an agent's failed journal append lives only in its unread notes field — so mid-wave resumability can degrade with no trace in coverage.

> **Improvement (minor, R5):** Check the RECORDED result at the per-order appendState call sites (workflow.js:2581-2583) and mirror the wave-line treatment: push 'run-state' into failedChannels and an extraUnreached line naming the lost resume point.
>
> **Why:** Saves the day a user kills a session believing per-order approvals are durably recorded while every state append has been bouncing, so the resume silently re-buys reviews the run already closed.

### D3 — holds_with_risk

Courier pastes stdout (verdictPrompt workflow.js:1190-1215, run-state.md:27-46); digest recomputed in-script with pinned fnv1a/canonical copies (workflow.js:450, :460, :2751-2755); CLI refusal never retried (:2742, :2761); one retry at sonnet (:2759-2772); both tiers failing is a loud non-dispatching resumable halt (:2774-2793) — one-retry-up suffices because failure is always detected, never laundered. The gap: contract §3 (increment-9-contracts.md:169) says caller_notes follows the confirm-the-digest rule, but ledger.mjs:162-169 prints no digest, workflow.js:1029-1037 instructs no confirmation, and envelope.caller_notes_digest (run-verdict.mjs:637) is consumed nowhere — unlike orders, which pin and confirm (workflow.js:1058-1067).

> **Improvement (minor, R5 R6):** Have ledger.mjs notes print a digest over caller_notes and have callerNotes() quote envelope.caller_notes_digest for confirmation, exactly as orderFetch already does for orders.
>
> **Why:** Closes the one unpinned reference in the digest chain, so settled evidence edited in plan.json after ratification cannot reach every coder of a resumed run unnoticed — the tamper window the order pin was built to close.

### D4 — holds

workflow.js:2804-2825: trim-exact comparison of envelope.change against the supplied change, halt before any dispatch with both strings quoted verbatim and a resumable coverage block; guard runs after transport verification and before adoption, so no agent is bought under the wrong change. Only a plan recording an empty change (pre-envelope era) skips it, per D11's adopt-from-disk stance.

### D5 — holds_with_risk

run-verdict.mjs:698-712 clean short-circuit (empty ledger + empty branch glob returns clean with no further git); workflow.js:2829-2835 logs the skipped archaeology aloud. But run-verdict.mjs:703-705 collapses a FAILED `git branch --list` into the empty set, so git unable to answer (moved plan.roots, git missing from the CLI's environment) reads as 'no branches' — clean:true on an empty ledger, or branches:{} and next_action 'code' for approved work — while the same file insists 'unable to answer is not the same as answering no' for ancestry (:740-743) and names the harm of a wrong code verdict itself (:729-734: a dispatched coder re-anchors the branch, reviewed series survives only in the reflog).

> **Improvement (major, R5):** Distinguish git command failure from genuine emptiness in gitFacts: a failed branch listing or rev-parse returns a refusal (or a note that forces the dirty path with no salvage claims), never clean:true or next_action 'code'.
>
> **Why:** Prevents the confident wrong answer the file exists to prevent — a resume over a moved or git-broken root reporting 'nothing to salvage' and re-anchoring branches that hold committed, reviewed series.

### D6 — holds

run-verdict.mjs:451-518: ladder walks merge→review→verify→continue-series→code, each trusted rung requiring record AND matching git head (:474-483 two-witness merge, :485 approve, :489 verify), rebuild at the bottom (:517); dialect gate :493-514 with speaksCoderDone :412 sends a pre-0.14 run with commits to verify, never continue-series. The one constructible misfire — mixed-dialect resume drawing continue-series on a finished legacy series — costs one coder round and is absorbed by workflow.js:1511-1513 ('if the series is in fact already complete, add nothing and say so'). Replay ordering, torn-line tolerance, and the permissive-direction 'recorded' gate verified at run-verdict.mjs:106-197, :296-328, :379-404.

## D-salvage — D. Run state and resume

### D7 — holds_with_risk

run-verdict.mjs:474-483 (ancestry never trusted alone; witness = approval head match OR merge-observed line); workflow.js:2865-2875 (reconciled keyed on typed merged_source, not prose); workflow.js:3710-3757 (corrective wave line, loud on write failure, reconciled head verified once, lineStopped if red). Boundary kills land on the right rung: torn merge line is covered by the approval witness; both witnesses lost falls conservatively to review. The named risk is the mirror direction: run-verdict.mjs:464-466 returns 'none' for landed ids per the run log with no git corroboration, so after a foreign move/rewrite of the pipeline-owned integration branch (which workflow.js:3602-3609 only warns about and continues past) merged work missing from the head is still reported merged and the dep gate (workflow.js:2659-2662) dispatches consumers against a head lacking their providers.

> **Improvement (major, R2 R5):** When the recorded-vs-observed integration head mismatch fires, corroborate each landed order's branch ancestry against the observed head (run-verdict already computes already_merged per branch) and withhold the run for a human ruling when a landed order is no longer an ancestor, instead of warning and continuing.
>
> **Why:** Saves the day a rewritten integration branch lets the run report vanished merges as landed and build later waves on a head missing their providers — caught today only by a coverage note while dispatch proceeds.

### D8 — holds

workflow.js:2688-2704 (corruptHalt: failed_channels ['run-state'], nothing dispatched, explicitly never 'every order coupled'); workflow.js:2774-2793 (both courier tiers failing → loud non-dispatching halt with resume guidance); workflow.js:2797-2800 (unreadable plan routes to corruptHalt); run-verdict.mjs:832-837 (deleted plan.json travels as a valid enveloped 'unreadable' answer, not a transport failure); workflow.js:2747-2756 (digest recomputed over the arrived object). Adversarial parse-but-empty plan ({}) degrades to 'no work orders produced' with nothing dispatched and complete=false. R6 served: the whole verdict is script arithmetic in lib/run-verdict.mjs.

### D9 — holds_with_risk

run-verdict.mjs:757-762 (dirty collected via git status --porcelain, comment: adopted by nobody automatically); workflow.js:1484-1490 (continuation coder is told to rule on dirty: adopt only where obvious, else git checkout --). The risk: a salvaged order at the verify rung is measured in its dirty worktree — implement() adopts found.worktree (workflow.js:2437-2444), verifierPrompt (workflow.js:1553-1617) has no clean-tree or git-status step, commit-series.mjs inspects commits only, and facts.dirty is consumed nowhere on this path. A kill mid-fix-round leaves half-applied uncommitted edits; resume can verify green on a tree whose dirty half never merges, and wave verify catches it one stage later, misattributed to the merge.

> **Improvement (major, R6 R3 R2):** Before dispatching verify on a salvaged worktree whose verdict row carries non-empty dirty, either reset the tree to head_sha as a deterministic precondition (script/lib, like commit-series.mjs) or route the order through the existing continuation-coder dirty ruling first.
>
> **Why:** Prevents a measurement attributed to a head it was not measured at — a red commit series approved and merged because uncommitted leftovers made the tree green — surfacing later as a bogus 'merge broke the build' after review and merge were already bought.

### D10 — broken

workflow.js:3668-3689: when the worktree pass fails or omits a path, dropSalvage() demotes verify/review/continue-series orders to fresh code; workflow.js:1419-1422: the fresh coder's first instruction is 'git checkout -B <branch> <integration head>', force-resetting the branch, so the committed (possibly verified-green) series survives only in the reflog. The comment at workflow.js:3670 ('loses nothing — its branch keeps the commits') is contradicted by run-verdict.mjs:729-735, which names this exact re-anchor hazard as the failure the base_sha fallback exists to prevent. The needTrees filter (workflow.js:3651-3653) protects only merge-rung orders; the worktree cut itself is a deterministic 'git worktree add' performed by a low-effort model agent (workflow.js:3660-3666), whose hiccup is the whole trigger.

> **Improvement (major, R3 R6 R5):** Move worktree materialization into a lib CLI run by the courier (the increment-9 pattern run-verdict.mjs already uses), and when materialization still fails, withhold those orders like staleWithhold instead of dropSalvage — never dispatch a fresh coder at 'code' onto a branch that holds commits.
>
> **Why:** Saves the day a resume after pruned worktrees plus one flaky agent response rebuilds every in-progress order from scratch and orphans reviewed, committed series — rebuild chosen where the cheaper salvage was retrying one deterministic git command.

### D10 — holds_with_risk

The claimed behaviors exist: attach-never-force (setupPrompt workflow.js:1305-1309 — note the catalogue cite ':3286' is wrong, and the guard is prompt prose backed only by coherentSetup shape checks at workflow.js:541-549); observed-vs-recorded head mismatch logged, git wins (workflow.js:3586-3609); pruned worktrees re-cut for salvaged branches (workflow.js:3631-3690). The risk: nothing guards two live invocations of the SAME run — the existing-run guard sits only on the fresh path (workflow.js:3051-3068), no lock/lease token appears anywhere in the workflow, both resumes continue seq from the same verdict.seq_max (workflow.js:2913) minting colliding seqs the replay explicitly cannot order (run-verdict.mjs:399-405), and both attach to the same integration worktree. run-status derives 'in-flight' from artifacts alone, so the runs skill offers resume for a run whose invocation may still be alive.

> **Improvement (major, R5 R6):** Add a lease/heartbeat file under the run directory, taken and refreshed via lib/ledger.mjs by the resuming invocation's run-state courier, with the workflow halting on a fresh lease unless the caller overrides.
>
> **Why:** Prevents the day a user resumes a hung-looking but still-live run from a second session and the two invocations interleave merges into one integration worktree and append duplicate-seq ledger lines that permanently degrade replay ordering.

### D11 — holds

workflow.js:2955-3010 (roots, intelligence, programme, slice adopted from the plan on disk with every override logged); workflow.js:2994 (base adopted unconditionally into envelopeBase, feeding the drift anchor at :3416-3417); workflow.js:2807-2825 (only 'change' must match or the run halts before any dispatch — which also catches the argless-relaunch incident that gave investigate an empty question). R1 shortfall flagged: intelligence is a single envelope string (run-verdict.mjs:633) applied as one run-wide dial via applyIntelligence (workflow.js:2984-2992); work-order rows (run-verdict.mjs:562-613) carry no per-order tier, so task-granular intelligence cannot be expressed or survive a resume.

> **Improvement (major, R1 R3):** Add an optional per-order intelligence tier to the work-order schema and the plan envelope field registry (increment-5 §1), consumed by the coder/judge tier selection at dispatch and carried through the verdict rows on resume.
>
> **Why:** Wins R1's actual ask — a run with one gnarly contract order and five trivial ones currently pays one dial for all six, and a resume can only restore that single dial.

## E-runs — E. Runs skill

### E1 — holds

C:\work\claude\vanillafairy\vf-agentics\lib\run-status.mjs:261-266 (labelOf appends 'N coupled, not tracked here' / 'N escalated' qualifiers so the bare word never travels alone), :343-345 (readRuns filters 'archived', sorts runstamps lexicographically and reverses — newest first), :1-2 and no write call anywhere in the file (every field recomputed per call, nothing stored); C:\work\claude\vanillafairy\vf-agentics\skills\runs\SKILL.md:33-37 (read label, not status). One stale rationale, no behavioral effect: SKILL.md:35-36 claims escalations 'leave no trace in state.jsonl', but run-status.mjs:174-180 reads 'order-escalated' state lines and wave-line escalated arrays — the printed label still carries the qualifier, so nothing overclaims; prose-only, no improvement filed.

### E2 — holds_with_risk

C:\work\claude\vanillafairy\vf-agentics\skills\runs\SKILL.md:64-65 (no runs: say so and stop, do not offer to start one) exists as cited. Defeating condition: run-status.mjs:340-349 — the readdirSync catch returns [] for ANY error, with the comment 'no runs directory: this repository has never been planned against'; an EACCES/EIO on .claude/vfa/runs (AV lock, cloud-synced folder, permissions) is indistinguishable from an empty repository, so the skill tells the user 'no runs' while parked runs exist on disk — 'I couldn't read' laundered into 'there is nothing there' (the plugin's own §7 distinction).

> **Improvement (minor, R5 R3):** In readRuns, treat only ENOENT as 'never planned'; on any other readdir error return an error marker in the JSON so the skill reports 'could not read the runs directory' instead of 'no runs'.
>
> **Why:** Prevents the day a transient IO/permission failure makes a user believe their parked plans vanished and re-buy a full survey+plan for work already sitting on disk.

### E3 — holds

C:\work\claude\vanillafairy\vf-agentics\lib\run-status.mjs:147-155 (!plan returns status and label 'unreadable', never 'planned'), :53-61 (torn/refused partition_raw becomes a note — waved set declared unknown, not pessimistically empty-complete), :204-205 (any partition note forces status 'unreadable' even when state lines parse); SKILL.md:45-47 (report as unknown, never as planned). Adversarial degenerate plans all land correctly: JSON.parse of null hits the !plan branch; a string/number/array plan has no partition_raw, JSON.parse('') throws at :55, note set, unreadable. No input found that reaches 'planned' through a damaged plan.json.

### E4 — holds_with_risk

The interruption machinery itself holds: run-status.mjs:91 (unconfirmedMerges pins status at 'in-flight' — a journal-only merge never promotes to 'integrated', closing the acb86ec double-buy path), :115-123 and :161-165 (journal-only merges detected and narrated), :188-191 (approved_unmerged from wave-line snapshot + order-approved lines, filtered against merged), :141-145 and :238-239 (measured_unapproved says 'a measurement is on record', greenness never recomputed here, matching SKILL.md:55-60), :293-301 (torn JSONL line skipped with a note, never thrown). BUT the catalogue's claim 'git unable to answer ancestry returns null, not false, so landed isn't demoted' is false at the status level: isAncestor (:326-336) does return null, yet statusOf:92 is `landedInTree === true ? 'landed' : 'integrated'` — null and false produce byte-identical output, no note is emitted, and the docstring at :73-76 calling the tri-state load-bearing describes a hazard the code does not avoid. A landed run whose base branch was later deleted (exit 128 → null) reads 'integrated' forever, indistinguishable from genuinely-unlanded.

> **Improvement (minor, R5):** When landedInTree === null and the status would read 'integrated', push a note ('git could not answer whether <head> reached <branch>') so unmeasured is distinguishable from measured-and-not-landed.
>
> **Why:** Prevents the day a user, told 'integrated' about a change that already landed on a since-deleted branch, manually re-merges the integration head or keeps hunting for a merge that already happened.

### E4 — holds_with_risk

Second defeating condition, same scenario: hasState at run-status.mjs:207 counts only successfully parsed entries (state.length > 0 || journal.length > 0), while readJsonl:296-299 converts a torn line to a note and drops it. A run killed mid-write of its FIRST record (one torn journal line, empty state.jsonl) derives 'planned' — the exact 'invites re-planning work that may already have merged' hazard SKILL.md:45-47 names for unreadable plans, arriving through the journal instead: branches with commits can exist in git while the row claims nothing ever ran. Develop's own guards (existing_run blocks 'planned' matches; the clean-run check does git branch --list) contain the blast radius, so this mislabels rather than double-buys — but the label overclaims cleanliness, which is the cluster question.

> **Improvement (minor, R5):** Count skipped-line notes from state.jsonl/journal.jsonl as activity evidence in the hasState input, so a run whose only record is a torn line derives 'in-flight', not 'planned'.
>
> **Why:** Prevents the day a user treats an interrupted run with live commit-bearing branches as a deliberately parked plan (Step 2 recommends in-flight runs precisely because interrupted work is the likelier intent) and archives or ignores it.

### E5 — holds

C:\work\claude\vanillafairy\vf-agentics\skills\runs\SKILL.md:83-88 (carry only change + resume_path; roots/caller_notes/intelligence explicitly forbidden from riding the conversation — they travel through the loader under schema, matching the bytes-never-ride-a-model contract) and :100-103 (archive is move-only into runs/archived/, explicit go required, deletion forbidden); run-status.mjs:343 excludes 'archived' from listing so archiving cannot make a run read as absent-with-error. Adversarial handoff of an unreadable run (change '') lands in develop's corruptHalt rather than dispatching; the change taken from the run's own plan.json tautologically satisfies develop's change guard, so no mismatch-halt is reachable through this path. Rubric fit is clean: derivation is 100% script (R6), the skill owns no judgment (SKILL.md:13, :111-115), and resume-cost honesty ('pays for no survey and no planning', SKILL.md:90-91) serves R5.

## F-design — F. Design

### F1 — holds_with_risk

All cited mechanisms exist: skills/design/SKILL.md:26 (Step 1 evidence-first), :65 (Step 1b sweep), :119-127 (one-question interview with recommendations), :155-166 (2-3 parallel analyst stances), :187-199 (mandatory vfa-probe, no hand-rolled probe), :229 + :265-287 (artifact with vfa:section markers), :327-343 (single change to develop, programme to plan). But the single-change handoff at :330-335 has the model paste '<the ratified change, in one paragraph>' plus the settled-evidence block as notes, while lib/programme.mjs:663-666 states 'no model sits between a ratified document and the planner's prompt' — true only in programme mode — and develop's duplicate guard is an exact trimmed string compare, vfa-develop.workflow.js:3114: (r.change || '').trim() === change.trim().

> **Improvement (major, R6 R3):** Extend lib/programme.mjs marker extraction (sectionsOf/missingSections already exist) with a single-file CLI mode and have design Step 5 pass develop the script-extracted change and settled-evidence bytes instead of a model paste.
>
> **Why:** A re-typed change string on a second invocation or resume silently defeats the exact-match existing_run guard (workflow.js:3114) and the resume change guard, buying a duplicate run — the same paraphrase failure class (a loader paraphrased 13 of 14 orders) that increment-9 eliminated everywhere else.

### F1 — holds_with_risk

skills/design/SKILL.md:31 and :71 pass intelligence to vfa-survey and vfa-find-existing-solutions, but the probe call at :191-192 passes only {artifact, roots, context}; vfa-probe.workflow.js:77-80 parses exactly those three inputs and would ignore an intelligence arg; probers dispatch with fixed effort (workflow.js:195 'low', :226 'high') on vf-agentics:analyst, which agents/analyst.md:5 pins to model: opus. The ratification gate's probe therefore runs at one fixed tier regardless of the session dial.

> **Improvement (major, R1 R3):** Accept an intelligence arg in vfa-probe (mapping tier to prober model as the survey does) and pass it from design step 3.
>
> **Why:** A low-tier session stops billing opus for every probe axis, and a max-tier session stops having its ratification gate judged by a weaker model than the session that wrote the design — the exact mismatch SKILL.md:41-52 says the dial exists to prevent.

### F2 — holds

skills/design/SKILL.md:89-91: 'An unfinished sweep is a blocking open question when the design leans on building from scratch — you cannot ratify "we must write this" on a search that never reached the registry.' Backstopped by the probe's reinvention axis at :200-204, which explicitly targets 'what step 1b would have found had it been run', so even a skipped sweep gets an adversarial check.

### F3 — holds_with_risk

Ladder at skills/design/SKILL.md:137-141, hard rule at :143-145. tools/rules/design-gate.mjs:56-62 pins the /does not hand off/ sentence, but the rule's own header (:23-30) says it checks only that the clause is NAMED and is satisfied by the token anywhere, even in a sentence ruling it out. Nothing mechanical can inspect the blocking list itself: SKILL.md:269-273 marks only change/decisions/settled-evidence, open questions carry no marker, and programme dispatchability is markers-only (lib/programme.mjs:959, :511-513) — so a leaf with markers and an open blocking question is script-dispatchable, held back only by model discipline at :306-307.

> **Improvement (major, R6 R3):** Add open-questions to the marked sections and make the extraction path (assembleNotes / the single-file extractor) refuse a document whose marked open-questions section contains a blocking entry.
>
> **Why:** design-gate.mjs:59-61 itself names the day: an unanswered blocking question that reaches the planner as a blocking gap costs one whole survey and one planning pass to rediscover — a script check at the consumption point closes the only enforcement gap.

### F4 — holds

skills/design/SKILL.md:183-185: skip legal only when 'the decision space is genuinely pinned', with 'Record the skip and the reason in the design document, so a skipped panel is visible rather than silent.' The record lands in the artifact the user reads at the HARD GATE (:316-319), so the skip is human-auditable at the moment it matters; skipping when pinned is a legitimate R3 cost reduction.

### F5 — holds_with_risk

The programme-leaf mechanism is fully script-computed and fails safe: lib/programme.mjs:955-959 computes designed[id] from missingSections(leaf, LEAF_SECTIONS) on disk, :511 derives awaiting-design, :701-704 counts an empty section as missing, and sectionsOf breaks out safe on an unterminated marker (:681); skills/programme/SKILL.md:110-112 and skills/design/SKILL.md:281-284 match. But this recovery exists only where programme.json exists: a single-change design — the skill's own common case (SKILL.md:108) — persists nothing before Step 4 writes the file (:229-231), so a session death mid-interview loses the paid survey coverage, every user decision, panel drafts and probe findings; the catalogue's live incidents (docs/2026-08-27-scenario-catalogue.md:29-41) show exactly this loss class occurring.

> **Improvement (major, R5 R2 R3):** Have design write and commit the draft document incrementally — survey coverage after Step 1, each user decision as Step 2 records it — keeping markers last exactly as :285-287 already mandates, so marker-absence still reads as unfinished.
>
> **Why:** A session-limit kill mid-interview then costs one question instead of the whole interview plus a re-bought survey — the direct R5 hit the 2026-08-27 incidents demonstrate, with the completeness signal untouched.

### F6 — holds_with_risk

skills/design/SKILL.md:206-208 (ratifiable is a computed count, false while any ambiguity is open or any axis unexamined) and :225-227 (every ambiguity resolved with the user) are as cited, and no bounded retry or counter language exists anywhere in the file. But the catalogue's 'count-based gate recomputed' clause has no source: nothing in Step 3 (:187-227) instructs re-running vfa-probe after the document is edited to resolve ambiguities, so ratifiable was computed over the pre-edit artifact and the judgment that an edit resolved the finding is the session's own — the exit-condition migration into model self-assessment that vfa-probe.workflow.js:25-29 says the computed gate exists to prevent.

> **Improvement (major, R6):** Mandate re-running vfa-probe on the amended document after ambiguity resolutions, looping goal-shaped with no counter until the script computes ratifiable over the artifact actually being ratified.
>
> **Why:** A resolution edit that fails to resolve the ambiguity or mints a new one currently ships as ratified, costing the rework-round-at-integration the design ladder's own archetype names (SKILL.md:217-220).

### F7 — holds_with_risk

HARD GATE at skills/design/SKILL.md:316-319 ('ratified in as many words', silence and looks-good excluded); presence lint-pinned by tools/rules/design-gate.mjs:49-54; the scoped-mode exemption (:321-325) is deliberately mirrored by design-gate.mjs:87-90, so the asymmetry is designed, not drift. Named risk: markers are written at :285-287 as 'the final act of the pass', before the gate at :316 and the handoff at :327, and F5's own signal teaches that marker-complete means finished — so a session killed between artifact-write and the user's ratification leaves a committed, marker-complete, unratified document indistinguishable from a ratified one to any later reader.

> **Improvement (minor, R5):** In single-change mode, emit the section markers only after the user's ratification, so marker-completeness coincides with the ratified state (scoped mode, which has no per-leaf ratification, keeps markers-as-final-act unchanged).
>
> **Why:** Closes the window where a resumed session or human hands an unratified design to develop on the strength of its markers, bypassing the one human gate the phase exists for — at zero added cost, since it only reorders one existing act.

### F8 — holds

skills/design/SKILL.md:289-314: only the frontier leaf written at ratification (:290-291), scoped re-invocation with programme/slice args (:295-297), probe reruns per leaf with root and predecessors probed as repo evidence rather than author context (:303-305), step 5 skipped (:309-310); skills/programme/SKILL.md:98-108 matches clause for clause, and dispatchability is script-derived from plan-exists plus marker completeness (lib/programme.mjs:955-959, :511-513). Change extraction and notes assembly in scoped mode run through the CLI byte-for-byte (skills/programme/SKILL.md:120-130), satisfying R6 on this path; the scoped blocking-ambiguity gate's prose-only enforcement is already covered under F3.

## G-probe — G. Probe

### G1 — holds_with_risk

Mechanisms exist as cited: artefact-only prompt with explicit no-author-reasoning clause (workflows/vfa-probe.workflow.js:163-167), standing axes (:85-109), stable ids and axis attribution (:242-245, test/vfa-probe-scenarios.test.mjs:125-137), computed gate ambiguities===0 && unexamined===0 (:263), gap does not block (test:98-106), no fix loop (skills/probe/SKILL.md:86-89). RISK: the `context` arg is injected verbatim into every prober prompt (:154, asserted by test:160-172) and is composed by the design session — the document's author (skills/design/SKILL.md:192); the 'one line, never the author's defence' bound is prose only (skills/probe/SKILL.md:47-48), so the artefact-only handoff — the workflow's own property #1 (:21-24) — has an unenforced bypass in its primary caller. Also a rubric fact: no intelligence arg is parsed (:77-80); effort is hardcoded 'low'/'high' (:195, :226), so R1 is unserved by this workflow.

> **Improvement (major, R6 R2):** Enforce the context bound in the workflow script — clamp context to one short line (or strip it from prober prompts and surface it only in the report), refusing longer input loudly.
>
> **Why:** Prevents the design session — the author — from priming all probers with its own intent on the ratification-gating probe, which is exactly the blind-spot-sharing reviewer the workflow exists to remove; the deterministic bound currently lives in prose a model must obey.

### G2 — holds_with_risk

The no-padding clause is in the prompt (workflows/vfa-probe.workflow.js:168-169, asserted test:171); an empty findings list from a live prober counts as examined, so a clean probe stays ratifiable:true and complete:true (test:41-51). RISK: PROBE_FINDINGS has no stop_reason (:58-73) — unlike AXES (:41) and unlike CLAUDE.md IRON LAW §2's rule for search-shaped outputs — and coverage.incomplete is hardwired [] (:275), so a prober that satisficed and returned a valid-but-truncated empty report is indistinguishable from an exhausted attack: 'looked partly' is a missing third category, laundered into nothing-found.

> **Improvement (major, R2):** Add a stop_reason enum (exhausted | stopped_early | artefact_unreadable) to PROBE_FINDINGS and route any non-exhausted axis into coverage.incomplete with ratifiable forced false.
>
> **Why:** Stops a half-read document from computing ratifiable:true — a partially-attacked axis today produces the same empty list as a fully-attacked clean one, which is the exact partial-indistinguishable-from-whole failure this plugin exists to prevent.

### G3 — holds_with_risk

Correct as documented: reconcile-by-index puts a dead prober's axis into unexamined (workflows/vfa-probe.workflow.js:236-246), failed_channels gains 'probe' (:248-251), ratifiable forced false (:263), dropped/unreached/resumable.remaining name it (:274-287); test:108-123 pins all of it, and the no-.catch probers survive because parallel resolves a rejected slot to null per the documented runtime the harness mirrors (test/harness/workflow-host.mjs:12-13, :66-67). RISK: resumable.remaining is consumed by nothing — the workflow accepts only artifact/roots/context (:77-80), no axis-subset or prior-findings arg, and it is stateless (no disk), so after a partial prober death a re-run re-buys every surviving high-effort axis; the 2026-08-27 incident (16 probe analysts killed by a usage limit, ~525k tokens, zero salvage — catalogue Observed incidents) is this exact fan-out shape with no early limit detection and no partial persistence.

> **Improvement (major, R5 R3):** Accept an axes-subset (plus prior-findings) argument so a resume dispatches only resumable.remaining and merges with the surviving axes' reports, and have the skill's resume step pass it.
>
> **Why:** On the incident-proven day a limit kills part of the fan-out, resume costs only the dead axes instead of re-buying 4-8 high-effort probers wholesale, and remaining stops being a decorative field nothing reads.

### G4 — holds_with_risk

Degrade path exists as cited: null/unreadable discovery → failed_channels 'repo-axes' + standing axes still run (workflows/vfa-probe.workflow.js:203-212), honest no_guidance_found stays complete (:213-215, test:41-51), unreached names the unread guidance (:279-283, test:139-149). RISK: ratifiable (:263) ignores failedChannels, so with repo-axes failed the result is ratifiable:true / complete:false — and the design skill's ratification gate reads result.ratifiable, describing it as 'false when any axis went unexamined' (skills/design/SKILL.md:206-208), which is untrue for axes that were never discovered; only prose ('read the coverage block', probe SKILL.md:72-74) stands between an unexamined project-standard and ratification, and test:139-149 never asserts ratifiable in this branch. By the repo's own doctrine (CLAUDE.md: 'a skill instruction guards only the callers that read it'), this belongs in the computed gate.

> **Improvement (major, R2):** Fold the failed repo-axes channel into the computed gate — ratifiable = ambiguities===0 && unexamined.length===0 && !failedChannels.includes('repo-axes') (equivalently: ratifiable implies coverage.complete).
>
> **Why:** Prevents the day a design is ratified on a mechanically-passing gate while the project's own review standard was never even discovered — nobody-looked laundered at the axis-discovery level, one level above the prober death the code already guards.

### G5 — holds_with_risk

As cited: empty/whitespace artifact returns without dispatch, ratifiable false, unreached says so (workflows/vfa-probe.workflow.js:77-78, :174-190; test:151-158); a repo axis with an empty charge is filtered before dispatch (:204, test:68-77); non-string artifact degrades to '' via the typeof guard (:78). RISK: the guard checks only emptiness — a nonempty wrong path dispatches the full high-effort fan-out against a nonexistent document, and since probers cannot report the artefact unreadable (no stop_reason, :58-73) and their notes are never read (:242 consumes only findings), a typo can come back ratifiable:true and complete:true.

> **Improvement (minor, R3 R6 R2):** Have the skill's Step 1 verify the artefact path exists (the main session has the filesystem the workflow lacks) before invoking, refusing loudly on a missing file.
>
> **Why:** A one-line deterministic check saves 4-8 high-effort probers attacking a typo and blocks the false-clean ratifiable result a nonexistent document currently produces.

### G6 — holds

All three cited clauses exist: self-probe named as the substantially weaker instrument that misses premise defects (skills/probe/SKILL.md:27-29), the ban on reporting a clean probe while coverage.complete is false (:72-74), and the dispatch-failure rule — say so, never substitute a self-probe silently, offer it named as weaker, user decides (:91-99). These are main-session instructions by nature (dispatch failure happens before any workflow code runs), so prose is the only available layer here; the computed artifacts they lean on (ratifiable, coverage.complete) exist in the workflow (:263, :273).

## H-plan — H. Plan

### H1 — holds

All cited anchors verified: skills/plan/SKILL.md:21-23 (one name, two grains, plan decides slices / planner agent decides work orders), :35-48 (the artifact is the authorization, deliberately no approval record to go stale), :55-58 (a slice is a deliverable, not a layer), :122-133 (the loader is the check, not the author's reading), :192-196 (what this skill is not). R6 is genuinely served: every deterministic step is a script, not a model — validation via parseProgramme (lib/programme.mjs:77), machine-written graph view via spliceView/graphView (:815-840), and even the merged-to-base slice list is derived from the log rather than typed (:1103-1112). A torn programme.json write fails closed at load (:923-931). R1/R4 are inapplicable (the skill launches no agents and explicitly delegates work-order shape to the run-level planner).

### H2 — holds_with_risk

All eleven rejection categories of increment-5-contracts.md:120-137 exist as code, verified one by one: shape (lib/programme.mjs:79-81), missing/duplicate id (:95-101), bad kind (:107-110), parent naming no node or a slice (:116-126), containment cycle (:131-135), deps entry malformed/naming no node/naming a group (:143-152), dependency cycle (:159-161), provides without name or paths and duplicate contract name (:167-179), consumes outside the transitive-deps closure (:184-197), bare ordering with no reason (:203-210), invalid advance (:84-90); no repair path exists. Two defeats: (1) refusal 8 tests only Array.isArray(paths) && length>0 (:170), so "paths": [""] — or [null], [42] — loads green, and under() (:615-619) can then never match any file, leaving the contract permanently invisible to driftCheck: the exact 'a name without paths checks nothing' defect the refusal names (:171-173). (2) a non-array deps/provides/consumes (e.g. "deps": {}) throws an uncaught TypeError from the for...of loops (:141, :166, :187) because loadProgramme's try/catch covers only readFileSync+JSON.parse (:923-928) — a stack trace instead of the 'named diagnostic, never a repair' contract (programme.mjs:50-53, increment-5-contracts.md:122-123), and non-JSON stdout for the session parsing the loader's output.

> **Improvement (minor, R6):** Extend parseProgramme to element-level validation: refuse any provides.paths element that is not a non-empty trimmed string, and refuse non-array deps/provides/consumes with a named diagnostic instead of letting for...of throw.
>
> **Why:** Prevents the silent day: a model-drafted contract with an empty or placeholder path element loads green and the drift check never flags that contract again, so a pending slice designed against moved code is dispatched with no ruling and nothing anywhere says the check was blind.

### H3 — holds_with_risk

The revision section exists as cited (skills/plan/SKILL.md:165-184: pending-subgraph scope, delivered-never-edited, drift flag and follow-up work auto-route, re-run loader + --write-view) and driftCheck exists at lib/programme.mjs:634 with the honest flagged/unexamined split (:647-658). But the scope invariant is enforced by nothing mechanical: parseProgramme takes no events (:77), and deriveProgramme looks events up only by the ids the current graph carries (:484, :496-501), so a revision that renames or drops a delivered slice revalidates green while its delivered/accepted events silently orphan and the slice re-derives as ready/awaiting-design — only its RUN rows surface, as unattributed (:467-474, :801-808); the events themselves never do. Compounding risk: after first dispatch two copies of programme.json exist by design (SKILL.md:150-156) and designRoot (:852-857) silently prefers the worktree copy, a precedence the skill never states — a revision edited into the root copy validates against a different file and reports success.

> **Improvement (major, R2 R3):** Have loadProgramme cross-check the event log against the revised graph and fail (or loudly degrade) when any delivered/accepted/merged-to-base event names a slice the graph no longer carries, in the same loader run the revision already executes.
>
> **Why:** Prevents the double-buy day: a defective revision orphans a landed slice's events, the programme layer derives it as buildable, and a full develop run is re-purchased for work already merged — the same buying-the-change-twice failure the run-level duplicate guard exists to stop, unguarded one level up.

### H4 — holds

skills/plan/SKILL.md:186-190 names the TodoWrite fallback, tells the session to carry the dependency order in the list itself, and requires saying aloud that it fell back — exactly as catalogued. The claim is lint-backed, not prose-only: tools/rules/task-tool-fallback.mjs:43 applies to every SKILL.md, :46-47/:55-61 fail any file naming TaskCreate/TaskUpdate without the TodoWrite token. The rule's acknowledged vacuous-pass limit (:29-31) is harmless here: plan's Task-tool use is progress tracking of a revision conversation, not result delivery — the durable outputs are programme.json and plan.md, so a degraded task list loses nothing the artifacts do not already carry.

## I-programme — I. Programme

### I1 — broken

C:\work\claude\vanillafairy\vf-agentics\lib\run-status.mjs:147-155 builds every unreadable run row with programme:'' and slice:'' (status 'unreadable'), and C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:468 `if (!row.programme && !row.slice) continue` silently discards exactly those rows — so the fail-closed branch at programme.mjs:494-496 ('an attributed run cannot be read' -> unknown) is unreachable dead code: attribution (:469-470) requires a readable plan.json, unreadability requires an unreadable one. A slice whose run's plan.json is torn (e.g. a kill mid-write) therefore derives 'ready' via programme.mjs:510-513, and the routing table (SKILL.md:78) sends 'ready' straight to step-3 dispatch — a duplicate develop run over a programme branch that may already hold that run's merged orders. Table totality otherwise holds: the two statuses without rows ('landed', gap-free 'delivered') require no action (:549-550).

> **Improvement (critical, R5 R2):** Tag run rows read from the programme worktree's runs directory (programme.mjs:962) as programme-owned by provenance, and treat an unreadable row there as degrading the programme to unknown instead of letting :468 drop it.
>
> **Why:** A plan.json torn by a session killed mid-write currently converts 'in-flight, never re-plan' into an automatic duplicate dispatch over already-merged work — the exact double-buy the layer's unknown state exists to prevent.

### I2 — holds_with_risk

The notes path is as claimed: byte-for-byte assembly with loud named failure on any missing marker (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:716-726, CLI :1147-1167; SKILL.md:121-130), roots/base_ref pinned to the programme worktree/branch (SKILL.md:131-135). But SKILL.md:120 says the change string is 'extracted... Mechanical, never composed' while giving no command, and the CLI (programme.mjs:1041-1208) has no --change verb — the string that keys develop's exact-match existing_run duplicate guard rides a model's transcription of the leaf's marked section.

> **Improvement (major, R6 R3):** Add a --change <slice> CLI verb mirroring --notes, printing the leaf's marked change section byte-exact via sectionsOf.
>
> **Why:** A whitespace-level transcription difference between two sessions defeats the exact-string duplicate guard and plans the same slice twice; a scripted extraction makes the key byte-stable, per the repo's own bytes-never-ride-a-model law.

### I3 — holds_with_risk

The claimed routing exists: SKILL.md:144-148 declares a checkpoint return is not a delivery and that nothing below (merge/append/drift) runs, nor while an escalation is open. But it is prose in a session-driven skill with no mechanical backstop: appendCheck (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:347-361) accepts any delivered entry naming a slice and a run id without comparing the run to run-status, and the duplicate refusal at :349-352 then makes a wrong delivery sticky — the legitimate one is refused until a human edits the log.

> **Improvement (major, R6 R2):** In the CLI delivered branch (programme.mjs:1089-1092), refuse --append-delivered when the named run's derived status is not integrated/landed — the run rows are already loaded at that point.
>
> **Why:** A checkpointed or in-flight run mis-recorded as delivered poisons the log and permanently blocks the real delivery; the repo's own existing_run rationale (CLAUDE.md) says a skill instruction guards only the callers that read it, and this append has no mechanical guard.

### I4 — holds_with_risk

The mechanism is where cited: a FINISHED run with no delivered event derives delivery-pending (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:502-507), and reconciliation-first (SKILL.md:60-63, :80) finishes it before new work, checking git before redoing the merge. But the recovery covers only acts 1-3: a session killed between --append-delivered (SKILL.md:163) and --drift (SKILL.md:183) leaves status 'delivered' with nothing on disk recording that the drift check never ran — no drift event type exists (programme.mjs:285) — so the next session (automatically, under standing) advances past a possibly-moved contract unexamined.

> **Improvement (major, R5):** Make the drift check recoverable: either record it as an event, or have reconciliation re-run --drift against the delivered event's merged_sha first parent whenever no check is recorded after a delivery.
>
> **Why:** The drift flag is a standing-advance stop trigger; this kill window silently advances over a user-decision point the design promises to stop on.

### I5 — holds

SKILL.md:158-161 states the claimed handling ('a conflict here means the tree moved under the run or two slices overlapped undeclared — surface it, never resolve it silently'), inside the lint-pinned verbatim block at :152-157. Adversarially: a session killed mid-conflict leaves no delivered event, so the slice derives delivery-pending (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:502-507) and reconciliation-first (SKILL.md:60-63) routes back to finishing it before any new dispatch could use the conflicted worktree.

### I6 — holds_with_risk

Shape validation and duplicate refusal exist as cited (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:333-376; duplicate delivered :349-352; external delivery requires --ruling :357-361; coverage read verbatim from file :1081-1091; unreadable log refused before append :987). But the 'append-only' log (:19, repair-is-one-line doctrine :293-297) is physically a truncate-and-rewrite: appendEvent serializes every prior event and writeFileSync's the whole file (:993), so a session killed mid-write can destroy the entire event history, not one line — and the coverage file itself is written by the session's transcription of the workflow result, a model on the write path of the one input isSatisfied trusts (:404).

> **Improvement (major, R5):** After validation, append the single new line with appendFileSync instead of rewriting the whole file.
>
> **Why:** Bounds worst-case interruption loss to one torn line — which parseEvents already fail-closes on and a human can genuinely fix — instead of silently vaporizing the whole programme's delivery history at the one moment the layer is recording progress.

### I7 — holds_with_risk

The cited fail-closed core is real: parseEvents rejects the first non-JSON or unknown-typed line (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:298-322), degraded dominates every slice status as 'unknown' (:491-493), appendEvent refuses an unreadable log (:987), and foreign/unattributed runs render in their own never-guessed section (:801-808, classification :464-474). But 'never dispatch over it' (SKILL.md:83-89) is prose only: --notes (:1147-1167) and --drift (:1127-1144) load a degraded programme without refusal and emit normal-looking output carrying no degraded marker, so a session that skipped or compacted past step 1 can assemble a dispatch payload for a frozen programme.

> **Improvement (major, R6 R2):** Have the action verbs (--notes, --drift, and the append verbs beyond the existing :987 check) refuse when derived.degraded is non-empty, naming the diagnostic.
>
> **Why:** Makes the freeze mechanical rather than reader-dependent — preventing a develop run dispatched over a log whose delivered events nobody could read, i.e. re-buying delivered slices; the same prose-to-mechanical hardening the plugin already applied to existing_run at run level.

### I8 — holds

driftCheck is a pure path-set intersection exactly as claimed (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:634-659): under() normalizes backslashes and enforces the '/' prefix boundary so src/foo cannot claim src/foobar (:615-619); flagged (designed, contract hit) and unexamined (undesigned, nothing to intersect) are kept apart (:647-657); the CLI computes the moved set from git's own diff output, never a model's reading (:1127-1144); and parseProgramme guarantees every consumed contract resolves to a unique provider with non-empty paths (:164-199), so pathsOf lookups cannot silently miss. The prefix-grain limit is stated in both sources (SKILL.md:202-206, programme.mjs:610-613) and the check errs toward showing.

### I9 — holds

SKILL.md:208-218 carries the closure rule verbatim with the full trigger list the catalogue claims (undesigned/marker-incomplete leaf, escalation, checkpoint, gap acceptance, drift flag, HUMAN: criterion, review critical, unknown/delivery-pending, loader failure, programme-complete), explicitly open-ended ('the rule is the closure; the list is its known instances'). The unknown and delivery-pending stops are additionally backed mechanically by reconciliation-first routing (SKILL.md:60-63) over the derivation (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:491-507), and advance='standing' is explicit, validated, never inferred (programme.mjs:84-90).

> **Improvement (major, R5):** Add a resource trigger to standing advance: before each slice dispatch, check a session/usage-limit signal (remaining context, observed token spend) and stop at the slice boundary naming the trigger rather than launching the run.
>
> **Why:** R5's early-detection clause is served nowhere in this layer — the 2026-08-27 incident (a usage limit killing 16 agents mid-flight, ~525k tokens, zero salvage) is precisely the day a slice-boundary stop with a clean resumable frontier saves.

### I10 — holds

Programme-complete is a distinct predicate as cited (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:544-561): blockers include delivered-with-open-gaps (:549-551) and every unknown/in-flight slice, and complete additionally requires a non-empty programme, so a gapped or frozen programme never triggers the landing ask. SKILL.md:220-233 presents the user-branch drift against the opened anchor with the single ask, merges --no-ff, then records via --append-merged whose carried slices are derived, never typed (programme.mjs:1103-1112). The untouched-checkout and merge-the-programme-branch clauses are genuinely lint-pinned (tools/rules/design-gate.mjs:70-85).

> **Improvement (minor, R5 R6):** On attach-resume, if no 'opened' event exists (kill window between the worktree add at SKILL.md:32 and --append-opened at SKILL.md:38), recover the anchor deterministically (git merge-base) or refuse to land without one.
>
> **Why:** derived.opened is null in that state (programme.mjs:564) and nothing re-records it, so landing's divergence-before-the-yes conversation silently has no anchor to present.

### GAP1 — holds_with_risk

The slice is this layer's task, yet no per-slice intelligence exists anywhere: parseProgramme normalizes nodes to a closed field list — id, kind, parent, delivers, deps, provides, consumes — silently dropping anything else (C:\work\claude\vanillafairy\vf-agentics\lib\programme.mjs:217-225), and SKILL.md step 3 (:120-135) enumerates the develop envelope (change, notes, roots, base_ref, programme, slice) with no tier, so under standing advance every slice run is dispatched at whatever default the session happens to hold, with no authored, recorded basis to differ.

> **Improvement (major, R1 R3):** Add an authored per-slice intelligence field to programme.json (validated by the loader, carried through step 3 into develop's envelope, adopted on resume like the rest of the envelope).
>
> **Why:** R1 demands task-granular intelligence — today a glue slice and a core-algorithm slice run at one undifferentiated tier, overspending on the cheap one or underthinking the hard one, and nothing on disk records the choice.

## J-existing — J. Find-existing-solutions

### J1 — holds_with_risk

Pipeline as catalogued: frame agent workflow.js:364-392, resume-to-exhaustion angle loop :430-524, repo scout dispatched concurrently :528-548, viable computed in JS :703, repo-exception documented SKILL.md:19-22. Defeat found: the repo channel result is adopted at :580-591 without ever reading repo.result.stop_reason — an 'unfinished' or 'stuck' repo scan with blank not_reached joins neither partial nor failed_channels, so coverage.complete can be true over a truncated dependency scan; the angle loop explicitly guards this same case at :504-514 ('another round would launder it into completeness') and the repo scout is single-shot, never resumed.

> **Improvement (major, R2):** Gate the repo channel on stop_reason exactly as the angle loop does (unexhausted joins partial/failed even with blank not_reached) and run it through the same resume loop.
>
> **Why:** Prevents the day a truncated dependency scan reads as complete and the user adopts an external candidate duplicating something already on the dependency list — the answer SKILL.md:19-22 calls the cheapest and most decisive in the workflow.

### J1 — holds_with_risk

The viable/ruled_out computation (:703-706) consumes disqualifiers_hit strings the assessor was asked — in prompt prose only (:634-636, :640-644 'Never invent a disqualifier that is not on the list') — to copy verbatim from frame.disqualifiers; no JS checks membership, though frame.disqualifiers is in scope (:616, :727). An assessor ruling a candidate out on invented grounds flows unaudited into ruled_out.why.

> **Improvement (minor, R6):** Verify each disqualifiers_hit entry is (verbatim) a member of frame.disqualifiers in JS; route non-matching entries to unreached/notes instead of letting them rule a candidate out.
>
> **Why:** Prevents the day the only viable candidate is wrongly ruled out on a ground nobody declared and the user builds for weeks — the exact failure the workflow header (:20-24) exists to prevent — via a deterministic set-membership check that R6 says belongs in script, not model obedience.

### J2 — holds

Frame death (.catch→null :389-392) and zero angles both hit the branch at workflow.js:394-400: failed_channels:['frame'], unreached states the result says nothing about whether a solution exists, complete derived false (:315-321). Catalogue's cite of :345 actually points at the empty-capability guard (:345-348); the claimed mechanism sits at :394-400. No dispatch is bought before the frame, so a transient failure costs one agent and the return is coverage-honest.

### J3 — broken

The no_match/not_reached separation (:570-575) and failed-repo semantics (:586-591) hold, and the binding text exists at SKILL.md:99-110. But the assess-failure leg is mechanically defeated: on assessment death, :669-676 fabricates disqualifiers_hit:[] on every raw candidate, then :703 computes viable over that fabrication, so every unmeasured candidate is named viable, ruled_out is empty, and the :719 incomplete-sweep warning is suppressed (viable.length>0). SKILL.md:79-81 orders viable presented as 'the ones that hit no disqualifier', while SKILL.md:108-110 warns only the human reader not to read that emptiness as viability — the workflow's own computation does exactly what the prose forbids.

> **Improvement (major, R2 R6):** When the assess channel failed, return viable=[] and ruled_out=[] (skip the :703 computation) so unmeasured candidates ride only in candidates[] with the existing failed_channels:['assess'] explanation.
>
> **Why:** Prevents the day the assess analyst dies and the user is shown a viable list containing candidates a declared disqualifier (e.g. their licence policy) would have ruled out — a partial result minted into a whole one by the script itself.

### J4 — holds_with_risk

Stuck exit exists: a round adding no new dedup key (candidates or searched surface, :493-501) returns incomplete at :517-519, no round counter anywhere in the loop (:443-523). Dropped-candidate recovery exists: set-difference on normalized names :688-697 pushes lost names into unreached. Defeat: the assessor is explicitly told the same project may appear under more than one name and to merge duplicates (:630-635); a correct cross-name merge leaves the merged-away name outside the kept set, so it is falsely flagged 'found but never ruled on' and complete is forced false on a genuinely complete sweep — and the schema (:249-274) offers no alias field to declare the merge.

> **Improvement (minor, R3):** Add a merged_from array to ASSESSMENT rows and subtract those names from the lost set at :688-697.
>
> **Why:** Prevents the day a two-angle sweep finds one library under its repo name and its registry name, the correct merge marks the run incomplete with a false 'neither viable nor ruled out' line, and the user pays for a re-run that reproduces the same false gap.

### GAP1 — holds_with_risk

Cluster focus: the binding never-report-build-while-incomplete rule is enforced nowhere mechanical. It exists only as skill prose (SKILL.md:99-110); the workflow contributes log lines that bind nobody (:598-600, :719-722). tools/rules/design-gate.mjs:38 applies only to skills/(design|programme)/SKILL.md; the tools/rules/ directory (10 rules listed) contains no rule touching find-existing-solutions, and the binding block carries no vfa:verbatim marker even though this same SKILL.md already pins its intelligence-tier block that way (SKILL.md:48-59).

> **Improvement (major, R6):** Pin the binding clause mechanically — widen design-gate.mjs's CLAUSES map with a find-existing-solutions entry (pattern on the 'nothing exists, build it' / coverage.complete sentence) or wrap SKILL.md:99-110 in a vfa:verbatim block, both mechanisms already in the repo.
>
> **Why:** Prevents the day an edit softens the one sentence this skill exists for and a later session reports 'nothing exists, build it' off an unfinished sweep — three weeks building what was on a registry, the failure the workflow header (:20-24) names.

### GAP2 — holds_with_risk

SKILL.md:66-69 tells the session to record the runId to pair with coverage.resumable.remaining 'if the sweep needs resuming', but never states that args must be re-passed on resume; the workflow parses only fresh inputs (:288-293), so an argless resume hits the blank-capability guard (:345-348) and returns empty in milliseconds. This is the exact documented incident (catalogue Observed incidents #2, faulting skills/investigate/SKILL.md for the same omission), unfixed in this skill. RUN_ID is a placeholder (:313) and nothing in the workflow consumes remaining, so resumability rests entirely on the platform cache plus correctly re-passed args.

> **Improvement (minor, R5):** State in SKILL.md Step 2 that a resume must re-pass the full args object alongside resumeFromRunId, mirroring the fix the investigate skill received for the same incident.
>
> **Why:** Prevents the recurrence of the observed failure where a resume silently runs argless and returns an empty 5ms result, wasting the resume and everything the cache could have salvaged.

## K-lint — K. Lint layer

### K1 — holds_with_risk

All cited anchors verified: tools/lint.mjs:12 (SKIP_DIRS .git/node_modules/docs/test), :97 (POSIX path normalization so Windows backslashes cannot defeat applies regexes), :68-77 (rule-contract validation throwing with the offending filename), :117-121 (CLI exits 1 on any finding, format file:line [rule] message), :114-115 (import.meta.main fallback for pre-24.2 Node); CLAUDE.md:102-104 documents the command. Defeating condition: lint.mjs:118 lints process.cwd() and loadRules at :44-48 returns [] when <cwd>/tools/rules is missing, so running the CLI from any directory other than the repo root loads zero rules, prints 'OK: no findings' (lint.mjs:105), and exits 0 — the exact 'gate passing silently on an unlinted tree' failure the :111-113 comment guards on the other axis. test/lint.test.mjs:101-108 pins the empty-load as correct behavior, so no test will ever surface it.

> **Improvement (major, R6):** In the CLI branch, derive the plugin root from import.meta.url instead of process.cwd(), or hard-fail (nonzero exit, explicit message) when the CLI loads zero rules.
>
> **Why:** Prevents the convention-run gate reporting green over a completely unlinted tree whenever a human or agent invokes it from the wrong directory — a silent false pass of the entire rule set, today undetectable by any test.

### GAP1 — broken

Execution of the gate is guaranteed nowhere: no CI file, no package.json, no configured git hooks (only .git/hooks/*.sample exist), and greps for lintPlugin/tools/lint and 'lint' across test/, skills/, workflows/, agents/, .claude/knowledge return zero references — no test self-lints the real tree, so 'node --test' alone carries none of the lint. Only CLAUDE.md:102-104 and .claude/knowledge/commands.md:23-36 name the command. What a forgotten run lets through is silent at runtime by construction: a non-literal meta makes the workflow 'simply absent when something tries to invoke it' (workflow-meta.mjs:9-14, documented field incident — vfa-probe shipped without its workflow), an unqualified agentType fails mid-run with nothing pointing at the workflow (qualified-agent-types.mjs:4-6), a missing coverage return hands the caller a partial indistinguishable from a whole (coverage-block.mjs:3-6) — the one failure mode the plugin exists to prevent, with the lint as its only detector.

> **Improvement (major, R6):** Add a self-lint test (e.g. test/self-lint.test.mjs) that runs lintPlugin over the real repository root — computed from import.meta.url — and asserts zero findings; the walk already skips test/ and docs/ (lint.mjs:12) so rule fixtures cannot trip it.
>
> **Why:** Makes 'node --test' alone carry the gate, so a committer or coder agent who runs only the test half of the convention still catches a rule violation before it ships as a silently-absent workflow or a coverage-less return.

### K2 — holds_with_risk

All ten catalogued rules exist and match their descriptions: no-turn-caps (tokens :25, counter-stop prose :28, stop_reason-near-'budget' :38, scope workflows/skills/agent-charters :22), workflow-meta (missing meta :139-149, vfa- prefix :162-185, phase() vs meta.phases :188-203, non-literal meta :247-287), design-gate (develop-handoff/HARD GATE/blocking-question clauses :40-63, programme-merge/untouched-checkout :65-91, the five pinned sentences confirmed live in skills/design/SKILL.md:144,229,316,332 and skills/programme/SKILL.md:49,229), task-tool-fallback (:43-71), no-imports (:26-45 incl. multi-line and export-from), coverage-block (V1/V2/V3 + vacuous :46-98 over blanked source :180-225), qualified-agent-types (:16-27), no-self-verdict (:38-50, banned set is 9 keys), no-schema-bounds (:14), agent-frontmatter (:15-16, :45-86, CRLF-safe :26). Defeating condition: the Intention claim 'no counter-based termination anywhere (lint-enforced)' exceeds the pattern — CAP_IDENTIFIER (no-turn-caps.mjs:25) bans only max_turns/max_tool_calls; 'rounds' is excluded (:24) citing a header (:11-15) that says the maxRounds tolerance was withdrawn and 'nothing counter-shaped remains to tolerate', so the stated purpose for the exclusion no longer exists; a reintroduced max_rounds cap (the rule's own narrated field failure: a survey topic bigger than the counter ends undersurveyed) passes lint green while CLAUDE.md's clause table assigns IRON LAW §1 to this rule alone. Grep confirms no rounds-counter exists in workflows/skills/agents today, so this is a regression window, not a live violation. The remaining rule limits are each self-documented with a named second layer (design-gate :28-30 review, coverage-block :26-34 harness/T18, no-self-verdict :23-26, task-tool-fallback :29-31) — the decidable-half split, a sound R6 fit.

> **Improvement (major, R6 R2):** Add 'rounds' to CAP_IDENTIFIER in tools/rules/no-turn-caps.mjs (max_?(turns|tool_?calls|rounds)) and drop the now-unjustified ':24 absent on purpose' exclusion.
>
> **Why:** Closes the return path for the rule's own documented field failure — a round counter reintroduced as max_rounds ends a survey topic undersurveyed with every downstream stage built on the hole, while lint stays green and CLAUDE.md claims §1 is enforced.

## GAPS — Known gaps this catalogue inherits

### GAP1 — holds_with_risk

All four ranges read. Planner death IS handled: vfa-develop.workflow.js:3251-3257 (.catch→null), :3273-3288 (no-orders return, failed_channels 'planner', nothing dispatched), :3261-3270 (plan_path empty → 'run-state' failed channel, resume impossibility named). Partition failure trichotomy :3324-3379 routes every order to session or waves, never drops one. Salvage adoption :2842-2898 keys on typed next_action, not prose. The hole: :3430-3445 — a drift result with stop_reason 'completed' but empty user_head (or empty moved_files) passes the `drift.user_head && drift.user_head !== anchor` test as 'no drift' and the run dispatches unwithheld, though driftPrompt :1256-1261 itself names empty-moved_files-standing-in-for-anchor_unreachable as the fatal case; coder/verify/continuation outputs all get coherence checks (catalogue C8), drift gets none.

> **Improvement (minor, R5):** Add a drift coherence check mirroring coherentCoder/coherentVerify: a 'completed' drift report with an empty user_head is treated as anchorLost (staleWithhold), never as 'no drift'.
>
> **Why:** Prevents a resumed plan being implemented against a tree that moved because a half-compliant drift agent returned schema-valid emptiness — the exact stale-run dispatch C5 exists to prevent.

### GAP2 — holds_with_risk

Grep confirms zero `typeof agent/parallel/pipeline/workflow/log/phase` guards in workflows/. Develop is covered without one: the entire run sits in a try (vfa-develop.workflow.js:2664) whose catch returns developResult with failed_channels ['pipeline'] (:4263-4291), and the nested survey call is individually wrapped with the notFound ladder (:3167-3186) plus the threw-vs-no-coverage split (:3212-3231). The exposure is vfa-survey: no top-level try exists (only resumeToExhaustion's launch try at vfa-survey.workflow.js:359-363); `await pipeline(...)` at :582 is bare and runs AFTER all scout rounds complete, so a missing/renamed host primitive — or any synchronous defect — escapes as an uncaught throw, discarding the paid scout work and breaking the 'survey never throws' promise its own comment at :608 states. Wholesale primitive absence is unreachable (the host executing the script supplies them); partial host skew is the real residual case.

> **Improvement (minor, R2 R3):** Give vfa-survey the same top-level try/coverage-catch shape develop already has (a coverage block with failed_channels and whatever verdicts were gathered), rather than typeof preflights on individual primitives.
>
> **Why:** On host API skew or any synchronous survey defect, consumers currently report 'survey threw' and re-buy the entire survey — the top-level catch preserves the paid scout evidence and keeps the never-throws contract every consumer builds on (IRON LAW §5).

### GAP3 — holds_with_risk

reviewLoop vfa-develop.workflow.js:2287-2406. stuck fires only on the same id unfixed in two CONSECUTIVE rounds (:2349, marker armed at :2404); churn fires only on two CONSECUTIVE churn rounds (:2362-2369, churnedLastRound reassigned every round at :2369). Traced reachable alternation: round N churn (all priors fixed, new blocker minted → churnedLastRound=true), round N+1 rules that blocker unfixed (stuck misses: unfixedLastRound from round N is empty; churned false → churnedLastRound=false), round N+2 rules it fixed and mints another (churned true, churnedLastRound false) — repeats unboundedly. Remaining exits are only a clean round (:2345), a commit-less fix (:2383 no_fix_progress), a verify stall (:2398), or agent death via dispatch escalation. Reachability is plausible, not exotic: the loop's own comments record field loops of 5-7 rounds (:2294 'fresh reviewers minted one nearly every round') and 11 rounds across two runs (:2359-2361) from reviewer sampling variance.

> **Improvement (minor, R3 R5):** Escalate 'review_churn' on the SECOND churn occurrence anywhere within one loop (churnedEver instead of churnedLastRound) — a fact-derived pattern trigger, not a round counter, with the same rationale the consecutive trigger's own comment states: another round buys another sample, not a resolution.
>
> **Why:** Stops an alternating stuck/churn loop from burning review-fix-verify rounds until the session limit kills it mid-review, handing the human the same trail after the second churn sample instead of after eleven rounds.

### GAP4 — broken

agents/coder.md:5 reads `model: sonnet`. vfa-develop.workflow.js:669-681: coderTier is {model:'opus'} only at max, `{}` (frontmatter sonnet) at low AND normal; every coder dispatch spreads the same coderTier with no role-based routing (:2252, :2374, :2474, :2512). docs/2026-08-17-intelligence-tiering.md §6.3 (:222-223) rules 'ALWAYS: red orders and contract-critical orders implement at the high tier' — violated now at low and normal — and §7 waives only §6.2-at-low (:250-253, :267-268), never §6.3; §7's claim that normal is 'the safe asymmetry §2 permits' contradicts §2's own argument (:52-63) that strong judges cannot catch faithful implementation of wrong orders because the reviewer is fenced to the criteria. R1's per-task granularity has no mechanism: intelligence is one per-run dial (:683, envelope adoption :2984-2992); the per-order `tier` field (§3.3, §4a) is unbuilt.

> **Improvement (major, R1 R3):** Route red and contract orders to {model:'opus'} at every dial position (coderTier is computed at one site, :677-681, and roleOf/contract are already on the order), then land §3 step 1.1 (pin coder.md to opus) and the per-order tier field for genuine task-granular intelligence.
>
> **Why:** Prevents the failure §2 documents as uncatchable downstream: a sonnet red-order coder pins a wrong reading of ambiguous criteria, the locked green coder faithfully implements it, and no fenced reviewer can object — the defect surfaces at the integration review or human gate, the expensive end.

### GAP5 — broken

workflows/ contains exactly five files — vfa-survey, vfa-investigate, vfa-develop, vfa-probe, vfa-find-existing-solutions (glob) — and skills/ has no diagnose directory; the catalogue's sentence 'the diagnose pipeline nests vfa-survey' describes an artifact that does not exist, so nothing inherits survey's guarantees. Yet three shipped surfaces route to it as if real: .claude-plugin/plugin.json:3,14 advertises 'diagnosis'; skills/investigate/SKILL.md:17 bounces iterative run-observe-adjust work with 'Use `diagnose`'; skills/develop/SKILL.md:3 excludes 'root-cause hunting (diagnose)'. vfa-survey.workflow.js:4 also names diagnose as a consumer. The design spec plans it as unbuilt increment 3 (2026-08-08-vf-agentics-design.md:100, :714).

> **Improvement (major, R2):** Until vfa-diagnose ships, correct the referral surfaces (plugin.json description/keywords, investigate SKILL.md:17, develop SKILL.md:3, survey whenToUse) to stop routing users to a skill that does not exist — or build increment 3.
>
> **Why:** A root-cause request today is refused by investigate, excluded by develop, and handed to nothing — the session freelances the debugging outside the IRON LAW machinery, which is the ungoverned partial-result path the plugin exists to prevent.
