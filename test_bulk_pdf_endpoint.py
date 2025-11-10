"""
Test if bulk PDF extraction endpoint is accessible
"""
import requests
import json

# Test against PythonAnywhere
base_url = "https://cassbrothers.pythonanywhere.com"

print("🧪 Testing Bulk PDF Extraction Endpoints\n")

# Test 1: Count PDFs
print("1️⃣ Testing /api/taps/count-pdfs")
try:
    response = requests.get(f"{base_url}/api/taps/count-pdfs", timeout=10)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Response: {json.dumps(data, indent=2)}")
    else:
        print(f"   Error: {response.text}")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n2️⃣ Testing /api/taps/bulk-extract-pdfs (POST)")
try:
    response = requests.post(
        f"{base_url}/api/taps/bulk-extract-pdfs",
        json={
            "batch_size": 1,
            "delay_seconds": 1,
            "overwrite": True
        },
        timeout=10
    )
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Response: {json.dumps(data, indent=2)}")
    else:
        print(f"   Error: {response.text}")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n✅ Test complete")
