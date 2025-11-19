#!/usr/bin/env python3
"""
Check what text is being extracted from Studio Bagno PDF
"""

import os
import requests
import pdfplumber
import io
from dotenv import load_dotenv
load_dotenv()

def main():
    pdf_url = "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/studio_bagno_specsheet_30jan2024_SOL13-1.pdf"

    print("=" * 80)
    print("CHECKING PDF CONTENT")
    print("=" * 80)
    print(f"\nPDF: {pdf_url}\n")

    # Download PDF
    print("Downloading PDF...")
    response = requests.get(pdf_url, timeout=30)
    response.raise_for_status()

    print(f"Downloaded {len(response.content)} bytes\n")

    # Extract text with pdfplumber
    pdf_file = io.BytesIO(response.content)

    with pdfplumber.open(pdf_file) as pdf:
        print(f"PDF has {len(pdf.pages)} page(s)\n")

        for page_num, page in enumerate(pdf.pages, 1):
            print(f"{'=' * 80}")
            print(f"PAGE {page_num}")
            print(f"{'=' * 80}")

            text = page.extract_text()

            if text:
                print(f"Extracted {len(text)} characters:\n")
                print(text)
                print()
            else:
                print("No text found - likely an image-based PDF\n")

if __name__ == '__main__':
    main()
