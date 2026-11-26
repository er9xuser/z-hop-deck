# Privacy

**Z-Hop Deck collects no data about you. There is no telemetry, no analytics, no tracking, no crash reporting and no "phone home".** It has no accounts and no online service behind it – everything runs on your own server and stays there.

## What the app connects to

The server only talks to addresses **you** enter yourself:

| Connection | When |
|---|---|
| Your printers (Moonraker, OctoPrint, PrusaLink) | if you add a printer with a network connection – for status, uploads and the automatic print log |
| Your Spoolman | if you set a Spoolman address |

Nothing else. The app does not check for updates, does not download anything at runtime and does not contact GitHub or any other service.

Your browser only loads the app from your own server. Fonts, icons and the 3D viewer (three.js) are part of the app; no CDN, web fonts or third-party scripts are used. Links you click yourself – a model's source URL, *Open Spoolman*, *Open Mainsail* – open those pages like any other link.

*Open in slicer* hands your slicer a download link to your own server. The link is signed and expires after one hour.

## What is stored, and where

Everything is stored on your server, in the folders you mount:

| Where | What |
|---|---|
| your model folder (`LIBRARY_PATH`) | your files – uploads are written here |
| `data/zhopdeck.db` | the library index, tags, collections, notes, ratings, print log, spools, printers, settings, printer API keys |
| `data/thumbs/`, `data/trash/`, `data/background.jpg` | previews, deleted files, your background image |
| `data/secret.key` | the key that signs login sessions and download links |
| `.env` | your passwords and addresses |
| Docker log | the usual access log (time, IP address, requested page) – kept by Docker on your server, only for troubleshooting |

In the browser, the app uses one session cookie (only when you log in with the app password) and local storage for view settings such as theme, background and card size. There are no third-party cookies.

## Building and installing

Installing or building the app downloads software once, like any Docker image: the base image and Python packages, three.js from npm, OpenSCAD and the STEP converter from the Debian and Python package repositories. The published image is built by GitHub Actions from the code in this repository. None of this happens while the app is running.

## Your responsibility

You decide who can reach your server. Use a password (`APP_PASSWORD`) or a login portal, and don't expose the app to the internet without one. Backups of `data/` contain your printer API keys – keep them private.

Questions or concerns: open an issue on GitHub.
