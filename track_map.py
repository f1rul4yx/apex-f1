"""Mapa vectorial dinámico construido con las coordenadas de Position.z.

La fuente no ofrece un SVG del circuito. Se aprende su forma a partir de las
trayectorias y se proyecta conservando la proporción, sin mapas geográficos.
"""
from __future__ import annotations

import math
from typing import Any, Iterable

WIDTH = 1000
HEIGHT = 600
PADDING = 48


def _points(data: Any) -> Iterable[dict[str, Any]]:
    if isinstance(data, list):
        return (item for item in data if isinstance(item, dict))
    if isinstance(data, dict):
        return (item for item in data.values() if isinstance(item, dict))
    return ()


def _coordinate(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def _sample(items: list[list[float]], maximum: int = 650) -> list[list[float]]:
    if len(items) <= maximum:
        return items
    last = len(items) - 1
    return [items[round(index * last / (maximum - 1))] for index in range(maximum)]


class TrackMap:
    def __init__(self, max_points_per_driver: int = 900) -> None:
        self.max_points = max_points_per_driver
        self.reset()

    def reset(self) -> None:
        self.revision = getattr(self, "revision", -1) + 1
        self._paths: dict[str, list[list[float]]] = {}
        self._latest: dict[str, dict[str, Any]] = {}
        self.samples_received = 0
        self.received_at: str | None = None

    def update(self, payload: Any, received_at: str) -> None:
        if not isinstance(payload, dict):
            return
        # La fuente usa Position. Se admite también Entries para compatibilidad.
        records = payload.get("Position", payload.get("Entries", []))
        for record in _points(records):
            drivers = record.get("Entries", {})
            if not isinstance(drivers, dict):
                continue
            timestamp = str(record.get("Timestamp") or record.get("Utc") or received_at)
            for number, position in drivers.items():
                if not isinstance(position, dict):
                    continue
                x = _coordinate(position.get("X"))
                y = _coordinate(position.get("Y"))
                status = str(position.get("Status", "OnTrack"))
                if x is None or y is None:
                    continue
                self._latest[number] = {"x": x, "y": y, "status": status, "timestamp": timestamp}
                self.revision += 1
                self.received_at = timestamp
                if status not in {"OnTrack", "0"}:
                    continue
                path = self._paths.setdefault(number, [])
                point = [x, y]
                if path[-1:] == [point]:
                    continue
                path.append(point)
                self.samples_received += 1
                if len(path) > self.max_points:
                    # Decimar en lugar de olvidar el inicio conserva el trazado
                    # de todo el circuito durante toda la sesión.
                    self._paths[number] = path[::2]

    @staticmethod
    def _bounds(paths: Iterable[list[list[float]]]) -> tuple[float, float, float, float]:
        points = [point for path in paths for point in path]
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        return min(xs), max(xs), min(ys), max(ys)

    @staticmethod
    def _project(x: float, y: float, bounds: tuple[float, float, float, float]) -> list[float]:
        min_x, max_x, min_y, max_y = bounds
        width = max(max_x - min_x, 1.0)
        height = max(max_y - min_y, 1.0)
        scale = min((WIDTH - 2 * PADDING) / width, (HEIGHT - 2 * PADDING) / height)
        offset_x = (WIDTH - width * scale) / 2
        offset_y = (HEIGHT - height * scale) / 2
        return [
            round(offset_x + (x - min_x) * scale, 2),
            round(offset_y + (max_y - y) * scale, 2),
        ]

    def snapshot(self, drivers: list[dict[str, Any]]) -> dict[str, Any]:
        outline = max(self._paths.values(), key=len, default=[])
        available = len(outline) >= 2
        result: dict[str, Any] = {
            "available": available,
            "revision": self.revision,
            "outline": [],
            "cars": [],
            "receivedAt": self.received_at,
            "samplesReceived": self.samples_received,
            "retainedPoints": sum(len(path) for path in self._paths.values()),
            "closed": False,
            "viewBox": [WIDTH, HEIGHT],
        }
        if not available:
            return result
        # Un coche retirado o con coordenadas fuera de pista no debe cambiar
        # la escala de toda la pista ni aparecer como si siguiera en carrera.
        bounds = self._bounds(self._paths.values())
        result["outline"] = [self._project(x, y, bounds) for x, y in _sample(outline)]
        if len(outline) >= 40:
            span = math.hypot(bounds[1] - bounds[0], bounds[3] - bounds[2])
            result["closed"] = math.dist(outline[0], outline[-1]) < span * 0.06
        by_number = {row["id"]: row for row in drivers}
        cars = []
        for number, position in self._latest.items():
            driver = by_number.get(number, {})
            cars.append({
                "id": number,
                "code": driver.get("code", number),
                "name": driver.get("name", f"Coche {number}"),
                "colour": driver.get("colour", "829778"),
                "position": driver.get("position", "—"),
                "gap": driver.get("gap", ""),
                "status": position["status"],
                "timestamp": position["timestamp"],
                "point": self._project(position["x"], position["y"], bounds) if position["status"] in {"OnTrack", "0"} else None,
            })
        cars.sort(key=lambda car: (by_number.get(car["id"], {}).get("positionNumber", 999), car["id"]))
        result["cars"] = cars
        return result
