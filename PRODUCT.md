# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Les invités utilisent le photobooth debout, au doigt, sur un écran tactile Waveshare
  7 pouces IPS de 1024×600 px, en paysage et à DPR 1.
  Ils doivent réussir leur photo sans explication ni présence permanente d'un opérateur.
- L'organisateur ou le technicien intervient ponctuellement sur ce même écran pour
  diagnostiquer la borne et effectuer les gestes de maintenance urgents pendant un
  événement.
- Un opérateur prépare l'événement et récupère les photos depuis le portail
  d'administration complet sur un ordinateur du réseau local.

## Product Purpose

Drop Your Moment fait fonctionner un photobooth autonome : aperçu en direct, prise de vue,
choix du rendu, conservation ou impression de la photo, puis remise à disposition de la
borne. Le produit est réussi lorsque le parcours invité est évident et que les incidents
courants peuvent être compris et corrigés rapidement sur place.

## Positioning

La logique de parcours et la possession du matériel restent dans un backend local unique,
sans dépendance Internet. Le même produit sert une interface invité très réduite, une
maintenance tactile locale protégée et une administration complète sur le LAN.

## Operating Context

- Écran Waveshare 7 pouces IPS 1024×600 intégré à un caisson, utilisé en paysage, debout
  et principalement au doigt. Cette définition est le viewport canonique du kiosque ;
  elle doit toujours être vérifiée à 100 %, sans mise à l’échelle du navigateur.
- Raspberry Pi, module caméra Pi et Canon Selphy CP1500 sur la borne finale.
- Webcam ou caméra synthétique sur MacBook pour développer et valider tout le logiciel qui
  ne dépend pas du matériel final.
- Lumière, bruit, affluence et pression temporelle variables pendant les événements.
- Le mode maintenance local doit fonctionner sans clavier et revenir au parcours invité
  après inactivité.

## Capabilities and Constraints

- Le kiosque écoute uniquement sur la boucle locale ; le portail complet reste accessible
  depuis le LAN sur une socket séparée.
- Le parcours invité est piloté par une machine à états côté serveur.
- La maintenance locale est protégée par un code PIN et expose seulement les diagnostics
  et réglages utiles pendant l'événement.
- La maintenance locale inclut au minimum la santé caméra, stockage et impression, les
  consommables, le nombre de copies, le flash écran et le minuteur photo par défaut.
- L’interruption forcée d’une session est une commande distante du portail complet ; elle
  n’est pas présentée sur la borne, dont la fermeture de maintenance suffit à rendre la
  main au parcours invité.
- La configuration d'overlay, la galerie, l'archive et les réglages de format restent dans
  le portail d'administration complet.
- L'authentification du portail LAN complet reste hors périmètre du MVP.
- Les fonctions Raspberry Pi et impression réelle restent en attente du matériel.

## Brand Commitments

Le produit s'appelle « Drop Your Moment ». La voix est directe, chaleureuse et rassurante,
avec des consignes courtes en français. L'interface ne doit jamais exposer du jargon
technique aux invités.

## Evidence on Hand

- Le parcours, les API et les décisions produit sont documentés dans `README.md` et
  `docs/`.
- Les interfaces React existantes et leurs jetons sont dans `frontend/src/`.
- Aucun logo, caractère typographique propriétaire ni charte de marque externe n'est
  fourni ; les futurs travaux ne doivent pas en fabriquer ou en revendiquer.

## Product Principles

1. Un écran, une décision principale.
2. Tout geste critique doit être possible au doigt, rapidement et sans clavier.
3. La borne explique l'action attendue ; les détails techniques restent en maintenance.
4. Une panne doit mener à une issue sûre : réessayer, revenir à l'accueil ou appeler
   l'organisateur.
5. Les réglages de préparation et les gestes d'urgence ne doivent pas encombrer le même
   écran.

## Accessibility & Inclusion

Les cibles tactiles doivent rester généreuses, les états ne doivent jamais reposer sur la
couleur seule, le contraste doit rester lisible en environnement lumineux et les animations
doivent respecter `prefers-reduced-motion`.

> Les éléments de ce document ont été inférés du dépôt et du brief explicite du 23 août
> 2026, le demandeur ayant délégué les arbitrages de périmètre et d'interface.
