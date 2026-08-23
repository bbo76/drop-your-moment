import { DayOfView } from "./DayOfView";

export function MobileAdminApp() {
  return (
    <div className="admin-shell mx-auto min-h-full max-w-xl px-4 py-5">
      <header className="mb-6 border-b border-edge pb-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Drop Your Moment</h1>
        <p className="text-muted">Pilotage de la borne</p>
      </header>
      <main>
        <DayOfView />
      </main>
    </div>
  );
}
