"""
mlops/tasks/worker_restart.py
==============================
Centralized utility for programmatically restarting inference worker containers
via the Docker socket API.

Called by both pipelines after a successful deploy:
  • YOLO:  model_deploy.validate_and_deploy()   → restart detectors
  • OCR:   ocr_finetune.celery_tasks.run_ocr_finetune() → restart OCR readers

Why Docker socket instead of the sentinel-file SIGHUP?
  ─────────────────────────────────────────────────────
  The sentinel watcher in worker/start.sh sends SIGHUP to the local Celery
  process and relies on Docker's restart policy to bring it back.  This has
  two weaknesses:

  1. SIGHUP with --pool=solo does not guarantee a full module reload; Python's
     import cache means the old OCR/detector objects may survive in memory.
  2. The polling interval is 30 s — the new model takes up to 30 s to become
     active across all replicas.

  The Docker socket approach triggers an immediate, clean container restart for
  every replica concurrently.  Docker re-runs the full start.sh sequence, which:
    a) calls ensure_engine.py (rebuilds YOLO TRT engine if best.pt changed)
    b) preloads PlateDetector() and PlateOCR() — picks up the new files
    c) starts a fresh Celery process

  The sentinel file is still touched (for monitoring / backward-compat) but the
  Docker restart is the primary mechanism.

Security note:
  Mounting /var/run/docker.sock gives the trainer container full Docker control.
  Restrict this to trainer-worker only (never the inference workers) and ensure
  the host Docker daemon is protected with appropriate socket permissions.

Environment variables:
  DOCKER_WORKER_SERVICE   — Compose service name to restart (default: worker-gpu-1)
  COMPOSE_PROJECT_NAME    — Compose project name for scoped filtering
                            (default: alpr_system_v2).  Docker Compose sets
                            com.docker.compose.project on every container label.
  WORKER_RESTART_TIMEOUT  — Seconds to wait for graceful stop before SIGKILL
                            (default: 30).
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

log = logging.getLogger(__name__)

_WORKER_SERVICE   = os.getenv("DOCKER_WORKER_SERVICE",   "worker-gpu-1")
_COMPOSE_PROJECT  = os.getenv("COMPOSE_PROJECT_NAME",    "alpr_system_v2")
_RESTART_TIMEOUT  = int(os.getenv("WORKER_RESTART_TIMEOUT", "30"))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def restart_inference_workers(
    service: str = _WORKER_SERVICE,
    project: str = _COMPOSE_PROJECT,
    stop_timeout: int = _RESTART_TIMEOUT,
    stagger_seconds: float = 3.0,
) -> dict[str, Any]:
    """Restart all running containers for the given Compose service.

    Parameters
    ----------
    service:
        Value of the ``com.docker.compose.service`` label on target containers.
    project:
        Value of the ``com.docker.compose.project`` label — prevents
        accidentally restarting containers from a different Compose stack on
        the same host.  Set COMPOSE_PROJECT_NAME in the trainer-worker env to
        match the host's Compose project name (= directory name by default).
    stop_timeout:
        Seconds Celery is given to finish in-flight tasks before SIGKILL.
        Default 30 s is generous enough for normal ALPR tasks (~1 s each).
    stagger_seconds:
        Seconds to wait between successive container restarts so the system
        never has zero running workers simultaneously.

    Returns
    -------
    dict with keys: ok, restarted (list of names), count, errors.
    """
    try:
        import docker  # type: ignore  — python-docker SDK
    except ImportError:
        log.error(
            "[restart] python-docker SDK not installed.  "
            "Add 'docker>=6.1.0' to mlops/requirements.txt."
        )
        return {"ok": False, "error": "docker_sdk_missing", "restarted": [], "count": 0}

    # ── Connect to Docker socket ──────────────────────────────────────────────
    try:
        client = docker.from_env()
        client.ping()  # fast check — raises if socket not mounted
    except Exception as exc:
        log.error(
            "[restart] Cannot reach Docker socket: %s  "
            "(Is /var/run/docker.sock mounted in trainer-worker?)",
            exc,
        )
        return {"ok": False, "error": f"docker_connect: {exc}", "restarted": [], "count": 0}

    # ── Discover target containers ────────────────────────────────────────────
    label_filters = [
        f"com.docker.compose.service={service}",
    ]
    if project:
        label_filters.append(f"com.docker.compose.project={project}")

    try:
        containers = client.containers.list(filters={"label": label_filters})
    except Exception as exc:
        log.error("[restart] Failed to list containers: %s", exc)
        return {"ok": False, "error": f"list_failed: {exc}", "restarted": [], "count": 0}

    if not containers:
        log.warning(
            "[restart] No running containers found for service=%s project=%s.  "
            "Check that COMPOSE_PROJECT_NAME matches the Docker Compose project "
            "on the host (default = parent directory name).",
            service, project,
        )
        return {"ok": False, "error": "no_containers_found", "restarted": [], "count": 0}

    log.info(
        "[restart] Found %d container(s) to restart for service=%s",
        len(containers), service,
    )

    # ── Rolling restart ───────────────────────────────────────────────────────
    # Restart containers one at a time with a small stagger gap.
    # With the default concurrency=8 per worker, the remaining replicas handle
    # the load while each one restarts (~20-30 s per cycle).
    restarted: list[str] = []
    errors: list[str] = []

    for idx, container in enumerate(containers):
        name = container.name
        short_id = container.short_id
        try:
            log.info(
                "[restart] %d/%d Restarting %s (%s) — stop_timeout=%ds ...",
                idx + 1, len(containers), name, short_id, stop_timeout,
            )
            container.restart(timeout=stop_timeout)
            restarted.append(name)
            log.info("[restart] ✅ %s restarted successfully", name)

            # Stagger: let the previous container start initialising (preload
            # models, build TRT engine) before the next restart.
            if idx < len(containers) - 1:
                log.info(
                    "[restart] Waiting %.0fs before next restart...", stagger_seconds
                )
                time.sleep(stagger_seconds)

        except Exception as exc:
            log.error("[restart] ❌ Failed to restart %s: %s", name, exc)
            errors.append(f"{name}: {exc}")

    ok = len(restarted) > 0 and not errors
    log.info(
        "[restart] Done — %d restarted, %d error(s).  Workers will preload new model on startup.",
        len(restarted), len(errors),
    )
    return {
        "ok": ok,
        "restarted": restarted,
        "count": len(restarted),
        "errors": errors,
    }
