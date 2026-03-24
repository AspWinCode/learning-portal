# Owner Workspace Acceptance Status

Last updated: 2026-03-24

## Current State

Owner Workspace is in a working production state.

- Production backend is live.
- Deep links for project/contact/task are live.
- Alembic is aligned through `0088_owner_workspace_notification_email_outbox`.
- In-app notifications are live.
- Email notifications are live through background outbox delivery.

## Done

### Core workspace

- Separate owner-workspace sections and routes for projects, contacts, tasks, communications, history, notifications, and settings.
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
- Email outbox/background dispatcher with retry state on notifications.

### Settings

- Personal owner-workspace UI preferences stored in DB.
- System task config for statuses and priorities:
  - labels
  - enabled flags
  - settings UI for admin/owner
- Role matrix section in settings.
- “Your access” summary block in UI.

### Roles and permissions

- Global access model for `admin`, `owner`, `sales`, `trainer`.
- Project-scoped roles for `member`, `manager`, `observer`.
- `observer` enforced as read-only in backend mutate paths.
- `observer` reflected in frontend UI with disabled actions and explanatory alerts.
- `sales` and `trainer` create/edit flows aligned more closely with backend restrictions.

### Analytics

- Task status counters.
- Task overview analytics block.
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

## Partial

### Acceptance alignment

- The implemented architecture now has deep-link entity URLs, but the product still primarily works as a shared owner-workspace shell with dialogs rather than fully separate standalone entity pages.

### Roles and permissions

- Permission behavior is much clearer in backend and UI, but there is still no dedicated admin surface for managing a formal permission matrix as configurable product policy.

### Analytics

- Analytics now cover task and project visibility well, but they are still embedded in owner-workspace rather than exposed as a separate reporting module.

### Notifications

- Email delivery is present, but it is still a lightweight application-level outbox, not a separate worker/service tier.

## Deferred

### System administration

- Full module-level admin settings for:
  - access rules as configurable policy
  - notification-type administration
  - broader dictionaries beyond current task status/priority config

### External delivery channels

- Web push notifications.
- Mobile push notifications.

### Reporting expansion

- Dedicated reporting screens outside the owner-workspace surface.
- Wider manager dashboards beyond current embedded analytics blocks.

### Product process

- Formal acceptance walkthrough against every original TЗ line item.
- Single maintained sign-off record per acceptance criterion.

## Known Risks

- Production PostgreSQL previously had WAL/write instability during migration recovery.
- The schema is currently aligned and the app is healthy, but infrastructure reliability still needs separate follow-up.
- There is an unrelated existing production integration issue with Tochka token retrieval; it does not block owner-workspace.

## Recommended Next Steps

1. Stabilize production DB operations and backup discipline.
2. Add a configurable admin surface for permission policy.
3. Expand system settings beyond task labels/visibility.
4. Decide whether reporting should remain embedded or move into a dedicated reporting surface.
5. Do a line-by-line final acceptance review against the original specification.
