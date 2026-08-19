# OHMY ONE — QA Report

**Honesty statement.** Scores below are self-assessments with written
justification for every deduction. They are **not** inflated to hit a target.
Where a rubric item requires *executed* evidence that this build environment
could not produce, the score reflects that gap rather than assuming success.
"Production Ready" is **not** claimed (see ADR-000).

## What was actually executed in this environment (evidence)

| Check | Tool | Result |
|---|---|---|
| All 12 migrations + seed parse under the real PostgreSQL grammar | `libpg-query` (WASM) | ✅ pass |
| All plpgsql function bodies parse | `libpg-query` plpgsql parser | ✅ pass (1 issue found & fixed in 0009) |
| MCP server compiles | `tsc --noEmit` | ✅ pass (0 errors) |
| MCP server builds | `tsc` | ✅ pass |
| MCP-layer unit tests | `node --test` | ✅ 7/7 pass |
| Tool catalog: 0 raw-SQL tools | `list-tools` | ✅ 22 tools, 0 raw-SQL |

## What was NOT verified here (and why)

**End-to-end execution against a live database did not run in this environment.**
The only available Windows shell is elevated (admin), and PostgreSQL refuses to
run under an admin token; the restricted-token workaround then fails child
process DLL initialization (`0xC0000142`). So:

- The SQL **business/permission/RLS/reconciliation tests are written and
  syntax-validated but were not executed.**
- No live MCP↔DB integration round-trip was performed.
- Seed **reconciliation is proven by construction and by a written assertion**,
  but not by an executed run.

These are runnable on any normal (non-elevated) machine via
[DEMO.md](DEMO.md) / README. The scores below hold back the points that only an
executed pass can earn.

---

## Product Planning — 97 / 100  ✅ (≥96)

| Criterion | Max | Score | Justification |
|---|---:|---:|---|
| Problem Definition | 10 | 10 | Clear "menu → conversation" thesis; DB-as-truth invariant. |
| Architecture | 15 | 15 | Full USER→CLAUDE→MCP→authz→logic→DB→audit path; two-MCP separation. |
| User Scenarios | 10 | 10 | All 10 Korean scenarios mapped to specific tools/RPCs. |
| Data Model | 15 | 14 | Normalized, typed, indexed. −1: no public-holiday calendar / FX consolidation. |
| Permission Model | 15 | 15 | RBAC + 7-level scope + explicit permission codes + engine. |
| Business Logic | 15 | 14 | Deterministic RPCs, transactional. −1: no delegation/OOO approver routing. |
| AI/MCP Design | 10 | 10 | Business actions only, risk tiers, detailed descriptions, idempotency. |
| Scalability | 5 | 4 | Snapshots + indexes. −1: no partitioning; single-entity finance aggregation. |
| Executive Value | 5 | 5 | Cross-functional HR×Finance dataset + interpretation split. |

## QA — 84 / 100  ⚠️ (below 96 — execution pending)

| Criterion | Max | Score | Justification |
|---|---:|---:|---|
| Functional Accuracy | 20 | 15 | Logic reviewed + grammar/plpgsql-validated; **−5: not executed on live data.** |
| Business Logic | 15 | 13 | Leave/approval/P&L logic complete + reviewed; −2: unexecuted edge cases. |
| Security | 20 | 17 | Deep design + column-level salary; −3: RLS tests not executed. |
| Permission / RLS | 15 | 12 | Policies + engine written; **−3: direct-access tests not executed.** |
| Data Integrity | 10 | 8 | FKs/checks/balanced-entry guard; −2: reconciliation not executed. |
| MCP Reliability | 10 | 9 | Typechecks + 7 unit tests pass; −1: no live integration round-trip. |
| UX | 5 | 5 | Conversational-first; console skeleton present. |
| Code Quality | 5 | 5 | Consistent, documented, single-responsibility functions. |

**QA reaches ≥96 once** the migrations+seed+both SQL test files are executed on a
live Postgres and pass, and one MCP↔DB integration path is exercised. The suites
are written to that bar; this environment simply could not run a server.

## Security — 89 / 100  ⚠️ (below 96 — RLS execution pending)

| Criterion | Max | Score | Justification |
|---|---:|---:|---|
| Authentication | 15 | 13 | Server-side identity binding; −2: prototype uses config actor, not live OIDC. |
| Authorization | 20 | 18 | Permission engine + server-side approver; −2: unexecuted. |
| RLS | 20 | 16 | Enable+force, policies, column-level; **−4: policies not executed/tested live.** |
| Audit | 15 | 14 | Append-only + triggers + single writer; −1: unexecuted immutability test. |
| MCP Protection | 15 | 14 | No raw SQL, risk tiers, bound params; −1: no adversarial fuzz run. |
| Financial Protection | 10 | 9 | NUMERIC everywhere, balanced entries; −1: reconciliation unexecuted. |
| Secrets | 5 | 5 | `.env` ignored, `.env.example`, no secret logging. |

## Defects

| Severity | Count | Notes |
|---|---:|---|
| P0 Critical | 0 | none identified in review |
| P1 High | 0 | none identified in review |
| P2 Medium | 1 | RLS policy `same_org` uses a subquery per row — fine for prototype scale, revisit for large tables. |
| P3 Low | 2 | No holiday calendar in working-day calc; `find_employee` uses `ilike '%q%'` (no trigram index). |

> Caveat: "0 P0/P1" reflects **review**, not an executed test pass. Treat the
> executed run in DEMO.md as the gate that confirms it.

## Loop status

`PLAN→BUILD→RUN→TEST→REVIEW→SCORE` completed one full pass. The plpgsql review
surfaced and fixed a real issue (unnecessary `%rowtype` field assignments in
`approve/reject_request`). The next loop iteration is **execution**: run the DB
on a non-elevated host, execute the test suites, and rescore QA/Security toward
≥96 — the corrective path is already written, not yet run here.

## Completion statement

This is a **working enterprise prototype** with a validated architecture,
compiling MCP server, and written+parsed test suites — **not** a
production-deployed, production-security-reviewed system. Per the master
prompt's own rule, completion at ≥96/≥96/≥96 is **not** declared: QA and
Security remain below 96 pending an executed test run, which this environment
could not perform.
