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
| [database-testing.md](./database-testing.md) | Running disposable PostgreSQL concurrency and integrity tests locally or in CI. |

Keep this directory focused on current guidance. Completed review reports and
task lists are removed after lasting decisions and remaining checks have been
folded into the documents above. Use Git history for earlier committed reviews;
use the outstanding checklist in [DEPLOYMENT.md](./DEPLOYMENT.md) for release work.
