# Décisions

Les choix structurants et **pourquoi**. Le raisonnement compte plus que la conclusion :
c'est lui qui évite de re-débattre dans six mois, et qui dit à quelles conditions une
décision mérite d'être rouverte.

## Architecture

### Application web en mode kiosque, logique côté serveur

Un frontend statique plein écran parle à un backend local. Toute la logique de parcours
vit dans une machine à états côté serveur ; le frontend n'est qu'un afficheur.

Ce n'est pas une préférence de style : c'est ce qui rend la portabilité réelle. Une
tablette ou un Mac consomme la même API sans réimplémenter de règles en JavaScript. C'est
aussi ce qui a rendu la bascule du frontend vanilla vers React quasi gratuite — il n'y
avait que 160 lignes à réécrire.

### Un process, deux sockets

Le kiosque écoute sur `127.0.0.1:8000`, l'administration sur `0.0.0.0:8001`. L'isolation
réseau vient des **adresses de bind**, pas d'une frontière de process.

Deux process séparés auraient introduit deux bugs :

- Le capteur CSI n'accepte qu'un propriétaire. Un diagnostic caméra côté administration
  volerait le périphérique au kiosque.
- Une modification de configuration depuis l'administration ne pourrait pas invalider la
  configuration chargée en mémoire par le kiosque. L'overlay changerait sans effet
  jusqu'au redémarrage.

### Le filtre s'applique avant l'overlay

Ordre du pipeline : `recadrage → disposition → filtre → overlay`.

L'inverse ferait partir en sépia le cadre et le logo de l'événement dès qu'un visiteur
choisit ce filtre. Un branding client en couleur ne survivrait pas.

Conséquence utile : le fichier intermédiaire `composed.jpg` que le plan initial prévoyait
devient inutile. Changer de filtre recompose depuis la prise brute — quelques dizaines de
millisecondes — au lieu de conserver un état intermédiaire. Un fichier de moins par
session, une compression JPEG de moins.

### Le format de sortie ne définit que le ratio

La sortie reste à la résolution native après recadrage (1918×1296) plutôt que ramenée à
la taille de tirage (1748×1181). La résolution excédentaire sert l'usage numérique, et le
tirage fera son propre échantillonnage.

Le format de sortie reste néanmoins pertinent même sans imprimante branchée : c'est lui
qui fixe le ratio de recadrage, le ratio attendu de l'overlay, et le cadre de visée
affiché sur l'aperçu. Trois ratios cohabitent dans la chaîne — capteur 16:9, tirage 1,48,
écran 5:3 — et sans repère explicite on coupe des têtes en bord de cadre.

### Configuration d'événement en JSON, pas en base

Un objet unique, modifié une fois par événement. Corrigeable avec un éditeur de texte si
le portail d'administration n'est pas joignable. SQLite se justifierait s'il fallait un
historique requêtable ou plusieurs événements en parallèle — aucun des deux n'est au
programme.

### Strict à la porte, permissif à l'exécution

Un overlay au mauvais ratio est **refusé au téléversement** mais **accepté au
chargement**, avec un avertissement dans les logs.

Ce n'est pas une incohérence. Au téléversement, l'opérateur est devant l'écran et peut
corriger. À l'exécution, un samedi soir, perdre le branding d'un événement est plus grave
que l'afficher légèrement étiré. Même logique pour une configuration corrompue : on
repart sur les valeurs par défaut plutôt que refuser de démarrer, et le fichier fautif est
**conservé** pour que l'opérateur voie ce qui n'allait pas.

### Aperçu en MJPEG

Les frames sont déjà encodées en JPEG par le pilote et s'affichent nativement dans une
balise `<img>`, sans décodage JavaScript. Un WebSocket binaire ajouterait du framing et
de la reconnexion pour un gain nul sur un client unique en boucle locale.

**À rouvrir si** le flux devait un jour traverser un vrai réseau — scénario d'une tablette
distante consommant la caméra du Pi. WebRTC serait alors plus pertinent.

### Pas de changement de mode capteur pour la capture

