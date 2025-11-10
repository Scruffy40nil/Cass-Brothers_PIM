#!/usr/bin/env python3
"""
Test extraction from a single PDF URL
"""
import sys
import requests
from core.ai_extractor import AIExtractor
from config.settings import settings

def test_pdf_extraction(pdf_url: str):
    """Test extraction from a single PDF"""
    print("=" * 80)
    print(f"Testing PDF Extraction")
    print("=" * 80)
    print(f"URL: {pdf_url}")
    print()

    # Initialize AI extractor
    extractor = AIExtractor()

    try:
        # Test 1: Can we download the PDF?
        print("📥 Step 1: Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        if response.status_code != 200:
            print(f"❌ Failed to download PDF: HTTP {response.status_code}")
            return False

        pdf_content = response.content
        pdf_size = len(pdf_content) / 1024  # KB
        print(f"✅ Downloaded PDF: {pdf_size:.1f} KB")
        print()

        # Test 2: Can we extract text?
        print("📄 Step 2: Extracting text from PDF...")
        text = extractor._extract_text_from_pdf(pdf_content, pdf_url)
        if not text:
            print("❌ No text extracted from PDF")
            return False

        text_length = len(text)
        print(f"✅ Extracted {text_length} characters of text")
        print()
        print("First 500 characters:")
        print("-" * 80)
        print(text[:500])
        print("-" * 80)
        print()

        # Test 3: Is it sparse (needs Vision API)?
        if text_length < 500:
            print(f"⚠️  PDF is sparse ({text_length} chars) - would use Vision API fallback")
            print()

        # Test 4: Try AI extraction
        print("🤖 Step 3: Running AI extraction for 'toilets' collection...")
        extracted_data = extractor.extract_from_pdf_content(
            pdf_content=pdf_content,
            url=pdf_url,
            collection_name='toilets'
        )

        if not extracted_data:
            print("❌ AI extraction returned no data")
            return False

        print("✅ AI extraction successful!")
        print()
        print("Extracted fields:")
        print("-" * 80)
        for field, value in extracted_data.items():
            if value:
                print(f"  {field}: {value}")
        print("-" * 80)
        print()

        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    # Test URLs provided by user
    test_urls = [
        "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/caroma_technical_manual_844910w_24_07_25.pdf?v=1753333925",
        "https://gwa-prod-pxm-api.s3-ap-southeast-2.amazonaws.com/pdf/44992_Liano-Invisi-II-CF-WH-TSTM.pdf",
        "https://cdn.shopify.com/s/files/1/0552/5808/7468/files/CW163EATCF6632AU-Spec_65861d64-e1f8-4bec-b08f-d69ac00a7148.pdf?v=1715135965",
    ]

    if len(sys.argv) > 1:
        # Test specific URL from command line
        url = sys.argv[1]
        test_pdf_extraction(url)
    else:
        # Test first URL by default
        print("Testing first problematic URL...")
        print()
        success = test_pdf_extraction(test_urls[0])

        print()
        print("=" * 80)
        if success:
            print("✅ Test passed!")
        else:
            print("❌ Test failed!")
        print()
        print("To test other URLs:")
        for i, url in enumerate(test_urls, 1):
            print(f"{i}. python test_single_pdf_extraction.py \"{url}\"")
        print("=" * 80)
