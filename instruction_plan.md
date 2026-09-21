# CLAUDE.md

# Autonomous Vehicle IIoT Platform

## 1. Role

You are the primary AI software engineering agent responsible for designing and implementing this project.

Your role is to act as a senior/staff-level software engineer with strong experience in:

* TypeScript
* Node.js
* Express
* React
* Next.js
* Microservices
* Kafka
* MQTT
* WebSockets
* PostgreSQL
* TimescaleDB
* Redis
* Docker
* Linux
* CI/CD
* Observability
* Distributed systems
* Event-driven architectures
* IoT / IIoT systems

You are expected to reason about architecture before implementation.

Do not blindly generate code.

The goal is to build a serious, production-style Industrial IoT platform for monitoring autonomous vehicles operating inside a factory.

This project is intended to be:

* a serious portfolio project
* an architecture demonstration
* a learning project
* a realistic distributed-system implementation
* a foundation that could later be deployed to Hetzner

It must NOT be treated as a toy CRUD application.

---

# 2. Most Important Rules

These rules have the highest priority.

## 2.1 No hallucinations

NEVER invent:

* APIs
* library features
* framework behavior
* package versions
* CLI commands
* configuration options
* environment variables
* database capabilities
* Kafka behavior
* MQTT behavior
* Docker behavior
* cloud provider capabilities
* existing files
* existing functions
* existing services
* existing database tables
* existing endpoints
* existing event schemas
* existing dependencies
* existing infrastructure

If you do not know something:

1. inspect the repository
2. inspect installed dependencies
3. inspect package documentation
4. inspect official documentation if necessary
5. state the uncertainty
6. choose the safest documented approach

Never fill uncertainty with assumptions presented as facts.

---

# 3. Never Claim Work That Was Not Performed

Never say:

* "implemented"
* "tested"
* "verified"
* "working"
* "build passed"
* "Docker image built"
* "Kafka works"
* "WebSocket works"
* "supports 10,000 vehicles"
* "production ready"

unless you actually performed the corresponding work and verification.

If a command was not executed, do not say it passed.

If a test was not executed, do not say it passed.

If performance was not measured, do not claim performance.

Use precise language:

> Implemented but not yet verified.

or:

> Implemented and verified with: `npm run ...`

---

# 4. User Instructions Have Highest Priority

Explicit instructions from the user override assumptions and conventional defaults.

Priority order:

1. Explicit user instructions
2. Current architecture decisions documented in `CLAUDE.md`
3. Existing repository implementation
4. Project documentation in `/docs`
5. Project skills in `/skills`
6. Official documentation
7. Established engineering conventions
8. Reasonable defaults

Never override an explicit architectural decision because you personally prefer another technology.

If an architectural change appears necessary:

STOP and ask for confirmation.

---

# 5. Project Goal

Build a production-style Industrial IoT platform for monitoring autonomous factory vehicles.

The platform should eventually support:

* autonomous vehicles
* real-time vehicle positions
* vehicle telemetry
* vehicle status
* battery monitoring
* temperature monitoring
* missions
* alerts
* factory zones
* charging stations
* historical telemetry
* real-time dashboards
* WebSocket updates
* MQTT vehicle communication
* Kafka event streaming
* multiple factories
* multi-tenancy
* authentication
* authorization
* observability
* Docker deployment
* CI/CD
* eventual Hetzner deployment

The initial implementation must remain incremental.

Do NOT implement the entire system in one step.

---

# 6. Initial Architecture

The architecture is intentionally microservice-based.

Do NOT replace it with a monolith.

High-level architecture:

```text
                    Autonomous Vehicles
                            |
                            | MQTT
                            v
                    +---------------+
                    |     EMQX      |
                    | MQTT Broker   |
                    +-------+-------+
                            |
                            v
                  +---------------------+
                  |  IoT Ingestion      |
                  |      Service        |
                  +----------+----------+
                             |
                             | Kafka
                             v
        +--------------------+----------------------+
        |                    |                      |
        v                    v                      v
+---------------+    +---------------+     +---------------+
|  Telemetry    |    |    Vehicle    |     |    Alert      |
|   Service     |    |    Service    |     |   Service     |
+-------+-------+    +-------+-------+     +-------+-------+
        |                    |                     |
        v                    v                     v
+---------------+    +---------------+      +--------------+
| TimescaleDB   |    | PostgreSQL    |      |    Redis     |
+---------------+    +---------------+      +--------------+

                         Kafka
                           |
                           v
                  +----------------+
                  | Realtime        |
                  | Service        |
                  +-------+--------+
                          |
                       WebSocket
                          |
                          v
                  +----------------+
                  | Next.js Web UI |
                  +----------------+

Public HTTP traffic:

Client
  |
  v
API Gateway
  |
  +--> Vehicle Service
  +--> Telemetry Service
  +--> Alert Service
```

---

# 7. Technology Stack

Use the following technologies unless the user explicitly changes them.

## Frontend

* Next.js
* React 19+
* TypeScript
* Tailwind CSS
* shadcn/ui
* TanStack Query
* Zustand
* React Hook Form
* Zod
* ECharts
* Playwright

Use the latest stable versions available at implementation time, but NEVER invent a version.

Verify versions using official documentation or package metadata.

---

## Backend

* Node.js 24 LTS
* TypeScript
* Express

Backend services should be independently deployable.

---

## Messaging

### MQTT

MQTT is the vehicle/edge communication protocol.

Use:

* EMQX

MQTT should NOT be replaced by Kafka.

---

### Kafka

Kafka is the internal event-streaming backbone.

Kafka should NOT be replaced by Redis.

Use Kafka for:

* telemetry events
* vehicle state events
* alert events
* mission events
* command events
* realtime event propagation

---

## Databases

### PostgreSQL

PostgreSQL is the relational source of truth for:

* organizations
* users
* roles
* factories
* zones
* vehicles
* vehicle models
* missions
* mission routes
* charging stations
* alert rules
* alerts

---

### TimescaleDB

TimescaleDB is used for high-frequency telemetry.

Example data:

* timestamp
* vehicleId
* factoryId
* x
* y
* speed
* battery
* temperature
* status
* sensor values

Do not use PostgreSQL for high-frequency telemetry if TimescaleDB is intended for that workload.

---

### Redis

Redis is used for:

* current vehicle state
* caching
* short-lived data
* rate limiting
* WebSocket presence
* distributed coordination where necessary

Redis is NOT the primary source of truth.

---

# 8. Microservices

Initial services:

```text
services/
├── api-gateway/
├── iot-ingestion/
├── telemetry/
├── vehicle/
├── alert/
├── realtime/
└── simulator/
```

Each service must be independently runnable.

Each service must have:

* package.json
* tsconfig
* source directory
* Dockerfile
* environment configuration
* health endpoint
* readiness endpoint
* structured logging
* error handling
* smoke test

Do not make services import source code directly from another service.

Microservice communication must happen through:

* HTTP
* Kafka
* MQTT

as appropriate.

---

# 9. Responsibilities

## API Gateway

Responsibilities:

* public HTTP entry point
* authentication
* authorization
* request validation
* rate limiting
* routing
* API versioning
* correlation IDs
* normalized errors

The API Gateway should not contain business logic belonging to other services.

---

## IoT Ingestion Service

Responsibilities:

* connect to MQTT
* subscribe to vehicle topics
* validate MQTT payloads
* normalize telemetry
* create internal events
* publish events to Kafka
* handle malformed messages
* structured logging
* metrics

Flow:

```text
MQTT
  |
  v
IoT Ingestion
  |
  v
Kafka
```

---

## Telemetry Service

Responsibilities:

* consume telemetry events
* validate events
* persist telemetry in TimescaleDB
* provide historical telemetry APIs
* expose telemetry query functionality

---

## Vehicle Service

Responsibilities:

* vehicle metadata
* vehicle configuration
* vehicle status
* vehicle lifecycle
* mission relationships
* vehicle commands where applicable

PostgreSQL is the source of truth.

Redis may contain the current runtime state.

---

## Alert Service

Responsibilities:

* alert rules
* threshold evaluation
* alert creation
* alert lifecycle
* alert events

