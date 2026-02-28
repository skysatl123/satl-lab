// src/lib/content.ts
import { getCollection, type CollectionEntry } from "astro:content";

/** ---- Types ---- */
export type BlogPost = CollectionEntry<"blog">;
export type NotePost = CollectionEntry<"notes">;
export type ProjectPost = CollectionEntry<"projects">;
export type ResearchPost = CollectionEntry<"research">;

type Status = "draft" | "published";

/** content.config.ts에서 normalizeMeta로 publishedAt을 항상 채움 */
type WithPublishedAt<T extends { data: any }> =
  T & { data: T["data"] & { publishedAt: Date; status: Status } };

function byPublishedAtDesc<T extends { data: { publishedAt: Date } }>(a: T, b: T) {
  return b.data.publishedAt.getTime() - a.data.publishedAt.getTime();
}

function isPublished<T extends { data: { status: Status } }>(e: T) {
  return e.data.status === "published";
}

/**
 * ✅ Generic cached getter
 * - 각 컬렉션당 정렬은 1회(O(n log n))
 * - published 필터도 1회(O(n)) 후 캐시
 * - 페이지/컴포넌트에서 반복 로직 제거
 */
function makeCachedGetter<K extends "blog" | "notes" | "projects" | "research">(key: K) {
  let cacheAll: WithPublishedAt<CollectionEntry<K>>[] | null = null;
  let cachePublished: WithPublishedAt<CollectionEntry<K>>[] | null = null;

  const loadAll = async () => {
    if (!cacheAll) {
      const entries = await getCollection(key);
      cacheAll = (entries as WithPublishedAt<CollectionEntry<K>>[]).sort(byPublishedAtDesc);
    }
    return cacheAll;
  };

  const loadPublished = async () => {
    if (!cachePublished) {
      const entries = await loadAll();
      cachePublished = entries.filter(isPublished);
    }
    return cachePublished;
  };

  return { loadAll, loadPublished };
}

/** ---- Getters ---- */
const blogGetter = makeCachedGetter("blog");
const notesGetter = makeCachedGetter("notes");
const projectsGetter = makeCachedGetter("projects");
const researchGetter = makeCachedGetter("research");

// ✅ 사이트 노출용: published만
export const getBlogPosts = () => blogGetter.loadPublished();
export const getNotes = () => notesGetter.loadPublished();
export const getProjects = () => projectsGetter.loadPublished();
export const getResearch = () => researchGetter.loadPublished();

// ✅ 내부/관리용: draft 포함 전체(필요할 때만 사용)
export const getAllBlogPosts = () => blogGetter.loadAll();
export const getAllNotes = () => notesGetter.loadAll();

/** ---- Derived helpers ---- */
export async function getFeaturedProjects(limit = 3) {
  const projects = await getProjects();
  return projects.filter((p) => p.data.featured).slice(0, limit);
}

export async function getRecentBlog(limit = 3) {
  const posts = await getBlogPosts();
  return posts.slice(0, limit);
}

export async function getRecentNotes(limit = 3) {
  const posts = await getNotes();
  return posts.slice(0, limit);
}