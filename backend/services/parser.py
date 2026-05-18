import re
import httpx
from io import BytesIO


async def parse_url(url: str) -> str:
    """从网页 URL 提取纯文本内容"""
    from bs4 import BeautifulSoup
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return "\n\n".join(lines)


def parse_pdf(file_bytes: bytes, filename: str) -> str:
    """从 PDF 文件提取纯文本内容"""
    from PyPDF2 import PdfReader
    reader = PdfReader(BytesIO(file_bytes))
    texts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            texts.append(t)
    return "\n\n".join(texts)


def parse_markdown(content: str) -> str:
    """剥离 Markdown 格式标记，提取纯文本"""
    content = re.sub(r'```[\s\S]*?```', '', content)
    content = re.sub(r'!\[.*?\]\(.*?\)', '', content)
    content = re.sub(r'\[([^\]]+)\]\(.*?\)', r'\1', content)
    content = re.sub(r'[#*>`|_~-]', '', content)
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    return "\n\n".join(lines)
