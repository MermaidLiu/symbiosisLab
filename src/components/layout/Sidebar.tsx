"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { NAV_ENTRIES, NavIcon } from "@/lib/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { FluentModal } from "@/components/fluent/FluentModal";
import { FluentButton } from "@/components/fluent/FluentButton";
import { displayName } from "@/lib/users";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, updateNickname } = useAuth();
  const { t } = useLocale();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [nickOpen, setNickOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState("");
  const [nickMsg, setNickMsg] = useState("");
  const [nickSaving, setNickSaving] = useState(false);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const item of NAV_ENTRIES) {
        if (item.type === "group" && pathname.startsWith(item.pathPrefix)) {
          next[item.labelKey] = true;
        }
      }
      return next;
    });
  }, [pathname]);

  if (!user) return null;

  const visibleNav = NAV_ENTRIES.filter((item) => item.show(user.roles));
  const shown = displayName(user);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function openNickname() {
    setNickDraft(user?.nickname ?? "");
    setNickMsg("");
    setNickOpen(true);
  }

  async function saveNickname() {
    setNickSaving(true);
    setNickMsg("");
    const res = await updateNickname(nickDraft.trim());
    setNickSaving(false);
    if (!res.ok) {
      setNickMsg(t.profile.saveFail);
      return;
    }
    if (res.warning === "nickname_taken") {
      setNickMsg(t.profile.nicknameTakenSoft);
    } else {
      setNickMsg(t.profile.saveOk);
      setTimeout(() => setNickOpen(false), 600);
    }
  }

  return (
    <aside className="fluent-sidebar flex w-60 shrink-0 flex-col border-r border-white/30">
      <div className="border-b border-white/25 bg-gradient-to-br from-thu/90 to-thu-light/85 px-5 py-5 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-3 rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-tsinghua-yellow/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-tsinghua-yellow/90 text-lg font-bold text-thu-dark shadow-sm backdrop-blur-sm">
            S
          </div>
          <h1 className="text-sm font-bold text-white">{t.brand.title}</h1>
        </Link>
      </div>

      <div className="border-b border-white/25 px-4 py-3">
        <p className="text-sm font-medium text-thu">{shown}</p>
        {user.nickname ? (
          <p className="text-[10px] text-lab-muted">{user.name}</p>
        ) : null}
        <p className="text-[10px] text-lab-muted">{user.email}</p>
        <button
          type="button"
          onClick={openNickname}
          className="mt-1.5 text-[10px] text-thu/80 underline-offset-2 hover:underline"
        >
          {t.profile.editNickname}
        </button>
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

          const groupOpen = openGroups[item.labelKey] ?? pathname.startsWith(item.pathPrefix);
          const groupActive = pathname.startsWith(item.pathPrefix);
          return (
            <div key={item.labelKey}>
              <button
                type="button"
                onClick={() => toggleGroup(item.labelKey)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                  groupActive
                    ? "bg-white/45 font-medium text-thu backdrop-blur-md"
                    : "text-lab-muted hover:bg-white/35 hover:text-thu"
                )}
              >
                <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-left">{t.nav[item.labelKey]}</span>
                <span className={clsx("text-xs transition-transform duration-200", groupOpen && "rotate-90")}>›</span>
              </button>
              {groupOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/35 pl-2">
                  {item.children.map((child) => {
                    if (child.show && user && !child.show(user.roles)) return null;
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

      <FluentModal
        open={nickOpen}
        title={t.profile.nicknameTitle}
        onClose={() => setNickOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setNickOpen(false)}>
              {t.common.cancel}
            </FluentButton>
            <FluentButton disabled={nickSaving} onClick={() => void saveNickname()}>
              {t.common.save}
            </FluentButton>
          </div>
        }
      >
        <p className="mb-3 text-xs text-lab-muted">{t.profile.nicknameHint}</p>
        <label className="mb-1 block text-xs text-lab-muted">{t.profile.nickname}</label>
        <input
          className="fluent-input w-full rounded-lg px-3 py-2 text-sm shadow-sm"
          value={nickDraft}
          maxLength={32}
          onChange={(e) => setNickDraft(e.target.value)}
          placeholder={t.profile.nicknamePlaceholder}
        />
        <p className="mt-2 text-[10px] text-lab-muted">
          {t.profile.realName}: {user.name}
        </p>
        {nickMsg && <p className="mt-2 text-xs text-thu">{nickMsg}</p>}
      </FluentModal>
    </aside>
  );
}
