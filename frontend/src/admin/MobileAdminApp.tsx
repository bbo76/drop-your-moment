import { DayOfView } from "./DayOfView";

export function MobileAdminApp() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <main>
        <DayOfView />
      </main>
    </div>
  );
}
