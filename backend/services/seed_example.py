"""Seed the example material and 20 questions on first startup.
The example material allows users to try answering without configuring API key.
Generation is blocked when no API key is set.
"""

from models.database import SessionLocal, Material, Question, Setting
from services.rag import chunk_text, embed_and_store

SEED_TITLE = "大语言模型（LLM）核心原理（示例）"
SEED_CONTENT = """# 大语言模型（LLM）核心原理

大语言模型是当前 AI 浪潮的核心技术。理解它的工作原理对任何技术从业者都很重要。

## Transformer 架构

2017 年 Google 提出 Transformer，用自注意力机制替代 RNN 的序列处理。核心创新是 Attention Is All You Need。

### 自注意力（Self-Attention）

每个 token 计算与所有其他 token 的关联权重。公式：Attention(Q,K,V) = softmax(QK^T/√dk)V。Q、K、V 分别来自输入的不同线性变换。

### 多头注意力（Multi-Head Attention）

并行运行多个注意力头，每个头关注不同的语义关系（语法、语义、位置等），最后拼接输出。这是模型能同时理解多个维度的关键。

### 位置编码（Positional Encoding）

Transformer 没有循环结构，需要显式注入位置信息。原始论文使用正弦/余弦函数的位置编码，现代模型多用 RoPE（旋转位置编码）。

## 训练流程

现代 LLM 的训练通常分为三个阶段：

### 预训练（Pre-training）

在海量文本上做下一个 token 预测。数据量通常达到数万亿 token。预训练后的模型（Base Model）知道语言规律和世界知识，但不会遵循指令。

### 监督微调（SFT）

使用高质量的指令-回答对进行微调，教会模型按人类期望的方式回答问题。数据质量比数量更重要。

### 人类反馈强化学习（RLHF）

让人类对模型的多个回答进行排序，训练一个奖励模型，再用 PPO 算法优化模型。使输出更符合人类偏好。

## Tokenization 分词

LLM 不直接处理文本，而是将文本切分为 token。常见的分词算法有 BPE（字节对编码）和 SentencePiece。一个 token 大约对应 0.75 个英文单词或 0.5 个汉字。

## 解码策略

生成文本时通过概率采样选择下一个 token：
- Temperature：控制随机性，越高越随机，越低越确定
- Top-p（Nucleus Sampling）：只从累计概率达到 p 的 token 中采样
- Top-k：只保留概率最高的 k 个 token

## 上下文窗口

模型一次能处理的最大 token 数称为上下文窗口。GPT-4 的初始版本是 8K，现在主流模型可达 128K 甚至 1M。长上下文通过优化注意力计算实现。

## 涌现能力

当模型参数规模超过某个阈值时，模型会突然展现出训练时未明确教授的能力，如推理、代码生成、翻译等。这是大语言模型最令人兴奋的特性之一。

## 幻觉（Hallucination）

LLM 会生成看似合理但事实错误的文本。原因是模型本质是概率预测下一个 token，缺乏真实世界验证机制。RAG（检索增强生成）可以部分缓解幻觉。

## 提示工程（Prompt Engineering）

通过精心设计输入提示来引导模型行为。技术包括：少样本学习（few-shot）、思维链（chain-of-thought）、角色扮演等。提示工程是使用 LLM 的核心技能。
"""

