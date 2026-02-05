"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "motion/react";

export default function HomePage() {
  const router = useRouter();
  const createPerson = useMutation(api.persons.createPerson);
  const people = useQuery(api.persons.listRecentPersons, { limit: 50 }) ?? [];
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter people by search query (case-insensitive)
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

  // When typing in the main input, also update search to show matches
  const handleNameChange = (value: string) => {
    setName(value);
    setSearch(value);
  };

  // Check if input matches an existing person
  const inputLower = name.trim().toLowerCase();
  const matchedPerson = people.find((p) => p.name.toLowerCase() === inputLower);

  return (
    <main className="min-h-dvh px-5 py-8 sm:px-8 lg:px-12">
      <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="rounded-3xl border-4 border-[var(--frame)] bg-[var(--panel)] p-6 shadow-[8px_8px_0_0_var(--frame)] sm:p-8"
        >
          <p className="text-sm font-semibold uppercase tracking-tight">Timeline Atlas</p>
          <h1 className="mt-3 text-balance text-6xl leading-none sm:text-7xl">
            Scroll Through A Life As It Changed.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base sm:text-lg">
            Enter any person and generate an era-by-era biography with videos, articles, posts, and
            stage-specific chat grounded in evidence from that period.
          </p>

          <form onSubmit={onSubmit} className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="person-name">
              Person name
            </label>
            <input
              id="person-name"
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Sam Altman"
              className="h-12 rounded-xl border-2 border-[var(--frame)] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="h-12 rounded-xl border-2 border-[var(--frame)] bg-[var(--accent)] px-5 font-semibold text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Building timeline..."
                : matchedPerson
                  ? "View Timeline"
                  : "Generate Timeline"}
            </button>
          </form>

          {/* Inline match hint */}
          {matchedPerson && !submitting && (
            <p className="mt-2 text-sm text-[var(--success)]">
              Timeline already exists for {matchedPerson.name} — click to view it.
            </p>
          )}

          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut", delay: 0.07 }}
          className="rounded-3xl border-4 border-[var(--frame)] bg-white p-5 shadow-[8px_8px_0_0_var(--frame)]"
        >
          <h2 className="text-balance text-4xl">
            {search.trim() ? "Search Results" : "Recent Subjects"}
          </h2>

          {/* Search input */}
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
              <p className="py-4 text-center text-pretty text-sm text-[var(--muted)]">
                {search.trim()
                  ? "No subjects match your search."
                  : "No timelines yet. Create one to start the archive."}
              </p>
            ) : (
              filtered.map((person) => (
                <Link
                  key={person._id}
                  href={`/person/${person._id}`}
                  className="block rounded-xl border-2 border-[var(--frame)] bg-[var(--panel)] px-4 py-3 transition hover:translate-x-0.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{person.name}</p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs uppercase ${
                        person.status === "ready"
                          ? "border-[var(--success)] text-[var(--success)]"
                          : person.status === "failed"
                            ? "border-red-400 text-red-500"
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
      </section>
    </main>
  );
}
