# Database performance optimization plan

## Objective

Keep the self-hosted Node.js/PostgreSQL app responsive when several players, a GM, realtime clients, and the MCP helper are active at the same time. Preserve all current authorization and API behavior while reducing avoidable database round trips and making stalls observable.

## Status — 2026-09-25

### Phase 1 — Telemetry and safeguards (complete)

- HTTP request duration, status, in-flight count, slow-request logging, and bounded per-route samples.
- PostgreSQL query duration, pool acquisition wait, pool occupancy, errors, and slow-query logging.
- Bounded connection, query, and PostgreSQL statement timeouts so requests cannot wait indefinitely.
- Admin-only `GET /api/admin/performance` endpoint with process, event-loop, request, pool, PostgreSQL, and authorization-cache status.
- PostgreSQL status includes active/waiting connections, cache-hit percentage, temporary files, deadlocks, and `pg_stat_statements` availability. Query text and credentials are never returned.
- Configuration is documented in `.env.example` and passed into the API container by Docker Compose.

### Phase 2 — Authentication and authorization hot path (complete)

- Session `last_seen_at` writes are limited to once every five minutes per active session instead of once per authenticated request.
- Six sequential authorization queries are replaced by one aggregate PostgreSQL query.
- Authorization contexts are cached for five seconds per user, including concurrent-request coalescing.
- Realtime authorization uses the same cache.
- Writes that alter parties, memberships, characters, maps, encounters, or projector sessions invalidate the cache after commit.
- Write transactions always load a fresh authorization context inside the transaction; they never rely on a possibly stale cached context.

### Phase 3 — Query authorization in PostgreSQL (complete)

- Table-specific authorization predicates now run in PostgreSQL for all 35 generic data API tables.
- Equality, greater-than, null, `IN`, `ILIKE`, negation, match, OR, ordering, and limit operations use validated columns and bound values.
- Filters, authorization, ordering, and limits run before rows are transferred to Node.js.
- Update and delete candidate selection uses the same SQL path, then retains the existing write-permission check inside the transaction.
- Related character, party, membership, note, spell, and combatant enrichment queries fetch only identifiers referenced by the result page.
- Migration `0041_data_query_indexes.sql` adds indexes for the measured authorization, party, note, encounter, Atlas, projector, notification, and realtime paths.
- Existing response enrichment and outward field aliases are preserved.

### Phase 4 — Realtime fan-out efficiency (complete)

- PostgreSQL notifications carry only the change-event ID and table name; row data remains in PostgreSQL.
- Notifications arriving within the debounce window are combined into one bounded event query.
- Each event batch is fetched once and then authorized and distributed to all relevant WebSocket clients.
- Clients whose subscriptions do not cover the changed table are skipped before authorization work.
- Event type and equality subscription filters are applied on the server as well as by the browser transport.
- Notifications for party, membership, character, map, encounter, and projector-session changes invalidate authorization contexts immediately.
- The admin performance endpoint reports socket counts, notifications, coalesced signals, shared queries, fetched and delivered events, skipped clients, authorization rejections, and delivery errors.
- HTTP polling remains as a compatibility and reconnect fallback.
- Queries inside a single PostgreSQL transaction or read snapshot are serialized, avoiding concurrent `client.query()` calls that are deprecated by the `pg` driver and can make snapshot behavior unreliable.

### Phase 5 — Frontend request consolidation (complete)

- Returning focus to the app no longer refetches every mounted query at once; reconnect reconciliation remains enabled.
- Campaign time uses realtime invalidation and degraded-connection fallback instead of overlapping 15-second and 30-second polling loops.
- Party chat reuses the app-wide message subscription and cache updates instead of mounting a second message listener and forcing a fresh request every time the tab opens.
- Redundant realtime bindings covered by an existing broader subscription are removed before the shared WebSocket subscription is sent to the server.
- Encounter writes invalidate only the affected party encounter list, encounter details, or combatants instead of refetching the entire application cache.
- Character-sheet loads, reference items, heroic abilities, active encounter state, and combatants use shared React Query caches with concurrent-request coalescing.
- Stable professions, kin, magic schools, bio data, monsters, items, and heroic abilities use a 15-minute reference-data freshness window.
- Atlas and projector management share the same complete party-map query and cache entry.
- The public projector retains its deliberate 1.5-second display refresh, but its `last_seen_at` write is limited to once per 30 seconds, reducing idle display-session writes by up to 95%.
- Central query-key factories keep targeted cache updates consistent across party, chat, encounter, Atlas, projector, and character code.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `DB_POOL_SIZE` | `10` | Maximum API PostgreSQL connections |
| `DB_CONNECTION_TIMEOUT_MS` | `5000` | Maximum wait for a pool connection |
| `DB_QUERY_TIMEOUT_MS` | `15000` | Client-side query timeout |
| `DB_STATEMENT_TIMEOUT_MS` | `15000` | PostgreSQL statement timeout |
| `DB_SLOW_QUERY_MS` | `500` | Slow-query warning threshold |
| `SLOW_REQUEST_MS` | `500` | Slow-HTTP-request warning threshold |
| `PERFORMANCE_SAMPLE_SIZE` | `1024` | Bounded timing samples kept in memory |
| `SESSION_TOUCH_INTERVAL_SECONDS` | `300` | Minimum interval between session activity writes |
| `AUTH_CONTEXT_CACHE_MS` | `5000` | Authorization-context cache lifetime; `0` disables it |

