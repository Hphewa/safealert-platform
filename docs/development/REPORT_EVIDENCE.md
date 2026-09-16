# Report evidence images

Resident photo selection requests image bytes from the existing Expo image picker. Submission sends the photo with the report as `photo: { base64 }`; device-local file paths are never used as shared evidence URLs. The API accepts JPEG, PNG, and WebP photos up to 5 MB, stores the file outside MongoDB, and saves only its generated `mediaReference` in the report. It removes the file if creating the report fails.

`GET /api/v1/reports/:reportId/evidence` returns `{ dataUri }` through the existing authenticated API client. Disaster officers and the report's resident owner can read the image. Volunteers can read it only while the report is pending, matching their existing report access. The response is private and not cached. The mobile image component supports native and web clients, displays the entire photo, and offers retry on load errors. Existing HTTP(S) image URLs continue to work without sending the API token to external image hosts.

## Storage setup

The default directory is `apps/api/uploads/report-evidence`, excluded from Git. No new credentials or mobile dependencies are required for local development.

For deployment, set `REPORT_EVIDENCE_DIRECTORY` to a durable, writable filesystem directory. Mount persistent storage there and back it up alongside MongoDB; containers or hosts with ephemeral disks must not rely on the default directory. Multiple API instances must share the same storage. MongoDB backups alone do not contain image files. The storage adapter is `apps/api/src/modules/reports/services/reportEvidence.storage.ts` if object storage is introduced later.

## Manual check

1. Restart the API and reload the mobile app.
2. As a resident, create a new hazard report with a selected or captured photo under 5 MB.
3. Sign in as a disaster officer, open Reports, then the new report's Incident Details.
4. Confirm that Resident Evidence shows the photo. Reload the page and verify it remains available.
5. Temporarily disconnect the device, reopen the report photo, and confirm retry works after reconnecting.

Older reports submitted by the previous mobile flow have no uploaded photo: that flow previewed the photo locally but omitted it from submission. Those missing bytes cannot be restored from the report record. Submit a new report with the photo to exercise the fixed flow.
