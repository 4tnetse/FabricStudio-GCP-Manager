#!/bin/bash
# Start Fabric Studio UI (backend + frontend dev server)

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Starting backend..."
cd "$ROOT/backend"
.venv/bin/python -m uvicorn main:app --port 8000 --reload &
BACKEND_PID=$!

echo "==> Starting frontend..."
cd "$ROOT/frontend"
/opt/homebrew/bin/npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend : http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
