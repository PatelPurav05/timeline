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

function normalizeStageDraft(raw: Partial<StageDraft>, index: number): StageDraft {
  const safeNumber = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const safeString = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  const safeArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];

  const order = safeNumber(raw.order, index);
  const ageStart = safeNumber(raw.ageStart, Math.max(0, index * 10));
  const ageEnd = safeNumber(raw.ageEnd, ageStart + 9);

  return {
    order,
    title: safeString(raw.title, `[${ageStart}-${ageEnd}] - Unnamed Era`),
    ageStart,
    ageEnd,
    dateStart: safeString(raw.dateStart, "unknown"),
    dateEnd: safeString(raw.dateEnd, "unknown"),
    eraSummary: safeString(raw.eraSummary, "Biography era summary unavailable."),
    worldviewSummary: safeString(raw.worldviewSummary, "Worldview summary unavailable."),
    turningPoints: safeArray(raw.turningPoints).slice(0, 6),
    confidence: safeNumber(raw.confidence, 0.5),
  };
}

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

async function extractSource(
  source: CandidateSource,
  personName?: string,
): Promise<{ text: string; imageUrls: string[]; transcriptText?: string }> {
  if (source.url.includes("youtube.com/results")) {
    return {
      text: `${source.title}\n${source.snippet ?? ""}\nThis is a search index URL and should be treated as metadata-only evidence.`,
      imageUrls: [],
    };
  }

  // Handle YouTube videos — fetch transcript
  const ytId = extractYoutubeId(source.url);
  if (ytId) {
    const transcript = await fetchYoutubeTranscript(ytId);
    return {
      text: `${source.title}\n${source.snippet ?? ""}\nYouTube video.`,
      imageUrls: [],
      transcriptText: transcript || undefined,
    };
  }

  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "TimelineResearchBot/1.0",
      },
    });
    if (!response.ok) {
      return {
        text: `${source.title}\n${source.snippet ?? ""}\nFailed to fetch full content.`,
        imageUrls: [],
      };
    }
    const html = await response.text();
    const imageUrls = extractImageUrls(html, source.url, personName);
    const plain = stripHtml(html);
    return { text: plain.slice(0, 20000), imageUrls };
  } catch (_error) {
    return {
      text: `${source.title}\n${source.snippet ?? ""}\nContent unavailable; using metadata snippet only.`,
      imageUrls: [],
    };
  }
}

/**
 * Extract image URLs from HTML that are likely related to the person.
 * Filters by alt text relevance, size, and excludes generic site chrome.
 */
