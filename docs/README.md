# Documentation

Start with [`AGENTS.md`](../AGENTS.md) at the repository root — architecture,
commands, conventions and boundaries. The documents here are the deeper
references it links to; read one only when a task needs it.

| Document | Read it when |
|---|---|
| [design/style-guide.md](./design/style-guide.md) | **Before any visual change.** The UI Design & Style Guide 1.1 (light + dark), transcribed from the [PDF](./design/FAU_Erdal_Barnehage_UI_Design_Style_Guide_v1.1.pdf) beside it, with a guide → repo mapping and a checklist. |
| [architecture.md](./architecture.md) | You need the boundary/trust model: who validates what across browser → handler → Neon/Cloudinary/Gmail. |
| [subsystems.md](./subsystems.md) | You are touching the yearly calendar, the `/kalender.ics` feed, or the newsletter broadcast. These have invariants the code alone does not reveal. |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deploying or operating on Vercel: environment variables, database setup, verification, monitoring, rollback. |
| [review-backlog.md](./review-backlog.md) | Picking up scoped remediation work from the 2026-09-09 audit. Superseded by `REVIEW_TASKS.md` at the repository root, and its checkbox state is known to be stale — see task `DOC-001` there. |
| [reviews/](./reviews) | You want the evidence behind the backlog: the point-in-time repository review and the UI→database traceability matrix (2026-09-09). Historical snapshots, not live documentation. |
