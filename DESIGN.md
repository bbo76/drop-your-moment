---
name: Drop Your Moment — Kiosk
description: Un système de signalétique événementielle tactile, direct et hospitalier.
viewport:
  canonicalWidth: 1024
  canonicalHeight: 600
  devicePixelRatio: 1
  orientation: landscape
colors:
  action-yellow: "#ffd400"
  night-field: "#101418"
  operational-surface: "#1a2026"
  structural-edge: "#46515c"
  warm-body: "#f6f4ed"
  muted-steel: "#aab2b9"
  warning-coral: "#ff8a65"
  warning-depth: "#3b211c"
  admin-mist: "#f7f7f6"
  admin-paper: "#ffffff"
  admin-ink: "#121212"
  admin-positive: "#198754"
  admin-negative: "#ba3028"
  admin-warning: "#b56313"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Barlow Semi Condensed, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Barlow Semi Condensed, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Barlow Semi Condensed, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Barlow Semi Condensed, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  control: "0.75rem"
  block: "0.9rem"
  compact: "0.6rem"
  pill: "999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "2rem"
  xxl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.action-yellow}"
    textColor: "{colors.night-field}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 2rem"
    height: "4rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.warm-body}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1.5rem"
    height: "3.5rem"
  panel:
    backgroundColor: "{colors.operational-surface}"
    textColor: "{colors.warm-body}"
    rounded: "{rounded.block}"
    padding: "0.85rem"
  status-ready:
    backgroundColor: "{colors.action-yellow}"
    textColor: "{colors.night-field}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1.25rem"
    height: "3rem"
---

# Design System: Drop Your Moment — Kiosk

## Overview

**Creative North Star: "Le Quai des Moments"**

Le kiosk transpose la clarté d'une grande signalétique de transport dans un photobooth événementiel chaleureux. Chaque écran conduit vers une décision évidente avec une composition stricte, une typographie monumentale et des contrôles dimensionnés pour le doigt sur le Waveshare 7 pouces paysage de 1024×600 px à DPR 1.

Le champ presque noir calme l'environnement tandis que le jaune saturé agit comme un signal opérationnel rare et immédiat. Le matériau reste plat et franc : aplats, bordures structurelles et changements d'état nets remplacent les effets décoratifs. La voix française est brève, rassurante et hospitalière, sans jargon pour les invités.

**Key Characteristics:**

- Une décision principale par écran, placée dans une structure plein cadre.
- Une hiérarchie lourde et condensée lisible debout et rapidement.
- Un jaune de signal réservé aux actions primaires, états actifs et confirmations.
- Des surfaces plates, alignées et séparées par le ton ou une bordure franche.
- Des cibles tactiles généreuses et des états toujours exprimés autrement que par la couleur seule.

## Colors

La palette oppose un champ nocturne à un signal jaune très saturé, puis utilise des gris acier et un corail chaud pour les informations secondaires et les incidents.

### Primary

- **Jaune signal**: action principale, sélection active, état prêt, bande de décision du décompte et panneau de confirmation.

### Secondary

- **Corail d'intervention**: avertissements et états demandant une action humaine ; il n'est jamais utilisé comme décoration.
- **Profondeur d'alerte**: fond sombre des messages d'erreur persistants, associé au texte corail.

### Neutral

- **Champ nocturne**: fond dominant et encre sur le jaune.
- **Surface opérationnelle**: panneaux de revue et blocs de maintenance.
- **Arête structurelle**: bordures, séparateurs, contrôles inactifs et piste de bascule.
- **Blanc chaud**: texte principal et repère lumineux.
- **Acier discret**: texte secondaire, légendes et contours de saisie incomplets.

### Named Rules

**The Signal Yellow Rule.** Le jaune indique une action, une sélection, un état prêt ou une confirmation ; il ne remplit jamais l'écran comme simple ambiance.

Le jaune signal est la valeur par défaut, mais l'opérateur peut remplacer cette couleur
par événement. La couleur d'encre sur l'accent est alors calculée selon sa luminance afin
de conserver un contraste fort. Le champ nocturne et les surfaces opérationnelles restent
stables pour préserver l'identité et la lisibilité de la borne.

**The Redundant State Rule.** Toute couleur d'état est accompagnée d'un libellé, d'un point, d'une position ou d'un changement de remplissage.

