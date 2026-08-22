# Drop Your Moment

[![CI](https://github.com/bbo76/drop-your-moment/actions/workflows/ci.yml/badge.svg)](https://github.com/bbo76/drop-your-moment/actions/workflows/ci.yml)

Logiciel de photobooth pour caisson DIY : écran tactile 7", Raspberry Pi 4B, module caméra
Pi v3, imprimante Canon Selphy CP1500.

Le matériel ci-dessus est la cible du MVP, pas une contrainte d'architecture : caméra et
imprimante sont des pilotes interchangeables derrière une interface commune, et le
frontend est une page web, donc capable de tourner sur une tablette ou un Mac.

**Phase en cours : MVP numérique.** L'impression physique est reportée — l'interface
`PrinterDriver` et l'état `PRINTING` existent déjà, servis par un pilote neutre, pour que
le branchement de CUPS ne demande aucune restructuration.

- [Feuille de route](docs/roadmap.md) — jalons faits et restants, et ce qui n'est pas
  encore vérifié sur le vrai matériel
- [Décisions](docs/decisions.md) — les choix structurants et pourquoi, avec les
  conditions qui justifieraient de les rouvrir

## Architecture en deux lignes

Une application web en mode kiosque : un frontend statique plein écran (Chromium kiosk sur
le Pi, n'importe quel navigateur ailleurs) qui parle à un backend Python local. Toute la
logique de parcours vit dans une machine à états côté serveur ; le frontend n'est qu'un
afficheur, ce qui permettra à une tablette ou un Mac de consommer la même API.

Un seul process héberge **deux serveurs sur deux sockets** :

| | adresse | usage |
|---|---|---|
| kiosque | `127.0.0.1:8000` | écran tactile, jamais joignable depuis le réseau |
| administration | `0.0.0.0:8001` | portail depuis un PC du LAN |

L'isolation vient de ces adresses de bind, pas d'une frontière de process. Rester dans un
seul process est délibéré : le capteur caméra n'accepte qu'un propriétaire, et une config
d'événement modifiée depuis l'admin doit être vue immédiatement par le kiosque.

## Parcours visiteur

Accueil → décompte 3-2-1 sur l'aperçu live → capture → choix d'un filtre (original, N&B,
sépia) → « je garde cette photo » → confirmation → retour automatique à l'accueil.

Le bouton dira « Imprimer » quand une imprimante sera branchée. Pendant la phase numérique
il ne promet rien qu'il ne tienne : la photo est enregistrée, rien ne sort du caisson.

Le cadre ou logo de l'événement est appliqué automatiquement, identique pour toutes les
photos, et se configure depuis le portail d'administration. Le filtre choisi par le
visiteur s'applique à la photo **avant** que l'overlay soit composé par-dessus : un
branding en couleur ne doit pas partir en sépia.

## Organisation du dépôt

```
backend/      FastAPI, machine à états, pilotes caméra et imprimante
frontend/     Vite + React + Tailwind, deux points d'entrée dans un seul projet
                index.html  → kiosque tactile
                admin.html  → portail d'administration
data/         données d'exécution, jamais versionnées
                sessions/   une photo brute et une composée par passage
                events/     configuration et overlay de l'événement en cours
                counters.json  compteur de tirages, face aux cartouches CP1500
```

Un seul projet frontend pour les deux interfaces : jetons de design, client d'API et
composants sont partagés, et il n'y a qu'un arbre de dépendances à maintenir. Le backend
sert le même répertoire `frontend/dist` depuis ses deux sockets, avec un document
différent de chaque côté.

## Développement

Le développement se fait sur une machine de bureau ; le Pi reçoit le code par git aux
points de contrôle matériels. Sans `picamera2` installé, une **caméra de synthèse animée**
prend le relais automatiquement — animée à dessein, car un mock statique ne permettrait
pas de distinguer un flux MJPEG vivant d'un flux gelé.

### Backend

Dépendances gérées par [uv](https://docs.astral.sh/uv/), verrouillées dans `uv.lock`.

```sh
cd backend
uv sync                                    # crée .venv et installe le tout

uv run pytest                              # aucun matériel requis
uv run ruff check dropyourmoment tests
uv run ruff format --check dropyourmoment tests

uv run python -m dropyourmoment.main       # kiosque sur :8000, admin sur :8001
```

Pour ne pas exposer le portail d'administration sur le réseau pendant un simple essai :
`DYM_ADMIN_HOST=127.0.0.1`.

Un overlay de démonstration au bon ratio, pour exercer la chaîne avant d'avoir un vrai
visuel d'événement :

```sh
uv run python -m dropyourmoment.tools.make_overlay --label "Mariage C & T"
```

Puis renseigner `"overlay_file": "overlay.png"` dans `data/events/current/event_config.json`.
L'application n'écrit jamais d'overlay d'elle-même : un cadre de démonstration
apparaissant sur les photos d'un vrai événement serait pire que pas de cadre du tout.

### Frontend

Dépendances gérées par [pnpm](https://pnpm.io/), verrouillées dans `pnpm-lock.yaml`. La
version de pnpm est épinglée dans le champ `packageManager`, que corepack sait honorer.

```sh
cd frontend
pnpm install
pnpm dev           # Vite sur :5173, relaie /api et /admin vers le backend Python
pnpm build         # produit frontend/dist, servi par le backend
pnpm typecheck
```

Deux manières de travailler : `pnpm dev` pour le rechargement à chaud (Vite relaie les
appels d'API vers le backend, qui doit tourner en parallèle), ou `pnpm build` puis le
backend seul, ce qui reproduit exactement le fonctionnement sur la borne.

`pnpm-workspace.yaml` autorise nommément le script d'installation d'`esbuild`. pnpm les
bloque tous par défaut — une dépendance transitive ne doit pas exécuter du code sans
décision explicite — et esbuild, dont Vite dépend, a besoin du sien pour lier son binaire.

## Réglages

Variables d'environnement préfixées `DYM_` (voir
`backend/dropyourmoment/config.py`). Les plus utiles :

| variable | défaut | rôle |
|---|---|---|
| `CAMERA_DRIVER` | `auto` | `mock`, `picamera2`, ou `unavailable` pour tester l'écran dégradé |
| `PREVIEW_TIMEOUT_S` | `60` | retour à l'accueil si le visiteur s'éloigne devant l'aperçu |
| `REVIEW_TIMEOUT_S` | `90` | idem sur l'écran de review |
| `KIOSK_HOST` / `ADMIN_HOST` | `127.0.0.1` / `0.0.0.0` | adresses de bind |
| `PRINTER_DRIVER` | `null` | pilote neutre pendant la phase numérique ; `cups` au jalon 7 |
| `RETENTION_MAX_AGE_DAYS` | `30` | âge au-delà duquel une session est purgée |
| `RETENTION_MAX_TOTAL_GB` | `8` | plafond du dossier `data/sessions`, filet contre le disque plein |

## Installation sur le Pi (Raspberry Pi OS Trixie)

```sh
sudo apt install python3-picamera2 rpicam-apps nodejs npm
sudo npm install -g pnpm    # ou : corepack enable
rpicam-hello                    # valider le capteur AVANT tout Python

cd backend
# L'interpréteur est épinglé sur celui du système, et --system-site-packages expose les
# paquets apt. Sans ces deux options, `import picamera2` échouerait : voir plus bas.
uv venv --python /usr/bin/python3 --system-site-packages
uv sync --no-dev --inexact

cd ../frontend && pnpm install --frozen-lockfile && pnpm build   # construit sur place
```

Deux précautions liées à `picamera2`, qui dépend de bindings Python de libcamera compilés
contre le libcamera système et ne s'installe donc pas par pip :

- **`--system-site-packages`** expose les paquets apt au venv. C'est aussi ce que PEP 668,
  appliqué sur Trixie, rend obligatoire : pip refuse d'écrire dans l'environnement système.
- **`--python /usr/bin/python3`** épingle l'interpréteur du système. uv sait télécharger
  ses propres CPython, et l'un d'eux ne verrait jamais `/usr/lib/python3/dist-packages` —
  `--system-site-packages` expose les paquets de l'interpréteur de base, pas ceux d'un
  autre. `uv sync` préserve ensuite ce réglage (`include-system-site-packages` reste vrai
  dans `pyvenv.cfg`).

Le compositeur de Trixie est **labwc** (Wayland), donc l'autostart de Chromium passe par
`~/.config/labwc/autostart` et non `.xinitrc`.

## Licence

MIT — voir [LICENSE](LICENSE).
