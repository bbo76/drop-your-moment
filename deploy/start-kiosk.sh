#!/bin/sh
set -eu

url=http://127.0.0.1:8000
until curl --fail --silent --max-time 1 "$url/api/status" >/dev/null; do
    sleep 1
done

exec cage -d -- chromium \
    --ozone-platform=wayland \
    --kiosk \
    --lang=fr-FR \
    --accept-lang=fr-FR,fr \
    --no-first-run \
    --noerrdialogs \
    --disable-features=Translate,TranslateUI \
    --disable-session-crashed-bubble \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    "$url"
