import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import slugify from "slugify";

const EXA_API_KEY = process.env.EXA_API_KEY;

type CandidateSource = {
  url: string;
  title: string;
  type: "article" | "video" | "post" | "interview" | "other";
  publishedAt?: string;
  snippet?: string;
};

type StageDraft = {
  order: number;
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

type SourceDoc = {
  _id: Id<"sources">;
  _creationTime: number;
  personId: Id<"persons">;
  url: string;
  type: "article" | "video" | "post" | "interview" | "other";
  title: string;
  publishedAt?: string;
  metadata: string;
  rawText?: string;
  transcriptText?: string;
  qualityScore: number;
  createdAt: number;
};

type StageDoc = {
  _id: Id<"stages">;
  _creationTime: number;
  personId: Id<"persons">;
  order: number;
  title: string;
  ageStart: number;
  ageEnd: number;
  dateStart: string;
  dateEnd: string;
  eraSummary: string;
  worldviewSummary: string;
  turningPoints: string[];
  confidence: number;
  createdAt: number;
};

type StageLinkEntry = {
  stageId: Id<"stages">;
  sourceId: Id<"sources">;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitChunks(text: string, maxChars = 1200): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const end = Math.min(clean.length, cursor + maxChars);
    out.push(clean.slice(cursor, end));
    cursor = end;
  }
  return out;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function discoverWithExa(name: string): Promise<CandidateSource[]> {
  if (!EXA_API_KEY) return [];
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": EXA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `${name} interviews talks biography timeline`,
      numResults: 12,
      type: "auto",
      text: true,
    }),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as {
    results?: Array<{
      url: string;
      title?: string;
      publishedDate?: string;
      text?: string;
    }>;
  };

  return (data.results ?? []).map((result) => {
    const lower = result.url.toLowerCase();
    const sourceType: CandidateSource["type"] =
      lower.includes("youtube.com") || lower.includes("youtu.be")
        ? "video"
        : lower.includes("twitter.com") || lower.includes("x.com")
          ? "post"
          : lower.includes("interview")
            ? "interview"
            : "article";
    return {
      url: result.url,
      title: result.title ?? result.url,
      type: sourceType,
      publishedAt: result.publishedDate,
      snippet: result.text?.slice(0, 400),
    };
  });
}

function fallbackDiscovery(name: string): CandidateSource[] {
  const slug = slugify(name, { lower: true, strict: true });
  const wiki = `https://en.wikipedia.org/wiki/${slugify(name, { strict: false }).replace(/\s+/g, "_")}`;
  const items: CandidateSource[] = [
    {
      url: wiki,
      title: `${name} - Wikipedia`,
      type: "article" as const,
      snippet: `${name} biography and chronology overview.`,
    },
    {
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(name + " interview")}`,
      title: `${name} interviews - YouTube search`,
      type: "video" as const,
      snippet: `Interview and talk results for ${name}.`,
    },
    {
      url: `https://duckduckgo.com/?q=${encodeURIComponent(name + " longform interview")}`,
      title: `${name} longform interviews`,
      type: "interview" as const,
      snippet: `External article index for ${name}.`,
    },
    {
      url: `https://duckduckgo.com/?q=${encodeURIComponent(name + " career timeline")}`,
      title: `${name} career timeline`,
      type: "article" as const,
      snippet: `Timeline-oriented source index for ${name}.`,
    },
    {
      url: `https://duckduckgo.com/?q=${encodeURIComponent(name + " tweets posts")}`,
      title: `${name} posts and commentary`,
      type: "post" as const,
      snippet: `Public commentary sources for ${name}.`,
    },
    {
      url: `https://duckduckgo.com/?q=${encodeURIComponent(name + " startup years")}`,
      title: `${name} early stage years`,
      type: "article" as const,
      snippet: `Early-career context and references.`,
    },
  ];
  return items.map((source) => ({ ...source, url: source.url.replace("{slug}", slug) }));
}