Une seule configuration : flux `main` pour les captures, `lores` pour l'aperçu.
`switch_mode_and_capture_file()` donnerait les 12 Mpx du capteur mais interrompt l'aperçu
le temps de reconfigurer — pour rien, puisqu'une carte postale à 300 dpi demande environ
1181×1748 px et que le surplus partirait au recadrage puis au tirage.

### Une webcam n'a qu'un flux, donc `still_size == preview_size`

Le pilote Pi expose deux flux du même capteur : `main` pour la capture, `lores` pour
l'aperçu. Une webcam UVC n'offre pas cet étage — la capture et l'aperçu sortent de la même
négociation de mode. Le pilote OpenCV annonce donc une seule taille pour les deux, et
`CameraCapabilities` le supporte déjà sans modification.

La conséquence se paie sur la résolution. À 1280×720, le recadrage au ratio de tirage
donne 1066×720, sous les 1748×1181 d'une carte postale à 300 dpi. C'est accepté : ce
pilote sert le développement et la démonstration sur poste de bureau, pas le tirage, qui
viendra du Pi. Demander 1080p aurait rendu l'aperçu saccadé sur une webcam USB modeste —
or l'aperçu est précisément ce qu'on vient regarder ici.

**La taille demandée est relue après ouverture.** Un pilote de webcam retient
silencieusement le mode supporté le plus proche sans jamais le signaler. Annoncer la
taille demandée plutôt que la taille réelle ferait mentir le cadre de visée du frontend,
qui se dimensionne sur `preview_size` — on couperait des têtes en croyant l'inverse.

**À rouvrir si** une webcam devait alimenter de vrais tirages, ou si l'aperçu s'avérait
saccadé sur un périphérique donné. Le paramètre de construction est là pour ça.

### La webcam n'est retenue que pendant qu'on la regarde

Le driver OpenCV rend le périphérique après quinze secondes sans flux d'aperçu, et le
rouvre à la demande. Le driver Pi, lui, garde son capteur du démarrage à l'arrêt.

L'asymétrie n'est pas une incohérence, c'est la différence entre les deux matériels. Un
capteur CSI est soudé dans la borne : personne d'autre ne le veut, et il n'a pas de LED
pour signaler qu'il est ouvert. Une webcam est celle d'un poste de travail — la LED reste
allumée pendant qu'on code, et une visioconférence voudra peut-être la même caméra.

Trois conséquences à connaître :

- **`is_available()` répond « utilisable », pas « ouverte ».** L'écran d'accueil s'en sert
  pour activer « Commencer » : le lier à l'ouverture désactiverait le bouton dès que la LED
  s'éteint, c'est-à-dire tout le temps. Une webcam débranchée pendant que le périphérique
  était rendu reste donc annoncée présente jusqu'à la tentative suivante — le parcours
  échoue alors avec un écran d'erreur, là où un bouton grisé sans explication laisserait
  l'opérateur sans piste.
- **La LED s'allume quand même au lancement.** L'autodétection doit ouvrir le périphérique
  pour savoir s'il existe : `import cv2` ne prouve rien. Le veilleur l'éteint quinze
  secondes plus tard.
- **Un aller-retour par l'écran de review peut coûter une réouverture.** Le délai est
  volontairement plus long qu'un coup d'œil, mais plus court qu'un timeout de review.
  C'est un paramètre de construction, et la bonne valeur se mesure devant la borne.

**À rouvrir si** la réouverture s'avérait trop lente sur un périphérique donné, ou si le
Pi devait un jour libérer aussi — ce qui demanderait de mesurer d'abord ce que coûte un
`start_recording()` de picamera2, jamais exécuté à ce jour.

### Pas de thread *lecteur* pour la webcam, contrairement au Pi

Le pilote Pi maintient un tampon partagé alimenté par un thread : son encodeur MJPEG
tourne de toute façon en continu dès `start_recording()`, et le tampon évite que chaque
consommateur HTTP déclenche son propre encodage.

Rien de tel ici : sans lecteur, `cv2.VideoCapture` ne produit rien. Les frames sont donc
tirées à la demande dans le générateur d'aperçu, sous un verrou partagé avec la capture.
Un thread lecteur n'économiserait aucun encodage et ajouterait un cycle de vie à gérer.

