"use client";
import { useEffect, useState, useRef, useCallback, type ChangeEvent } from "react";
import {
  getMaterialStats, getMaterialContent, enrollQuestion,
  submitAnswer, listQuestions,
  generateQuestions, getGenerateStatus, deleteQuestion,
  getKeyStatus,
  type MaterialStats, type QuizConfig, type GenConfig, type QuestionItem,
} from "@/lib/api";
import { ReviewPanel } from "./ReviewPanel";
import { MasteredList } from "./MasteredList";
import { StableCardList } from "./StableCardList";
import { QuestionEditor } from "./QuestionEditor";

// ---- 工具函数 ----

async function pollWithBackoff(
  check: () => Promise<"continue" | "stop" | "retry">,
  { baseMs = 2000, maxMs = 10000, maxAttempts = 60 } = {}
) {
  let delay = baseMs;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delay));
    const result = await check();
    if (result === "stop") return;
    if (result === "continue") { delay = baseMs; continue; }
    // "retry": back off
    delay = Math.min(maxMs, delay * 1.5);
  }
}

// ---- 子组件 ----

function GeneratingAnimation() {
  const [dot, setDot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDot((d) => (d + 1) % 4), 600);
    return () => clearInterval(t);
  }, []);
  const msgs = ["分析材料内容", "提取关键知识点", "生成题目选项", "校验答案准确性"];
  return (
    <div className="text-center py-16 space-y-4">
      <div className="flex justify-center gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-2.5 h-2.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
      <p className="text-text-secondary text-sm">{msgs[dot]}{".".repeat(dot)}</p>
    </div>
  );
}

// Session-level persistence for stopped materials (survives refresh)
function isMaterialStopped(materialId: number): boolean {
  try {
    const stopped = JSON.parse(sessionStorage.getItem("stopped_materials") || "[]");
    return stopped.includes(materialId);
  } catch { return false; }
}
function setMaterialStopped(materialId: number) {
  try {
    const stopped = JSON.parse(sessionStorage.getItem("stopped_materials") || "[]");
    if (!stopped.includes(materialId)) {
      stopped.push(materialId);
      sessionStorage.setItem("stopped_materials", JSON.stringify(stopped));
    }
  } catch {}
}
function clearMaterialStopped(materialId: number) {
  try {
    const stopped = JSON.parse(sessionStorage.getItem("stopped_materials") || "[]");
    sessionStorage.setItem("stopped_materials", JSON.stringify(stopped.filter((id: number) => id !== materialId)));
  } catch {}
}

// ---- 主组件 ----

type Phase = "idle" | "generating" | "answering" | "feedback" | "result" | "quizReview" | "error" | "wrongReview" | "sm2Review" | "masteredList" | "stableCardList";

interface QuestionData {
  question: string;
  options: string[];
  answer?: string;
  answers?: string[];
  explanation: string;
  tags: string[];
}

