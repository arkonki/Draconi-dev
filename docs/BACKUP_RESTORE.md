# Backup and restore runbook

The recovery set contains both durable parts of the application:

- a PostgreSQL custom-format dump (`database.dump`);
- uploaded files from the `storage_data` volume (`storage.tar.gz`);
- a metadata manifest (`manifest.json`);
- SHA-256 checksums for every payload and the manifest (`SHA256SUMS`).

The command-line workflow stores those four files in a directory. The administrator UI wraps the same files in a downloadable `dragonbane-backup-*.tar.gz` package and retains a copy in the Docker `backup_data` volume.

## Administrator Settings workflow

Open **Settings → Backup & Restore** while signed in as an administrator. The server enforces the administrator role independently of the menu visibility.

From this page an administrator can:

- create, validate, retain, and download a fresh recovery set;
- download a previously retained normal or pre-restore safety set;
- prepare a retained set for restore;
- upload and validate an external `.tar.gz` recovery set;
- restore a validated set after typing the exact database confirmation and entering the current administrator password.

Validation checks the outer archive paths and file types, SHA-256 payload checksums, manifest version, PostgreSQL restore catalog and critical tables, and the nested storage archive. A validated restore token expires after 15 minutes.

Backup and restore enter maintenance mode and drain requests that were already active. Restore validates the selected set again, creates and validates a `pre-restore-*` safety set, restores PostgreSQL in a single transaction, replaces uploaded files, and checks critical tables before reporting success. The initiating browser clears its local session and returns to sign-in after a successful restore.

Retained server sets are convenient rollback copies, but they remain on the same server. Use **Download** and copy important sets to an encrypted second machine or offline disk. `npm run docker:reset` deletes the `backup_data` volume along with the live database and uploaded files.

The default maximum uploaded recovery package is 1 GiB. Set `MAX_BACKUP_BYTES` in `.env` to a lower operational limit if appropriate; the reverse proxy also caps recovery uploads at 1 GiB.

For a disposable local environment, the automated end-to-end rehearsal exercises authorization, download, retained-set staging, corrupted-package rejection, safety backup creation, and a real restore:

```bash
RECOVERY_TEST_PASSWORD='<current-admin-password>' npm run test:recovery
```

This command intentionally restores the local application database and must not be used casually against production.

Backups default to `backups/<UTC timestamp>/`. That directory is ignored by Git because it contains private application data. Set `BACKUP_ROOT` to place new sets on another mounted disk:

```bash
BACKUP_ROOT=/srv/dragonbane-backups npm run backup
```

## Create a backup

Start the Docker stack, then run:

```bash
npm run backup
```

The command briefly stops the API so database rows and uploaded files come from the same write boundary. PostgreSQL and the web container remain running, but application API requests are unavailable for the duration of the snapshot. The API is restarted even if backup creation fails. A failed set remains in place and is explicitly labeled incomplete by the command output; do not use it for recovery.

Do not keep the only copy under the application directory or on the same physical disk as PostgreSQL. Copy completed sets to an encrypted second disk or another machine under your control. The scripts intentionally do not delete old sets automatically.

## Verify a backup without changing live data

Run this after every scheduled backup:

```bash
npm run backup:verify -- backups/20260717T100207Z
```

Verification checks every SHA-256 checksum, asks PostgreSQL to read the dump catalog, checks and extracts the storage archive, and restores the database into a temporary `dragonbane_verify_*` database. It checks critical tables, reports recovered user/file counts, and deletes the temporary database. The live application database is not modified.

To verify a package downloaded from administrator Settings with the CLI, extract its four files first:

```bash
mkdir -p backups/ui-download
tar -xzf dragonbane-backup-<timestamp>-<id>.tar.gz -C backups/ui-download
npm run backup:verify -- backups/ui-download
```

## Restore the local stack

First verify the chosen set. Then run:

```bash
npm run restore -- backups/20260717T100207Z
```

The command prints the exact target database and requires typing `RESTORE <database-name>`. It validates the set before making changes and automatically creates a timestamped `backups/pre-restore-*` safety set of the current database and files. It then stops API writes, replaces the application database and upload volume contents, restarts the API, and checks recovered user data.

For non-interactive disaster-recovery automation, `--yes` skips only the typed confirmation:

```bash
npm run restore -- backups/20260717T100207Z --yes
```

`--skip-safety-backup` is available only for a situation where the current data is already unusable and there is not enough disk space for a safety copy. It removes an important rollback layer and should not be part of the normal procedure.

If a restore fails after replacement begins, preserve the output and do not reset Docker volumes. The command reports the pre-restore set. Correct the underlying disk/container problem, verify that set, and restore it with the same command.

## Production operating policy

Before accepting production data:

1. Choose an explicit recovery-point objective (how much recent work may be lost) and schedule backups at least that often.
2. Store one local recovery set for fast restores and at least one encrypted copy on a different physical machine or offline disk.
3. Run `backup:verify` after every backup and alert when it fails or the most recent set is older than the recovery-point objective.
4. Retain enough daily, weekly, and monthly sets to cover accidental deletion that is discovered late. A reasonable starting point is 7 daily, 4 weekly, and 12 monthly sets, adjusted for available disk space.
5. Perform a supervised full recovery rehearsal after server setup and after material database/storage changes.

Backups contain credential hashes, sessions, private game data, and uploaded files. Protect them like the production database, restrict filesystem permissions, and encrypt any removable or transported copy.
