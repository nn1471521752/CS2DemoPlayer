# CS2DemoPlayer

CS2 demo 2D playback tool built with:

- Electron (desktop UI, file selection, IPC)
- Python backend (`demoparser2` + `pandas`) for `.dem` parsing

## Root Structure

```text
CS2DemoPlayer/
  data/                         # Local sqlite db and backups
  src/
    main/                       # Electron main process
      db/                       # DB layer split by responsibility
        index.js                # DB facade (public db api)
        demo.js                 # Demo query/model mapping helpers
        debug.js                # DB debug aggregation
        migrations.js           # DB schema migrations
      ipc.js                    # IPC handlers + Python process lifecycle
      main.js                   # Electron window bootstrap
    python/                     # Python backend parser
      constants.py
      engine.py
      parser.py
    renderer/
      assets/                   # Maps and static assets
      css/
        style.css
      js/
        map-meta.js
        canvas.js
        ui/                     # Frontend UI split by domain
          core.js               # Shared state, utils, base setup
          library.js            # Demo library / rounds / db panel UI logic
          rendering.js          # Radar rendering and playback logic
          events.js             # Event wiring and app entry flow
      index.html
  venv/                         # Local Python virtual environment (create locally)
  package.json                  # Electron dependencies/scripts
  requirements.txt
  README.md
```

## Quality Limits

- Rule A: each file must be `< 800` lines
- Rule B: each function must be `< 40` lines
- Current status: `PASS` (checked on current workspace)

## Setup

### 1) Install Node dependencies

```bash
npm install
```

### 2) Create Python virtual environment

Windows (PowerShell):

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS/Linux:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
npm start
```

Then click the import demo button in the app and select a CS2 `.dem` file.

## Notes

- `src/main/ipc.js` uses the local `venv` Python executable first.
- If Python process startup/parsing fails, detailed error info is returned to the frontend (`status: error`, `message`, `details`).
