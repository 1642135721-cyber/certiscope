import {
  ArrowRight,
  Bell,
  BookOpen,
  Building2,
  ChevronRight,
  FileCheck2,
  FileText,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { logout } from "@/app/(auth)/login/actions";
import { listAccessibleTasks } from "@/lib/gv/task-queries";
import { getCurrentActor } from "@/lib/supabase/auth";

export const instant = false;

export default async function WelcomePage() {
  await connection();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try {
    context = await getCurrentActor();
  } catch {
    redirect("/login");
  }

  if (context.actor.role === "rule_maintainer") redirect("/rules");
  const isAdmin = context.actor.role === "admin";

  let currentCount: number | null = null;
  try {
    const tasks = await listAccessibleTasks(context.supabase);
    currentCount = tasks.filter(
      (task) =>
        !task.archived_at &&
        (context.actor.role === "admin" ||
          task.current_auditor_id === context.actor.id),
    ).length;
  } catch {
    currentCount = null;
  }

  const taskMessage =
    currentCount === null
      ? "暂时无法读取审核任务，请进入工作台重试"
      : context.actor.role === "auditor"
        ? `审核管理员已向您派发 ${currentCount} 项审核任务`
        : `当前共有 ${currentCount} 项审核任务待处理`;

  return (
    <main className="welcome-shell">
      <form action={logout} className="welcome-logout">
        <span>{context.actor.displayName}</span>
        <button type="submit">退出登录</button>
      </form>

      <div className="welcome-content">
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <Image
            src="/images/certiscope-logo.png"
            alt="CertiScope"
            width={260}
            height={155}
            className="welcome-logo-full"
            priority
          />
          <h1 id="welcome-title">欢迎使用绿色建筑认证预审平台</h1>
          <div className="welcome-task-banner">
            <Bell aria-hidden="true" size={25} strokeWidth={2.3} />
            <p>{taskMessage}</p>
            <span className="welcome-banner-divider" aria-hidden="true" />
            <Link href={isAdmin ? "/projects" : "/dashboard"}>
              {isAdmin ? "查看项目" : "查看我的任务"} <ArrowRight aria-hidden="true" size={20} />
            </Link>
          </div>
        </section>

        <section className="welcome-cards" aria-label="工作区入口">
          <Link className="welcome-card welcome-card-primary" href={isAdmin ? "/projects" : "/dashboard"}>
            <span className="welcome-card-icon welcome-icon-green">
              <FileCheck2 aria-hidden="true" size={48} strokeWidth={2.5} />
            </span>
            <span className="welcome-card-heading">
              <strong>{isAdmin ? "项目与派单" : "认证审核"}</strong>
              <ChevronRight aria-hidden="true" size={24} />
            </span>
            <span className="welcome-card-copy">
              {isAdmin ? "管理项目与任务" : "查看派发任务"}
              <br />
              {isAdmin ? "进入项目中心" : "进入审核工作台"}
            </span>
            <span className="welcome-card-action">
              {isAdmin ? "管理项目" : "开始审核"} <ArrowRight aria-hidden="true" size={23} />
            </span>
          </Link>

          <Link className="welcome-card" href="/projects">
            <span className="welcome-card-icon welcome-icon-blue">
              <Building2 aria-hidden="true" size={49} strokeWidth={2.4} />
            </span>
            <span className="welcome-card-heading">
              <strong>项目中心</strong>
              <ChevronRight aria-hidden="true" size={24} />
            </span>
            <span className="welcome-card-copy">项目资料与进度</span>
          </Link>

          <Link className="welcome-card" href="/rules">
            <span className="welcome-card-icon welcome-icon-purple">
              <BookOpen aria-hidden="true" size={49} strokeWidth={2.4} />
            </span>
            <span className="welcome-card-heading">
              <strong>规则与知识</strong>
              <ChevronRight aria-hidden="true" size={24} />
            </span>
            <span className="welcome-card-copy">
              标准规范与解读
              <br />
              行业知识库
            </span>
            <span className="welcome-card-tag">规则库接入中</span>
          </Link>

          <div className="welcome-card welcome-card-planned">
            <span className="welcome-card-icon welcome-icon-cyan">
              <FileText aria-hidden="true" size={49} strokeWidth={2.4} />
            </span>
            <span className="welcome-card-heading">
              <strong>材料生成</strong>
              <ChevronRight aria-hidden="true" size={24} />
            </span>
            <span className="welcome-card-copy">
              设计说明智能生成
              <br />
              在线编辑与导出
            </span>
            <span className="welcome-card-tag">规划中</span>
          </div>
        </section>
      </div>
    </main>
  );
}
