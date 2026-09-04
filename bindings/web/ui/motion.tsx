/**
 * Motion: the few, short, property-specific animations the panels use.
 * Structural changes (a view or sidebar swapping content, a row arriving,
 * a segment moving) get 120–180ms of transform + opacity; hover never
 * animates. Every rule here is gated on prefers-reduced-motion.
 *
 * Enter animations end at `transform: none` with fill-mode both, so no
 * transform lingers on ancestors of portalled menus once they settle.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styled, { css, keyframes } from "styled-components";
import { t } from "@soft-machine/sdk";
import { Segment, SegmentGroup } from "./controls";

export const MOTION = {
  fast: "0.12s",
  base: "0.16s",
  slow: "0.2s",
  /** Decelerating ease: quick start, soft landing. */
  ease: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const reducedMotion = css`
  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition: none;
  }
`;

export const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
`;

export const fadeDown = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
`;

export const slideFromRight = keyframes`
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: none; }
`;

export const slideFromLeft = keyframes`
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: none; }
`;

export const fade = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export const pop = keyframes`
  from { opacity: 0; transform: scale(0.7); }
  to { opacity: 1; transform: none; }
`;

export type EnterFrom = "left" | "right" | "up" | "down" | "fade" | "pop";

const enterKeyframes = (from: EnterFrom) =>
  from === "left"
    ? slideFromLeft
    : from === "right"
      ? slideFromRight
      : from === "up"
        ? fadeUp
        : from === "down"
          ? fadeDown
          : from === "pop"
            ? pop
            : fade;

const enterCss = css<{ $from: EnterFrom; $delay?: number }>`
  animation: ${({ $from }) => enterKeyframes($from)} ${MOTION.base} ${MOTION.ease} both;
  animation-delay: ${({ $delay }) => ($delay ? `${$delay}ms` : "0ms")};
  ${reducedMotion}
`;

/**
 * Block wrapper that plays an enter animation when it mounts. Give it a
 * `key` that changes with the content (view, item number) and the new
 * content slides in from the side you name. Fills its flex parent.
 */
export const Enter = styled.div<{ $from: EnterFrom; $delay?: number }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  ${enterCss}
`;

/** Non-growing block variant for composers, expanded lists, toolbars. */
export const EnterBlock = styled(Enter)`
  flex: 0 0 auto;
`;

/** Row-direction variant for toolbar groups (ToolbarGroup `as={EnterRow}`
 *  keeps the group's own flex rules; this only fixes the axis). */
export const EnterRow = styled(Enter)`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

/** Inline variant for breadcrumb segments, badges and icon swaps. $grow
 *  lets it take the remaining width (for a truncating breadcrumb title). */
export const EnterInline = styled.span<{ $from: EnterFrom; $delay?: number; $grow?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  ${({ $grow }) => $grow && "flex: 1 1 auto;"}
  ${enterCss}
`;

/** Stagger delay for the n-th row: 20ms steps, capped so long lists finish fast. */
export function staggerDelay(index: number, step = 20, cap = 12): number {
  return Math.min(index, cap) * step;
}

// ── Segmented control with a sliding indicator ─────────────────────────────

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (value: T) => void;
  /** Stretch to the container width with equal segments. */
  fill?: boolean;
  /** Use tab semantics (role=tablist / tab + aria-selected). */
  tabs?: boolean;
  className?: string;
}

/**
 * Segmented control whose active pill glides between options instead of
 * jumping. Geometry is measured from the buttons, so any label content
 * works; the first paint places the pill without animating.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  fill,
  tabs,
  className,
}: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const [settled, setSettled] = useState(false);

  const measure = useCallback(() => {
    const el = buttons.current.get(value);
    if (!el) return;
    setBox((prev) =>
      prev && prev.x === el.offsetLeft && prev.w === el.offsetWidth
        ? prev
        : { x: el.offsetLeft, w: el.offsetWidth }
    );
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, options.length]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(group);
    return () => observer.disconnect();
  }, [measure]);

  // Let the first measured position paint before enabling the glide, so
  // the pill never slides in from x=0 on mount.
  useEffect(() => {
    if (!box || settled) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [box, settled]);

  return (
    <SlidingGroup ref={groupRef} $fill={fill} role={tabs ? "tablist" : "radiogroup"} className={className}>
      {box && (
        <Indicator
          $animate={settled}
          style={{ transform: `translateX(${box.x}px)`, width: `${box.w}px` }}
          aria-hidden
        />
      )}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Segment
            key={option.value}
            ref={(node) => {
              if (node) buttons.current.set(option.value, node);
              else buttons.current.delete(option.value);
            }}
            type="button"
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? active : undefined}
            aria-checked={tabs ? undefined : active}
            title={option.title}
            $active={active}
            $bare
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Segment>
        );
      })}
    </SlidingGroup>
  );
}

const SlidingGroup = styled(SegmentGroup)<{ $fill?: boolean }>`
  position: relative;
  ${({ $fill }) =>
    $fill &&
    css`
      display: flex;
      & > button {
        flex: 1;
        justify-content: center;
      }
    `}
  & > button {
    position: relative;
    z-index: 1;
  }
`;

const Indicator = styled.span<{ $animate: boolean }>`
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 0;
  border-radius: ${t.radius};
  background: ${t.bg.elevated};
  will-change: transform, width;
  transition: ${({ $animate }) =>
    $animate ? `transform ${MOTION.slow} ${MOTION.ease}, width ${MOTION.slow} ${MOTION.ease}` : "none"};
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
