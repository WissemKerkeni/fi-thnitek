#!/bin/sh
# Render free plan start (no pre-deploy step, render.yaml): migrations, the places import (idempotent),
# then the server as PID 1 so it receives SIGTERM. Runs from /repo/apps/api.
set -e
node dist/db/migrate-cli.js
node dist/db/seed.js
exec node dist/main.js
