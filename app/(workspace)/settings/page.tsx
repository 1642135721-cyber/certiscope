import { Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { getCurrentActor } from "@/lib/supabase/auth";

export const instant = false;

export default async function SettingsPage() {
  await connection();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try {
    context = await getCurrentActor();
  } catch {
    redirect("/login");
  }
  return (
    <WorkspaceFrame actor={context.actor} active="settings">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold text-[#168358]">工作区</p>
        <h1 className="mt-1 text-3xl font-bold">设置</h1>
        <div className="mt-7 rounded-2xl border border-[#e3ede7] bg-white p-8">
          <Settings2 size={34} className="text-[#18835b]" />
          <h2 className="mt-5 text-xl font-bold">设置功能正在开发中</h2>
          <p className="mt-2 max-w-2xl leading-7 text-[#6b8275]">
            {context.actor.role === "admin" ? "账号、权限与服务配置将在这里管理。" : "个人偏好和通知设置将在这里管理。"}
          </p>
        </div>
      </div>
    </WorkspaceFrame>
  );
}
