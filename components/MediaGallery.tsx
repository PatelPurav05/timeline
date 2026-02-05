"use client";

import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { useRef } from "react";

type MediaItem = {
  _id: Id<"timelineCards">;
  type: "image" | "video";
  headline: string;
  body: string;
  mediaRef?: string;
};

/*
 * Staggered masonry grid of images & videos.
 * - Items are laid out in 2-3 columns with alternating heights
 * - Each item reveals with a scroll-triggered animation (offset per column)
 * - The whole gallery has a subtle parallax drift
 * - Everything is contained — never resizes the page
 */
export function MediaGallery({
  items,
  className,
}: {
  items: MediaItem[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Gentle parallax: the gallery drifts up slightly as you scroll past
  const rawY = useTransform(scrollYProgress, [0, 1], [20, -20]);
  const y = useSpring(rawY, { stiffness: 80, damping: 20 });

  if (items.length === 0) return null;

  // Split items into columns for the staggered layout
  const columns = distributeToColumns(items);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
    >
      {/* Gallery label */}
      <motion.p
        initial={{ opacity: 0, x: -12 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
      >
        Photos &amp; Videos
      </motion.p>

      {/* Staggered masonry grid */}
      <motion.div
        style={{ y }}
        className={cn(
          "grid gap-3",
          items.length === 1
            ? "grid-cols-1 max-w-sm"
            : items.length === 2
              ? "grid-cols-2 max-w-2xl"
              : "grid-cols-2 sm:grid-cols-3 max-w-3xl",
        )}
      >
        {columns.map((column, colIdx) => (
          <div key={colIdx} className="flex flex-col gap-3">
            {column.map((item, itemIdx) => (
              <StaggeredItem
                key={item._id}
                item={item}
                index={colIdx * 4 + itemIdx}
                colIndex={colIdx}
              />
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/**
 * Distribute items across columns in a staggered pattern.
 * Alternates tall/short images across columns for visual rhythm.
 */
function distributeToColumns(items: MediaItem[]): MediaItem[][] {
  if (items.length <= 1) return [items];
  const colCount = items.length <= 2 ? 2 : Math.min(3, items.length);
  const columns: MediaItem[][] = Array.from({ length: colCount }, () => []);
  items.forEach((item, i) => {
    columns[i % colCount].push(item);
  });
  return columns;
}

/**
 * Individual gallery item with scroll-triggered reveal.
 * Each column has a different vertical offset so they
 * appear to "cascade" as you scroll down.
 */
function StaggeredItem({
  item,
  index,
  colIndex,
}: {
  item: MediaItem;
  index: number;
  colIndex: number;
}) {
  // Stagger the column offsets — middle column starts higher
  const topOffset = colIndex === 1 ? 24 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 + topOffset, scale: 0.97 }}
      whileInView={{ opacity: 1, y: topOffset, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94],
        delay: index * 0.08,
      }}
    >
      {item.type === "image" ? (
        <GalleryImage item={item} index={index} />
      ) : (
        <GalleryVideo item={item} />
      )}
    </motion.div>
  );
}

/** Aspect ratios cycle to create visual variety */
const ASPECT_CLASSES = [
  "aspect-[3/4]",   // tall portrait
  "aspect-square",  // square
  "aspect-[4/3]",   // landscape-ish
  "aspect-[3/4]",   // tall portrait
  "aspect-[4/5]",   // slightly tall
  "aspect-square",  // square
];

function GalleryImage({ item, index }: { item: MediaItem; index: number }) {
  const [failed, setFailed] = useState(false);
  const imgUrl = item.mediaRef ?? item.body;
  const aspectClass = ASPECT_CLASSES[index % ASPECT_CLASSES.length];

  if (failed) return null;

  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="comic-panel overflow-hidden p-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgUrl}
        alt={item.headline}
        loading="lazy"
        className={cn("w-full object-cover", aspectClass)}
        onError={() => setFailed(true)}
      />
      <div className="px-3 py-2">
        <p className="truncate text-xs font-medium">{item.headline}</p>
      </div>
    </motion.div>
  );
}

function GalleryVideo({ item }: { item: MediaItem }) {
  const embedUrl = item.body;

  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="comic-panel overflow-hidden p-0"
    >
      <div className="relative aspect-video w-full">
        <iframe
          src={embedUrl}
          title={item.headline}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-xs font-medium">{item.headline}</p>
        {item.mediaRef && (
          <a
            href={item.mediaRef}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate text-xs text-[var(--accent)] underline"
          >
            Watch on YouTube
          </a>
        )}
      </div>
    </motion.div>
  );
}