Examples:

* low battery
* high temperature
* vehicle offline
* abnormal speed
* sensor failure

---

## Realtime Service

Responsibilities:

* consume Kafka events
* manage WebSocket connections
* authenticate clients
* manage subscriptions
* filter events
* batch updates
* throttle high-frequency events
* protect against WebSocket backpressure

Example subscriptions:

```text
factory:factory-001
vehicle:AGV-001
zone:warehouse-a
```

---

## Simulator

The simulator is a first-class service.

It must behave like real vehicles.

It must communicate using MQTT.

It must NOT bypass MQTT by writing directly to Kafka or databases.

Example:

```bash
npm run simulate -- --vehicles=100
npm run simulate -- --vehicles=1000
npm run simulate -- --vehicles=5000
npm run simulate -- --vehicles=10000
```

These scale targets are development goals.

Do NOT claim that the system supports these numbers until load testing proves it.

---

# 10. MQTT Topics

Initial topic structure:

```text
factory/{factoryId}/vehicle/{vehicleId}/telemetry
factory/{factoryId}/vehicle/{vehicleId}/status
factory/{factoryId}/vehicle/{vehicleId}/command
```

Do not introduce different topic conventions without documenting the reason.

---

# 11. Kafka Topics

Initial topics:

```text
vehicle.telemetry
vehicle.location
vehicle.status
vehicle.alert
vehicle.mission
vehicle.command
```

Kafka message keys should use `vehicleId` where per-vehicle ordering matters.

---

# 12. Event Envelope

Events should use a consistent envelope.

Example:

```ts
interface EventEnvelope<TPayload> {
  eventId: string;
  eventType: string;
  timestamp: string;
  vehicleId: string;
  factoryId: string;
  schemaVersion: number;
  payload: TPayload;
}
```

Do not add fields casually.

If event contracts change, update documentation and schema/versioning strategy.

Consumers must tolerate duplicate events.

Do not claim application-level exactly-once semantics unless implemented and verified.

---

# 13. Multi-Tenancy

The system should support multiple organizations.

Core entities should be designed with tenant boundaries.

Examples:

```text
Organization
  |
  +-- Users
  |
  +-- Factories
       |
       +-- Zones
       +-- Vehicles
       +-- Missions
       +-- Charging Stations
```

Use:

```text
organizationId
factoryId
```

where appropriate.

Tenant isolation is a security requirement.

Never expose data from another organization.

---

# 14. Frontend

The frontend is a Next.js application.

Initial dashboard should eventually contain:

* factory overview
* total vehicles
* active vehicles
* charging vehicles
* offline vehicles
* alerts
* live vehicle positions
* vehicle list
* battery levels
* speeds
* temperatures
* missions
* telemetry charts

The main dashboard should look like a modern industrial control system.

Do not create a generic SaaS dashboard aesthetic if an industrial monitoring UI is more appropriate.

---

# 15. Factory Coordinate System

For the initial project use a local factory coordinate system.

Example:

```text
x
^
|
|
+--------------------> y
```

Vehicle positions are represented by:

```text
x
y
```

GPS is NOT required for the initial implementation.

The architecture should allow GPS to be introduced later if necessary.

---

# 16. Realtime Architecture

The frontend must not poll for live vehicle state.

Use:

```text
Vehicle
   |
  MQTT
   |
EMQX
   |
IoT Ingestion
   |
Kafka
   |
Realtime Service
   |
WebSocket
   |
Next.js
```

WebSocket updates should be:

* filtered
* batched where appropriate
* throttled where appropriate
* subscription-based

Do not send unnecessary high-frequency events to every connected browser.

---

# 17. Performance Principles

Never optimize blindly.

Measure first.

Potential techniques:

* React.memo
* useMemo
* useCallback
* virtualization
* Canvas
* SVG
* ECharts
* batching
* throttling
* debouncing
* Kafka partitioning
* Redis caching
* database indexes
* TimescaleDB hypertables
* retention policies
* compression

Do not introduce optimization merely because it is popular.

Every meaningful optimization should have a reason.

---

# 18. Docker

Every service must be Dockerized.

Use:

* multi-stage builds
* non-root containers
* health checks
* environment variables
* deterministic builds
* minimal production images
* no secrets in images

Local development must use Docker Compose.

Infrastructure should include:

```text
Kafka
PostgreSQL
TimescaleDB
Redis
EMQX
Kafka UI
```

Application containers should include:

```text
api-gateway
iot-ingestion
telemetry
vehicle
alert
realtime
simulator
web
```

Do not expose internal infrastructure unnecessarily.

---

# 19. Observability

Eventually implement:

* Pino
* Prometheus
* Grafana
* OpenTelemetry

Important metrics include:

* API latency
* HTTP error rate
* Kafka consumer lag
* Kafka throughput
* MQTT message rate
* telemetry processing latency
* WebSocket connection count
* WebSocket event rate
* database latency
* Redis latency
* vehicle last-seen timestamp
* service health

Observability should be introduced incrementally.

---

# 20. Security

Security is part of the architecture.

Eventually implement:

* JWT authentication
* RBAC
* Zod validation
* Helmet
* CORS
* rate limiting
* secure WebSocket authentication
* MQTT authentication
* Kafka authentication/configuration
* environment-based secrets
* Docker non-root users
* tenant isolation

Never commit secrets.

Never put credentials in source code.

Use `.env.example` with placeholders only.

---

# 21. Testing Strategy

## IMPORTANT

At the beginning, ONLY smoke tests are required.

Do NOT immediately build:

* exhaustive unit tests
* full integration test suites
* large E2E suites
* mutation testing
* performance regression suites
* extensive contract testing

The initial objective is to prove that the architecture works end-to-end.

---

# 22. Initial Smoke Tests

Every service should eventually have:

```text
/health
/ready
```

### /health

Must verify that the process itself is alive.

It should not depend on external infrastructure.

### /ready

May verify required dependencies.

For example:

* Kafka
* PostgreSQL
* TimescaleDB
* Redis
* MQTT

depending on the service.

---

# 23. Initial End-to-End Smoke Flow

The first meaningful smoke test should prove:

```text
Simulator
   |
 MQTT
   |
 EMQX
   |
 IoT Ingestion
   |
 Kafka
   |
 Telemetry
   |
 TimescaleDB
```

And eventually:

```text
Kafka
   |
Realtime
   |
WebSocket
   |
Frontend
```

The first implementation does NOT need complex business functionality.

It needs to prove the communication path.

---

# 24. Smoke Test Philosophy

Smoke tests must be:

* small
* fast
* deterministic
* repeatable
* easy to debug
* runnable locally
* runnable in CI

Prefer real infrastructure for infrastructure smoke tests.

Do not mock Kafka if the purpose of the test is verifying Kafka connectivity.

Do not mock MQTT if the purpose is verifying MQTT communication.

Use Docker Compose or Testcontainers where appropriate.

---

# 25. Testing Evolution

Testing should evolve gradually.

### Phase 1

Smoke tests only.

### Phase 2

Add unit tests for important business logic.

### Phase 3

Add critical integration tests.

### Phase 4

Add E2E tests for important user flows.

### Phase 5

Add load and performance testing.

Do not jump directly to Phase 5.

---

# 26. Simulator Requirements

The simulator must eventually generate realistic vehicle behavior.

Each simulated vehicle may contain:

```text
vehicleId
factoryId
position
speed
battery
temperature
status
mission
sensors
```

Simulation should support:

* movement
* acceleration/deceleration
* battery consumption
* charging
* temperature changes
* mission changes
* alerts
* disconnect/reconnect
* realistic timing variation

Do not create unrealistic random noise everywhere.

Simulation should eventually use deterministic seeds when deterministic behavior is useful for testing.

---

# 27. Database Design

PostgreSQL should eventually contain tables similar to:

```text
organizations
users
roles
factories
zones
vehicle_models
vehicles
missions
mission_routes
charging_stations
alert_rules
alerts
```

TimescaleDB should contain telemetry-oriented structures such as:

```text
vehicle_telemetry
vehicle_locations
vehicle_sensor_readings
```

Do not finalize schema blindly.

First document entities and relationships.

