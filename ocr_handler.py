"""
OCR Handler - Extracts text from images and documents.
Supports: PNG, JPG, JPEG, BMP (via EasyOCR), PDF, DOCX, TXT
"""

import os
import easyocr
from PyPDF2 import PdfReader
from docx import Document

# Initialize EasyOCR reader (lazy load to avoid slow startup)
_reader = None


def _get_reader():
    """Lazy-initialize the EasyOCR reader."""
    global _reader
    if _reader is None:
        print("[OCR] Loading EasyOCR model (first time may take a moment)...")
        _reader = easyocr.Reader(['en'], gpu=False)
        print("[OCR] EasyOCR ready!")
    return _reader


def extract_text(filepath):
    """
    Extract text from a file based on its extension.
    Returns the extracted text as a string.
    """
    ext = os.path.splitext(filepath)[1].lower()

    if ext in ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp']:
        return extract_from_image(filepath)
    elif ext == '.pdf':
        return extract_from_pdf(filepath)
    elif ext == '.docx':
        return extract_from_docx(filepath)
    elif ext == '.txt':
        return extract_from_txt(filepath)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def extract_from_image(filepath):
    """Extract text from an image using EasyOCR."""
    try:
        reader = _get_reader()
        results = reader.readtext(filepath, detail=0)
        text = ' '.join(results)
        return text.strip()
    except Exception as e:
        raise RuntimeError(f"OCR failed: {str(e)}")


def extract_from_pdf(filepath):
    """Extract text from a PDF file."""
    try:
        reader = PdfReader(filepath)
        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        return "\n".join(text_parts).strip()
    except Exception as e:
        raise RuntimeError(f"PDF extraction failed: {str(e)}")


def extract_from_docx(filepath):
    """Extract text from a DOCX file."""
    try:
        doc = Document(filepath)
        text_parts = [para.text for para in doc.paragraphs if para.text.strip()]
        return "\n".join(text_parts).strip()
    except Exception as e:
        raise RuntimeError(f"DOCX extraction failed: {str(e)}")


def extract_from_txt(filepath):
    """Extract text from a plain text file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception as e:
        raise RuntimeError(f"TXT read failed: {str(e)}")
