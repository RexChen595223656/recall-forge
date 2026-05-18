import chromadb
from config import CHROMA_PERSIST_DIR, CHUNK_SIZE, CHUNK_OVERLAP
import hashlib
import re
import os

os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
collection = chroma_client.get_or_create_collection(name="materials")


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list:
    """将文本切分为重叠的段落块，返回 [{id, content, index}]"""
    paragraphs = re.split(r'\n{2,}', text)
    chunks = []
    idx = 0
    for para in paragraphs:
        para = para.strip()
        if not para or len(para) < 20:
            continue
        if len(para) <= chunk_size:
            chunk_id = hashlib.md5(para.encode()).hexdigest()[:12]
            chunks.append({"id": chunk_id, "content": para, "index": idx})
            idx += 1
        else:
            start = 0
            while start < len(para):
                end = min(start + chunk_size, len(para))
                seg = para[start:end].strip()
                if len(seg) >= 20:
                    chunk_id = hashlib.md5(seg.encode()).hexdigest()[:12]
                    chunks.append({"id": chunk_id, "content": seg, "index": idx})
                    idx += 1
                start += chunk_size - overlap
    return chunks


def embed_and_store(chunks: list, material_id: int):
    """将文本块存入 ChromaDB 向量库"""
    texts = [c["content"] for c in chunks]
    ids = [f"m{material_id}_{c['id']}" for c in chunks]
    metadatas = [{"material_id": material_id, "chunk_index": c["index"], "chunk_oid": c["id"]} for c in chunks]

    existing = collection.get(where={"material_id": material_id})
    if existing and existing["ids"]:
        collection.delete(ids=existing["ids"])

    if texts:
        collection.add(documents=texts, ids=ids, metadatas=metadatas)


def retrieve_chunks(query: str, material_id: int = None, n_results: int = 5) -> list:
    """从 ChromaDB 检索相关文本块"""
    where_filter = {"material_id": material_id} if material_id else None
    results = collection.query(query_texts=[query], n_results=n_results, where=where_filter)
    chunks = []
    if results and results.get("documents") and results["documents"][0]:
        for i, doc in enumerate(results["documents"][0]):
            meta = results["metadatas"][0][i] if results.get("metadatas") else {}
            chunks.append({"content": doc, "metadata": meta})
    return chunks


def get_random_chunks(material_id: int, n: int = 5, exclude_ids: list = None) -> list:
    """获取材料的随机文本块，可排除已使用的块避免重复"""
    exclude_ids = exclude_ids or []
    # Get all chunks for this material
    results = collection.get(where={"material_id": material_id})
    chunks = []
    if results and results.get("documents"):
        available = []
        for i, doc in enumerate(results["documents"]):
            meta = results["metadatas"][i] if results.get("metadatas") else {}
            chunk_oid = meta.get("chunk_oid", "")
            if chunk_oid not in exclude_ids:
                available.append({"content": doc, "metadata": meta})

        # Prefer unused chunks, fallback to random from all if not enough
        import random
        if len(available) >= n:
            selected = random.sample(available, n)
        else:
            selected = available
            # 补充已用过的文本块（当未用块不足时）
            all_chunks = [{"content": doc, "metadata": results["metadatas"][i] if results.get("metadatas") else {}}
                          for i, doc in enumerate(results["documents"])]
            remaining = [c for c in all_chunks if c not in available]
            if remaining:
                needed = n - len(selected)
                selected += random.sample(remaining, min(needed, len(remaining)))
        return selected
    return chunks


def count_chunks(material_id: int) -> int:
    """统计材料的分块数量"""
    results = collection.get(where={"material_id": material_id})
    return len(results["ids"]) if results and results.get("ids") else 0


def delete_material_chunks(material_id: int):
    """删除材料的所有文本块"""
    existing = collection.get(where={"material_id": material_id})
    if existing and existing["ids"]:
        collection.delete(ids=existing["ids"])
