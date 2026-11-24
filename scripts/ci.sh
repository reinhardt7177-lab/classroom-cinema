#!/usr/bin/env bash
set -euo pipefail
python -m venv "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/classroom-cinema-ci"
source "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/classroom-cinema-ci/bin/activate"
python -m pip install -r tests/requirements.txt
python tests/check_classroom.py
