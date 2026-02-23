# CS2DemoPlayer

CS2 demo 2D playback tool built with:

- Electron (desktop UI, file selection, IPC)
- Python backend (`demoparser2` + `pandas`) for `.dem` parsing

## Project Structure

```text
CS2DemoPlayer/
  src/
    main/        # Electron main process (window + IPC + Python process spawn)
    renderer/    # Frontend UI (HTML/CSS/JS + assets)
    python/      # Demo parsing engine
  venv/          # Local Python virtual environment (create locally)
  package.json   # Electron dependencies/scripts
  requirements.txt
```

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
