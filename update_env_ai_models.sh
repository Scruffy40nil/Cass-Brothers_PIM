#!/bin/bash
# Script to update .env with cost-saving AI model configuration
# Run this on PythonAnywhere after pulling the latest code

ENV_FILE=".env"

echo "🔧 Updating .env with cost-saving AI configuration..."

# Backup .env first
cp "$ENV_FILE" "$ENV_FILE.backup"
echo "✅ Backed up .env to .env.backup"

# Check if configuration already exists
if grep -q "CHATGPT_MODEL=gpt-4o-mini" "$ENV_FILE"; then
    echo "⚠️  Configuration already exists. Skipping..."
    exit 0
fi

# Add the configuration at the end
cat >> "$ENV_FILE" << 'EOL'

# ===== CHATGPT/AI MODEL CONFIGURATION =====
# Switch to cheaper models to reduce costs
CHATGPT_MODEL=gpt-4o-mini
OPENAI_VISION_MODEL=gpt-4o-mini
OPENAI_IMAGE_ANALYSIS_MODEL=gpt-4o-mini
CHATGPT_MAX_TOKENS=800
CHATGPT_TEMPERATURE=0.7
EOL

echo "✅ Cost-saving AI configuration added to .env"
echo "💰 This will reduce AI costs by ~99%"
echo ""
echo "📝 Changes made:"
echo "   - CHATGPT_MODEL=gpt-4o-mini (was gpt-4)"
echo "   - OPENAI_VISION_MODEL=gpt-4o-mini (was gpt-4-vision-preview)"
echo "   - OPENAI_IMAGE_ANALYSIS_MODEL=gpt-4o-mini (was gpt-4)"
echo ""
echo "🚀 Next step: Reload your web app from PythonAnywhere Web tab"
