# Azure for Students deployment

This project is deployed on the existing Azure for Students Ubuntu VM rather than the original OCI target. The application architecture is unchanged.

## Runtime

- Ubuntu 24.04 LTS
- Node.js 20+
- PostgreSQL bound to `127.0.0.1:5432`
- application user `college-noticeboard`
- application root `/opt/college-noticeboard`
- data root `/srv/noticeboard`
- Nginx terminating TLS for `college-noticeboard.duckdns.org` on 443, with a
  Certbot-managed HTTP→HTTPS redirect for that host
- systemd application service, hourly maintenance timer, and daily database backup timer

### TLS state (verified 2026-09-26)

TLS **is** enabled in production. It was added by Certbot after this document was
first written, and the `nginx.conf` in this directory has now been brought in line
with the configuration that is actually installed, including the TLS virtual host
and `Strict-Transport-Security`, so a fresh install from this repository reproduces
what is running.

`/etc/nginx/sites-available/college-noticeboard` is rewritten by Certbot whenever a
certificate is issued or renewed. After any `certbot` run, re-check that file
against the copy in this directory; Certbot's edits are marked `# managed by Certbot`.

The remaining security headers (`X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`) are set by the application in
`next.config.mjs` rather than by Nginx, so they also apply when port 3000 is reached
directly on the loopback interface.

## First-time setup

1. Confirm `/srv/noticeboard` is the mounted data disk.
2. Copy the repository to `/opt/college-noticeboard`.
3. Run `npm ci` and `npm run build` as `college-noticeboard`.
4. Create `/etc/college-noticeboard.env` owned by `root:root` with mode `0600`; never commit it.
   `0600` is correct even though the service runs as `college-noticeboard`: systemd reads
   `EnvironmentFile=` as PID 1 and proxies the variables to the service, so the service user
   never needs to read the file. (An earlier version of this document asked for
   `root:college-noticeboard 0640` — looser than the deployed file and than what is required.)

5. Run `npm run db:init` and then create the first owner with `npm run admin:create`.
6. Install the service/timer units from this directory under `/etc/systemd/system/`.
7. Install `nginx.conf` as the active site configuration and reload Nginx.

The file corpus remains on `/srv/noticeboard`; the boot disk is not the authoritative file store.

## Network

Keep PostgreSQL private/localhost. Expose only the reverse proxy and SSH as required, with SSH key authentication and password authentication disabled.

## Ongoing operations

Three scheduled commands run on this VM. All are safe to run by hand; none of them
deletes live data.

| command | schedule | effect |
|---|---|---|
| `npm run maintenance` | hourly | second phase of deletion (moves quarantined objects), staging sweep, filesystem/DB reconciliation, corruption scan |
| `npm run backup:db` | daily 03:15 UTC | compressed PostgreSQL dump, verified with `pg_restore --list`, 14-day retention |
| `npm run verify:corpus` | on demand | read-only; every ACTIVE file row against the bytes on the volume |

`verify:corpus` must run as the storage owner, because the objects are not readable by other
accounts:

```bash
sudo -u college-noticeboard npm run verify:corpus
```

It is the check that makes the database a usable restore target for the existing corpus, since
the database already stores each object's size and SHA-256. On 2026-09-26 it verified all
47 900 ACTIVE objects / 28.2 GB with zero discrepancies.

The environment file is `0600 root:root`, so a one-off command that needs `DATABASE_URL` and
`NOTICEBOARD_STORAGE_ROOT` must either run through systemd or have the variables supplied from
a root context; the service user cannot read the file itself. `P10_CLOSEOUT.md` records how
this was handled during verification.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

```
npm ci  ->  npm test  ->  npx tsc --noEmit  ->  npm run lint  ->  npm run build
```

The workflow uses no secrets and no environment variables; the test suite is unit-level and
needs no database or storage volume. `verify:corpus` is deliberately not in CI because it
requires the mounted storage volume.
