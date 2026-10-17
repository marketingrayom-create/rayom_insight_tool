# Uniware Auto Start

## Start everything

From this project folder:

```bash
npm run dev
```

This starts:
- React/Vite
- Uniware Python API server

The Python server opens the Uniware authentication browser. Enter OTP manually when requested.

## API

React reads the latest inventory from:

GET http://127.0.0.1:5000/api/inventory

Status:

GET http://127.0.0.1:5000/api/inventory/status

Fresh sync:

POST http://127.0.0.1:5000/api/inventory/sync

## Python dependencies

If not already installed:

```bash
pip install selenium webdriver-manager requests pandas openpyxl flask
```

The Python service saves timestamped CSV, JSON and Excel files.

## Important

Do not put Uniware passwords or session cookies in the React frontend.
The Python service handles Uniware authentication and keeps the credentials on the local machine.
