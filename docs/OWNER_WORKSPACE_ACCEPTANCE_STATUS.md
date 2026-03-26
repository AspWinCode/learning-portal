# Owner Workspace Acceptance Status

Last updated: 2026-03-26

Reference review:
- Detailed line-by-line acceptance review: [OWNER_WORKSPACE_ACCEPTANCE_REVIEW.md](OWNER_WORKSPACE_ACCEPTANCE_REVIEW.md)

## Current State

Owner Workspace is in a working production state.

- Production backend is live.
- Deep links for project/contact/task are live.
- Alembic is aligned through `0089_owner_workspace_web_push_outbox`.
- In-app notifications are live.
- Email notifications are live through background outbox delivery.
- Web push notifications are live through background outbox delivery.
- Owner-workspace notification delivery runs in a dedicated worker service.

## Done

### Core workspace

- Separate owner-workspace sections and routes for projects, contacts, tasks, communications, history, notifications, and settings.
- Dedicated reporting route and tab inside owner-workspace:
  - `/owner-workspace/reports`
- Deep-link entity routes for:
  - `/owner-workspace/projects/:projectId`
  - `/owner-workspace/contacts/:contactId`
  - `/owner-workspace/tasks/:taskId`
- Shared owner-workspace shell with dialogs driven by route state.

### Projects

- Project list, filters, counters, and owner display.
- Project card editing for name, description, status, owner.
- Subprojects with tree view and parent reassignment.
- Project participants with project-level roles:
  - `member`
  - `manager`
  - `observer`
- Project contact binding and unbinding.
- Project archive flow with warnings and pre-archive navigation to active or overdue tasks.
- Project analytics:
  - task counters
  - participant workload block
  - navigation to filtered project tasks

### Contacts

- Contact list, filters, tags, and last interaction data.
- Contact card editing.
- Contact-to-project binding and unbinding.
- Contact task sections for active and completed/cancelled items.
- Contact communication context and message search.

### Tasks

- Task list, kanban, calendar.
- Search, sorting, filters, pagination, and bulk actions.
- Task card editing for the full main task payload.
- Checklist, attachments, comments, audit history, linked messages.
- Task completion flow with optional next-task creation.
- Protected destructive flow for task deletion with explicit confirmation dialog.

### Communications

- Three-column communications layout.
- Dialog list search.
- Message search inside conversation stream.
- Create task from message.
- Link message to existing task.
- Conversation read tracking and unread logic.

### Notifications

- In-app owner-workspace notifications for:
  - assignment
  - comments
  - mentions
  - task updates
  - due soon
  - overdue
  - incoming contact messages
- User-level notification preferences in settings.
- Email delivery toggle in user preferences.
- Web push delivery toggle in user preferences.
- Email outbox/background dispatcher with retry state on notifications.
- Web push subscription management for the current browser.
- Web push outbox/background dispatcher with retry state on notifications.
- Dedicated owner-workspace delivery worker service for email and web push dispatch.

### Settings

- Personal owner-workspace UI preferences stored in DB.
- System task config for statuses and priorities:
  - labels
  - enabled flags
  - settings UI for admin/owner
- System project status config:
  - labels
  - enabled flags
  - settings UI for admin/owner
- System notification-type config:
  - labels
  - enabled flags
  - settings UI for admin/owner
- Notification delivery diagnostics in settings:
  - email / web push outbox counters
  - recent delivery failures
  - web push subscription count
  - retry/requeue for failed deliveries
- System dictionaries for:
  - task tags
  - contact tags
  - contact sources
- Configurable project-role policy for manager capabilities in admin settings.
- Configurable limited-role policy for `sales` / `trainer` in admin settings:
  - project creation
  - contact creation
  - task creation
  - contact editing
  - task editing
  - project contact binding / unbinding
  - task completion
  - task bulk update
  - message-to-task linking
  - outgoing messages
  - task comments
- Role matrix section in settings.
- Formal permission-matrix table in settings for the main owner-workspace actions.
- "Your access" summary block in UI.