Il y a bien un thread dans ce driver, mais il ne lit rien : c'est le veilleur qui rend le
périphérique à l'inactivité. Il lui en fallait un, et pas un contrôle à la lecture du
statut comme pour la machine à états — la LED doit s'éteindre même quand aucun navigateur
n'interroge le backend, ce qui est précisément le cas gênant : `task run` laissé dans un
terminal pendant qu'on travaille, aucun onglet ouvert, donc rien qui déclencherait le
contrôle.

Deux plafonds connus, tous deux hors du parcours réel : chaque flux d'aperçu
supplémentaire paie son propre encodage — mais un seul kiosque lit — et une frame peut
être périmée si plus personne ne draine la file du pilote — mais la capture arrive à la
fin du décompte, aperçu vivant. Le jour où l'un des deux se produit, la réponse est le
tampon partagé du pilote Pi, pas une invention nouvelle.

### Autodétection : la webcam se sonde en l'ouvrant, picamera2 non

L'ordre est `picamera2 → opencv → mock`, mais les deux sondes ne posent pas la même
question. Pour picamera2, l'import suffit : le paquet n'existe que là où le capteur CSI
existe. Pour OpenCV, l'import ne prouve rien — `opencv-python` peut être installé sur une
machine sans webcam, ou avec une webcam déjà prise par une visioconférence. Seule
l'ouverture du périphérique répond.

Le pilote est laissé **ouvert** quand la sonde réussit. `start()` étant idempotent,
`Runtime.start()` n'ouvre pas une seconde fois — ce qui évite, sur macOS, un second
dialogue d'autorisation caméra au démarrage.

Conséquence à connaître : sur un poste où l'extra `webcam` est installé, `auto` prend la
vraie webcam et non plus la mire. `DYM_CAMERA_DRIVER=mock` reste le moyen sûr de
travailler sans matériel, et ne tente aucune sonde.

### Le sondage de caméras vole les périphériques, donc jamais automatiquement

Lister les index disponibles demande de les ouvrir : OpenCV n'a pas d'API d'énumération
portable. Ouvrir, c'est réserver, et le capteur n'accepte qu'un propriétaire — le sondage
volerait donc la caméra au kiosque.

D'où trois contraintes qui ont dicté la forme : jamais au démarrage, jamais au chargement
de la page, et `POST` plutôt que `GET`. Ce dernier point n'est pas du purisme REST : un
`GET` finit par être appelé par un préchargement de navigateur ou un rafraîchissement
automatique, et couperait l'aperçu en pleine soirée. L'index détenu par le kiosque n'est
pas sondé du tout, seulement signalé comme occupé.

### Les noms de caméras et leurs index ne sont pas appariés

Le sondage OpenCV donne les index — la seule source de ce que `DYM_CAMERA_DEVICE` attend.
`system_profiler` et `v4l2-ctl` donnent les noms — ce que l'opérateur veut lire. Le portail
affiche les deux listes **côte à côte, sans les apparier**.

Rien ne garantit que le troisième nom rendu par le système corresponde à l'index 2
d'AVFoundation. L'ordre coïncide souvent, et « souvent » n'a pas sa place dans une
interface d'exploitation : un opérateur qui lit deux listes honnêtes s'en sort, un
opérateur à qui on a menti sur un appariement débranche la mauvaise caméra. La taille
négociée par index aide à les distinguer sans rien affirmer de faux.

### Comptage des flux d'aperçu par activité, pas par cycle de vie

À une déconnexion client, Starlette annule la tâche qui pompe le générateur mais **ne le
ferme pas**. Le générateur reste suspendu jusqu'au passage du ramasse-miettes, donc un
compteur incrémenté à l'ouverture et décrémenté dans un `finally` sur-déclare pendant tout
ce délai.

Mesuré au passage, et rassurant : un générateur ainsi abandonné ne consomme plus rien. Le
risque d'une connexion MJPEG oubliée par le navigateur est un compteur faux, pas une fuite
de CPU.

### Le décompte 3-2-1 vit dans le frontend