function extractImageUrls(html: string, baseUrl: string, personName?: string): string[] {
  const imgRegex = /<img[^>]*>/gi;
  const urls: string[] = [];
  const nameParts = (personName ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const fullTag = match[0];

    // Extract src
    const srcMatch = fullTag.match(/src=["']([^"']+)["']/i);
    if (!srcMatch?.[1]) continue;
    const src = srcMatch[1];

    // Skip data URIs, tiny tracking pixels, icons, SVGs, and generic site assets
    if (src.startsWith("data:")) continue;
    if (src.includes("1x1") || src.includes("pixel") || src.includes("tracking")) continue;
    if (src.endsWith(".svg") || src.includes("/icon")) continue;
    if (src.includes("logo") || src.includes("favicon") || src.includes("avatar")) continue;
    if (src.includes("banner") || src.includes("ad-") || src.includes("sprite")) continue;
    if (src.includes("button") || src.includes("arrow") || src.includes("widget")) continue;

    // Check for size hints — skip small images (icons, thumbnails under 150px)
    const widthMatch = fullTag.match(/width=["']?(\d+)/i);
    if (widthMatch && parseInt(widthMatch[1]) < 150) continue;
    const heightMatch = fullTag.match(/height=["']?(\d+)/i);
    if (heightMatch && parseInt(heightMatch[1]) < 100) continue;

    // Check if the image is likely related to the person via alt text or surrounding context
    const altMatch = fullTag.match(/alt=["']([^"']*)["']/i);
    const altText = (altMatch?.[1] ?? "").toLowerCase();

    // Score relevance: person name in alt text is a strong signal
    let relevant = false;
    if (nameParts.length > 0) {
      const nameInAlt = nameParts.some((part) => altText.includes(part));
      const nameInSrc = nameParts.some((part) => src.toLowerCase().includes(part));
      relevant = nameInAlt || nameInSrc;
    }

    // Also accept images from known photo/media patterns if no name filter
    if (!relevant && nameParts.length > 0) {
      // Skip generic images that don't reference the person at all
      // Only allow if it's from a known person-photo pattern
      const isPhotoPattern = src.includes("photo") || src.includes("portrait") ||
        src.includes("headshot") || src.includes("profile") ||
        altText.includes("photo") || altText.includes("portrait");
      if (!isPhotoPattern) continue;
    }

    // Resolve relative URLs
    let absoluteUrl = src;
    if (src.startsWith("//")) {
      absoluteUrl = "https:" + src;
    } else if (src.startsWith("/")) {
      try {
        const base = new URL(baseUrl);
        absoluteUrl = base.origin + src;
      } catch {
        continue;
      }
    } else if (!src.startsWith("http")) {
      continue;
    }

    urls.push(absoluteUrl);
  }
  // Return up to 4 unique, relevant images
  return [...new Set(urls)].slice(0, 4);
}

/**
 * Search for actual images of a person using Exa with image-focused queries.
 * Returns high-quality image URLs that are actually of the person.
 */
async function searchPersonImages(name: string, stageTitle?: string): Promise<string[]> {
  if (!EXA_API_KEY) return [];

  const query = stageTitle
    ? `${name} photo ${stageTitle.replace(/^\[.*?\]\s*-\s*/, "")}`
    : `${name} photo portrait`;

  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": EXA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        numResults: 5,
        type: "auto",
        text: false,
      }),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      results?: Array<{
        url: string;
        image?: string;
      }>;
    };

    const images: string[] = [];
    for (const result of data.results ?? []) {
      // Exa may return an `image` field with a direct image URL
      if (result.image && result.image.startsWith("http")) {
        images.push(result.image);
      }
    }
    return [...new Set(images)].slice(0, 3);
  } catch {
    return [];
  }
}

/** Extract YouTube video ID from various URL formats */
function extractYoutubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Fetch YouTube video transcript/captions.
 * Uses YouTube's internal timedtext API to get auto-generated captions.
 * Falls back gracefully if no captions are available.
 */
async function fetchYoutubeTranscript(videoId: string): Promise<string> {
  try {
    // Step 1: Fetch the video page to extract caption track info
    const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!pageResponse.ok) return "";
    const pageHtml = await pageResponse.text();

    // Extract the captions JSON from the page source
    const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch?.[1]) return "";

    let captionTracks: Array<{ baseUrl?: string; languageCode?: string }>;
    try {
      captionTracks = JSON.parse(captionMatch[1]);
    } catch {
      return "";
    }

    // Prefer English, fall back to first available
    const englishTrack = captionTracks.find((t) => t.languageCode === "en" || t.languageCode?.startsWith("en"));
    const track = englishTrack ?? captionTracks[0];
    if (!track?.baseUrl) return "";

    // Step 2: Fetch the actual transcript XML
    const captionUrl = track.baseUrl + "&fmt=srv3";
    const captionResponse = await fetch(captionUrl);
    if (!captionResponse.ok) return "";
    const captionXml = await captionResponse.text();

    // Parse the XML to extract text content
    const textSegments: string[] = [];
    const segmentRegex = /<p[^>]*>(.*?)<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = segmentRegex.exec(captionXml)) !== null) {
      const text = match[1]
        .replace(/<[^>]+>/g, "") // Strip nested tags
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
      if (text) textSegments.push(text);
    }

    // If srv3 format didn't work, try the simpler timedtext format
    if (textSegments.length === 0) {
      const simpleRegex = /<text[^>]*>(.*?)<\/text>/gi;
      while ((match = simpleRegex.exec(captionXml)) !== null) {
        const text = match[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, " ")
          .trim();
        if (text) textSegments.push(text);
      }
    }

    const transcript = textSegments.join(" ").trim();
    // Cap at 30k chars to keep things manageable
    return transcript.slice(0, 30000);
  } catch {
    return "";
  }
}