async function extractSource(source: CandidateSource): Promise<string> {
  if (source.url.includes("youtube.com/results")) {
    return `${source.title}\n${source.snippet ?? ""}\nThis is a search index URL and should be treated as metadata-only evidence.`;
  }

  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "TimelineResearchBot/1.0",
      },
    });
    if (!response.ok) {
      return `${source.title}\n${source.snippet ?? ""}\nFailed to fetch full content.`;
    }
    const html = await response.text();
    const plain = stripHtml(html);
    return plain.slice(0, 20000);
  } catch (_error) {
    return `${source.title}\n${source.snippet ?? ""}\nContent unavailable; using metadata snippet only.`;
  }
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export const bootstrapPerson = mutation({
  args: {
    name: v.string(),
    seedUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slugBase = slugify(args.name, { lower: true, strict: true }) || `person-${now}`;
    const slug = `${slugBase}-${Math.floor(now / 1000)}`;

    const personId = await ctx.db.insert("persons", {
      name: args.name,
      slug,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("jobs", {
      personId,
      phase: "discover",
      status: "queued",
      progress: 0,
      createdAt: now,
    });

    if (args.seedUrls && args.seedUrls.length > 0) {
      for (const url of args.seedUrls) {
        await ctx.db.insert("sources", {
          personId,
          url,
          title: url,
          type: "other",
          metadata: JSON.stringify({ seeded: true }),
          qualityScore: 0.4,
          createdAt: now,
        });
      }
    }

    return personId;
  },
});

export const startIngestion = mutation({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, api.pipeline.runIngestion, {
      personId: args.personId,
    });
  },
});

