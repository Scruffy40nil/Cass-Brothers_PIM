"""
Test Firestore Connection
Verifies that Firebase/Firestore is properly configured
"""
import os
import json
import sys

print("=" * 60)
print("FIRESTORE CONNECTION TEST")
print("=" * 60)

# Step 1: Check credentials
print("\n1. Checking Google credentials...")
creds_json = os.environ.get('GOOGLE_CREDENTIALS_JSON', '')

if not creds_json:
    print("❌ GOOGLE_CREDENTIALS_JSON environment variable not found!")
    sys.exit(1)

try:
    if creds_json.startswith('{'):
        creds = json.loads(creds_json)
    else:
        with open(creds_json, 'r') as f:
            creds = json.load(f)

    print(f"✅ Credentials loaded successfully")
    print(f"   Project ID: {creds.get('project_id', 'NOT FOUND')}")
    print(f"   Service Account: {creds.get('client_email', 'NOT FOUND')}")
except Exception as e:
    print(f"❌ Error loading credentials: {e}")
    sys.exit(1)

# Step 2: Check Firebase Admin SDK
print("\n2. Checking Firebase Admin SDK...")
try:
    import firebase_admin
    print("✅ firebase-admin installed")
except ImportError:
    print("❌ firebase-admin not installed!")
    print("   Run: pip install --user firebase-admin")
    sys.exit(1)

# Step 3: Initialize Firebase
print("\n3. Initializing Firebase...")
try:
    from firebase_admin import credentials, firestore

    # Initialize if not already done
    if not firebase_admin._apps:
        cred = credentials.Certificate(creds)
        firebase_admin.initialize_app(cred)
        print("✅ Firebase initialized successfully")
    else:
        print("✅ Firebase already initialized")
except Exception as e:
    print(f"❌ Error initializing Firebase: {e}")
    sys.exit(1)

# Step 4: Test Firestore connection
print("\n4. Testing Firestore connection...")
try:
    db = firestore.client()
    print("✅ Firestore client created")

    # Try to write a test document
    test_ref = db.collection('_test').document('connection_test')
    test_ref.set({
        'test': True,
        'timestamp': firestore.SERVER_TIMESTAMP,
        'message': 'Connection test successful'
    })
    print("✅ Test write successful")

    # Try to read it back
    test_doc = test_ref.get()
    if test_doc.exists:
        print("✅ Test read successful")
        print(f"   Data: {test_doc.to_dict()}")

    # Clean up test document
    test_ref.delete()
    print("✅ Test cleanup successful")

except Exception as e:
    print(f"❌ Firestore connection error: {e}")
    print("\nPossible issues:")
    print("1. Firestore API not enabled in Google Cloud Console")
    print("2. Service account doesn't have Firestore permissions")
    print("3. Firestore database not created yet")
    print("\nTo fix:")
    print("- Go to https://console.cloud.google.com/")
    print(f"- Select project: {creds.get('project_id')}")
    print("- Enable Firestore API")
    print("- Create a Firestore database (Native mode)")
    print("- Add 'Cloud Datastore User' role to service account")
    sys.exit(1)

print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED!")
print("=" * 60)
print("\nYour Firestore connection is working correctly.")
print("You can now run the migration script:")
print("  python migrate_sheets_to_firestore.py --collection sinks --dry-run")
print()
