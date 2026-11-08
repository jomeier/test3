# Commits

- Use conventional commit messages: `type(scope): description`.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`, `ci`.
- The scope in parentheses is optional and names the area touched, e.g. `feat(ui):`.
- Keep the header (first line) at about 50 characters.
- The body may have several lines, but each body line is at most 50 characters.
- Use the imperative mood in the header and describe one change per commit.

## Example

```text
feat(rules): add commit message rule

Adds commits.md to agent-memory/rules.
Header stays near 50 characters.
Body lines are wrapped at 50.
```

Header: `feat(rules): add commit message rule` (36 characters)

## Wrap long body lines

```bash
git commit -m "feat(rules): add commit message rule" \
         -m "Adds commits.md to agent-memory/rules."
```
