import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))

import fingerprint_bridge
from roxy_adapter import RoxyAdapterError


class FakeAdapter:
    def __init__(self):
        self.deleted = []
        self.closed = []

    def create_profile(self, proxy_url=""):
        return {"dir_id": "dir-1"}

    def open_profile(self, dir_id):
        raise RoxyAdapterError("open failed")

    def close_profile(self, dir_id):
        self.closed.append(dir_id)

    def delete_profile(self, dir_id):
        self.deleted.append(dir_id)


class FingerprintBridgeTest(unittest.TestCase):
    def test_create_run_deletes_profile_when_open_fails(self):
        adapter = FakeAdapter()

        with patch.object(fingerprint_bridge, "_build_roxy_adapter", return_value=adapter):
            with self.assertRaisesRegex(RoxyAdapterError, "open failed"):
                fingerprint_bridge._create_run({
                    "fingerprintProvider": "roxy",
                    "roxy": {
                        "apiBaseUrl": "http://127.0.0.1:50000",
                        "workspaceId": "42",
                    },
                })

        self.assertEqual(adapter.closed, ["dir-1"])
        self.assertEqual(adapter.deleted, ["dir-1"])


if __name__ == "__main__":
    unittest.main()
