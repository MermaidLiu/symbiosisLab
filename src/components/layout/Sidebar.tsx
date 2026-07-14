"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import { NAV_ENTRIES, NavIcon } from "@/lib/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const [animalsOpen, setAnimalsOpen] = useState(
    () => pathname.startsWith("/animals")
  );

  if (!user) return null;

  const visibleNav = NAV_ENTRIES.filter((item) => item.show(user.roles));
  const animalsActive = pathname.startsWith("/animals");

  return (
    <aside className="fluent-sidebar flex w-60 shrink-0 flex-col border-r border-white/30">
      <div className="border-b border-white/25 bg-gradient-to-br from-thu/90 to-thu-light/85 px-5 py-5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-tsinghua-yellow/90 text-lg font-bold text-thu-dark shadow-sm backdrop-blur-sm">
            S
          </div>
          <h1 className="text-sm font-bold text-white">{t.brand.title}</h1>
        </div>
      </div>

      <div className="border-b border-white/25 px-4 py-3">
        <p className="text-sm font-medium text-thu">{user.name}</p>
        <p className="text-[10px] text-lab-muted">{user.email}</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {visibleNav.map((item) => {
          if (item.type === "link") {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                  active
                    ? "fluent-nav-active bg-white/55 font-medium text-thu shadow-sm backdrop-blur-md"
                    : "text-lab-muted hover:bg-white/35 hover:text-thu"
                )}
              >
                <NavIcon name={item.icon} className={clsx("h-5 w-5 shrink-0", active && "text-thu")} />
                <span>{t.nav[item.labelKey]}</span>
              </Link>
            );
          }

          const groupActive = animalsActive;
          return (
            <div key={item.labelKey}>
              <button
                type="button"
                onClick={() => setAnimalsOpen(!animalsOpen)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                  groupActive
                    ? "bg-white/45 font-medium text-thu backdrop-blur-md"
                    : "text-lab-muted hover:bg-white/35 hover:text-thu"
                )}
              >
                <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-left">{t.nav[item.labelKey]}</span>
                <span className={clsx("text-xs transition-transform duration-200", animalsOpen && "rotate-90")}>›</span>
              </button>
              {animalsOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/35 pl-2">
                  {item.children.map((child) => {
                    const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={clsx(
                          "block rounded-lg px-3 py-2 text-xs transition-all duration-200",
                          childActive
                            ? "bg-white/55 font-medium text-thu backdrop-blur-md"
                            : "text-lab-muted hover:bg-white/35 hover:text-thu"
                        )}
                      >
                        {t.nav[child.labelKey]}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/25 p-4">
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-lg border border-white/40 bg-white/30 py-2 text-xs text-lab-muted backdrop-blur-sm transition-colors hover:bg-red-50/60 hover:text-red-600"
        >
          {t.nav.logout}
        </button>
      </div>
    </aside>
  );
}