### Phase 6 — Load verification and production tuning (complete)

- `npm run test:performance` creates a disposable campaign with configurable concurrent users, connects one authenticated WebSocket per user, and exercises party view, chat reads/writes, character updates, encounter reads, public projector reads, and real MCP `get_resume_state` calls.
- The rehearsal is local-only by default, writes an optional JSON report, and removes its temporary sessions, users, campaign, encounters, projector session, and change events when it finishes.
- Client and server reports include request p50/p95/p99, error rate, pool-acquisition wait, query latency, event-loop delay, realtime delivery p50/p95/p99, authorization-cache activity, and the most expensive PostgreSQL statements.
- Admins can clear only the bounded in-memory performance counters with `POST /api/admin/performance/reset`, allowing one load interval to be measured without earlier traffic.
- Local Docker PostgreSQL preloads and creates `pg_stat_statements`. Existing Docker volumes need `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` once. A managed production host must enable the extension at the provider level; the application continues normally when it is unavailable.
- The sample window default increased from 256 to 1,024 after the rehearsal showed that a shorter trailing window made p95/p99 overly sensitive to brief host contention.
- The measured pool size remains 10. Raising it was not justified: the accepted run had no queued requests, no acquisition errors, and a 0.22 ms acquisition-wait p95. The 5-second connection timeout and 15-second query/statement timeouts also remain unchanged because there were no timeout or query errors.

Run the local rehearsal after the Docker stack is healthy:

```sh
PERF_TEST_OUTPUT=/tmp/draconi-performance.json npm run test:performance
```

The environment overrides are documented in `.env.example`. Set `PERF_TEST_ALLOW_REMOTE=true` only for an intentional run against an isolated non-production target; the scenario creates and deletes data.

## Phase 1–5 acceptance evidence

- Production build completes.
- Focused authorization, authentication, projector, and realtime tests pass.
- Local PostgreSQL smoke test returns identical authorized data on the first and cached second request.
- The second authorization lookup records a cache hit with no additional context load.
- The local pool reports no queued requests or deadlocks during the smoke test.
- Query-builder tests verify bound parameters, authorization predicates, ordering, limits, and rejection of unknown columns.
- A read-only compatibility sweep successfully queried all 35 generic API tables as a non-admin user.
- The Phase 3 index migration applies cleanly to the restored local PostgreSQL database.
- Multi-socket tests verify that two clients receive a notification from one shared event query.
- A self-cleaning end-to-end PostgreSQL/WebSocket rehearsal produced one fetch, two authorized deliveries, and zero delivery errors.
- Migration `0042_realtime_notification_metadata.sql` applies cleanly and legacy numeric notification payloads remain supported.
- The rebuilt local API completed a real `get_campaign_time` snapshot without PostgreSQL client concurrency warnings.
- Automated tests verify redundant realtime subscription bindings are consolidated before transport.
- Automated tests verify concurrent character-sheet loads perform one character, item, and heroic-ability request each.
- The frontend contains no unscoped `invalidateQueries()` calls; the only remaining fixed refetch interval is the token-based public projector display.
- After the local container refresh, an already-mounted party view performed one campaign-time request during startup and no periodic campaign-time requests afterward.

## Phase 6 acceptance evidence — 2026-09-25

- Six concurrent users completed a 20-second mixed workload with 1,040 measured client operations and zero HTTP, PostgreSQL, MCP, or realtime delivery errors.
- Client request latency was 9.84 ms p50, 25.12 ms p95, 38.50 ms p99, and 65.53 ms maximum.
- Server request latency over 1,024 samples was 3.87 ms p50, 15.83 ms p95, and 24.61 ms p99; no request crossed the 500 ms slow-request threshold.
- Pool acquisition wait was 0.02 ms p50, 0.22 ms p95, and 0.53 ms p99, with no queued requests at snapshot time.
- Query latency was 0.71 ms p50, 2.53 ms p95, and 8.11 ms p99, with no query errors, slow queries, temporary files, waiting connections, or deadlocks.
- All 864 expected chat deliveries arrived across six WebSockets. Client-observed realtime latency was 19.54 ms p50, 28.41 ms p95, and 30.60 ms p99; server-observed delivery latency was 19 ms p50, 32 ms p95, and 36 ms p99.
- PostgreSQL reported a 99.76% cache-hit ratio, and `pg_stat_statements` identified synchronized character-WP updates and their campaign-revision trigger as the largest measured SQL cost without exposing credentials.
- The rehearsal cleanup was verified afterward: zero disposable `performance-*` users and zero `Performance Party *` campaigns remained.