export const runIngestion = action({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const person = await ctx.runQuery(internal.pipeline.getPersonInternal, {
      personId: args.personId,
    });
    if (!person) throw new Error("Person not found");

    await ctx.runMutation(internal.pipeline.markPersonStatus, {
      personId: args.personId,
      status: "processing",
    });

    try {
      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "discover",
        status: "running",
        progress: 5,
      });

      let discovered = await discoverWithExa(person.name);
      if (discovered.length === 0) {
        discovered = fallbackDiscovery(person.name);
      }

      await ctx.runMutation(internal.pipeline.replaceSources, {
        personId: args.personId,
        sources: discovered,
      });

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "discover",
        status: "done",
        progress: 100,
      });

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "extract",
        status: "running",
        progress: 10,
      });

      const sources = await ctx.runQuery(internal.pipeline.listSourcesInternal, {
        personId: args.personId,
      });

      let completed = 0;
      for (const source of sources) {
        const text = await extractSource({
          url: source.url,
          title: source.title,
          type: source.type,
          publishedAt: source.publishedAt,
        });
        await ctx.runMutation(internal.pipeline.updateSourceText, {
          sourceId: source._id,
          rawText: text,
        });
        completed += 1;
        await ctx.runMutation(internal.pipeline.upsertJobPhase, {
          personId: args.personId,
          phase: "extract",
          status: "running",
          progress: Math.round((completed / Math.max(sources.length, 1)) * 100),
        });
      }

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "extract",
        status: "done",
        progress: 100,
      });

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "stage",
        status: "running",
        progress: 10,
      });

      const sourcesWithText: SourceDoc[] = await ctx.runQuery(internal.pipeline.listSourcesInternal, {
        personId: args.personId,
      });

      const sourceDigest = sourcesWithText.map((source: SourceDoc) => ({
        id: String(source._id),
        title: source.title,
        url: source.url,
        type: source.type,
        publishedAt: source.publishedAt,
        textSample: (source.rawText ?? source.transcriptText ?? "").slice(0, 1000),
      }));

      const stageJson = await ctx.runAction(api.llm.generateStructuredJson, {
        system:
          "You create biographical life stages by age-era first, then refine with context shifts. Output strict JSON object with key 'stages'. Each stage: order, title, ageStart, ageEnd, dateStart, dateEnd, eraSummary, worldviewSummary, turningPoints (array), confidence. Title MUST look like '[18-24] - Startup Operator: Early Builder'. Use 3-7 stages.",
        user: JSON.stringify({ person: person.name, sources: sourceDigest }),
      });

      const parsed = parseJson<{ stages?: StageDraft[] }>(stageJson, { stages: [] });

      let drafts = (parsed.stages ?? []).slice(0, 7);
      if (drafts.length < 3) {
        drafts = [
          {
            order: 0,
            title: "[0-17] - Formative Years",
            ageStart: 0,
            ageEnd: 17,
            dateStart: "unknown",
            dateEnd: "unknown",
            eraSummary: "Early development and education period.",
            worldviewSummary: "Values and interests begin to form.",
            turningPoints: ["Early interests emerge"],
            confidence: 0.52,
          },
          {
            order: 1,
            title: "[18-29] - Early Builder",
            ageStart: 18,
            ageEnd: 29,
            dateStart: "unknown",
            dateEnd: "unknown",
            eraSummary: "Hands-on execution and identity formation through work.",
            worldviewSummary: "Pragmatic and experimental mindset strengthens.",
            turningPoints: ["First major role", "Early public visibility"],
            confidence: 0.49,
          },
          {
            order: 2,
            title: "[30-45] - Institutional Influence",
            ageStart: 30,
            ageEnd: 45,
            dateStart: "unknown",
            dateEnd: "present",
            eraSummary: "Leadership and broad strategic influence expand.",
            worldviewSummary: "Long-horizon decision-making dominates.",
            turningPoints: ["Leadership transition", "Broader societal influence"],
            confidence: 0.48,
          },
        ];
      }

      const stageIds = await ctx.runMutation(internal.pipeline.replaceStages, {
        personId: args.personId,
        stages: drafts,
      });

      const stages: StageDoc[] = await ctx.runQuery(internal.pipeline.listStagesInternal, {
        personId: args.personId,
      });

      for (const source of sourcesWithText) {
        const matchJson = await ctx.runAction(api.llm.generateStructuredJson, {
          system:
            "Map this source to the best stage order. Output JSON object {stageOrder:number,relevance:number,rationale:string}. stageOrder must be one of provided stages.",
          user: JSON.stringify({
            source: {
              title: source.title,
              url: source.url,
              type: source.type,
              sample: (source.rawText ?? "").slice(0, 900),
            },
            stages: stages.map((stage: StageDoc) => ({
              order: stage.order,
              title: stage.title,
              eraSummary: stage.eraSummary,
            })),
          }),
        });

        const mapped = parseJson<{ stageOrder?: number; relevance?: number; rationale?: string }>(
          matchJson,
          {},
        );
        const chosen =
          stages.find((stage: StageDoc) => stage.order === mapped.stageOrder) ?? stages[Math.min(source._creationTime % stages.length, stages.length - 1)];

        await ctx.runMutation(internal.pipeline.linkSourceToStage, {
          stageId: chosen._id,
          sourceId: source._id,
          relevance: Math.max(0.1, Math.min(1, mapped.relevance ?? 0.5)),
          rationale: mapped.rationale ?? "Semantic era fit",
        });
      }

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "stage",
        status: "done",
        progress: 100,
      });

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "embed",
        status: "running",
        progress: 10,
      });

      await ctx.runMutation(internal.pipeline.clearChunksForPerson, {
        personId: args.personId,
      });

      const stageLinks: StageLinkEntry[] = await ctx.runQuery(internal.pipeline.listStageLinksForPerson, {
        personId: args.personId,
      });

      let embedded = 0;
      for (const source of sourcesWithText) {
        const stageLink = stageLinks.find((link: StageLinkEntry) => link.sourceId === source._id);
        const text = source.rawText ?? source.transcriptText ?? "";
        const chunks = splitChunks(text);
        for (const chunk of chunks.slice(0, 18)) {
          const embedding = await ctx.runAction(api.llm.embedText, { text: chunk });
          await ctx.runMutation(internal.pipeline.insertChunk, {
            personId: args.personId,
            sourceId: source._id,
            stageId: stageLink?.stageId,
            text: chunk,
            embedding,
            citation: JSON.stringify({
              sourceId: String(source._id),
              title: source.title,
              url: source.url,
              publishedAt: source.publishedAt,
            }),
          });
          embedded += 1;
        }
      }

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "embed",
        status: "done",
        progress: embedded > 0 ? 100 : 0,
      });

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "publish",
        status: "running",
        progress: 20,
      });

      await ctx.runMutation(internal.pipeline.replaceTimelineCards, {
        personId: args.personId,
      });

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "publish",
        status: "done",
        progress: 100,
      });

      await ctx.runMutation(internal.pipeline.markPersonStatus, {
        personId: args.personId,
        status: "ready",
      });

      return { ok: true };
    } catch (error) {
      await ctx.runMutation(internal.pipeline.markPersonStatus, {
        personId: args.personId,
        status: "failed",
      });
      await ctx.runMutation(internal.pipeline.markLatestRunningJobFailed, {
        personId: args.personId,
        message: error instanceof Error ? error.message : "Unknown ingestion failure",
      });
      throw error;
    }
  },
});

type ChunkDoc = {
  _id: Id<"chunks">;
  text: string;
  citation: string;
  embedding: number[];
};

type ScoredChunk = {
  chunk: ChunkDoc;
  score: number;
};

