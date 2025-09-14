# Run this script in the same directory as your Flask app to debug .env loading
import os
import sys
from dotenv import load_dotenv

print("🔍 Environment File Debug Script")
print("=" * 50)

# Check current working directory
print(f"📂 Current working directory: {os.getcwd()}")
print(f"🐍 Python script location: {os.path.dirname(os.path.abspath(__file__))}")

# Check if .env files exist in various locations
env_locations = [
    '.env',
    '../.env',
    '../../.env',
    '/home/cassbrothers/mysite/.env',
    os.path.expanduser('~/.env')
]

print("\n📁 Checking .env file locations:")
for location in env_locations:
    exists = os.path.exists(location)
    print(f"  {location}: {'✅ EXISTS' if exists else '❌ NOT FOUND'}")
    if exists:
        # Try to read the first few lines
        try:
            with open(location, 'r') as f:
                lines = f.readlines()[:5]  # First 5 lines
                print(f"    📄 First few lines:")
                for i, line in enumerate(lines, 1):
                    # Hide sensitive values but show structure
                    if 'SHOPIFY_ENABLED' in line:
                        print(f"      {i}: {line.strip()}")
                    elif 'SHOPIFY_SHOP_URL' in line:
                        print(f"      {i}: {line.strip()}")
                    elif 'SHOPIFY_ACCESS_TOKEN' in line:
                        # Hide the actual token
                        parts = line.split('=', 1)
                        if len(parts) == 2:
                            print(f"      {i}: {parts[0]}=***HIDDEN***")
                        else:
                            print(f"      {i}: {line.strip()}")
                    else:
                        print(f"      {i}: {line.strip()}")
        except Exception as e:
            print(f"    ❌ Error reading file: {e}")

# Test loading with different methods
print("\n🔄 Testing environment variable loading:")

# Method 1: Current environment
print("📊 Method 1 - Current Environment (before load_dotenv):")
print(f"  SHOPIFY_ENABLED: '{os.getenv('SHOPIFY_ENABLED', 'NOT_FOUND')}'")
print(f"  SHOPIFY_SHOP_URL: '{os.getenv('SHOPIFY_SHOP_URL', 'NOT_FOUND')}'")

# Method 2: Load .env from current directory
print("\n📊 Method 2 - After load_dotenv():")
load_dotenv(override=True)
print(f"  SHOPIFY_ENABLED: '{os.getenv('SHOPIFY_ENABLED', 'NOT_FOUND')}'")
print(f"  SHOPIFY_SHOP_URL: '{os.getenv('SHOPIFY_SHOP_URL', 'NOT_FOUND')}'")

# Method 3: Load .env with explicit path
for location in env_locations:
    if os.path.exists(location):
        print(f"\n📊 Method 3 - Loading from {location}:")
        load_dotenv(location, override=True)
        print(f"  SHOPIFY_ENABLED: '{os.getenv('SHOPIFY_ENABLED', 'NOT_FOUND')}'")
        print(f"  SHOPIFY_SHOP_URL: '{os.getenv('SHOPIFY_SHOP_URL', 'NOT_FOUND')}'")
        break

# Check for common issues
print("\n🔧 Common Issues Check:")

# Check for Windows/Unix line ending issues
for location in env_locations:
    if os.path.exists(location):
        with open(location, 'rb') as f:
            content = f.read()
            if b'\r\n' in content:
                print(f"  ⚠️ {location} has Windows line endings (\\r\\n)")
            elif b'\n' in content:
                print(f"  ✅ {location} has Unix line endings (\\n)")
            
            # Check for BOM
            if content.startswith(b'\xef\xbb\xbf'):
                print(f"  ⚠️ {location} has UTF-8 BOM (might cause issues)")
        break

print("\n" + "=" * 50)
print("🏁 Debug complete! Check the output above to identify issues.")