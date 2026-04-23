import json
import os
import signal
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import parse_qs, urlparse

from roxy_adapter import RoxyAdapter, RoxyAdapterError


HOST = os.environ.get("FINGERPRINT_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("FINGERPRINT_BRIDGE_PORT", "50001"))
DEFAULT_ROXY_API_BASE_URL = "http://127.0.0.1:50000"


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass
class RunState:
    run_id: str
    config: dict
    provider: str
    adapter: RoxyAdapter
    profile_id: str
    ws_endpoint: str
    events: List[dict] = field(default_factory=list)
    next_seq: int = 1
    lock: threading.Lock = field(default_factory=threading.Lock)
    current_process: Optional[subprocess.Popen] = None
    stopped: bool = False

    def append_event(self, level: str, message: str, step: int = 0) -> dict:
        event = {
            "seq": self.next_seq,
            "level": level,
            "message": message,
            "step": step,
            "timestamp": _now_iso(),
        }
        self.events.append(event)
        self.next_seq += 1
        return event


RUNS: Dict[str, RunState] = {}
RUNS_LOCK = threading.Lock()


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    raw = handler.rfile.read(length) if length > 0 else b"{}"
    if not raw:
      return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON body: {exc}") from exc


def _resolve_node_binary() -> str:
    return os.environ.get("FINGERPRINT_BRIDGE_NODE", "node")


def _resolve_step_runner_path() -> str:
    return str(Path(__file__).with_name("roxy_step_runner.js"))


def _build_roxy_adapter(config: dict) -> RoxyAdapter:
    roxy = config.get("roxy") or {}
    return RoxyAdapter(
        api_base_url=str(roxy.get("apiBaseUrl") or DEFAULT_ROXY_API_BASE_URL),
        api_token=str(roxy.get("apiToken") or ""),
        workspace_id=str(roxy.get("workspaceId") or ""),
    )


def _create_run(config: dict) -> RunState:
    provider = str(config.get("fingerprintProvider") or "roxy")
    if provider != "roxy":
        raise RuntimeError(f"Unsupported fingerprint provider: {provider}")

    adapter = _build_roxy_adapter(config)
    proxy_url = str(config.get("proxyUrl") or "")
    created = adapter.create_profile(proxy_url=proxy_url)
    profile_id = created["dir_id"]
    try:
        opened = adapter.open_profile(profile_id)
    except Exception:
        try:
            adapter.close_profile(profile_id)
        except Exception:
            pass
        try:
            adapter.delete_profile(profile_id)
        except Exception:
            pass
        raise

    run = RunState(
        run_id=uuid.uuid4().hex,
        config=config,
        provider=provider,
        adapter=adapter,
        profile_id=profile_id,
        ws_endpoint=opened["ws_endpoint"],
    )
    run.append_event("info", f"Fingerprint run created with {provider} profile {run.profile_id}.", 0)
    return run


def _cleanup_run(run: RunState) -> None:
    if run.current_process and run.current_process.poll() is None:
        try:
            run.current_process.kill()
        except Exception:
            pass
    try:
        run.adapter.close_profile(run.profile_id)
    except Exception:
        pass
    try:
        run.adapter.delete_profile(run.profile_id)
    except Exception:
        pass


def _run_step(run: RunState, step: int, payload: dict) -> dict:
    request_payload = {
        **run.config,
        **payload,
        "step": step,
        "wsEndpoint": run.ws_endpoint,
        "profileId": run.profile_id,
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp:
        json.dump(request_payload, tmp, ensure_ascii=False)
        tmp_path = tmp.name

    command = [_resolve_node_binary(), _resolve_step_runner_path(), tmp_path]
    try:
        run.current_process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        stdout, stderr = run.current_process.communicate(timeout=240)
        if run.stopped:
            return {
                "status": "stopped",
                "step": step,
                "payload": {},
                "events": [run.append_event("warn", f"Fingerprint run stopped during step {step}.", step)],
                "nextSeq": run.next_seq,
            }

        if run.current_process.returncode != 0:
            message = stderr.strip() or stdout.strip() or f"Step runner exited with code {run.current_process.returncode}"
            run.append_event("error", message, step)
            return {
                "status": "failed",
                "step": step,
                "error": message,
                "events": [],
                "nextSeq": run.next_seq,
            }

        try:
            response = json.loads(stdout.strip() or "{}")
        except json.JSONDecodeError as exc:
            message = f"Step runner returned invalid JSON: {stdout[:200]}"
            run.append_event("error", message, step)
            return {
                "status": "failed",
                "step": step,
                "error": message,
                "events": [],
                "nextSeq": run.next_seq,
            }

        events = []
        for event in response.get("events") or []:
            events.append(run.append_event(
                event.get("level") or "info",
                event.get("message") or "",
                int(event.get("step") or step),
            ))

        payload_data = response.get("payload") or {}
        if payload_data.get("wsEndpoint"):
            run.ws_endpoint = str(payload_data["wsEndpoint"])

        return {
          "status": response.get("status") or "completed",
          "step": step,
          "payload": payload_data,
          "error": response.get("error") or "",
          "events": events,
          "nextSeq": run.next_seq,
          "runId": run.run_id,
        }
    except subprocess.TimeoutExpired:
        if run.current_process and run.current_process.poll() is None:
            run.current_process.kill()
        message = f"Fingerprint step {step} timed out."
        run.append_event("error", message, step)
        return {
            "status": "failed",
            "step": step,
            "error": message,
            "events": [],
            "nextSeq": run.next_seq,
            "runId": run.run_id,
        }
    finally:
        run.current_process = None
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


class FingerprintBridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            params = parse_qs(parsed.query)
            roxy_api_base_url = str((params.get("roxyApiBaseUrl") or [DEFAULT_ROXY_API_BASE_URL])[0] or DEFAULT_ROXY_API_BASE_URL).strip()
            roxy_status = {"reachable": False, "message": ""}
            try:
                adapter = RoxyAdapter(roxy_api_base_url, "", "")
                payload = adapter.health()
                roxy_status = {
                    "reachable": True,
                    "message": str(payload)[:200],
                }
            except Exception as exc:
                roxy_status = {
                    "reachable": False,
                    "message": str(exc),
                }
            return _json_response(self, 200, {
                "ok": True,
                "bridge": {"status": "ok"},
                "roxy": roxy_status,
            })

        if parsed.path.startswith("/runs/") and parsed.path.endswith("/events"):
            run_id = parsed.path.split("/")[2]
            with RUNS_LOCK:
                run = RUNS.get(run_id)
            if not run:
                return _json_response(self, 404, {"error": "Run not found."})
            params = parse_qs(parsed.query)
            after = int((params.get("after") or ["0"])[0] or "0")
            events = [event for event in run.events if int(event.get("seq") or 0) > after]
            return _json_response(self, 200, {
                "runId": run.run_id,
                "events": events,
                "nextSeq": run.next_seq,
            })

        return _json_response(self, 404, {"error": "Not found."})

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            body = _read_json_body(self)
        except ValueError as exc:
            return _json_response(self, 400, {"error": str(exc)})

        if parsed.path == "/runs":
            try:
                run = _create_run(body)
            except (RuntimeError, RoxyAdapterError, ValueError) as exc:
                return _json_response(self, 400, {"error": str(exc)})

            with RUNS_LOCK:
                RUNS[run.run_id] = run
            return _json_response(self, 200, {
                "runId": run.run_id,
                "events": run.events,
                "nextSeq": run.next_seq,
            })

        if parsed.path.startswith("/runs/") and "/steps/" in parsed.path:
            _, _, run_id, _, step_text = parsed.path.split("/", 4)
            with RUNS_LOCK:
                run = RUNS.get(run_id)
            if not run:
                return _json_response(self, 404, {"error": "Run not found."})
            try:
                step = int(step_text)
            except ValueError:
                return _json_response(self, 400, {"error": "Invalid step."})

            with run.lock:
                response = _run_step(run, step, body)
            return _json_response(self, 200, response)

        if parsed.path.startswith("/runs/") and parsed.path.endswith("/stop"):
            run_id = parsed.path.split("/")[2]
            with RUNS_LOCK:
                run = RUNS.get(run_id)
            if not run:
                return _json_response(self, 404, {"error": "Run not found."})

            run.stopped = True
            if run.current_process and run.current_process.poll() is None:
                try:
                    run.current_process.kill()
                except Exception:
                    pass
            event = run.append_event("warn", "Fingerprint run stop requested.", 0)
            return _json_response(self, 200, {
                "runId": run.run_id,
                "events": [event],
                "nextSeq": run.next_seq,
            })

        return _json_response(self, 404, {"error": "Not found."})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/runs/"):
          run_id = parsed.path.split("/")[2]
          with RUNS_LOCK:
              run = RUNS.pop(run_id, None)
          if not run:
              return _json_response(self, 404, {"error": "Run not found."})
          _cleanup_run(run)
          event = run.append_event("info", "Fingerprint run cleaned up.", 0)
          return _json_response(self, 200, {
              "runId": run_id,
              "events": [event],
              "nextSeq": run.next_seq,
          })

        return _json_response(self, 404, {"error": "Not found."})


def serve() -> None:
    server = ThreadingHTTPServer((HOST, PORT), FingerprintBridgeHandler)
    print(f"Fingerprint bridge listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    serve()
