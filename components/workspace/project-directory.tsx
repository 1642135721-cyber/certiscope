"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type ProjectDirectoryRow = {
  id: string;
  name: string;
  location: string;
  stage: string;
  status: string;
  tasks: string;
  latest: string;
  time: string;
  attention: string;
  href: string;
};

export function ProjectDirectory({ rows }: { rows: ProjectDirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((row) =>
    `${row.name} ${row.location} ${row.tasks}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm">
      <label className="flex w-full max-w-[480px] items-center gap-3 rounded-xl border border-[#d9e8df] px-4 py-3 text-sm text-[#8ca196]">
        <Search size={19} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索项目、地点或信用项"
          className="min-w-0 flex-1 bg-transparent text-[#173e2c] outline-none"
        />
      </label>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1280px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[21%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-[#f4f9f5] text-[#6f8c7b]">
            <tr>
              {[
                "项目",
                "当前环节",
                "状态",
                "审核任务",
                "最新变化",
                "待办与风险",
                "入口",
              ].map((label) => (
                <th
                  key={label}
                  className={`${label === "入口" ? "pl-0 pr-4" : "px-4"} py-3 font-medium`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e7eee9]">
            {filtered.map((row) => (
              <tr key={row.id} className="align-top hover:bg-[#fbfdfb]">
                <td className="px-4 py-5">
                  <strong className="block break-words text-[#123a29]">
                    {row.name}
                  </strong>
                  <small className="mt-1 block break-words text-[#81978a]">
                    {row.location}
                  </small>
                </td>
                <td className="break-words px-4 py-5">{row.stage}</td>
                <td className="px-4 py-5">
                  <span className="inline-flex whitespace-nowrap rounded-full bg-[#fff1de] px-2.5 py-1 text-xs font-semibold text-[#a56c1f]">
                    {row.status}
                  </span>
                </td>
                <td className="break-words px-4 py-5">{row.tasks}</td>
                <td className="break-words px-4 py-5">
                  {row.latest}
                  <small className="mt-1 block text-[#8fa297]">
                    {row.time}
                  </small>
                </td>
                <td className="px-4 py-5">
                  <span className="inline-flex whitespace-nowrap rounded-full border border-[#cdded2] px-3 py-1 text-xs">
                    {row.attention}
                  </span>
                </td>
                <td className="pl-0 pr-4 py-5">
                  <Link
                    href={row.href}
                    className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[#0b8255]"
                  >
                    进入项目 <ArrowRight size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="p-8 text-center text-sm text-[#82948a]">
            没有匹配的项目。
          </p>
        )}
      </div>
    </section>
  );
}
