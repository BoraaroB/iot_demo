# Git & versioning

- Conventional Commits: `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `chore: ...`, `test: ...`.
- `main` is always verified. Work per phase on `phase/<n>-<name>`, merge when verification passes.
- Completed phase gets an annotated SemVer tag: `git tag -a v0.N.0 -m "Phase ..."`. Fixes bump patch.
- Roll back: inspect `git checkout vX.Y.Z`; branch from it `git switch -c fix/... vX.Y.Z`; undo on main with `git revert`.
- Docker images tagged with the same version as git.
- DB migrations are versioned and forward-only; provide `down` where reasonable.
- Pushing to a remote only when the user asks.
