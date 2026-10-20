import asyncio
import ast
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx
from app.domain.generation_gate import generate_c_for_project, generate_python_for_project

MAX_SOURCE_BYTES = 64 * 1024  # 64 KB
MAX_STDIN_BYTES = 16 * 1024   # 16 KB
MAX_TIMEOUT_MS = 5000         # 5.0 seconds
RATE_LIMIT_WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 30

_request_history: Dict[str, list] = {}

FORBIDDEN_PYTHON_BUILTINS = {
    "eval", "exec", "compile", "__import__", "open",
    "globals", "locals", "getattr", "setattr", "delattr",
    "breakpoint", "memoryview", "exit", "quit"
}

FORBIDDEN_PYTHON_MODULES = {
    "os", "sys", "subprocess", "socket", "shutil", "posix", "nt",
    "pty", "platform", "ctypes", "importlib", "signal", "threading",
    "multiprocessing", "asyncio", "urllib", "requests", "http"
}

ALLOWED_C_INCLUDES = {"<stdio.h>", "<stdlib.h>", "<stdbool.h>", "<math.h>", "<string.h>"}
FORBIDDEN_C_PATTERNS = [
    r"\bsystem\s*\(",
    r"\bpopen\s*\(",
    r"\bfork\s*\(",
    r"\bexec[a-z]*\s*\(",
    r"\bkill\s*\(",
    r"\bsignal\s*\(",
    r"\bptrace\s*\(",
    r"\bmprotect\s*\(",
    r"#include\s*<sys/",
    r"#include\s*<unistd\.h>",
    r"#include\s*<fcntl\.h>",
    r"#include\s*<dlfcn\.h>",
    r"#include\s*<netinet/",
    r"#include\s*<arpa/",
]


