# Self-hosting Remote Falcon

Run your own Remote Falcon instance — same control panel, same viewer page,
same FPP plugin integration as the SaaS at `remotefalcon.com`, but on
hardware you own. This doc is the canonical reference for self-hosters.

If you just want to get going, jump to [Quick start](#quick-start). Most
self-hosters get a working stack in about 30 minutes (5 min build, 20 min
DNS + cert setup).

---

## What you'll run

Five services in Docker, all built from this monorepo:

| Service | What it does | Memory |
|---|---|---:|
| `control-panel` | Spring Boot — owner-facing GraphQL: settings, sequences, viewer pages | ~250 MB |
| `viewer` | Quarkus — public-facing GraphQL: viewer page reads, requests, votes | ~250 MB |
| `plugins-api` | Quarkus — FPP plugin heartbeats and sequence sync | ~250 MB |
| `ui` | React + Vite static bundle served by `serve` | ~80 MB |
| `mongo` | MongoDB 7, with a Docker named volume for data | ~500 MB |
| `nginx` | TLS termination + reverse proxy | ~30 MB |

Plus the host OS overhead and Docker. **Minimum 2 vCPU / 4 GB RAM** is enough
for a single show with a few hundred concurrent viewers. **8 GB / 4 vCPU** is
comfortable.

You will NOT need (these are SaaS-only or optional):
- `gateway`, `external-api`, `mongo-backup`, `account-archive`
- SendGrid (unless you want real email verification)
- Google Maps key (unless you want the "shows map" feature)
- PostHog / Google Analytics (telemetry — leave blank to disable)
- S3 (unless you want in-product image upload)

---

## Quick start

You need:
- Docker + Docker Compose (Docker Desktop on Mac/Windows, or Docker Engine on Linux)
- A domain name pointing at your machine
- ~5 minutes of build time

### 1. Clone the monorepo

```sh
git clone https://github.com/Remote-Falcon/remote-falcon-platform.git
cd remote-falcon-platform/ops/self-host
```

### 2. Configure

```sh
cp .env.example .env
$EDITOR .env
```

At minimum fill in `WEB_URL` and generate two JWT secrets:

```sh
echo "JWT_USER=$(openssl rand -base64 32)"
echo "JWT_VIEWER=$(openssl rand -base64 32)"
```

Paste those into `.env`. Every other field has a sane default for local-testing.

`JWT_USER` signs owner sign-in tokens issued by the control-panel.
`JWT_VIEWER` is baked into the UI bundle at build time; it's required even
though the viewer service doesn't currently verify it (viewer auth is
host-header based via showSubdomain). Set both anyway — easier to leave
slots wired than to retrofit later.

### 3. Boot the stack

```sh
./install.sh
```

The script will:
1. Validate Docker is running and `.env` is filled in.
2. Generate a self-signed cert in `nginx/ssl/` if you haven't supplied one
   (good enough for first-boot testing on `localhost`; replace before going public).
3. Build the 5 service images (first run ~5 min on 4 GB RAM).
4. Bring the stack up and report health.

Browse to `$WEB_URL` and create your account.

### 4. Replace the self-signed cert

Before exposing to the internet, swap in a real TLS cert. Easiest path is
Let's Encrypt:

```sh
# install certbot once
sudo apt install certbot

# get a cert (stop nginx first so port 80 is free for the challenge)
docker compose -f ops/self-host/docker-compose.yaml stop nginx
sudo certbot certonly --standalone -d yourdomain.com

# copy the cert into the nginx ssl dir
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ops/self-host/nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   ops/self-host/nginx/ssl/

# restart
docker compose -f ops/self-host/docker-compose.yaml up -d nginx
```

Set up a cron to renew the cert every 60 days (`certbot renew` + `docker compose restart nginx`).

---

## Maintaining

### Upgrade to the latest monorepo

```sh
cd ops/self-host
./upgrade.sh
```

This `git pull`s the monorepo and rebuilds the stack. Mongo data is preserved
in the Docker named volume across rebuilds.

### Pinning to a specific version

If you'd rather not chase `main`, check out a tag before running the install
or upgrade script:

```sh
git checkout v0.2.0
./install.sh   # or ./upgrade.sh
```

### Backups

The Mongo data lives in a Docker named volume called `self-host_mongo-data`.
A simple backup:

```sh
docker run --rm \
  -v self-host_mongo-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/mongo-$(date +%F).tar.gz /data
```

Restore: reverse the tar with `tar xzf` into the volume after a `docker compose down`.

---

## Cloud-provider notes

The deployment is just Docker + Compose + nginx + TLS, so anywhere you can
get a Linux host with Docker installed will work. Three knobs change
depending on which cloud you pick:

