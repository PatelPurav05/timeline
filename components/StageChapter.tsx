"use client";

import { forwardRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { motion } from "motion/react";
import { TimelineCard } from "@/components/TimelineCard";
import { SourceDrawer } from "@/components/SourceDrawer";

type Stage = {
  _id: Id<"stages">;
  title: string;
  ageStart: number;
  ageEnd: number;
  dateStart: string;
  dateEnd: string;
  eraSummary: string;
  worldviewSummary: string;
  turningPoints: string[];
  confidence: number;
};

type Card = {
  _id: Id<"timelineCards">;
  type: "moment" | "quote" | "media" | "turning_point";
  headline: string;
  body: string;
  mediaRef?: string;
  order: number;
};

type StageChapterProps = {
  index: number;
  stage: Stage;
  cards: Card[];
  personId: Id<"persons">;
  personName: string;
  isActive: boolean;
  onOpenChat: () => void;
};

export const StageChapter = forwardRef<HTMLElement, StageChapterProps>(
  function StageChapter(
    { index, stage, cards, personId, personName, isActive, onOpenChat },
    ref,
  ) {
    const [showSources, setShowSources] = useState(false);

    // Parse title: "[19-24] - Startup Operator: Loopt Years" → age badge + title
    const titleMatch = stage.title.match(/^\[(\d+-\d+)\]\s*-\s*(.+)$/);
    const ageBadge = titleMatch?.[1] ?? `${stage.ageStart}–${stage.ageEnd}`;
    const titleText = titleMatch?.[2] ?? stage.title;

    // Sort cards by type for comic panel layout
    const momentCards = cards.filter((c) => c.type === "moment");
    const quoteCards = cards.filter((c) => c.type === "quote");
    const turningCards = cards.filter((c) => c.type === "turning_point");
    const mediaCards = cards.filter((c) => c.type === "media");

    return (
      <section
        ref={ref}
        data-stage-index={index}
        aria-label={stage.title}
        className="relative pb-16 pt-8"
      >
        {/* Spine dot */}
        <div
          className={cn(
            "spine-dot top-10",
            isActive && "spine-dot--active",
          )}
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {/* ── Chapter Header ────────────────────────── */}
          <div className="mb-6">
            <span className="inline-block rounded-full border-2 border-[var(--frame)] px-3 py-0.5 text-xs font-bold tabular-nums uppercase">
              Ages {ageBadge}
            </span>
            {stage.dateStart !== "unknown" && (
              <span className="ml-2 text-sm text-[var(--muted)]">
                {stage.dateStart} – {stage.dateEnd}
              </span>
            )}
            <h2 className="chapter-header mt-2 text-balance text-4xl sm:text-5xl">
              {titleText}
            </h2>
          </div>

          {/* ── Era Summary ──────────────────────────── */}
          <p className="max-w-2xl text-pretty text-base leading-relaxed">
            {stage.eraSummary}
          </p>

          {/* ── Worldview Quote (speech bubble) ──────── */}
          {stage.worldviewSummary && (
            <div className="mt-6 max-w-xl">
              <p className="mb-1 text-xs font-semibold uppercase text-[var(--muted)]">
                Worldview in this period
              </p>
              <blockquote className="speech-bubble text-pretty text-sm italic leading-relaxed">
                &ldquo;{stage.worldviewSummary}&rdquo;
              </blockquote>
            </div>
          )}

          {/* ── Cards Grid (comic panel layout) ──────── */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {momentCards.map((card, i) => (
              <TimelineCard
                key={card._id}
                card={card}
                delay={i * 0.05}
                className="sm:col-span-2"
              />
            ))}
            {turningCards.map((card, i) => (
              <TimelineCard key={card._id} card={card} delay={(i + 1) * 0.05} />
            ))}
            {quoteCards
              .filter((c) => c.body !== stage.worldviewSummary)
              .map((card, i) => (
                <TimelineCard
                  key={card._id}
                  card={card}
                  delay={(i + 2) * 0.05}
                />
              ))}
            {mediaCards.map((card, i) => (
              <TimelineCard
                key={card._id}
                card={card}
                delay={(i + 3) * 0.05}
              />
            ))}
          </div>

          {/* ── Action Buttons ────────────────────────── */}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={onOpenChat}
              className="rounded-xl border-2 border-[var(--frame)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
            >
              Chat in this era
            </button>
            <button
              onClick={() => setShowSources((prev) => !prev)}
              aria-expanded={showSources}
              className="rounded-xl border-2 border-[var(--frame)] bg-white px-4 py-2 text-sm font-semibold transition hover:translate-y-[-1px]"
            >
              {showSources ? "Hide sources" : "View sources"}
            </button>
            {stage.confidence < 0.5 && (
              <span className="flex items-center gap-1 text-xs text-[var(--warn)]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M7 1L1 13H13L7 1Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 5.5V8.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle cx="7" cy="10.5" r="0.5" fill="currentColor" />
                </svg>
                Low evidence
              </span>
            )}
          </div>

          {/* ── Source Drawer ─────────────────────────── */}
          {showSources && (
            <SourceDrawer personId={personId} stageId={stage._id} />
          )}
        </motion.div>
      </section>
    );
  },
);
