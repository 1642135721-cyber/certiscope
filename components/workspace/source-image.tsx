"use client";

import { Maximize2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

export function SourceImage({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  return <>
    <button type="button" onClick={() => setExpanded(true)} onDoubleClick={() => setExpanded(true)} className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-[#e0eae3] bg-[#f7faf8] text-left" title="双击查看原图">
      <Image src={src} alt={alt} width={1000} height={1200} unoptimized className="max-h-[220px] w-full object-contain object-top" />
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-xs text-[#216647] shadow"><Maximize2 size={13}/> 双击查看原图</span>
    </button>
    <p className="mt-2 text-xs leading-5 text-[#6e8376]">{caption}</p>
    {expanded && <div role="presentation" onClick={() => setExpanded(false)} className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b15]/85 p-5">
      <div role="dialog" aria-modal="true" aria-label={caption} onClick={(event) => event.stopPropagation()} className="flex max-h-full max-w-[95vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-6 border-b px-4 py-3 text-sm"><span className="min-w-0 truncate font-semibold">{caption}</span><button type="button" onClick={() => setExpanded(false)} aria-label="关闭原图" className="rounded p-1 hover:bg-[#eef5ef]"><X size={20}/></button></div>
        <div className="overflow-auto p-3"><Image src={src} alt={alt} width={1600} height={2000} unoptimized className="h-auto max-h-[82vh] w-auto max-w-[90vw] object-contain" /></div>
      </div>
    </div>}
  </>;
}
