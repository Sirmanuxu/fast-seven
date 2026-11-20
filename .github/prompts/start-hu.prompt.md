---
description: Start a user story following the project rules
---
Work on user story ${input:hu:e.g. HU-17}.

1. Read AGENTS.md and docs/decisions.md.
2. Find the story in docs/BACKLOG.md and read it with its dependencies.
   Read only the backlog sections and cases from docs/REFERENCE_CASES.md that apply to it.
3. Check that the dependencies are done. If not, stop and tell me.
4. Write a short plan (files to touch, tests to write, open questions) and wait for my OK.
5. After my OK: create branch feat/hu-NN-slug, write the tests first from the reference cases,
   then the implementation, then the UI. Run lint, tests and build.
6. Stop with the handoff summary described in AGENTS.md section 9. Do not start another story.