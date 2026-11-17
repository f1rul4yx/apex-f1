#!/usr/bin/env python3
"""APEX Pit Wall: servidor local sin dependencias externas."""
from __future__ import annotations
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from f1_data import DataSourceError, F1Data
from live_state import LiveState
from live_timing import LiveTimingWorker
ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
service = F1Data()
live = LiveState()


class ApexHandler(SimpleHTTPRequestHandler):
    server_version = "APEX/2.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        try:
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, OSError):
            # El navegador puede cerrar la pestaña durante una descarga grande.
            self.close_connection = True

    def _live_events(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("X-Accel-Buffering", "no")
        self.close_connection = True
        self.end_headers()
        revision = -1
        try:
            self.wfile.write(b"retry: 3000\n\n")
            self.wfile.flush()
            while True:
                revision = live.wait_for_update(revision, timeout=15.0)
                if revision < 0:
                    continue
                event = f"event: update\ndata: {{\"revision\":{revision}}}\n\n"
                self.wfile.write(event.encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError, ValueError):
            return

    def do_GET(self) -> None:  # noqa: N802 (API de http.server)
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            if parsed.path == "/":
                self.path = "/index.html"
            return super().do_GET()
        query = parse_qs(parsed.query)
        try:
            if parsed.path == "/api/health":
                return self._json({"status": "ok", "connection": live.connection})
            if parsed.path == "/api/live":
                return self._json(live.snapshot())
            if parsed.path == "/api/live/topic":
                topic = query.get("name", [""])[0]
                if len(topic) > 100:
                    return self._json({"error": "Nombre de tema no válido."}, 400)
                result = live.get_topic(topic)
                if result is None:
                    return self._json({"error": "Todavía no se han recibido datos de este tema."}, 404)
                return self._json(result)
            if parsed.path == "/api/live/events":
                return self._live_events()
            if parsed.path == "/api/season":
                year = query.get("year", [""])[0]
                return self._json(service.get_season(year))
            if parsed.path == "/api/race":
                year = query.get("year", [""])[0]
                round_number = query.get("round", [""])[0]
                return self._json(service.get_race(year, round_number))
            return self._json({"error": "Ruta no encontrada."}, 404)
        except ValueError as exc:
            return self._json({"error": str(exc)}, 400)
        except DataSourceError as exc:
            return self._json({"error": str(exc)}, 503)
        except json.JSONDecodeError:
            return self._json({"error": "No se pudo interpretar el dato recibido."}, 502)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[APEX] {self.address_string()} — {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="APEX Pit Wall, panel F1 en vivo local y gratuito.")
    parser.add_argument("--host", default="127.0.0.1", help="Dirección de escucha (por defecto: solo este equipo)")
    parser.add_argument("--port", type=int, default=3000, help="Puerto (por defecto: 3000)")
    parser.add_argument("--demo", action="store_true", help="Muestra una replay ficticia; no conecta con F1")
    args = parser.parse_args()
    worker = LiveTimingWorker(live, demo=args.demo)
    worker.start()
    server = ThreadingHTTPServer((args.host, args.port), ApexHandler)
    print(f"APEX Pit Wall disponible en http://localhost:{args.port}")
    print("DEMOSTRACIÓN: no hay datos reales ni conexión con F1." if args.demo else "Conectando con F1 Live Timing · Sin suscripción ni claves.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAPEX detenido.")
    finally:
        worker.stop()
        server.server_close()


if __name__ == "__main__":
    main()
