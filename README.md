# Flappy Reef — Sprint 2

A polished underwater Telegram Mini App game by Samuga Creative.

## Sprint 2 upgrades

- Animated clownfish replaces the bird
- Living underwater background with light rays and bubbles
- Distant schools of fish and animated jellyfish
- Layered parallax reef, coral, seaweed, rocks and sand
- Reef-covered stone obstacle columns with algae, starfish and coral
- Animated Samuga Creative loading screen
- Samuga Creative branding on start and result menus
- Bubble trail, score particles, crash burst and screen shake
- Coins, XP, levels and per-user local progress
- Telegram fullscreen, haptics and score sharing
- Responsive touch, click and keyboard controls

## Deploy the update

1. Extract this ZIP.
2. Open the `flappy-reef-miniapp` folder.
3. Replace the files in your existing GitHub repository with these files.
4. Commit and push. Railway will redeploy automatically.
5. Wait for Railway to show `Success`.
6. Fully close and reopen the Telegram Mini App to clear the old web view cache.

Suggested commit message:

```text
Sprint 2: underwater reef redesign and Samuga Creative branding
```

## Local test

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload
```

Open `http://127.0.0.1:8000`.

Health check: `http://127.0.0.1:8000/health`
