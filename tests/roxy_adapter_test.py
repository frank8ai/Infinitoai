import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bridge.roxy_adapter import RoxyAdapter


class FakeRoxyAdapter(RoxyAdapter):
    def __init__(self, *args, responses=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.responses = list(responses or [])
        self.seen_tokens = []

    def _request(self, method, path, payload=None, timeout=30):
        self.seen_tokens.append(self.api_token)
        if not self.responses:
            raise AssertionError("No fake Roxy response configured")
        return self.responses.pop(0)


class RoxyAdapterTest(unittest.TestCase):
    def test_create_profile_retries_expired_token_with_local_api_key(self):
        with tempfile.TemporaryDirectory() as home:
            config_path = Path(home) / ".roxybrowser" / "config.json"
            config_path.parent.mkdir()
            config_path.write_text(json.dumps({"apiKey": "local-key"}), encoding="utf-8")

            adapter = FakeRoxyAdapter(
                api_base_url="http://127.0.0.1:50000",
                api_token="expired-token",
                workspace_id="96621",
                responses=[
                    {"code": 101, "msg": "token 验证失败", "data": None},
                    {"code": 0, "msg": "ok", "data": {"dirId": "dir-1"}},
                ],
            )

            with patch("os.path.expanduser", return_value=home):
                result = adapter.create_profile()

            self.assertEqual(result["dir_id"], "dir-1")
            self.assertEqual(adapter.seen_tokens, ["expired-token", "local-key"])

    def test_blank_token_uses_local_api_key(self):
        with tempfile.TemporaryDirectory() as home:
            config_path = Path(home) / ".roxybrowser" / "config.json"
            config_path.parent.mkdir()
            config_path.write_text(json.dumps({"apiKey": "local-key"}), encoding="utf-8")

            with patch("os.path.expanduser", return_value=home):
                adapter = FakeRoxyAdapter(
                    api_base_url="http://127.0.0.1:50000",
                    api_token="",
                    workspace_id="96621",
                    responses=[
                        {"code": 0, "msg": "ok", "data": {"dirId": "dir-1"}},
                    ],
                )
                result = adapter.create_profile()

            self.assertEqual(result["dir_id"], "dir-1")
            self.assertEqual(adapter.seen_tokens, ["local-key"])

    def test_create_profile_retries_stale_workspace_with_latest_local_workspace(self):
        with tempfile.TemporaryDirectory() as appdata:
            log_dir = Path(appdata) / "RoxyBrowser" / "logs"
            log_dir.mkdir(parents=True)
            (log_dir / "app-updater.log").write_text(
                "workspaceId: '91246'\nworkspaceId: '96621'\n",
                encoding="utf-8",
            )
            adapter = FakeRoxyAdapter(
                api_base_url="http://127.0.0.1:50000",
                api_token="local-key",
                workspace_id="91246",
                responses=[
                    {"code": 418, "msg": "用户没有该空间权限！"},
                    {"code": 0, "msg": "ok", "data": {"dirId": "dir-1"}},
                ],
            )

            with patch.dict(os.environ, {"APPDATA": appdata}):
                result = adapter.create_profile()

            self.assertEqual(result["dir_id"], "dir-1")
            self.assertEqual(adapter.workspace_id, "96621")


if __name__ == "__main__":
    unittest.main()
