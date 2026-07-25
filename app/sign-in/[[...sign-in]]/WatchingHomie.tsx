"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Homie tile beside the sign-in card, watching the cursor. Two googly
 * pupils sit over the face's own eyes and lean toward the pointer, clamped
 * to a small radius so it stays fond rather than frantic. Pointer-only and
 * motion-safe: touch devices and reduced-motion visitors get the still tile.
 */
export default function WatchingHomie() {
  const tileRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;
    setActive(true);

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = tileRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height * 0.55;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const len = Math.hypot(dx, dy) || 1;
        // Pupils travel at most 34% of the eye radius from centre.
        const reach = Math.min(len / 220, 1) * 5;
        setOffset({ x: (dx / len) * reach, y: (dy / len) * reach });
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="watch-tile" ref={tileRef} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/homie-logo.jpg" alt="" />
      {active ? (
        <>
          <span className="watch-eye" style={{ left: "41.5%", top: "47%" }}>
            <span
              className="watch-pupil"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          </span>
          <span className="watch-eye" style={{ left: "57.5%", top: "47%" }}>
            <span
              className="watch-pupil"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          </span>
        </>
      ) : null}
    </div>
  );
}
