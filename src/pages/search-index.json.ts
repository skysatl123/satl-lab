// src/pages/search-index.json.ts
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

/**
 * ✅ posting list에 docId를 추가 (같은 docId 중복 push 방지)
 * - docs가 최신순으로 정렬되어 있어도, index를 만들 때 docId는 단조 증가(0..n-1)
 * - 같은 token/prefix에 같은 docId가 여러 번 들어가지 않도록 마지막 값 체크
 */
function addPosting(index: Record<string, number[]>, key: string, docId: number) {
  const arr = index[key] || (index[key] = []);
  if (arr.length === 0 || arr[arr.length - 1] !== docId) arr.push(docId);
}

/**
 * ✅ token + prefix(2..12) 인덱싱
 * - "test2"가 있으면 "te","tes","test",...,"test2"까지 키가 생겨서
 *   /search에서 prefix fallback 없이도 빠르게 후보를 잡을 수 있음
 * - maxPrefix=12는 메모리 폭발 방지 (원하면 조정 가능)
 */
function indexToken(index: Record<string, number[]>, token: string, docId: number) {
  if (!token || token.length < 2) return;

  // exact token
  addPosting(index, token, docId);

  // prefixes: 2..min(12, token.length)
  const maxPrefix = Math.min(12, token.length);
  for (let i = 2; i <= maxPrefix; i++) {
    addPosting(index, token.slice(0, i), docId);
  }
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
    doc.description = summary; // description은 summary만 사용
  }

  return doc;
}

export async function GET() {
  // ✅ published만 인덱싱 (draft 제외)
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

  // 최신 글 우선 (ISO 문자열 비교)
  docs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // ✅ inverted index: token/prefix -> docIndex[]
  const index: Record<string, number[]> = Object.create(null);

  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];

    // 문서 단위 중복 방지 (한 문서에서 같은 토큰 여러 번 나와도 1번만)
    const uniq = new Set(tokenize(d.text));

    for (const tok of uniq) {
      indexToken(index, tok, i);
    }
  }

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), docs, index }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}