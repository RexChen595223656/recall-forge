# 铭知 (RecallForge) — AI 驱动知识内化引擎

## 项目简介

AI 驱动的知识内化工具。把任何信息锻造为长期记忆，RAG 持久化知识库 + AI 批量出题 + SM-2 间隔重复 + 错题集。

**定位：** AI PM 学习项目，阶段二（可演示产出）。

**版本：** v4.3 — 上传简化，题目编辑器，API Key 加密，示例材料，设计优化

**技术栈：** Next.js 16 (Turbopack) + Tailwind v4 + Python 3.14 + ChromaDB + SQLite

## 项目结构

```
recall-forge/
├── frontend/src/
│   ├── app/
│   │   ├── layout.tsx              # 顶部栏 + 主内容区
│   │   ├── page.tsx                # 锻造台：知识库左栏 + 锻造区右栏
│   │   ├── upload/page.tsx         # 上传页（独立路由，保留）
│   │   ├── quiz/[id]/page.tsx      # 旧路由重定向 → /
│   │   └── review/page.tsx         # 旧路由重定向 → /
│   ├── components/
│   │   ├── TopBar.tsx              # 顶部栏：Logo + 全局统计 + 实时刷新
│   │   ├── KnowledgePanel.tsx      # 知识库面板：搜索/筛选/材料列表/上传入口
│   │   ├── ForgePanel.tsx          # 锻造区核心：空闲/出题/答题/反馈/结果/复习
│   │   ├── GlobalReview.tsx        # 全局复习：跨材料所有到期卡片
│   │   ├── UploadModal.tsx         # 上传弹窗：两步流程（输入→确认）
│   │   └── Sidebar.tsx             # 旧侧边栏（已废弃）
│   └── lib/api.ts                  # API 客户端
├── backend/
│   ├── main.py                     # FastAPI 入口
│   ├── config.py                   # 配置（API key 从环境变量读取）
│   ├── routers/                    # 7 个路由模块
│   │   ├── materials.py            # CRUD + 查看原文
│   │   ├── quiz.py                 # 出题/提交/保存
│   │   ├── review.py               # 复习卡片管理
│   │   └── stats.py                # 全局统计 + 材料维度统计
│   ├── services/                   # 业务逻辑
│   │   ├── quiz_gen.py             # Prompt 构建 + SSE 流式
│   │   ├── rag.py                  # 分块 + ChromaDB 操作
│   │   ├── sm2.py                  # SM-2 算法
│   │   └── parser.py               # URL/PDF/MD 解析
│   └── models/                     # SQLAlchemy + Pydantic
└── docs/
    ├── requirements/               # PRD + 功能拆解 + 交互原型 + AI系统设计
    │   ├── 2026-05-15-F-12-v4.0-题目库重构-需求分析.md  # v4.0 PRD
    │   ├── 2026-05-15-F-14-v4.0-功能拆解.md
    │   ├── 2026-05-15-F-15-v4.0-交互原型说明.md
    │   ├── 2026-05-15-F-16-v4.0-API合约定义.md
    │   ├── 2026-05-15-F-AI-02-v4.0-AI系统设计.md
    │   ├── 2026-05-15-F-13-v4.0-验收清单.md            # 110项验收清单
    │   ├── 2026-05-16-F-25-Config拆分设计方案.md        # v4.1 Config拆分
    │   └── ...（v3.x 历史文档）
    ├── research/                   # 竞品分析
    ├── superpowers/specs/           # v4.2-v4.3 设计文档
    │   ├── 2026-05-17-v4.2-打磨版本-设计文档.md
    │   └── 2026-05-17-v4.3-上传简化-题目编辑器-设计文档.md
    └── review/                     # 验收报告 + Bug修复记录 + 项目复盘
        ├── 2026-05-16-F-23-v4.0-验收报告.md
        ├── 2026-05-16-F-24-v4.0-Bug修复记录.md
        ├── 2026-05-17-v4.1-变更记录.md
        └── 2026-05-18-v4.3-变更记录.md
```

## 核心闭环（v3.1）

```
上传材料 → 弹窗两步确认 → 知识库列表(掌握度)
    ↓
点击材料 → 锻造区(统计+出题设置+错题集)
    ↓
[开始锻造] → 批量出题 → 答题(键盘1-4) → 反馈(题目+选项+解析)
    ↓                              ↓
[结果页] ← 最后一题            答错 → 自动加入复习队列
    ↓
[错题集] → 全部错题 → SM-2 排序(到期排前) → 评分 → 间隔更新
```

## 关键产品决策

- **SM-2 退为排序建议**：不阻挡用户访问错题，只在排序和提醒上施加影响
- **批量出题**：5 题一批，缓存到前端，0ms 切题
- **不流式展示**：避免 JSON 原文暴露答案，用动画替代
- **错题集**：替代"复习薄弱点"，全部错题随时可做
- **弹窗上传**：不跳路由，两步确认（输入→预览→上传）

## 常用命令

```bash
# 后端
cd backend && python3 -m uvicorn main:app --reload --port 8000

# 前端
cd frontend && npm run dev

# 安装
cd backend && pip install -r requirements.txt
cd frontend && npm install
```

## 遵循方法论

../personal-knowledge-base/AI产品经理工作方法论.md
