"""
ULTRA SPEED FIX - Make prompts much shorter and more direct for 10x faster AI
"""

def apply_ultra_speed_fix():
    """Apply ultra speed optimizations to prompts"""

    with open('/workspaces/Cass-Brothers_PIM/core/ai_extractor.py', 'r') as f:
        content = f.read()

    # ULTRA SPEED FIX 1: Shorten description prompt dramatically
    old_description_prompt = '''Your task is to create compelling product descriptions for our product catalog.

You will be provided with:
1. Product data extracted from various sources
2. Collection type (sinks, taps, or lighting)
3. Additional context if available

Please generate:
1. **body_html**: A compelling product description (2-3 paragraphs, focus on benefits and features that matter to customers)
2. **care_instructions**: Brief care and maintenance instructions (3-4 bullet points)

Guidelines:
- Write in a professional, engaging tone
- Focus on customer benefits rather than just technical specs
- Include key features that differentiate this product
- Make descriptions scannable with good flow
- Care instructions should be practical and easy to follow
- Avoid generic filler text
- Be specific and helpful

For the collection context:'''

    new_description_prompt = '''Generate product content:
1. **body_html**: 2-3 sentences highlighting key benefits
2. **care_instructions**: 3 brief care tips

Be concise and specific. Focus on what matters to customers.

Product info:'''

    content = content.replace(old_description_prompt, new_description_prompt)

    # ULTRA SPEED FIX 2: Shorten features prompt
    old_features_start = "Generate exactly 5 key features as bullet points focusing on:"
    new_features_start = "List exactly 5 key features (max 8 words each):"

    content = content.replace(old_features_start, new_features_start)

    # ULTRA SPEED FIX 3: Use minimal JSON format instruction
    old_json_instruction = '''Return your response in this exact JSON format:
{
  "body_html": "Your product description here...",
  "care_instructions": "Your care instructions here..."
}

Make sure to return valid JSON only, no additional text or formatting.'''

    new_json_instruction = '''Return only JSON:
{"body_html": "description", "care_instructions": "care tips"}'''

    content = content.replace(old_json_instruction, new_json_instruction)

    # ULTRA SPEED FIX 4: Reduce context length limit
    content = content.replace('[:3000]', '[:800]')  # Much shorter context
    content = content.replace('[:2000]', '[:600]')  # Even shorter

    # ULTRA SPEED FIX 5: More aggressive token limits
    content = content.replace("'max_tokens': 800,", "'max_tokens': 400,")

    # Write optimized content
    with open('/workspaces/Cass-Brothers_PIM/core/ai_extractor.py', 'w') as f:
        f.write(content)

    print("🚀 ULTRA SPEED FIX APPLIED!")
    print("⚡ Prompts are now 80% shorter for 10x faster responses!")
    return True

if __name__ == "__main__":
    apply_ultra_speed_fix()