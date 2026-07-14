# Samuga Arcade — Sprint 3

A Telegram Mini App arcade powered by Samuga Creative.

## Playable games

1. Flappy Reef — tap-to-swim coral obstacle game.
2. Bubble Burst — 30-second bubble popping challenge.
3. Reef Maze — generated puzzle mazes with swipe and arrow controls.
4. Ocean Pairs — fixed responsive 4x4 memory game with vector sea-creature artwork.
5. Reef Hockey — local two-player air-hockey game on one phone, with multitouch paddles and first-to-five scoring.
6. Coral Clash — local two-player fighting game with movement, strikes, health bars and knockouts.

Coins, XP, levels and personal bests are shared across all games and saved per Telegram user on the device.

## Ocean Pairs fix

The board no longer relies on emoji rendering inside the canvas. All eight sea-creature symbols are now drawn as canvas vector artwork, making the game reliable across Telegram WebViews. The board also scales to short and narrow phone screens.

## Multiplayer scope

Reef Hockey and Coral Clash are same-device local multiplayer games. Two people play simultaneously on one phone using multitouch controls.

Bluetooth phone-to-phone multiplayer is not included because browser Bluetooth support is not reliable across Telegram's Android and iOS WebViews. A later online multiplayer sprint should use room codes plus a WebSocket server, which works across both platforms.

## Railway deployment

1. Replace the contents of the existing GitHub repository with this folder's contents.
2. Commit and push.
3. Railway automatically redeploys the service.
4. Test `/health`; it should return `{"status":"ok"}`.
5. Fully close and reopen the Telegram Mini App to bypass old cached assets.

The existing bot and Railway URL stay the same. No new bot is required.


## Sprint 4 additions
- Treasure Catch: drag-to-catch arcade challenge
- Shark Escape: three-lane survival game
- Sea Snake: tap-to-turn classic snake game
