#!/usr/bin/env python3
import os
import re
import subprocess
from pathlib import Path

# ---------------------------------------------------------------------------
# Python TensorRT engine builder
# Preferred over trtexec subprocess because the Python TRT bindings share
# the same CUDA context as PyTorch — so they work even in CUDA minor-version
# compatibility mode where the trtexec C++ binary fails to init CUDA.
# ---------------------------------------------------------------------------

def _build_engine_python(
    onnx_path: Path,
    engine_path: Path,
    fp16: bool,
    workspace_mb: int,
) -> None:
    """Build a TensorRT engine from an ONNX file using the Python TRT API.

    Supports TensorRT 8, 9 and 10.x.  FP16 is enabled when *fp16* is True and
    the GPU supports it (TRT will silently fall back to FP32 if not).

    Raises RuntimeError on any build failure.
    """
    import tensorrt as trt  # type: ignore

    TRT_LOGGER = trt.Logger(trt.Logger.WARNING)

    builder = trt.Builder(TRT_LOGGER)

    # EXPLICIT_BATCH is always on in TRT 10; keep the flag for TRT 8/9 compat.
    flags = 0
    try:
        flags = 1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
    except AttributeError:
        pass  # TRT 10+ no longer requires the flag
    network = builder.create_network(flags)

    parser = trt.OnnxParser(network, TRT_LOGGER)
    with open(onnx_path, "rb") as f:
        raw = f.read()
    if not parser.parse(raw):
        msgs = [str(parser.get_error(i)) for i in range(parser.num_errors)]
        raise RuntimeError(f"ONNX parse failed:\n" + "\n".join(msgs))

    config = builder.create_builder_config()

    # Workspace: TRT 10+ uses set_memory_pool_limit; older uses max_workspace_size
    workspace_bytes = workspace_mb * 1024 * 1024
    if hasattr(config, "set_memory_pool_limit") and hasattr(trt, "MemoryPoolType"):
        config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, workspace_bytes)
    else:
        config.max_workspace_size = workspace_bytes  # type: ignore[attr-defined]

    if fp16:
        if builder.platform_has_fast_fp16:
            config.set_flag(trt.BuilderFlag.FP16)
            print("[ensure_engine] FP16 enabled")
        else:
            print("[ensure_engine] WARNING: GPU does not support fast FP16 — building FP32")

    print(f"[ensure_engine] Building TensorRT engine (Python API) ...")
    serialized = builder.build_serialized_network(network, config)
    if serialized is None:
        raise RuntimeError("TensorRT engine build failed: build_serialized_network returned None")

    engine_path.parent.mkdir(parents=True, exist_ok=True)
    engine_path.write_bytes(bytes(serialized))
    print(f"[ensure_engine] Engine written: {engine_path} ({engine_path.stat().st_size // 1024} KiB)")

def sh(cmd: list[str]) -> str:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
    return p.stdout.strip()

def has_nvidia_smi() -> bool:
    try:
        out = sh(["bash", "-lc", "command -v nvidia-smi"])
        return bool(out)
    except Exception:
        return False

def gpu_compute_cap() -> str:
    # returns like "8.6"
    out = sh(["nvidia-smi", "--query-gpu=compute_cap", "--format=csv,noheader"])
    line = out.splitlines()[0].strip()
    return line

