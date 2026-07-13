# Flappy Reef — Telegram Mini App

A mobile-first Flappy Bird-style game made for Telegram Mini Apps.

## Included in Sprint 1

- Tap, click, Space, Arrow Up and W controls
- Responsive HTML5 Canvas gameplay
- Increasing obstacle speed
- Score and device-local best score
- Telegram haptic feedback
- Telegram fullscreen/expanded mode where supported
- Share-score button
- Sound toggle
- Railway-ready FastAPI server
- Bot menu-button setup script

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn server:app --reload
```

Open `http://127.0.0.1:8000`.

## Deploy to Railway

1. Create a new GitHub repository and upload this project.
2. In Railway, choose **New Project → Deploy from GitHub Repo**.
3. Select the repository and deploy.
4. In Railway networking, generate a public domain.
5. Confirm `https://YOUR-DOMAIN/health` returns `{"status":"ok"}`.

## Connect it to Telegram

### Easiest method: BotFather

1. Open `@BotFather`.
2. Use `/mybots` and select your bot.
3. Choose **Bot Settings → Menu Button → Configure menu button**.
4. Send the Railway HTTPS URL.
5. Set the button text to `Play Flappy Reef`.

### Script method

After deploying, run:

```bash
export TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN"
export WEBAPP_URL="https://YOUR-DOMAIN.up.railway.app"
python bot_setup.py
```

Never commit the bot token to GitHub.

## Main game settings

Edit `static/game.js`:

- Gravity: search for `const gravity`
- Jump strength: search for `bird.velocityY = -`
- Starting speed: search for `worldSpeed`
- Pipe gap: search for `const gap`
- Difficulty increase: search for `score * 4.6`

## Next sprint ideas

- Secure online leaderboard
- Telegram profile photos and names
- Daily challenge seed
- Revive once per game
- Coins and unlockable fish skins
- Friend challenges through bot deep links
