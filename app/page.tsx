"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "motion/react";

const FEATURES = [
  {
    title: "Deep Research",
    description: "Discovers articles, interviews, YouTube talks, and podcasts across the web automatically.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="2" />
        <path d="M13.5 13.5L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Era-by-Era Timeline",
    description: "AI breaks a life into 3-7 stages by age, with summaries, turning points, and worldview shifts.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="15" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: "Talk to Them",
    description: "Chat as if you're speaking with the person during any era. Grounded in real evidence, never fabricated.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 4H16V13H8L4 16V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M7 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7 10.5H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Video Transcripts",
    description: "Extracts and indexes YouTube video transcripts so the AI can reference what was actually said.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 8L13 10L8 12V8Z" fill="currentColor" />
      </svg>
    ),
  },
];

const STEPS = [
  { label: "Discover", detail: "Search for sources" },
  { label: "Extract", detail: "Pull full text" },
  { label: "Stage", detail: "AI creates life eras" },
  { label: "Embed", detail: "Index for semantic search" },
  { label: "Publish", detail: "Build visual timeline" },
];

export default function HomePage() {
  const router = useRouter();
  const createPerson = useMutation(api.persons.createPerson);
  const people = useQuery(api.persons.listRecentPersons, { limit: 50 }) ?? [];
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people.slice(0, 8);
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, search]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await createPerson({ name: trimmed });
      router.push(`/person/${result.personId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create timeline.");
      setSubmitting(false);
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setSearch(value);
  };

  const inputLower = name.trim().toLowerCase();
  const matchedPerson = people.find((p) => p.name.toLowerCase() === inputLower);

  return (
    <main className="min-h-dvh">
      {/* ── Hero ──────────────────────────────────── */}
      <section className="px-5 pb-4 pt-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mb-8 flex items-end gap-3"
          >
            <Image
              src="/lore-logo.png"
              alt="LORE"
              width={160}
              height={48}
              className="h-12 w-auto"
              priority
            />
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            {/* Hero panel */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="rounded-3xl border-4 border-[var(--frame)] bg-[var(--panel)] p-6 shadow-[8px_8px_0_0_var(--frame)] sm:p-8"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
                Interactive Biography Engine
              </p>
              <h1 className="mt-3 text-balance text-5xl leading-none sm:text-7xl">
                Every life is a story worth scrolling.
              </h1>
              <p className="mt-4 max-w-xl text-pretty text-base text-[var(--ink)]/80 sm:text-lg">
                Enter any person. LORE researches the web, builds an era-by-era timeline with real
                sources, and lets you chat with their perspective.
              </p>

              <form onSubmit={onSubmit} className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="sr-only" htmlFor="person-name">
                  Person name
                </label>
                <input
                  id="person-name"
                  value={name}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder="Try &quot;Sam Altman&quot; or &quot;Steve Jobs&quot;"
                  className="h-12 rounded-xl border-2 border-[var(--frame)] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-12 rounded-xl border-2 border-[var(--frame)] bg-[var(--accent)] px-6 font-semibold text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting
                    ? "Building..."
                    : matchedPerson
                      ? "View Timeline"
                      : "Generate"}
                </button>
              </form>

              {matchedPerson && !submitting && (
                <p className="mt-2 text-sm text-[var(--success)]">
                  Timeline exists for {matchedPerson.name} — click to view.
                </p>
              )}
              {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
            </motion.div>

            {/* Subjects sidebar */}
            <motion.aside
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: "easeOut", delay: 0.07 }}
              className="rounded-3xl border-4 border-[var(--frame)] bg-white p-5 shadow-[8px_8px_0_0_var(--frame)]"
            >
              <h2 className="text-balance text-4xl">
                {search.trim() ? "Search Results" : "Explore"}
              </h2>

              <div className="relative mt-3">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                >
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subjects..."
                  className="h-10 w-full rounded-lg border-2 border-[var(--frame)] bg-[var(--paper)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--accent)]"
                />
              </div>

              <div className="mt-3 space-y-2">
                {filtered.length === 0 ? (
                  <p className="py-6 text-center text-pretty text-sm text-[var(--muted)]">
                    {search.trim()
                      ? "No subjects match your search."
                      : "No timelines yet. Be the first."}
                  </p>
                ) : (
                  filtered.map((person) => (
                    <Link
                      key={person._id}
                      href={`/person/${person._id}`}
                      className="group block rounded-xl border-2 border-[var(--frame)] bg-[var(--panel)] px-4 py-3 transition hover:translate-x-0.5 hover:shadow-[3px_3px_0_0_var(--frame)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{person.name}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            person.status === "ready"
                              ? "border-[var(--success)] text-[var(--success)]"
                              : person.status === "failed"
                                ? "border-red-400 text-red-500"
                                : person.status === "processing"
                                  ? "border-[var(--warn)] text-[var(--warn)]"
                                  : "border-[var(--frame)] text-[var(--ink)]"
                          }`}
                        >
                          {person.status}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </motion.aside>
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────── */}
      <section className="px-5 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}
            className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]"
          >
            How it works
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="mt-2 text-balance text-4xl sm:text-5xl"
          >
            Five phases. One command.
          </motion.h2>

          <div className="mt-8 flex flex-wrap gap-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.25, delay: i * 0.08 }}
                className="flex items-center gap-3 rounded-2xl border-3 border-[var(--frame)] bg-[var(--panel)] px-5 py-4 shadow-[4px_4px_0_0_var(--frame)]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--frame)] bg-[var(--accent)] text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-bold">{step.label}</p>
                  <p className="text-xs text-[var(--muted)]">{step.detail}</p>
                </div>

                {/* Arrow connector */}
                {i < STEPS.length - 1 && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    className="ml-1 hidden text-[var(--muted)] sm:block"
                  >
                    <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────── */}
      <section className="px-5 pb-16 pt-4 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.3, delay: i * 0.07 }}
                className="comic-panel p-5"
              >
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl border-2 border-[var(--frame)] bg-[var(--paper)] text-[var(--accent)]">
                  {feature.icon}
                </div>
                <h3 className="text-lg leading-tight">{feature.title}</h3>
                <p className="mt-1.5 text-pretty text-sm leading-relaxed text-[var(--ink)]/70">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────── */}
      <footer className="border-t-3 border-[var(--frame)] px-5 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Image
            src="/lore-logo.png"
            alt="LORE"
            width={80}
            height={24}
            className="h-6 w-auto"
          />
          <p className="text-xs text-[var(--muted)]">
            Built with Next.js, Convex, OpenAI, and Exa
          </p>
        </div>
      </footer>
    </main>
  );
}
