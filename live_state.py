"""Estado consolidado del flujo de F1, independiente de la conexión."""

from __future__ import annotations

import base64
import copy
import json
import threading
import zlib
from datetime import datetime, timezone
from typing import Any

MAX_SERIES_ENTRIES = 20000
TOPIC_LABELS = {
    "TimingDataF1": "Tiempos y posiciones",
    "TimingData": "Tiempos y sectores",
    "TimingAppData": "Neumáticos y estrategia",
    "TimingStats": "Mejores tiempos",
    "DriverList": "Pilotos y equipos",
    "SessionInfo": "Sesión y circuito",
    "SessionData": "Calendario de la sesión",
    "SessionStatus": "Estado de la sesión",
    "TrackStatus": "Banderas y pista",
    "LapCount": "Contador de vueltas",
    "ExtrapolatedClock": "Reloj de carrera",
    "WeatherData": "Clima actual",
    "WeatherDataSeries": "Histórico de clima",
    "RaceControlMessages": "Control de carrera",
    "RcmSeries": "Cronología de control",
    "TeamRadio": "Radios de equipo",
    "CarData.z": "Telemetría de los coches",
    "Position.z": "Posiciones en el circuito",
    "TopThree": "Los tres primeros",
    "ChampionshipPrediction": "Mundial proyectado",
    "OvertakeSeries": "Adelantamientos",
    "TyreStintSeries": "Histórico de tandas",
    "PitStopSeries": "Histórico de paradas",
    "PitLaneTimeCollection": "Tiempos del pit lane",
    "AudioStreams": "Emisiones de audio",
    "ContentStreams": "Emisiones de vídeo",
    "Heartbeat": "Señal del servidor",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def deep_merge(current: Any, incoming: Any) -> Any:
    """Combina deltas de diccionarios; una lista recibida reemplaza la anterior."""
    if isinstance(current, dict) and isinstance(incoming, dict):
        result = {
            key: deep_merge(value, incoming[key]) if key in incoming else copy.deepcopy(value)
            for key, value in current.items()
        }
        for key, value in incoming.items():
            if key not in result:
                result[key] = copy.deepcopy(value)
        return result
    return copy.deepcopy(incoming)


def decode_payload(topic: str, payload: Any) -> Any:
    if topic.endswith(".z") and isinstance(payload, str):
        compressed = base64.b64decode(payload, validate=True)
        return json.loads(zlib.decompress(compressed, wbits=-zlib.MAX_WBITS))
    if isinstance(payload, str):
        return json.loads(payload)
    return payload


def _bounded(topic: str, data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    truncated = False
    if topic in {"CarData.z", "Position.z"} and isinstance(data.get("Entries"), list):
        truncated = len(data["Entries"]) > MAX_SERIES_ENTRIES
        if truncated:
            data["Entries"] = data["Entries"][-MAX_SERIES_ENTRIES:]
    return truncated


def _values(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        return list(value.values())
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


def _feed(feeds: dict[str, Any], topic: str, key: str | None = None) -> Any:
    data = feeds.get(topic, {})
    return data.get(key, {}) if key else data


def _duration(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("Value")
    return str(value) if value not in (None, "") else "—"


def _sectors(line: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for sector in _values(line.get("Sectors", []))[:3]:
        result.append({
            "value": _duration(sector),
            "personalBest": bool(sector.get("PersonalFastest")),
            "overallBest": bool(sector.get("OverallFastest")),
        })
    while len(result) < 3:
        result.append({"value": "—", "personalBest": False, "overallBest": False})
    return result


def _last_stint(stints: Any) -> dict[str, Any]:
    values = _values(stints)
    return values[-1] if values else {}


def _speeds(line: dict[str, Any]) -> dict[str, Any]:
    speeds = line.get("Speeds", {}) if isinstance(line.get("Speeds"), dict) else {}
    return {name: speeds.get(name, {}).get("Value", "—") for name in ("I1", "I2", "FL", "ST")}


def timing_rows(feeds: dict[str, Any]) -> list[dict[str, Any]]:
    """Proyecta el contenido bruto en una clasificación sin modificarlo."""
    driver_feed = _feed(feeds, "DriverList")
    full_timing = _feed(feeds, "TimingDataF1", "Lines")
    app_lines = _feed(feeds, "TimingAppData", "Lines")
    timing_lines = _feed(feeds, "TimingData", "Lines")
    numbers = set(driver_feed) | set(full_timing) | set(app_lines) | set(timing_lines)
    rows = []
    for number in numbers:
        raw_driver = driver_feed.get(number, {})
        if not isinstance(raw_driver, dict):
            continue
        line = full_timing.get(number, {})
        timing_line = timing_lines.get(number, {})
        app_line = app_lines.get(number, {})
        if not all(isinstance(item, dict) for item in (line, timing_line, app_line)):
            continue
        merged = deep_merge(timing_line, line)
        stint = _last_stint(app_line.get("Stints", {}))
        position = merged.get("Position") or merged.get("Line")
        try:
            position_number = int(position)
        except (TypeError, ValueError):
            position_number = 999
        if not any((raw_driver, line, timing_line, app_line)):
            continue
        rows.append({
            "number": str(raw_driver.get("RacingNumber", number)),
            "id": number,
            "code": raw_driver.get("Tla", number),
            "name": raw_driver.get("FullName", raw_driver.get("BroadcastName", "Piloto")),
            "team": raw_driver.get("TeamName", "Equipo"),
            "colour": raw_driver.get("TeamColour", "8899AA"),
            "position": str(position) if position is not None else "—",
            "positionNumber": position_number,
            "gap": str(merged.get("GapToLeader") or ""),
            "interval": str(merged.get("IntervalToPositionAhead", {}).get("Value", "") if isinstance(merged.get("IntervalToPositionAhead"), dict) else ""),
            "lastLap": _duration(merged.get("LastLapTime")),
            "bestLap": _duration(merged.get("BestLapTime")),
            "sectors": _sectors(merged),
            "speeds": _speeds(merged),
            "compound": stint.get("Compound", "—"),
            "tyreAge": stint.get("TotalLaps", stint.get("Laps", "—")),
            "newTyres": stint.get("New"),
            "stint": stint.get("StintNumber", "—"),
            "pits": merged.get("NumberOfPitStops", "—"),
            "inPit": bool(merged.get("InPit")),
            "pitOut": bool(merged.get("PitOut")),
            "retired": bool(merged.get("Retired")),
            "stopped": bool(merged.get("Stopped")),
            "status": str(merged.get("Status", "")),
        })
    rows.sort(key=lambda row: (row["positionNumber"], row["id"]))
    return rows


class LiveState:
    """Almacén local seguro para hilos, con prevención de memoria ilimitada."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._updated = threading.Condition(self._lock)
        self._feeds: dict[str, Any] = {}
        self._received_at: dict[str, str] = {}
        self._truncated: dict[str, bool] = {}
        self.connection: dict[str, Any] = {
            "status": "connecting", "connected": False, "lastMessageAt": None, "error": None, "source": "F1 Live Timing",
        }
        self.revision = 0

    def set_connection(self, **values: Any) -> None:
        with self._updated:
            self.connection.update(values)
            self.revision += 1
            self._updated.notify_all()

    def apply(self, topic: str, payload: Any, received_at: Any = None) -> None:
        data = decode_payload(topic, payload)
        if not isinstance(data, (dict, list)):
            raise ValueError("El mensaje debe contener un objeto o una lista.")
        timestamp = str(received_at or utc_now())
        with self._updated:
            self._feeds[topic] = deep_merge(self._feeds.get(topic, {}), data)
            truncated = _bounded(topic, self._feeds[topic])
            self._truncated[topic] = bool(self._truncated.get(topic, False) or truncated)
            self._received_at[topic] = timestamp
            self.connection["lastMessageAt"] = utc_now()
            self.revision += 1
            self._updated.notify_all()

    def wait_for_update(self, revision: int, timeout: float = 15.0) -> int:
        with self._updated:
            self._updated.wait_for(lambda: self.revision != revision, timeout)
            return self.revision

    def get_topic(self, topic: str) -> dict[str, Any] | None:
        with self._lock:
            if topic not in self._feeds:
                return None
            return {
                "name": topic,
                "label": TOPIC_LABELS.get(topic, topic),
                "data": copy.deepcopy(self._feeds[topic]),
                "receivedAt": self._received_at[topic],
                "truncated": self._truncated.get(topic, False),
                "revision": self.revision,
            }

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            # Evitar copiar series voluminosas en cada actualización periódica.
            feeds = {
                name: copy.deepcopy(data)
                for name, data in self._feeds.items()
                if name not in {"CarData.z", "Position.z"}
            }
            catalog = [
                {
                    "name": topic,
                    "label": TOPIC_LABELS.get(topic, topic),
                    "receivedAt": self._received_at[topic],
                    "entries": len(data) if hasattr(data, "__len__") else 0,
                    "truncated": self._truncated.get(topic, False),
                }
                for topic, data in sorted(self._feeds.items())
            ]
            return {
                "revision": self.revision,
                "connection": copy.deepcopy(self.connection),
                "updatedAt": utc_now(),
                "feeds": feeds,
                "catalog": catalog,
                "drivers": timing_rows(feeds),
            }
