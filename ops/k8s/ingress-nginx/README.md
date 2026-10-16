# ingress-nginx (prod)

The one ingress controller in front of every service. Installed by hand with helm on 2026-04-24 (release `ingress-nginx`, namespace `ingress-nginx`, chart `ingress-nginx-4.15.1` / controller v1.15.1, server-side apply) with **no values**, so until this directory existed it ran as 1 replica with no PDB: a hard single point of failure (Appendix D P0-5 of the 2026 Season Capacity Plan).

| File | Role |
|---|---|
| [`values.yaml`](values.yaml) | The complete user-supplied values: 2 replicas, PDB `minAvailable: 1`, required pod anti-affinity on hostname. Everything else is the chart default. |
| [`apply.sh`](apply.sh) | Drift check, then a read-only preview (`kubectl diff --server-side` + `helm upgrade --dry-run=server`). `./apply.sh apply` runs the real upgrade after a typed confirmation. |

Not deployed by CI. No workflow watches this path.

## Applying

Daylight only, never 5pm-2am ET. It's the only ingress.

```bash
cd ops/k8s/ingress-nginx
kubectl config use-context do-nyc3-remote-falcon
./apply.sh            # preview; expect only: Deployment replicas 1->2 + affinity, new PDB
./apply.sh apply      # helm upgrade --reset-values -f values.yaml --version 4.15.1 --wait
```

What happens: helm re-runs the admission-webhook cert hook jobs, the Deployment rolls (surge 1, unavailable 0 at 2 replicas) so the existing pod keeps serving until a new one is ready, and the anti-affinity keeps the two new pods on different nodes. The LoadBalancer Service is unchanged.

Verify afterwards:

```bash
kubectl -n ingress-nginx get pods -o wide -l app.kubernetes.io/component=controller   # 2 pods, 2 nodes
kubectl -n ingress-nginx get pdb                                                       # ALLOWED DISRUPTIONS 1
curl -sS -o /dev/null -w '%{http_code}\n' https://remotefalcon.com/                     # 200
```

Rollback: `helm rollback ingress-nginx 1 -n ingress-nginx --wait`.

## Things to know

- **The DO LoadBalancer annotations aren't in `values.yaml` on purpose.** `service.beta.kubernetes.io/do-loadbalancer-type: REGIONAL_NETWORK` and `kubernetes.digitalocean.com/load-balancer-id` are owned by the DigitalOcean cloud controller manager (see the Service's `managedFields`). helm's server-side apply doesn't touch fields it doesn't own. Don't add them here unless you mean to take ownership.
- **The controller ConfigMap is empty**, so nginx runs on defaults (`proxy-read-timeout 60s`, `proxy-next-upstream "error timeout"`, 3 tries). Per-service overrides live as annotations on each app's Ingress in `apps/<svc>/k8s/manifest.yml` (plugins-api: no retry on timeout, 12s read; viewer 15s; control-panel 20s).
- **Chart version is pinned.** `apply.sh` refuses to run if the deployed chart isn't `4.15.1`. Bumping the chart is its own change: update `VERSION`, read the chart changelog, preview, apply.
- **Drift check.** `apply.sh` aborts if the live release's values are anything other than empty (the original install) or exactly `values.yaml`. If it trips, someone changed the release by hand: fold their change into `values.yaml` first.
