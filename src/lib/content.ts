// src/lib/content.ts
import { getCollection, type CollectionEntry } from "astro:content";


// ✅ 항상 "T의 서브타입"이 되도록 교집합 형태로 좁힘
export type WithRequiredDate<T extends { data: any }> =
  T & { data: T["data"] & { date: Date } };

export function hasDate<T extends { data: { date?: unknown } }>(
  e: T
): e is WithRequiredDate<T> {
  return e.data.date instanceof Date;
}

export function byDateDesc<T extends { data: { date: Date } }>(a: T, b: T) {
  return b.data.date.getTime() - a.data.date.getTime();
}

// --- collection types ---
export type BlogPost = CollectionEntry<"blog">;
export type NotePost = CollectionEntry<"notes">;
export type ProjectPost = CollectionEntry<"projects">;

// --- caches (sorted, date-guaranteed) ---
let blogCache: WithRequiredDate<BlogPost>[] | null = null;
let notesCache: WithRequiredDate<NotePost>[] | null = null;
let projectsCache: WithRequiredDate<ProjectPost>[] | null = null;

// --- getters ---
export async function getBlogPosts() {
  if (!blogCache) {
    const posts = await getCollection("blog");
    blogCache = posts.filter(hasDate).sort(byDateDesc);
  }
  return blogCache;
}

export async function getNotes() {
  if (!notesCache) {
    const posts = await getCollection("notes");
    notesCache = posts.filter(hasDate).sort(byDateDesc);
  }
  return notesCache;
}

export async function getProjects() {
  if (!projectsCache) {
    const posts = await getCollection("projects");
    projectsCache = posts.filter(hasDate).sort(byDateDesc);
  }
  return projectsCache;
}

// --- derived helpers ---
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