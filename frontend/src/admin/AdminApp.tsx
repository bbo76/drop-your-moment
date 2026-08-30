import { useEffect, useState } from "react";
import { CalendarDays, Camera, CircleGauge, HeartPulse, LockKeyhole, Radio } from "lucide-react";

import { DashboardOverview } from "./DashboardOverview";
import { EventSection } from "./EventSection";
import { GallerySection } from "./GallerySection";
import { HealthSection } from "./HealthSection";
import { SecuritySection } from "./SecuritySection";
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

/* Backoffice complet, destiné à la préparation sur laptop. Le pilotage mobile du jour J
 * possède son propre point d'entrée et réutilise directement les mêmes API. */

export function AdminApp() {
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
                    <SidebarMenuButton tooltip={item.label} isActive={view === item.id} onClick={() => navigate(item.id)}>
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
            <span className="relative flex size-2.5 shrink-0"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-40 motion-reduce:animate-none" /><span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" /></span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden"><strong className="block truncate text-sm font-medium">Borne connectée</strong><span className="block truncate text-xs text-muted-foreground">Réseau local</span></span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <SidebarTrigger aria-label="Ouvrir la navigation" />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>Administration</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>{NAV_ITEMS.find(({ id }) => id === view)?.label}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Badge variant="outline" className="ml-auto hidden gap-1.5 font-normal sm:flex"><Radio className="size-3 text-emerald-600" />Actualisation en direct</Badge>
        </header>
        <main className="min-w-0 flex-1 bg-muted/30 p-4 md:p-6 lg:p-8">
        {view === "overview" && <DashboardOverview />}
        {view === "event" && <EventSection />}
        {view === "gallery" && <GallerySection />}
        {view === "diagnostic" && <HealthSection />}
        {view === "security" && <SecuritySection />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export type AdminView = "overview" | "event" | "gallery" | "diagnostic" | "security";
type IconName = "overview" | "event" | "gallery" | "diagnostic" | "security";

const NAV_ITEMS: Array<{ id: AdminView; label: string; icon: IconName }> = [
  { id: "overview", label: "Vue d’ensemble", icon: "overview" },
  { id: "event", label: "Événement", icon: "event" },
  { id: "gallery", label: "Galerie", icon: "gallery" },
  { id: "diagnostic", label: "Diagnostic", icon: "diagnostic" },
  { id: "security", label: "Sécurité", icon: "security" },
];

const viewFromHash = (): AdminView => {
  const candidate = window.location.hash.slice(1) as AdminView;
  return NAV_ITEMS.some(({ id }) => id === candidate) ? candidate : "overview";
};

const AdminIcon = ({ name }: { name: IconName }) => {
  const Icon = { overview: CircleGauge, event: CalendarDays, gallery: Camera, diagnostic: HeartPulse, security: LockKeyhole }[name];
  return <Icon />;
};
