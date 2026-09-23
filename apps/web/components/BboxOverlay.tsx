"use client";

import { useState } from "react";
import type { OverlayBox } from "@/lib/types";

interface Props {
  src: string;
  boxes: OverlayBox[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  dimOthers?: boolean;
}

function pct(n: number): string {
  return `${n / 10}%`;
}

/** Image with 0-1000 bbox overlay. Click a box to pin it, click image to clear. */
export function BboxOverlay({
  src,
  boxes,
  activeId,
  onSelect,
  dimOthers = true,
}: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const focusId = activeId ?? hoverId;
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      {failed ? (
        <div className="flex aspect-[3/4] items-center justify-center text-sm text-zinc-500">
          image unavailable
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        // biome-ignore lint/performance/noImgElement: dynamic cross-origin API image with overlay; next/image optimization not applicable
        <img
          src={src}
          alt="invoice"
          crossOrigin="anonymous"
          className="block w-full select-none"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
      {boxes.map((b) => {
        const focused = focusId === b.id;
        const dimmed = dimOthers && focusId !== null && !focused;
        return (
          <button
            key={b.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(focused && activeId ? null : b.id);
            }}
            onMouseEnter={() => setHoverId(b.id)}
            onMouseLeave={() => setHoverId(null)}
            title={b.label}
            className="group absolute cursor-pointer rounded-[2px] transition-opacity"
            style={{
              left: pct(b.bbox.x),
              top: pct(b.bbox.y),
              width: pct(b.bbox.w),
              height: pct(Math.max(b.bbox.h, 12)),
              border: `2px solid ${b.color}`,
              backgroundColor: focused ? `${b.color}33` : `${b.color}14`,
              opacity: dimmed ? 0.25 : 1,
              boxShadow: focused ? `0 0 0 2px ${b.color}66` : undefined,
            }}
          >
            <span
              className="pointer-events-none absolute -top-6 left-0 hidden whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-950 group-hover:block"
              style={{ backgroundColor: b.color }}
            >
              {b.label}
            </span>
          </button>
        );
      })}
      {focusId !== null && (
        <div className="absolute bottom-2 left-2 max-w-[90%] truncate rounded bg-zinc-950/85 px-2 py-1 text-xs text-zinc-200">
          {boxes.find((b) => b.id === focusId)?.label}
        </div>
      )}
    </div>
  );
}
