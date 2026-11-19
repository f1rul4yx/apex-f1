from __future__ import annotations

import json
import math
import unittest
from pathlib import Path
from unittest.mock import patch

from live_state import LiveState
from track_map import PADDING, TrackMap

ROOT = Path(__file__).resolve().parents[1]


def position_payload(number: str = "1", entries: bool = False, **values):
    position = {"Status": "OnTrack", "X": 0, "Y": 0, **values}
    record = {"Timestamp": "2026-06-14T14:24:00Z", "Entries": {number: position}}
    return {"Entries" if entries else "Position": [record]}


class TrackMapTests(unittest.TestCase):
    def test_projection_keeps_track_and_cars_in_the_same_bounds(self):
        track = TrackMap()
        track.update(position_payload(X=0, Y=0), "now")
        track.update(position_payload(X=100, Y=100), "later")
        drivers = [{"id": "1", "code": "ARD", "name": "Alex", "colour": "D6FA4B", "position": "1", "positionNumber": 1}]
        snapshot = track.snapshot(drivers)
        self.assertTrue(snapshot["available"])
        self.assertEqual(snapshot["cars"][0]["code"], "ARD")
        xs = [point[0] for point in snapshot["outline"]]
        ys = [point[1] for point in snapshot["outline"]]
        self.assertAlmostEqual(max(xs) - min(xs), max(ys) - min(ys))
        self.assertTrue(all(PADDING <= x <= 1000 - PADDING for x in xs))
        self.assertTrue(all(PADDING <= y <= 600 - PADDING for y in ys))
        self.assertEqual(snapshot["cars"][0]["point"], snapshot["outline"][-1])

    def test_supports_entries_and_ignores_invalid_coordinates(self):
        track = TrackMap()
        track.update(position_payload(entries=True, X=20, Y=10), "now")
        track.update(position_payload(X=None, Y=10), "later")
        track.update(position_payload(X=math.nan, Y=10), "later")
        track.update(position_payload(X=True, Y=10), "later")
        self.assertEqual(track.snapshot([])["samplesReceived"], 1)

    def test_off_track_car_is_not_used_to_draw_the_circuit(self):
        track = TrackMap()
        track.update(position_payload(X=10, Y=20), "now")
        track.update(position_payload(X=20, Y=30), "later")
        track.update(position_payload(Status="OffTrack", X=100000, Y=100000), "after")
        snapshot = track.snapshot([])
        self.assertEqual(snapshot["samplesReceived"], 2)
        self.assertEqual(snapshot["cars"][0]["status"], "OffTrack")
        self.assertIsNone(snapshot["cars"][0]["point"])

    def test_paths_are_decimated_without_losing_the_start(self):
        track = TrackMap(max_points_per_driver=4)
        for index in range(10):
            track.update(position_payload(X=index, Y=index), str(index))
        snapshot = track.snapshot([])
        self.assertEqual(snapshot["samplesReceived"], 10)
        self.assertLessEqual(snapshot["retainedPoints"], 4)
        self.assertGreaterEqual(snapshot["outline"][0][0], PADDING)


class TrackStateTests(unittest.TestCase):
    def test_demo_produces_a_closed_track_with_three_named_cars(self):
        state = LiveState()
        with (ROOT / "data" / "demo-live.json").open(encoding="utf-8") as handle:
            for message in json.load(handle):
                state.apply(**message)
        track = state.track_snapshot()
        self.assertTrue(track["available"])
        self.assertGreaterEqual(len(track["outline"]), 20)
        self.assertEqual([car["code"] for car in track["cars"]], ["ARD", "VEG", "SOL"])
        self.assertEqual(track["cars"][0]["colour"], "D6FA4B")
        self.assertEqual(track["receivedAt"], "2026-06-14T14:24:24.000Z")

    def test_changing_session_clears_the_previous_map_and_feeds(self):
        state = LiveState()
        state.apply("SessionInfo", {"Key": 9999, "Name": "Race"})
        state.apply("Position.z", position_payload())
        state.apply("Position.z", position_payload(X=10, Y=10))
        self.assertTrue(state.track_snapshot()["available"])
        state.apply("SessionInfo", {"Key": 10000, "Name": "Race"})
        self.assertFalse(state.track_snapshot()["available"])
        self.assertEqual([topic["name"] for topic in state.snapshot()["catalog"]], ["SessionInfo"])

    def test_position_series_has_a_bounded_raw_history(self):
        state = LiveState()
        payload = {"Position": [{"Timestamp": str(index), "Entries": {"1": {"Status": "OnTrack", "X": index, "Y": 0}}} for index in range(4)]}
        with patch("live_state.MAX_SERIES_ENTRIES", 2):
            state.apply("Position.z", payload)
        topic = state.get_topic("Position.z")
        self.assertEqual(len(topic["data"]["Position"]), 2)
        self.assertTrue(topic["truncated"])
        self.assertEqual(topic["data"]["Position"][-1]["Timestamp"], "3")


if __name__ == "__main__":
    unittest.main()
