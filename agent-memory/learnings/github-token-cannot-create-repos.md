# GitHub token cannot create a repository

- Date: 2026-11-09
- Status: verified (confirmed again 2026-11-10 with `jomeier/test3`)
- Source: pushing this repo to https://github.com/jomeier/opencode-bootstrap.git

## Context

The repo did not exist yet, so the goal was to create it with `GITHUB_TOKEN`
and then push the local commits.

## Error / Hurdle

Both attempts failed with the same permission error:

- `gh repo create jomeier/opencode-bootstrap --private`
  -> `Resource not accessible by personal access token`
- `curl -X POST https://api.github.com/user/repos`
  -> `403 Resource not accessible by personal access token`

The token authenticated correctly (`gh api user` -> `jomeier`), but the API
response had no `X-OAuth-Scopes` header, which means it is a fine-grained
personal access token. Fine-grained tokens are scoped to existing repositories
and cannot create new ones.

## Solution

Create the repository once in the GitHub UI (or with a classic token that has
the `repo` scope), then push with the existing token:

```bash
git remote add origin https://github.com/jomeier/opencode-bootstrap.git
git push "https://${GITHUB_TOKEN}@github.com/jomeier/opencode-bootstrap.git" master
```

Before pushing, check what the token is allowed to do:

```bash
gh api user --jq .login                 # who is the token?
gh repo view <owner>/<repo>            # does the repo exist?
```

## Golden Rule

Never assume a token can create a repository: test with `gh api user` and
`gh repo view` first, and if creation returns "Resource not accessible by
personal access token", the repository must be created outside the token.

Confirmed a second time on 2026-11-10: `gh repo create jomeier/test3 --private`
failed with the same message, and the push worked after the user created the
repository in the GitHub UI.
