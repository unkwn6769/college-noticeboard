# OCI Phase 1 deployment baseline

Target: one Oracle Cloud Always Free Ampere A1 Flex VM, 2 OCPU / 12 GB RAM, Ubuntu LTS.

## Block volume

Create/attach the 150 GB block volume and mount it at `/srv/noticeboard` before production use.
Required directories:

- `files/`
- `staging/`
- `quarantine/objects/`
- `quarantine/partials/`
- `tmp/`
- `backups/`

Do not put the primary file corpus on the boot volume.

## Bootstrap

Run `sudo ./infra/oci/bootstrap.sh` on the VM after the block volume is mounted.

## App deployment

Copy the repository to `/opt/college-noticeboard`, then:

```bash
sudo -u noticeboard npm ci
sudo -u noticeboard npm run build
sudo -u noticeboard npm run db:migrate
```

Install the systemd files from `systemd/`, enable `college-noticeboard.service` and the maintenance timer, and install the Nginx site from `nginx/`.

## Networking

Public: 80/tcp, 443/tcp, 22/tcp.
PostgreSQL remains private on 127.0.0.1 / internal networking; never expose 5432 publicly.
SSH must use keys and disable password authentication.
