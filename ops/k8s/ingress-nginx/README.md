# ingress-nginx (prod)

The one ingress controller in front of every service. Installed by hand with helm on 2026-04-24 (release `ingress-nginx`, namespace `ingress-nginx`, chart `ingress-nginx-4.15.1` / controller v1.15.1, server-side apply) with **no values**, so until this directory existed it ran as 1 replica with no PDB: a hard single point of failure (Appendix D P0-5 of the 2026 Season Capacity Plan).

| File | Role |
|---|---|
| [`values.yaml`](values.yaml) | The complete user-supplied values: 2 replicas, PDB `minAvailable: 1`, required pod anti-affinity on hostname, and two controller ConfigMap keys (`use-http2: "false"`, `ssl-protocols: "TLSv1.2"`). Everything else is the chart default. |
| [`apply.sh`](apply.sh) | Drift check, then a read-only preview (`kubectl diff --server-side` + `helm upgrade --dry-run=server`). `./apply.sh apply` runs the real upgrade after a typed confirmation. Both take an optional season profile name (default: the `active` line of [`ops/season/profile.conf`](../../season/profile.conf)). |

## Season profiles

The controller's replica count is a season knob. `apply.sh` reads the `ingress-nginx` row of the chosen profile and layers it over `values.yaml`:

- MIN == MAX (off-season: 2): `controller.replicaCount`, no HPA. Identical render to `values.yaml` alone.
- MIN < MAX (season: 2-6, peak: 3-6): `replicaCount` MIN plus the chart's HPA, CPU target 70%, memory target off (the chart's 50%-of-90Mi default would pin it at max).

```bash
./apply.sh diff season         # preview (default profile = the active line)
./apply.sh apply season        # after R1 (turns the HPA on, 2-6)
./apply.sh apply peak          # Mon Dec 14 morning (3-6)
./apply.sh apply season        # after peak (back to 2-6)
./apply.sh apply off-season    # Jan 5 (HPA off, 2 fixed)
```

Switching the HPA on: helm stops rendering `spec.replicas`, and server-side apply would reset a field dropped by its only owner to 1 pod. `apply.sh apply` first co-owns the current count under field manager `season-handoff`, so the count survives until the HPA manages it. The preview still shows `spec.replicas` removed; that is expected. Switching back off runs the upgrade with `--force-conflicts` so helm reclaims `spec.replicas` from the HPA.

Anti-affinity is required per hostname, so N controllers need N nodes, plus one more for the rollout's surge pod. At the 6-replica ceiling (season and peak) that is up to 7 nodes: keep the node autoscaler max at 8.

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
- **The controller ConfigMap sets only `use-http2: "false"` and `ssl-protocols: "TLSv1.2"`.** Both are a stopgap for the Nov 2026 nginx CVEs (CVE-2026-123007 and CVE-2026-123633 need HTTP/2; CVE-2026-118899 needs TLS 1.3). The bundled nginx is 1.27.1, the fix is 1.30.7+, and ingress-nginx is retired upstream, so no patched v1.15.x release will ship. Clients still get HTTP/2, HTTP/3 and TLS 1.3 from Cloudflare; only the Cloudflare-to-origin hop changes. Remove both keys when the controller is replaced. Applied as helm revision 4 on 2026-11-20. The keys are a hot reload, not a rollout.
- **Everything else in the ConfigMap is a default**, so nginx runs on (`proxy-read-timeout 60s`, `proxy-next-upstream "error timeout"`, 3 tries). Per-service overrides live as annotations on each app's Ingress in `apps/<svc>/k8s/manifest.yml` (plugins-api: no retry on timeout, 12s read; viewer 15s; control-panel 20s).
- **Chart version is pinned.** `apply.sh` refuses to run if the deployed chart isn't `4.15.1`. Bumping the chart is its own change: update `VERSION`, read the chart changelog, preview, apply.
- **Drift check.** `apply.sh` aborts if the live release's values are anything other than empty (the original install) or exactly `values.yaml`. If it trips, someone changed the release by hand: fold their change into `values.yaml` first.
