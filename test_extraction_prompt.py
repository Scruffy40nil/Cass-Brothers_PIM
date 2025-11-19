#!/usr/bin/env python3
"""
Test what the AI sees when extracting from Studio Bagno PDF
"""

import os
import requests
import pdfplumber
import io
from dotenv import load_dotenv
load_dotenv()

from core.ai_extractor import AIExtractor

def main():
    pdf_url = "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/studio_bagno_specsheet_30jan2024_SOL13-1.pdf"

    print("=" * 80)
    print("TESTING AI EXTRACTION PROMPT")
    print("=" * 80)

    extractor = AIExtractor()

    # Get the extraction prompt
    prompt_builder = extractor.extraction_prompts.get('basins')
    if prompt_builder:
        prompt = prompt_builder(pdf_url)

        print("\nEXTRACTION PROMPT (first 1000 chars):")
        print("-" * 80)
        print(prompt[:1000])
        print("...")
        print()

    # Now fetch and extract the PDF text
    print("FETCHING PDF CONTENT:")
    print("-" * 80)

    response = requests.get(pdf_url, timeout=30)
    pdf_file = io.BytesIO(response.content)

    text_content = []
    with pdfplumber.open(pdf_file) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            page_text = page.extract_text()
            if page_text:
                text_content.append(f"=== Page {page_num} ===\n{page_text}")

    full_text = "\n\n".join(text_content)

    print(f"\nExtracted {len(full_text)} characters")
    print("\nPDF CONTENT:")
    print("-" * 80)
    print(full_text)
    print()

    # The AI would see: PROMPT + full_text combined
    print("\n" + "=" * 80)
    print("ANALYSIS:")
    print("=" * 80)
    print(f"Text contains '550': {('550' in full_text)}")
    print(f"Text contains '420': {('420' in full_text)}")
    print(f"Text contains '120': {('120' in full_text)}")
    print(f"Text contains 'mm': {('mm' in full_text)}")
    print(f"Text contains 'millimetres': {('millimetres' in full_text)}")

if __name__ == '__main__':
    main()