def audit_python_safety(code: str) -> Tuple[bool, Optional[str]]:
    """Static AST security audit for generated Python source before local execution."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"Syntax error: {e}"

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            return False, "Import statements are prohibited in sandboxed MapToCode execution."

        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_PYTHON_BUILTINS:
                return False, f"Function '{node.func.id}()' is prohibited for security."

        if isinstance(node, ast.Attribute):
            if node.attr.startswith("__") and node.attr.endswith("__"):
                return False, f"Access to special attribute '{node.attr}' is prohibited."
            if node.attr in FORBIDDEN_PYTHON_MODULES:
                return False, f"Access to module attribute '{node.attr}' is prohibited."

        if isinstance(node, ast.Name):
            if node.id in FORBIDDEN_PYTHON_MODULES:
                return False, f"Access to module '{node.id}' is prohibited."

    return True, None


def audit_c_safety(code: str) -> Tuple[bool, Optional[str]]:
    """Static lexical security audit for generated C source before local compilation."""
    for pattern in FORBIDDEN_C_PATTERNS:
        if re.search(pattern, code, re.IGNORECASE):
            return False, f"Prohibited C call or header detected matching: {pattern}"

    for match in re.finditer(r"#include\s*([<\"].*?[>\"])", code):
        inc = match.group(1).strip()
        if inc not in ALLOWED_C_INCLUDES:
            return False, f"Header {inc} is not permitted in sandbox. Allowed headers: {', '.join(sorted(ALLOWED_C_INCLUDES))}"

    return True, None


async def execute_locally_isolated(
    language: str,
    code: str,
    stdin: str = "",
    timeout_ms: int = MAX_TIMEOUT_MS,
) -> Dict[str, Any]:
    """Executes validated code locally in an isolated child process without external dependencies."""
    lang = (language or "").lower()
    timeout_seconds = min(5.0, max(0.5, float(timeout_ms) / 1000.0))

    if lang == "python":
        is_safe, err = audit_python_safety(code)
        if not is_safe:
            return {
                "success": False,
                "status": "runtime_error",
                "stdout": "",
                "stderr": f"Security audit failed: {err}",
                "exitCode": 1,
                "executionTimeMs": 0,
                "runner": "local_isolated",
            }

        with tempfile.TemporaryDirectory(prefix="m2c_py_") as tmpdir:
            t0 = time.perf_counter()
            try:
                proc = await asyncio.to_thread(
                    subprocess.run,
                    [sys.executable, "-I", "-S", "-u", "-c", code],
                    input=stdin,
                    text=True,
                    capture_output=True,
                    timeout=timeout_seconds,
                    cwd=tmpdir,
                )
                t1 = time.perf_counter()
                elapsed_ms = max(1, int((t1 - t0) * 1000))

                return {
                    "success": proc.returncode == 0,
                    "status": "success" if proc.returncode == 0 else "runtime_error",
                    "stdout": proc.stdout[:MAX_SOURCE_BYTES],
                    "stderr": proc.stderr[:MAX_SOURCE_BYTES],
                    "exitCode": proc.returncode,
                    "executionTimeMs": elapsed_ms,
                    "runner": "local_isolated",
                }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "status": "timeout",
                    "stdout": "",
                    "stderr": f"Execution time limit exceeded ({timeout_seconds:.1f} seconds).",
                    "exitCode": 124,
                    "executionTimeMs": int(timeout_seconds * 1000),
                    "runner": "local_isolated",
                }
            except Exception as e:
                return {
                    "success": False,
                    "status": "service_error",
                    "message": f"Local Python runner error: {str(e)}",
                    "runner": "local_isolated",
                }

    elif lang == "c":
        compiler = shutil.which("gcc") or shutil.which("clang")
        if not compiler:
            return {
                "success": False,
                "status": "service_error",
                "message": "Local C compiler (gcc or clang) is not installed on this system.",
                "runner": "local_isolated",
            }

        is_safe, err = audit_c_safety(code)
        if not is_safe:
            return {
                "success": False,
                "status": "runtime_error",
                "stdout": "",
                "stderr": f"Security audit failed: {err}",
                "exitCode": 1,
                "executionTimeMs": 0,
                "runner": "local_isolated",
            }

        with tempfile.TemporaryDirectory(prefix="m2c_c_") as tmpdir:
            src_path = os.path.join(tmpdir, "main.c")
            bin_path = os.path.join(tmpdir, "prog")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(code)

            compile_proc = await asyncio.to_thread(
                subprocess.run,
                [compiler, "-O2", "-pipe", "-std=c99", "-o", bin_path, src_path, "-lm"],
                capture_output=True,
                text=True,
                timeout=5.0,
                cwd=tmpdir,
            )

            if compile_proc.returncode != 0:
                return {
                    "success": False,
                    "status": "compilation_error",
                    "stdout": compile_proc.stdout[:MAX_SOURCE_BYTES],
                    "stderr": compile_proc.stderr[:MAX_SOURCE_BYTES] or "C compilation failed.",
                    "exitCode": compile_proc.returncode,
                    "executionTimeMs": 0,
                    "runner": "local_isolated",
                }

            t0 = time.perf_counter()
            try:
                run_proc = await asyncio.to_thread(
                    subprocess.run,
                    [bin_path],
                    input=stdin,
                    text=True,
                    capture_output=True,
                    timeout=timeout_seconds,
                    cwd=tmpdir,
                )
                t1 = time.perf_counter()
                elapsed_ms = max(1, int((t1 - t0) * 1000))

                return {
                    "success": run_proc.returncode == 0,
                    "status": "success" if run_proc.returncode == 0 else "runtime_error",
                    "stdout": run_proc.stdout[:MAX_SOURCE_BYTES],
                    "stderr": run_proc.stderr[:MAX_SOURCE_BYTES],
                    "exitCode": run_proc.returncode,
                    "executionTimeMs": elapsed_ms,
                    "runner": "local_isolated",
                }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "status": "timeout",
                    "stdout": "",
                    "stderr": f"Execution time limit exceeded ({timeout_seconds:.1f} seconds).",
                    "exitCode": 124,
                    "executionTimeMs": int(timeout_seconds * 1000),
                    "runner": "local_isolated",
                }
            except Exception as e:
                return {
                    "success": False,
                    "status": "service_error",
                    "message": f"Local C runner error: {str(e)}",
                    "runner": "local_isolated",
                }
    else:
        return {
            "success": False,
            "status": "service_error",
            "message": f"Unsupported language: {language}",
        }


def check_rate_limit(client_ip: str) -> Dict[str, Any]:
    now = time.time()
    timestamps = _request_history.get(client_ip, [])
    timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW_SECONDS]
    if len(timestamps) >= MAX_REQUESTS_PER_WINDOW:
        retry_after = int(RATE_LIMIT_WINDOW_SECONDS - (now - timestamps[0])) + 1
        return {
            "allowed": False,
            "message": f"Too many execution requests. Please wait {retry_after} seconds.",
            "retry_after_seconds": max(1, retry_after),
        }
    timestamps.append(now)
    _request_history[client_ip] = timestamps
    return {"allowed": True, "remaining": MAX_REQUESTS_PER_WINDOW - len(timestamps)}


def reset_rate_limits() -> None:
    _request_history.clear()


def verify_execution_gate(project: Dict[str, Any], language: str = "c") -> Dict[str, Any]:
    if not project:
        return {
            "allowed": False,
            "reason": "MISSING_PROJECT",
            "message": "No project data provided for execution validation.",
        }

    lang = (language or "c").lower()
    if lang not in ("c", "python"):
        return {
            "allowed": False,
            "reason": "UNSUPPORTED_LANGUAGE",
            "message": f"Unsupported target language “{language}”. MapToCode only executes verified C and Python code.",
        }

    generator = generate_python_for_project if lang == "python" else generate_c_for_project
    result = generator(project)

    if result.get("status") != "ready":
        diagnostics = result.get("diagnostics", [])
        primary_msg = diagnostics[0].get("message") if diagnostics else "Project is not approved or has unresolved conflicts."
        return {
            "allowed": False,
            "reason": "GATE_BLOCKED",
            "message": f"Execution blocked by generation gate: {primary_msg}",
            "diagnostics": diagnostics,
            "reconciliation": result.get("reconciliation"),
        }

    return {
        "allowed": True,
        "code": result.get("code", ""),
        "language": lang,
        "metadata": result.get("metadata", {}),
    }


async def execute_sandboxed_code(
    language: str,
    code: str,
    stdin: str = "",
    timeout_ms: int = MAX_TIMEOUT_MS,
    sandbox_url: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    lang = (language or "").lower()
    if lang not in ("c", "python"):
        return {
            "success": False,
            "status": "service_error",
            "message": f"Language “{language}” is not supported for execution.",
        }

    if not code or not code.strip():
        return {
            "success": False,
            "status": "service_error",
            "message": "Source code cannot be empty.",
        }

    code_bytes = code.encode("utf-8")
    if len(code_bytes) > MAX_SOURCE_BYTES:
        return {
            "success": False,
            "status": "service_error",
            "message": f"Source code exceeds limit of {MAX_SOURCE_BYTES // 1024} KB.",
        }

    stdin_bytes = (stdin or "").encode("utf-8")
    if len(stdin_bytes) > MAX_STDIN_BYTES:
        return {
            "success": False,
            "status": "service_error",
            "message": f"Standard input exceeds limit of {MAX_STDIN_BYTES // 1024} KB.",
        }

    explicit_sandbox = bool(sandbox_url or os.getenv("JUDGE0_URL") or os.getenv("EXECUTION_SERVICE_URL"))
    prefer_remote = os.getenv("USE_REMOTE_SANDBOX", "false").lower() in ("true", "1")

    # If remote sandbox is explicitly requested, attempt it first
    if explicit_sandbox and prefer_remote:
        sandbox = (sandbox_url or os.getenv("JUDGE0_URL") or os.getenv("EXECUTION_SERVICE_URL") or "").rstrip("/")
        key = api_key or os.getenv("JUDGE0_API_KEY") or os.getenv("EXECUTION_API_KEY") or ""
        language_id = 103 if lang == "c" else 100
        endpoint = f"{sandbox}/submissions?wait=true"
        headers = {"Content-Type": "application/json"}
        if key:
            headers["X-Auth-Token"] = key
            headers["X-RapidAPI-Key"] = key

        cpu_limit = min(5, max(1, round(timeout_ms / 1000)))
        wall_limit = min(10, max(2, round((timeout_ms + 2000) / 1000)))
        payload = {
            "source_code": code,
            "language_id": language_id,
            "stdin": stdin or "",
            "cpu_time_limit": cpu_limit,
            "wall_time_limit": wall_limit,
            "memory_limit": 128000,
        }

        try:
            async with httpx.AsyncClient(timeout=float(timeout_ms + 3000) / 1000.0) as client:
                resp = await client.post(endpoint, json=payload, headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                status_info = data.get("status", {})
                status_id = status_info.get("id")
                status_desc = status_info.get("description", "Unknown")

                if status_id == 6:
                    return {
                        "success": False,
                        "status": "compilation_error",
                        "stdout": data.get("stdout") or "",
                        "stderr": data.get("compile_output") or data.get("stderr") or "Compilation failed.",
                        "exitCode": data.get("exit_code", 1),
                        "executionTimeMs": int(float(data.get("time") or 0) * 1000),
                        "runner": "cloud_sandbox",
                    }

                if status_id == 5:
                    return {
                        "success": False,
                        "status": "timeout",
                        "stdout": data.get("stdout") or "",
                        "stderr": "Execution time limit exceeded (maximum 5.0 seconds).",
                        "exitCode": 124,
                        "executionTimeMs": timeout_ms,
                        "runner": "cloud_sandbox",
                    }

                if status_id is not None and 7 <= status_id <= 14 and status_id != 3:
                    return {
                        "success": False,
                        "status": "runtime_error",
                        "stdout": data.get("stdout") or "",
                        "stderr": data.get("stderr") or data.get("message") or f"Runtime error: {status_desc}",
                        "exitCode": data.get("exit_code", 1),
                        "executionTimeMs": int(float(data.get("time") or 0) * 1000),
                        "runner": "cloud_sandbox",
                    }

                return {
                    "success": True,
                    "status": "success",
                    "stdout": data.get("stdout") or "",
                    "stderr": data.get("stderr") or "",
                    "exitCode": data.get("exit_code", 0),
                    "executionTimeMs": int(float(data.get("time") or 0) * 1000),
                    "runner": "cloud_sandbox",
                }
        except Exception:
            # Fall back to local isolated runner if remote sandbox is unreachable
            pass

    # Default: Run locally in isolated, offline-safe sandbox
    return await execute_locally_isolated(lang, code, stdin, timeout_ms)