export function ForgePanel({ materialId }: { materialId: number }) {
  const [stats, setStats] = useState<MaterialStats | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [quizConfig, setQuizConfig] = useState<QuizConfig>({
    count: 5, feedbackMode: "instant", filterTags: [],
  });
  const [genConfig, setGenConfig] = useState<GenConfig>({
    mode: "extract", difficulty: "medium", questionType: "single",
  });
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [questionIds, setQuestionIds] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ is_correct: boolean; correct_answer: string; explanation: string } | null>(null);
  const [batchAnswers, setBatchAnswers] = useState<Record<number, string>>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [showContent, setShowContent] = useState(false);
  const [materialContent, setMaterialContent] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [allQuestions, setAllQuestions] = useState<QuestionItem[]>([]);
  const [expandedQIds, setExpandedQIds] = useState<Set<number>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [genStartTime, setGenStartTime] = useState(0);
  const [genElapsed, setGenElapsed] = useState(0);
  const [genError, setGenError] = useState("");
  const [genPending, setGenPending] = useState(false);
  const [countInput, setCountInput] = useState("5");
  const [autoContinue, setAutoContinue] = useState(true);
  const autoContinueRef = useRef(true);
  const userStoppedRef = useRef(false);
  const generatingRef = useRef(false);

  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionRef = useRef({ total: 0, correct: 0, results: [] as { qIdx: number; userAnswer: string; isCorrect: boolean }[] });
  const quizReviewSubmitted = useRef(false);
  const roundAnsweredIds = useRef<Set<number>>(new Set());

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase === "answering") {
        const q = questions[currentIndex];
        if (!q) return;
        const isMulti = q.answers && q.answers.length > 1;
        if (e.key === "Enter") {
          if (isMulti) { handleMultiConfirm(); }
          else if (selectedAnswer) { handleSingleConfirm(); }
          return;
        }
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < q.options.length) {
          handleAnswer(q.options[idx]);
        }
      } else if (phase === "feedback" && (e.key === "Enter" || e.key === " ")) {
        handleNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, questions, currentIndex]);

  const genStartRef = useRef(0);

  // v4.0: 从题目库抽题开始答题（0 秒等待）
  const startQuiz = useCallback(async () => {
    setQuestions([]);
    setQuestionIds([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setFeedback(null);
    setBatchAnswers({});
    setErrorMsg("");
    sessionRef.current = { total: 0, correct: 0, results: [] };
    roundAnsweredIds.current.clear();
    mountedRef.current = true;

    const count = quizConfig.count;
    const tags = quizConfig.filterTags.length > 0 ? quizConfig.filterTags : [];
    const excludeIds = roundAnsweredIds.current.size > 0 ? Array.from(roundAnsweredIds.current).join(",") : undefined;
    const qs = await listQuestions(materialId, { count, tags: tags.join(","), excludeMastered: false, excludeIds }).catch(() => []);
    if (qs.length === 0) { setErrorMsg("暂无可答题目"); setPhase("error"); return; }

    const qds: QuestionData[] = [];
    const ids: number[] = [];
    for (const q of qs) {
      const ans = q.answer || "";
      const answers = ans.includes(",") ? ans.split(",").map(a => a.trim()) : undefined;
      qds.push({ question: q.question, options: q.options, answer: q.answer, answers, explanation: q.explanation, tags: q.tags });
      ids.push(q.id);
    }
    setQuestions(qds);
    setQuestionIds(ids);
    setPhase("answering");
  }, [quizConfig, materialId]);

  const triggerGeneration = useCallback(async (excludeCovered: boolean, autoChain = false) => {
    // Check API key before generating
    const ks = await getKeyStatus().catch(() => ({ configured: true } as const));
    if (!ks.configured) {
      window.dispatchEvent(new Event("open-settings"));
      return;
    }
    if (userStoppedRef.current || isMaterialStopped(materialId)) return;
    if (generatingRef.current) return; // prevent overlapping chains
    generatingRef.current = true;
    setGenError("");
    if (!autoChain) setGenPending(true);
    try {
      await generateQuestions(materialId, excludeCovered, {
        mode: genConfig.mode,
        difficulty: genConfig.difficulty,
        questionType: genConfig.questionType,
        tag: genConfig.tag,
      });
      pollWithBackoff(async () => {
        const status = await getGenerateStatus(materialId).catch(() => null);
        if (!status) return "retry";
        if (status.status === "ready") {
          setGenError("");
          const freshStats = await getMaterialStats(materialId).catch(() => null);
          if (freshStats) setStats(freshStats);
          if (!userStoppedRef.current && autoContinueRef.current &&
              freshStats && freshStats.covered_chunks < freshStats.total_chunks &&
              freshStats.total_questions < 15) {
            generatingRef.current = false;
            triggerGeneration(true, true);
            return "stop";
          }
          setGenPending(false);
          generatingRef.current = false;
          window.dispatchEvent(new Event("forge-activity"));
          return "stop";
        }
        if (status.status === "error") {
          setGenError(status.message || "出题失败，请重试");
          setGenPending(false);
          generatingRef.current = false;
          getMaterialStats(materialId).then(setStats);
          return "stop";
        }
        if (status.status === "idle") {
          if (status.question_count === 0) setGenError("出题失败，请重试");
          setGenPending(false);
          generatingRef.current = false;
          getMaterialStats(materialId).then(setStats);
          return "stop";
        }
        return "continue";
      });
    } catch {
      setGenPending(false);
      generatingRef.current = false;
      setGenError("请求失败，请重试");
    }
  }, [materialId, genConfig]);

  const supplementQuestions = useCallback(() => {
    userStoppedRef.current = false;
    clearMaterialStopped(materialId);
    triggerGeneration(true);
  }, [triggerGeneration, materialId]);

  const handleStopGeneration = () => {
    userStoppedRef.current = true;
    setMaterialStopped(materialId);
    setGenPending(false);
  };

  // Sync autoContinue state to ref (for use in triggerGeneration closure)
  useEffect(() => { autoContinueRef.current = autoContinue; }, [autoContinue]);

  // 生成阶段计时
  useEffect(() => {
    if (!genPending) { setGenElapsed(0); return; }
    genStartRef.current = Date.now();
    setGenElapsed(0);
    const t = setInterval(() => setGenElapsed(Math.floor((Date.now() - genStartRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [genPending]);

  // 测验回顾：批量提交答案（避免在 render 中产生副作用）
  useEffect(() => {
    if (phase !== "quizReview") { quizReviewSubmitted.current = false; return; }
    if (quizReviewSubmitted.current) return;
    quizReviewSubmitted.current = true;
    sessionRef.current.results.forEach((r) => {
      const qid = questionIds[r.qIdx];
      if (qid) {
        submitAnswer(qid, r.userAnswer).catch(() => {});
        if (!r.isCorrect) enrollQuestion(qid).catch(() => {});
      }
    });
  }, [phase, questionIds]);

  // 加载材料统计
  useEffect(() => {
    setPhase("idle");
    getMaterialStats(materialId).then(s => {
      setStats(s);
      if (s) {
        const maxCount = Math.max(1, s.total_questions);
        setQuizConfig(qc => qc.count > maxCount ? { ...qc, count: maxCount } : qc);
        setCountInput(prev => {
          const v = parseInt(prev) || 5;
          return String(Math.max(1, Math.min(maxCount, v)));
        });
        // v4.0: 题目数为 0 时自动触发异步出题
        if (s.total_questions === 0) {
          getGenerateStatus(materialId).then(st => {
            if (st.status === "generating") {
              setGenPending(true);
              pollWithBackoff(async () => {
                const status = await getGenerateStatus(materialId).catch(() => null);
                if (!status) return "retry";
                if (status.status === "ready") {
                  const freshStats = await getMaterialStats(materialId).catch(() => null);
                  if (freshStats) setStats(freshStats);
                  if (autoContinueRef.current && freshStats &&
                      freshStats.covered_chunks < freshStats.total_chunks &&
                      freshStats.total_questions < 15 &&
                      !userStoppedRef.current &&
                      !isMaterialStopped(materialId)) {
                    triggerGeneration(true, true);
                  } else {
                    setGenPending(false);
                  }
                  window.dispatchEvent(new Event("forge-activity"));
                  return "stop";
                }
                if (status.status === "error" || status.status === "idle") {
                  setGenPending(false);
                  if (status.status === "idle" && !isMaterialStopped(materialId)) triggerGeneration(false);
                  return "stop";
                }
                return "continue";
              });
              return;
            }
            if (st.status === "idle") {
              triggerGeneration(false);
            }
          }).catch(() => {});
        }

        // v4.2: 已有题目但未达上限时，自动续批
        if (s.total_questions > 0 && s.total_questions < 15 &&
            s.covered_chunks < s.total_chunks &&
            autoContinueRef.current && !genPending &&
            !userStoppedRef.current && !isMaterialStopped(materialId)) {
          triggerGeneration(true);
        }
      }
    }).catch(() => {
      setStats(null);
      // Material no longer exists or failed to load — clear its stop state
      clearMaterialStopped(materialId);
    });
    return () => { mountedRef.current = false; controllerRef.current?.abort(); };
  }, [materialId]);

  // v4.2: 进入已攻克/稳定卡片独立视图时自动加载全部题目
  useEffect(() => {
    if ((phase === "masteredList" || phase === "stableCardList") && allQuestions.length === 0) {
      listQuestions(materialId).then(setAllQuestions).catch(() => {});
    }
  }, [phase, materialId]);

  // 回到空闲态时通知全局刷新
  useEffect(() => {
    if (phase === "idle") {
      window.dispatchEvent(new Event("forge-activity"));
    }
  }, [phase]);

  // ---- 答题 ----
  const currentQ = questions[currentIndex];
  const currentQId = questionIds[currentIndex];

  function getCorrect(q: QuestionData) { return q.answer || (q.answers || []).join(", "); }
  function checkAnswer(q: QuestionData, ua: string) {
    // 多选：比较排序后的选项字母
    if (q.answers && q.answers.length > 1) {
      const selected = ua.split(",").map(s => s.trim().charAt(0).toUpperCase()).filter(Boolean).sort().join(",");
      const correct = [...q.answers].map(a => a.trim().charAt(0).toUpperCase()).sort().join(",");
      return selected === correct;
    }
    if (!q.answer) return false;
    const ans = q.answer.trim().toUpperCase();
    const userLetter = ua.trim().charAt(0).toUpperCase();
    return ans === userLetter || ans.startsWith(userLetter);
  }

  async function handleAnswer(option: string) {
    if (phase !== "answering" || !currentQ) return;
    const letter = option.charAt(0).toUpperCase();

    // 多选
    if (currentQ.answers && currentQ.answers.length > 1) {
      setSelectedAnswer(option);
      const cur = batchAnswers[currentIndex] || "";
      const sel = cur ? cur.split(",").map(s => s.trim()) : [];
      const idx = sel.indexOf(letter);
      if (idx >= 0) sel.splice(idx, 1); else sel.push(letter);
      setBatchAnswers(prev => ({ ...prev, [currentIndex]: sel.sort().join(", ") }));
      return;
    }

    // 单选：点击切换选择，不立即提交
    setSelectedAnswer(option);
  }

  // 单选确认：提交答案
  function handleSingleConfirm() {
    if (!currentQ || !selectedAnswer) return;
    const letter = selectedAnswer.charAt(0).toUpperCase();
    const isCorrect = checkAnswer(currentQ, letter);
    sessionRef.current.total += 1;
    if (isCorrect) sessionRef.current.correct += 1;
    // Store the LETTER for batch submit, not the full option text
    sessionRef.current.results.push({ qIdx: currentIndex, userAnswer: letter, isCorrect });

    if (quizConfig.feedbackMode === "batch") {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(i => i + 1);
        setSelectedAnswer(null);
      } else {
        setPhase("quizReview");
      }
      return;
    }

    // 即时批改：立即提交
    if (currentQId) {
      roundAnsweredIds.current.add(currentQId);
      submitAnswer(currentQId, letter).catch(() => {});
      if (!isCorrect) enrollQuestion(currentQId).catch(() => {});
    }

    setFeedback({ is_correct: isCorrect, correct_answer: getCorrect(currentQ), explanation: currentQ.explanation });
    setPhase("feedback");
  }

  // 多选确认按钮：判题 + 提交 + 入复习
  async function handleMultiConfirm() {
    if (!currentQ) return;
    const ans = batchAnswers[currentIndex];
    if (!ans) return;

    const isCorrect = checkAnswer(currentQ, ans);
    sessionRef.current.total += 1;
    if (isCorrect) sessionRef.current.correct += 1;
    sessionRef.current.results.push({ qIdx: currentIndex, userAnswer: ans, isCorrect });

    if (quizConfig.feedbackMode === "instant") {
      if (currentQId) {
        roundAnsweredIds.current.add(currentQId);
        submitAnswer(currentQId, ans).catch(() => {});
        if (!isCorrect) enrollQuestion(currentQId).catch(() => {});
      }
      setSelectedAnswer(ans);
      setFeedback({ is_correct: isCorrect, correct_answer: getCorrect(currentQ), explanation: currentQ.explanation });
      setPhase("feedback");
    } else {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(i => i + 1);
        setSelectedAnswer(null);
      } else {
        setPhase("quizReview");
      }
    }
  }

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
      setSelectedAnswer(null);
      setFeedback(null);
      setPhase("answering");
    } else {
      setPhase("result");
    }
  }

  // ---- 渲染 ----

  const btnBase = "py-2 rounded-lg border text-xs transition-all";
  const btnSel = "border-brand bg-brand-soft text-brand font-medium hover:bg-brand-hover";
  const btnDef = "border-border-soft bg-surface-panel text-text-secondary hover:border-border-strong hover:bg-surface-raised";

  // 生成中
  if (phase === "generating") {
    return (
      <div>
        <GeneratingAnimation />
        <div className="text-center text-text-dim text-xs mt-2">
          已等待 {genElapsed} 秒{genElapsed > 30 ? "，AI 响应较慢请耐心等待" : ""}
        </div>
        <button onClick={() => { controllerRef.current?.abort(); setPhase("idle"); }} className="w-full text-text-muted text-xs hover:text-text-secondary transition-colors mt-2">
          取消
        </button>
      </div>
    );
  }

  // 答题
  if (phase === "answering" && currentQ) {
    const isMulti = currentQ.answers && currentQ.answers.length > 1;
    const curBatch = batchAnswers[currentIndex] || "";
    const selLetters = curBatch ? curBatch.split(",").map(s => s.trim()) : [];
    const singleSelLetter = !isMulti && selectedAnswer ? selectedAnswer.charAt(0).toUpperCase() : null;

    return (
      <div className="space-y-4">
        <div className="flex justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowExitConfirm(true)} className="text-text-dim hover:text-red-400 transition-colors">退出</button>
            <span>
              {currentIndex + 1} / {questions.length}
              {quizConfig.feedbackMode === "batch" && <span className="ml-2 text-text-dim">（已答 {Object.keys(batchAnswers).length} 题）</span>}
            </span>
          </div>
          {isMulti && <span className="text-brand">多选</span>}
        </div>
        <p className="text-sm leading-relaxed">{currentQ.question}</p>
        <div className="space-y-1.5">
          {currentQ.options.map((opt, i) => {
            const letter = opt.charAt(0).toUpperCase();
            const sel = isMulti ? selLetters.includes(letter) : singleSelLetter === letter;
            return (
              <button key={i} onClick={() => handleAnswer(opt)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  sel ? "border-brand bg-brand/10 ring-1 ring-brand/30" : "border-border-soft hover:border-brand/50 hover:bg-brand/5"
                }`}>
                {isMulti && <span className={`inline-block w-3.5 h-3.5 rounded border mr-1.5 text-[10px] text-center leading-3 ${sel ? "bg-brand border-brand text-black" : "border-border-strong"}`}>{sel ? "✓" : ""}</span>}
                {opt}
              </button>
            );
          })}
        </div>
        {(isMulti || selectedAnswer) && (
          <button onClick={isMulti ? handleMultiConfirm : handleSingleConfirm} disabled={isMulti && !batchAnswers[currentIndex]}
          className="w-full bg-brand text-black text-xs font-medium py-2 rounded-lg hover:opacity-90 disabled:opacity-30 transition-opacity">
            确认选择（Enter）
          </button>
        )}

        {/* 退出确认弹窗 */}
        {showExitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowExitConfirm(false)}>
            <div className="bg-background border border-border-default rounded-xl w-full max-w-sm mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold">确认退出</h3>
              <p className="text-text-secondary text-sm">
                已完成 {Object.keys(batchAnswers).length > 0 ? Object.keys(batchAnswers).length : currentIndex} / {questions.length} 题，已答题目已保存。确认退出锻造？
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowExitConfirm(false)} className="flex-1 py-2 border border-border-soft rounded-lg text-text-secondary text-sm hover:bg-surface-raised transition-colors">继续答题</button>
                <button onClick={() => { setShowExitConfirm(false); setPhase("idle"); controllerRef.current?.abort(); }} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">确认退出</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 反馈
  if (phase === "feedback" && feedback && currentQ) {
    const correctLetters = feedback.correct_answer.split(",").map(a => a.trim().toUpperCase());
    const userOption = selectedAnswer || "";
    const userLetters = userOption.includes(",")
      ? userOption.split(",").map(s => s.trim().charAt(0).toUpperCase())
      : [userOption.charAt(0).toUpperCase()];

    return (
      <div className="space-y-4">
        {/* 反馈横幅 */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          feedback.is_correct
            ? "border-green-500/30 bg-green-500/10"
            : "border-red-500/30 bg-red-500/10"
        }`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold ${
            feedback.is_correct ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          }`}>
            {feedback.is_correct ? "✓" : "✗"}
          </div>
          <div>
            <div className={`text-sm font-semibold ${feedback.is_correct ? "text-green-400" : "text-red-400"}`}>
              {feedback.is_correct ? "回答正确" : "回答错误"}
            </div>
            <div className="text-text-muted text-xs mt-0.5">
              {feedback.is_correct ? "继续加油" : "已自动加入错题复习"}
            </div>
          </div>
        </div>

        {/* 题目回顾 */}
        <div className="space-y-3">
          <div className="text-text-secondary text-sm font-medium">题目回顾</div>
          <p className="text-sm leading-relaxed">{currentQ.question}</p>

          {/* 选项 */}
          <div className="space-y-1.5">
            {currentQ.options.map((opt, i) => {
              const optLetter = opt.charAt(0).toUpperCase();
              const isCorrect = correctLetters.includes(optLetter);
              const isUser = userLetters.includes(optLetter);
              return (
                <div key={i} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${
                  isCorrect ? "border-green-500/40 bg-green-500/5" :
                  isUser && !feedback.is_correct ? "border-red-500/40 bg-red-500/5" :
                  "border-border-soft"
                }`}>
                  <span className={isCorrect ? "text-green-300" : isUser && !feedback.is_correct ? "text-red-300" : "text-text-secondary"}>
                    {opt}
                  </span>
                  <span className="text-xs shrink-0 ml-2">
                    {isUser && isCorrect && <span className="text-green-400">你的选择 ✓</span>}
                    {isUser && !isCorrect && <span className="text-red-400">你的选择 ✗</span>}
                    {!isUser && isCorrect && <span className="text-green-400">正确答案</span>}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 解析 */}
          {feedback.explanation && (
            <div className="p-3 rounded-lg bg-surface-panel-strong border-l-2 border-brand">
              <div className="text-text-secondary text-xs font-medium mb-1">解析</div>
              <div className="text-text-secondary text-sm leading-relaxed">{feedback.explanation}</div>
            </div>
          )}
        </div>

        <button onClick={handleNext} className="w-full py-2.5 bg-brand text-black rounded-lg hover:opacity-90 text-sm font-medium transition-all">
          {currentIndex < questions.length - 1 ? "下一题" : "查看本轮结果"}
        </button>
      </div>
    );
  }

  // 结果（即时反馈模式）
  if (phase === "result") {
    const { total, correct } = sessionRef.current;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;
    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{correct} / {total}</div>
          <div className="text-text-muted text-xs">正确率 {pct}%</div>
        </div>
        <div className="space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto">
          {sessionRef.current.results.map((r, i) => {
            const q = questions[r.qIdx];
            if (!q) return null;
            const correctAns = getCorrect(q);
            const userLetters = r.userAnswer.includes(",")
              ? r.userAnswer.split(",").map((a: string) => a.trim().charAt(0).toUpperCase())
              : [r.userAnswer.charAt(0).toUpperCase()];
            return (
              <div key={i} className={`p-2.5 rounded-lg border text-xs ${r.isCorrect ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                <div className="flex items-start gap-2">
                  <span className={r.isCorrect ? "text-green-400" : "text-red-400"}>{r.isCorrect ? "✓" : "✗"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary">{i + 1}. {q.question}</p>
                    <div className="space-y-0.5 mt-1">
                      {q.options.map((opt, oi) => {
                        const optLetter = opt.charAt(0).toUpperCase();
                        const correctLetters = correctAns.split(",").map((a: string) => a.trim().toUpperCase());
                        const isCorrectOpt = correctLetters.includes(optLetter);
                        const isUserOpt = userLetters.includes(optLetter);
                        return (
                          <div key={oi} className={`px-2 py-0.5 rounded text-[10px] ${
                            isCorrectOpt ? "bg-green-500/10 text-green-300" :
                            isUserOpt && !r.isCorrect ? "bg-red-500/10 text-red-300" :
                            "text-text-dim"
                          }`}>
                            {opt}
                            {isCorrectOpt && <span className="text-green-400 ml-1">← 正确答案</span>}
                            {isUserOpt && !r.isCorrect && <span className="text-red-400 ml-1">← 你的选择</span>}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && <p className="text-text-dim text-xs mt-1.5 leading-relaxed">{q.explanation}</p>}
                    {!r.isCorrect && <p className="text-text-muted text-xs mt-1">→ 已加入复习</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setPhase("idle"); getMaterialStats(materialId).then(setStats).catch(() => {}); }}
            className="flex-1 py-2 bg-brand text-black rounded-lg text-xs font-medium hover:opacity-90 transition-opacity">再来一轮</button>
          <button onClick={() => { setPhase("idle"); getMaterialStats(materialId).then(setStats).catch(() => {}); }}
            className="flex-1 py-2 border border-border-soft rounded-lg text-text-secondary text-xs hover:bg-surface-raised transition-colors">返回</button>
        </div>
      </div>
    );
  }

  // 测验回顾（batch feedback 模式）
  if (phase === "quizReview") {
    const { total, correct } = sessionRef.current;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;

    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{correct} / {total}</div>
          <div className="text-text-muted text-xs">正确率 {pct}%</div>
        </div>
        <div className="space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto">
          {sessionRef.current.results.map((r, i) => {
            const q = questions[r.qIdx];
            if (!q) return null;
            const correctAns = getCorrect(q);
            const userLetters = r.userAnswer.includes(",")
              ? r.userAnswer.split(",").map((a: string) => a.trim().charAt(0).toUpperCase())
              : [r.userAnswer.charAt(0).toUpperCase()];
            return (
              <div key={i} className={`p-2.5 rounded-lg border text-xs ${r.isCorrect ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                <div className="flex items-start gap-2">
                  <span className={r.isCorrect ? "text-green-400" : "text-red-400"}>{r.isCorrect ? "✓" : "✗"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary">{i + 1}. {q.question}</p>
                    <div className="space-y-0.5 mt-1">
                      {q.options.map((opt, oi) => {
                        const optLetter = opt.charAt(0).toUpperCase();
                        const correctLetters = correctAns.split(",").map((a: string) => a.trim().toUpperCase());
                        const isCorrectOpt = correctLetters.includes(optLetter);
                        const isUserOpt = userLetters.includes(optLetter);
                        return (
                          <div key={oi} className={`px-2 py-0.5 rounded text-[10px] ${
                            isCorrectOpt ? "bg-green-500/10 text-green-300" :
                            isUserOpt && !r.isCorrect ? "bg-red-500/10 text-red-300" :
                            "text-text-dim"
                          }`}>
                            {opt}
                            {isCorrectOpt && <span className="text-green-400 ml-1">← 正确答案</span>}
                            {isUserOpt && !r.isCorrect && <span className="text-red-400 ml-1">← 你的选择</span>}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && <p className="text-text-dim text-xs mt-1.5 leading-relaxed">{q.explanation}</p>}
                    {!r.isCorrect && <p className="text-text-muted text-xs mt-1">→ 已加入复习</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setPhase("idle"); getMaterialStats(materialId).then(setStats).catch(() => {}); }}
            className="flex-1 py-2 bg-brand text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">再来一轮</button>
          <button onClick={() => { setPhase("idle"); getMaterialStats(materialId).then(setStats).catch(() => {}); }}
            className="flex-1 py-2 border border-border-soft rounded-lg text-text-secondary text-sm hover:bg-surface-raised transition-colors">返回</button>
        </div>
      </div>
    );
  }

  // 复习
  // 错误
  if (phase === "error") {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-red-400 text-sm">{errorMsg}</p>
        <button onClick={() => setPhase("idle")} className="px-4 py-2 bg-brand text-black rounded-lg text-sm">返回</button>
      </div>
    );
  }

  // v4.0: 错题重做
  if (phase === "wrongReview") {
    return (
      <ReviewPanel
        materialId={materialId}
        initialMode="wrong"
        onClose={() => { setPhase("idle"); getMaterialStats(materialId).then(setStats).catch(() => {}); }}
      />
    );
  }

  // v4.0: 间隔复习
  if (phase === "sm2Review") {
    return (
      <ReviewPanel
        materialId={materialId}
        initialMode="sm2"
        onClose={() => { setPhase("idle"); getMaterialStats(materialId).then(setStats).catch(() => {}); }}
      />
    );
  }

  // v4.2: 已攻克列表独立视图
  if (phase === "masteredList") {
    const masteredQs = allQuestions.filter(q => q.mastered);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => { setPhase("idle"); getMaterialStats(materialId).then(setStats).catch(() => {}); }}
            className="text-text-muted text-xs hover:text-text-secondary transition-colors">← 返回</button>
          <span className="text-sm font-medium">已攻克题目</span>
          <button onClick={async () => {
            const qs = await listQuestions(materialId).catch(() => []);
            setAllQuestions(qs);
          }} className="text-text-dim text-[10px] hover:text-text-secondary transition-colors">刷新</button>
        </div>
        {masteredQs.length > 0 ? (
          <>
            {masteredQs.map(q => (
              <details key={q.id} className="p-3 rounded-lg bg-surface-raised border border-border-soft cursor-pointer group">
                <summary className="text-sm flex items-start gap-2 list-none">
                  <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                  <span className="text-text-primary flex-1">{q.question}</span>
                </summary>
                <div className="mt-3 pt-3 border-t border-border-subtle space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const optLetter = opt.charAt(0).toUpperCase();
                    const correctLetters = (q.answer || "").split(",").map((a: string) => a.trim().toUpperCase());
                    const isCorrect = correctLetters.includes(optLetter);
                    return (
                      <div key={oi} className={`px-2 py-1 rounded text-xs ${isCorrect ? "bg-green-500/10 text-green-300" : "text-text-dim"}`}>
                        {opt}{isCorrect && <span className="text-green-400 ml-1">← 答案</span>}
                      </div>
                    );
                  })}
                  {q.explanation && <p className="text-text-dim text-[10px] mt-2 leading-relaxed">{q.explanation}</p>}
                </div>
              </details>
            ))}
            <p className="text-text-dim text-xs text-center">共 {masteredQs.length} 题已攻克</p>
          </>
        ) : (
          <div className="text-text-muted text-sm py-8 text-center">暂无已攻克题目</div>
        )}
        <button onClick={() => { setPhase("idle"); }}
          className="w-full py-2 bg-brand text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          返回锻造台
        </button>
      </div>
    );
  }

  // v4.2: 稳定卡片独立视图
  if (phase === "stableCardList") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => { setPhase("idle"); getMaterialStats(materialId).then(setStats).catch(() => {}); }}
            className="text-text-muted text-xs hover:text-text-secondary transition-colors">← 返回</button>
          <span className="text-sm font-medium">已掌握</span>
          <span className="invisible w-8"></span>
        </div>
        <StableCardList materialId={materialId} />
        <p className="text-text-dim text-xs text-center">共 {stats?.stable_cards ?? 0} 张已掌握卡片</p>
        <button onClick={() => { setPhase("idle"); }}
          className="w-full py-2 bg-brand text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          返回锻造台
        </button>
      </div>
    );
  }

  // 空闲态（默认）
  if (!stats) {
    return <div className="flex items-center justify-center h-64 text-text-muted text-sm">加载中...</div>;
  }

  const dueCount = stats.due_reviews;

  return (
    <div className="space-y-6">
      {/* 统计区 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-text-primary text-sm truncate">{stats.title}</span>
            <button onClick={async () => {
              if (!showContent && !materialContent) {
                const data = await getMaterialContent(materialId).catch(() => null);
                if (data) setMaterialContent(data.content);
              }
              setShowContent(!showContent);
            }} className="text-text-muted hover:text-text-secondary text-xs transition-colors shrink-0">
              {showContent ? "收起" : "原文"}
            </button>
          </div>
          <div className="text-right shrink-0 ml-2">
            <div className="text-text-secondary text-sm">
              做对 {stats.questions_correct} 题
              {stats.recent_trend === "up" && <span className="text-green-400 text-xs ml-1">↑</span>}
              {stats.recent_trend === "down" && <span className="text-gray-400 text-xs ml-1">↓</span>}
            </div>
          </div>
        </div>

        {/* 学习进度 */}
        {(() => {
          const progressPct = stats.total_questions > 0 ? Math.round(stats.questions_attempted / stats.total_questions * 100) : 0;
          const barColor = progressPct >= 65 ? "bg-green-500" : progressPct >= 25 ? "bg-yellow-500" : "bg-gray-500";
          return (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-text-muted text-xs">学习进度</span>
                <span className="text-text-secondary text-xs font-medium">{stats.questions_attempted}/{stats.total_questions} 题</span>
              </div>
              <div className="h-2 bg-surface-panel rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${progressPct || 2}%` }} />
              </div>
            </>
          );
        })()}

        <div className="flex items-center gap-4 mt-2 text-xs">
          {dueCount > 0 && <span className="text-blue-400">待巩固 {dueCount} 题</span>}
          {stats.wrong_questions > 0 && <span className="text-orange-400">错题重做 {stats.wrong_questions} 题</span>}
          {stats.mastered_questions > 0 && (
            <span className="text-green-400">已攻克 {stats.mastered_questions} 题</span>
          )}
        </div>

        {showContent && materialContent && (
          <div className="mt-2 p-3 rounded-lg bg-surface-panel border border-border-subtle text-xs text-text-secondary leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
            {materialContent.slice(0, 1000)}
            {materialContent.length > 1000 && <span className="text-text-dim">...（共 {materialContent.length} 字）</span>}
          </div>
        )}
        {stats.total_chunks > 0 && (
          <div className="text-xs text-text-dim mt-1">
            已覆盖 {stats.covered_chunks}/{stats.total_chunks} 段内容
            {stats.covered_chunks >= stats.total_chunks && (
              <span className="text-yellow-400 ml-1">· 已无新题可出</span>
            )}
          </div>
        )}
        {stats.total_chunks === 0 && stats.covered_chunks > 0 && (
          <div className="text-xs text-text-dim mt-1">已覆盖 {stats.covered_chunks} 段内容</div>
        )}
      </div>

      {/* v4.2: 材料无题目空态 */}
      {stats.total_questions === 0 && !genPending && (
        <div className="text-center py-8 border-t border-border-subtle mt-3 space-y-3">
          <p className="text-text-muted text-sm">还没有题目</p>
          <p className="text-text-muted text-xs">上传材料后将自动生成题目，或等待出题完成</p>
        </div>
      )}

      {/* 配置区：左右双栏 */}
      {stats.total_questions > 0 && (
        <div className="border-t border-border-subtle pt-3 mt-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {/* 左栏：答题配置 + 开始答题 + 复习入口 */}
            <div className="space-y-3">
              <div className="text-text-secondary text-xs font-medium">答题配置</div>

              {Object.keys(stats.tag_distribution).length > 0 && (
                <div>
                  <div className="text-text-muted text-[10px] mb-1">知识标签</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(stats.tag_distribution).slice(0, 8).map(([tag, count]) => (
                      <button
                        key={tag}
                        onClick={() => {
                          setQuizConfig(qc => {
                            const prev = qc.filterTags;
                            return { ...qc, filterTags: prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag] };
                          });
                        }}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${quizConfig.filterTags.includes(tag) ? "bg-brand text-black" : "bg-brand-soft text-brand hover:bg-brand-hover"}`}
                      >
                        {tag}:{count}
                      </button>
                    ))}
                    {quizConfig.filterTags.length > 0 && (
                      <button onClick={() => setQuizConfig(qc => ({ ...qc, filterTags: [] }))} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-panel text-text-muted hover:text-text-secondary transition-colors">
                        清除
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="text-text-muted text-[10px] mb-1">数量</div>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, stats.total_questions)}
                  value={countInput}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setCountInput(e.target.value)}
                  onBlur={() => {
                    const v = parseInt(countInput) || 1;
                    const max = Math.max(1, stats.total_questions);
                    const clamped = Math.max(1, Math.min(max, v));
                    setCountInput(String(clamped));
                    setQuizConfig(c => ({ ...c, count: clamped }));
                  }}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-full bg-surface-panel border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <div className="text-text-muted text-[10px] mb-1">批改方式</div>
                <div className="grid grid-cols-2 gap-1">
                  {(["instant", "batch"] as const).map(v => (
                    <button key={v} onClick={() => setQuizConfig(c => ({ ...c, feedbackMode: v }))} className={`${btnBase} ${quizConfig.feedbackMode === v ? btnSel : btnDef}`}>
                      {{ instant: "逐题", batch: "统一" }[v]}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={startQuiz} disabled={stats.total_questions === 0}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-30 ${
                  stats.total_questions > 0
                    ? "bg-brand text-black shadow-[0_0_16px_rgba(0,229,153,0.15)] hover:shadow-[0_0_24px_rgba(0,229,153,0.25)] hover:opacity-95"
                    : "bg-brand/30 text-black/40"
                }`}>
                开始答题
              </button>

              {/* 复习入口 */}
              {stats.wrong_questions > 0 ? (
                <button onClick={() => setPhase("wrongReview")}
                  className="w-full py-2 rounded-lg text-sm border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-colors text-left px-3">
                  错题重做 · {stats.wrong_questions}题
                </button>
              ) : stats.mastered_questions > 0 ? (
                <div className="text-orange-400 text-xs px-3 py-1.5 rounded-lg border border-orange-500/10 bg-orange-500/5">
                  全部错题已攻克
                  <button onClick={() => setPhase("masteredList")} className="ml-1 underline hover:text-orange-300 transition-colors">查看</button>
                </div>
              ) : null}
              {stats.due_reviews > 0 ? (
                <button onClick={() => setPhase("sm2Review")}
                  className="w-full py-2 rounded-lg text-sm border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors text-left px-3">
                  记忆巩固 · {stats.due_reviews}题
                </button>
              ) : stats.stable_cards > 0 ? (
                <div className="text-blue-400 text-xs px-3 py-1.5 rounded-lg border border-blue-500/10 bg-blue-500/5">
                  暂无待巩固卡片
                  <button onClick={() => setPhase("stableCardList")} className="ml-1 underline hover:text-blue-300 transition-colors">查看</button>
                </div>
              ) : null}
            </div>

            {/* 右栏：出题配置 + 生成控制 */}
            <div className="space-y-3">
              <div className="text-text-secondary text-xs font-medium">出题配置</div>

              <div>
                <div className="text-text-muted text-[10px] mb-1">提取方式</div>
                <div className="grid grid-cols-2 gap-1">
                  {(["extract", "expand"] as const).map(v => (
                    <button key={v} onClick={() => setGenConfig(c => ({ ...c, mode: v }))} className={`${btnBase} ${genConfig.mode === v ? btnSel : btnDef}`}>
                      {{ extract: "原文", expand: "拓展" }[v]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-text-muted text-[10px] mb-1">难度</div>
                <div className="grid grid-cols-3 gap-1">
                  {(["easy", "medium", "hard"] as const).map(v => (
                    <button key={v} onClick={() => setGenConfig(c => ({ ...c, difficulty: v }))} className={`${btnBase} ${genConfig.difficulty === v ? btnSel : btnDef}`}>
                      {{ easy: "简", medium: "中", hard: "难" }[v]}
                    </button>
                  ))}
                </div>
              </div>

              {Object.keys(stats.tag_distribution).length > 0 && (
                <div>
                  <div className="text-text-muted text-[10px] mb-1">定向知识点</div>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setGenConfig(c => ({ ...c, tag: undefined }))} className={`${btnBase} px-2 ${!genConfig.tag ? btnSel : btnDef}`}>不限</button>
                    {Object.keys(stats.tag_distribution).slice(0, 6).map(t => (
                      <button key={t} onClick={() => setGenConfig(c => ({ ...c, tag: t }))} className={`${btnBase} px-2 ${genConfig.tag === t ? btnSel : btnDef}`}>{t}</button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-text-muted text-[10px] mb-1">题型</div>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { v: "single", l: "单选" },
                    { v: "multi", l: "多选" },
                    { v: "single,multi", l: "混合" },
                  ] as const).map(({ v, l }) => (
                    <button key={v} onClick={() => setGenConfig(c => ({ ...c, questionType: v }))} className={`${btnBase} ${genConfig.questionType === v ? btnSel : btnDef}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">自动续批（上限15题）</span>
                <button onClick={() => setAutoContinue(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${autoContinue ? "bg-brand" : "bg-surface-raised border border-border-soft"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoContinue ? "translate-x-4" : ""}`} />
                </button>
              </div>

              {genError && (
                <div className="text-red-400 text-xs bg-red-400/5 px-3 py-2 rounded-lg space-y-1">
                  <p>{genError}</p>
                  <button onClick={() => triggerGeneration(false)} disabled={genPending}
                    className="text-red-400 underline hover:text-red-300 transition-colors">重试</button>
                </div>
              )}

              {stats.total_chunks > 0 && stats.total_chunks < 3 && (
                <div className="text-yellow-400 text-[10px] bg-yellow-400/5 px-2 py-1.5 rounded-lg">
                  仅 {stats.total_chunks} 段，题目可能重复
                </div>
              )}

              {genPending ? (
                <button onClick={handleStopGeneration}
                  className="w-full py-2 rounded-lg text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                  停止出题
                </button>
              ) : (
                <button onClick={supplementQuestions}
                  disabled={stats.covered_chunks >= stats.total_chunks}
                  className="w-full py-2 rounded-lg text-sm border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-30">
                  {(() => {
                    if (stats.covered_chunks >= stats.total_chunks) return "已无新题可出";
                    const rate = stats.covered_chunks > 0 ? stats.total_questions / stats.covered_chunks : 3;
                    const remaining = Math.round(rate * (stats.total_chunks - stats.covered_chunks));
                    if (remaining <= 5) return `补充题目（最多 ${Math.min(remaining, 5)} 题）`;
                    return `补充题目（~${remaining} 题可出）`;
                  })()}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 已攻克 / 已掌握（跨栏） */}
      {(stats.mastered_questions > 0 || stats.stable_cards > 0) && stats.total_questions > 0 && (
        <div className="space-y-1">
          {stats.mastered_questions > 0 && (
            <details className="mt-1" onToggle={async (e) => {
              if ((e.target as HTMLDetailsElement).open && allQuestions.length === 0) {
                const qs = await listQuestions(materialId).catch(() => []);
                setAllQuestions(qs);
              }
            }}>
              <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
                已攻克 · {stats.mastered_questions}题
              </summary>
              <div className="mt-2">
                <MasteredList questions={allQuestions.filter(q => q.mastered)} />
              </div>
            </details>
          )}
          {stats.stable_cards > 0 && (
            <details className="mt-1" onToggle={async (e) => {
              if ((e.target as HTMLDetailsElement).open && allQuestions.length === 0) {
                const qs = await listQuestions(materialId).catch(() => []);
                setAllQuestions(qs);
              }
            }}>
              <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
                已掌握 · {stats.stable_cards}张
              </summary>
              <div className="mt-2">
                <StableCardList materialId={materialId} />
              </div>
            </details>
          )}
        </div>
      )}

      {/* 全部题目 */}
      {stats.total_questions > 0 && (
        <div>
          <button
            onClick={async () => {
              if (!showAllQuestions && allQuestions.length === 0) {
                const qs = await listQuestions(materialId).catch(() => []);
                setAllQuestions(qs);
              }
              setShowAllQuestions(!showAllQuestions);
            }}
            className="text-text-muted text-sm mb-2 hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            <span className="text-[10px] transition-transform inline-block" style={{ transform: showAllQuestions ? "rotate(90deg)" : "" }}>▶</span>
            全部题目（{stats.total_questions}题）
          </button>
          {showAllQuestions && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {quizConfig.filterTags.length > 0 && (
                <div className="text-text-dim text-[10px]">标签「{quizConfig.filterTags.join(" + ")}」({allQuestions.filter(q => quizConfig.filterTags.every(t => q.tags && q.tags.includes(t))).length}题)</div>
              )}
              {allQuestions
                .filter(q => quizConfig.filterTags.length === 0 || quizConfig.filterTags.every(t => q.tags && q.tags.includes(t)))
                .map((q, i) => {
                const isExpanded = expandedQIds.has(q.id);
                return (
                <div key={q.id} className="p-2 rounded-lg border border-border-subtle text-xs group">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => {
                      setExpandedQIds(prev => {
                        const next = new Set(prev);
                        isExpanded ? next.delete(q.id) : next.add(q.id);
                        return next;
                      });
                    }} className="text-left flex-1 min-w-0">
                      <p className="text-text-primary">{i + 1}. {q.question}</p>
                    </button>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingQuestion(q)}
                        className="text-text-muted hover:text-text-secondary text-[10px] px-1">编辑</button>
                      <button onClick={() => {
                        if (confirm("删除这道题目？")) {
                          deleteQuestion(q.id).then(() => {
                            setAllQuestions(prev => prev.filter(x => x.id !== q.id));
                            getMaterialStats(materialId).then(setStats).catch(() => {});
                            window.dispatchEvent(new Event("forge-activity"));
                          }).catch(() => {});
                        }
                      }}
                        className="text-text-dim hover:text-red-400 text-[10px] px-1">删除</button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-border-subtle space-y-0.5">
                      {q.options.map((opt, oi) => {
                        const optLetter = opt.charAt(0).toUpperCase();
                        const correctLetters = (q.answer || "").split(",").map((a: string) => a.trim().toUpperCase());
                        const isCorrect = correctLetters.includes(optLetter);
                        return (
                          <div key={oi} className={`px-2 py-0.5 rounded text-[10px] ${isCorrect ? "bg-green-500/10 text-green-300" : "text-text-dim"}`}>
                            {opt}
                            {isCorrect && <span className="text-green-400 ml-1">← 答案</span>}
                          </div>
                        );
                      })}
                      {q.explanation && <p className="text-text-dim text-[10px] mt-1 leading-relaxed">{q.explanation}</p>}
                    </div>
                  )}
                </div>
                );})}
                <button onClick={() => setShowAddQuestion(true)}
                  className="w-full py-2 rounded-lg text-xs border border-dashed border-border-soft text-text-muted hover:text-text-secondary hover:border-border-default transition-colors">
                  + 添加题目
                </button>
            </div>
          )}
        </div>
      )}

      {/* 最近记录 */}
      {stats.recent_sessions.length > 0 && (
        <div>
          <div className="text-text-dim text-xs mb-2">答题记录</div>
          <div className="space-y-1">
            {stats.recent_sessions.slice(0, 3).map((s, i) => (
              <div key={i}>
                <button
                  onClick={() => setExpandedSession(expandedSession === s.date ? null : s.date)}
                  className="w-full flex justify-between items-center text-xs text-text-muted hover:text-text-secondary transition-colors text-left group"
                >
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] transition-transform" style={{ display: "inline-block", transform: expandedSession === s.date ? "rotate(90deg)" : "" }}>▶</span>
                    {s.date}
                  </span>
                  <span>正确 {s.correct}/{s.total} <span className="text-text-dim ml-1 group-hover:opacity-100 opacity-0 transition-opacity">{s.items?.length || 0}题</span></span>
                </button>
                {expandedSession === s.date && s.items && s.items.length > 0 && (
                  <div className="mt-2 space-y-3 pl-3 ml-1">
                    {s.items.map((item, j) => (
                      <div key={j} className={`p-2 rounded-lg border text-xs ${item.is_correct ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                        <div className="flex items-start gap-1.5">
                          <span className={item.is_correct ? "text-green-400" : "text-red-400"}>{item.is_correct ? "✓" : "✗"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-text-primary mb-1.5">{item.question}</p>
                            <div className="space-y-0.5">
                              {item.options && item.options.map((opt: string, oi: number) => {
                                const optLetter = opt.charAt(0).toUpperCase();
                                const correctLetters = (item.correct_answer || "").split(",").map((a: string) => a.trim().toUpperCase());
                                const isCorrect = correctLetters.includes(optLetter);
                                const isUser = optLetter === item.user_answer?.toUpperCase();
                                return (
                                  <div key={oi} className={`px-2 py-1 rounded text-[10px] ${
                                    isCorrect ? "bg-green-500/10 text-green-300" :
                                    isUser && !item.is_correct ? "bg-red-500/10 text-red-300" :
                                    "text-text-dim"
                                  }`}>
                                    {opt}
                                    {isCorrect && <span className="text-green-400 ml-1">← 正确答案</span>}
                                    {isUser && !item.is_correct && <span className="text-red-400 ml-1">← 你的选择</span>}
                                  </div>
                                );
                              })}
                            </div>
                            {item.explanation && (
                              <p className="text-text-dim text-xs mt-1.5 leading-relaxed">{item.explanation}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {expandedSession === s.date && (!s.items || s.items.length === 0) && (
                  <div className="text-text-dim text-[10px] pl-4 py-1">暂无题目详情</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* v4.3: 题目编辑器弹窗 */}
      {(editingQuestion || showAddQuestion) && (
        <QuestionEditor
          question={editingQuestion || undefined}
          materialId={materialId}
          onDone={() => {
            setEditingQuestion(null);
            setShowAddQuestion(false);
            listQuestions(materialId).then(setAllQuestions).catch(() => {});
            getMaterialStats(materialId).then(setStats).catch(() => {});
            window.dispatchEvent(new Event("forge-activity"));
          }}
          onCancel={() => { setEditingQuestion(null); setShowAddQuestion(false); }}
        />
      )}

    </div>
  );
}
