import { useState } from "react";
import { ArrowBigUp, Delete, Eye, EyeOff, Globe2, LoaderCircle, Radio, Router, Trash2, Wifi, WifiOff } from "lucide-react";

import { api, type HotspotStatus, type WifiNetwork, type WifiStatus } from "@/api/client";
import { MaintenanceDialog } from "./MaintenanceUi";

type Step = "overview" | "networks" | "password" | "hidden";

export function MaintenanceNetworkView({ hotspot, wifi, saving, onChangeHotspot, onConnectWifi, onDisconnectWifi, onForgetWifi }: {
  hotspot: HotspotStatus;
  wifi: WifiStatus;
  saving: boolean;
  onChangeHotspot: (action: "activate" | "deactivate") => Promise<void>;
  onConnectWifi: (ssid: string, options?: { password?: string; profile?: string; hidden?: boolean }) => Promise<void>;
  onDisconnectWifi: () => Promise<void>;
  onForgetWifi: (profile: string) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("overview");
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selected, setSelected] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [profileToForget, setProfileToForget] = useState<WifiNetwork | null>(null);
  const [hiddenToConnect, setHiddenToConnect] = useState<{ ssid: string; password: string } | null>(null);
  const [qrKind, setQrKind] = useState<"wifi" | "portal">("wifi");

  const scan = async () => {
    setStep("networks");
    setScanning(true);
    setScanError(null);
    try {
      const [visible, profiles] = await Promise.all([api.scanWifi(), api.wifiProfiles()]);
      const visibleProfiles = new Set(visible.flatMap((network) => network.profile ? [network.profile] : []));
      setNetworks([
        ...visible,
        ...profiles.filter((profile) => !visibleProfiles.has(profile.name)).map((profile) => ({
          ssid: profile.ssid,
          signal: 0,
          security: "Profil mémorisé · hors portée",
          active: false,
          profile: profile.name,
        })),
      ]);
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : "Recherche des réseaux impossible.");
    } finally {
      setScanning(false);
    }
  };

  const choose = (network: WifiNetwork) => {
    setSelected(network);
    setPassword("");
    if (network.profile || network.security === "Ouvert") requestConnection(network);
    else setStep("password");
  };

  const requestConnection = (network = selected) => {
    if (!network) return;
    if (hotspot.active) setConfirmSwitch(true);
    else void connect(network);
  };

  const connect = async (network = selected) => {
    if (!network && !hiddenToConnect) return;
    try {
      if (hiddenToConnect) {
        await onConnectWifi(hiddenToConnect.ssid, {
          password: hiddenToConnect.password,
          hidden: true,
        });
      } else if (network) {
        await onConnectWifi(network.ssid, {
          password: password || undefined,
          profile: network.profile || undefined,
        });
      }
      setConfirmSwitch(false);
      setHiddenToConnect(null);
      setStep("overview");
    } catch {
      setConfirmSwitch(false);
    } finally {
      setPassword("");
      setHiddenToConnect(null);
    }
  };

  const switchConfirmation = confirmSwitch && <MaintenanceDialog label="Confirmer le changement de réseau" onCancel={() => { setConfirmSwitch(false); setHiddenToConnect(null); setPassword(""); }}><div className="w-full max-w-2xl rounded-panel border-2 border-warn bg-ink p-8"><Radio className="size-12 text-warn" /><h2 className="mt-4 text-3xl font-bold">Passer au Wi-Fi « {hiddenToConnect?.ssid ?? selected?.ssid} » ?</h2><p className="mt-4 text-xl text-muted">Le réseau opérateur sera coupé et les appareils connectés perdront leur accès. Il sera restauré si la connexion échoue.</p><div className="mt-8 grid grid-cols-2 gap-3"><button type="button" autoFocus className="min-h-16 rounded-panel border-2 border-edge text-xl font-semibold" onClick={() => { setConfirmSwitch(false); setHiddenToConnect(null); setPassword(""); }}>Annuler</button><button type="button" disabled={saving} className="min-h-16 rounded-panel bg-warn text-xl font-bold text-ink disabled:opacity-40" onClick={() => void connect()}>Changer de réseau</button></div></div></MaintenanceDialog>;

  if (step === "password" && selected) {
    return <><PasswordScreen ssid={selected.ssid} password={password} revealed={revealed} saving={saving} onPassword={setPassword} onReveal={() => setRevealed((value) => !value)} onBack={() => { setPassword(""); setStep("networks"); }} onConnect={() => requestConnection()} />{switchConfirmation}</>;
  }

  if (step === "hidden") {
    return <><HiddenNetworkScreen saving={saving} onBack={() => setStep("networks")} onConnect={async (ssid, hiddenPassword) => {
      if (hotspot.active) {
        setHiddenToConnect({ ssid, password: hiddenPassword });
        setConfirmSwitch(true);
        return;
      }
      await onConnectWifi(ssid, { password: hiddenPassword || undefined, hidden: true });
      setStep("overview");
    }} />{switchConfirmation}</>;
  }

  if (step === "networks") {
    return <section className="grid min-h-0 grid-rows-[auto_1fr] gap-3">
      <div className="flex items-center justify-between rounded-panel bg-surface px-5 py-3">
        <div><h2 className="text-2xl font-semibold">Choisir un Wi-Fi</h2><p className="text-base text-muted">Les réseaux les plus puissants apparaissent en premier.</p></div>
        <div className="flex gap-3"><button type="button" className="min-h-14 rounded-panel border-2 border-edge px-4 text-lg font-semibold" onClick={() => setStep("hidden")}>Réseau masqué</button><button type="button" className="min-h-14 rounded-panel border-2 border-edge px-4 text-lg font-semibold" onClick={() => setStep("overview")}>Annuler</button><button type="button" disabled={scanning} className="min-h-14 rounded-panel border-2 border-signal px-4 text-lg font-semibold text-signal disabled:opacity-40" onClick={() => void scan()}>Actualiser</button></div>
      </div>
      <div className="min-h-0 overflow-y-auto rounded-panel bg-surface p-2 [scrollbar-color:var(--color-edge)_var(--color-surface)]">
        {scanning && <p className="flex h-full items-center justify-center gap-3 text-xl text-muted"><LoaderCircle className="size-7 animate-spin" /> Recherche des réseaux…</p>}
        {!scanning && scanError && <p className="grid h-full place-items-center px-8 text-center text-xl text-warn">{scanError}</p>}
        {!scanning && !scanError && networks.length === 0 && <p className="grid h-full place-items-center text-xl text-muted">Aucun réseau détecté. Rapprochez la borne du point d’accès.</p>}
        {!scanning && !scanError && networks.map((network) => <div key={`${network.ssid}:${network.profile ?? "visible"}`} className="grid grid-cols-[1fr_auto] border-b-2 border-edge last:border-0"><button type="button" disabled={saving} onClick={() => choose(network)} className="grid min-h-18 grid-cols-[4rem_1fr_auto] items-center gap-3 px-3 text-left active:bg-edge disabled:opacity-40"><SignalBars signal={network.signal} /><span><strong className="block text-xl font-semibold">{network.ssid}</strong><small className="text-base text-muted">{network.profile ? `${network.security} · mémorisé` : network.security}</small></span><span className="text-base text-muted">{network.signal ? `${network.signal}%` : "—"}</span></button>{network.profile && <button type="button" disabled={saving} onClick={() => setProfileToForget(network)} className="grid min-w-16 place-items-center text-muted active:text-warn disabled:opacity-40" aria-label={`Oublier le réseau ${network.ssid}`}><Trash2 className="size-6" /></button>}</div>)}
      </div>
      {profileToForget?.profile && <MaintenanceDialog label="Confirmer l’oubli du réseau" onCancel={() => setProfileToForget(null)}><div className="w-full max-w-xl rounded-panel border-2 border-warn bg-ink p-8"><Trash2 className="size-12 text-warn" /><h2 className="mt-4 text-3xl font-bold">Oublier « {profileToForget.ssid} » ?</h2><p className="mt-4 text-xl text-muted">La borne ne pourra plus s’y reconnecter sans saisir à nouveau le mot de passe.</p><div className="mt-8 grid grid-cols-2 gap-3"><button type="button" autoFocus className="min-h-16 rounded-panel border-2 border-edge text-xl font-semibold" onClick={() => setProfileToForget(null)}>Annuler</button><button type="button" disabled={saving} className="min-h-16 rounded-panel bg-warn text-xl font-bold text-ink disabled:opacity-40" onClick={() => void onForgetWifi(profileToForget.profile!).then(() => { setProfileToForget(null); void scan(); })}>Oublier</button></div></div></MaintenanceDialog>}
      {switchConfirmation}
    </section>;
  }

  const verdict = wifi.mode === "hotspot" ? "Réseau opérateur actif" : wifi.mode === "client" ? "Connecté au Wi-Fi" : "Borne hors ligne";
  const connectivity = wifi.connectivity === "full" ? "Accès Internet" : wifi.mode === "client" ? "Wi-Fi connecté · Internet non confirmé" : hotspot.active ? `${hotspot.client_count} appareil(s) connecté(s)` : "Aucune connexion active";
  const Icon = wifi.mode === "hotspot" ? Radio : wifi.mode === "client" ? Wifi : WifiOff;

  return <section className="grid min-h-0 grid-cols-[1.12fr_0.88fr] gap-3">
    <div className="grid content-between rounded-panel bg-surface p-6">
      <div className="flex items-start gap-5"><span className="grid size-20 flex-none place-items-center rounded-panel border-2 border-edge text-signal"><Icon className="size-11" strokeWidth={1.8} /></span><div><h2 className="text-3xl font-bold">{verdict}</h2><p className="mt-1 text-xl text-muted">{wifi.ssid ?? "Aucun réseau"}</p><p className="mt-3 flex items-center gap-2 text-lg text-signal"><Globe2 className="size-5" />{connectivity}</p></div></div>
      <div className={`grid gap-2 ${wifi.mode === "client" ? "grid-cols-[1fr_auto]" : ""}`}><button type="button" disabled={saving || !wifi.available} onClick={() => void scan()} className="min-h-16 rounded-panel bg-signal px-5 text-xl font-bold text-signal-ink disabled:opacity-40">{wifi.mode === "client" ? "Changer de Wi-Fi" : "Choisir un Wi-Fi"}</button>{wifi.mode === "client" && <button type="button" disabled={saving} onClick={() => void onDisconnectWifi()} className="min-h-16 rounded-panel border-2 border-edge px-5 text-lg font-semibold disabled:opacity-40">Déconnecter le Wi-Fi</button>}</div>
    </div>
    <div className="grid content-between rounded-panel border-2 border-edge p-5">
      <div><div className="flex items-center gap-3"><Router className="size-9 text-signal" /><div><h3 className="text-2xl font-semibold">Réseau opérateur</h3><p className="text-lg text-muted">{hotspot.ssid}</p></div></div>{wifi.mode === "client" && <p className="mt-4 text-base text-muted">Le Wi-Fi actuel reprendra après la coupure du réseau opérateur.</p>}{hotspot.active && <div className="relative mt-3 grid grid-cols-[1fr_7.5rem] items-center gap-3 pt-3 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-edge"><div><p className="text-sm text-muted">Code opérateur</p><p className="mt-0.5 text-[2rem] leading-none font-bold tracking-[0.18em] tabular-nums">{hotspot.admin_code ?? "—"}</p><p className="mt-2 text-sm text-muted">{hotspot.client_count} appareil(s) connecté(s)</p><div className="mt-3 flex gap-2"><button type="button" aria-pressed={qrKind === "wifi"} onClick={() => setQrKind("wifi")} className="min-h-10 rounded-[0.55rem] border-2 border-edge px-3 aria-pressed:bg-signal aria-pressed:text-signal-ink">Wi-Fi</button><button type="button" aria-pressed={qrKind === "portal"} onClick={() => setQrKind("portal")} className="min-h-10 rounded-[0.55rem] border-2 border-edge px-3 aria-pressed:bg-signal aria-pressed:text-signal-ink">Portail</button></div></div><img className="size-[7.5rem] rounded bg-white p-1" src={`/api/maintenance/hotspot/qr/${qrKind}`} alt={`QR code ${qrKind === "wifi" ? "du Wi-Fi opérateur" : "du portail"}`} /></div>}</div>
      <button type="button" disabled={saving || !hotspot.available} onClick={() => hotspot.active ? setConfirmDeactivate(true) : void onChangeHotspot("activate")} className={`min-h-14 rounded-panel text-lg font-semibold disabled:opacity-40 ${hotspot.active ? "border-2 border-warn text-warn" : "border-2 border-edge"}`}>{hotspot.active ? "Couper le réseau opérateur" : "Activer le réseau opérateur"}</button>
    </div>
    {switchConfirmation}
    {confirmDeactivate && <MaintenanceDialog label="Confirmer la coupure du réseau opérateur" onCancel={() => setConfirmDeactivate(false)}><div className="w-full max-w-xl rounded-panel border-2 border-warn bg-ink p-8"><Radio className="size-12 text-warn" /><h2 className="mt-4 text-3xl font-bold">Couper le réseau opérateur ?</h2><p className="mt-4 text-xl text-muted">Tous les appareils seront déconnectés et leurs accès au portail invalidés.</p><div className="mt-8 grid grid-cols-2 gap-3"><button type="button" autoFocus className="min-h-16 rounded-panel border-2 border-edge text-xl font-semibold" onClick={() => setConfirmDeactivate(false)}>Annuler</button><button type="button" disabled={saving} className="min-h-16 rounded-panel bg-warn text-xl font-bold text-ink disabled:opacity-40" onClick={() => void onChangeHotspot("deactivate").then(() => setConfirmDeactivate(false)).catch(() => undefined)}>Couper</button></div></div></MaintenanceDialog>}
  </section>;
}