Il ne pilote rien côté serveur, ne survit pas à un rechargement de page, et le faire
remonter imposerait un aller-retour par seconde pour un effet purement visuel. Le
déclenchement réel, lui, reste une transition serveur.

### Timeouts d'inactivité sur PREVIEW et REVIEW

Sans eux, un visiteur qui lance une session puis s'éloigne laisse la borne bloquée jusqu'à
intervention manuelle. Rédhibitoire pour un fonctionnement non surveillé. `PRINTING` n'en
a pas : il dépend de l'imprimante, pas du visiteur, et c'est le pilote qui porte son propre
timeout de job.

### Le flux d'impression est asynchrone dès le pilote neutre

`POST /api/session/{id}/print` soumet un job et rend la main. C'est `PrintFlow.poll()` qui
constate la fin et fait avancer la machine à états vers `DONE` ou `ERROR`.

Pour un pilote qui répond « terminé » immédiatement, un endpoint bloquant aurait été plus
court à écrire. Mais la CP1500 est une sublimation quatre passes d'environ 40 secondes :
le contrat synchrone serait à réécrire au jalon 7, en emportant avec lui la machine à
états et le polling du frontend. La feuille de route promet que le branchement de CUPS ne
demande « aucune restructuration » — cette promesse se paie ici, pas plus tard.

Conséquence visible : avec le pilote neutre, l'état `PRINTING` ne dure qu'un aller-retour
et le visiteur ne le voit pas. C'est le comportement honnête — un écran d'attente n'a de
sens que quand il y a vraiment quelque chose à attendre.

### Pas de `get_status()` sur `PrinterDriver` avant le driver CUPS

La page de santé aimerait afficher l'état de l'imprimante, et l'issue du jalon 5 nommait
la méthode. Elle n'existe pas : avec le pilote neutre elle rendrait une constante à vie.

Ajouter une méthode abstraite à une interface pour une valeur qui ne varie pas, c'est figer
une forme avant de savoir ce que `printer-state-reasons` expose réellement — donc la
réécrire au jalon 7, en emportant l'implémentation neutre avec elle. Un attribut `name`, en
miroir de `CameraCapabilities.driver_name`, suffit au besoin d'aujourd'hui : savoir
qu'aucune imprimante n'est branchée explique un état `PRINTING` qui ne dure qu'un
aller-retour.

### Le temps n'avance qu'à la lecture du statut

`poll()` et `SessionMachine.tick()` sont appelés au même endroit : la lecture de statut,
que le frontend fait deux fois par seconde.

Un ticker de fond a existé à côté, à 1 s, présenté comme un filet si le frontend cessait
d'interroger le backend. Il a été retiré : le seul état qu'il corrigeait était un état que
plus personne ne lisait — si le kiosque ne demande plus rien, il n'y a ni visiteur devant
la borne ni écran à ramener au repos, et le rechargement de l'onglet appelle `tick()`
avant d'afficher quoi que ce soit. Deux mécanismes pour une horloge, dont un sans effet
observable, c'est un mécanisme de trop.

Le sondage à la lecture reste la bonne place pour une autre raison : le frontend voit la
fin du tirage à son prochain sondage à 500 ms, et les tests n'ont pas besoin de faire
tourner une boucle asyncio pour observer une transition.

### Tout état persistant s'écrit atomiquement

Configuration d'événement, compteurs, overlay téléversé : `write_atomic` écrit à côté,
force les octets sur le disque, puis remplace d'un seul `rename`.

Un `write_text` sur un fichier existant le vide d'abord. Ces trois fichiers sont réécrits
*pendant* un événement — l'opérateur enregistre un réglage, un tirage incrémente un
compteur — et une coupure entre les deux laisse un JSON tronqué, que le prochain démarrage
jette pour repartir sur les valeurs par défaut. Perdre le nom de l'événement parce que
quelqu'un a débranché la borne au mauvais moment est évitable pour trois lignes.

Le `fsync` porte sur le fichier temporaire et **pas** sur le répertoire, volontairement.
Sans le premier, une coupure peut laisser un fichier renommé mais vide : exactement le cas
qu'on cherche à éviter. Sans le second, le pire cas est un renommage qui n'a pas eu lieu,
donc l'ancien contenu intact. Une valeur périmée se rattrape, un fichier vide non.

