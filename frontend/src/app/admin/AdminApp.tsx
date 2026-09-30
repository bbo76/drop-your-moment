import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Camera, CircleGauge, HeartPulse, LockKeyhole, Radio, ScrollText } from "lucide-react";

import { DashboardOverview } from "@/features/admin/DashboardOverview";
import { EventSection } from "@/features/admin/EventSection";
import { GallerySection } from "@/features/admin/GallerySection";
import { HealthSection } from "@/features/admin/HealthSection";
import { SecuritySection } from "@/features/admin/SecuritySection";
import { JournalSection } from "@/features/admin/JournalSection";
import { DayOfView } from "@/features/admin/DayOfView";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { api, type OperatorAuthStatus } from "@/api/client";

/* Backoffice complet, destiné à la préparation sur laptop. Le pilotage mobile du jour J
 * possède son propre point d'entrée et réutilise directement les mêmes API. */

export function AdminApp({ mobile = false }: { mobile?: boolean }) {
  const [auth, setAuth] = useState<OperatorAuthStatus | null>(null);
  useEffect(() => { void api.operatorAuthStatus().then(setAuth); }, []);
  if (!auth) return <main className="grid min-h-screen place-items-center bg-muted/30">Connexion à la borne…</main>;
  if (auth.required && !auth.authenticated) {
    return <OperatorLogin onAuthenticated={() => setAuth({ required: true, authenticated: true })} />;
  }
  if (mobile) {
    return <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]"><main><DayOfView /></main></div>;
  }
  return <AdminPortal />;
}

function OperatorLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.operatorLogin(code);
      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Code incorrect");
      setCode("");
    } finally {
      setBusy(false);
    }
  };
  return <main className="grid min-h-screen place-items-center bg-muted/30 p-6"><form onSubmit={(event) => void submit(event)} className="grid w-full max-w-sm gap-5 rounded-xl border bg-background p-7 shadow-sm"><div><h1 className="text-2xl font-bold">Accès opérateur</h1><p className="mt-2 text-sm text-muted-foreground">Saisissez le code à six chiffres affiché sur la borne.</p></div><Input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setError(null); }} aria-label="Code administrateur" className="h-14 text-center text-2xl tracking-[0.4em]" />{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<Button type="submit" disabled={busy || code.length !== 6} className="h-12">{busy ? "Vérification…" : "Ouvrir le portail"}</Button></form></main>;
}

function AdminPortal() {
  const [view, setView] = useState<AdminView>(() => viewFromHash());

  useEffect(() => {
    const sync = () => setView(viewFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (next: AdminView) => {
    window.location.hash = next;
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <SidebarProvider className="bg-muted/30">
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="p-3">
          <Button type="button" variant="ghost" className="h-12 w-full justify-start gap-3 overflow-hidden px-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!" onClick={() => navigate("overview")}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">DY</span>
            <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <strong className="truncate font-semibold">Drop Your Moment</strong>
              <span className="truncate text-xs text-muted-foreground">Administration</span>
            </span>
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Gestion de la borne</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton className="min-h-11" tooltip={item.label} isActive={view === item.id} onClick={() => navigate(item.id)}>
                      <AdminIcon name={item.icon} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="flex items-center gap-3 rounded-lg border bg-background p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
            <Radio className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden"><strong className="block truncate text-sm font-medium">Connexion locale</strong><span className="block truncate text-xs text-muted-foreground">État affiché dans la page</span></span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <SidebarTrigger className="size-11" aria-label="Ouvrir la navigation" />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>Administration</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>{NAV_ITEMS.find(({ id }) => id === view)?.label}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Badge variant="outline" className="ml-auto hidden gap-1.5 font-normal sm:flex"><Radio className="size-3" />Actualisation automatique</Badge>
        </header>
        <main className="min-w-0 flex-1 bg-muted/30 p-4 md:p-6 lg:p-8">
        {view === "overview" && <DashboardOverview />}
        {view === "event" && <EventSection />}
        {view === "gallery" && <GallerySection />}
        {view === "diagnostic" && <HealthSection />}
        {view === "journal" && <JournalSection />}
        {view === "security" && <SecuritySection />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export type AdminView = "overview" | "event" | "gallery" | "diagnostic" | "journal" | "security";
type IconName = "overview" | "event" | "gallery" | "diagnostic" | "journal" | "security";

const NAV_ITEMS: Array<{ id: AdminView; label: string; icon: IconName }> = [
  { id: "overview", label: "Vue d’ensemble", icon: "overview" },
  { id: "event", label: "Événement", icon: "event" },
  { id: "gallery", label: "Galerie", icon: "gallery" },
  { id: "diagnostic", label: "Diagnostic", icon: "diagnostic" },
  { id: "journal", label: "Journaux", icon: "journal" },
  { id: "security", label: "Sécurité", icon: "security" },
];

const viewFromHash = (): AdminView => {
  const candidate = window.location.hash.slice(1) as AdminView;
  return NAV_ITEMS.some(({ id }) => id === candidate) ? candidate : "overview";
};

const AdminIcon = ({ name }: { name: IconName }) => {
  const Icon = { overview: CircleGauge, event: CalendarDays, gallery: Camera, diagnostic: HeartPulse, journal: ScrollText, security: LockKeyhole }[name];
  return <Icon />;
};
