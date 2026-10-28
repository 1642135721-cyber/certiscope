"use client";

import { MessageCircleQuestionMark, X } from "lucide-react";
import Link from "next/link";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { GvQaChat } from "./gv-qa-chat";

type Position = { x: number; y: number };
type Drag = Position & { startX: number; startY: number; moved: boolean };
const storageKey = "certiscope-gv-qa-bubble-position";
const bubbleSize = 46;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function inViewport(position: Position): Position {
  return {
    x: clamp(position.x, 12, Math.max(12, window.innerWidth - bubbleSize - 12)),
    y: clamp(
      position.y,
      12,
      Math.max(12, window.innerHeight - bubbleSize - 12),
    ),
  };
}

export function FloatingGvQa() {
  const [position, setPosition] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const positionRef = useRef<Position | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let saved: Position | null = null;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (typeof value?.x === "number" && typeof value?.y === "number")
        saved = value;
    } catch {
      // A malformed saved position should not prevent the assistant from opening.
    }
    const initial = inViewport(
      saved ?? {
        x: window.innerWidth - bubbleSize - 88,
        y: window.innerHeight - bubbleSize - 24,
      },
    );
    positionRef.current = initial;
    setPosition(initial);
    const resize = () => {
      const next = inViewport(positionRef.current ?? initial);
      positionRef.current = next;
      setPosition(next);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!position) return;
    suppressClickRef.current = false;
    dragRef.current = {
      ...position,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const next = inViewport({ x: drag.x + dx, y: drag.y + dy });
    positionRef.current = next;
    setPosition(next);
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved && positionRef.current) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(positionRef.current));
      } catch {
        // The bubble remains movable when browser storage is unavailable.
      }
    }
  }

  if (!position) return null;
  const panelWidth = Math.min(390, window.innerWidth - 24);
  const panelHeight = Math.min(560, window.innerHeight - 24);
  const panelLeft = clamp(
    position.x + bubbleSize - panelWidth,
    12,
    Math.max(12, window.innerWidth - panelWidth - 12),
  );
  const panelTop = clamp(
    position.y > panelHeight + 20
      ? position.y - panelHeight - 10
      : position.y + bubbleSize + 10,
    12,
    Math.max(12, window.innerHeight - panelHeight - 12),
  );

  return (
    <>
      <button
        type="button"
        aria-label={
          open
            ? "收起规范问答助手；可拖动移动位置"
            : "打开规范问答助手；可拖动移动位置"
        }
        aria-expanded={open}
        aria-controls="floating-gv-qa-panel"
        title="规范问答助手（可拖动）"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setOpen((current) => !current);
        }}
        className="fixed z-50 flex h-[46px] w-[46px] touch-none items-center justify-center rounded-full border border-[#c9e3d1] bg-[#087a50] text-white shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087a50]"
        style={{ left: position.x, top: position.y }}
      >
        <MessageCircleQuestionMark size={22} aria-hidden="true" />
      </button>
      <aside
        id="floating-gv-qa-panel"
        aria-label="GV 规范问答助手"
        className={`${open ? "flex" : "hidden"} fixed z-40 flex-col overflow-hidden rounded-2xl border border-[#cfe4d5] bg-white shadow-2xl`}
        style={{
          left: panelLeft,
          top: panelTop,
          width: panelWidth,
          height: panelHeight,
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#e1ece5] px-4 py-3">
          <div>
            <strong className="text-sm text-[#073c2b]">规范问答助手</strong>
            <p className="text-xs text-[#60766a]">目前仅支持 GV（绿色车辆）</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/rules/qa"
              className="text-xs font-semibold text-[#087a50]"
            >
              打开完整页面
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭问答窗口"
              className="rounded-lg p-1 text-[#60766a] hover:bg-[#edf5ef]"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <GvQaChat compact />
      </aside>
    </>
  );
}
