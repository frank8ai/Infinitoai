import json
import time
import urllib.error
import urllib.parse
import urllib.request


class RoxyAdapterError(RuntimeError):
    pass


class RoxyAdapter:
    def __init__(self, api_base_url: str, api_token: str, workspace_id: str) -> None:
        self.api_base_url = str(api_base_url or "").strip().rstrip("/")
        self.api_token = str(api_token or "").strip()
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

    def health(self) -> dict:
        return self._request("GET", "/health", None, timeout=10)

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

        response = self._request("POST", "/browser/create", payload)
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
        response = self._request("POST", "/browser/open", {"dirId": dir_id})
        if response.get("code") != 0:
            raise RoxyAdapterError(f"Roxy open profile failed: {response}")

        data = response.get("data") or {}
        ws_endpoint = str(data.get("wsEndpoint") or data.get("ws") or "").strip()
        if not ws_endpoint:
            info = self._request("GET", "/browser/connection_info", {"dirIds": [dir_id]})
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
        return self._request("POST", "/browser/close", {"dirId": dir_id})

    def delete_profile(self, dir_id: str) -> dict:
        if not self.workspace_id:
            raise RoxyAdapterError("Roxy workspace id is missing.")
        return self._request("POST", "/browser/delete", {
            "workspaceId": int(self.workspace_id),
            "dirIds": [dir_id],
        })
