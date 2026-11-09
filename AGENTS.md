## Agent memory

Memory folder: `agent-memory/`

| Folder | Purpose | Who changes it |
|---|---|---|
| `rules/` | Hard rules. Always apply. | Only with user confirmation |
| `design-guidelines/` | Style, UI, and architecture decisions with reasons. Index: `design-guidelines/README.md` (with keywords). | Only with user confirmation |
| `learnings/` | Lessons from solved errors. Index: `learnings/README.md`. | Agent, without asking |

Before every task:
1. Read `agent-memory/rules/`. These rules always apply and override other guidance.
2. Before changing code or UI, read `agent-memory/design-guidelines/README.md`. Match the task to the keywords there, then open and follow the relevant guideline files.
3. Search `agent-memory/learnings/` for similar tasks, known pitfalls, and documented fixes. Open only the relevant files.

Rules and design guidelines:
- Never change `rules/` or `design-guidelines/` on your own initiative.
- To propose a change, show the exact change and the reason, then wait for the user's confirmation.
- If a task conflicts with a rule or guideline, stop and ask instead of working around it.

Learnings:
- Before you report a task as done, check: did you hit and solve an error during this task? If yes, you MUST create a new file in `agent-memory/learnings/` or update an existing one.
- Use `agent-memory/learnings/_template.md` as the format. Sections: Title, Context, Error / Hurdle, Solution, Golden Rule.
- Put date, status (`assumed` or `verified`), and source at the top of the file.
- Add or update the entry in `agent-memory/learnings/README.md`.
- Golden Rule: one concrete sentence with the command or pattern to use, not general advice.
- Keep the solution short: a minimal snippet, not whole files.
- Writing learnings is an exception to "ask when unclear". Do not ask first, write the file.
- Do not store anything you cannot back up. Mark uncertain knowledge as `assumed`.
- If a learning has been confirmed several times, propose promoting its Golden Rule to `rules/`.
