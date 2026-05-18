export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface QuizConfig {
  count: number;
  feedbackMode: "instant" | "batch";
  filterTags: string[];
}

export interface GenConfig {
  mode: "extract" | "expand";
  difficulty: "easy" | "medium" | "hard";
  questionType: "single" | "multi" | "single,multi";
  tag?: string;
}

export interface Material {
  id: number;
  title: string;
  format: string;
  created_at: string;
  chunk_count?: number;
}

export interface Stats {
  total_questions: number;
  total_attempts: number;
  total_materials: number;
  accuracy: number;
  due_reviews: number;
  wrong_questions: number;
  mastered_questions: number;
  streak_days: number;
  tag_distribution: Record<string, number>;
}

export interface ReviewItem {
  review_id: number;
  question_id: number;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  total_reviews: number;
  next_review: string;
  is_due: boolean;
  is_stable: boolean;
  material_title: string;
}

export interface QuestionItem {
  id: number;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  challenge_streak: number;
  mastered: boolean;
}

export interface MaterialStats {
  material_id: number;
  title: string;
  is_example: boolean;
  total_questions: number;
  total_attempts: number;
  correct_attempts: number;
  accuracy: number;
  recent_accuracy: number;
  recent_trend: "up" | "down" | null;
  questions_attempted: number;
  questions_correct: number;
  due_reviews: number;
  wrong_questions: number;
  mastered_questions: number;
  stable_cards: number;
  last_activity: string | null;
  recent_sessions: Array<{
    date: string; correct: number; total: number;
    items?: Array<{ question: string; options: string[]; user_answer: string; correct_answer: string; is_correct: boolean; explanation: string }>;
  }>;
  tag_distribution: Record<string, number>;
  total_chunks: number;
  covered_chunks: number;
}

export interface GenerateStatus {
  status: "idle" | "generating" | "ready" | "error" | "capped";
  question_count: number;
  max_questions?: number;
  message?: string;
}

export async function uploadMaterial(
  title: string,
  content?: string,
  url?: string,
  file?: File
): Promise<Material> {
  const formData = new FormData();
  formData.append("title", title);
  if (content) formData.append("content", content);
  if (url) formData.append("url", url);
  if (file) formData.append("file", file);

  const res = await fetch(`${API_BASE}/materials`, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "上传失败");
  }
  return res.json();
}

export async function listMaterials(): Promise<Material[]> {
  const res = await fetch(`${API_BASE}/materials`);
  return res.json();
}

export async function deleteMaterial(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/materials/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "删除失败" }));
    throw new Error(err.detail || "删除失败");
  }
}

export async function generateQuestions(
  materialId: number,
  excludeCovered = false,
  opts?: { mode?: string; difficulty?: string; questionType?: string; tag?: string }
): Promise<GenerateStatus> {
  const params = new URLSearchParams();
  params.set("exclude_covered", String(excludeCovered));
  if (opts?.mode) params.set("mode", opts.mode);
  if (opts?.difficulty) params.set("difficulty", opts.difficulty);
  if (opts?.questionType) params.set("question_type", opts.questionType);
  if (opts?.tag) params.set("tag", opts.tag);
  const res = await fetch(`${API_BASE}/materials/${materialId}/generate?${params.toString()}`, {
    method: "POST",
  });
  return res.json();
}

export async function getGenerateStatus(materialId: number): Promise<GenerateStatus> {
  const res = await fetch(`${API_BASE}/materials/${materialId}/status`);
  return res.json();
}

export async function getWrongQuestions(materialId?: number): Promise<QuestionItem[]> {
  const params = materialId ? `?material_id=${materialId}` : "";
  const res = await fetch(`${API_BASE}/review/wrong-questions${params}`);
  return res.json();
}

export async function getStableCards(materialId?: number): Promise<ReviewItem[]> {
  const params = materialId ? `?material_id=${materialId}` : "";
  const res = await fetch(`${API_BASE}/review/stable-cards${params}`);
  return res.json();
}

export interface SubmitResult {
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
  challenge_streak: number;
  mastered: boolean;
}

export async function submitAnswer(
  questionId: number,
  userAnswer: string
): Promise<SubmitResult> {
  const res = await fetch(`${API_BASE}/quiz/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: questionId, user_answer: userAnswer }),
  });
  return res.json();
}

export async function saveQuestion(data: Record<string, unknown>): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/quiz/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getDueReviews(materialId?: number, showAll = false): Promise<ReviewItem[]> {
  const params = new URLSearchParams();
  if (materialId) params.set("material_id", String(materialId));
  if (showAll) params.set("show_all", "true");
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/review/due${qs ? "?" + qs : ""}`);
  return res.json();
}

export async function recordReview(questionId: number, score: number): Promise<unknown> {
  const res = await fetch(`${API_BASE}/review/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: questionId, score }),
  });
  return res.json();
}

export async function enrollQuestion(questionId: number): Promise<unknown> {
  const res = await fetch(`${API_BASE}/review/enroll/${questionId}`, { method: "POST" });
  return res.json();
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/stats`);
  return res.json();
}

export async function getMaterialStats(materialId: number): Promise<MaterialStats> {
  const res = await fetch(`${API_BASE}/stats/material/${materialId}`);
  if (!res.ok) throw new Error("材料不存在");
  return res.json();
}

export interface KeyStatus {
  configured: boolean;
  preview: string;
}

export async function saveApiKey(apiKey: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/settings/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "保存失败");
  }
  return res.json();
}

export interface IntentResult {
  status: string;
  material_id: number;
  title: string;
  question_count: number;
}

export async function intentSearch(query: string): Promise<IntentResult> {
  const res = await fetch(`${API_BASE}/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "搜索失败");
  }
  return res.json();
}

export async function getKeyStatus(): Promise<KeyStatus> {
  const res = await fetch(`${API_BASE}/settings/key`);
  return res.json();
}

export async function getMaterialContent(materialId: number): Promise<{ id: number; title: string; content: string; format: string }> {
  const res = await fetch(`${API_BASE}/materials/${materialId}/content`);
  if (!res.ok) throw new Error("材料不存在");
  return res.json();
}

export async function updateQuestion(questionId: number, data: Record<string, unknown>): Promise<QuestionItem> {
  const res = await fetch(`${API_BASE}/quiz/${questionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("更新失败");
  return res.json();
}

export async function deleteQuestion(questionId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/quiz/${questionId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除失败");
}

export async function createQuestion(materialId: number, data: Record<string, unknown>): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/materials/${materialId}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("创建失败");
  return res.json();
}

export async function listQuestions(
  materialId: number,
  options?: { count?: number; tags?: string; excludeMastered?: boolean; excludeIds?: string }
): Promise<QuestionItem[]> {
  const params = new URLSearchParams();
  if (options?.count) params.set("count", String(options.count));
  if (options?.tags) params.set("tags", options.tags);
  if (options?.excludeMastered) params.set("exclude_mastered", "true");
  if (options?.excludeIds) params.set("exclude_ids", options.excludeIds);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/materials/${materialId}/questions${qs ? "?" + qs : ""}`);
  return res.json();
}