## Typography

**Display Font:** Barlow Semi Condensed avec repli sans-serif  
**Body Font:** Barlow Semi Condensed avec repli sans-serif

Le grand message du launch screen peut adopter dix voix distinctes : Barlow Semi Condensed
pour **Moderne**, Montserrat pour **Graphique**, Playfair Display pour **Prestigieuse**,
Cormorant Garamond pour **Romantique**, Bodoni Moda pour **Couture**, Caveat pour
**Manuscrite**, Dancing Script pour **Calligraphique**, Lobster pour **Festive**, Fredoka
pour **Ludique** et Creepster pour **Halloween**. Ces fontes sont auto-hébergées et ne
s'étendent jamais aux consignes ni aux contrôles.

**Character:** Une seule famille condensée porte tout le système. La graisse 700 donne
l'autorité de la signalétique permanente et la graisse 900 reste réservée au décompte ;
les graisses 400 à 600 gardent les explications humaines et compactes.

### Hierarchy

- **Message événementiel** (700, 3.75rem): titre personnalisable du launch screen ; sa famille dépend de l'ambiance choisie.
- **Titre d'écran** (700, 1.875–3rem): Maintenance, Impression, Santé et messages de fin ; la taille, non le noir typographique, lui donne l'autorité.
- **Titre de section** (600, 1.25–1.5rem): groupes de réglages et actions contextuelles.
- **Valeur opérationnelle** (700, taille variable, chiffres tabulaires): papier restant, CPU, RAM et états qui doivent être balayés rapidement.
- **Action tactile** (500, 1.125–1.25rem): boutons et choix ; la surface, la taille et le contraste signalent l'interactivité sans ajouter une emphase typographique concurrente.
- **Texte courant** (400, 1–1.25rem): consignes et explications.
- **Métadonnée** (400–500, 0.875–1rem): délais, compteurs secondaires et descriptions en ton acier.

### Named Rules

**The Weight Budget Rule.** La graisse 900 appartient uniquement au chiffre animé du décompte. Les écrans permanents plafonnent à 700 ; taille, espacement, position et couleur construisent le reste de la hiérarchie.

Les titres d'écran et valeurs critiques utilisent 700, les titres de section 600, les
actions et libellés 500, et le descriptif 400. Cette retenue évite que les écrans
opérationnels présentent chaque information comme également urgente.

## Layout

Le kiosk occupe exactement une matrice canonique de **1024×600 px à DPR 1** et ne défile
pas. Les écrans invités suivent une composition centrée ou une séparation image/action en
deux colonnes ; l'aperçu réserve une barre d'action horizontale en pied. Les espacements
récurrents vont de 0.5rem à 2.5rem et restent réguliers à l'intérieur d'une même zone.

La grille de référence utilise un bord de 12 à 20 px selon l'écran, des gouttières de 12 à
16 px et des cibles tactiles de **56 px minimum**. L'action principale mesure 64 px de
haut. À cette densité, les quatre zones de l'aperçu — consigne, minuteur, déclenchement,
sortie — tiennent sur une ligne et partagent le même axe vertical. Les aides temporelles
peuvent s'effacer avant qu'une cible tactile ne soit réduite.

L'accès PIN est un écran partagé : contenu et état de saisie à gauche, clavier de signal
fixe de 22rem à droite. La maintenance s'ouvre sur quatre grandes tuiles en grille 2×2 —
Santé, Impression, Galerie et Réglages borne — puis chaque tuile conduit à un écran
spécialisé avec un retour permanent. Les détails restent en deux zones lorsque cela
facilite le balayage visuel. À 600 px de hauteur, les marges et blocs adoptent directement
leur densité d'exploitation sans changer la hiérarchie ni introduire de défilement.

**The One Decision Rule.** Une composition peut exposer plusieurs informations, mais une seule action doit dominer visuellement chaque étape du parcours invité.

**The Fixed Kiosk Rule.** Chaque écran tient dans la fenêtre paysage ; tout ajout doit être absorbé par la grille ou la densité, pas par un scroll.

## Elevation & Depth