SEED_QUESTIONS = [
    {
        "question": "Transformer 架构的核心创新是什么？",
        "options": ["A. 循环神经网络结构", "B. 自注意力机制替代序列处理", "C. 更深的卷积层", "D. 强化学习优化"],
        "answer": "B",
        "explanation": "Transformer 的核心创新是用自注意力机制替代 RNN 的顺序处理方式，实现并行计算和长距离依赖建模。论文标题就是 Attention Is All You Need。",
        "tags": ["Transformer", "注意力机制"],
    },
    {
        "question": "自注意力机制的计算公式中，Q、K、V 分别代表什么？",
        "options": ["A. 查询、关键字、值", "B. 质量、键、变量", "C. 问题、知识、验证", "D. 队列、键、向量"],
        "answer": "A",
        "explanation": "Q（Query）、K（Key）、V（Value）是注意力机制的三个核心矩阵，都来自输入的不同线性变换。查询与键计算相似度，然后用相似度加权值。",
        "tags": ["注意力机制"],
    },
    {
        "question": "自注意力公式中为什么要除以 √dk？",
        "options": ["A. 增加数值稳定性", "B. 防止点积过大导致 softmax 梯度消失", "C. 减少计算量", "D. 增加模型容量"],
        "answer": "B",
        "explanation": "当 dk（键的维度）很大时，Q 和 K 的点积值会很大，softmax 后会趋近于 one-hot 分布，梯度接近 0。除以 √dk 将方差缩放到 1，保持梯度流动。",
        "tags": ["注意力机制", "数学原理"],
    },
    {
        "question": "多头注意力中'多头'的含义是什么？",
        "options": ["A. 多个模型并行训练", "B. 并行运行多个注意力头关注不同语义关系", "C. 多个 GPU 并行计算", "D. 多个数据集同时训练"],
        "answer": "B",
        "explanation": "多头注意力并行运行多个注意力计算，每个头可以关注不同的语义关系（如语法结构、语义关联、位置关系等），最后拼接所有头的输出。",
        "tags": ["注意力机制", "多头注意力"],
    },
    {
        "question": "LLM 训练流程的正确顺序是什么？",
        "options": ["A. SFT → 预训练 → RLHF", "B. 预训练 → SFT → RLHF", "C. RLHF → SFT → 预训练", "D. SFT → RLHF → 预训练"],
        "answer": "B",
        "explanation": "标准训练流程：先在海量文本上预训练（学语言和知识），再用指令数据监督微调（学遵循指令），最后用 RLHF 对齐人类偏好。",
        "tags": ["训练流程"],
    },
    {
        "question": "预训练（Pre-training）阶段的主要目标是什么？",
        "options": ["A. 让模型学会遵循指令", "B. 下一个 token 预测", "C. 分类任务", "D. 翻译任务"],
        "answer": "B",
        "explanation": "预训练阶段使用下一个 token 预测（next-token prediction）作为训练目标，在海量文本上进行自监督学习。",
        "tags": ["训练流程", "预训练"],
    },
    {
        "question": "RLHF 中的奖励模型是如何训练的？",
        "options": ["A. 自动标注所有回答", "B. 人类对多个回答排序后训练", "C. 使用预定义规则评分", "D. 随机初始化"],
        "answer": "B",
        "explanation": "RLHF 的核心步骤是让人类标注者对同一问题的多个回答进行质量排序，用排序数据训练一个奖励模型，然后用强化学习优化模型输出。",
        "tags": ["训练流程", "RLHF"],
    },
    {
        "question": "Tokenization 中 BPE 算法的基本思想是什么？",
        "options": ["A. 按空格分词", "B. 从字符开始逐步合并高频字符对", "C. 使用字典匹配", "D. 随机切分"],
        "answer": "B",
        "explanation": "BPE（字节对编码）从字符级开始，统计所有相邻字符对的频率，迭代合并最高频的对，直到达到预设的词汇表大小。",
        "tags": ["分词", "Tokenization"],
    },
    {
        "question": "一个 token 大约对应多少个汉字？",
        "options": ["A. 0.25 个", "B. 0.5 个", "C. 2 个", "D. 3 个"],
        "answer": "B",
        "explanation": "对于中文，一个 token 大约对应 0.5 个汉字（即两个 token 约等于一个汉字）；对于英文，一个 token 约 0.75 个单词。",
        "tags": ["分词", "Tokenization"],
    },
    {
        "question": "Temperature 参数设为接近 0 时，模型输出会怎样？",
        "options": ["A. 输出更加随机多样", "B. 几乎总是选择概率最高的 token", "C. 输出长度变短", "D. 模型速度变慢"],
        "answer": "B",
        "explanation": "Temperature 控制 softmax 的锐度。接近 0 时，softmax 趋近于 argmax，模型几乎总是选概率最高的 token，输出确定性高但缺乏变化。",
        "tags": ["解码策略", "推理参数"],
    },
    {
        "question": "Top-p（Nucleus Sampling）采样的工作方式是什么？",
        "options": ["A. 从 top-k 个 token 中随机选", "B. 只从累计概率达到 p 的 token 集合中采样", "C. 总是选概率最高的 token", "D. 全随机采样"],
        "answer": "B",
        "explanation": "Top-p 采样将候选 token 按概率从高到低排序，只保留累计概率达到 p 的最小 token 集合，从中采样。这比固定 top-k 更灵活。",
        "tags": ["解码策略", "推理参数"],
    },
    {
        "question": "上下文窗口（Context Window）指的是什么？",
        "options": ["A. 浏览器窗口大小", "B. 模型一次能处理的最大 token 数量", "C. 训练数据的大小", "D. GPU 显存大小"],
        "answer": "B",
        "explanation": "上下文窗口是模型单次推理能处理的最大输入+输出 token 总数。GPT-4 初始为 8K，现代模型可达 128K 甚至 1M token。",
        "tags": ["基础概念", "上下文窗口"],
    },
    {
        "question": "LLM 的'涌现能力'（Emergent Abilities）是指什么？",
        "options": ["A. 模型启动速度变快", "B. 参数规模超过阈值后突然展现未训练的能力", "C. 模型生成速度加快", "D. 模型能理解新语言"],
        "answer": "B",
        "explanation": "涌现能力是指当模型规模超过某个阈值时，突然展现出训练时未明确教授的能力（如推理、代码生成等），这些能力不是简单线性增长的。",
        "tags": ["基础概念", "涌现能力"],
    },
    {
        "question": "LLM 产生幻觉（Hallucination）的根本原因是什么？",
        "options": ["A. 训练数据太少", "B. 模型本质是概率预测下一个 token，缺乏事实验证", "C. GPU 过热", "D. 模型参数太多"],
        "answer": "B",
        "explanation": "幻觉源于 LLM 的本质：基于概率预测下一个 token，而非基于对真实世界的理解和验证。模型可能生成语法正确但事实错误的内容。",
        "tags": ["基础概念", "幻觉"],
    },
    {
        "question": "RAG（检索增强生成）如何缓解 LLM 幻觉？",
        "options": ["A. 增大模型参数", "B. 从外部知识库检索相关文档作为生成依据", "C. 降低 temperature", "D. 增加训练数据"],
        "answer": "B",
        "explanation": "RAG 在生成前先从外部知识库（如向量数据库）检索相关文档，将检索结果作为上下文注入 prompt，使模型有依据可循，从而减少幻觉。",
        "tags": ["RAG", "幻觉"],
    },
    {
        "question": "Chain-of-Thought（思维链）提示技术的作用是什么？",
        "options": ["A. 加快推理速度", "B. 引导模型逐步推理而非直接输出答案", "C. 减少 token 消耗", "D. 降低模型复杂度"],
        "answer": "B",
        "explanation": "思维链提示要求模型在给出最终答案前展示推理步骤，这能显著提高复杂推理任务（如数学题、逻辑题）的准确率。",
        "tags": ["提示工程"],
    },
    {
        "question": "RoPE（旋转位置编码）相比正弦位置编码的优势是什么？",
        "options": ["A. 计算更快", "B. 更好地处理相对位置关系，支持长度外推", "C. 占用更少显存", "D. 不需要位置编码"],
        "answer": "B",
        "explanation": "RoPE 通过旋转变换编码位置信息，天然能处理 token 间的相对位置关系，且具有更好的长度外推能力，是当前主流 LLM 采用的位置编码方案。",
        "tags": ["位置编码", "Transformer"],
    },
    {
        "question": "在 SFT 阶段，数据质量和数据数量的重要性如何？",
        "options": ["A. 数量远大于质量", "B. 质量比数量更重要", "C. 两者同等重要", "D. 都不重要"],
        "answer": "B",
        "explanation": "SFT 阶段，高质量的小型数据集（数万条精心标注的指令）往往比低质量的大数据集效果更好。数据质量而非数量是关键。",
        "tags": ["训练流程", "SFT"],
    },
    {
        "question": "现代 LLM 为什么需要 RLHF 阶段？",
        "options": ["A. 提升模型运行速度", "B. 使输出更符合人类偏好，减少有害内容", "C. 减少模型参数量", "D. 替代预训练"],
        "answer": "B",
        "explanation": "RLHF 通过人类反馈优化模型，使输出与人类价值观和偏好对齐，减少有害、偏见和不准确的内容，是让模型变得'好用'的关键步骤。",
        "tags": ["训练流程", "RLHF"],
    },
    {
        "question": "自注意力机制的 Attention(Q,K,V) = softmax(QK^T/√dk)V 中，softmax 作用在哪个维度？",
        "options": ["A. Q 的每个 token 维度上", "B. K 的最后一个维度上，对每个 Q 的各 K 权重做归一化", "C. V 的维度上", "D. 所有维度上"],
        "answer": "B",
        "explanation": "softmax 沿 K 的维度对每个 Q token 与所有 K token 的相似度分数做归一化，使得每个 Q 对所有位置的注意力权重之和为 1。",
        "tags": ["注意力机制", "数学原理"],
    },
]


