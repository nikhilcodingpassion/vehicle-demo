from __future__ import annotations

import json
import os
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", 8000))
PUBLIC_DIR = Path(__file__).parent / "public"


class StateStore:
    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._version = 0
        self._state = {
            "brakeLights": False,
            "headlights": False,
            "bodyColor": "#c0392b",
            "hudMode": "tracking",
            "vehicleLabel": "Autonomous Concept Vehicle",
            "dumpBedTilt": 50,
            "engineOn": False,
            "driving": False,
            "spoilerUp": False,
            "updatedAt": time.time(),
        }

    def snapshot(self) -> dict:
        with self._condition:
            return {
                **self._state,
                "version": self._version,
            }

    def wait_for_update(self, current_version: int, timeout: float = 15.0) -> dict | None:
        with self._condition:
            changed = self._condition.wait_for(lambda: self._version != current_version, timeout=timeout)
            if not changed:
                return None
            return {
                **self._state,
                "version": self._version,
            }

    def update(self, patch: dict) -> dict:
        allowed = {"brakeLights", "headlights", "bodyColor", "hudMode", "vehicleLabel", "dumpBedTilt", "engineOn", "driving", "spoilerUp"}
        with self._condition:
            for key, value in patch.items():
                if key not in allowed:
                    continue
                if key == "brakeLights":
                    self._state[key] = bool(value)
                elif key == "headlights":
                    self._state[key] = bool(value)
                elif key == "bodyColor":
                    if isinstance(value, str) and len(value) <= 32:
                        self._state[key] = value
                elif key == "hudMode":
                    if value in {"tracking", "diagnostic", "cinematic"}:
                        self._state[key] = value
                elif key == "vehicleLabel":
                    if isinstance(value, str) and value.strip():
                        self._state[key] = value.strip()[:80]
                elif key == "dumpBedTilt":
                    try:
                        numeric_value = float(value)
                    except (TypeError, ValueError):
                        continue
                    self._state[key] = max(0.0, min(100.0, numeric_value))
                elif key == "engineOn":
                    self._state[key] = bool(value)
                elif key == "driving":
                    self._state[key] = bool(value)
                elif key == "spoilerUp":
                    self._state[key] = bool(value)

            self._state["updatedAt"] = time.time()
            self._version += 1
            self._condition.notify_all()
            return {
                **self._state,
                "version": self._version,
            }


STATE = StateStore()


class VehicleDemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, format, *args) -> None:
        # Suppress connection-aborted noise from Windows TCP stack
        if args and str(args[0]).startswith("ConnectionAbortedError"):
            return
        super().log_message(format, *args)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            self._send_json(STATE.snapshot())
            return
        if parsed.path == "/api/stream":
            self._stream_state()
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid Content-Length")
            return

        raw_body = self.rfile.read(content_length) if content_length else b"{}"
        try:
            body = json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Request body must be valid JSON")
            return

        if not isinstance(body, dict):
            self.send_error(HTTPStatus.BAD_REQUEST, "JSON body must be an object")
            return

        snapshot = STATE.update(body)
        self._send_json(snapshot)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send_json(self, payload: dict, status: int = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _stream_state(self) -> None:
        self.send_response(HTTPStatus.OK)
        self._send_cors_headers()
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        current_version = -1

        try:
            while True:
                snapshot = STATE.wait_for_update(current_version, timeout=15.0)
                if snapshot is None:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                    continue

                payload = json.dumps(snapshot)
                message = f"event: state\ndata: {payload}\n\n".                                                                         encode("utf-8")
                self.wfile.write(message)
                self.wfile.flush()
                current_version = snapshot["version"]
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return


def main() -> None:
    if not PUBLIC_DIR.exists():
        raise SystemExit(f"Missing public directory: {PUBLIC_DIR}")

    server = ThreadingHTTPServer((HOST, PORT), VehicleDemoHandler)
    print(f"Vehicle demo running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
