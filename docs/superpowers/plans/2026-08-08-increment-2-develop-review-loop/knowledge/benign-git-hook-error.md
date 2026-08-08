# `ERROR: Failed to parse repository information` on commit is benign

Every `git commit` in this repo prints this twice before succeeding:

```
ERROR: Failed to parse repository information
ERROR: Failed to parse repository information
[increment-2 1a2b3c4] your commit subject
```

**The commit succeeded.** Check the `[branch sha]` line, not the noise above it.

## Where it comes from

A global `core.hooksPath` points at `C:\Users\dragm\.git-hooks`. Its `common.py` has:

```python
def is_pmi_repo():
    repo_name, workspace = parse_repo_info()
    if repo_name and workspace:
        return workspace in ["pmi_dev_team", "dotmatics"]
    else:
        print("ERROR: Failed to parse repository information")
        return False
```

`parse_repo_info()` reads `remote.origin.url` and only matches Bitbucket URLs. `vf-agentics`
has **no remote configured at all**, so it returns `(None, None)` and the `else` branch fires.

The function is answering "is this a PMI repo?" and the answer — *no* — is correct. It just
announces that normal answer with the word ERROR. It prints twice because `pre-commit` and
`commit-msg` each call it.

## Why this is worth writing down

Five agents in the increment-2 run stopped to investigate it, and one ran a full
`git stash` / `git stash pop` cycle to prove its commit had not been corrupted. A message
that says ERROR during a successful operation costs real attention every time, and worse,
it trains the reader to skim past error text — which is exactly when a genuine failure slips
through.

The hooks are global and shared with unrelated work, so nothing here changes them. If the
owner ever wants to: the one-line fix is to make that branch print nothing, or print
something like `info: no Bitbucket remote — PMI hooks skipped`.
