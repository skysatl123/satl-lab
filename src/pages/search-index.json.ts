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
  text: string; // 검색용 텍스트(본문 일부 포함)
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function takeExcerpt(s: string, maxLen = 2000) {
  const cleaned = s
    .replace(/```[\s\S]*?```/g, " ") // 코드블럭 제거(노이즈 감소)
    .replace(/<[^>]+>/g, " ")       // HTML 제거
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLen);
}

export async function GET() {
  const [blog, notes, projects, research] = await Promise.all([
    getCollection("blog"),
    getCollection("notes"),
    getCollection("projects"),
    getCollection("research").catch(() => []), // 비어있을 때 안전
  ]);

  const docs: SearchDoc[] = [
    ...blog.map((e) => ({
      id: e.id,
      type: "blog" as const,
      title: e.data.title ?? "",
      description: e.data.description,
      tags: e.data.tags ?? [],
      date: (e.data.date instanceof Date ? e.data.date : new Date(e.data.date)).toISOString(),
      url: `/blog/${e.id}/`,
      text: normalize(
        `${e.data.title ?? ""}\n${e.data.description ?? ""}\n${(e.data.tags ?? []).join(" ")}\n${takeExcerpt(e.body ?? "")}`
      ),
    })),
    ...notes.map((e) => ({
      id: e.id,
      type: "notes" as const,
      title: e.data.title ?? "",
      tags: e.data.tags ?? [],
      date: (e.data.date instanceof Date ? e.data.date : new Date(e.data.date)).toISOString(),
      url: `/notes/${e.id}/`,
      text: normalize(
        `${e.data.title ?? ""}\n${(e.data.tags ?? []).join(" ")}\n${takeExcerpt(e.body ?? "")}`
      ),
    })),
    ...projects.map((e) => ({
      id: e.id,
      type: "projects" as const,
      title: e.data.title ?? "",
      description: e.data.description,
      tags: e.data.tags ?? [],
      date: (e.data.date instanceof Date ? e.data.date : new Date(e.data.date)).toISOString(),
      url: `/projects/${e.id}/`,
      text: normalize(
        `${e.data.title ?? ""}\n${e.data.description ?? ""}\n${e.data.category ?? ""}\n${(e.data.tags ?? []).join(" ")}\n${takeExcerpt(e.body ?? "")}`
      ),
    })),
    ...research.map((e: any) => ({
      id: e.id,
      type: "research" as const,
      title: e.data.title ?? "",
      tags: e.data.tags ?? [],
      date: (e.data.date instanceof Date ? e.data.date : new Date(e.data.date)).toISOString(),
      url: `/research/${e.id}/`,
      text: normalize(
        `${e.data.title ?? ""}\n${e.data.type ?? ""}\n${(e.data.tags ?? []).join(" ")}\n${takeExcerpt(e.body ?? "")}`
      ),
    })),
  ];

  // 최신 글 우선으로 정렬(검색 결과에도 영향)
  docs.sort((a, b) => (a.date < b.date ? 1 : -1));

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), docs }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}