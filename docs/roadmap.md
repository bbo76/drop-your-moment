# Feuille de route

État au 22 août 2026.

Le projet avance par jalons. Chacun se termine sur quelque chose d'observable, pas sur
une couche technique : c'est ce qui permet de vérifier sur le vrai matériel avant
d'empiler la suite.

Chaque jalon a son [milestone GitHub](https://github.com/bbo76/drop-your-moment/milestones),
et chaque puce restante ci-dessous son issue. Ce document reste la référence : il porte le
*pourquoi*, les issues portent le détail d'exécution.

## Phase 1 — MVP numérique

L'impression physique est reportée à la phase 2. L'interface `PrinterDriver` et l'état
`PRINTING` de la machine à états existent déjà, servis par un pilote neutre, pour que le
branchement de CUPS ne demande aucune restructuration.

### ✅ Jalon 1 — Fondations, caméra et aperçu

Structure du dépôt, un process à deux sockets, machine à états de session avec timeouts
d'inactivité, abstraction caméra avec pilote de synthèse animé et pilote picamera2,
endpoint MJPEG, format de sortie, frontend kiosque avec cadre de visée.

### ✅ Jalon 2+3 — Capture, recadrage, overlay et filtres

Fusionnés : livrer la capture sans les filtres donnait un écran de review incohérent et
imposait d'écrire le pipeline de composition en deux fois.

Pipeline de composition, configuration d'événement en JSON, chargement et décodage de
l'overlay, endpoints de capture / filtre / refaire, décompte 3-2-1, flash logiciel, écran
de review. Outil de génération d'un overlay de démonstration.

### ✅ Jalon 4 — Sortie numérique

Le parcours boucle : accueil → capture → filtre → « je garde cette photo » → confirmation
→ retour automatique à l'accueil, sans intervention.

Interface `PrinterDriver` et pilote neutre, `POST /api/session/{id}/print`, compteur de
tirages persisté, écran de confirmation, purge des sessions anciennes.

Le flux d'impression est **asynchrone dès le pilote neutre** — c'est ce qui permet au
jalon 7 de ne remplacer qu'un pilote (voir [decisions.md](decisions.md)).

### ⬜ Jalon 5 — Portail d'administration

Le squelette existe (`src/admin/`, diagnostic système sur le port 8001). Reste :

- `GET` / `PUT /admin/event-config` — nom de l'événement, filtres proposés, format de
  sortie, nombre de copies
- `POST /admin/overlay` — téléversement avec **refus** si le ratio ne correspond pas au
  format de sortie. Strict à la porte, contrairement au chargement à l'exécution qui est
  permissif (voir [decisions.md](decisions.md))
- Galerie : liste paginée, vignettes, téléchargement unitaire, archive zip de l'événement
- Page de santé avec le compteur de tirages
- Test d'isolation réseau kiosque / administration

### ⬜ Jalon 6 — Validation sur le Raspberry Pi

Le premier contact avec le vrai matériel. Le pilote picamera2 est écrit contre la
documentation et **n'a jamais été exécuté**.

- Prérequis Trixie : `python3-picamera2`, `rpicam-apps`, `nodejs`, `npm`, pnpm
- `uv venv --python /usr/bin/python3 --system-site-packages` puis `uv sync --no-dev
  --inexact` — voir le README pour les raisons
- Bascule sur `picamera2_driver`, mesure de la fluidité de l'aperçu et de la latence de
  capture
- Service systemd, autostart de Chromium en kiosque sous **labwc** (Wayland, pas X11)
- Réglages finaux : résolution d'aperçu, qualité JPEG, timeouts

### ✅ Pilote webcam universel — macOS, Windows, USB

Hors séquence, pris avant le jalon 5 : la galerie et le refus d'overlay du jalon 5 se
valident en regardant des photos, et la mire de synthèse n'a ni visage ni bord de cadre
risqué. Un vrai recadrage ne se juge pas sur des barres de couleur.

L'abstraction `CameraDriver` était déjà la bonne : il manquait une implémentation, pas une
restructuration. `cv2.VideoCapture` couvre AVFoundation, MSMF/DirectShow et V4L2 — un seul
pilote pour macOS, Windows et n'importe quelle webcam USB.

Ce n'est pas le scénario « navigateur comme caméra » écarté plus bas : celui-là inverse le
flux de contrôle, une webcam reste côté serveur avec le même propriétaire unique.

`opencv_driver.py` avec encodage JPEG par `cv2.imencode`, `DYM_CAMERA_DEVICE`, ordre
d'autodétection `picamera2 → opencv → mock`, et `opencv-python` en extra `webcam` — 90 Mo
qui n'ont rien à faire sur le Pi. Une webcam n'ayant qu'un flux, `still_size ==
preview_size` : voir [decisions.md](decisions.md).

Confirmé sur la caméra du MacBook : aperçu vivant, 1280×720 négociés — la résolution
demandée, sans repli. L'autorisation caméra de macOS s'attache à l'application qui lance
le backend : accordée au terminal interactif, elle ne l'est pas pour autant à un shell
lancé autrement, qui retombe alors sur la mire.

## Phase 2 — Impression

### ⬜ Jalon 7 — Impression CUPS

Aucun changement d'API ni de machine à états attendu : le pilote neutre est remplacé.

- `cups_driver.py` via pycups (`apt install python3-cups`)
- Traduction des `printer-state-reasons` — `media-empty`, `marker-supply-low` — en
  statuts métier
- Polling de job **plus un délai résiduel** : CUPS marque « terminé » à la remise à
  l'imprimante, pas à la sortie du papier. La CP1500 est une sublimation quatre passes,
  environ 40 s
- Message « ne touchez pas la photo pendant l'impression » : le papier fait des
  allers-retours entre les passes et les invités tirent dessus
- Sélection d'imprimante depuis l'administration
- Validation d'impression réelle : format, rognage, délai, débranchement en cours de job

## Ce qui n'est pas vérifié

À traiter avant de considérer quoi que ce soit comme terminé.

| quoi | pourquoi ça compte |
|---|---|
| **Pilote picamera2 jamais exécuté** | Écrit contre la documentation. Configuration à un seul mode capteur, encodeur MJPEG sur le flux `lores`, capture depuis `main` sans changement de mode : tout cela est à confirmer sur le Pi. |
| **Rendu visuel du kiosque** | Le rythme du décompte et la taille des cibles tactiles sur 7 pouces sont des jugements qui demandent l'écran réel. |
| **uv + `--system-site-packages` sur le Pi** | Le mécanisme est vérifié (`include-system-site-packages` survit à `uv sync`), mais la combinaison exacte avec `python3-picamera2` reste à confirmer sur place. |
| **Impression CP1500 depuis ce logiciel** | L'impression via CUPS est confirmée fonctionnelle sur le Pi, mais pas encore depuis cette application. |

## Hors périmètre

Explicitement écartés du MVP, à ne pas rouvrir sans élément nouveau :

- **Mode multi-prises / bandeau photo.** Le pipeline compose une prise, une seule, et le
  dit dans ses types. L'échafaudage qui l'anticipait (`LayoutSpec`, `compose_layout` en
  passe-plat, `raw_paths` en liste) a été retiré : maintenir un point d'insertion pour une
  fonctionnalité explicitement écartée coûtait plus que le jour où il faudra l'écrire.
- **Partage en ligne, galerie publique, QR code.** Aucune dépendance Internet en
  fonctionnement.
- **Authentification du portail d'administration.** Risque accepté : accès LAN pendant un
  événement.
- **Docker.** Voir [decisions.md](decisions.md) pour les trois raisons.
- **« Navigateur comme caméra »** pour une tablette sans capteur. Inverse le flux de
  contrôle et ne rentre pas dans l'abstraction actuelle : demandera un second mode de
  capture au niveau de l'API, pas un pilote de plus.
