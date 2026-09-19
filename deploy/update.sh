#!/bin/sh
set -eu

branch=${1:-main}
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

case "$branch" in
    -*) echo "Branche invalide : $branch" >&2; exit 2 ;;
esac
git check-ref-format --branch "$branch" >/dev/null

cd "$repo_dir"
if [ -n "$(git status --porcelain)" ]; then
    echo "Déploiement annulé : le dépôt contient des modifications locales." >&2
    git status --short >&2
    exit 1
fi

echo "Mise à jour depuis origin/$branch"
git fetch --prune origin
if git show-ref --verify --quiet "refs/heads/$branch"; then
    git switch "$branch"
else
    git switch --track -c "$branch" "origin/$branch"
fi
git merge --ff-only "origin/$branch"

echo "Synchronisation du backend"
(cd backend && uv sync --no-dev --inexact)

echo "Construction du frontend"
(cd frontend && pnpm install --frozen-lockfile && pnpm build)

echo "Redémarrage de l'application"
sudo systemctl restart dropyourmoment.service
attempt=0
until curl --fail --silent --max-time 1 http://127.0.0.1:8000/api/status >/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        echo "Le backend ne répond pas après 30 secondes." >&2
        systemctl --no-pager --full status dropyourmoment.service >&2 || true
        exit 1
    fi
    sleep 1
done
sudo systemctl restart dropyourmoment-kiosk.service

echo "Déploiement de $branch terminé"
systemctl --no-pager --full status dropyourmoment.service dropyourmoment-kiosk.service
