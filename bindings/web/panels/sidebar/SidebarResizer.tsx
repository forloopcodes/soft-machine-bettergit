/**
 * SidebarResizer: pointer-drag on the sidebar's edge. Tracks the pointer
 * with local state during the drag (no persistence writes per pixel) and
 * commits the final width once on release. Double-click resets.
 */

import { useCallback, useRef, type PointerEvent } from "react";
import { SIDEBAR_WIDTH_DEFAULT } from "../../hooks";
import { SidebarResizeHandle } from "../../ui";

interface SidebarResizerProps {
  width: number;
  dragging: boolean;
  onDragStart: () => void;
  onDrag: (px: number) => void;
  onDragEnd: (px: number) => void;
}

export function SidebarResizer({ width, dragging, onDragStart, onDrag, onDragEnd }: SidebarResizerProps) {
  const origin = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      origin.current = { x: e.clientX, width };
      onDragStart();
    },
    [width, onDragStart]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!origin.current) return;
      onDrag(origin.current.width + (e.clientX - origin.current.x));
    },
    [onDrag]
  );

  const finish = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!origin.current) return;
      const next = origin.current.width + (e.clientX - origin.current.x);
      origin.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      onDragEnd(next);
    },
    [onDragEnd]
  );

  return (
    <SidebarResizeHandle
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      title="Drag to resize · double-click to reset"
      $active={dragging}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={() => onDragEnd(SIDEBAR_WIDTH_DEFAULT)}
    />
  );
}