Le système est plat par défaut et n'utilise pas d'ombres pour empiler les panneaux. La profondeur vient des aplats nocturnes, des bordures épaisses et de la séparation des zones. Seul le chiffre animé du décompte porte une petite ombre, destinée à préserver sa lisibilité au-dessus d'une image vidéo mouvante.

**The Flat Material Rule.** Pas de verre, de flou décoratif, de dégradé d'ambiance ni d'ombre de carte ; une exception doit répondre à un besoin de lisibilité transitoire.

## Shapes

Les panneaux et contrôles utilisent des rectangles légèrement arrondis : 0.75rem pour les boutons et états, 0.9rem pour les grands blocs et 0.6rem pour les actions compactes. Les points d'état, points de PIN et poignées de bascule sont circulaires ; la piste de bascule est une capsule. Les bordures de 2px matérialisent les choix et les structures, avec 3px pour les repères circulaires.

## Components

### Buttons

- **Shape:** rectangle tactile légèrement arrondi, 64 px pour l'action principale et
  56 px minimum pour toute action secondaire ou tout choix permanent.
- **Primary:** couleur événementielle, texte contrasté en graisse 500 et padding horizontal ample.
- **Hover / Focus:** transition couleur de 160ms, contour jaune de 4px décalé de 4px au clavier ; pression tactile à 97% pendant 120ms.
- **Ghost:** fond transparent, bordure structurelle de 2px et texte blanc chaud.
- **Disabled:** opacité réduite à 40% sur l'action principale ; aucun changement de couleur seul ne porte l'état.

### Cards / Containers

- **Corner Style:** courbe compacte et constante.
- **Background:** surface opérationnelle pour les blocs ; jaune signal pour confirmation ou conclusion positive.
- **Shadow Strategy:** aucune ombre au repos.
- **Border:** 2px structurels sur les blocs et choix qui doivent rester distincts.
- **Internal Padding:** 0.85rem pour la maintenance, jusqu'à 2rem pour un panneau de confirmation invité.

### Maintenance Tiles

Les quatre destinations locales utilisent toute la surface disponible en grille 2×2. Chaque tuile associe une icône jaune de 4.25rem, un titre très lourd, un résumé opérationnel et un chevron. Toute la tuile est tactile ; aucune petite action secondaire n'y concurrence la destination. Les écrans de détail réutilisent la même barre de titre, un grand bouton Retour et l'état global de la borne.

La tuile Impression porte le résumé des copies et consommables. Réglages borne sépare
**Apparence** de **Écran & session** : l'apparence propose seize teintes événementielles
ordonnées par proximité colorimétrique sous forme de grands carrés tactiles, ainsi que douze
fontes du launch screen illustrées par un mot complet. Les noms de couleur restent dans les
libellés accessibles sans encombrer la grille. Le portail PC reste la surface de réglage avancé pour une couleur
hexadécimale libre. **Écran & session** regroupe uniquement le flash d’appoint et la durée
présélectionnée du minuteur. L’interruption forcée d’une session appartient au portail
distant : une commande locale pour « libérer » l’écran sur lequel elle s’affiche serait
une fausse action.

### Action Rail

Au repos, la barre d’aperçu aligne la consigne, le minuteur, le déclenchement et la sortie
sur une ligne de base unique. Pendant le décompte, ces contrôles s’effacent et
**« Souriez… » est centré sur la barre entière**, indépendamment des colonnes précédentes.
Le texte transitoire ne déplace jamais le flux vidéo ni la zone de décision.

L’accès maintenance par clé à molette appartient uniquement à l’accueil. Il disparaît dès
qu’une session commence afin de ne jamais recouvrir l’aperçu, la photo ou la confirmation,
et pour éviter qu’un invité interrompe le parcours au milieu d’une prise.
Un point corail sur la clé signale qu’une vérification opérateur est nécessaire, sans
exposer le diagnostic aux invités. Dans la maintenance, chaque incident associe un picto
matériel, un libellé explicite et une couleur d’état ; le picto ne remplace jamais le texte.

### Portail complet

**Creative North Star: « La Console essentielle »**

