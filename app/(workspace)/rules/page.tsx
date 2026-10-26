import { BookOpen, ChevronDown, ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { getCurrentActor } from "@/lib/supabase/auth";
import { gvRules } from "@/lib/gv/rule-catalog";

export const instant = false;

export default async function RulesPage() {
  await connection();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try {
    context = await getCurrentActor();
  } catch {
    redirect("/login");
  }
  const { data: rulePackage } = await context.supabase.from("gv_rule_packages")
    .select("code, system, system_version, stage, package_version, source_reference, status")
    .eq("code", "LT-GV").eq("status", "active").maybeSingle();
  return (
    <WorkspaceFrame actor={context.actor} active="rules">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold text-[#168358]">LEED v4 BD+C NC · 设计审核</p>
        <h1 className="mt-1 text-3xl font-bold">规则库</h1>
        <p className="mt-2 text-sm text-[#6b8275]">按大项和信用项查阅当前已接入的规则包及来源。专业结论仍由审核员依据原件确认。</p>
        <section className="mt-6 rounded-2xl border border-[#cfe4d5] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-xl font-bold"><BookOpen size={21} className="text-[#18835b]"/>LT · 交通与场地</h2><span className="rounded-full bg-[#e5f5eb] px-3 py-1 text-xs font-semibold text-[#0b8055]">1 个已接入信用项</span></div>
          <details open className="group mt-4 rounded-xl border border-[#dceae0] bg-[#f8fbf8] p-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><ChevronDown size={17} className="text-[#168358] transition-transform group-open:rotate-180"/><span className="text-lg font-bold">Green Vehicles · 绿色车辆</span></span><span className="text-xs text-[#56806a]">{rulePackage ? `${rulePackage.code} · ${rulePackage.package_version}` : "规则包尚未发布"}</span></summary>
            <p className="mt-2 text-xs text-[#728779]">{rulePackage ? `${rulePackage.system} ${rulePackage.system_version} · ${rulePackage.stage}` : "当前没有可供审核任务锁定的规则版本"}</p>
            {rulePackage && <><div className="mt-3 grid gap-2 md:grid-cols-2">{gvRules.map((rule) => <details key={rule.code} className="rounded-lg border border-[#e1ebe3] bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{rule.code} · {rule.title}</summary><p className="mt-2 text-sm leading-6 text-[#4e6959]">{rule.summary}</p><p className="mt-1 text-xs text-[#718678]">所需证据：{rule.evidence}</p></details>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6d8074]"><span>来源：{rulePackage.source_reference}</span><a href="/rules/gv-source.pdf" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#087a50]">查看规则原件 <ExternalLink size={13}/></a></div></>}
          </details>
        </section>
        {(["SS · 可持续场地", "WE · 水资源效率", "EA · 能源与大气", "MR · 材料与资源", "EQ · 室内环境质量"] as const).map((category) => <div key={category} className="mt-3 flex items-center justify-between rounded-xl border border-[#e1ebe4] bg-white px-5 py-4"><span className="font-semibold">{category}</span><span className="text-xs text-[#83958a]">暂无已接入规则包</span></div>)}
      </div>
    </WorkspaceFrame>
  );
}