/** Deep research per stage using Exa — articles + YouTube videos */
async function deepResearchStage(
  name: string,
  stage: StageDoc,
): Promise<CandidateSource[]> {
  if (!EXA_API_KEY) return [];

  const titleParts = stage.title.replace(/^\[.*?\]\s*-\s*/, "");
  const allResults: CandidateSource[] = [];

  // ── Search 1: Articles & interviews ──────────
  const articleQuery = `"${name}" ${titleParts} ${stage.eraSummary.slice(0, 100)}`;
  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": EXA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: articleQuery,
        numResults: 6,
        type: "auto",
        text: true,
        highlights: true,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        results?: Array<{
          url: string;
          title?: string;
          publishedDate?: string;
          text?: string;
        }>;
      };

      for (const result of data.results ?? []) {
        const lower = result.url.toLowerCase();
        const sourceType: CandidateSource["type"] =
          lower.includes("youtube.com") || lower.includes("youtu.be")
            ? "video"
            : lower.includes("twitter.com") || lower.includes("x.com")
              ? "post"
              : lower.includes("interview")
                ? "interview"
                : "article";
        allResults.push({
          url: result.url,
          title: result.title ?? result.url,
          type: sourceType,
          publishedAt: result.publishedDate,
          snippet: result.text?.slice(0, 400),
        });
      }
    }
  } catch {
    // Continue to video search even if article search fails
  }

  // ── Search 2: YouTube videos (interviews, talks, podcasts) ──────────
  const videoQuery = `${name} interview talk podcast ${titleParts} site:youtube.com`;
  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": EXA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: videoQuery,
        numResults: 3,
        type: "auto",
        text: false,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        results?: Array<{
          url: string;
          title?: string;
          publishedDate?: string;
        }>;
      };

      for (const result of data.results ?? []) {
        // Only include actual YouTube video pages (not search results / channels)
        const ytId = extractYoutubeId(result.url);
        if (!ytId) continue;

        // Deduplicate against article search results
        if (allResults.some((r) => r.url === result.url)) continue;

        allResults.push({
          url: result.url,
          title: result.title ?? result.url,
          type: "video" as const,
          publishedAt: result.publishedDate,
          snippet: `YouTube video: ${result.title ?? ""}`,
        });
      }
    }
  } catch {
    // Non-fatal — we still have article results
  }

  return allResults;
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
        const extracted = await extractSource({
          url: source.url,
          title: source.title,
          type: source.type,
          publishedAt: source.publishedAt,
        }, person.name);
        await ctx.runMutation(internal.pipeline.updateSourceText, {
          sourceId: source._id,
          rawText: extracted.text,
          imageUrls: extracted.imageUrls,
          transcriptText: extracted.transcriptText,
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

      const sourceDigest: Array<{
        id: string;
        title: string;
        url: string;
        type: SourceDoc["type"];
        publishedAt?: string;
        textSample: string;
      }> = [];
      let digestCursor: string | null = null;
      while (sourceDigest.length < 30) {
        const page = await ctx.runQuery(internal.pipeline.listSourcesPageInternal, {
          personId: args.personId,
          cursor: digestCursor ?? undefined,
          limit: 10,
        });
        for (const source of page.page) {
          sourceDigest.push({
            id: String(source._id),
            title: source.title,
            url: source.url,
            type: source.type,
            publishedAt: source.publishedAt,
            textSample: (source.rawText ?? source.transcriptText ?? "").slice(0, 1000),
          });
          if (sourceDigest.length >= 30) break;
        }
        if (page.isDone) break;
        digestCursor = page.continueCursor;
      }

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
      drafts = drafts.map((draft, index) => normalizeStageDraft(draft, index));

      const stageIds = await ctx.runMutation(internal.pipeline.replaceStages, {
        personId: args.personId,
        stages: drafts,
      });

      const stages: StageDoc[] = await ctx.runQuery(internal.pipeline.listStagesInternal, {
        personId: args.personId,
      });

      let mapCursor: string | null = null;
      while (true) {
        const page = await ctx.runQuery(internal.pipeline.listSourcesPageInternal, {
          personId: args.personId,
          cursor: mapCursor ?? undefined,
          limit: 6,
        });
        for (const source of page.page) {
          const matchJson = await ctx.runAction(api.llm.generateStructuredJson, {
            system:
              "Map this source to the best stage order. Output JSON object {stageOrder:number,relevance:number,rationale:string}. stageOrder must be one of provided stages.",
            user: JSON.stringify({
              source: {
                title: source.title,
                url: source.url,
                type: source.type,
                sample: (source.rawText ?? source.transcriptText ?? "").slice(0, 900),
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
            stages.find((stage: StageDoc) => stage.order === mapped.stageOrder) ??
            stages[Math.min(source._creationTime % stages.length, stages.length - 1)];

          await ctx.runMutation(internal.pipeline.linkSourceToStage, {
            stageId: chosen._id,
            sourceId: source._id,
            relevance: Math.max(0.1, Math.min(1, mapped.relevance ?? 0.5)),
            rationale: mapped.rationale ?? "Semantic era fit",
          });
        }
        if (page.isDone) break;
        mapCursor = page.continueCursor;
      }

      await ctx.runMutation(internal.pipeline.upsertJobPhase, {
        personId: args.personId,
        phase: "stage",
        status: "running",
        progress: 70,
      });

      // ── Deep research per stage ──────────────────────
      for (let si = 0; si < stages.length; si += 1) {
        const stage = stages[si];
        const deepSources = await deepResearchStage(person.name, stage);
        if (deepSources.length > 0) {
          // Add new sources (avoiding duplicates)
          await ctx.runMutation(internal.pipeline.addSources, {
            personId: args.personId,
            sources: deepSources,
          });

          // Extract content from new deep sources
          const newSources: SourceDoc[] = await ctx.runQuery(internal.pipeline.listSourcesInternal, {
            personId: args.personId,
          });
          const deepUrls = new Set(deepSources.map((s) => s.url));
          const justAdded = newSources.filter((s: SourceDoc) => deepUrls.has(s.url) && !s.rawText);

          for (const source of justAdded) {
            const extracted = await extractSource({
              url: source.url,
              title: source.title,
              type: source.type,
              publishedAt: source.publishedAt,
            }, person.name);
            await ctx.runMutation(internal.pipeline.updateSourceText, {
              sourceId: source._id,
              rawText: extracted.text,
              imageUrls: extracted.imageUrls,
              transcriptText: extracted.transcriptText,
            });

            // Link to this stage directly
            await ctx.runMutation(internal.pipeline.linkSourceToStage, {
              stageId: stage._id,
              sourceId: source._id,
              relevance: 0.85,
              rationale: "Deep research: stage-targeted Exa discovery",
            });
          }
        }

        await ctx.runMutation(internal.pipeline.upsertJobPhase, {
          personId: args.personId,
          phase: "stage",
          status: "running",
          progress: 70 + Math.round(((si + 1) / stages.length) * 30),
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

      const stageLinkMap = new Map<string, Id<"stages">>();
      for (const link of stageLinks) {
        stageLinkMap.set(String(link.sourceId), link.stageId);
      }

      // Batch embed: process sources in small pages to stay under memory limits
      const CHUNKS_PER_SOURCE = 10;
      const BATCH_SIZE = 20; // texts per embedding API call
      let embedded = 0;
      let processedSources = 0;
      let embedCursor: string | null = null;
      while (true) {
        const page = await ctx.runQuery(internal.pipeline.listSourcesPageInternal, {
          personId: args.personId,
          cursor: embedCursor ?? undefined,
          limit: 6,
        });
        for (const source of page.page) {
          processedSources += 1;
          const stageId = stageLinkMap.get(String(source._id));
          const text = source.rawText ?? source.transcriptText ?? "";
          const chunks = splitChunks(text).slice(0, CHUNKS_PER_SOURCE);
          const citationJson = JSON.stringify({
            sourceId: String(source._id),
            title: source.title,
            url: source.url,
            publishedAt: source.publishedAt,
          });

          for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batchTexts = chunks.slice(i, i + BATCH_SIZE);
            const embeddings: number[][] = await ctx.runAction(api.llm.embedTextBatch, {
              texts: batchTexts,
            });
            for (let j = 0; j < batchTexts.length; j++) {
              await ctx.runMutation(internal.pipeline.insertChunk, {
                personId: args.personId,
                sourceId: source._id,
                stageId,
                text: batchTexts[j],
                embedding: embeddings[j] ?? [],
                citation: citationJson,
              });
              embedded += 1;
            }
          }

          await ctx.runMutation(internal.pipeline.upsertJobPhase, {
            personId: args.personId,
            phase: "embed",
            status: "running",
            progress: Math.min(99, Math.round((processedSources / (processedSources + 5)) * 100)),
          });
        }
        if (page.isDone) break;
        embedCursor = page.continueCursor;
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

      // Search for actual person images per stage via Exa
      const personImagesByStage: Record<string, string[]> = {};
      const refreshedStages: StageDoc[] = await ctx.runQuery(internal.pipeline.listStagesInternal, {
        personId: args.personId,
      });
      for (const stage of refreshedStages) {
        const images = await searchPersonImages(person.name, stage.title);
        if (images.length > 0) {
          personImagesByStage[String(stage._id)] = images;
        }
      }

      await ctx.runMutation(internal.pipeline.replaceTimelineCards, {
        personId: args.personId,
        personImages: JSON.stringify(personImagesByStage),
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

export const listSourcesPageInternal = internalQuery({
  args: {
    personId: v.id("persons"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query("sources")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: args.limit ?? 10,
      }),
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
    imageUrls: v.optional(v.array(v.string())),
    transcriptText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.sourceId);
    const prevMeta = existing?.metadata ? parseJson<Record<string, unknown>>(existing.metadata, {}) : {};
    const newMeta = {
      ...prevMeta,
      ...(args.imageUrls && args.imageUrls.length > 0 ? { imageUrls: args.imageUrls } : {}),
    };
    const bestText = args.transcriptText ?? args.rawText;
    await ctx.db.patch(args.sourceId, {
      rawText: args.rawText,
      transcriptText: args.transcriptText,
      qualityScore: bestText.length > 800 ? 0.92 : 0.55,
      metadata: JSON.stringify(newMeta),
    });
  },
});

export const addSources = internalMutation({
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
    // Get existing URLs to avoid duplicates
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const existingUrls = new Set(existing.map((s) => s.url));

    for (const source of args.sources) {
      if (existingUrls.has(source.url)) continue;
      await ctx.db.insert("sources", {
        personId: args.personId,
        url: source.url,
        title: source.title,
        type: source.type,
        publishedAt: source.publishedAt,
        metadata: JSON.stringify({ snippet: source.snippet ?? "", deepResearch: true }),
        qualityScore: source.snippet ? 0.7 : 0.45,
        createdAt: Date.now(),
      });
    }
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
  args: {
    personId: v.id("persons"),
    personImages: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const personImagesByStage: Record<string, string[]> = args.personImages
      ? parseJson<Record<string, string[]>>(args.personImages, {})
      : {};

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

      // ── Person images from Exa search (high relevance) ──────────
      const stageKey = String(stage._id);
      const exaImages = personImagesByStage[stageKey] ?? [];
      for (const imgUrl of exaImages) {
        await ctx.db.insert("timelineCards", {
          stageId: stage._id,
          type: "image",
          headline: stage.title,
          body: imgUrl,
          mediaRef: imgUrl,
          order,
          createdAt: Date.now(),
        });
        order += 1;
      }

      // ── Supplementary images from source HTML (person-filtered) ──────
      const allStageLinks = await ctx.db.query("stageSourceLinks").withIndex("by_stage", (q) => q.eq("stageId", stage._id)).collect();
      const addedImageUrls = new Set<string>(exaImages);
      for (const link of allStageLinks) {
        const source = await ctx.db.get(link.sourceId);
        if (!source) continue;

        const meta = parseJson<{ imageUrls?: string[] }>(source.metadata, {});
        if (meta.imageUrls && meta.imageUrls.length > 0) {
          for (const imgUrl of meta.imageUrls.slice(0, 2)) {
            if (addedImageUrls.has(imgUrl)) continue;
            addedImageUrls.add(imgUrl);
            await ctx.db.insert("timelineCards", {
              stageId: stage._id,
              type: "image",
              headline: source.title,
              body: imgUrl,
              mediaRef: imgUrl,
              order,
              createdAt: Date.now(),
            });
            order += 1;
          }
        }

        // ── Video cards from YouTube URLs ──────────
        const ytId = extractYoutubeId(source.url);
        if (ytId) {
          const embedUrl = `https://www.youtube-nocookie.com/embed/${ytId}`;
          await ctx.db.insert("timelineCards", {
            stageId: stage._id,
            type: "video",
            headline: source.title,
            body: embedUrl,
            mediaRef: source.url,
            order,
            createdAt: Date.now(),
          });
          order += 1;
        }
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