### 1. `CLIENT_HEADER`

Which header carries the real viewer IP into the app. Set in `.env`.

| Sitting behind… | `CLIENT_HEADER` |
|---|---|
| Cloudflare proxy | `CF-Connecting-IP` |
| AWS Application Load Balancer | `X-Forwarded-For` |
| GCP Cloud Load Balancer | `X-Forwarded-For` |
| Raw nginx (this stack only, no extra proxy) | `X-Forwarded-For` |

Get this wrong and every viewer looks like they came from `127.0.0.1`, which
breaks per-viewer rate limits and the "viewers right now" tile.

### 2. S3-compatible object storage (optional)

Only needed if you want in-product image upload. The app speaks the S3 API,
so any S3-compatible storage works:

| Provider | `S3_ENDPOINT` |
|---|---|
| DigitalOcean Spaces | `https://<region>.digitaloceanspaces.com` |
| AWS S3 | leave blank (uses the AWS SDK default) |
| GCP Cloud Storage | `https://storage.googleapis.com` (S3 interop on) |
| MinIO (self-hosted) | `http://minio:9000` or your URL |

Leave all three S3 vars blank to disable image upload entirely.

### 3. Mongo backups

The `docker run + tar` example above works on any host. The *cloud-native*
backup is a block-storage snapshot — much faster and atomic. Take a
snapshot of whatever disk backs the Docker volume:

- **DigitalOcean:** Volume snapshots (`doctl compute volume-action snapshot`)
- **AWS:** EBS snapshots (`aws ec2 create-snapshot`)
- **GCP:** Persistent Disk snapshots (`gcloud compute disks snapshot`)

For any provider, schedule it nightly via cron + the provider's CLI. The
block-storage snapshot captures the entire Docker volume including any
in-flight writes (Mongo's WAL handles a crash-consistent restore on
startup).

---

## Wiring up the FPP plugin

Your FPP controller runs the Remote Falcon FPP plugin to report heartbeats
and sync sequences. The plugin defaults to the SaaS at `remotefalcon.com` —
self-hosters must redirect it to their own backend.

In the FPP plugin's web UI, change the **Plugins API URL** field from
`https://remotefalcon.com/remote-falcon-plugins-api` to:

```
https://yourdomain.com/remote-falcon-plugins-api
```

Also update your show token to one issued by your self-hosted control-panel
(it's in `Settings` → `Show Info` after you sign up).

If you installed the plugin via `fpp_install.sh`, you'll also need to update
the Apache CSP allowlist on the FPP to include your domain. See the plugin
repo's README for the one-time edit.

---

## Common issues

**Stack builds but the UI shows a blank page.**
Open browser DevTools → Network → look for the failed call. Most common
cause: `WEB_URL` in `.env` doesn't match the URL you're browsing to (the UI
is build-time baked with `WEB_URL` — changing it requires a `./upgrade.sh`).

**Sign-in returns "UNEXPECTED ERROR".**
Check `docker compose logs control-panel`. Almost always a Mongo connection
issue — make sure the `mongo` container is healthy and the `MONGO_USERNAME` /
`MONGO_PASSWORD` in `.env` match what Mongo was initialized with.
If you changed them after the first boot, drop the volume:
`docker compose down -v` (this DELETES your show data — only do it before you
have a real show set up).

**Templates page shows blank previews.**
The control-panel fetches starter HTML templates from GitHub
(`https://raw.githubusercontent.com/Remote-Falcon/remote-falcon-page-templates`)
at runtime. If your host can't reach GitHub, templates appear empty. Either
allow egress to that URL or skip the templates and hand-write your viewer page.

**Builds take forever / OOM.**
You're probably building the native `Dockerfile` instead of the JVM-mode
`Dockerfile.dev`. Make sure you're using the compose file in
`ops/self-host/` and not the one in `_archive/` or `developer-files/`.

**Heartbeat tile says "Never connected" but my FPP is running.**
Plugin is hitting the SaaS, not your self-host. See
[Wiring up the FPP plugin](#wiring-up-the-fpp-plugin).

---

## Resources

| Doc | Purpose |
|---|---|
| [ops/self-host/README.md](../ops/self-host/README.md) | Compose file structure, common ops |
| [ops/self-host/.env.example](../ops/self-host/.env.example) | All env vars with inline notes |
| [docs/SERVICES.md](SERVICES.md) | Full service catalog (for understanding what each container does) |

For questions, file an issue in the public issue tracker at
[`github.com/Remote-Falcon/remote-falcon-issue-tracker`](https://github.com/Remote-Falcon/remote-falcon-issue-tracker)
or hop into the Discord (link in the control-panel's Help menu).
