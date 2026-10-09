# Administration review and proposals

Reviewed 2026-10-09. Covers user management (rebuilt in this change) and every other administrator
feature: Game Data, Compendium, Backup & Restore, Maintenance and the Settings navigation.

## 1. Security findings (fixed in this change)

| # | Finding | Impact | Status |
|---|---------|--------|--------|
| 1 | **Any signed-in user could make themselves an administrator.** The generic data endpoint let a user update their own `users` row, and it accepted every column, including `role`. One request promoted a plain player to `admin`. Reproduced against the local stack. | Critical: full takeover of the site, including every account and all backups. | Fixed: only profile fields are writable through the generic endpoint. |
| 2 | Any signed-in user could read every account's **email, role, activity and status**, and probe which emails are registered by filtering on `email`. | Privacy leak of every member. | Fixed: other accounts expose display fields only; filtering or sorting on private columns is rejected. |
| 3 | A user could delete their **own** account (and cascade away all their characters) through the generic endpoint. | Accidental or malicious data loss. | Fixed: account creation and deletion only exist as administrator endpoints. |
| 4 | Test-suite cleanup relied on database cascade order and left data behind (security and realtime smoke tests). | Test hygiene. | Fixed. |

**Check your live data once after deploying.** Anyone could have used finding 1 before the fix:

```sql
SELECT email, username, role, created_at, updated_at FROM users WHERE role = 'admin' ORDER BY updated_at DESC;
```

Every administrator listed should be someone you recognise. If you want a clean slate afterwards, sign everyone out
from the new Users screen or by running `DELETE FROM app_sessions;`.

## 2. What was added

**Server** (`server/adminUsers.js`, `server/userAccess.js`, migration `0045_admin_audit_log.sql`)

- `GET /api/admin/users` with usage figures (characters, campaigns owned, sessions, last seen, has password).
- `PATCH /api/admin/users/:id` edit name, username, email, role, active.
- `POST /api/admin/users/:id/reset-password` generated or chosen password; ends the user's sessions.
- `POST /api/admin/users/:id/revoke-sessions` sign out everywhere.
- `GET /api/admin/users/:id/impact` and `DELETE /api/admin/users/:id` with typed-email confirmation.
- `GET /api/admin/audit` append-only activity log that survives the deletion of the account it describes.

Safeguards enforced on the server, not just in the UI:

- You cannot change your own role, deactivate yourself or delete yourself.
- The last active administrator can never be demoted, deactivated or deleted (checked under row locks, so two
  administrators cannot demote each other at the same moment).
- Deactivating, resetting a password or signing out revokes web sessions and OAuth tokens immediately.
- **Deleting a campaign owner requires a successor.** The database cascades `parties.created_by`, so a plain delete
  would erase the campaign for every other player. Campaigns, sessions, solo content, compendium entries and projector
  sessions created by the user are handed to the chosen successor, who becomes owner.
- Passwords are never written to the audit log.
- The bootstrap administrator (`ADMIN_EMAIL`) is now only created when the database has **no** active administrator.
  Before, it was recreated at every API start whenever its email was missing, which would have resurrected a deleted
  administrator with the password from the environment file.

**Interface** (Settings → Admin Panel → Users, Activity)

- Summary tiles (total, active, administrators, needs attention) that double as filters; search, role, status and sort.
- Cards on narrow screens, a table on wide ones; actions are labelled icon buttons.
- Edit dialog with role explanations and warnings for promotion, demotion and deactivation.
- Reset-password dialog: generate (recommended) or choose; the password is shown once with copy buttons.
- Delete dialog: shows what is removed, what is handed over, requires a successor when needed, offers
  "Deactivate instead", and requires typing the email.
- Activity tab listing who did what to which account.

## 3. Findings and proposals for the rest of administration

Ordered by value for effort.

### Quick wins

1. **Replace `window.confirm`** in Game Data and the Compendium manager with the same dialog pattern used for users.
   They are inconsistent, unstyled, and impossible to make accessible.
2. **Warn before deleting game data that is in use.** Deleting an item, spell or heroic ability does not check whether
   characters reference it. Show "used by N characters" before confirming.
3. **Show backup age and status** on the Backup & Restore screen and on an admin landing page. Today nothing tells an
   administrator that the last backup is three weeks old.
4. **Expose the performance endpoints that already exist.** `GET /api/admin/performance` and `/reset` have no UI at all.
   A "System health" panel (slow queries, request timings, pool use, database size, storage size, schema version) costs
   little and answers "why is the site slow".
5. **Create user: allow choosing Administrator** (today only player or DM; admins must be promoted afterwards) and
   offer a one-click "copy sign-in details" (already present) plus an optional forced password change on first sign-in.

### Medium

6. **One "Administration" area instead of three Settings entries.** Today an administrator sees Game Data, Backup &
   Restore and Admin Panel as separate Settings items, and the Admin Panel itself holds Users, Compendium and
   Maintenance. Proposed structure: **Overview** (attention items), **Users**, **Activity**, **Content** (Game Data +
   Compendium), **System** (Backups, Maintenance, Health). Give administrators a direct entry in the main navigation.
7. **Game Data usability:** pagination and sortable columns (large categories load fully), bulk select/delete,
   duplicate entry, unsaved-changes warning on the edit modal, and **CSV export** to match the existing import so data
   can round-trip and be reviewed in a spreadsheet.
8. **Extend the audit log to content.** Record who created, changed or deleted game data and compendium entries; show
   history on each entry and allow restoring a previous version.
9. **Backup management:** delete or prune old recovery sets, show size and age, record whether a set was verified, and
   document or schedule automatic backups from the UI (today this lives in server scripts).
10. **Users: session list and login history.** Show devices and last sign-in per user, plus recent failed sign-ins
    (the new rate limiter already counts them).

### Larger

11. **Invitations instead of temporary passwords.** Email is disabled, so administrators currently copy passwords to
    people. A one-time invitation or reset link (shown to the administrator, valid for a short time) removes passwords
    from chat messages. Needs a small token table and a "set your password" page.
12. **Self-service password reset** once mail or the invitation links exist; today only an administrator can reset.
13. **Two-factor authentication** for administrator accounts.
14. **Bulk user actions** (deactivate or export a selection) if the user base grows beyond a few dozen.

### Notes

- `users.account_status` duplicates `is_active`. It is now kept in sync (`active` or `suspended`); one of the two
  should eventually go.
- "Dungeon Master" is a site-wide role, while campaigns have their own owner, GM, player and observer roles. The role
  descriptions in the edit dialog explain the difference; the naming is still easy to confuse.
- Database design to remember: `parties.created_by` cascades, and five session and solo tables restrict deletion of
  their creator. Any future delete feature must go through the successor step used here.
- The 11 end-to-end scenarios for this feature live in `scripts/user-admin-smoke.mjs`
  (`npm run test:user-admin`).
