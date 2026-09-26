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
4. Create `/etc/college-noticeboard.env` owned by `root:college-noticeboard` with mode `0640`; never commit it.
5. Run `npm run db:init` and then create the first owner with `npm run admin:create`.
6. Install the service/timer units from this directory under `/etc/systemd/system/`.
7. Install `nginx.conf` as the active site configuration and reload Nginx.

The file corpus remains on `/srv/noticeboard`; the boot disk is not the authoritative file store.

## Network

Keep PostgreSQL private/localhost. Expose only the reverse proxy and SSH as required, with SSH key authentication and password authentication disabled.
