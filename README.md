# Straw Bale Records

A mobile-first web app for harvest straw bale recording.

## Current Version

- Add and edit field records with customer name, farm name, field name, hectares, crop, bale total, map coordinates, and field photo.
- Add fields from the phone location or by tapping the map.
- Start preloaded fields from the home screen and mark them complete when finished.
- Map pins are red for unfinished fields and green for completed fields.
- View season totals for all bales plus wheat, barley, spring barley, and oats.
- View a live spreadsheet table and export `.xlsx` or `.csv`.
- Store records on the Raspberry Pi when using `server.py`, with browser storage as a fallback.

## Run Locally

```bash
python3 server.py --host 0.0.0.0 --port 8095
```

Open:

```text
http://127.0.0.1:8095/
```

## Raspberry Pi 5 Setup

Copy this folder onto the Pi, then run:

```bash
cd /home/pi/StrawApp
python3 server.py --host 0.0.0.0 --port 8095
```

From the office network:

```text
http://raspberrypi.local:8095/
```

From Tailscale:

```text
http://<pi-tailscale-name-or-ip>:8095/
```

Records are saved on the Pi at:

```text
data/straw-records.json
```

Back that file up during harvest.

## iPhone Location Note

iPhone location capture normally requires a secure browser context. `localhost` works for development, but remote access is best served over HTTPS. If you open the app over plain HTTP through Tailscale, map pins and manual field entry still work, but the "current location" button may be blocked by Safari.
