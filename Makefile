# Route Planning Agent Demo — Makefile
#
# Local dev harness. Python 3.11 is pinned via $(PYTHON); Redis via Homebrew.
# No Docker targets — this demo runs natively.
#
# `make logs` tails logs/api.log, which is populated when you run start-api
# with shell redirection (e.g. `make start-api >> logs/api.log 2>&1`). Create
# the logs/ directory on first run if it doesn't exist.

PYTHON ?= python3.11

.PHONY: python-check start-api start-dash redis-start redis-stop reset seed-s5 logs test-e2e

python-check:
	@$(PYTHON) --version

start-api:
	$(PYTHON) -m uvicorn api.main:app --reload --port 8000

start-dash:
	cd dashboard && npm run dev

redis-start:
	brew services start redis

redis-stop:
	brew services stop redis

reset:
	$(PYTHON) scripts/reset_demo.py

seed-s5:
	$(PYTHON) -m data.seed_s5 --apply

logs:
	tail -f logs/api.log

test-e2e:
	TEST_MODE=1 $(PYTHON) scripts/test_e2e.py
