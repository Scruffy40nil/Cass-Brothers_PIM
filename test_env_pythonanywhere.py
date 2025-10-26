#!/usr/bin/env python3
"""
Test script to verify environment variables are loaded correctly on PythonAnywhere
Run this on PythonAnywhere to diagnose the .env loading issue
"""

print("=" * 80)
print("ENVIRONMENT VARIABLE TEST FOR PYTHONANYWHERE")
print("=" * 80)

# Step 1: Check if .env file exists
import os
env_path = os.path.join(os.path.dirname(__file__), '.env')
print(f"\n1. Checking .env file at: {env_path}")
if os.path.exists(env_path):
    print("   ✅ .env file EXISTS")
    file_size = os.path.getsize(env_path)
    print(f"   📊 File size: {file_size} bytes")

    print("\n   First 5 lines of .env:")
    with open(env_path, 'r') as f:
        for i, line in enumerate(f):
            if i < 5:
                if '=' in line and not line.startswith('#'):
                    key = line.split('=')[0]
                    print(f"      {key}=...")
                else:
                    print(f"      {line.strip()}")
            else:
                break
else:
    print("   ❌ .env file DOES NOT EXIST")
    print(f"   Current directory: {os.getcwd()}")
    print(f"   Script directory: {os.path.dirname(__file__)}")

# Step 2: Try loading dotenv
print("\n2. Loading environment variables with python-dotenv...")
try:
    from dotenv import load_dotenv
    load_dotenv(env_path)
    print("   ✅ python-dotenv loaded successfully")
except ImportError as e:
    print(f"   ❌ python-dotenv not installed: {e}")
    print("   Run: pip install python-dotenv")
    exit(1)

# Step 3: Check critical environment variables
print("\n3. Checking critical environment variables...")

critical_vars = [
    'TAPS_SPREADSHEET_ID',
    'SINKS_SPREADSHEET_ID',
    'GOOGLE_CREDENTIALS_JSON',
    'OPENAI_API_KEY',
    'FLASK_SECRET_KEY'
]

all_good = True
for var in critical_vars:
    value = os.environ.get(var)
    if value:
        if len(value) > 20:
            display = value[:20] + "..." + f" (length: {len(value)})"
        else:
            display = value[:10] + "..." if len(value) > 10 else "***"
        print(f"   ✅ {var}: {display}")
    else:
        print(f"   ❌ {var}: NOT SET")
        all_good = False

# Step 4: Specifically check TAPS_SPREADSHEET_ID
print("\n4. Detailed check for TAPS_SPREADSHEET_ID...")
taps_id = os.environ.get('TAPS_SPREADSHEET_ID')
expected_taps_id = "1jJ5thuNoxcITHkFAfFKPmUfaLYC3dSo2oppiN0s7i1U"

if taps_id:
    print(f"   Value: {taps_id}")
    if taps_id == expected_taps_id:
        print("   ✅ MATCHES expected value")
    else:
        print(f"   ⚠️  Does NOT match expected value")
        print(f"   Expected: {expected_taps_id}")
else:
    print("   ❌ TAPS_SPREADSHEET_ID is not set!")
    print(f"   Expected: {expected_taps_id}")
    all_good = False

# Step 5: Test collection config loading
print("\n5. Testing collection configuration loading...")
try:
    from config.collections import get_collection_config

    taps_config = get_collection_config('taps')
    print(f"   Collection name: {taps_config.name}")
    print(f"   Spreadsheet ID: {taps_config.spreadsheet_id}")

    if taps_config.spreadsheet_id:
        print("   ✅ Taps collection loaded successfully")
    else:
        print("   ❌ Taps collection has EMPTY spreadsheet_id")
        all_good = False

except Exception as e:
    print(f"   ❌ Error loading collection config: {e}")
    import traceback
    traceback.print_exc()
    all_good = False

# Step 6: Final verdict
print("\n" + "=" * 80)
if all_good:
    print("✅ ALL CHECKS PASSED - Environment is configured correctly!")
else:
    print("❌ SOME CHECKS FAILED - See errors above")
    print("\nTroubleshooting steps:")
    print("1. Make sure .env file exists in the project root")
    print("2. Verify TAPS_SPREADSHEET_ID line is present in .env")
    print("3. Check for typos in variable names")
    print("4. Ensure no extra spaces around = sign")
    print("5. Reload the PythonAnywhere web app after making changes")
print("=" * 80)