### Roles and permissions

- Global access model for `admin`, `owner`, `sales`, `trainer`.
- Project-scoped roles for `member`, `manager`, `observer`.
- `observer` enforced as read-only in backend mutate paths.
- `observer` reflected in frontend UI with disabled actions and explanatory alerts.
- `sales` and `trainer` create/edit flows aligned with backend restrictions and configurable policy flags for the main limited-role mutate actions.

### Analytics

- Task status counters.
- Task overview analytics block.
- Dedicated reporting surface inside owner-workspace.
- Employee workload analytics:
  - active
  - overdue
  - completed
  - average close time
- Attention zone for overloaded and overdue assignees.
- Drill-down from analytics to filtered task lists.
- Project overdue ranking block.

### UX hardening

- Confirm dialogs for:
  - task deletion
  - contact unlink from project
  - participant removal
  - project archive
- Removed remaining `window.confirm` usage from owner-workspace destructive flows.

### Audit and history

- Global history tab with filters for:
  - entity
  - action
  - author
  - date range
  - sort order
  - limit
- Task-level history inside task dialog.
- Readable action labels and compact changed-field summaries in both task history and global history.
- Deep-link opening from history rows into project/contact/task dialogs.
- History export:
  - CSV
  - JSON
- History API hardening for:
  - normalized entity/action filters
  - invalid date ranges
  - invalid entity/author ids
  - invalid entity types
  - explicit entity-id contract
- Shared history entity-type rule between router and access layer.

## Partial

### Acceptance alignment

- The implemented architecture now has deep-link entity URLs, but the product still primarily works as a shared owner-workspace shell with dialogs rather than fully separate standalone entity pages.

### Roles and permissions

- Permission behavior is much clearer in backend and UI, and admin settings now cover both manager policy and the main limited-role mutate actions.
- A formal matrix for the main actions now exists in settings, but not every edge-case owner-workspace action is maintained there yet.

### Notifications

- Email and web push delivery are present through an outbox/background dispatcher in a dedicated worker service.
- Delivery diagnostics and manual retry/requeue for failed notifications are available in settings, but there is still no broader replay/audit console beyond the owner-workspace admin surface.

### Audit and history

- History UX and backend filtering are now materially hardened, but there is still no separate compliance-style audit console or retention/forensics administration surface outside owner-workspace.

### Analytics

- Analytics now have a dedicated reporting surface inside owner-workspace, but not a separate standalone reporting module outside it.

## Deferred

### System administration

- Full formal permission-matrix administration beyond the current manager + limited-role policy surface.

### External delivery channels

- Mobile push notifications.

### Reporting expansion

- Dedicated reporting screens outside the owner-workspace surface.
- Wider manager dashboards beyond current reporting blocks.

### Product process

- Formal acceptance walkthrough against every original specification line item.
- Single maintained sign-off record per acceptance criterion.

## Known Risks

- Production PostgreSQL previously had WAL/write instability during migration recovery.
- The schema is currently aligned and the app is healthy, but infrastructure reliability still needs separate follow-up.
- There is an unrelated existing production integration issue with Tochka token retrieval; it does not block owner-workspace.
- Production backend currently does not expose configured `SMTP_* / FROM_EMAIL / WEB_PUSH_* / VAPID_*` environment variables in the runtime container, so external notification channels should be considered code-ready but not fully operational until env configuration is completed.

## Recommended Next Steps

1. Stabilize production DB operations and backup discipline.
2. Finish the acceptance/status documentation so it exactly matches the current notification and policy surface.
3. Decide whether reporting must remain inside owner-workspace or move into a standalone reporting module.
4. Decide whether the current history/audit surface is sufficient for sign-off or whether a broader audit console is required.
5. Configure and verify production SMTP and web-push/VAPID environment variables so external notification channels are operational, not only implemented in code.
6. Do a final acceptance pass against the current production state.
7. Decide whether mobile push is needed beyond the current web push channel.
