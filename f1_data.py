"""Acceso, normalización y caché de datos históricos de OpenF1."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent
API_ROOT = "https://api.openf1.org/v1"
USER_AGENT = "ApexF1/1.1 (proyecto web independiente para aficionados)"


class DataSourceError(RuntimeError):
    """OpenF1 no está disponible y no existe una copia local."""


def validate_year(value: str | int) -> int:
    try:
        year = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("La temporada debe ser un año válido.") from exc
    current_year = datetime.now(timezone.utc).year
    if not 2023 <= year <= current_year + 1:
        raise ValueError(f"OpenF1 ofrece datos entre 2023 y {current_year + 1}.")
    return year


def validate_round(value: str | int) -> int:
    try:
        round_number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("La ronda debe ser un número válido.") from exc
    if not 1 <= round_number <= 99:
        raise ValueError("La ronda debe estar entre 1 y 99.")
    return round_number


def _slug(value: str) -> str:
    return value.lower().replace("&", "and").replace(".", "").replace("-", " ").replace("_", " ").strip().replace(" ", "_")


def _constructor_id(name: str) -> str:
    aliases = {
        "red_bull_racing": "red_bull",
        "rb_f1_team": "rb",
        "visa_cash_app_rb": "rb",
        "racing_bulls": "rb",
        "kick_sauber": "sauber",
        "stake_f1_team_kick_sauber": "sauber",
        "haas_f1_team": "haas",
    }
    slug = _slug(name)
    return aliases.get(slug, slug)


def _driver_id(driver: dict[str, Any]) -> str:
    return _slug(driver.get("last_name") or driver.get("full_name") or "piloto")


def _number(value: Any) -> str:
    if value is None:
        return "0"
    number = float(value)
    return str(int(number)) if number.is_integer() else str(number)


def _race_time(seconds: Any) -> str | None:
    if not isinstance(seconds, (int, float)):
        return None
    hours = int(seconds // 3600)
    minutes = int(seconds % 3600 // 60)
    remainder = seconds % 60
    return f"{hours}:{minutes:02d}:{remainder:06.3f}" if hours else f"{minutes}:{remainder:06.3f}"


def _lap_time(seconds: Any) -> str:
    return _race_time(seconds) or "—"


def _session_date(value: str) -> tuple[str, str]:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    return parsed.date().isoformat(), parsed.strftime("%H:%M:%SZ")


class F1Data:
    """Cliente de OpenF1 con límite de peticiones, caché y snapshots."""

    def __init__(
        self,
        cache_dir: Path | None = None,
        snapshot_dir: Path | None = None,
        fetcher: Callable[[str], list[dict[str, Any]]] | None = None,
        cache_ttl: int = 900,
    ) -> None:
        self.cache_dir = cache_dir or ROOT / ".cache"
        self.snapshot_dir = snapshot_dir or ROOT / "data"
        self.fetcher = fetcher
        self.cache_ttl = cache_ttl
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._rate_lock = threading.Lock()
        self._last_request = 0.0

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def _download(self, path: str) -> list[dict[str, Any]]:
        if self.fetcher:
            payload = self.fetcher(path)
        else:
            payload = self._download_with_limits(path)
        if isinstance(payload, dict) and "No results found" in str(payload.get("detail", "")):
            return []
        if not isinstance(payload, list):
            detail = payload.get("detail") if isinstance(payload, dict) else None
            raise DataSourceError(detail or "OpenF1 devolvió una respuesta inesperada.")
        return payload

    def _download_with_limits(self, path: str) -> Any:
        for attempt in range(3):
            # La capa gratuita admite 3 peticiones por segundo. Espaciar las
            # solicitudes evita ráfagas incluso cuando se resuelven en paralelo.
            with self._rate_lock:
                wait = 0.36 - (time.monotonic() - self._last_request)
                if wait > 0:
                    time.sleep(wait)
                self._last_request = time.monotonic()
            request = urllib.request.Request(
                f"{API_ROOT}{path}",
                headers={"Accept": "application/json", "User-Agent": USER_AGENT},
            )
            try:
                with urllib.request.urlopen(request, timeout=25) as response:
                    return json.load(response)
            except urllib.error.HTTPError as exc:
                # OpenF1 utiliza 404 también cuando un endpoint no tiene datos.
                if exc.code == 404:
                    return []
                if exc.code == 429 and attempt < 2:
                    time.sleep(1.1 * (attempt + 1))
                    continue
                raise DataSourceError("OpenF1 ha limitado temporalmente las peticiones.") from exc
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                raise DataSourceError("No se pudo conectar con OpenF1.") from exc
        raise DataSourceError("No se pudo conectar con OpenF1.")

    def _cache_path(self, key: str) -> Path:
        digest = hashlib.sha256(f"openf1:{key}".encode("utf-8")).hexdigest()
        return self.cache_dir / f"{digest}.json"

    def _read_cache(self, key: str) -> dict[str, Any] | None:
        try:
            with self._cache_path(key).open(encoding="utf-8") as handle:
                cached = json.load(handle)
            if not isinstance(cached, dict) or "payload" not in cached:
                return None
            cached["fetchedAt"] = datetime.fromisoformat(cached["fetchedAt"])
            return cached
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            return None

    def _write_cache(self, key: str, payload: Any, fetched_at: datetime) -> None:
        path = self._cache_path(key)
        serializable = {"fetchedAt": fetched_at.isoformat(), "payload": payload}
        temporary_name = None
        try:
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=self.cache_dir, delete=False) as handle:
                json.dump(serializable, handle, ensure_ascii=False)
                temporary_name = handle.name
            os.replace(temporary_name, path)
        except OSError:
            if temporary_name:
                try:
                    os.unlink(temporary_name)
                except OSError:
                    pass

    def _resource(self, path: str) -> tuple[list[dict[str, Any]], datetime, bool]:
        cached = self._read_cache(path)
        if cached:
            age = (self._now() - cached["fetchedAt"]).total_seconds()
            if 0 <= age < self.cache_ttl:
                return cached["payload"], cached["fetchedAt"], False
        try:
            payload = self._download(path)
            fetched_at = self._now()
            self._write_cache(path, payload, fetched_at)
            return payload, fetched_at, False
        except DataSourceError:
            if cached:
                return cached["payload"], cached["fetchedAt"], True
            raise

    def _snapshot(self, name: str) -> dict[str, Any]:
        try:
            with (self.snapshot_dir / name).open(encoding="utf-8") as handle:
                snapshot = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            raise DataSourceError("Los datos no están disponibles. Revisa la conexión e inténtalo de nuevo.") from exc
        snapshot["stale"] = True
        snapshot["snapshot"] = True
        snapshot["source"] = "OpenF1"
        return snapshot

    @staticmethod
    def _metadata(resources: list[tuple[Any, datetime, bool]]) -> dict[str, Any]:
        return {
            "source": "OpenF1",
            "fetchedAt": max(item[1] for item in resources).isoformat(),
            "stale": any(item[2] for item in resources),
            "snapshot": False,
        }

    @staticmethod
    def _normalize_driver(raw: dict[str, Any]) -> dict[str, Any]:
        return {
            "driverId": _driver_id(raw),
            "permanentNumber": str(raw.get("driver_number", "")),
            "code": raw.get("name_acronym") or "—",
            "givenName": raw.get("first_name") or raw.get("full_name") or "Piloto",
            "familyName": raw.get("last_name") or "",
            "nationality": raw.get("country_code") or "",
        }

    @staticmethod
    def _normalize_team(name: str, colour: str | None = None) -> dict[str, Any]:
        return {"constructorId": _constructor_id(name), "name": name, "nationality": "", "colour": colour or ""}

    def _calendar(self, year: int) -> tuple[dict[str, Any], list[tuple[Any, datetime, bool]]]:
        paths = [f"/meetings?year={year}", f"/sessions?year={year}"]
        with ThreadPoolExecutor(max_workers=2) as executor:
            resources = list(executor.map(self._resource, paths))
        meetings = {item["meeting_key"]: item for item in resources[0][0]}
        all_sessions = resources[1][0]
        by_meeting: dict[int, list[dict[str, Any]]] = {}
        for session in all_sessions:
            by_meeting.setdefault(session["meeting_key"], []).append(session)

        race_sessions = [item for item in all_sessions if item.get("session_name") == "Race" and not item.get("is_cancelled")]
        race_sessions.sort(key=lambda item: item["date_start"])
        races = []
        for index, race_session in enumerate(race_sessions, start=1):
            meeting = meetings.get(race_session["meeting_key"], {})
            if meeting.get("is_cancelled"):
                continue
            date, time_utc = _session_date(race_session["date_start"])
            race = {
                "season": str(year),
                "round": str(len(races) + 1),
                "raceName": meeting.get("meeting_name") or f"Gran Premio {index}",
                "Circuit": {
                    "circuitId": str(race_session.get("circuit_key", "")),
                    "circuitName": race_session.get("circuit_short_name") or meeting.get("circuit_short_name") or "Circuito",
                    "Location": {
                        "locality": race_session.get("location") or meeting.get("location") or "",
                        "country": race_session.get("country_name") or meeting.get("country_name") or "",
                    },
                },
                "date": date,
                "time": time_utc,
                "sessionKey": race_session["session_key"],
                "sessionEnd": race_session["date_end"],
                "meetingKey": race_session["meeting_key"],
            }
            session_names = {
                "Practice 1": "FirstPractice",
                "Practice 2": "SecondPractice",
                "Practice 3": "ThirdPractice",
                "Qualifying": "Qualifying",
                "Sprint Qualifying": "SprintQualifying",
                "Sprint Shootout": "SprintQualifying",
                "Sprint": "Sprint",
            }
            for session in by_meeting.get(race_session["meeting_key"], []):
                key = session_names.get(session.get("session_name"))
                if not key:
                    continue
                session_date, session_time = _session_date(session["date_start"])
                race[key] = {"date": session_date, "time": session_time, "sessionKey": session["session_key"]}
            races.append(race)
        calendar = {"races": races, "sessions": all_sessions}
        return calendar, resources

    @staticmethod
    def _latest_race(races: list[dict[str, Any]]) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc) - timedelta(minutes=30)
        completed = [race for race in races if datetime.fromisoformat(race["sessionEnd"]) < now]
        return completed[-1] if completed else None

    def get_season(self, year: str | int) -> dict[str, Any]:
        season = validate_year(year)
        try:
            calendar, resources = self._calendar(season)
            races = calendar["races"]
            sessions = calendar["sessions"]
            latest = self._latest_race(races)
            if not latest:
                return {
                    "season": str(season), "races": races, "driverStandings": [],
                    "constructorStandings": [], "standingsRound": "0", **self._metadata(resources),
                }

            # Si los resultados oficiales aún no se han publicado, se consulta
            # la carrera anterior en lugar de mostrar una clasificación vacía.
            candidates = [race for race in races if int(race["round"]) <= int(latest["round"])]
            championship = None
            for race in reversed(candidates):
                paths = [
                    f"/championship_drivers?session_key={race['sessionKey']}",
                    f"/championship_teams?session_key={race['sessionKey']}",
                ]
                with ThreadPoolExecutor(max_workers=2) as executor:
                    champ_resources = list(executor.map(self._resource, paths))
                resources.extend(champ_resources)
                if champ_resources[0][0] or champ_resources[1][0]:
                    championship = (race, champ_resources[0][0], champ_resources[1][0])
                    break
            if not championship:
                return {
                    "season": str(season), "races": races, "driverStandings": [],
                    "constructorStandings": [], "standingsRound": "0", **self._metadata(resources),
                }

            standing_race, raw_drivers, raw_teams = championship
            with ThreadPoolExecutor(max_workers=2) as executor:
                extra_resources = list(executor.map(self._resource, ["/session_result?position=1", "/drivers"]))
            resources.extend(extra_resources)
            winners, all_driver_records = extra_resources[0][0], extra_resources[1][0]
            season_session_keys = {session["session_key"] for session in sessions}
            session_order = {session["session_key"]: session["date_start"] for session in sessions}
            records = [item for item in all_driver_records if item.get("session_key") in season_session_keys]
            records.sort(key=lambda item: session_order.get(item["session_key"], ""))
            directory = {item["driver_number"]: item for item in records}
            latest_records = [item for item in records if item.get("session_key") == standing_race["sessionKey"]]
            latest_directory = {item["driver_number"]: item for item in latest_records} or directory
            race_keys = {race["sessionKey"] for race in races}
            race_winners = [item for item in winners if item.get("session_key") in race_keys and item.get("position") == 1]
            wins = Counter(item["driver_number"] for item in race_winners)
            record_by_session = {(item["session_key"], item["driver_number"]): item for item in records}
            team_wins = Counter()
            for winner in race_winners:
                raw = record_by_session.get((winner["session_key"], winner["driver_number"]))
                if raw:
                    team_wins[raw.get("team_name", "Equipo")] += 1

            driver_standings = []
            for item in sorted(raw_drivers, key=lambda entry: entry.get("position_current") or 999):
                raw_driver = directory.get(item["driver_number"], {"driver_number": item["driver_number"], "full_name": f"Piloto {item['driver_number']}"})
                team_name = raw_driver.get("team_name", "Equipo")
                driver_standings.append({
                    "position": str(item.get("position_current") or "—"),
                    "positionText": str(item.get("position_current") or "—"),
                    "points": _number(item.get("points_current")),
                    "wins": str(wins[item["driver_number"]]),
                    "Driver": self._normalize_driver(raw_driver),
                    "Constructors": [self._normalize_team(team_name, raw_driver.get("team_colour"))],
                })

            constructor_standings = []
            for item in sorted(raw_teams, key=lambda entry: entry.get("position_current") or 999):
                team_name = item.get("team_name", "Equipo")
                team_drivers = [raw for raw in latest_directory.values() if raw.get("team_name") == team_name]
                colour = team_drivers[0].get("team_colour") if team_drivers else None
                team = self._normalize_team(team_name, colour)
                team["drivers"] = " · ".join(raw.get("name_acronym", "—") for raw in team_drivers) or "—"
                constructor_standings.append({
                    "position": str(item.get("position_current") or "—"),
                    "positionText": str(item.get("position_current") or "—"),
                    "points": _number(item.get("points_current")),
                    "wins": str(team_wins[team_name]),
                    "Constructor": team,
                })

            return {
                "season": str(season), "races": races,
                "driverStandings": driver_standings,
                "constructorStandings": constructor_standings,
                "standingsRound": str(standing_race["round"]),
                **self._metadata(resources),
            }
        except (DataSourceError, KeyError, TypeError, ValueError):
            return self._snapshot(f"season-{season}.json")

    def get_race(self, year: str | int, round_number: str | int) -> dict[str, Any]:
        season = validate_year(year)
        race_round = validate_round(round_number)
        try:
            calendar, resources = self._calendar(season)
            race = next((item for item in calendar["races"] if int(item["round"]) == race_round), None)
            if not race:
                raise DataSourceError("No existe ese Gran Premio.")
            race_start = datetime.fromisoformat(f"{race['date']}T{race['time'].replace('Z', '+00:00')}")
            race_end = datetime.fromisoformat(race["sessionEnd"])
            if race_start - timedelta(minutes=30) <= self._now() <= race_end + timedelta(minutes=30):
                return {
                    "season": str(season), "round": str(race_round), "race": race,
                    "results": [], "qualifying": [], "analysis": {},
                    **self._metadata(resources),
                }
            race_key = race["sessionKey"]
            qualifying_key = race.get("Qualifying", {}).get("sessionKey")
            available_sessions = [
                session for session in calendar["sessions"]
                if session.get("meeting_key") == race["meetingKey"]
                and datetime.fromisoformat(session["date_start"]) <= self._now()
            ]
            driver_session = available_sessions[-1] if available_sessions else {"session_key": race_key}
            paths = [
                f"/session_result?session_key={race_key}",
                f"/starting_grid?session_key={race_key}",
                f"/drivers?session_key={driver_session['session_key']}",
            ]
            if qualifying_key:
                paths.append(f"/session_result?session_key={qualifying_key}")
            race_has_ended = datetime.fromisoformat(race["sessionEnd"]) < self._now() - timedelta(minutes=30)
            if race_has_ended:
                paths.extend([
                    f"/laps?session_key={race_key}", f"/pit?session_key={race_key}",
                    f"/stints?session_key={race_key}", f"/race_control?session_key={race_key}",
                    f"/position?session_key={race_key}",
                ])
            with ThreadPoolExecutor(max_workers=3) as executor:
                detail_resources = list(executor.map(self._resource, paths))
            resources.extend(detail_resources)
            payloads = {path: resource[0] for path, resource in zip(paths, detail_resources)}
            raw_results = payloads[paths[0]]
            raw_grid = payloads[paths[1]]
            raw_drivers = payloads[paths[2]]
            raw_qualifying = payloads.get(f"/session_result?session_key={qualifying_key}", []) if qualifying_key else []
            directory = {item["driver_number"]: item for item in raw_drivers}
            grid = {item["driver_number"]: item.get("position") for item in raw_grid}
            # Algunas sesiones no tienen starting_grid. La primera posición de
            # la carrera es el respaldo documentado por OpenF1 para la parrilla.
            positions = sorted(payloads.get(f"/position?session_key={race_key}", []), key=lambda item: item.get("date", ""))
            for position in positions:
                if position.get("driver_number") not in grid and position.get("position") is not None:
                    grid[position["driver_number"]] = position["position"]
            laps = payloads.get(f"/laps?session_key={race_key}", [])
            valid_laps = [item for item in laps if isinstance(item.get("lap_duration"), (int, float)) and item["lap_duration"] > 0]
            fastest = min(valid_laps, key=lambda item: item["lap_duration"]) if valid_laps else None

            results = []
            for item in sorted(raw_results, key=lambda entry: entry.get("position") or 999):
                raw_driver = directory.get(item["driver_number"], {"driver_number": item["driver_number"], "full_name": f"Piloto {item['driver_number']}"})
                gap = item.get("gap_to_leader")
                status = "Descalificado" if item.get("dsq") else "No tomó la salida" if item.get("dns") else "No terminó" if item.get("dnf") else "Finished"
                time_value = _race_time(item.get("duration")) if item.get("position") == 1 else f"+{float(gap):.3f}" if isinstance(gap, (int, float)) else str(gap) if gap else None
                result = {
                    "number": str(item["driver_number"]), "position": str(item.get("position") or "—"),
                    "positionText": str(item.get("position") or "—"), "points": _number(item.get("points")),
                    "Driver": self._normalize_driver(raw_driver),
                    "Constructor": self._normalize_team(raw_driver.get("team_name", "Equipo"), raw_driver.get("team_colour")),
                    "grid": str(grid.get(item["driver_number"]) or 0), "laps": str(item.get("number_of_laps") or 0),
                    "status": status, "Time": {"time": time_value} if time_value else {},
                }
                if fastest and fastest.get("driver_number") == item["driver_number"]:
                    result["FastestLap"] = {"rank": "1", "lap": str(fastest.get("lap_number", "—")), "Time": {"time": _lap_time(fastest["lap_duration"])}}
                results.append(result)

            qualifying = []
            for item in sorted(raw_qualifying, key=lambda entry: entry.get("position") or 999):
                raw_driver = directory.get(item["driver_number"], {"driver_number": item["driver_number"], "full_name": f"Piloto {item['driver_number']}"})
                durations = item.get("duration") if isinstance(item.get("duration"), list) else []
                qualifying.append({
                    "position": str(item.get("position") or "—"), "Driver": self._normalize_driver(raw_driver),
                    "Constructor": self._normalize_team(raw_driver.get("team_name", "Equipo"), raw_driver.get("team_colour")),
                    "Q1": _lap_time(durations[0]) if len(durations) > 0 and durations[0] is not None else "—",
                    "Q2": _lap_time(durations[1]) if len(durations) > 1 and durations[1] is not None else "—",
                    "Q3": _lap_time(durations[2]) if len(durations) > 2 and durations[2] is not None else "—",
                })

            pits = payloads.get(f"/pit?session_key={race_key}", [])
            timed_pits = [item for item in pits if isinstance(item.get("stop_duration"), (int, float))]
            pit_metric = "stop_duration" if timed_pits else "lane_duration"
            if not timed_pits:
                timed_pits = [item for item in pits if isinstance(item.get("lane_duration"), (int, float))]
            fastest_pit = min(timed_pits, key=lambda item: item[pit_metric]) if timed_pits else None
            control = payloads.get(f"/race_control?session_key={race_key}", [])
            neutralizations = sum(1 for item in control if item.get("category") == "SafetyCar" and "DEPLOYED" in str(item.get("message", "")).upper())
            stints = payloads.get(f"/stints?session_key={race_key}", [])
            winner_number = raw_results and next((item["driver_number"] for item in raw_results if item.get("position") == 1), None)
            winner_stints = sorted((item for item in stints if item.get("driver_number") == winner_number), key=lambda item: item.get("stint_number") or 0)
            compounds = list(dict.fromkeys(item.get("compound") for item in winner_stints if item.get("compound") and item.get("compound") != "UNKNOWN"))
            analysis = {
                "fastestPit": {"driverNumber": fastest_pit["driver_number"], "duration": fastest_pit[pit_metric], "lap": fastest_pit.get("lap_number"), "metric": pit_metric} if fastest_pit else None,
                "neutralizations": neutralizations,
                "winnerCompounds": compounds,
            }
            return {
                "season": str(season), "round": str(race_round), "race": race,
                "results": results, "qualifying": qualifying, "analysis": analysis,
                **self._metadata(resources),
            }
        except (DataSourceError, KeyError, TypeError, ValueError, StopIteration):
            return self._snapshot(f"race-{season}-{race_round}.json")
