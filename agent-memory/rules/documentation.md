# Documentation

- All documentation — in code comments and in markdown — is written in English and is easy to understand.
- Every code file starts with a short comment at the top that states the purpose of the file (what its task is).
- Every function has a short comment above it that states the task of the function.

## Examples

File header:

```python
# Purpose: Load configuration values from config.yaml and expose them as a dict.
```

Function comment:

```python
def load_config(path):
    """Read config.yaml and return its contents as a dictionary."""
```
