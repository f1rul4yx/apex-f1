#!/usr/bin/env python3
"""Servidor local de APEX. No requiere dependencias externas."""

from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from f1_data import DataSourceError, F1Data

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
service = F1Data()


class ApexHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (API de http.server)
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            if parsed.path == "/":
                self.path = "/index.html"
            return super().do_GET()

        query = parse_qs(parsed.query)
        try:
            if parsed.path == "/api/health":
                return self._json({"status": "ok"})
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

    def log_message(self, fmt: str, *args) -> None:
        print(f"[APEX] {self.address_string()} — {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ejecuta la aplicación web APEX.")
    parser.add_argument("--host", default="0.0.0.0", help="Dirección de escucha")
    parser.add_argument("--port", type=int, default=3000, help="Puerto (por defecto: 3000)")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), ApexHandler)
    print(f"APEX disponible en http://localhost:{args.port}")
    print("Datos: OpenF1 · Pulsa Ctrl+C para detener el servidor")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
