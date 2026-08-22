/* Drop Your Moment — kiosque.
 *
 * Ce fichier n'implémente aucune règle de parcours : il affiche l'état renvoyé par le
 * backend et lui transmet les gestes du visiteur. La machine à états vit côté serveur,
 * ce qui permettra à un autre frontend (tablette, Mac) de consommer la même API sans
 * réimplémenter la logique.
 */

const POLL_INTERVAL_MS = 500;
const RETURN_HINT_THRESHOLD_S = 20;

const screens = new Map(
  [...document.querySelectorAll("[data-screen]")].map((el) => [el.dataset.screen, el]),
);

const el = {
  preview: document.querySelector('[data-role="preview"]'),
  framing: document.querySelector('[data-role="framing"]'),
  framingHint: document.querySelector('[data-role="framing-hint"]'),
  countdown: document.querySelector('[data-role="countdown"]'),
  hardwareWarning: document.querySelector('[data-role="hardware-warning"]'),
  errorMessage: document.querySelector('[data-role="error-message"]'),
  startButton: document.querySelector('[data-action="start"]'),
};

// Les états que le jalon 1 sait afficher. Les suivants (review, printing, done) arrivent
// avec la capture ; un état inconnu est signalé au lieu d'être avalé silencieusement.
const STATE_SCREENS = {
  idle: "idle",
  preview: "preview",
  error: "error",
};

let systemStatus = null;
let shownScreen = null;

async function getJSON(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json();
}

async function postJSON(path) {
  const response = await fetch(path, { method: "POST", cache: "no-store" });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json();
}

function showScreen(name) {
  if (name === shownScreen) return;
  for (const [key, node] of screens) {
    node.toggleAttribute("data-active", key === name);
  }
  // Le flux MJPEG est attaché en entrant sur l'écran preview et détaché en sortant.
  // Laisser la connexion ouverte n'aurait aucun coût CPU (le serveur cesse d'encoder dès
  // la déconnexion), mais la rattacher sans cache-buster ferait resservir par Chromium
  // une frame mise en cache — ce qui se voit comme une image gelée.
  if (name === "preview") attachPreview();
  else detachPreview();
  shownScreen = name;
}

function attachPreview() {
  el.preview.src = `/api/preview/stream?t=${Date.now()}`;
}

function detachPreview() {
  // removeAttribute plutôt que src = "" : une chaîne vide déclencherait une requête vers
  // l'URL de la page elle-même.
  el.preview.removeAttribute("src");
}

/* Dessine le repère de la zone réellement conservée au recadrage.
 *
 * Trois ratios cohabitent — capteur, format de sortie, écran. Sans ce repère, les
 * visiteurs se cadrent sur toute la largeur du preview et se retrouvent coupés. */
function applyFraming({ preview_size: [width, height], print_aspect_ratio: printAspect }) {
  const previewAspect = width / height;
  document.documentElement.style.setProperty("--preview-aspect", `${width} / ${height}`);

  const cropsWidth = printAspect < previewAspect;
  const kept = cropsWidth ? printAspect / previewAspect : previewAspect / printAspect;
  const maskShare = Math.max(0, (1 - kept) / 2);

  el.framing.dataset.axis = cropsWidth ? "horizontal" : "vertical";
  document.documentElement.style.setProperty("--framing-mask", `${(maskShare * 100).toFixed(2)}%`);
}

function renderSystemStatus(status) {
  systemStatus = status;
  applyFraming(status);

  el.startButton.disabled = !status.camera_ok;
  el.hardwareWarning.hidden = status.camera_ok;
  if (!status.camera_ok) {
    el.hardwareWarning.textContent =
      "Caméra non détectée — prévenez l'organisateur.";
  }

  el.framingHint.textContent = `Cadre imprimé : ${status.print_format_name}`;
}

function renderSessionStatus(status) {
  const screen = STATE_SCREENS[status.state];
  if (!screen) {
    console.warn("état non géré par ce frontend :", status.state);
    return;
  }
  showScreen(screen);

  if (status.state === "error") {
    el.errorMessage.textContent = status.error
      ? "Impossible de continuer. Réessayez dans un instant."
      : "Une erreur est survenue.";
  }

  const remaining = status.remaining_seconds;
  el.countdown.textContent =
    remaining !== null && remaining <= RETURN_HINT_THRESHOLD_S
      ? `Retour à l'accueil dans ${Math.ceil(remaining)} s`
      : "";
}

async function poll() {
  try {
    // Le statut système n'est relu que si on l'a perdu : il ne change qu'au branchement
    // ou débranchement d'un périphérique.
    if (!systemStatus) renderSystemStatus(await getJSON("/api/system/status"));
    renderSessionStatus(await getJSON("/api/status"));
  } catch (error) {
    console.error(error);
    systemStatus = null;
    showScreen("offline");
  }
}

el.startButton.addEventListener("click", async () => {
  el.startButton.disabled = true;
  try {
    renderSessionStatus(await postJSON("/api/session"));
  } catch (error) {
    console.error(error);
    showScreen("offline");
  } finally {
    el.startButton.disabled = !systemStatus?.camera_ok;
  }
});

document.querySelector('[data-action="cancel"]').addEventListener("click", async () => {
  try {
    renderSessionStatus(await postJSON("/api/session/cancel"));
  } catch (error) {
    console.error(error);
  }
});

// Sur une borne, ni menu contextuel ni double-tap zoom.
document.addEventListener("contextmenu", (event) => event.preventDefault());

showScreen("loading");
poll();
setInterval(poll, POLL_INTERVAL_MS);
