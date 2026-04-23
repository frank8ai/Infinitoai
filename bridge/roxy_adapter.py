import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class RoxyAdapterError(RuntimeError):
    pass


def _read_local_api_key() -> str:
    config_path = os.path.join(os.path.expanduser("~"), ".roxybrowser", "config.json")
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return ""
    return str(config.get("apiKey") or "").strip()


def _read_latest_local_workspace_id() -> str:
    appdata = os.environ.get("APPDATA", "")
    if not appdata:
        return ""
    logs_dir = os.path.join(appdata, "RoxyBrowser", "logs")
    try:
        log_paths = [
            os.path.join(logs_dir, name)
            for name in os.listdir(logs_dir)
            if name.endswith(".log")
        ]
    except OSError:
        return ""

    matches = []
    for path in sorted(log_paths, key=lambda item: os.path.getmtime(item)):
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
        except OSError:
            continue
        matches.extend(re.findall(r"workspaceId:\s*'([^']+)'", text))
    return str(matches[-1]).strip() if matches else ""


class RoxyAdapter:
    def __init__(self, api_base_url: str, api_token: str, workspace_id: str) -> None:
        self.api_base_url = str(api_base_url or "").strip().rstrip("/")
        self.api_token = str(api_token or "").strip() or _read_local_api_key()
        self.workspace_id = str(workspace_id or "").strip()

    def _headers(self) -> dict:
        headers = {
            "Content-Type": "application/json",
        }
        if self.api_token:
            headers["token"] = self.api_token
        return headers

    def _request(self, method: str, path: str, payload=None, timeout: int = 30) -> dict:
        url = f"{self.api_base_url}{path}"
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        request = urllib.request.Request(
            url,
            data=data,
            headers=self._headers(),
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RoxyAdapterError(f"Roxy request failed ({exc.code}): {body[:200]}") from exc
        except urllib.error.URLError as exc:
            raise RoxyAdapterError(f"Roxy request failed: {exc.reason}") from exc

        try:
            return json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise RoxyAdapterError(f"Roxy returned invalid JSON for {path}: {raw[:200]}") from exc

    def _is_token_error(self, response: dict) -> bool:
        message = str(response.get("msg") or response.get("message") or response.get("error") or "")
        return response.get("code") == 101 and "token" in message.lower() and "验证失败" in message

    def _is_workspace_permission_error(self, response: dict) -> bool:
        message = str(response.get("msg") or response.get("message") or response.get("error") or "")
        return response.get("code") == 418 and "空间权限" in message

    def _request_with_token_retry(self, method: str, path: str, payload=None, timeout: int = 30) -> dict:
        response = self._request(method, path, payload, timeout=timeout)
        if not self._is_token_error(response):
            return response

        local_api_key = _read_local_api_key()
        if not local_api_key or local_api_key == self.api_token:
            return response

        self.api_token = local_api_key
        return self._request(method, path, payload, timeout=timeout)

    def health(self) -> dict:
        return self._request_with_token_retry("GET", "/health", None, timeout=10)

    def create_profile(self, proxy_url: str = "") -> dict:
        if not self.workspace_id:
            raise RoxyAdapterError("Roxy workspace id is missing.")

        payload = {
            "workspaceId": int(self.workspace_id),
            "windowName": f"infinitoai_{int(time.time())}",
            "coreVersion": "145",
            "os": "macOS",
            "fingerInfo": {
                "randomFingerprint": True,
                "portScanProtect": False,
            },
        }

        normalized_proxy = str(proxy_url or "").strip()
        if normalized_proxy:
            parsed = urllib.parse.urlparse(normalized_proxy)
            scheme = (parsed.scheme or "http").upper()
            if scheme == "HTTPS":
                scheme = "HTTP"
            payload["proxyInfo"] = {
                "proxyMethod": "custom",
                "proxyCategory": scheme,
                "ipType": "IPV4",
                "protocol": scheme,
                "host": parsed.hostname or "",
                "port": str(parsed.port or 80),
                "proxyUserName": parsed.username or "",
                "proxyPassword": parsed.password or "",
            }
        else:
            payload["proxyInfo"] = {
                "proxyMethod": "noproxy",
            }

        response = self._request_with_token_retry("POST", "/browser/create", payload)
        if self._is_workspace_permission_error(response):
            local_workspace_id = _read_latest_local_workspace_id()
            if local_workspace_id and local_workspace_id != self.workspace_id:
                self.workspace_id = local_workspace_id
                payload["workspaceId"] = int(self.workspace_id)
                response = self._request_with_token_retry("POST", "/browser/create", payload)
        if response.get("code") != 0:
            raise RoxyAdapterError(f"Roxy create profile failed: {response}")
        data = response.get("data") or {}
        dir_id = str(data.get("dirId") or "").strip()
        if not dir_id:
            raise RoxyAdapterError(f"Roxy create profile returned no dirId: {response}")
        return {
            "dir_id": dir_id,
            "raw": response,
        }

    def open_profile(self, dir_id: str) -> dict:
        response = self._request_with_token_retry("POST", "/browser/open", {"dirId": dir_id})
        if response.get("code") != 0:
            raise RoxyAdapterError(f"Roxy open profile failed: {response}")

        data = response.get("data") or {}
        ws_endpoint = str(data.get("wsEndpoint") or data.get("ws") or "").strip()
        if not ws_endpoint:
            info = self._request_with_token_retry("GET", "/browser/connection_info", {"dirIds": [dir_id]})
            for item in info.get("data") or []:
                ws_endpoint = str(item.get("wsEndpoint") or item.get("ws") or "").strip()
                if ws_endpoint:
                    break

        if not ws_endpoint:
            raise RoxyAdapterError(f"Roxy open profile returned no websocket endpoint: {response}")

        return {
            "ws_endpoint": ws_endpoint,
            "raw": response,
        }

    def close_profile(self, dir_id: str) -> dict:
        return self._request_with_token_retry("POST", "/browser/close", {"dirId": dir_id})

    def delete_profile(self, dir_id: str) -> dict:
        if not self.workspace_id:
            raise RoxyAdapterError("Roxy workspace id is missing.")
        return self._request_with_token_retry("POST", "/browser/delete", {
            "workspaceId": int(self.workspace_id),
            "dirIds": [dir_id],
        })
