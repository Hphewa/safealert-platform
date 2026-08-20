# SafeAlert Product Overview

SafeAlert is a mobile disaster and flood warning, reporting, verification, rescue coordination, and safety alert platform. It is intended for communities facing local disasters, especially floods and related emergencies where fast reporting and unreliable connectivity are both normal.

## Roles

SafeAlert has four user roles in one shared mobile application:

- `RESIDENT`
- `COMMUNITY_VOLUNTEER`
- `DISASTER_OFFICER`
- `EMERGENCY_RESPONDER`

Authentication and role-based navigation will be implemented later. Do not create separate apps or duplicated infrastructure per role.

## Resident Flow Summary

Residents will eventually report hazards by selecting a hazard type, capturing or confirming their GPS location, adding photo evidence, describing the situation, selecting severity, reviewing the report, and submitting it. Reports may begin as `PENDING` and later become `VERIFIED`, `REJECTED`, or `RESOLVED`.

If internet access is unavailable, reports should eventually be saved locally, marked for synchronization, and retried when connectivity returns.

## Community Volunteer Flow Summary

Community Volunteers will eventually review nearby or incoming reports, inspect location, time, photos, descriptions, severity, and nearby related reports, then decide whether they can confirm conditions in the field.

Volunteer confirmations must be stored separately from original Resident reports so field observations do not overwrite the original report.

## Disaster Officer Flow Summary

Disaster Officers will eventually review pending reports and field confirmations, group reports by location, determine reliability, reject unreliable reports with reasons, officially verify reliable reports, assess risk, and publish warnings when needed.

Risk levels are `LOW`, `MODERATE`, `HIGH`, and `CRITICAL`. Only Disaster Officers should officially verify reports or publish official warnings.

## Emergency Responder Flow Summary

Emergency Responders will eventually manage assigned rescue or assistance requests ordered by priority. A responder request can move through `ASSIGNED`, `DISPATCHED`, `ARRIVED`, `IN_PROGRESS`, and `COMPLETED`.

Responder updates must support offline capture and later synchronization. Priority calculation will happen on the backend.

## Disaster And Offline Context

Connectivity may fail during disasters. SafeAlert should eventually use local persistence, cached server data, and one shared pending mutation queue for offline operations across all roles. Future queued operations should include a unique client operation ID or idempotency key to avoid duplicate server actions during retries.
