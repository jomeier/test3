# gh repo view --json does not expose REST field names

- Date: 2026-11-10
- Status: verified
- Source: `gh repo view jomeier/test3 --json created_at` while pushing

## Context

I wanted a quick machine-readable answer about a repository: default branch,
size, creation date.

## Error / Hurdle

`gh repo view <repo> --json created_at` and `--json defaultBranchRefName` both
answered `Unknown JSON field`, because the GraphQL fields of `gh repo view`
differ from the REST names.

## Solution

Read the repository through the REST API instead:

```bash
gh api repos/jomeier/test3 --jq '.full_name, .default_branch, .size'
gh api "repos/jomeier/test3/commits?per_page=100" --jq 'length'
```

## Golden Rule

For repo metadata use `gh api repos/<owner>/<repo> --jq ...`; do not guess
`--json` field names for `gh repo view`.
