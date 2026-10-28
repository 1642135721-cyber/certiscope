import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { userDisplayName } from "@/lib/gv/presentation";
import type { BusinessRole } from "@/lib/gv/types";
import { FloatingGvQa } from "./floating-gv-qa";
import { WorkspaceNav } from "./workspace-nav";

export function WorkspaceFrame({
  actor,
  active,
  children,
}: {
  actor: { displayName: string; role: BusinessRole };
  active:
    | "dashboard"
    | "tasks"
    | "projects"
    | "rules"
    | "rulesQa"
    | "settings"
    | "about";
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/welcome" className="dashboard-brand">
          <Image
            src="/images/certiscope-mark.png"
            alt=""
            width={38}
            height={38}
            className="dashboard-brand-mark"
          />
          <strong>
            Certi<span>Scope</span>
          </strong>
          <span>绿色建筑审核</span>
        </Link>
        <div className="dashboard-header-right">
          <div className="dashboard-account">
            <span className="dashboard-avatar">
              {userDisplayName(actor.displayName, actor.role).slice(0, 1)}
            </span>
            <span>
              <strong>{userDisplayName(actor.displayName, actor.role)}</strong>
              <small>
                {actor.role === "admin"
                  ? "审核管理员"
                  : actor.role === "auditor"
                    ? "审核员"
                    : "规则维护人员"}
              </small>
            </span>
          </div>
          <form action={logout}>
            <button type="submit" className="dashboard-logout">
              退出登录
            </button>
          </form>
        </div>
      </header>
      <div className="dashboard-frame">
        <WorkspaceNav role={actor.role} active={active} />
        <main className="min-w-0 px-4 py-5 md:px-7">{children}</main>
      </div>
      {active !== "rulesQa" && <FloatingGvQa />}
    </div>
  );
}
