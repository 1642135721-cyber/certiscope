import { Info } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { getCurrentActor } from "@/lib/supabase/auth";

export const instant = false;

export default async function AboutPage() {
  await connection();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try { context = await getCurrentActor(); } catch { redirect("/login"); }
  return <WorkspaceFrame actor={context.actor} active="about"><div className="mx-auto max-w-5xl"><h1 className="text-3xl font-bold">关于我们</h1><section className="mt-7 rounded-2xl border border-[#e3ede7] bg-white p-8"><Info size={34} className="text-[#18835b]"/><h2 className="mt-5 text-xl font-bold">关于页面正在开发中</h2></section></div></WorkspaceFrame>;
}