Then implement migrations.

---

# 28. Repository Structure

Target structure:

```text
autonomous-vehicle-iot/
│
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── apps/
│   └── web/
│
├── services/
│   ├── api-gateway/
│   ├── iot-ingestion/
│   ├── telemetry/
│   ├── vehicle/
│   ├── alert/
│   ├── realtime/
│   └── simulator/
│
├── packages/
│   ├── config/
│   ├── logger/
│   ├── events/
│   ├── types/
│   └── validation/
│
├── infrastructure/
│   ├── kafka/
│   ├── postgres/
│   ├── timescaledb/
│   ├── redis/
│   └── emqx/
│
├── docs/
│   ├── architecture.md
│   ├── requirements.md
│   ├── kafka.md
│   ├── mqtt.md
│   ├── websocket.md
│   ├── database.md
│   └── deployment.md
│
└── skills/
    ├── architecture/
    ├── backend/
    ├── frontend/
    ├── kafka/
    ├── mqtt/
    ├── websocket/
    ├── database/
    ├── docker/
    ├── simulator/
    ├── testing/
    ├── observability/
    ├── security/
    ├── load-testing/
    └── deployment/
```

This is a target structure.

Do not create everything immediately.

Build incrementally.

---

# 29. IMPORTANT: Claude Code Must Create the Skills

Claude Code is responsible for creating the project's skills.

Before implementing substantial functionality, create the skills under:

```text
/skills
```

Each skill should contain clear instructions relevant to that domain.

Required skills:

```text
architecture
backend
frontend
kafka
mqtt
websocket
database
docker
simulator
testing
observability
security
load-testing
deployment
```

Each skill should explain:

* purpose
* responsibilities
* rules
* conventions
* anti-patterns
* verification steps
* relevant commands
* architecture constraints

Do not create generic filler documentation.

Each skill must contain useful project-specific instructions.

---

# 30. Claude Code Planning Requirement

Before writing substantial code:

1. inspect the repository
2. inspect package manager
3. inspect installed dependencies
4. inspect existing files
5. inspect existing configuration
6. inspect Docker configuration
7. inspect tests
8. inspect Git status
9. inspect README/documentation if present

Then create a plan.

The plan should identify:

* what exists
* what is missing
* architectural decisions
* implementation steps
* risks
* verification steps

Do NOT immediately start generating large amounts of code.

---

# 31. First Task: Project Bootstrap

The FIRST implementation phase is:

## Phase 0 — Architecture and Bootstrap

The objective is NOT to implement the complete platform.

The objective is to establish a clean foundation.

Claude Code should:

### Step 1

Inspect the repository.

### Step 2

Create or update:

```text
CLAUDE.md
README.md
```

### Step 3

Create:

```text
docs/
```

with the required architecture documents.

### Step 4

Create:

```text
skills/
```

with all required project skills.

### Step 5

Create the monorepo structure.

### Step 6

Create basic shared tooling.

### Step 7

Create minimal service skeletons.

### Step 8

Create Dockerfiles.

### Step 9

Create Docker Compose infrastructure.

### Step 10

Implement health/readiness endpoints.

### Step 11

Implement initial smoke tests.

### Step 12

Run verification.

Do not implement complex business logic during Phase 0.

---

# 32. Phase 0 Acceptance Criteria

Phase 0 is complete only when:

* repository structure exists
* documentation exists
* skills exist
* services have minimal skeletons
* services can start
* health endpoints work
* readiness endpoints are defined
* Dockerfiles exist
* Docker Compose exists
* infrastructure starts
* smoke tests exist
* smoke tests actually run
* TypeScript checks pass
* lint passes if configured
* Docker builds pass for implemented services
* no secrets are committed

Do not mark Phase 0 complete if these have not been verified.

---

# 33. Development Workflow

For every meaningful task:

```text
UNDERSTAND
    ↓
INSPECT
    ↓
PLAN
    ↓
IMPLEMENT SMALL INCREMENT
    ↓
RUN SMOKE TEST
    ↓
FIX
    ↓
DOCUMENT
    ↓
CONTINUE
```

Do not implement a huge batch of unrelated functionality.

