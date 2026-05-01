"""Reset the demo DB: truncate every table then re-apply the base seed.

Usage:
    python3.11 scripts/reset_demo.py
    make reset
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running as `python3.11 scripts/reset_demo.py` from repo root.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Load .env so GOOGLE_MAPS_API_KEY is available for the seed precompute.
try:
    from dotenv import load_dotenv  # noqa: E402
    load_dotenv(REPO_ROOT / ".env")
except ImportError:
    pass

from data.seed import (  # noqa: E402
    DEFAULT_DB_PATH,
    apply as seed_apply,
    build_tasks,
    build_workers,
)


def main() -> int:
    workers = build_workers()
    tasks = build_tasks()
    seed_apply(workers, tasks, DEFAULT_DB_PATH)
    pre_assigned = sum(1 for t in tasks if t.worker_id is not None)
    print(
        f"reset OK — wrote {len(workers)} workers, {len(tasks)} tasks "
        f"({pre_assigned} pre-assigned) to {DEFAULT_DB_PATH}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
