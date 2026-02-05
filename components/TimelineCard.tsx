"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { motion } from "motion/react";

type Card = {
  _id: Id<"timelineCards">;
  type: "moment" | "quote" | "media" | "turning_point";
  headline: string;
  body: string;
  mediaRef?: string;
  order: number;
};

export function TimelineCard({
  card,
  delay = 0,
  className,
}: {
  card: Card;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.2, ease: "easeOut", delay }}
      className={className}
    >
      {card.type === "moment" && <MomentCard card={card} />}
      {card.type === "quote" && <QuoteCard card={card} />}
      {card.type === "turning_point" && <TurningPointCard card={card} />}
      {card.type === "media" && <MediaCard card={card} />}
    </motion.div>
  );
}

function MomentCard({ card }: { card: Card }) {
  return (
    <div className="comic-panel p-5">
      <h3 className="text-balance text-xl leading-tight">{card.headline}</h3>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--ink)]">
        {card.body}
      </p>
    </div>
  );
}

function QuoteCard({ card }: { card: Card }) {
  return (
    <div className="speech-bubble">
      <p className="mb-1 text-xs font-semibold uppercase text-[var(--muted)]">
        {card.headline}
      </p>
      <p className="text-pretty text-sm italic leading-relaxed">
        &ldquo;{card.body}&rdquo;
      </p>
    </div>
  );
}

function TurningPointCard({ card }: { card: Card }) {
  return (
    <div className="comic-panel comic-panel--accent p-5">
      <div className="mb-2 flex items-center gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="text-[var(--accent)]"
        >
          <path
            d="M8 1L10.2 5.4L15 6.2L11.5 9.6L12.4 14.4L8 12.1L3.6 14.4L4.5 9.6L1 6.2L5.8 5.4L8 1Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <h3 className="text-sm font-bold uppercase text-[var(--accent)]">
          {card.headline}
        </h3>
      </div>
      <p className="text-pretty text-sm leading-relaxed">{card.body}</p>
    </div>
  );
}

function MediaCard({ card }: { card: Card }) {
  const url = card.mediaRef ?? card.body;
  const isExternal = url.startsWith("http");

  return (
    <div className="comic-panel flex items-start gap-3 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--frame)] bg-[var(--paper)]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 3H3V13H13V10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 1H15V7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M15 1L8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold">{card.headline}</h3>
        {isExternal ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block truncate text-xs text-[var(--accent)] underline"
          >
            {url}
          </a>
        ) : (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
            {card.body}
          </p>
        )}
      </div>
    </div>
  );
}
