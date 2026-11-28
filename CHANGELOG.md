# Changelog

Z-Hop Deck (called Layerdeck up to 1.21). The version shown in the app's top-right corner comes from `VERSION` in `app/app.py`. Bump it with every release.

## 1.26.6
- Tables (Print log, list view, …) on the carbon background: rows sit on a dark panel with rounded bottom corners, no more lone line floating under the last row

## 1.26.5
- Security (CodeQL #41, #42): printer status no longer passes exception text to the browser – an offline printer shows a fixed reason (*cannot reach the printer*, *access denied – check the API key*, *timeout* …); the full error is written to the container log once

## 1.26.4
- Security (CodeQL): the live-view G-code endpoint no longer returns exception text; details are written to the container log

## 1.26.3
- Live refresh also follows the print log, the queue and the *printed* status: when a finished print is logged automatically, Home (Printed, This month, Up next) and the Library cards update by themselves

## 1.26.2
- The *Printing* pill is red

## 1.26.1
- Library: the file a printer is printing right now gets a pulsing **Printing 42 %** pill (also on its model folder card), no matter where the print was started (Mainsail, OrcaSlicer, Z-Hop Deck). Checked every ~15 s while the Library is open; the file is matched by name (and size if there are several)
- Printer status is cached for a few seconds and shared by all open pages; an unreachable printer is asked less often

## 1.26.0
- **Live print view on Home**: while a Klipper (Moonraker) or OctoPrint printer prints, the Printers card shows the running job's toolpath – printed part in the slicer's feature colours, the rest as a ghost – growing with the print (exact file position, else the layer info / Z). Layer and Z underneath, drag to turn. The G-code is fetched from the printer once per job and cached (`data/jobcache`, last 4); updates are a small status request every 5 s, the drawing is done in the browser. Polling stops on other pages and when the tab is hidden
- Home → Printers: status refreshes by itself (5 s while printing, 30 s otherwise) and shows the time left

## 1.25.14
- Zip downloads are named after their content instead of `zhopdeck-<date>.zip`: one file → `name.zip`, a model / folder → `Folder name.zip` (paths inside start at that folder); a mixed selection → `6 files <date>.zip`

## 1.25.13
- Fix: a redone preview could keep showing the old picture – thumbnails are cached by the browser for 30 days and the cache key didn't change when only the picture changed. The key now includes the thumbnail's file time
- Fix: .blend files analysed with 1.25.11 were not redone by 1.25.12 (their preview kind was skipped). They are now

## 1.25.12
- Blender previews look much better: when the saved preview is a screenshot of the whole Blender window, Z-Hop Deck finds the 3D viewport, cuts the model out of the grey background (axis lines, grid, gizmo and side panels are left out) and zooms it to fill the card. Camera renders are centred, transparent renders kept as they are. Existing .blend files are redone once

## 1.25.11
- Blender `.blend`: the preview picture Blender saves in the file is used as the thumbnail – plain, gzip and zstd-compressed files, Blender 2.5 up to 5.x. New dependency `zstandard`. Existing files are re-analysed once

## 1.25.10
- STEP files: *Open in Cura* now works too – Cura can't import STEP, so it gets the STL Z-Hop Deck converted. With OrcaSlicer + Cura enabled the ▾ menu now also shows up on STEP files (OrcaSlicer / PrusaSlicer / Bambu Studio still get the original STEP)

## 1.25.9
- Live refresh: Library and Home update by themselves when a file is added (upload, OrcaSlicer, scan) or a preview finishes – no more F5. The page asks for a tiny fingerprint every 8 s (2 s while working), stops completely while the browser tab is hidden, and never refreshes while a dialog is open, you are typing or cards are selected

## 1.25.8
- Fusion 360 `.f3d` / `.f3z`: the preview picture Fusion saves inside the file is used as the thumbnail (`.f3z` is now recognised too). Existing files are re-analysed once

## 1.25.7
- G-code without an embedded picture now gets a thumbnail: the toolpath (extrusion moves) is drawn like the model, in the sliced filament colour; purge / prime lines are left out. Before, the 3D toolpath view worked but the card stayed empty
- QOI thumbnails (OrcaSlicer / PrusaSlicer option) are decoded
- Prusa binary G-code (.bgcode): embedded thumbnail and print time / material are read
- Existing G-code files without a picture are re-analysed once automatically

## 1.25.6
- Big 3MF files (e.g. 20 MB painted multi-colour projects) no longer get the server OOM-killed: the 3MF model XML is now streamed instead of loaded as a whole tree. A 18 MB / 1.6 M-triangle painted 3MF went from >1.4 GB (just to read it) to ~0.5 GB for the whole preview + 3D view
- Files and 3D views that were skipped as "ran out of memory" are retried once automatically

## 1.25.5
- Fix: a normal restart (update, `docker compose up`, LXC reboot) while a preview was being made was reported as *"the server ran out of memory on this file"* and the preview was skipped for good. Z-Hop Deck now checks the container's OOM-kill counter: after a plain restart the file is simply done again; only a real out-of-memory kill (or dying 3 times on the same file) skips it. Files marked by older versions are retried once automatically

## 1.25.4
- A model folder with only one model plus a PDF / pictures / readme is now shown as a folder card ("model + docs") instead of a lone STL card; the details panel lists the PDF and text files (PDF opens in a new tab)

## 1.25.3
- Fix: uploading while a model folder was open put the new files INTO that model (they became its parts). The upload now goes next to the open model; tick *Add the files to the open model* to really add parts, and a note warns whenever the chosen folder belongs to a model
- Home → Up next: long model names are cut with "…" instead of running out of the card

## 1.25.2
- Home → Printers: status light – green when the printer is reachable, pulsing orange while printing, red when it can't be reached, an empty ring for printers without a network connection; the loaded spool is shown as a colour dot next to its name

## 1.25.1
- Home: Spools again lists the fullest spools first (as before 1.25.0); hovering a spool shows brand, material and its Spoolman number
- Filament: each spool shows its Spoolman number, or "not in Spoolman" for spools that exist only in Z-Hop Deck

## 1.25.0
- Home, tidier layout: the library card is lower with the numbers on top; "Needs you" and "Runs out soon" become one small "All good ✓" card when there is nothing to show; Spools lists the spools that run out first (low ones highlighted); "This month" says so when nothing was printed yet; an empty queue suggests a model from your want-to-print list (or the newest unprinted one) with *Add to queue*; "New in your library" shows six models across the full width

## 1.24.7
- Path checks: `safe_join` written as the standard "normalise, then check the prefix" pattern; uploaded file names, G-code from OrcaSlicer and renamed files also go through it; a sub-folder base is normalised before it is checked

## 1.24.6
- Security hardening after the first CodeQL scan: the library root of every request is resolved to the configured folder (never the value sent by the browser) before any path is built; `safe_join` also rejects NUL bytes; unexpected errors in uploads and batch actions are logged on the server and reported to the browser as "internal error" instead of the raw exception text

## 1.24.5
- SECURITY.md: how to report a vulnerability privately
- `tools/publish-github.sh`: uses your normal `ssh` (no own SSH options), `fetch` instead of `pull`, a 2-minute limit on every GitHub call with a message instead of hanging, progress lines, and it finishes a release whose commit reached GitHub but whose tag did not

## 1.24.4
- `tools/publish-github.sh`: checks that GitHub is reachable before preparing a release, and pushes a release that an earlier run prepared but could not push

## 1.24.3
- New guide [docs/orcaslicer.md](docs/orcaslicer.md): connect OrcaSlicer, upload, print and log prints automatically, with troubleshooting

## 1.24.2
- PRIVACY.md: no telemetry, what the app connects to and what it stores
- Example addresses in the settings forms no longer show a private domain; `install.sh` takes the time zone from the machine

## 1.24.1
- README: acknowledgements (Printventory, JusttPrint)

## 1.24.0
- Ready for GitHub: MIT license, English README, [installation](docs/installation.md) and [user guide](docs/user-guide.md) with screenshots, generic `.env.example`
- Docker image built by GitHub Actions for amd64 and arm64: `ghcr.io/er9xuser/z-hop-deck` (`docker compose pull`); `docker compose up -d --build` still builds it yourself
- Own background image: Settings → Appearance → *Upload background image* (stored as `data/background.jpg`); the bundled carbon photo of 1.21.5 is moved there automatically
- `tools/publish-github.sh`: publishes a release to GitHub without private files

## 1.23.0
- Internal names renamed too: Docker service / container / image `zhopdeck`, folder `/opt/kontejner/zhopdeck`, repo `Z-Hop-Deck`, database `data/zhopdeck.db` (an existing `layerdeck.db` is renamed automatically on first start), backup and export file names
- NAVODILA: chapter 6 - one-time switch from Layerdeck

## 1.22.0
- Renamed to **Z-Hop Deck** (Layerdeck is the name of an After Effects tool) with a new logo: nozzle hopping over the printed layers

## 1.21.6
- Carbon backgrounds: no full-width line under the library tabs

## 1.21.5
- Dark theme background: carbon photo (default), carbon pattern or plain - Settings → Appearance (remembered per browser)

## 1.21.4
- Carbon background redone as a real 2x2 twill weave (static/carbon.png) with a soft light sheen

## 1.21.3
- Dark theme: discreet carbon-fibre background behind the pages
- Home: bigger library number cards

## 1.21.2
- 3D legend: filaments with the same name also show their colour code ("1 · Generic PLA · #FBEDD2")

## 1.21.1
- Home: clicking a model folder (newest / new in library) opens it in the library as thumbnails of its files, like in the library, instead of all parts in 3D
- Fix: the 3D view kept a cached copy of a multi-colour model in the old format, so filament names did not show

## 1.21.0
- Multi-colour 3MF without a slicer picture get a preview rendered in their own filament colours (re-rendered once after updating)
- 3D view legend shows filament number and name from the project (e.g. "1 · Bambu PLA Matte") instead of only the colour code

## 1.20.0
- 3D view shows multi-colour 3MF in colour: filament per object / part (Bambu Studio, OrcaSlicer, PrusaSlicer project files), painted triangles (`paint_color` / `mmu_segmentation`), and 3MF material colours (`basematerials`, `colorgroup`); colours come from the project's filament list, a legend shows them
- The colour picker is hidden for multi-colour models

## 1.19.3
- Memory: freed memory is given back to the OS after every preview / 3D view (`malloc_trim`), `MALLOC_ARENA_MAX=2` in the image - an idle Layerdeck no longer sits at 1.5 GB after rendering big models
- Crash guard also covers the 3D view of a file and "All parts in 3D": a model that crashed the server once answers "too large for the server's memory" instead of killing it again
- "All parts in 3D" sends at most 1.5 M triangles

## 1.19.2
- Fix: the worker was killed again and again (out of memory) while rendering previews of large models / model folders
  - preview renderer uses about a fifth of the memory (chunked drawing, float32 screen coordinates)
  - model folder previews thin out every part right after loading instead of loading all parts in full first
  - crash guard: if the process dies while working on a file or model folder, the next start skips it (marked
    "preview skipped") instead of crashing in a loop; Settings → Regenerate all previews tries again

## 1.19.1
- Home: logo and "Layerdeck" instead of the greeting

## 1.19.0
- New Home page (start page, first in the menu): library numbers, last printed model, what the queue still needs, spools and when they run out, up next, new models, this month's prints, printer status
- Library: collections as a row of category tiles (+ New), "ready to print / still to print" and "new this week" banners, tabs All · Printed · Unprinted · Queue · Favorites
- Library: clicking a file opens a side panel (preview, folder images, Open in slicer, send, queue, log print, status, rating, details); "3D"/"Open" or a double click opens the full 3D view as before; model folders still open as thumbnails
- Cards show designer (or folder) and status / "Ready to print" / "New" pills
- API: `/api/home`; file list filters `added_days` and `in_queue`

## 1.18.4
- Request watchdog: a request running longer than 2 min is written to the log with its stack (`watchdog: … still running`); if most threads are stuck for 10 min the worker restarts by itself instead of hanging
- 16 worker threads instead of 8 (`THREADS` in `.env`)
- 3D viewer: gives up with an error after 60 s without an answer instead of spinning forever (STEP/OpenSCAD conversions get longer); releases the WebGL context when closed
- NAVODILA: what to collect before restarting when Layerdeck hangs

## 1.18.3
- "Remove from collection…" in the file, model folder, selection and model-header menus (files stay in the library)

## 1.18.2
- Move dialog: "Add to collection" (existing or new) and a "keep in current folder" option to only add to a collection

## 1.18.1
- Drag a model folder or files onto a collection in the sidebar to add them to it (files stay in their folder)

## 1.18.0
- Cards and list rows show which collection(s) a file or model folder is in (coloured chip; click it to open the collection)
- A model folder counts as in a collection when any of its files is; the model header shows its collections too
- Model header menu: "Add all files to collection…"

## 1.17.2
- Upload: when a collection is open in the library, it is preselected in "Add to collection", so uploaded files land in that collection

## 1.17.1
- `install.sh`: one-step setup on a new Debian/Ubuntu machine or LXC (Docker, files user + library folder, `.env` with prompts, optional data restore, build, start, health check)
- `.gitattributes` keeps Unix line endings for scripts

## 1.17.0
- Subfolders that contain only images/documents (e.g. images/ of a Printables download) are shown as folder cards instead of mixing their pictures into the model; images next to the models are still shown directly
- Back (and Esc) from such a subfolder returns to the model
- TXT and Markdown files open in a scrollable pop-up (Markdown with headings, lists, bold, links, code)

## 1.16.0
- Images and documents in a folder are shown as cards in the grid (after the models): photos as thumbnails, PDFs with a large PDF badge; inside a model folder also from subfolders like images/
- Clicking an image opens a gallery (lightbox): ← → or swipe to browse, Esc to close, "open original"
- Image cards use small cached previews generated by the server

## 1.15.0
- A folder (or ZIP) with only one model shows the folder name on its card; clicking still opens the file directly
- Upload dialog: hint to drag folders in (the folder picker makes the browser ask for confirmation)

## 1.14.3
- Fix: after a STEP / OpenSCAD re-conversion the 3D view could still show the old cached mesh

## 1.14.2
- Fix: STEP files were converted in metres (0.1 mm models, tiny dot in the 3D view, empty model preview) – now millimetres; existing STEP files are converted again automatically

## 1.14.1
- Model folders: images and PDFs from subfolders (e.g. Printables zips with files/ and images/) are shown above the thumbnails

## 1.14.0
- STEP/STP files are converted to a mesh (OpenCASCADE via cascadio): preview, size, filament estimate, 3D view, Download STL. Runs in a separate process with a timeout; existing STEP files are converted once after the update.

## 1.13.0
- When a folder is open, its PDFs, text files and images are shown above the thumbnails – one click opens them in a new tab

## 1.12.2
- Security: write requests (POST/PUT/PATCH/DELETE) coming from another website are rejected (CSRF protection). Needed because trusted networks and proxy headers log you in without a cookie – a malicious page could otherwise have uploaded files or restored a database through your browser.

## 1.12.1
- G-code toolpath uses OrcaSlicer's colours (outer wall orange, inner wall yellow, top surface red, solid infill purple, brim navy …), shows a colour legend, and every other layer is slightly darker
- Fix: toolpath colours looked washed out (sRGB colours were used as linear)

## 1.12.0
- OrcaSlicer "Device" tab shows the file you just uploaded for that printer (G-code preview, time, grams, live printer status, Open Mainsail); after 12 h or before any upload it opens the printer's web UI
- Printers have a separate "Web address for the browser" (e.g. https://voron.example.lan) next to the address Layerdeck uses for data (the IP)
- G-code files show a Printers box with live status, "Open Mainsail" and "Send"
- Clear error instead of "Connected – unknown" when the printer address returns a web page (Authelia login / Mainsail) instead of data

## 1.11.3
- Fix: after deleting a file and adding a new one, the 3D / toolpath view could show the deleted file (the new file got the same id and the browser reused its cached preview). File ids are never reused now, and previews are cached by content.

## 1.11.2
- OrcaSlicer "Device" tab: the per-printer URL (`/p/<id>`) opens that printer's own web UI (Mainsail / Fluidd / OctoPrint)

## 1.11.1
- Each connected printer has its own upload URL for OrcaSlicer (`http://server:8080/p/<id>`) – put it in that printer's Orca profile and uploads always go to the right printer
- Fix: changing two settings quickly saved only the last one (e.g. the printer for Orca uploads could be lost)
- Fix: `/p/…` upload URLs now require the API key like `/api/…`

## 1.11.0
- **Automatic print log** for Klipper printers: finished, cancelled and failed prints are imported from Moonraker's job history (every minute) – duration, filament actually used, spools from Spoolman incl. multi-lane AFC prints, cost; file status updated, matching queue entry removed. Entries are marked "auto".
- **OrcaSlicer upload**: Layerdeck acts as an OctoPrint-compatible print host (Orca host type "Octo/Klipper" + API key). Uploaded G-code is stored next to the model it was sliced from (re-slicing replaces it) and passed on to the printer – upload only by default, so the AFC lane can be chosen in Mainsail.

## 1.10.5
- Configuration moved to `.env` (template `.env.example`); `docker-compose.yml` has no passwords or IPs and is safe to keep in git
- `.gitignore` (ignores `.env`, `data/`, caches)

## 1.10.4
- "Library" in the menu (and the Layerdeck logo) always returns to the start page with all models and files – leaves any open folder, search and filters

## 1.10.3
- Filament page: "Open Spoolman" opens the Spoolman start page instead of the "create spool" form

## 1.10.2
- Separate Spoolman address for the browser (Settings → Spoolman → "Address for the browser"), e.g. https via NPMplus while the server talks to Spoolman directly

## 1.10.1
- Spoolman over HTTPS with a self-signed certificate (NPMplus) works
- Clear message when the Spoolman address returns a login page (Authelia) instead of data

## 1.10.0
- Fix: server-side previews showed back faces through the front (dark lines, notches) on models with long thin triangles – typical for OpenSCAD and CAD exports. Large triangles are now split before drawing, so the back-to-front order is correct.
- Existing rendered previews (and model-folder previews) are regenerated automatically once after the update; slicer thumbnails and custom thumbnails are kept

## 1.9.0
- `TRUSTED_NETWORKS`: IPs/subnets that never need a password – works together with Authelia bypass rules (the real client IP is taken from X-Forwarded-For, but only when the request comes from `AUTH_PROXY_IPS`)

## 1.8.0
- Signed-in user and a Log out button at the bottom of the side menu
- `LOGOUT_URL` (or Settings → Session): with Authelia, Log out ends the single sign-on session
- With the app password, Log out ends the app session

## 1.7.0
- Clicking a model card opens its folder as thumbnails (pick a part from there); a single file still opens directly
- Model bar above the folder: Back (Esc), All parts in 3D, Queue all, Zip, rename / tags / ungroup
- Esc from a part returns to the folder, Esc again returns to the library at the same scroll position

## 1.6.0
- Spoolman integration: spools synced from Spoolman (every 5 min and when opening Filament), Spoolman spools are read-only here with a link to Spoolman
- Printer card shows the spool loaded in Klipper (Moonraker `[spoolman]`), and "Log a print" pre-selects it
- Optional: deduct filament in Spoolman when logging a print (off by default – Moonraker usually reports usage already)
- Fix: OpenSCAD crashed with "Permission denied /root/.config/OpenSCAD" when running as PUID – the app now has its own writable home in /data/.home
- Dark filament colours are visible on the spool rings

## 1.5.0
- OpenSCAD: `.scad` files are rendered to STL (preview, size, filament, 3D view, Download STL, Open in OrcaSlicer/Cura with the rendered STL), plus a Code tab with syntax highlighting
- 3D view grid is at least 350×350 mm (Settings → Appearance) and grows automatically when a model is bigger

## 1.4.0
- App version shown discreetly in the top-right corner (in the side menu on phones)
- Uploads report the exact reason for a failure: folder permissions (PUID/PGID), proxy upload limit (413), Authelia redirect, timeout
- Browser caches are refreshed automatically after an update (versioned asset URLs)
- Phone layout: two stat tiles per row, statistics no longer overflow, dialogs open from the bottom

## 1.3.0
- Model folders: an uploaded folder or ZIP becomes one model card with a combined preview, a 3D view of all parts, a parts list, and status/tags/queue for all parts at once
- Sidebar right-click: "Treat as one model" / "Treat each subfolder as a model" / ungroup

## 1.2.0
- Single sign-on behind Authelia (trusted `Remote-User` header from `AUTH_PROXY_IPS`)
- `PUBLIC_URL` for slicer links

## 1.1.0
- "Open in OrcaSlicer / Cura / PrusaSlicer / Bambu Studio"
- Printer connections: Klipper/Moonraker, OctoPrint, PrusaLink – live status and "Send to printer"

## 1.0.0
- First release: library scan, uploads, previews, slicer metadata, 3D/G-code viewer, tags, collections, queue, print log, filament, cost, duplicates, statistics, backup
