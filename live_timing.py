"""Cliente local WebSocket/SignalR Core para F1 Live Timing.

No utiliza OpenF1 ni requiere credenciales. El flujo no es una API pública
estable: la cobertura y el acceso anónimo dependen del servicio de F1.
"""

from __future__ import annotations

import base64
import json
import os
import ssl
import struct
import threading
import time
import urllib.request
import socket
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any, BinaryIO, Iterator
from urllib.parse import quote

from live_state import LiveState, utc_now

HOST = "livetiming.formula1.com"
NEGOTIATE_URL = f"https://{HOST}/signalrcore/negotiate"
WEBSOCKET_PATH = "/signalrcore"
RECORD_SEPARATOR = "\x1e"
USER_AGENT = "APEX/2.0 (local F1 timing dashboard)"
ORIGIN = "https://www.formula1.com"
# Lista pública de temas utilizada también por los clientes comunitarios.
TOPICS = [
    "Heartbeat", "AudioStreams", "DriverList", "ExtrapolatedClock",
    "RaceControlMessages", "SessionInfo", "SessionStatus", "TeamRadio",
    "TimingAppData", "TimingStats", "TrackStatus", "WeatherData",
    "Position.z", "CarData.z", "ContentStreams", "SessionData",
    "TimingData", "TopThree", "RcmSeries", "LapCount", "TimingDataF1",
]


class LiveTimingError(RuntimeError):
    pass


def encode_websocket_frame(text: str, opcode: int = 1) -> bytes:
    payload = text.encode("utf-8") if isinstance(text, str) else text
    length = len(payload)
    header = bytes([0x80 | opcode])
    if length >= 65536:
        header += bytes([0x80 | 127]) + struct.pack("!Q", length)
    elif length >= 126:
        header += bytes([0x80 | 126]) + struct.pack("!H", length)
    else:
        header += bytes([0x80 | length])
    mask = os.urandom(4)
    masked = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
    return header + mask + masked


def read_websocket_frame(stream: BinaryIO, max_size: int = 16 * 1024 * 1024) -> tuple[int, bool, bytes]:
    def read_exact(size: int) -> bytes:
        result = stream.read(size)
        if result is None or len(result) != size:
            raise ConnectionError("La conexión de datos se ha cerrado.")
        return result

    parts = []
    fragment_opcode = 0
    while True:
        first, second = read_exact(2)
        fin = bool(first & 0x80)
        opcode = first & 0x0F
        if first & 0x70:
            raise LiveTimingError("La compresión WebSocket no está permitida.")
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", read_exact(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", read_exact(8))[0]
        if length > max_size:
            raise LiveTimingError("Mensaje de datos demasiado grande.")
        mask = read_exact(4) if masked else b""
        data = read_exact(length)
        if mask:
            data = bytes(value ^ mask[index % 4] for index, value in enumerate(data))
        if opcode in (8, 9, 10):
            return opcode, fin, data
        if opcode != 0:
            fragment_opcode = opcode
            parts = [data]
        else:
            parts.append(data)
        if fin:
            return fragment_opcode, True, b"".join(parts)


def signalr_messages(text: str) -> Iterator[dict[str, Any]]:
    for part in text.split(RECORD_SEPARATOR):
        if part:
            try:
                message = json.loads(part)
                if isinstance(message, dict):
                    yield message
            except json.JSONDecodeError as exc:
                raise LiveTimingError("Respuesta SignalR no válida.") from exc


def dispatch_signalr(state: LiveState, message: dict[str, Any]) -> None:
    if message.get("type") == 1 and message.get("target") == "feed":
        args = message.get("arguments", [])
        if len(args) >= 2:
            state.apply(str(args[0]), args[1], args[2] if len(args) > 2 else None)
    elif message.get("type") == 3 and message.get("result"):
        result = message["result"]
        if isinstance(result, dict):
            for topic, data in result.items():
                state.apply(topic, data)