export const scoreAndSelectChunks = action({
  args: {
    personId: v.id("persons"),
    stageId: v.id("stages"),
    query: v.string(),
    topK: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    usedFallback: boolean;
    chunks: Array<{ id: Id<"chunks">; text: string; citation: string; score: number }>;
  }> => {
    const topK = args.topK ?? 8;
    const qEmbedding: number[] = await ctx.runAction(api.llm.embedText, { text: args.query });

    const stageChunks: ChunkDoc[] = await ctx.runQuery(internal.pipeline.listChunksByStage, {
      stageId: args.stageId,
    });
    const scoredStage: ScoredChunk[] = stageChunks
      .map((chunk: ChunkDoc) => ({ chunk, score: cosineSimilarity(qEmbedding, chunk.embedding) }))
      .sort((a: ScoredChunk, b: ScoredChunk) => b.score - a.score)
      .slice(0, topK);

    let usedFallback = false;
    let result: ScoredChunk[] = scoredStage;

    if (scoredStage.length < Math.max(3, Math.floor(topK / 2))) {
      usedFallback = true;
      const allChunks: ChunkDoc[] = await ctx.runQuery(internal.pipeline.listChunksByPerson, {
        personId: args.personId,
      });
      result = allChunks
        .map((chunk: ChunkDoc) => ({ chunk, score: cosineSimilarity(qEmbedding, chunk.embedding) }))
        .sort((a: ScoredChunk, b: ScoredChunk) => b.score - a.score)
        .slice(0, topK);
    }

    return {
      usedFallback,
      chunks: result.map((item: ScoredChunk) => ({
        id: item.chunk._id,
        text: item.chunk.text,
        citation: item.chunk.citation,
        score: item.score,
      })),
    };
  },
});

export const getPersonInternal = internalQuery({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => ctx.db.get(args.personId),
});

export const listSourcesInternal = internalQuery({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) =>
    ctx.db.query("sources").withIndex("by_person", (q) => q.eq("personId", args.personId)).collect(),
});

export const listStagesInternal = internalQuery({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) =>
    ctx.db
      .query("stages")
      .withIndex("by_person_order", (q) => q.eq("personId", args.personId))
      .order("asc")
      .collect(),
});

export const listChunksByStage = internalQuery({
  args: { stageId: v.id("stages") },
  handler: async (ctx, args) =>
    ctx.db.query("chunks").withIndex("by_stage", (q) => q.eq("stageId", args.stageId)).collect(),
});

export const listChunksByPerson = internalQuery({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) =>
    ctx.db.query("chunks").withIndex("by_person", (q) => q.eq("personId", args.personId)).collect(),
});

export const listStageLinksForPerson = internalQuery({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const stages = await ctx.db.query("stages").withIndex("by_person", (q) => q.eq("personId", args.personId)).collect();
    const links: Array<{ stageId: Id<"stages">; sourceId: Id<"sources"> }> = [];
    for (const stage of stages) {
      const stageLinks = await ctx.db.query("stageSourceLinks").withIndex("by_stage", (q) => q.eq("stageId", stage._id)).collect();
      for (const link of stageLinks) {
        links.push({ stageId: link.stageId, sourceId: link.sourceId });
      }
    }
    return links;
  },
});