def gpu_name() -> str:
    out = sh(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"])
    return out.splitlines()[0].strip()

def tensorrt_version() -> str:
    try:
        import tensorrt as trt  # type: ignore
        v = getattr(trt, "__version__", "unknown")
        # keep major.minor (e.g. 10.15)
        m = re.match(r"^(\d+\.\d+)", str(v))
        return m.group(1) if m else str(v)
    except Exception:
        return "unknown"

def ensure_onnx(pt_path: Path, onnx_path: Path, imgsz: int) -> None:
    """Export best.pt → best.onnx if the ONNX is missing or stale.

    Staleness is detected by comparing file modification times: if best.pt is
    newer than best.onnx the ONNX was built from an older model and must be
    regenerated.  This is the safety-net path; the primary invalidation happens
    in mlops/tasks/model_deploy.py which actively deletes best.onnx on deploy.
    """
    if onnx_path.exists():
        if pt_path.exists():
            pt_mtime   = pt_path.stat().st_mtime
            onnx_mtime = onnx_path.stat().st_mtime
            if pt_mtime > onnx_mtime:
                print(
                    f"[ensure_engine] best.pt is newer than best.onnx "
                    f"(Δ={pt_mtime - onnx_mtime:.1f}s) — re-exporting ONNX ..."
                )
                onnx_path.unlink()
                # fall through to export below
            else:
                return  # ONNX is up-to-date
        else:
            return  # no .pt to compare against; keep existing onnx

    if not pt_path.exists():
        raise RuntimeError(f"Missing {pt_path} and {onnx_path}. Provide best.onnx or best.pt.")

    print(f"[ensure_engine] Exporting ONNX from {pt_path} -> {onnx_path}")
    # Use ultralytics python API.
    # NOTE: torch 2.5+ requires the 'onnxscript' package at runtime.
    # If it is missing the import inside torch/onnx/_internal/exporter/_core.py
    # raises ModuleNotFoundError before any export code runs.
    # Fix: ensure onnxscript>=0.1.0 is listed in requirements.txt.
    try:
        from ultralytics import YOLO  # type: ignore
        model = YOLO(str(pt_path), task="detect")
        # opset 18: PyTorch 2.5+ exports at opset 18 internally.  Requesting
        # opset 12 triggers a version-downgrade pass that fails for modern ops
        # like Resize (opset 18 → 12 has no adapter).  TensorRT 10.x supports
        # opset up to 20, so opset 18 is perfectly fine.
        model.export(format="onnx", imgsz=imgsz, opset=18, simplify=True)
    except Exception as exc:
        # Clean up any partial/empty file that ultralytics or torch may have
        # created before the error so the mtime guard doesn't treat a corrupt
        # file as a valid ONNX on the next run.
        for candidate in (onnx_path, pt_path.with_suffix(".onnx")):
            if candidate.exists():
                try:
                    candidate.unlink()
                    print(f"[ensure_engine] Removed partial ONNX after failed export: {candidate}")
                except OSError:
                    pass
        raise RuntimeError(f"ONNX export failed: {exc}") from exc

    # ultralytics exports beside pt by default; locate generated onnx
    exported = pt_path.with_suffix(".onnx")
    if exported.exists() and exported != onnx_path:
        exported.replace(onnx_path)
    if not onnx_path.exists():
        raise RuntimeError("ONNX export failed (best.onnx not found after export).")

def try_load_engine(engine_path: Path) -> bool:
    # Quick compatibility check: try deserialize engine
    try:
        import tensorrt as trt  # type: ignore
        logger = trt.Logger(trt.Logger.ERROR)
        runtime = trt.Runtime(logger)
        with open(engine_path, "rb") as f:
            data = f.read()
        eng = runtime.deserialize_cuda_engine(data)
        return eng is not None
    except Exception:
        return False

def build_engine(
    onnx_path: Path,
    engine_path: Path,
    fp16: bool,
    workspace: int,
    workspace_mode: str,
) -> None:
    """Build a TensorRT engine.

    Strategy:
      1. Try the Python TensorRT API (_build_engine_python).
         This is preferred because it shares the Python CUDA context and works
         in CUDA minor-version compatibility mode where the trtexec C++ binary
         often fails with "no CUDA-capable device is detected".
      2. Fall back to trtexec subprocess if the Python API is unavailable or
         raises an unexpected error (e.g. old TRT version without Python bindings).
    """
    # --- Attempt 1: Python TRT API ---
    try:
        _build_engine_python(onnx_path, engine_path, fp16=fp16, workspace_mb=workspace)
        if engine_path.exists():
            return  # success
        raise RuntimeError("Python TRT build returned without error but engine file missing.")
    except ImportError:
        print("[ensure_engine] tensorrt Python package not importable — falling back to trtexec")
    except Exception as py_exc:
        print(f"[ensure_engine] Python TRT build failed: {py_exc}  — falling back to trtexec")
        # Clean up any partial engine file before trying trtexec
        if engine_path.exists():
            try:
                engine_path.unlink()
            except OSError:
                pass

    # --- Attempt 2: trtexec subprocess ---
    engine_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "trtexec",
        f"--onnx={onnx_path}",
        f"--saveEngine={engine_path}",
    ]
    if workspace_mode == "mempool":
        # TensorRT v10+ uses memPoolSize for workspace memory in MiB.
        cmd.append(f"--memPoolSize=workspace:{workspace}M")
    else:
        cmd.append(f"--workspace={workspace}")
    if fp16:
        cmd.append("--fp16")

    print("[ensure_engine] Building engine via trtexec (fallback):")
    print("  " + " ".join(cmd))
    out = sh(cmd)
    print(out)
    if not engine_path.exists():
        raise RuntimeError("Engine build failed: engine file not created.")

