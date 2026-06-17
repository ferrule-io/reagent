# Homebrew Install — reagent-bridge

Install and run the reagent bridge as a persistent background service using Homebrew on macOS.

## Install

```sh
brew tap ferrule-io/reagent https://github.com/ferrule-io/reagent
brew install reagent-bridge
```

This builds the bridge from source (requires Homebrew's Node dependency; no separate Node install needed).

## Start as a background service

```sh
brew services start reagent-bridge
```

The bridge starts immediately and is configured to restart automatically on login (via launchd). It listens on port 4319.

Check status:

```sh
brew services info reagent-bridge
```

View logs:

```sh
tail -f $(brew --prefix)/var/log/reagent-bridge.log
```

## Stop / restart

```sh
brew services stop reagent-bridge
brew services restart reagent-bridge
```

## Run once (foreground, no launchd)

```sh
reagent-bridge
```

## Upgrade

When a new version is released:

```sh
brew update
brew upgrade reagent-bridge
brew services restart reagent-bridge
```

## Phone access over Tailscale

After the bridge is running:

```sh
tailscale serve --bg 4319
```

Open `https://<machine>.<tailnet>.ts.net/` on your phone to reach the bridge PWA.

## Uninstall

```sh
brew services stop reagent-bridge
brew uninstall reagent-bridge
brew untap ferrule-io/reagent
```

## Troubleshooting

**Bridge doesn't start**: check logs at `$(brew --prefix)/var/log/reagent-bridge.log`.

**Port 4319 already in use**: `lsof -i :4319` to identify the conflicting process.

**Formula not found after tap**: run `brew update` to refresh the tap index.
