"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function RecentCarousel({ children }: { children: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(0);
  const lastSwitch = useRef(0);
  const move = (direction: number) => {
    const element = strip.current;
    if (!element || element.children.length < 2) return;
    const gap = Number.parseFloat(window.getComputedStyle(element).columnGap) || 0;
    const width = (element.firstElementChild as HTMLElement | null)?.offsetWidth ?? element.clientWidth;
    const next = (activeIndex.current + direction + element.children.length) % element.children.length;
    const wraps = (direction > 0 && next === 0) || (direction < 0 && next === element.children.length - 1);
    activeIndex.current = next;
    lastSwitch.current = Date.now();
    element.scrollTo({ left: next * (width + gap), behavior: wraps ? "instant" : "smooth" });
  };
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || element.scrollWidth <= element.clientWidth + 2) return;
      event.preventDefault();
      if (Date.now() - lastSwitch.current < 380) return;
      move(Math.sign(event.deltaY));
    };
    const onScrollEnd = () => {
      const gap = Number.parseFloat(window.getComputedStyle(element).columnGap) || 0;
      const width = (element.firstElementChild as HTMLElement | null)?.offsetWidth ?? element.clientWidth;
      activeIndex.current = Math.round(element.scrollLeft / (width + gap));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("scrollend", onScrollEnd);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("scrollend", onScrollEnd);
    };
  }, []);
  return <div className="relative min-w-0">
    <div ref={strip} className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:thin]" aria-label="最近处理项目，可用鼠标滚轮或左右按钮切换">{children}</div>
    <div className="absolute bottom-1 right-1 flex gap-1"><button type="button" onClick={() => move(-1)} aria-label="上一个项目" className="grid size-7 place-items-center rounded-full border border-[#cfe4d6] bg-white/95 text-[#0d7650]"><ChevronLeft size={17}/></button><button type="button" onClick={() => move(1)} aria-label="下一个项目" className="grid size-7 place-items-center rounded-full border border-[#cfe4d6] bg-white/95 text-[#0d7650]"><ChevronRight size={17}/></button></div>
  </div>;
}