def main():
    models_dir = Path(os.getenv("MODELS_DIR", "/models"))
    pt_path = Path(os.getenv("PT_PATH", str(models_dir / "best.pt")))
    onnx_path = Path(os.getenv("ONNX_PATH", str(models_dir / "best.onnx")))

    engine_dir = Path(os.getenv("ENGINE_DIR", str(models_dir / "engines")))
    engine_dir.mkdir(parents=True, exist_ok=True)
    imgsz = int(os.getenv("DETECTOR_IMGSZ", "640"))
    fp16 = os.getenv("TRT_FP16", "1") == "1"
    raw_ws = os.getenv("TRT_WORKSPACE", "4096")
    try:
        workspace = int(raw_ws)
    except ValueError:
        # fallback safe default
        workspace = 4096
    force_rebuild = os.getenv("TRT_FORCE_REBUILD", "0") == "1"

    if not has_nvidia_smi():
        print("[ensure_engine] No NVIDIA GPU detected (nvidia-smi not found). Skip engine.")
        return 0

    cc = gpu_compute_cap()            # "8.6"
    sm = "sm" + cc.replace(".", "")   # "sm86"
    gname = gpu_name()
    trt_ver = tensorrt_version()      # "10.15" (best effort)
    trt_tag = "trt" + trt_ver.replace(".", "_")
    workspace_mode = os.getenv("TRT_WORKSPACE_MODE", "auto").lower()
    if workspace_mode not in {"auto", "mempool", "workspace"}:
        workspace_mode = "auto"
    if workspace_mode == "auto":
        major = None
        try:
            major = int(str(trt_ver).split(".")[0])
        except (ValueError, IndexError):
            major = None
        workspace_mode = "mempool" if (major is not None and major >= 10) else "workspace"

    engine_path = engine_dir / f"best_{sm}_{trt_tag}_fp16.engine"

    print(f"[ensure_engine] GPU={gname} compute={cc} -> {sm}")
    print(f"[ensure_engine] TensorRT={trt_ver} -> {trt_tag}")
    print(f"[ensure_engine] Target engine: {engine_path}")

    # Determine whether the cached engine is still valid.
    # An engine is considered stale if:
    #   a) TRT_FORCE_REBUILD=1 (explicit override), or
    #   b) best.onnx is newer than the engine — meaning a new .pt was deployed
    #      and the ONNX was already re-exported (or will be shortly below).
    onnx_newer_than_engine = (
        engine_path.exists()
        and onnx_path.exists()
        and onnx_path.stat().st_mtime > engine_path.stat().st_mtime
    )
    effective_rebuild = force_rebuild or onnx_newer_than_engine

    if onnx_newer_than_engine:
        print(
            f"[ensure_engine] best.onnx is newer than cached engine "
            f"(Δ={onnx_path.stat().st_mtime - engine_path.stat().st_mtime:.1f}s) "
            f"— forcing engine rebuild ..."
        )

    if engine_path.exists() and not effective_rebuild:
        ok = try_load_engine(engine_path)
        if ok:
            print(f"[ensure_engine] Engine OK (cached): {engine_path}")
            # export to env file for start.sh
            (models_dir / ".model_path").write_text(str(engine_path))
            return 0
        print("[ensure_engine] Cached engine exists but incompatible -> rebuild")

    ensure_onnx(pt_path, onnx_path, imgsz)
    build_engine(
        onnx_path,
        engine_path,
        fp16=fp16,
        workspace=workspace,
        workspace_mode=workspace_mode,
    )

    # Validate
    if not try_load_engine(engine_path):
        raise RuntimeError("Engine built but failed to deserialize (still incompatible).")

    print(f"[ensure_engine] Engine ready: {engine_path}")
    (models_dir / ".model_path").write_text(str(engine_path))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
