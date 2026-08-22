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

### « Je garde cette photo », pas « Imprimer »

Pendant la phase numérique, rien ne sort physiquement. Un bouton « Imprimer » promettrait
au visiteur un tirage qu'il n'aura pas, et il attendrait devant la borne.

Le libellé deviendra « Imprimer » au jalon 7. C'est une chaîne de caractères, pas un
parcours : la transition, l'état `PRINTING` et l'écran de confirmation ne bougent pas.

### Un seul compteur de tirages tant que rien ne sait le remettre à zéro

`data/counters.json` porte le cumul, et lui seul.

Il en a porté deux : le cumul, et un compteur de cartouche « depuis remise à zéro ». Les
deux questions sont bien distinctes — « combien de photos cet événement a-t-il produit »
contre « me reste-t-il du papier », et les cartouches de la CP1500 font 36, 54 ou 108
tirages. Mais aucune interface ne remettait le second à zéro : il valait donc toujours
exactement le premier, avec un champ `reset_at` qui restait `null` à vie.

Les deux reviennent ensemble au jalon 5, avec la page de santé qui les affiche et le
bouton qui réarme le compteur de cartouche. Un compteur sans son bouton n'est pas la
moitié de la fonctionnalité, c'est une copie du cumul sous un autre nom.

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
| Portail d'administration sans authentification | Accès LAN pendant un événement, réseau maîtrisé | Si l'usage sort de ce cadre : multi-sites, réseau partagé |
| Types d'API TypeScript écrits à la main | Surface petite, tenable | Si elle grossit : génération depuis le schéma OpenAPI que FastAPI expose déjà |
| Pas de linter JavaScript | TypeScript en mode strict couvre l'essentiel | Si des règles de style deviennent un sujet |
| État de session en mémoire, perdu au redémarrage | Le visiteur recommence, sans gravité | Jamais, sauf besoin d'audit |