def seed_if_empty():
    """Check if example material exists. If not, create it with 20 questions."""
    db = SessionLocal()
    try:
        existing = db.query(Material).filter(Material.title == SEED_TITLE).first()
        if existing:
            return {"status": "already_exists", "material_id": existing.id}

        # Create material
        m = Material(title=SEED_TITLE, content=SEED_CONTENT, format="text")
        db.add(m)
        db.flush()

        # Embed chunks into ChromaDB
        chunks = chunk_text(SEED_CONTENT)
        embed_and_store(chunks, m.id)

        # Create 20 questions with distributed chunk_ids
        chunk_ids = [c.get("id", "") for c in chunks]
        for i, q_data in enumerate(SEED_QUESTIONS):
            chunk_id = chunk_ids[i % len(chunk_ids)] if chunk_ids else ""
            q = Question(
                material_id=m.id,
                chunk_id=chunk_id,
                question=q_data["question"],
                options=q_data["options"],
                answer=q_data["answer"],
                explanation=q_data.get("explanation", ""),
                tags=q_data.get("tags", []),
            )
            db.add(q)

        # Mark as example material
        db.add(Setting(key="example_material_id", value=str(m.id)))

        db.commit()
        return {"status": "seeded", "material_id": m.id, "question_count": len(SEED_QUESTIONS)}
    finally:
        db.close()
