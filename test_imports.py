#!/usr/bin/env python3
"""
Diagnostic script to test if all modules load correctly
Run this on PythonAnywhere to diagnose 502 errors
"""

import sys
import os

# Add project to path
project_home = os.path.dirname(os.path.abspath(__file__))
if project_home not in sys.path:
    sys.path.insert(0, project_home)

print("=" * 80)
print("DIAGNOSTIC TEST - Module Loading")
print("=" * 80)

# Test 1: Load collections
print("\n1. Testing collections module...")
try:
    from config.collections import COLLECTIONS, get_collection_config
    print(f"   ✅ Collections loaded: {list(COLLECTIONS.keys())}")
except Exception as e:
    print(f"   ❌ ERROR loading collections:")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 2: Load AI extractor
print("\n2. Testing AI extractor module...")
try:
    from core.ai_extractor import AIExtractor
    extractor = AIExtractor()
    print(f"   ✅ AI Extractor loaded with prompts for: {list(extractor.extraction_prompts.keys())}")
except Exception as e:
    print(f"   ❌ ERROR loading AI extractor:")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 3: Load Flask app
print("\n3. Testing Flask app...")
try:
    from flask_app import app
    print(f"   ✅ Flask app loaded successfully")
except Exception as e:
    print(f"   ❌ ERROR loading Flask app:")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 80)
print("✅ ALL TESTS PASSED - App should work!")
print("=" * 80)
