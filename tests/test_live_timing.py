from __future__ import annotations

import base64
import io
import json
import unittest
import zlib
from pathlib import Path

from live_state import LiveState, decode_payload, deep_merge, timing_rows
from live_timing import (
    dispatch_signalr,
    encode_websocket_frame,
    read_websocket_frame,
    signalr_messages,
)

ROOT = Path(__file__).resolve().parents[1]


class MergeTests(unittest.TestCase):
    def test_partial_delta_preserves_other_drivers_and_fields(self):
        original = {"Lines": {"1": {"Position": "1", "GapToLeader": ""}, "14": {"Position": "2"}}}
        changed = deep_merge(original, {"Lines": {"1": {"GapToLeader": "0.0"}}})
        self.assertEqual(changed["Lines"]["1"]["Position"], "1")
        self.assertEqual(changed["Lines"]["14"]["Position"], "2")
        self.assertEqual(original["Lines"]["1"]["GapToLeader"], "")

    def test_lists_are_replaced_instead_of_concatenated(self):
        self.assertEqual(deep_merge({"Entries": [1, 2]}, {"Entries": [3]}), {"Entries": [3]})


class LiveStateTests(unittest.TestCase):
    def demo_state(self):
        state = LiveState()
        with (ROOT / "data" / "demo-live.json").open(encoding="utf-8") as handle:
            for message in json.load(handle):
                state.apply(**message)
        return state

    def test_demo_feed_builds_sorted_timing_and_strategy(self):
        state = self.demo_state()
        snapshot = state.snapshot()
        self.assertEqual([row["code"] for row in snapshot["drivers"]], ["ARD", "VEG", "SOL"])
        self.assertEqual(snapshot["drivers"][0]["sectors"][0]["value"], "28.122")
        self.assertEqual(snapshot["drivers"][1]["gap"], "3.207")
        self.assertEqual(snapshot["drivers"][2]["compound"], "SOFT")
        self.assertTrue(snapshot["drivers"][2]["inPit"])
        self.assertEqual(snapshot["feeds"]["LapCount"]["CurrentLap"], 24)

    def test_compact_snapshot_does_not_send_bulk_telemetry(self):
        state = self.demo_state()
        snapshot = state.snapshot()
        self.assertNotIn("CarData.z", snapshot["feeds"])
        self.assertIn("CarData.z", [topic["name"] for topic in snapshot["catalog"]])
        self.assertEqual(len(state.get_topic("CarData.z")["data"]["Entries"]), 3)
        self.assertIsNone(state.get_topic("NoExiste"))

    def test_snapshot_is_isolated_from_internal_mutations(self):
        state = self.demo_state()
        topic = state.get_topic("DriverList")
        topic["data"]["1"]["Tla"] = "CHANGED"
        self.assertEqual(state.get_topic("DriverList")["data"]["1"]["Tla"], "ARD")


class ProtocolTests(unittest.TestCase):
    def test_raw_deflate_payload_is_decoded(self):
        data = json.dumps({"Entries": [{"Utc": "now"}]}).encode()
        compressor = zlib.compressobj(wbits=-zlib.MAX_WBITS)
        compressed = compressor.compress(data) + compressor.flush()
        encoded = base64.b64encode(compressed).decode()
        self.assertEqual(decode_payload("CarData.z", encoded)["Entries"][0]["Utc"], "now")

    def test_signalr_feed_and_snapshot_are_applied(self):
        state = LiveState()
        dispatch_signalr(state, {"type": 3, "invocationId": "1", "result": {"DriverList": {"1": {"Tla": "ARD"}}}})
        dispatch_signalr(state, {"type": 1, "target": "feed", "arguments": ["SessionStatus", {"Status": "Started"}, "2026-01-01"]})
        self.assertEqual(state.get_topic("DriverList")["data"]["1"]["Tla"], "ARD")
        self.assertEqual(state.get_topic("SessionStatus")["data"]["Status"], "Started")

    def test_separator_allows_several_json_messages_in_one_frame(self):
        messages = list(signalr_messages('{"type":6}\x1e{"type":1,"target":"feed","arguments":[]}\x1e'))
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["type"], 6)

    def test_client_websocket_frames_are_masked(self):
        frame = encode_websocket_frame("hola")
        self.assertEqual(frame[0] & 0x0F, 1)
        self.assertTrue(frame[1] & 0x80)
        opcode, fin, payload = read_websocket_frame(io.BytesIO(frame))
        self.assertEqual((opcode, fin, payload.decode()), (1, True, "hola"))

    def test_unmasked_server_frame_is_decoded(self):
        opcode, fin, payload = read_websocket_frame(io.BytesIO(b"\x81\x04hola"))
        self.assertEqual((opcode, fin, payload.decode()), (1, True, "hola"))

    def test_fragmented_websocket_message_is_reassembled(self):
        stream = io.BytesIO(b"\x01\x02ab\x80\x02cd")
        opcode, fin, payload = read_websocket_frame(stream)
        self.assertEqual((opcode, fin, payload), (1, True, b"abcd"))


if __name__ == "__main__":
    unittest.main()