export const markPersonStatus = internalMutation({
  args: {
    personId: v.id("persons"),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("ready"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.personId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const upsertJobPhase = internalMutation({
  args: {
    personId: v.id("persons"),
    phase: v.union(
      v.literal("discover"),
      v.literal("extract"),
      v.literal("stage"),
      v.literal("embed"),
      v.literal("publish"),
    ),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("done"), v.literal("failed")),
    progress: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const found = existing.find((job) => job.phase === args.phase);
    if (!found) {
      await ctx.db.insert("jobs", {
        personId: args.personId,
        phase: args.phase,
        status: args.status,
        progress: args.progress,
        startedAt: args.status === "running" ? Date.now() : undefined,
        finishedAt: args.status === "done" ? Date.now() : undefined,
        createdAt: Date.now(),
      });
      return;
    }
    await ctx.db.patch(found._id, {
      status: args.status,
      progress: args.progress,
      startedAt: found.startedAt ?? (args.status === "running" ? Date.now() : undefined),
      finishedAt: args.status === "done" ? Date.now() : undefined,
    });
  },
});

export const replaceSources = internalMutation({
  args: {
    personId: v.id("persons"),
    sources: v.array(
      v.object({
        url: v.string(),
        title: v.string(),
        type: v.union(
          v.literal("article"),
          v.literal("video"),
          v.literal("post"),
          v.literal("interview"),
          v.literal("other"),
        ),
        publishedAt: v.optional(v.string()),
        snippet: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();

    for (const source of existing) {
      await ctx.db.delete(source._id);
    }

    for (const source of args.sources) {
      await ctx.db.insert("sources", {
        personId: args.personId,
        url: source.url,
        title: source.title,
        type: source.type,
        publishedAt: source.publishedAt,
        metadata: JSON.stringify({ snippet: source.snippet ?? "" }),
        qualityScore: source.snippet ? 0.7 : 0.45,
        createdAt: Date.now(),
      });
    }
  },
});

export const updateSourceText = internalMutation({
  args: {
    sourceId: v.id("sources"),
    rawText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, {
      rawText: args.rawText,
      qualityScore: args.rawText.length > 800 ? 0.88 : 0.55,
    });
  },
});

export const replaceStages = internalMutation({
  args: {
    personId: v.id("persons"),
    stages: v.array(
      v.object({
        order: v.number(),
        title: v.string(),
        ageStart: v.number(),
        ageEnd: v.number(),
        dateStart: v.string(),
        dateEnd: v.string(),
        eraSummary: v.string(),
        worldviewSummary: v.string(),
        turningPoints: v.array(v.string()),
        confidence: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stages")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    for (const stage of existing) {
      await ctx.db.delete(stage._id);
    }

    const ids: Id<"stages">[] = [];
    for (const stage of args.stages.sort((a, b) => a.order - b.order)) {
      const id = await ctx.db.insert("stages", {
        personId: args.personId,
        order: stage.order,
        title: stage.title,
        ageStart: stage.ageStart,
        ageEnd: stage.ageEnd,
        dateStart: stage.dateStart,
        dateEnd: stage.dateEnd,
        eraSummary: stage.eraSummary,
        worldviewSummary: stage.worldviewSummary,
        turningPoints: stage.turningPoints,
        confidence: stage.confidence,
        createdAt: Date.now(),
      });
      ids.push(id);
    }
    return ids;
  },
});

export const linkSourceToStage = internalMutation({
  args: {
    stageId: v.id("stages"),
    sourceId: v.id("sources"),
    relevance: v.number(),
    rationale: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stageSourceLinks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    for (const link of existing) {
      await ctx.db.delete(link._id);
    }

    await ctx.db.insert("stageSourceLinks", {
      stageId: args.stageId,
      sourceId: args.sourceId,
      relevance: args.relevance,
      rationale: args.rationale,
    });
  },
});

export const clearChunksForPerson = internalMutation({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }
  },
});

export const insertChunk = internalMutation({
  args: {
    personId: v.id("persons"),
    sourceId: v.id("sources"),
    stageId: v.optional(v.id("stages")),
    text: v.string(),
    embedding: v.array(v.float64()),
    citation: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chunks", {
      personId: args.personId,
      sourceId: args.sourceId,
      stageId: args.stageId,
      text: args.text,
      embedding: args.embedding,
      citation: args.citation,
      createdAt: Date.now(),
    });
  },
});

export const replaceTimelineCards = internalMutation({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const stages = await ctx.db
      .query("stages")
      .withIndex("by_person_order", (q) => q.eq("personId", args.personId))
      .order("asc")
      .collect();

    for (const stage of stages) {
      const cards = await ctx.db.query("timelineCards").withIndex("by_stage", (q) => q.eq("stageId", stage._id)).collect();
      for (const card of cards) {
        await ctx.db.delete(card._id);
      }

      await ctx.db.insert("timelineCards", {
        stageId: stage._id,
        type: "moment",
        headline: stage.title,
        body: stage.eraSummary,
        order: 0,
        createdAt: Date.now(),
      });

      await ctx.db.insert("timelineCards", {
        stageId: stage._id,
        type: "quote",
        headline: "Worldview in this period",
        body: stage.worldviewSummary,
        order: 1,
        createdAt: Date.now(),
      });

      let order = 2;
      for (const point of stage.turningPoints.slice(0, 3)) {
        await ctx.db.insert("timelineCards", {
          stageId: stage._id,
          type: "turning_point",
          headline: "Turning Point",
          body: point,
          order,
          createdAt: Date.now(),
        });
        order += 1;
      }

      const links = await ctx.db.query("stageSourceLinks").withIndex("by_stage", (q) => q.eq("stageId", stage._id)).collect();
      for (const link of links.slice(0, 2)) {
        const source = await ctx.db.get(link.sourceId);
        if (!source) continue;
        await ctx.db.insert("timelineCards", {
          stageId: stage._id,
          type: "media",
          headline: source.title,
          body: source.url,
          mediaRef: source.url,
          order,
          createdAt: Date.now(),
        });
        order += 1;
      }
    }
  },
});

export const markLatestRunningJobFailed = internalMutation({
  args: {
    personId: v.id("persons"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const running = jobs.find((job) => job.status === "running");
    if (!running) return;
    await ctx.db.patch(running._id, {
      status: "failed",
      error: args.message,
      finishedAt: Date.now(),
    });
  },
});
