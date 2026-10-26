import {
  BookOpen,
  ClipboardList,
  FolderOpen,
  Home,
  Info,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import type { BusinessRole } from "@/lib/gv/types";

export function WorkspaceNav({
  role,
  active,
}: {
  role: BusinessRole;
  active: "dashboard" | "tasks" | "projects" | "rules" | "settings" | "about";
}) {
  const auditorLinks = [
    { href: "/dashboard", label: "审核工作台", icon: Home, key: "dashboard" },
    {
      href: "/tasks",
      label: "审核任务",
      icon: ClipboardList,
      key: "tasks",
    },
    { href: "/projects", label: "项目中心", icon: FolderOpen, key: "projects" },
    { href: "/rules", label: "规则库", icon: BookOpen, key: "rules" },
  ];
  const adminLinks = [
    { href: "/dashboard", label: "审核工作台", icon: Home, key: "dashboard" },
    { href: "/tasks", label: "审核任务", icon: ClipboardList, key: "tasks" },
    { href: "/projects", label: "项目中心", icon: FolderOpen, key: "projects" },
    { href: "/rules", label: "规则库", icon: BookOpen, key: "rules" },
  ];
  const links = role === "rule_maintainer"
    ? [{ href: "/rules", label: "规则库", icon: BookOpen, key: "rules" }]
    : role === "admin" ? adminLinks : auditorLinks;

  return (
    <nav
      aria-label="工作区导航"
      className="workspace-nav flex gap-2 border-b border-[#e1ece5] bg-white p-3 md:min-h-[calc(100vh-72px)] md:flex-col md:border-b-0 md:border-r md:pt-7"
    >
      {links.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active === item.key ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 ${active === item.key ? "bg-[#e4f5ed] font-semibold text-[#086443]" : "text-[#506d5e] hover:bg-[#f1f7f3]"}`}
          >
            <Icon size={19} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
      <div className="flex gap-2 border-[#e1ece5] md:mt-auto md:flex-col md:border-t md:pt-3">
        <Link href="/settings" aria-current={active === "settings" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 ${active === "settings" ? "bg-[#e4f5ed] font-semibold text-[#086443]" : "text-[#506d5e] hover:bg-[#f1f7f3]"}`}><Settings2 size={19} aria-hidden="true"/>设置</Link>
        <Link href="/about" aria-current={active === "about" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 ${active === "about" ? "bg-[#e4f5ed] font-semibold text-[#086443]" : "text-[#506d5e] hover:bg-[#f1f7f3]"}`}><Info size={19} aria-hidden="true"/>关于我们</Link>
      </div>
    </nav>
  );
}
