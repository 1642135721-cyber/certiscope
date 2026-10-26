"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type ProgressProject = {
  id: string;
  name: string;
  status: string;
  progress: number | null;
  href: string;
};

export function ProjectProgressSelector({ projects }: { projects: ProgressProject[] }) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id ?? "");
  const selected = projects.find((project) => project.id === selectedId) ?? projects[0];
  const progress = selected?.progress ?? 0;
  return <div className="dashboard-progress-selector">
    <div className="dashboard-progress-display">
      <div className="dashboard-progress-donut" style={{ background: `conic-gradient(#1a9c6c ${progress}%, #e1e8e6 ${progress}% 100%)` }} role="img" aria-label={selected?.progress == null ? "暂无可计算的项目进度" : `${selected?.name ?? "项目"}进度 ${progress}%`}>
        <div><strong>{selected?.progress == null ? "—" : `${progress}%`}</strong><span>{selected?.status ?? "暂无项目"}</span></div>
      </div>
      <p title={selected?.name}>{selected?.name ?? "暂无项目"}</p>
      {selected && <Link href={selected.href} className="dashboard-progress-detail">查看项目 <ArrowUpRight size={14}/></Link>}
    </div>
    <div className="dashboard-progress-projects" role="group" aria-label="选择项目查看进度">
      {projects.map((project) => <button key={project.id} type="button" onClick={() => setSelectedId(project.id)} aria-pressed={selected?.id === project.id} className={`dashboard-progress-project ${selected?.id === project.id ? "dashboard-progress-project-active" : ""}`}>
        <span><strong>{project.name}</strong><small>{project.status}</small></span><span className="dashboard-progress-project-value">{project.progress == null ? "—" : `${project.progress}%`}</span>
      </button>)}
      {!projects.length && <p className="dashboard-empty-note">暂无项目进度。</p>}
    </div>
  </div>;
}
