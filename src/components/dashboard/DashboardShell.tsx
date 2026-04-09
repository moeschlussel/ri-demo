"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import { HierarchySidebar } from "@/components/dashboard/HierarchySidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavigationTree, Scope } from "@/lib/types";

export function DashboardShell({
  scope,
  navigation,
  children,
  chat
}: {
  scope: Scope;
  navigation: NavigationTree;
  children: ReactNode;
  chat: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)] lg:flex">
      <div className="hidden lg:block">
        <HierarchySidebar
          scope={scope}
          navigation={navigation}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((current) => !current)}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-[rgba(244,247,251,0.92)] backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" className="h-10 w-10 rounded-xl px-0">
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[20rem] max-w-[85vw] border-r p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <HierarchySidebar
                  scope={scope}
                  navigation={navigation}
                  mobile
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Navigation</p>
              <p className="text-sm font-semibold text-slate-950">Robotic Imaging</p>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-[1680px] gap-6 px-4 py-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <main className="min-w-0 space-y-6">{children}</main>
          <aside className="min-w-0">{chat}</aside>
        </div>
      </div>
    </div>
  );
}
