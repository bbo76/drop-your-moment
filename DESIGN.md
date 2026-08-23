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
**Apparence** de **Écran & session** : l'apparence propose dix teintes événementielles
nommées et contrastées plutôt qu'un color picker impraticable au doigt, ainsi que les dix
fontes du launch screen. Le portail PC reste la surface de réglage avancé pour une couleur
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

L'administration est un outil neutre, distinct de la scénographie du kiosque. Elle utilise
un fond gris froid, des surfaces blanches, une encre sombre, un bleu fonctionnel et un rouge
d'incident fixes ; la couleur choisie pour le mariage n'y est jamais appliquée. La
typographie reste Barlow Semi Condensed pour conserver une parenté discrète sans reprendre
le branding événementiel.

Deux points d'accès servent deux usages sans navigation entre eux. Le backoffice complet
sur `admin.html` est destiné au laptop : identité, overlay, format, sécurité, diagnostic et
galerie. La console `mobile.html` est strictement opérationnelle : un grand signal annonce
si la borne est prête, occupée ou demande une intervention, puis parcours, matériel,
impression, réglages rapides et photos récentes suivent l'ordre d'urgence. Les deux entrées
partagent les API et les composants ; la maintenance tactile locale du kiosque conserve son
interface et son thème propres.

### Inputs / Fields

Le PIN ne présente pas de champ texte. Quatre points affichent la progression sans révéler le code, et un clavier numérique plein écran déclenche automatiquement la validation au quatrième chiffre. Les touches font au moins 4.5rem de haut ; « Effacer » et « Retour » utilisent une variante transparente dans le même gabarit.

### Status and Choices

Les bannières associent remplissage, point et libellé en graisse noire. Les choix tactiles passent d'un contour acier transparent à un remplissage jaune avec texte nocturne et conservent `aria-pressed`. La bascule combine un libellé explicite, une piste colorée et le déplacement physique de sa poignée.

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
