#!/usr/bin/env python3
"""Reconcile PostHog insights + dashboards against insights.yml + dashboards.yml.

Two-phase reconcile:
  1. insights — create/patch each by name (matches via `name` field)
  2. dashboards — create/patch each by name, then link insights via the
     insight's `dashboards` array (full-replace; existing dashboard
     memberships preserved)

Auth: POSTHOG_API_KEY env var (Personal API Key with insight:read,
insight:write, dashboard:read, dashboard:write, query:read scopes).

Run via ./ops/posthog-dashboards/apply.sh which handles the venv.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    sys.exit("ERROR: PyYAML missing. Run via ops/posthog-dashboards/apply.sh.")


HERE = Path(__file__).resolve().parent
INSIGHTS_FILE = HERE / "insights.yml"
DASHBOARDS_FILE = HERE / "dashboards.yml"


def _request(method: str, url: str, token: str, body: dict | None = None) -> dict | list:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "rf-posthog-dashboards-apply/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        sys.exit(
            f"ERROR: {method} {url} -> {e.code} {e.reason}\n"
            f"Response body:\n{detail}"
        )


# ---------------------------------------------------------------- insights


def list_insights(host: str, project_id: int, token: str) -> list[dict]:
    out: list[dict] = []
    url = f"{host}/api/projects/{project_id}/insights/?limit=200"
    while url:
        page = _request("GET", url, token)
        assert isinstance(page, dict)
        out.extend(page.get("results", []))
        url = page.get("next")
    # Filter out soft-deleted
    return [i for i in out if not i.get("deleted")]


def _insight_query_payload(cfg: dict) -> dict:
    query: dict[str, Any] = {
        "kind": "DataVisualizationNode",
        "source": {
            "kind": "HogQLQuery",
            "query": cfg["query"].strip(),
        },
        "display": cfg.get("display", "ActionsTable"),
    }
    # Chart configuration for line/area/bar graphs that need axis mapping.
    if cfg.get("chart_x") or cfg.get("chart_y"):
        query["chartSettings"] = {
            "xAxis": {"column": cfg["chart_x"]},
            "yAxis": [{"column": col} for col in cfg.get("chart_y", [])],
        }
    return query


def _insight_payload(cfg: dict) -> dict:
    return {
        "name": cfg["name"],
        "description": cfg.get("description", ""),
        "query": _insight_query_payload(cfg),
    }


def create_insight(host: str, project_id: int, token: str, payload: dict) -> dict:
    url = f"{host}/api/projects/{project_id}/insights/"
    resp = _request("POST", url, token, payload)
    assert isinstance(resp, dict)
    return resp


def update_insight(
    host: str,
    project_id: int,
    token: str,
    insight_id: int,
    payload: dict,
    keep_dashboards: list[int],
) -> dict:
    # `dashboards` is full-replacement on update; preserve current memberships
    # so we don't accidentally remove an insight from dashboards managed
    # outside this script.
    payload_with_dashboards = {**payload, "dashboards": keep_dashboards}
    url = f"{host}/api/projects/{project_id}/insights/{insight_id}/"
    resp = _request("PATCH", url, token, payload_with_dashboards)
    assert isinstance(resp, dict)
    return resp


def _insight_drift(remote: dict, desired_payload: dict) -> list[str]:
    drift: list[str] = []
    if remote.get("name") != desired_payload["name"]:
        drift.append(f"name: {remote.get('name')!r} -> {desired_payload['name']!r}")
    if (remote.get("description") or "") != desired_payload.get("description", ""):
        drift.append("description differs")
    # Compare query as JSON for stability
    if json.dumps(remote.get("query") or {}, sort_keys=True) != json.dumps(
        desired_payload["query"], sort_keys=True
    ):
        drift.append("query differs")
    return drift


# ---------------------------------------------------------------- dashboards


def list_dashboards(host: str, project_id: int, token: str) -> list[dict]:
    out: list[dict] = []
    url = f"{host}/api/projects/{project_id}/dashboards/?limit=200"
    while url:
        page = _request("GET", url, token)
        assert isinstance(page, dict)
        out.extend(page.get("results", []))
        url = page.get("next")
    return [d for d in out if not d.get("deleted")]


def create_dashboard(host: str, project_id: int, token: str, payload: dict) -> dict:
    url = f"{host}/api/projects/{project_id}/dashboards/"
    resp = _request("POST", url, token, payload)
    assert isinstance(resp, dict)
    return resp


def update_dashboard(
    host: str, project_id: int, token: str, dashboard_id: int, payload: dict
) -> dict:
    url = f"{host}/api/projects/{project_id}/dashboards/{dashboard_id}/"
    resp = _request("PATCH", url, token, payload)
    assert isinstance(resp, dict)
    return resp


# ---------------------------------------------------------------- main


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Mutate PostHog state.")
    parser.add_argument("--insights-file", type=Path, default=INSIGHTS_FILE)
    parser.add_argument("--dashboards-file", type=Path, default=DASHBOARDS_FILE)
    args = parser.parse_args()

    insights_cfg = yaml.safe_load(args.insights_file.read_text())
    dashboards_cfg = yaml.safe_load(args.dashboards_file.read_text())

    project_id = insights_cfg["project_id"]
    host = insights_cfg.get("posthog_host", "https://us.posthog.com").rstrip("/")

    token = os.environ.get("POSTHOG_API_KEY")
    if not token:
        sys.exit("ERROR: POSTHOG_API_KEY env var missing.")

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== PostHog insights + dashboards reconcile ({mode}) ===")
    print(f"project_id={project_id} host={host}")
    print()

    # ---------- Phase 1: insights ----------
    print("--- Insights ---")
    remote_insights = list_insights(host, project_id, token)
    remote_insights_by_name = {i["name"]: i for i in remote_insights}
    # name -> id, after sync (so dashboards phase can resolve)
    insight_ids: dict[str, int] = {}

    for cfg in insights_cfg.get("insights", []):
        name = cfg["name"]
        payload = _insight_payload(cfg)
        remote = remote_insights_by_name.get(name)

        if remote is None:
            print(f"[CREATE] insight  {name}")
            if args.apply:
                created = create_insight(host, project_id, token, payload)
                insight_ids[name] = created["id"]
                print(f"         -> id={created['id']} short_id={created.get('short_id')}")
            else:
                insight_ids[name] = -1  # placeholder for dry-run reporting
        else:
            insight_ids[name] = remote["id"]
            drift = _insight_drift(remote, payload)
            if drift:
                print(f"[UPDATE] insight  {name}")
                for line in drift:
                    print(f"         {line}")
                if args.apply:
                    keep_dashboards = [d for d in (remote.get("dashboards") or [])]
                    update_insight(
                        host, project_id, token, remote["id"], payload, keep_dashboards
                    )
                    print("         -> updated")
            else:
                print(f"[OK]     insight  {name}")

    # ---------- Phase 2: dashboards ----------
    print()
    print("--- Dashboards ---")
    remote_dashboards = list_dashboards(host, project_id, token)
    remote_dashboards_by_name = {d["name"]: d for d in remote_dashboards}

    for cfg in dashboards_cfg.get("dashboards", []):
        name = cfg["name"]
        desired_meta = {
            "name": name,
            "description": cfg.get("description", ""),
        }
        remote = remote_dashboards_by_name.get(name)

        if remote is None:
            print(f"[CREATE] dashboard  {name}")
            if args.apply:
                created = create_dashboard(
                    host,
                    project_id,
                    token,
                    {**desired_meta, "delete_insights": False},
                )
                dashboard_id = created["id"]
                print(f"         -> id={dashboard_id}")
            else:
                dashboard_id = -1
        else:
            dashboard_id = remote["id"]
            drift: list[str] = []
            if (remote.get("description") or "") != desired_meta["description"]:
                drift.append("description differs")
            if drift:
                print(f"[UPDATE] dashboard  {name}")
                for line in drift:
                    print(f"         {line}")
                if args.apply:
                    update_dashboard(host, project_id, token, dashboard_id, desired_meta)
                    print("         -> updated")
            else:
                print(f"[OK]     dashboard  {name}")

        # ---------- Link insights to this dashboard ----------
        if args.apply and dashboard_id > 0:
            for insight_name in cfg.get("insights", []):
                insight_id = insight_ids.get(insight_name)
                if insight_id is None or insight_id < 0:
                    print(
                        f"         !! cannot link insight '{insight_name}' — not found in insights.yml or not yet created"
                    )
                    continue
                # Fetch current dashboards list for the insight, add ours if missing.
                url = f"{host}/api/projects/{project_id}/insights/{insight_id}/"
                detail = _request("GET", url, token)
                assert isinstance(detail, dict)
                current = list(detail.get("dashboards") or [])
                if dashboard_id not in current:
                    current.append(dashboard_id)
                    _request(
                        "PATCH",
                        url,
                        token,
                        {"dashboards": current},
                    )
                    print(f"         linked insight '{insight_name}' -> dashboard {dashboard_id}")

    print()
    if not args.apply:
        print("Dry-run complete. Re-run with --apply to make changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
