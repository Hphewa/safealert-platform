# Incident backend foundation

**Goal:** Implement the user's backend-only Incident foundation without changing reports,
risk assessments, mobile UI, or dependencies.

**Specification:** The user's implementation request in this conversation: an incident
references one or more VERIFIED reports of one hazard type; only officers create incidents;
the creator comes from authentication; a report may occur in only one ACTIVE incident.

**Architecture:** Follow the existing contracts/controller/service/repository/model pattern.
Incident.reportIds is the only membership source. An ACTIVE partial unique multikey index
prevents overlapping membership atomically, without report writes or transactions.
The location is a representative point copied from the first explicitly selected report,
not a centroid or a disaster boundary. No matching or status-changing endpoints.

## Implementation

- [ ] Add failing API/model/repository tests for authorization, evidence preservation,
  verified status, same hazard, strict input, duplicate IDs, and competing memberships.
- [ ] Add shared Incident constants/contracts and the incidents module (model, Zod schemas,
  repository interface and both adapters, service, thin controller, routes).
- [ ] Register injectable incidents in app.ts. Expose POST /api/v1/incidents and
  GET /api/v1/incidents/:incidentId. Creation accepts only reportIds (1-100 unique IDs).
- [ ] Verify test results, workspace typecheck/lint, and review. Document API and index
  provisioning requirements and distinguish real database tests from in-memory tests.

## Review focus

- Different arrays sharing even one report must conflict, including concurrent requests.
- Duplicate IDs within one array must be rejected separately: MongoDB's unique multikey
  constraint applies between documents, not repeated entries within a document.
- Mixed-case ObjectId inputs must normalize before duplicate checks and repository reads.
- Client-supplied creator, status, hazard, coordinates, or timestamps must be rejected.
- RESOLVED/CLOSED incidents do not reserve ACTIVE membership; lifecycle mutation is deferred.
- Existing APIs cannot edit VERIFIED report evidence/status. Any future report-edit or
  resolution workflow must coordinate eligibility changes with incident membership.
