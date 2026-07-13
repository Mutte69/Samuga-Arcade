"""Configure a Telegram bot menu button to open Samuga Arcade.

Usage:
    TELEGRAM_BOT_TOKEN=123:ABC WEBAPP_URL=https://your-app.up.railway.app python bot_setup.py
"""

import json
import os
import urllib.error
import urllib.request

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
WEBAPP_URL = os.environ.get("WEBAPP_URL", "").strip().rstrip("/")

if not TOKEN or not WEBAPP_URL:
    raise SystemExit("Missing TELEGRAM_BOT_TOKEN or WEBAPP_URL environment variable.")
if not WEBAPP_URL.startswith("https://"):
    raise SystemExit("WEBAPP_URL must use HTTPS.")

endpoint = f"https://api.telegram.org/bot{TOKEN}/setChatMenuButton"
payload = {
    "menu_button": {
        "type": "web_app",
        "text": "Play Samuga Arcade",
        "web_app": {"url": WEBAPP_URL},
    }
}
request = urllib.request.Request(
    endpoint,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.loads(response.read().decode("utf-8"))
except urllib.error.HTTPError as exc:
    detail = exc.read().decode("utf-8", errors="replace")
    raise SystemExit(f"Telegram returned HTTP {exc.code}: {detail}") from exc
except urllib.error.URLError as exc:
    raise SystemExit(f"Could not reach Telegram: {exc.reason}") from exc

if not result.get("ok"):
    raise SystemExit(f"Telegram setup failed: {result}")

print("Success: the bot menu button now opens Samuga Arcade.")