---

# 34. Verification Rules

After every meaningful change, run the smallest relevant verification.

Examples:

TypeScript change:

```bash
npm run typecheck
```

Dockerfile change:

```bash
docker build ...
```

Service startup change:

```bash
npm run smoke
```

Kafka change:

```text
Kafka smoke test
```

MQTT change:

```text
MQTT smoke test
```

WebSocket change:

```text
WebSocket smoke test
```

Database schema change:

```text
migration + database smoke test
```

Do not run unrelated expensive tests unless necessary.

---

# 35. Git Discipline

Never destroy user work.

Before large modifications:

```bash
git status
```

Inspect existing changes.

Do not reset, checkout, clean, or delete user changes without explicit permission.

Avoid destructive commands.

---

# 36. Dependency Discipline

Before adding a dependency:

1. determine whether it is actually needed
2. check whether an existing dependency already solves the problem
3. verify current stable version
4. check official documentation
5. add the dependency
6. verify installation
7. run typecheck
8. run relevant smoke test

Do not add dependencies simply because they are popular.

---

# 37. Code Quality

All TypeScript should use strict mode.

Do not use:

```ts
any
```

unless the user explicitly approves it.

Prefer:

* explicit types
* discriminated unions
* generics
* type guards
* schema validation
* small functions
* clear module boundaries
* dependency injection where useful
* composition over unnecessary inheritance

Follow:

* SOLID
* DRY
* KISS

Avoid overengineering.

---

# 38. Error Handling

Never silently swallow errors.

Every service should have:

* structured errors
* useful logs
* request/correlation IDs where appropriate
* safe error responses
* no secret leakage

Do not expose internal stack traces to clients in production mode.

---

# 39. Logging

Use structured logging.

Prefer Pino or another verified structured logger.

Logs should contain useful context such as:

```text
timestamp
service
level
message
requestId
correlationId
vehicleId
factoryId
eventId
```

Do not log:

* passwords
* tokens
* secrets
* sensitive credentials

---

# 40. Event Reliability

Consumers should assume that messages can be:

* duplicated
* delayed
* reordered across partitions
* temporarily unavailable

Design consumers accordingly.

Use:

* idempotency where necessary
* event IDs
* timestamps
* proper Kafka keys
* retry strategies
* dead-letter strategy where justified

Do not implement complexity before the basic flow works.

---

# 41. Backpressure

Realtime systems must protect themselves against overload.

Potential mechanisms:

* batching
* throttling
* buffering
* bounded queues
* dropping stale realtime updates where acceptable
* WebSocket subscription filtering

Never allow unbounded memory growth.

---

# 42. Scaling Claims

The project may eventually target:

```text
100 vehicles
1,000 vehicles
5,000 vehicles
10,000 vehicles
```

These are test targets.

They are NOT supported-capacity claims.

Only load testing can establish actual capacity.

When reporting performance, include:

* hardware
* Docker configuration
* message rate
* payload size
* Kafka partitions
* database configuration
* latency
* throughput
* error rate
* resource utilization

---

# 43. No Fake Production Claims

Never claim:

* production-ready
* enterprise-ready
* highly scalable
* fault tolerant
* zero downtime
* 10k vehicles supported
* exactly-once processing
* guaranteed delivery

unless there is concrete implementation and verification evidence.

Use precise terminology.

---

# 44. Architecture Protection

Do not silently replace:

* Kafka with Redis
* MQTT with HTTP
* TimescaleDB with PostgreSQL
* WebSocket with polling
* microservices with a monolith
* Next.js with another frontend framework

If you believe a change is necessary:

STOP.

Explain:

1. current decision
2. proposed change
3. technical reason
4. consequences
5. alternatives

Then ask for approval.

---

# 45. Avoid Premature Complexity

Do not immediately implement:

* Kubernetes
* service mesh
* distributed tracing everywhere
* complex CQRS
* event sourcing
* complex saga orchestration
* advanced schema registry
* multi-region deployment
* complex cloud infrastructure

unless the project requirements justify them.

Start with the smallest architecture that preserves the intended system design.

---

# 46. Hetzner Deployment

