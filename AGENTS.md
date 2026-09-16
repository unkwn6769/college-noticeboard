# Engineering Contract

Read `docs/PHASE-1.md` and the architecture handoff before changing infrastructure.

Do not reintroduce:
- Google Drive
- migration engines or queues
- Redis/RabbitMQ/Kafka/Temporal
- Kubernetes
- external primary file storage
- Cloudflare Workers for core filesystem operations

Preserve these invariants:
- PostgreSQL controls logical file state.
- OCI Block Volume stores bytes.
- file IDs/storage keys, not user filenames, determine paths.
- large files are streamed.
- staging + SHA-256 + fsync + atomic rename precede publication.
- active objects are never overwritten in place.
- deletion quarantines before purge.
- anomalies are reconciled instead of blindly destroyed.
