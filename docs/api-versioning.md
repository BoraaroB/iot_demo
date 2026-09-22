# API versioning

- Public API is versioned by URI **in the api-gateway only**: `/api/v1/...`. Internal services use unversioned routes.
- Major version only in the URL. Additive, backward-compatible changes stay in `v1`. `v2` only for breaking changes.
- During a migration `v1` and `v2` run in parallel. `v1` responses get `Deprecation` and `Sunset` headers before removal.
- Events are versioned with `schemaVersion`; WebSocket messages carry a protocol version.
