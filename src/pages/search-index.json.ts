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
  text: string; // normalized
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
  const fallback = new Date(0).toISOString();

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }
  if (value === "" || value === null || value === undefined) {
    return fallback;
  }
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

// ✅ 토큰화(이미 normalize 된 text를 가정). 너무 짧은 토큰은 제외.
function tokenize(normalizedText: string): string[] {
  if (!normalizedText) return [];
  const parts = normalizedText.split(" ");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (!t) continue;
    if (t.length < 2) continue;
    out.push(t);
  }
  return out;
}

function toDoc(args: {
  type: SearchDoc["type"];
  entry: any;
  url: string;
  includeSummary?: boolean;
  extraText?: string[];
}): SearchDoc {
  const { type, entry: e, url, includeSummary = false, extraText = [] } = args;

  const title: string = e?.data?.title ?? "";
  const tags: string[] = e?.data?.tags ?? [];
  const summary: string = e?.data?.summary ?? "";

  const date = safeIsoDate(e?.data?.publishedAt);
  const body = takeExcerpt(e?.body ?? "");

  const text = normalize(
    [title, includeSummary ? summary : "", ...extraText, tags.join(" "), body]
      .filter(Boolean)
      .join("\n")
  );

  const doc: SearchDoc = {
    id: `${type}:${e.id}`,
    type,
    title,
    tags,
    date,
    url,
    text,
  };

  if (includeSummary && summary) {
    doc.description = summary; // A 정책: description은 summary만 사용
  }

  return doc;
}

export async function GET() {
  // ✅ published만 인덱싱 (draft 제외) + 컬렉션 로딩 정책 통일
  const safeGet = <T extends SearchDoc["type"]>(name: T) =>
    getCollection(name, ({ data }: any) => data.status === "published").catch(() => []);

  const [blog, notes, projects, research] = await Promise.all([
    safeGet("blog"),
    safeGet("notes"),
    safeGet("projects"),
    safeGet("research"),
  ]);

  const docs: SearchDoc[] = [
    ...blog.map((e) =>
      toDoc({
        type: "blog",
        entry: e,
        url: `/blog/${e.id}/`,
        includeSummary: true,
      })
    ),
    ...notes.map((e) =>
      toDoc({
        type: "notes",
        entry: e,
        url: `/notes/${e.id}/`,
      })
    ),
    ...projects.map((e) =>
      toDoc({
        type: "projects",
        entry: e,
        url: `/projects/${e.id}/`,
        includeSummary: true,
        extraText: [e?.data?.category ?? ""],
      })
    ),
    ...research.map((e) =>
      toDoc({
        type: "research",
        entry: e,
        url: `/research/${e.id}/`,
        extraText: [e?.data?.type ?? ""],
      })
    ),
  ];

  // 최신 글 우선 (ISO 문자열 비교로 안정적으로 정렬)
  docs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // ✅ inverted index: token -> docIndex[]
  const index: Record<string, number[]> = Object.create(null);

  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];

    // 문서 단위 중복 방지: 같은 토큰이 한 문서에서 여러 번 나와도 doc id 1번만
    const uniq = new Set(tokenize(d.text));
    for (const tok of uniq) {
      const arr = index[tok];
      if (arr) arr.push(i);
      else index[tok] = [i];
    }
  }

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), docs, index }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}