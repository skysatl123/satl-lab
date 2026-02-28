import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * ✅ Robust date parser for CMS + legacy frontmatter
 * - Allows empty string ("") coming from CMS fields
 * - Allows string/number/Date
 * - Converts invalid dates to undefined (so optional fields don't break builds)
 */
const dateLike = z.preprocess((v) => {
  // CMS may write empty values
  if (v === "" || v === null || v === undefined) return undefined;

  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? undefined : v;
  }

  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  // anything else -> treat as missing
  return undefined;
}, z.date());

/**
 * ✅ Base metadata: keep as a plain ZodObject so we can .extend() it.
 * - status controls visibility (draft/published)
 * - publishedAt is the canonical sort key; legacy 'date' is accepted
 * - summary falls back to legacy 'description'
 */
const baseMeta = z.object({
  title: z.string(),

  // new canonical fields
  summary: z.string().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  publishedAt: dateLike.optional(),
  updatedAt: dateLike.optional(),

  // legacy compatibility
  date: dateLike.optional(),
  description: z.string().optional(),
  category: z.string().optional(),

  tags: z.array(z.string()).default([]),
  series: z.string().optional(),
  cover: z.string().optional(),
  canonical: z.string().url().optional(),
});

/**
 * ✅ Single normalization pass (applied per-collection at the end)
 * - Always provide publishedAt for sorting
 * - Always provide summary for card/list rendering
 */
const normalizeMeta = <T extends z.ZodTypeAny>(schema: T) =>
  schema.transform((data: any) => {
    const publishedAt = data.publishedAt ?? data.date ?? new Date(0);
    const summary = data.summary ?? data.description;
    return { ...data, publishedAt, summary };
  });

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: normalizeMeta(
    baseMeta.extend({
      kind: z.enum(["theory", "study-log", "idea", "reference"]).default("study-log"),
      topic: z
        .enum([
          "전자회로",
          "반도체소자",
          "신호및시스템",
          "전파공학",
          "미적분",
          "푸리에",
          "라플라스",
          "수학",
          "기타",
        ])
        .default("기타"),
      difficulty: z.enum(["intro", "intermediate", "advanced"]).optional(),
      toc: z.boolean().optional(),
      related: z.array(z.string()).optional(),
    })
  ),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: normalizeMeta(
    baseMeta.extend({
      // IMPORTANT: project status vs visibility status are separate
      projectStatus: z
        .enum(["featured", "completed", "in-progress", "archived"])
        .default("in-progress"),
      featured: z.boolean().optional(),
    })
  ),
});

const notes = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/notes" }),
  schema: normalizeMeta(
    baseMeta.extend({
      labType: z
        .enum(["전자회로실험", "PSPICE", "실습", "과제", "시뮬레이션", "측정/계측", "기타"])
        .default("기타"),
      course: z.string().optional(),
      tools: z.array(z.string()).default([]),
      parts: z.array(z.string()).default([]),
      result: z.enum(["success", "partial", "fail"]).optional(),
      attachments: z.array(z.string()).default([]),
    })
  ),
});

const research = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/research" }),
  schema: normalizeMeta(
    baseMeta.extend({
      type: z.enum(["reading", "experiment", "weekly", "output"]).optional(),
    })
  ),
});

export const collections = { blog, projects, notes, research };