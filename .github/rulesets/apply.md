# Repository rulesets

`main.json` and `tags.json` are the rulesets applied to this repository. Apply or update them with the GitHub CLI (an admin is needed):

```sh
gh api -X POST repos/MiguelBizzi/bizzi-db/rulesets --input .github/rulesets/main.json
gh api -X POST repos/MiguelBizzi/bizzi-db/rulesets --input .github/rulesets/tags.json
```

To change an existing ruleset, find its id with `gh api repos/MiguelBizzi/bizzi-db/rulesets --jq '.[] | {id,name}'` and use `-X PUT repos/MiguelBizzi/bizzi-db/rulesets/<id>`.

- `main` requires a pull request and the listed checks. It requires 0 approvals while there is one maintainer, because GitHub does not let an author approve their own pull request; raise it to 1 when a second maintainer joins.
- `build (windows-latest)` is deliberately not required until the Windows build is fixed (see issue 3).
- The Admin bypass is limited to pull requests, so an emergency merge is possible but a direct push is not.
- Release tags (`v*`) cannot be deleted, moved or force-updated. Creating them is allowed.
