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
- The mounted block volume stores authoritative file bytes.
- File IDs/storage keys, not user filenames, determine paths.
- Large files are streamed.
- Staging + SHA-256 + fsync + atomic rename precede publication.
- Active objects are never overwritten in place.
- Deletion quarantines before purge.
- Anomalies are reconciled instead of blindly destroyed.
