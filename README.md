# Samuga Arcade — Sprint 2

A Telegram Mini App arcade powered by Samuga Creative.

## Playable games

1. Flappy Reef — tap-to-swim coral obstacle game.
2. Bubble Burst — 30-second bubble popping challenge.
3. Reef Maze — generated puzzle mazes with swipe and arrow controls.
4. Ocean Pairs — 4x4 sea-creature memory matching game.

Coins, XP, levels and personal bests are shared across all four games and saved per Telegram user on the device.

## Railway deployment

1. Replace the contents of the existing GitHub repository with this folder's contents.
2. Commit and push.
3. Railway automatically redeploys the service.
4. Test `/health`; it should return `{\"status\":\"ok\"}`.
5. Close and reopen the Telegram Mini App to bypass Telegram's old web cache.

The existing bot and Railway URL can stay the same. No new bot is required.