class SignalRWebSocket:
    """Conexión WebSocket mínima con TLS y ping/pong, solo para este servicio."""

    def __init__(self, token: str, cookies: str = "", timeout: int = 45) -> None:
        self._stop = threading.Event()
        self._socket: socket.socket | None = None
        self._stream: BinaryIO | None = None
        self._write_lock = threading.Lock()
        raw = socket.create_connection((HOST, 443), timeout=15)
        raw.settimeout(timeout)
        tls = ssl.create_default_context().wrap_socket(raw, server_hostname=HOST)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        path = f"{WEBSOCKET_PATH}?id={quote(token, safe='')}"
        headers = [
            f"GET {path} HTTP/1.1", f"Host: {HOST}", "Upgrade: websocket",
            "Connection: Upgrade", f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13", f"User-Agent: {USER_AGENT}", f"Origin: {ORIGIN}",
        ]
        if cookies:
            headers.append(f"Cookie: {cookies}")
        tls.sendall(("\r\n".join(headers) + "\r\n\r\n").encode("ascii"))
        self._stream = tls.makefile("rb")
        self._socket = tls
        status = self._stream.readline(1024).decode("iso-8859-1").strip()
        if " 101 " not in f" {status} ":
            self.close()
            raise LiveTimingError("F1 no aceptó la conexión WebSocket.")
        while True:
            line = self._stream.readline(8192)
            if line in (b"\r\n", b"\n", b""):
                break
        self.send('{"protocol":"json","version":1}' + RECORD_SEPARATOR)

    def send(self, text: str, opcode: int = 1) -> None:
        with self._write_lock:
            if self._socket is None:
                raise ConnectionError("WebSocket cerrado.")
            self._socket.sendall(encode_websocket_frame(text, opcode))

    def receive(self) -> str | None:
        if not self._stream:
            return None
        while True:
            opcode, _fin, payload = read_websocket_frame(self._stream)
            if opcode == 8:
                return None
            if opcode == 9:
                self.send(payload, 10)
                continue
            if opcode == 10:
                continue
            return payload.decode("utf-8")

    def close(self) -> None:
        self._stop.set()
        if self._socket:
            try:
                self._socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                self._socket.close()
            except OSError:
                pass
            self._socket = None


class LiveTimingWorker:
    def __init__(self, state: LiveState, demo: bool = False, reconnect_delay: float = 15.0) -> None:
        self.state = state
        self.demo = demo
        self.reconnect_delay = reconnect_delay
        self._stop = threading.Event()
        self._socket: SignalRWebSocket | None = None
        self._thread = threading.Thread(target=self._run_replay if demo else self._run, daemon=True, name="f1-timing")

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._socket:
            self._socket.close()
        self._thread.join(timeout=2)

    def _run_replay(self) -> None:
        try:
            path = Path(__file__).resolve().parent / "data" / "demo-live.json"
            with path.open(encoding="utf-8") as handle:
                messages = json.load(handle)
            self.state.set_connection(status="replay", connected=True, source="Reproducción de prueba", error=None)
            for message in messages:
                if self._stop.is_set():
                    return
                self.state.apply(**message)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            self.state.set_connection(status="error", connected=False, error=f"No se pudo cargar la demostración: {exc}")

    def _negotiate(self) -> tuple[str, str]:
        headers = {"Origin": ORIGIN, "User-Agent": USER_AGENT}
        cookie_jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
        request = urllib.request.Request(
            f"{NEGOTIATE_URL}?negotiateVersion=1", headers=headers, data=b"", method="POST",
        )
        with opener.open(request, timeout=15) as response:
            result = json.load(response)
        cookies = "; ".join(f"{cookie.name}={cookie.value}" for cookie in cookie_jar)
        token = result.get("connectionToken")
        if not isinstance(token, str) or not token:
            raise LiveTimingError("F1 no devolvió una conexión válida.")
        return token, cookies

    def _connection(self) -> None:
        self.state.set_connection(status="connecting", connected=False, error=None)
        token, cookies = self._negotiate()
        self._socket = SignalRWebSocket(token, cookies)
        socket = self._socket
        handshake = False
        while not self._stop.is_set():
            text = socket.receive()
            if text is None:
                raise ConnectionError("El servidor de F1 cerró la conexión.")
            for message in signalr_messages(text):
                if not handshake:
                    if message.get("error"):
                        raise LiveTimingError("F1 rechazó la conexión.")
                    handshake = True
                    self.state.set_connection(status="connected", connected=True, error=None, connectedAt=utc_now())
                    subscription = {"type": 1, "invocationId": "apex-subscribe", "target": "Subscribe", "arguments": [TOPICS]}
                    socket.send(json.dumps(subscription, separators=(",", ":")) + RECORD_SEPARATOR)
                    continue
                dispatch_signalr(self.state, message)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self._connection()
            except Exception as exc:
                # Cualquier cambio del protocolo, dato comprimido inválido o
                # fallo puntual debe reconectar, no matar el hilo en silencio.
                if not self._stop.is_set():
                    self.state.set_connection(status="error", connected=False, error=str(exc)[:300])
            finally:
                if self._socket:
                    self._socket.close()
                    self._socket = None
            self.state.set_connection(connected=False)
            self._stop.wait(self.reconnect_delay)
