# Self-host

Run your own Remote Falcon instance from this monorepo. One script, ~5 minutes
on a 4 GB RAM machine.

For the full getting-started doc (prerequisites, sizing, SSL setup, FPP plugin
config, common issues), see [docs/SELF-HOST.md](../../docs/SELF-HOST.md).

## Quick start

```sh
cp .env.example .env
$EDITOR .env            # fill in WEB_URL + the three JWT_* secrets
./install.sh
```

`./install.sh` validates your `.env`, generates a self-signed cert for first
boot (replace with Let's Encrypt before going public), builds the 5 service
images, and brings up the stack. Subsequent updates:

```sh
git pull
./upgrade.sh
```

## What's here

```
ops/self-host/
  docker-compose.yaml   compose file targeting apps/<svc>/Dockerfile.dev
  .env.example          documented env var template — copy to .env
  install.sh            first-time bring-up with validation
  upgrade.sh            git pull + rebuild
  nginx/
    default.conf        reverse-proxy config (mirrors prod ingress routing)
    ssl/                drop fullchain.pem + privkey.pem here
```

## Why JVM-mode builds

The compose file builds with `apps/<svc>/Dockerfile.dev`, which produces
JVM-mode JARs instead of GraalVM native images. Same Java code, same
Quarkus/Spring runtime — only build cost differs:

| Mode | Build time | Build RAM | Runtime cold-start | Runtime RAM |
|------|-----------:|----------:|-------------------:|------------:|
| Native (`Dockerfile`) | 20-60 min | 12-16 GB | ~50 ms | ~80 MB/svc |
| JVM (`Dockerfile.dev`) | ~5 min | ~2 GB | ~3 s | ~250 MB/svc |

For SaaS prod we use native to squeeze the runtime. For self-host, JVM is the
right default — most hobbyist boxes can't compile native at all.

## Common operations

```sh
# logs
docker compose -f docker-compose.yaml logs -f
docker compose -f docker-compose.yaml logs -f control-panel

# restart one service
docker compose -f docker-compose.yaml restart viewer

# stop / start the whole stack (preserves data)
docker compose -f docker-compose.yaml down
docker compose -f docker-compose.yaml up -d

# nuke everything (DESTRUCTIVE — wipes the mongo volume)
docker compose -f docker-compose.yaml down -v
```

## Going to production

Before exposing the stack to the internet:

1. **Real TLS cert.** The self-signed cert install.sh generates is for
   first-boot smoke-testing only. Use Let's Encrypt (certbot) or your CA of
   choice. Drop `fullchain.pem` + `privkey.pem` into `nginx/ssl/` and
   `docker compose restart nginx`.
2. **Strong JWT secrets.** Generate with `openssl rand -base64 32`. Don't
   commit `.env` to git.
3. **Strong Mongo password.** The default `root/root` in `.env.example` is
   for local-machine testing only.
4. **Disable AUTO_VALIDATE_EMAIL** and configure SendGrid if you want
   real email verification. Otherwise leave it `true` so users can sign in
   without an email round-trip.

See [docs/SELF-HOST.md](../../docs/SELF-HOST.md) for the full checklist.
