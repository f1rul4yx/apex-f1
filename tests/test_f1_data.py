from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from f1_data import DataSourceError, F1Data, validate_round, validate_year

YEAR = 2026


def meetings():
    return [{
        "meeting_key": 10, "meeting_name": "Test Grand Prix", "circuit_short_name": "Test Circuit",
        "location": "Test City", "country_name": "Spain", "is_cancelled": False,
    }]


def sessions(future=False):
    start, end = ("2026-12-06T13:00:00+00:00", "2026-12-06T15:00:00+00:00") if future else ("2026-03-08T13:00:00+00:00", "2026-03-08T15:00:00+00:00")
    qualifying_start = "2026-12-05T13:00:00+00:00" if future else "2026-03-07T13:00:00+00:00"
    return [
        {"meeting_key": 10, "session_key": 90, "session_name": "Qualifying", "session_type": "Qualifying", "date_start": qualifying_start, "date_end": qualifying_start, "circuit_key": 5, "circuit_short_name": "Test Circuit", "location": "Test City", "country_name": "Spain", "is_cancelled": False},
        {"meeting_key": 10, "session_key": 100, "session_name": "Race", "session_type": "Race", "date_start": start, "date_end": end, "circuit_key": 5, "circuit_short_name": "Test Circuit", "location": "Test City", "country_name": "Spain", "is_cancelled": False},
    ]


def driver(number=1, session_key=100):
    return {
        "meeting_key": 10, "session_key": session_key, "driver_number": number,
        "first_name": "Test", "last_name": "Driver", "full_name": "Test Driver",
        "name_acronym": "TST", "team_name": "Test Team", "team_colour": "AABBCC",
    }


def championship_drivers():
    return [{"driver_number": 1, "position_current": 1, "points_current": 25.0}]


def championship_teams():
    return [{"team_name": "Test Team", "position_current": 1, "points_current": 25.0}]


def race_results():
    return [{
        "position": 1, "driver_number": 1, "number_of_laps": 50, "points": 25.0,
        "dnf": False, "dns": False, "dsq": False, "duration": 5000.0, "gap_to_leader": 0,
        "session_key": 100, "meeting_key": 10,
    }]


def fake_openf1(path, future=False):
    if path == f"/meetings?year={YEAR}":
        return meetings()
    if path == f"/sessions?year={YEAR}":
        return sessions(future)
    if path == "/championship_drivers?session_key=100":
        return championship_drivers()
    if path == "/championship_teams?session_key=100":
        return championship_teams()
    if path == "/session_result?position=1":
        return race_results()
    if path == "/drivers" or path == "/drivers?session_key=100":
        return [driver()]
    if path == "/session_result?session_key=100":
        return [] if future else race_results()
    if path == "/session_result?session_key=90":
        return [] if future else [{"position": 1, "driver_number": 1, "duration": [80.1, 79.8, 79.5]}]
    if path == "/starting_grid?session_key=100":
        return [] if future else [{"position": 1, "driver_number": 1}]
    if path == "/position?session_key=100":
        return [{"driver_number": 1, "position": 1, "date": "2026-03-08T12:55:00+00:00"}]
    if path == "/laps?session_key=100":
        return [{"driver_number": 1, "lap_number": 10, "lap_duration": 79.123}]
    if path == "/pit?session_key=100":
        return [{"driver_number": 1, "lap_number": 12, "stop_duration": 2.1}]
    if path == "/stints?session_key=100":
        return [{"driver_number": 1, "stint_number": 1, "compound": "SOFT"}]
    if path == "/race_control?session_key=100":
        return [{"category": "SafetyCar", "message": "SAFETY CAR DEPLOYED"}]
    raise AssertionError(f"Ruta no prevista: {path}")


class ValidationTests(unittest.TestCase):
    def test_validates_season_and_round(self):
        self.assertEqual(validate_year("2026"), 2026)
        self.assertEqual(validate_round("8"), 8)
        with self.assertRaises(ValueError):
            validate_year("no-es-un-año")
        with self.assertRaises(ValueError):
            validate_year("2022")
        with self.assertRaises(ValueError):
            validate_round("0")


