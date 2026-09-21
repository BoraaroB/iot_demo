# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each completed phase is tagged `v0.N.0`.

## [Unreleased]

### Added
- Git repository (`main` branch), `.gitignore`.
- `CLAUDE.md` (condensed agent rules), `PROGRESS.md` (progress tracker), `CHANGELOG.md`.
- `instruction_plan.md` kept as the full original specification.
- npm workspaces root (`apps/*`, `services/*`, `packages/*`), `tsconfig.base.json` (strict, `NodeNext`), ESLint 10 flat config (`eslint.config.mjs`, `typescript-eslint`), Prettier, `.nvmrc` (Node 24).

### Notes
- TypeScript pinned to `^6.0.3` (not `7.0.2`) — `typescript-eslint@8.70.0` doesn't yet support TS 7's peer range.
