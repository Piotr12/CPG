"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { Button } from "../../components/button";
import { Popover, PopoverAnchor, PopoverContent } from "../../components/popover";

/** How long a mouse may take to cross from the button to the text before the tip closes (WCAG 1.4.13). */
export const HOVER_CLOSE_DELAY_MS = 150;

export interface InfoTipProps {
  /** The button's accessible name, which names the field it explains ("About Planned quantity"). */
  label: string;
  /** The explanation: plain text. */
  children: string;
  className?: string;
}

/**
 * A field's info button and its explanation (UX-014): a toggletip on the shadcn `Popover`, because
 * Radix's `Tooltip` ignores touch. Hover (mouse or pen), keyboard focus and a pinning click or tap each keep
 * it open; a second click closes it, and so do Escape and a press outside. Opening never moves focus.
 * A screen reader gets the text as the button's description, always rendered, so the visible copy is
 * hidden from it.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const id = useId();
  const descriptionId = `${id}-text`;
  const button = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  const closeAll = () => {
    clearTimeout(timer.current);
    setHovered(false);
    setFocused(false);
    setPinned(false);
  };
  // A finger has no hover: a tap opens the tip through focus and the click.
  const enter = ({ pointerType }: PointerEvent) => {
    if (pointerType === "touch") return;
    clearTimeout(timer.current);
    setHovered(true);
  };
  const leave = ({ pointerType }: PointerEvent) => {
    if (pointerType === "touch") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(false), HOVER_CLOSE_DELAY_MS);
  };
  // Pressing the text focuses it (Radix gives the content tabIndex -1): that is not leaving the tip.
  const blur = ({ relatedTarget }: FocusEvent) => {
    const to = relatedTarget as Node | null;
    // The text exists only while the tip is open.
    if (button.current!.contains(to) || content.current?.contains(to)) return;
    setFocused(false);
  };

  return (
    <span className={`inline-flex ${className ?? ""}`}>
      {/* With no Trigger, Radix calls onOpenChange only to dismiss: Escape or a press outside. */}
      <Popover open={hovered || focused || pinned} onOpenChange={closeAll}>
        <PopoverAnchor asChild>
          <Button
            ref={button}
            type="button"
            variant="ghost"
            size="icon-xs"
            className="rounded-full text-muted-foreground"
            aria-label={label}
            aria-describedby={descriptionId}
            onPointerEnter={enter}
            onPointerLeave={leave}
            // Keyboard focus only: a dialog focuses its first control when it opens, and a click or tap
            // on the button pins the tip itself.
            onFocus={(event) => event.currentTarget.matches(":focus-visible") && setFocused(true)}
            onBlur={blur}
            onClick={() => (pinned ? closeAll() : setPinned(true))}
          >
            <Info aria-hidden="true" className="size-3.5" />
          </Button>
        </PopoverAnchor>
        <span id={descriptionId} className="sr-only">
          {children}
        </span>
        <PopoverContent
          ref={content}
          aria-hidden="true"
          side="top"
          collisionPadding={8}
          className="w-auto max-w-[min(18rem,calc(100vw-2rem))]"
          onPointerEnter={enter}
          onPointerLeave={leave}
          onBlur={blur}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // The button sits outside the content, so Radix would dismiss on its press before the click
          // pins or unpins the tip.
          onInteractOutside={(event) => {
            if (button.current!.contains(event.target as Node)) event.preventDefault();
          }}
        >
          {children}
        </PopoverContent>
      </Popover>
    </span>
  );
}