function SignalBars({ signal }: { signal: number }) {
  const active = Math.max(1, Math.ceil(signal / 25));
  return <span className="flex h-10 items-end gap-1" role="img" aria-label={`Signal ${signal}%`}>{[1, 2, 3, 4].map((bar) => <span key={bar} className={`w-2.5 rounded-sm ${bar <= active ? "bg-signal" : "bg-edge"}`} style={{ height: `${bar * 22}%` }} />)}</span>;
}

const LETTER_ROWS = [["a","z","e","r","t","y","u","i","o","p"], ["q","s","d","f","g","h","j","k","l","m"], ["w","x","c","v","b","n"]] as const;
const NUMBER_ROWS = [["1","2","3","4","5","6","7","8","9","0"], ["-","/",":",";","(",")","€","&","@","\""], [".",",","?","!","'"]] as const;
const SYMBOL_ROWS = [["[","]","{","}","#","%","^","*","+","="], ["_","\\","|","~","<",">","$","£","¥","`"], [".",",","?","!","'"]] as const;

function PasswordScreen({ ssid, password, revealed, saving, onPassword, onReveal, onBack, onConnect }: { ssid: string; password: string; revealed: boolean; saving: boolean; onPassword: (value: string) => void; onReveal: () => void; onBack: () => void; onConnect: () => void }) {
  return <section className="grid min-h-0 grid-rows-[9rem_1fr] gap-3">
    <div className="grid grid-cols-[14rem_1fr_17rem] items-center gap-4 rounded-panel bg-surface p-4"><div><h2 className="text-2xl font-semibold">Mot de passe</h2><p className="mt-1 truncate text-xl text-muted">{ssid}</p></div><div className="relative"><input readOnly aria-label="Mot de passe Wi-Fi" type={revealed ? "text" : "password"} value={password} placeholder="Saisissez le mot de passe" className="h-16 w-full rounded-panel border-2 border-edge bg-ink py-0 pr-16 pl-4 text-xl text-body placeholder:text-muted" /><button type="button" onClick={onReveal} aria-label={revealed ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={revealed} className="absolute inset-y-0 right-0 grid w-16 place-items-center rounded-r-panel text-muted active:text-signal">{revealed ? <EyeOff className="size-7" /> : <Eye className="size-7" />}</button></div><div className="grid gap-2"><button type="button" disabled={saving || password.length < 8} onClick={onConnect} className="min-h-12 rounded-panel bg-signal text-lg font-bold text-signal-ink disabled:opacity-40">{saving ? "Connexion…" : "Se connecter"}</button><button type="button" disabled={saving} onClick={onBack} className="min-h-12 rounded-panel border-2 border-edge text-lg font-semibold">Retour aux réseaux</button></div></div>
    <OnScreenKeyboard value={password} onChange={onPassword} disabled={saving} />
  </section>;
}

function HiddenNetworkScreen({ saving, onBack, onConnect }: { saving: boolean; onBack: () => void; onConnect: (ssid: string, password: string) => Promise<void> }) {
  const [field, setField] = useState<"ssid" | "password">("ssid");
  const [ssid, setSsid] = useState("");
  const [hiddenPassword, setHiddenPassword] = useState("");
  const value = field === "ssid" ? ssid : hiddenPassword;
  const change = (next: string) => field === "ssid" ? setSsid(next.slice(0, 32)) : setHiddenPassword(next.slice(0, 63));
  const submit = async () => {
    try {
      await onConnect(ssid, hiddenPassword);
    } finally {
      setHiddenPassword("");
    }
  };
  return <section className="grid min-h-0 grid-rows-[9rem_1fr] gap-3">
    <div className="grid grid-cols-[14rem_1fr_17rem] items-center gap-4 rounded-panel bg-surface p-4"><div><h2 className="text-2xl font-semibold">Réseau masqué</h2><p className="mt-1 text-base text-muted">Saisissez son nom exact.</p></div><div className="grid grid-cols-2 gap-3"><button type="button" aria-pressed={field === "ssid"} onClick={() => setField("ssid")} className="w-full rounded-panel border-2 border-edge p-3 text-left aria-pressed:border-signal"><span className="block text-sm text-muted">Nom du réseau</span><strong className="block min-h-7 truncate text-xl">{ssid || "SSID"}</strong></button><button type="button" aria-pressed={field === "password"} onClick={() => setField("password")} className="w-full rounded-panel border-2 border-edge p-3 text-left aria-pressed:border-signal"><span className="block text-sm text-muted">Mot de passe</span><strong className="block min-h-7 truncate text-xl">{hiddenPassword ? "•".repeat(hiddenPassword.length) : "Réseau ouvert"}</strong></button></div><div className="grid gap-2"><button type="button" disabled={saving || !ssid || (hiddenPassword.length > 0 && hiddenPassword.length < 8)} onClick={() => void submit()} className="min-h-12 rounded-panel bg-signal text-lg font-bold text-signal-ink disabled:opacity-40">{saving ? "Connexion…" : "Se connecter"}</button><button type="button" disabled={saving} onClick={onBack} className="min-h-12 rounded-panel border-2 border-edge text-lg font-semibold">Retour aux réseaux</button></div></div>
    <OnScreenKeyboard value={value} onChange={change} disabled={saving} />
  </section>;
}

function OnScreenKeyboard({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [mode, setMode] = useState<"letters" | "numbers" | "symbols">("letters");
  const [uppercase, setUppercase] = useState(false);
  const rows = mode === "letters" ? LETTER_ROWS : mode === "numbers" ? NUMBER_ROWS : SYMBOL_ROWS;
  const [topRow, middleRow, bottomRow] = rows;
  const append = (key: string) => {
    onChange(value + (mode === "letters" && uppercase ? key.toUpperCase() : key));
    if (uppercase) setUppercase(false);
  };
  const keyClass = "grid h-full min-h-12 min-w-0 flex-1 place-items-center rounded-[0.55rem] text-2xl font-semibold active:scale-95 disabled:opacity-40";
  return <div className="grid min-h-0 grid-rows-4 gap-2 rounded-panel border-2 border-edge p-3" aria-label="Clavier tactile">
    <div className="flex gap-1.5">{topRow.map((key) => <button key={key} type="button" disabled={disabled} onClick={() => append(key)} className={`${keyClass} bg-surface`}>{mode === "letters" && uppercase ? key.toUpperCase() : key}</button>)}</div>
    <div className="flex gap-1.5 px-5">{middleRow.map((key) => <button key={key} type="button" disabled={disabled} onClick={() => append(key)} className={`${keyClass} bg-surface`}>{mode === "letters" && uppercase ? key.toUpperCase() : key}</button>)}</div>
    <div className="flex gap-1.5">
      {mode === "letters" ? <button type="button" aria-label="Majuscule" aria-pressed={uppercase} disabled={disabled} onClick={() => setUppercase((current) => !current)} className={`${keyClass} max-w-16 border-2 border-edge bg-ink aria-pressed:bg-signal aria-pressed:text-signal-ink`}><ArrowBigUp className="size-7" /></button> : <button type="button" disabled={disabled} onClick={() => setMode(mode === "numbers" ? "symbols" : "numbers")} className={`${keyClass} max-w-16 border-2 border-edge bg-ink text-base`}>{mode === "numbers" ? "#+=" : "123"}</button>}
      {bottomRow.map((key) => <button key={key} type="button" disabled={disabled} onClick={() => append(key)} className={`${keyClass} bg-surface`}>{mode === "letters" && uppercase ? key.toUpperCase() : key}</button>)}
      <button type="button" aria-label="Effacer le dernier caractère" disabled={disabled || !value} onClick={() => onChange(value.slice(0, -1))} className={`${keyClass} max-w-16 border-2 border-edge bg-ink`}><Delete className="size-7" /></button>
    </div>
    <div className="flex gap-2 px-14"><button type="button" disabled={disabled} onClick={() => setMode(mode === "letters" ? "numbers" : "letters")} className="h-full min-h-12 w-28 rounded-[0.55rem] border-2 border-edge text-xl font-semibold">{mode === "letters" ? "123" : "ABC"}</button><button type="button" disabled={disabled} onClick={() => onChange(value + " ")} className="h-full min-h-12 flex-1 rounded-[0.55rem] border-2 border-edge text-xl font-semibold">Espace</button></div>
  </div>;
}
