# MapToCode — convenience commands
# Run from the project root directory.
#
# Prerequisites:
#   Backend: Python virtual environment set up in backend/.venv
#            (run: cd backend && python3 -m venv .venv && pip install -r requirements.txt)
#   Frontend: Node modules installed in web/
#            (run: cd web && npm install)

.PHONY: backend frontend test test-backend test-frontend lint help

help:
	@echo ""
	@echo "MapToCode — available commands:"
	@echo "  make backend        Start the FastAPI backend (port 8000)"
	@echo "  make frontend       Start the Next.js frontend (port 3000)"
	@echo "  make test           Run both backend and frontend test suites"
	@echo "  make test-backend   Run only pytest (backend)"
	@echo "  make test-frontend  Run only Node tests (frontend)"
	@echo "  make lint           Run ESLint on the frontend"
	@echo ""

backend:
	@echo "Starting FastAPI backend on http://127.0.0.1:8000 ..."
	cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

frontend:
	@echo "Starting Next.js frontend on http://localhost:3000 ..."
	cd web && npm run dev

test: test-backend test-frontend

test-backend:
	@echo "Running backend tests (pytest)..."
	cd backend && .venv/bin/pytest tests

test-frontend:
	@echo "Running frontend tests (Node)..."
	cd web && npm test

lint:
	@echo "Running ESLint on frontend..."
	cd web && npm run lint
