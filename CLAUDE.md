## Agent skills

### Issue tracker

Issues live in GitHub Issues for Leke-Quni/Thirrem (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Code practices

For all code written in this project, keep the SOLID principles and Clean Architecture in mind as best practices.

## Local ports

Dev servers use 5001 to 5004 so they do not clash with other projects on this machine (3000, 4000 and 5000 are taken).

| Service | Port |
|---|---|
| API | 5001 |
| Rider app | 5002 |
| Driver app | 5003 |
| Admin app | 5004 |

Run them with `yarn dev:api`, `yarn dev:rider` and `yarn dev:driver`. Postgres is on 5433. Playwright uses its own ports (3100 for the API, 5173 for the Rider app, 5174 for the Driver app) so tests do not collide with dev servers.