L'administration est un dashboard d'exploitation shadcn moderne, calme et compact, distinct
de la scénographie du kiosque. Barlow Semi Condensed reste la seule famille. Le fond utilise
un zinc très clair, les cartes et barres utilisent le blanc, et les rôles shadcn
`foreground` / `muted-foreground` portent respectivement l'information principale et la
métadonnée avec un contraste fort vérifié. La couleur événementielle ne traverse jamais
dans l'administration. Émeraude, ambre et rouge sont réservés aux états prêt, occupé ou à
surveiller, et incident.

Le portail pilote **une seule borne**. Il ne présente ni flotte, ni client, ni planning,
ni données commerciales. Le shell desktop utilise un `Sidebar` shadcn repliable en variante
`inset`. Son en-tête de marque associe le monogramme DY, Drop Your Moment et Administration ;
son contenu groupe Vue d'ensemble, Événement, Galerie, Diagnostic et Sécurité sous « Gestion
de la borne » ; son pied confirme la borne connectée et le réseau local. En mode icône, les
libellés deviennent des infobulles et le pied conserve son point de connexion.

Le `SidebarInset` porte une barre supérieure collante de **64 px**. Elle réunit le
déclencheur de navigation, le fil Administration / section courante et, quand la largeur le
permet, un badge « Actualisation en direct ». Son blanc légèrement translucide et son flou
servent uniquement à maintenir la lecture pendant le défilement. Le canevas zinc clair est
rembourré de 16 à 32 px selon la largeur ; le contenu reste centré dans une largeur maximale
de 80rem. Les titres d'application restent compacts : 24 px sur petit écran, 30 px sur
desktop, graisse 600 et approche serrée. Il n'y a plus de titre monumental de dashboard.

La vue d'ensemble commence toujours par la **bande de disponibilité pleine largeur**,
signature visuelle du portail. Une première cellule teintée associe un glyphe circulaire,
un verdict verbal et une explication ; trois cellules blanches donnent Écran, Caméra et
Tirages disponibles. La bande passe de l'émeraude à l'ambre ou au rouge selon l'état, avec
un anneau ton sur ton discret, mais chaque couleur reste doublée par le texte et l'icône.
Sur les largeurs étroites, les cellules se placent naturellement les unes sous les autres ;
sur desktop elles forment une seule ligne immédiatement balayable.

Sous cette bande, une grille desktop de **12 colonnes** répartit Événement actif sur cinq
colonnes, Dernières photos sur quatre et Santé du système sur trois. Les cartes blanches ont
une bordure zinc, des coins modérément arrondis, aucun effet décoratif et un en-tête compact
de 64 px. Les faits utilisent des chiffres tabulaires, des libellés en `muted-foreground`
et une valeur alignée en regard. Les quatre vignettes sont des photos API réelles avec heure ;
les chargements et états vides restent textuels. Le sondage de santé et de galerie s'effectue
toutes les deux secondes uniquement lorsque la page est visible, sans réinitialiser un
formulaire ouvert.

La configuration desktop conserve le nom et le message de l'événement, l'overlay, les
filtres, le format, les copies et le minuteur. Couleur et typographie appartiennent à la
maintenance de la borne ; le flash appartient à la borne et à la Console Jour J. La galerie
privilégie les vignettes API, la pagination et une lightbox. Le diagnostic regroupe caméra,
impression, parcours, stockage et ressources dans des cartes de lecture rapide. Sécurité
reste un formulaire court et étroit, centré sur le remplacement du PIN. Les surfaces,
champs, boutons, badges, séparateurs et alertes reprennent directement les composants et
rôles sémantiques shadcn plutôt que des couleurs administratives isolées.

La Console Jour J mobile est une vue dédiée, pas une réduction du shell desktop. `DayOfView`
est composé directement en Tailwind et réutilise les `Button` et `Feedback` partagés fondés
sur shadcn/ui. Dans une colonne plafonnée à 42rem avec prise en compte des safe areas, elle
ordonne : disponibilité, retours d'action, trois faits essentiels, geste d'urgence
conditionnel, impression, réglages rapides, puis photos récentes. La rangée Écran / Caméra /
Tirages conserve trois colonnes ; les valeurs autorisent le retour à la ligne afin que
**« 15 possibles »** reste entier et lisible sur smartphone, sans ellipse ni troncature.

