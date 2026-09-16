# Underboss Table

An original, mafia-themed real-time shedding card game for 2–6 players. It runs in a browser and includes an Electron wrapper for a downloadable Windows installer.

## What is included

- Username/password accounts with secure password hashing
- One-click Mobster Casual guest sessions with no account required
- Uploadable profile pictures (JPG, PNG, GIF, or WebP up to 1 MB)
- Live table lobby, create/join/leave flows, host controls, and reconnect-safe account sessions
- Server-authoritative turns and card validation over Socket.IO
- Five family colors and seven action cards, including the single Trade Hands and single Fuck You +10 cards
- Persistent account stats in a compact server-side data store
- Responsive browser UI and a Windows Electron installer target
- A game-selection menu plus playable Turf Wars alpha with dice movement, property ownership, tribute, fees, bankruptcy, and live turns
- Railway configuration and health check

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and replace `JWT_SECRET` with a long random string.
3. Run:

```bash
pnpm install
pnpm start
```

Open `http://localhost:3000`. Open a private window or another browser to test with a second account.

## Deploy to Railway

1. Push this folder to a new GitHub repository.
2. In Railway, choose **New Project → Deploy from GitHub repo** and select the repository.
3. Add these variables:

   - `JWT_SECRET`: a long random secret
   - `DATABASE_PATH`: `/data/underboss.json`

4. Add a Railway volume mounted at `/data` so accounts and stats survive redeploys.
5. Generate a public domain in Railway. The included `railway.toml` supplies the start command and `/health` check.

WebSocket traffic works through Railway automatically. Active game tables live in server memory, so players should finish a deal before a redeploy. Account profiles and records persist on the mounted volume.

## Build the Windows installer

Run this on Windows:

```bash
pnpm install
pnpm run dist:win
```

The installer will be created in `release/Underboss-Table-Setup-1.0.0.exe`. On first launch, paste your public Railway address into the connection screen. The app remembers it. Browser and desktop players then use the same accounts and tables. You can also replace the placeholder in `desktop/server.json` before building to preconfigure the installer.

For a one-off local desktop test, run the server, then in another terminal:

```bash
$env:UNDERBOSS_SERVER_URL="http://localhost:3000"
pnpm run desktop
```

## Game rules

Play a card matching the current family color or rank. If you cannot—or prefer not to—draw one and pass. Empty your hand first to win.

- **Lay Low** skips the next player.
- **Double Cross** reverses play order.
- **Shakedown** makes the next player draw two and lose their turn.
- **The Don** changes the family color.
- **Hit Job** changes the color and makes the next player draw four.
- **Trade Hands** appears once per deck, changes the color, and swaps your remaining hand with a player you choose.
- **Fuck You +10** appears once per deck and makes the next player draw ten.

This project is an original game and does not use UNO branding, names, card art, or assets.
