# Azure for Students deployment

This project is deployed on the existing Azure for Students Ubuntu VM rather than the original OCI target. The application architecture is unchanged.

## Runtime

- Ubuntu 24.04 LTS
- Node.js 20+
- PostgreSQL bound to `127.0.0.1:5432`
- application user `college-noticeboard`
- application root `/opt/college-noticeboard`
- data root `/srv/noticeboard`
- Nginx on port 80 (add TLS/443 before public production use)
- systemd application service, hourly maintenance timer, and daily database backup timer

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
