#!/bin/sh
# The `imports` service of compose.prod.yaml. Once a day it runs `pnpm db:anticheat --latest` and
# `pnpm db:protondb --latest`, each in its own process: an unchanged source costs one GitHub listing, and a
# failure is logged and tried again the next day without touching `app`. SCHEDULED_IMPORTS=off turns it off.
if [ "${SCHEDULED_IMPORTS:-on}" = off ]; then
  echo "Scheduled imports are off (SCHEDULED_IMPORTS=off)."
  exec sleep infinity
fi

# `app` serves only after it applied the migrations, so no import runs against an older schema.
until node -e "fetch('http://app:3000/opengame-detect.sh').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"; do
  sleep 5
done

while :; do
  pnpm db:anticheat --latest
  pnpm db:protondb --latest
  sleep 86400
done
