# Feuille de route

État au 22 août 2026.

Le projet avance par jalons. Chacun se termine sur quelque chose d'observable, pas sur
une couche technique : c'est ce qui permet de vérifier sur le vrai matériel avant
d'empiler la suite.

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

### ⬜ Jalon 4 — Sortie numérique

Ce qui manque pour boucler le parcours : aujourd'hui la review n'a aucune issue à part
« refaire » et le timeout.

- `hardware/printer/base.py` — interface `PrinterDriver` : `print_image`, `get_status`,
  `list_available_printers`, `get_job_status`
- `NullPrinterDriver` — journalise et retourne un succès immédiat
- `POST /api/session/{id}/print` — fige `final.jpg`, transition `REVIEW → PRINTING → DONE`
- Compteur de tirages dans `data/counters.json`, face aux capacités de cartouche de la
  CP1500 (36 / 54 / 108)
- Écran de confirmation, retour automatique à l'accueil
- `storage/retention.py` — purge des sessions anciennes : environ 2 Go par événement,
  plus l'usure en écriture de la carte SD

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

- **Mode multi-prises / bandeau photo.** L'architecture l'accueille sans réécriture :
  `Session.raw_paths` est une liste, `LayoutSpec` est le point d'insertion, et
  `compose_layout` existe déjà en passe-plat.
- **Partage en ligne, galerie publique, QR code.** Aucune dépendance Internet en
  fonctionnement.
- **Authentification du portail d'administration.** Risque accepté : accès LAN pendant un
  événement.
- **Docker.** Voir [decisions.md](decisions.md) pour les trois raisons.
- **« Navigateur comme caméra »** pour une tablette sans capteur. Inverse le flux de
  contrôle et ne rentre pas dans l'abstraction actuelle : demandera un second mode de
  capture au niveau de l'API, pas un pilote de plus.
