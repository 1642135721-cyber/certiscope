import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireRole } from "@/lib/supabase/auth";
import { NewProjectForm } from "./project-form";

export const instant = false;

export default async function NewProjectPage() {
  await connection();
  let context: Awaited<ReturnType<typeof requireRole>>;
  try {
    context = await requireRole("admin");
  } catch {
    redirect("/welcome");
  }
  return (
    <main className="min-h-screen bg-[#f3f8f5] px-5 py-8 text-[#103a2a] md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-3 text-sm text-[#678377]">
          <Link href="/dashboard" className="hover:text-[#07583a]">
            工作台
          </Link>
          <span>/</span>
          <span>新建项目</span>
        </div>
        <div className="mb-8">
          <p className="mb-2 text-xs font-bold tracking-[.18em] text-[#23825a]">
            项目建档
          </p>
          <h1 className="text-3xl font-bold">新建项目与材料识别</h1>
          <p className="mt-3 text-[#60766a]">
            上传项目审核材料获取候选信息。管理员核对项目档案后建档，再按 LEED 类别分配审核员。
          </p>
        </div>
        <NewProjectForm />
      </div>
    </main>
  );
}