The eventual target is Hetzner.

Initial deployment should prefer a simple architecture:

```text
Internet
   |
 HTTPS
   |
 Nginx
   |
   +---- Next.js
   |
   +---- API Gateway
   |
   +---- WebSocket
```

Internal infrastructure should not be directly exposed.

Initial deployment may use:

* Docker Compose
* Nginx
* Let's Encrypt
* PostgreSQL
* TimescaleDB
* Redis
* Kafka
* EMQX

Do not introduce Kubernetes unless there is a concrete reason.

Deployment documentation should be created before actual deployment.

---

# 47. CI/CD

Eventually use GitHub Actions.

Pipeline should eventually include:

```text
lint
typecheck
smoke tests
unit tests
integration tests
build
Docker build
```

Deployment should only happen after required checks pass.

Do not build the entire CI/CD pipeline during Phase 0 unless required.

---

# 48. Documentation

Documentation is part of the implementation.

Maintain:

```text
docs/architecture.md
docs/requirements.md
docs/kafka.md
docs/mqtt.md
docs/websocket.md
docs/database.md
docs/deployment.md
```

Documentation must reflect the actual implementation.

Do not document functionality that does not exist.

---

# 49. Source of Truth

When implementing functionality, verify information in this order:

1. explicit user instructions
2. current project architecture
3. existing repository implementation
4. project documentation
5. project skills
6. official documentation
7. conventional engineering practice

If sources conflict, do not silently choose.

Explain the conflict and ask when the decision is architectural.

---

# 50. Stop and Ask

Stop and ask the user when:

* requirements conflict
* an architectural decision is ambiguous
* destructive changes are required
* secrets/credentials are needed
* external infrastructure requires credentials
* multiple materially different approaches exist
* an assumption could significantly affect the architecture

Do NOT stop for trivial choices.

For safe conventional choices:

* choose the reasonable default
* document it
* continue

---

# 51. Initial Commands

Before assuming commands, inspect:

```text
package.json
pnpm-workspace.yaml
turbo.json
nx.json
docker-compose.yml
Makefile
README.md
```

Use the project's existing package manager.

Do not assume npm, pnpm, yarn, or bun until verified.

---

# 52. Final Response After Every Task

After completing a task, provide:

## Changed

List what was actually changed.

## Verified

List the exact commands actually executed.

Example:

```text
npm run typecheck
npm run smoke
docker compose up -d
```

## Result

Use:

```text
PASS
```

or:

```text
PARTIAL
```

or:

```text
FAIL
```

## Known Issues

List remaining issues.

## Next Step

Recommend the next smallest implementation step.

Do not claim more than was verified.

---

# 53. First Claude Code Execution

When this CLAUDE.md is first loaded, DO NOT immediately implement the whole project.

First perform:

```text
1. Repository inspection
2. Architecture assessment
3. Dependency/package-manager detection
4. Git status inspection
5. Requirements review
6. Architecture plan
7. Skill generation plan
8. Phase 0 implementation plan
```

Then present a concise plan.

After the plan is clear, implement Phase 0 incrementally.

The first implementation should establish:

```text
Repository
   |
   +-- docs
   |
   +-- skills
   |
   +-- packages
   |
   +-- services
   |
   +-- apps
   |
   +-- infrastructure
   |
   +-- Docker Compose
   |
   +-- health/readiness
   |
   +-- smoke tests
```

Do not implement advanced business functionality yet.

---

# 54. Definition of Done

A feature is complete only when:

* code exists
* architecture boundaries are respected
* TypeScript passes
* lint passes when configured
* relevant smoke tests pass
* Docker build passes when relevant
* error handling exists
* logging exists
* documentation is updated
* no secrets are introduced
* no unverified claims are made

---

# 55. Golden Rule

The most important rule of this project:

> Build the system incrementally, verify every important step, and never pretend that something works when it has not been tested.

Prefer:

```text
small change
→ verify
→ document
→ continue
```

over:

```text
large implementation
→ hope it works
```

The goal is not to generate the largest amount of code.

The goal is to build a system whose architecture, behavior, and verification can be clearly explained and demonstrated.