### Rétention : l'âge *et* le plafond d'espace

Les sessions sont purgées si elles dépassent 30 jours, **et** les plus anciennes le sont
aussi tant que le dossier dépasse 8 Go.

Un seul des deux laisserait un trou. Sans plafond, deux événements chargés dans la même
semaine remplissent la carte SD alors qu'aucune session n'a atteint l'âge limite. Sans
âge, on supprime des photos le jour même d'un gros événement, avant que l'opérateur ait
récupéré la galerie. L'âge est ce qu'un opérateur règle et comprend ; le plafond est le
filet.

La purge tourne au démarrage et après chaque tirage terminé — moment où le visiteur
regarde sa confirmation et où personne n'attend un balayage de répertoire. La session en
cours est toujours épargnée : on ne purge pas sous les pieds d'un visiteur.

### L'archive de la galerie sort en flux, avec la seule stdlib

`zipfile` détecte une cible d'écriture dépourvue de `seek` et de `tell`, et bascule alors
sur les descripteurs de données au lieu de revenir corriger ses en-têtes. Un objet puits de
dix lignes remplace donc un temporaire de plusieurs gigaoctets sur la carte SD, sans
dépendance ajoutée. Le pic mémoire vaut une photo.

`ZIP_STORED` et non `ZIP_DEFLATED` : du JPEG est déjà compressé, et le déflater prendrait
tout le CPU d'un Pi pour quelques pour cent. L'archive d'une soirée se télécharge pendant
que l'opérateur range le matériel, pas pendant qu'il attend.

### Vignettes à la demande, sans cache

`Image.draft()` demande au décodeur JPEG de sous-échantillonner dans le domaine DCT :
l'image pleine résolution n'est jamais reconstituée, et une vignette coûte une fraction
d'un décodage complet. C'est ce qui rend l'absence de cache tenable, donc l'absence de
fichiers à invalider quand un `retake` recompose un `final.jpg`.

**À rouvrir si** la grille devenait lente sur le Pi. La réponse serait alors un `thumb.jpg`
écrit à côté de `final.jpg` — jamais un cache en mémoire, qui se viderait au redémarrage
justement quand l'opérateur en aurait besoin.

### « Je garde cette photo », pas « Imprimer »

Pendant la phase numérique, rien ne sort physiquement. Un bouton « Imprimer » promettrait
au visiteur un tirage qu'il n'aura pas, et il attendrait devant la borne.

Le libellé deviendra « Imprimer » au jalon 7. C'est une chaîne de caractères, pas un
parcours : la transition, l'état `PRINTING` et l'écran de confirmation ne bougent pas.

### Un compteur n'existe qu'accompagné de ce qui le remet à zéro

`data/counters.json` porte deux compteurs : le cumul de l'événement et celui de la
cartouche. Les deux questions sont distinctes — « combien de photos cet événement a-t-il
produit » contre « me reste-t-il du papier », et les cartouches de la CP1500 font 36, 54
ou 108 tirages.

Le second a été **retiré** au jalon 4 puis remis au jalon 5, et c'est la règle qui compte :
il n'existait aucune interface pour le réarmer. Il valait donc toujours exactement le
premier, avec un `reset_at` qui restait `null` à vie. Un compteur sans son bouton n'est pas
la moitié de la fonctionnalité, c'est une copie du cumul sous un autre nom. Il est revenu
avec `POST /admin/counters/reset` et le bouton qui l'appelle, pas avant.

Un fichier écrit avant son retour se relit avec le compteur de cartouche replié sur le
cumul, jamais sur zéro : aucune remise à zéro n'a eu lieu, donc la cartouche a bien vu
passer tous les tirages. Repartir de zéro annoncerait du papier qui n'existe pas.

Fichier absent ou corrompu : on repart de zéro en journalisant, jamais un refus de
démarrer. Même arbitrage que pour la configuration d'événement — un compteur faux se
corrige, une borne éteinte un samedi soir non.

## Outillage

