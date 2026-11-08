# Tests

- Run all tests before every commit.
- Commit only if all tests are green.
- If a test fails, fix it before committing; never commit failing tests.
- Do not skip, delete, or mark tests as pending to make the run look green.
- If the change has no tests yet, add them and run them before committing.

## Example

```bash
pytest -q          # or: npm test
git commit -m "..."   # only after the test run exits with code 0
```
