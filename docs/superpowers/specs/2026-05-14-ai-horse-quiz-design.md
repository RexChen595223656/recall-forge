# 知锻(RecallForge) 增强版 — 产品设计 Spec

## 概述

复刻"知锻(RecallForge)"并增强。材料驱动型生成式学习工具，核心闭环：材料输入 → AI动态出题 → 流式反馈 → 错题沉淀 → 间隔重复复习。

**增强点 vs ：** RAG 持久化知识库、SM-2 间隔重复、多格式输入（PDF/URL/Markdown/文本）。

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                   Vercel                          │
│  ┌───────────────────────────────────────────┐  │
│  │         Next.js 14 (App Router)            │  │
│  │  TypeScript + Tailwind CSS                 │  │
│  │  Pages: Dashboard / Upload / Quiz / Review │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                        │ SSE / REST
┌─────────────────────────────────────────────────┐
│                   Railway                         │
│  ┌───────────────────────────────────────────┐  │
│  │         Python FastAPI                      │  │
│  │  /api/materials  /api/quiz  /api/review    │  │
│  │  ChromaDB  SQLite                          │  │
│  │  DeepSeek API (via Anthropic SDK compat)   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## 功能模块

### M1 — 材料管理 + RAG
- 多格式上传：PDF、URL、Markdown、纯文本
- 后端分块（500字/chunk，50字overlap）
- ChromaDB 向量化存储
- 知识库列表 + 删除管理

### M2 — AI 动态出题
- RAG 检索相关 chunk → DeepSeek 生成题目
- 题型：单选题（4选项）
- SSE 流式返回，逐 token 展示
- 多维标签自动生成（知识点、难度、类型）

### M3 — 答题 + 即时反馈
- 流式出题引擎，边生成边展示
- 四选一交互，判定后立即展示正误 + 解析
- 800ms 后自动切下一题
- 答题记录写入 SQLite

### M4 — 间隔重复复习
- SM-2 算法：4级评分 → 计算下次复习时间
- 复习中心：按到期时间排序推送
- 答对：间隔放大（1→3→7→21→...）
- 答错：间隔重置为1天
- 知识资产化：掌握度可视化

### M5 — 仪表盘
- 总题数、掌握率、今日待复习
- 知识标签分布图
- 学习热力图

## 数据模型

```
materials: id, title, content, format, created_at
chunks: id, material_id, content, embedding_id
quiz_sessions: id, material_id, created_at
questions: id, session_id, chunk_id, content, options(JSON), answer, explanation, tags(JSON)
attempts: id, question_id, user_answer, is_correct, created_at
review_cards: id, question_id, ease_factor, interval_days, repetitions, next_review, last_review
```

## API 设计

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/materials | 上传材料，触发分块+embedding |
| GET | /api/materials | 知识库列表 |
| DELETE | /api/materials/{id} | 删除材料及关联数据 |
| POST | /api/quiz/generate | 基于材料生成题目（SSE） |
| POST | /api/quiz/submit | 提交答案 |
| GET | /api/review/due | 获取到期待复习题目 |
| POST | /api/review/record | 记录复习结果（SM-2更新） |
| GET | /api/stats | 学习统计数据 |

## AI 交互状态

| 状态 | 展示 | 触发 |
|------|------|------|
| 思考中 | 骨架屏 + 脉冲动画 | AI 推理中 |
| 流式输出 | 逐 token 展示 | 题目生成 |
| 完成 | 完整题目 + 选项 | 生成结束 |
| 无结果 | "材料中未找到足够信息生成题目" + 建议 | chunk 不足 |
| 超时 | 已有内容 + 重试按钮 | >30s |
| 错误 | 错误提示 + 重试 | API异常 |

## 验收标准

- [ ] 材料上传后 30s 内完成分块+embedding
- [ ] 题目生成流式首token < 3s
- [ ] 答题判定即时（<200ms）
- [ ] SM-2 复习排期计算正确
- [ ] 多格式输入均正常工作
- [ ] 移动端响应式
- [ ] Vercel + Railway 双端部署成功