### Frontend en React + Tailwind, un projet à deux points d'entrée

Le vanilla tenait pour deux écrans mais pas pour la trajectoire : le portail
d'administration demande des formulaires, un téléversement avec retour de validation et
une galerie paginée. Bascule faite tôt parce qu'elle coûtait peu tant que le frontend
restait un simple afficheur d'état.

Un seul projet Vite pour les deux interfaces plutôt que deux : jetons de design, client
d'API et composants partagés, un seul arbre de dépendances.

### Le portail est une page qui défile, pas des onglets

Trois sections — santé, événement, galerie — sur une seule page. Ni routeur ni sélecteur
d'onglets. L'opérateur est sur un PC devant un écran qui défile, et un mécanisme de
navigation pour trois sections est du câblage sans besoin. Il coûterait en plus une
position de page à conserver dans l'URL, donc une source de vérité de plus.

**À rouvrir si** la page devient illisible, ce qui arrivera si la sélection d'imprimante du
jalon 7 s'y ajoute avec ses propres réglages.

### uv pour Python, pnpm pour Node

Un piège spécifique à ce projet, documenté dans le README : uv télécharge volontiers ses
propres CPython, et un interpréteur uv ne verrait jamais `/usr/lib/python3/dist-packages`
où apt installe `python3-picamera2`. Sur le Pi il faut épingler
`--python /usr/bin/python3`. Le symptôme — `import picamera2` qui échoue sans raison
apparente — ne se devine pas.

`pnpm-workspace.yaml` autorise nommément le script d'installation d'esbuild. pnpm les
bloque tous par défaut, ce qui est un bon réflexe : une dépendance transitive ne doit pas
exécuter du code sans décision explicite.

### La caméra de synthèse produit un flux animé

Mire mouvante, horodatage, compteur de frames. Un JPEG statique ne permettrait pas de
distinguer un flux MJPEG vivant d'un flux gelé — qui est justement le mode de défaillance
de cette architecture. Un mock statique masquerait le bug qu'on cherche à voir.

Les mires de couleur fixes servent à juger un filtre N&B ou sépia d'un coup d'œil.

### L'application n'écrit jamais d'overlay d'elle-même

`python -m dropyourmoment.tools.make_overlay` est explicite et manuel. Un cadre de
démonstration apparaissant sur les photos d'un vrai mariage serait pire que pas de cadre
du tout.

### Docker reporté

Trois raisons concrètes :

- `picamera2` exige `/dev/dma_heap`, `/dev/video*`, `/run/udev` et une pile libcamera
  alignée sur l'hôte. Fragile en conteneur, et inutile en développement où l'on utilise le
  pilote de synthèse.
- L'isolation réseau repose sur les adresses de bind, que Docker réécrit : `127.0.0.1`
  dans un conteneur n'est pas la boucle locale de l'hôte. La garantie se perdrait sans
  qu'aucun test ne le voie.
- CUPS est un démon de l'hôte ; imprimer depuis un conteneur ajouterait une couche.

**À rouvrir si** un besoin concret apparaît : seconde machine de développement, image de
démonstration à montrer, ou hébergement du portail d'administration ailleurs que sur le
Pi. L'option retenue serait alors une image de démonstration — backend, pilote de synthèse
et frontend construit — explicitement pas le chemin de déploiement de la borne.

## Dettes assumées

| dette | pourquoi acceptée | quand la traiter |
|---|---|---|
| Portail d'administration sans authentification | Accès LAN pendant un événement, réseau maîtrisé. À noter qu'il expose désormais les photos de l'événement en téléchargement, et non plus seulement un diagnostic | Si l'usage sort de ce cadre : multi-sites, réseau partagé, ou un événement où les invités ont le mot de passe du wifi |
| Types d'API TypeScript écrits à la main | Surface petite, tenable | Si elle grossit : génération depuis le schéma OpenAPI que FastAPI expose déjà |
| Pas de linter JavaScript | TypeScript en mode strict couvre l'essentiel | Si des règles de style deviennent un sujet |
| État de session en mémoire, perdu au redémarrage | Le visiteur recommence, sans gravité | Jamais, sauf besoin d'audit |
