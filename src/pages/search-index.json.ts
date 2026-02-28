import { getCollection } from "astro:content";

export const prerender = true;

type SearchDoc = {
  id: string;
  type: "blog" | "notes" | "projects" | "research";
  title: string;
  description?: string;
  tags: string[];
  date: string; // ISO
  url: string;
  text: string;
};

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function takeExcerpt(s: string, maxLen = 2000) {
  const cleaned = s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLen);
}

function safeIsoDate(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date(0).toISOString() : value.toISOString();
  }
  if (value === "" || value === null || value === undefined) {
    return new Date(0).toISOString();
  }
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

export async function GET() {
  // ✅ published만 인덱싱 (draft 제외)
  const [blog, notes, projects, research] = await Promise.all([
    getCollection("blog", ({ data }) => data.status === "published"),
    getCollection("notes", ({ data }) => data.status === "published"),
    getCollection("projects", ({ data }) => data.status === "published").catch(() => []),
    getCollection("research", ({ data }) => data.status === "published").catch(() => []),
  ]);

  const docs: SearchDoc[] = [
    ...blog.map((e) => ({
      id: `blog:${e.id}`,
      type: "blog" as const,
      title: e.data.title ?? "",
      description: e.data.summary ?? e.data.description,
      tags: e.data.tags ?? [],
      date: safeIsoDate(e.data.publishedAt ?? e.data.date),
      url: `/blog/${e.id}/`,
      text: normalize(
        `${e.data.title ?? ""}\n${e.data.summary ?? e.data.description ?? ""}\n${(e.data.tags ?? []).join(
          " "
        )}\n${takeExcerpt(e.body ?? "")}`
      ),
    })),
    ...notes.map((e) => ({
      id: `notes:${e.id}`,
      type: "notes" as const,
      title: e.data.title ?? "",
      tags: e.data.tags ?? [],
      date: safeIsoDate(e.data.publishedAt ?? e.data.date),
      url: `/notes/${e.id}/`,
      text: normalize(`${e.data.title ?? ""}\n${(e.data.tags ?? []).join(" ")}\n${takeExcerpt(e.body ?? "")}`),
    })),
    ...projects.map((e) => ({
      id: `projects:${e.id}`,
      type: "projects" as const,
      title: e.data.title ?? "",
      description: e.data.summary ?? e.data.description,
      tags: e.data.tags ?? [],
      date: safeIsoDate(e.data.publishedAt ?? e.data.date),
      url: `/projects/${e.id}/`,
      text: normalize(
        `${e.data.title ?? ""}\n${e.data.summary ?? e.data.description ?? ""}\n${e.data.category ?? ""}\n${(e.data.tags ?? []).join(
          " "
        )}\n${takeExcerpt(e.body ?? "")}`
      ),
    })),
    ...research.map((e: any) => ({
      id: `research:${e.id}`,
      type: "research" as const,
      title: e.data.title ?? "",
      tags: e.data.tags ?? [],
      date: safeIsoDate(e.data.publishedAt ?? e.data.date),
      url: `/research/${e.id}/`,
      text: normalize(
        `${e.data.title ?? ""}\n${e.data.type ?? ""}\n${(e.data.tags ?? []).join(" ")}\n${takeExcerpt(e.body ?? "")}`
      ),
    })),
  ];

  // 최신 글 우선
  docs.sort((a, b) => (a.date < b.date ? 1 : -1));

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), docs }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}