Les panneaux Impression et Réglages rapides conservent les éléments natifs `<details>` /
`<summary>` : grande cible tactile, signe plus ou moins, état ouvert natif et contenu révélé
sous une séparation nette. Les réglages rapides restent limités au minuteur, au flash et aux
copies. Le retour forcé à l'accueil n'apparaît que lorsqu'une session est active et exige une
confirmation modale décrivant la conséquence. Les deux points d'entrée restent indépendants :
aucun lien ne simule un passage entre desktop et mobile.

**The Single Booth Rule.** Toute information doit décrire la borne actuelle, son événement
actuel ou ses photos. Une donnée de parc, de location, de CRM ou de planification est hors
périmètre, même si elle est courante dans les dashboards SaaS.

**The Readiness First Rule.** La première surface visible donne un verdict exploitable sur
la borne avant d'exposer configuration, métriques ou raccourcis.

**The Semantic Token Rule.** Les neutres suivent les rôles shadcn plutôt que des hexadécimaux
locaux ; émeraude, ambre et rouge ne qualifient qu'un état opérationnel et toujours avec un
libellé et une icône.

**The Two Consoles Rule.** Le desktop prépare et diagnostique ; le mobile surveille et
intervient. Une fonctionnalité n'est partagée que si elle est sûre et utile dans les deux
contextes.

**The Compact App Type Rule.** Un titre d'administration reste entre 24 et 30 px ; la
priorité vient de la grille, du poids et de l'ordre des informations, jamais d'une échelle
de landing page.

### Inputs / Fields

Le PIN ne présente pas de champ texte. Quatre points affichent la progression sans révéler le code, et un clavier numérique plein écran déclenche automatiquement la validation au quatrième chiffre. Les touches font au moins 4.5rem de haut ; « Effacer » et « Retour » utilisent une variante transparente dans le même gabarit.

### Status and Choices

Les états associent un glyphe explicite et un libellé ; l'état prêt local reste léger, sans
fond de bouton. Les choix tactiles conservent `aria-pressed` et combinent remplissage, coche
ou changement de position. Une aide affichée doit tenir intégralement : elle passe sous son
titre plutôt que d'être tronquée.

La bascule de réglage n'est jamais enfermée dans une seconde bordure. Lorsque le titre de
la rangée nomme déjà sans ambiguïté le réglage, la piste et le déplacement physique de la
poignée suffisent et aucun texte « Activé » ou « Désactivé » n'est répété à l'écran ; un
libellé dynamique reste exposé aux technologies d'assistance. Sur la maintenance locale,
la piste active utilise le gris clair opérationnel et jamais la couleur de l'événement.

### Capture Countdown

Le chiffre monumental apparaît dans un carré d'accent parfaitement centré au milieu du flux. Il occupe environ 30% du plus petit côté de l'écran afin de rester lisible depuis la zone de pose. Son animation verticale de 720ms révèle puis retire le bloc ; elle est rejouée pour chaque chiffre et réduite à un état quasi instantané lorsque l'utilisateur demande moins de mouvement.

### Framing Guide

Deux masques noirs translucides assombrissent les zones rognées de l'aperçu. Une paire de
pointillés blancs délimite la zone conservée, soutenue par la consigne concise
« Cadrez-vous entre les pointillés ». Le guide compare le flux caméra et le format de
tirage ; le ratio 1024:600 de l'écran ne doit jamais être confondu avec l'un ou l'autre.

## Do's and Don'ts

### Do:

- **Do** garder l'action principale jaune, noire, lourde et nettement plus présente que les sorties secondaires.
- **Do** dimensionner les contrôles pour le doigt avec une hauteur minimale observée de 3.4rem à 4.5rem selon leur importance.
- **Do** maintenir les alignements stricts des zones image, décision, santé et réglages.
- **Do** écrire des consignes françaises courtes, chaleureuses et immédiatement actionnables.
- **Do** respecter `prefers-reduced-motion` pour toutes les transitions et animations.

### Don't:

- **Don't** utiliser le jaune comme fond décoratif généralisé ou multiplier les actions jaunes concurrentes.
- **Don't** ajouter de verre, de dégradé décoratif ou d'ombres de cartes à ce matériau plat.
- **Don't** exposer de jargon technique dans le parcours invité.
- **Don't** compter sur le survol, un pointeur précis ou la couleur seule pour expliquer un état.
- **Don't** introduire du défilement sur la surface kiosk.
