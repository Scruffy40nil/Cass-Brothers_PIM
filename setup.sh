#!/bin/bash

# PIM Dashboard Setup Script for PythonAnywhere
# Run this script in your PythonAnywhere console to set up the application

echo "🚀 PIM Dashboard Setup Script"
echo "=============================="

# Get current directory
CURRENT_DIR=$(pwd)
echo "📁 Current directory: $CURRENT_DIR"

# Check if we're in the right directory
if [[ ! "$CURRENT_DIR" == *"/mysite"* ]]; then
    echo "⚠️  Warning: You should run this script from your /home/username/mysite directory"
    echo "💡 Run: cd /home/$(whoami)/mysite"
    read -p "Continue anyway? (y/N): " continue_setup
    if [[ ! "$continue_setup" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "📦 Step 1: Installing Python packages..."
echo "========================================"

# Install required packages
if pip3.10 install --user -r requirements.txt; then
    echo "✅ Packages installed successfully"
else
    echo "❌ Failed to install packages"
    echo "💡 Make sure requirements.txt exists in this directory"
    exit 1
fi

echo ""
echo "🔧 Step 2: Environment Configuration"
echo "===================================="

# Check for existing environment variables
if [[ -n "$OPENAI_API_KEY" ]]; then
    echo "✅ OPENAI_API_KEY is already set"
else
    echo "⚠️  OPENAI_API_KEY not found"
    read -p "Enter your OpenAI API key (or press Enter to skip): " openai_key
    if [[ -n "$openai_key" ]]; then
        echo "export OPENAI_API_KEY=\"$openai_key\"" >> ~/.bashrc
        export OPENAI_API_KEY="$openai_key"
        echo "✅ OPENAI_API_KEY added to ~/.bashrc"
    fi
fi

if [[ -n "$SINKS_SPREADSHEET_ID" ]]; then
    echo "✅ SINKS_SPREADSHEET_ID is already set"
else
    echo "⚠️  SINKS_SPREADSHEET_ID not found"
    read -p "Enter your Google Sheets ID (or press Enter to skip): " sheet_id
    if [[ -n "$sheet_id" ]]; then
        echo "export SINKS_SPREADSHEET_ID=\"$sheet_id\"" >> ~/.bashrc
        export SINKS_SPREADSHEET_ID="$sheet_id"
        echo "✅ SINKS_SPREADSHEET_ID added to ~/.bashrc"
    fi
fi

if [[ -n "$FLASK_SECRET_KEY" ]]; then
    echo "✅ FLASK_SECRET_KEY is already set"
else
    echo "⚠️  FLASK_SECRET_KEY not found"
    # Generate a random secret key
    secret_key=$(python3.10 -c "import secrets; print(secrets.token_hex(32))")
    echo "export FLASK_SECRET_KEY=\"$secret_key\"" >> ~/.bashrc
    export FLASK_SECRET_KEY="$secret_key"
    echo "✅ FLASK_SECRET_KEY generated and added to ~/.bashrc"
fi

echo ""
echo "📋 Step 3: File Structure Check"
echo "==============================="

# Check for required files
required_files=("flask_app.py" "requirements.txt")
required_dirs=("templates")

for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        echo "✅ $file found"
    else
        echo "❌ $file missing"
    fi
done

for dir in "${required_dirs[@]}"; do
    if [[ -d "$dir" ]]; then
        echo "✅ $dir/ directory found"
        # Check templates
        if [[ "$dir" == "templates" ]]; then
            template_files=("dashboard.html" "sinks.html" "rules.html" "error.html")
            for template in "${template_files[@]}"; do
                if [[ -f "$dir/$template" ]]; then
                    echo "  ✅ $template"
                else
                    echo "  ❌ $template missing"
                fi
            done
        fi
    else
        echo "❌ $dir/ directory missing"
        echo "💡 Creating $dir/ directory..."
        mkdir -p "$dir"
    fi
done

echo ""
echo "🧪 Step 4: Testing Connections"
echo "=============================="

# Test Python imports
echo "Testing Python imports..."
python3.10 -c "
try:
    import flask
    import gspread
    import requests
    from bs4 import BeautifulSoup
    print('✅ All required packages imported successfully')
except ImportError as e:
    print(f'❌ Import error: {e}')
    exit(1)
"

# Test OpenAI API (if key provided)
if [[ -n "$OPENAI_API_KEY" ]]; then
    echo "Testing OpenAI API connection..."
    response=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models)
    if [[ "$response" == "200" ]]; then
        echo "✅ OpenAI API connection successful"
    else
        echo "❌ OpenAI API connection failed (HTTP $response)"
    fi
fi

# Test Google credentials (if provided)
if [[ -n "$GOOGLE_CREDENTIALS_JSON" ]]; then
    echo "Testing Google Sheets connection..."
    python3.10 -c "
import os, json, gspread
from google.oauth2.service_account import Credentials
try:
    creds_json = os.environ.get('GOOGLE_CREDENTIALS_JSON')
    if creds_json:
        creds_dict = json.loads(creds_json)
        creds = Credentials.from_service_account_info(creds_dict, scopes=['https://www.googleapis.com/auth/spreadsheets'])
        gc = gspread.authorize(creds)
        print('✅ Google Sheets authentication successful')
    else:
        print('⚠️  GOOGLE_CREDENTIALS_JSON not set')
except Exception as e:
    print(f'❌ Google Sheets connection failed: {e}')
"
fi

echo ""
echo "📝 Step 5: Configuration Summary"
echo "================================"

echo "Environment Variables Status:"
echo "- OPENAI_API_KEY: ${OPENAI_API_KEY:+✅ Set}${OPENAI_API_KEY:-❌ Not set}"
echo "- GOOGLE_CREDENTIALS_JSON: ${GOOGLE_CREDENTIALS_JSON:+✅ Set}${GOOGLE_CREDENTIALS_JSON:-❌ Not set}"
echo "- SINKS_SPREADSHEET_ID: ${SINKS_SPREADSHEET_ID:+✅ Set}${SINKS_SPREADSHEET_ID:-❌ Not set}"
echo "- FLASK_SECRET_KEY: ${FLASK_SECRET_KEY:+✅ Set}${FLASK_SECRET_KEY:-❌ Not set}"

echo ""
echo "🎯 Next Steps"
echo "============="
echo "1. If not already done, set your Google credentials:"
echo "   export GOOGLE_CREDENTIALS_JSON='{\"type\":\"service_account\",...}'"
echo ""
echo "2. Reload your bash configuration:"
echo "   source ~/.bashrc"
echo ""
echo "3. Go to the Web tab in PythonAnywhere and click 'Reload' on your web app"
echo ""
echo "4. Visit your app at: https://$(whoami).pythonanywhere.com"
echo ""
echo "5. Use the 'Test Connections' button in the dashboard to verify everything works"
echo ""

# Create a quick test script
cat > test_setup.py << 'EOF'
#!/usr/bin/env python3.10

import os
import sys

def test_environment():
    """Test environment setup"""
    print("🧪 Environment Test")
    print("==================")
    
    # Check environment variables
    required_vars = ['OPENAI_API_KEY', 'SINKS_SPREADSHEET_ID', 'FLASK_SECRET_KEY']
    optional_vars = ['GOOGLE_CREDENTIALS_JSON']
    
    print("\nRequired Environment Variables:")
    for var in required_vars:
        value = os.environ.get(var)
        status = "✅ Set" if value else "❌ Missing"
        print(f"  {var}: {status}")
    
    print("\nOptional Environment Variables:")
    for var in optional_vars:
        value = os.environ.get(var)
        status = "✅ Set" if value else "⚠️  Not set"
        print(f"  {var}: {status}")
    
    # Test imports
    print("\nPackage Imports:")
    packages = [
        'flask', 'gspread', 'requests', 'bs4', 
        'google.oauth2.service_account', 'flask_socketio'
    ]
    
    for package in packages:
        try:
            __import__(package)
            print(f"  {package}: ✅ Available")
        except ImportError:
            print(f"  {package}: ❌ Missing")
    
    print("\n🎉 Test complete!")

if __name__ == "__main__":
    test_environment()
EOF

chmod +x test_setup.py

echo "💡 Created test_setup.py - run it anytime to check your configuration:"
echo "   python3.10 test_setup.py"

echo ""
echo "🎉 Setup script completed!"
echo "=========================="
echo ""
echo "If you encounter any issues:"
echo "- Check the deployment guide for detailed troubleshooting"
echo "- Verify all files are uploaded correctly"
echo "- Make sure your Google Sheet is shared with the service account"
echo "- Test API keys manually if needed"
echo ""
echo "Happy processing! 🚀"