"""One-off: extract plain text from a .docx file."""
from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path


def extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    text = re.sub(r"</w:p>", "\n", xml)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python read_docx.py <path>")
        sys.exit(1)
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"NOT FOUND: {path}")
        sys.exit(2)
    print(extract_docx(path))


if __name__ == "__main__":
    main()