class F1DataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def service(self, fetcher, ttl=900):
        return F1Data(cache_dir=self.root / "cache", snapshot_dir=self.root / "snapshots", fetcher=fetcher, cache_ttl=ttl)

    def test_season_is_normalized_and_cached(self):
        calls = []

        def fetch(path):
            calls.append(path)
            return fake_openf1(path)

        service = self.service(fetch)
        first = service.get_season(YEAR)
        second = service.get_season(YEAR)
        self.assertEqual(first["races"][0]["raceName"], "Test Grand Prix")
        self.assertEqual(first["races"][0]["FirstPractice"] if "FirstPractice" in first["races"][0] else first["races"][0]["Qualifying"]["sessionKey"], 90)
        self.assertEqual(first["driverStandings"][0]["points"], "25")
        self.assertEqual(first["driverStandings"][0]["wins"], "1")
        self.assertEqual(first["constructorStandings"][0]["Constructor"]["colour"], "AABBCC")
        self.assertEqual(first["source"], "OpenF1")
        self.assertFalse(first["stale"])
        self.assertEqual(second, first)
        self.assertEqual(len(calls), 6)

    def test_race_results_qualifying_and_analysis(self):
        result = self.service(fake_openf1).get_race(YEAR, 1)
        self.assertEqual(result["results"][0]["points"], "25")
        self.assertEqual(result["results"][0]["FastestLap"]["Time"]["time"], "1:19.123")
        self.assertEqual(result["qualifying"][0]["Q3"], "1:19.500")
        self.assertEqual(result["analysis"]["fastestPit"]["duration"], 2.1)
        self.assertEqual(result["analysis"]["neutralizations"], 1)
        self.assertEqual(result["analysis"]["winnerCompounds"], ["SOFT"])
        self.assertEqual(result["source"], "OpenF1")

    def test_starting_grid_falls_back_to_initial_positions(self):
        def fetch(path):
            if path == "/starting_grid?session_key=100":
                return []
            return fake_openf1(path)

        result = self.service(fetch).get_race(YEAR, 1)
        self.assertEqual(result["results"][0]["grid"], "1")

    def test_future_race_returns_empty_results_without_session_details(self):
        calls = []

        def fetch(path):
            calls.append(path)
            return fake_openf1(path, future=True)

        result = self.service(fetch).get_race(YEAR, 1)
        self.assertEqual(result["results"], [])
        self.assertEqual(result["qualifying"], [])
        self.assertFalse(any("/laps?" in path for path in calls))

    def test_expired_cache_is_used_when_source_fails(self):
        should_fail = False

        def fetch(path):
            if should_fail:
                raise DataSourceError("Sin conexión")
            return fake_openf1(path)

        service = self.service(fetch, ttl=0)
        service.get_season(YEAR)
        should_fail = True
        result = service.get_season(YEAR)
        self.assertTrue(result["stale"])
        self.assertFalse(result["snapshot"])
        self.assertEqual(result["races"][0]["raceName"], "Test Grand Prix")

    def test_snapshot_is_last_resort(self):
        snapshots = self.root / "snapshots"
        snapshots.mkdir()
        snapshot = {"season": "2026", "races": [{"round": "1"}], "stale": False, "snapshot": False}
        (snapshots / "season-2026.json").write_text(json.dumps(snapshot), encoding="utf-8")

        def fetch(_path):
            raise DataSourceError("Sin conexión")

        result = self.service(fetch).get_season(YEAR)
        self.assertTrue(result["stale"])
        self.assertTrue(result["snapshot"])
        self.assertEqual(result["source"], "OpenF1")

    def test_no_results_response_is_an_empty_list(self):
        service = self.service(lambda _path: {"detail": "No results found."})
        self.assertEqual(service._download("/cualquier-ruta"), [])


if __name__ == "__main__":
    unittest.main()
