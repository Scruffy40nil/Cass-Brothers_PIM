#!/usr/bin/env python3
"""
Demo of what ChatGPT competitor research would return
"""

def demo_chatgpt_competitor_research():
    """Show what ChatGPT would return for FRA400DT15 competitor research"""

    print("🤖 ChatGPT Competitor Research Demo")
    print("=" * 60)

    # This is what ChatGPT would be asked:
    prompt = """
I need you to research how Australian retailers title this specific product: Abey FRA400DT15

Please find 5-8 Australian retailers that actually sell this product online and tell me:
1. The retailer name
2. The exact product title they use on their website
3. The approximate price if visible

For example, if searching for "Abey FRA400DT15", I want to know:
- What does Buildmat call it on their website?
- How does Whitfords title it?
- What's the exact product name on Reece's site?
- How does Bunnings list it?

Please focus on:
- Kitchen/bathroom specialists (Reece, The Blue Space, etc.)
- Building supply stores (Buildmat, etc.)
- Home improvement stores that actually stock this brand
- The official brand website

Format your response as a simple list:
Retailer Name: "Exact Product Title" | $Price

Only include retailers that actually have this specific product listed.
"""

    print("📝 ChatGPT Research Prompt:")
    print(prompt)
    print("-" * 60)

    # This is what ChatGPT would likely return (based on your earlier research):
    simulated_response = """
Abey Australia: "Alfresco 400 Double Bowl Sink with Drain Tray & KTA037-316-BR Kitchen Mixer FRA400DT15" | $2,310

Buildmat: "Abey FRA400DT15 Alfresco 400 Double Bowl Sink Pack with Drain Tray and Kitchen Mixer" | $2,150

Whitfords Home Appliances: "Abey Alfresco 400 Double Bowl Kitchen Sink with Drain Tray & Mixer FRA400DT15" | $2,079

Smeaton Bathrooms: "Abey FRA400DT15 - Alfresco 400 Double Bowl Sink & Drain Tray with Kitchen Mixer" | $2,079

Cass Brothers: "Abey Alfresco 400 Double Bowl Sink with Drain Tray & KTA037-316-BR Mixer - FRA400DT15" | $2,200

Reece: "Abey Alfresco Series 400mm Double Bowl Kitchen Sink Pack FRA400DT15" | $2,299
"""

    print("🎯 Simulated ChatGPT Response:")
    print(simulated_response)
    print("-" * 60)

    # Parse the response (demo of what our parser would do)
    print("📊 Parsed Competitor Data:")
    lines = simulated_response.strip().split('\n')

    for i, line in enumerate(lines, 1):
        if ':' in line and '"' in line:
            parts = line.split(':', 1)
            retailer = parts[0].strip()
            rest = parts[1].strip()

            # Extract title
            title_start = rest.find('"')
            title_end = rest.find('"', title_start + 1)
            if title_start != -1 and title_end != -1:
                title = rest[title_start + 1:title_end]

                # Extract price
                price_part = rest[title_end + 1:]
                price = "Price on request"
                if '$' in price_part:
                    import re
                    price_match = re.search(r'\$[\d,]+', price_part)
                    if price_match:
                        price = price_match.group(0)

                print(f"{i}. {retailer}")
                print(f"   Title: {title}")
                print(f"   Price: {price}")
                print(f"   Method: chatgpt_research")
                print()

    print("✅ This would give us REAL competitor titles from actual retailers!")
    print("🔑 To enable this: Configure OpenAI API key in settings")

if __name__ == "__main__":
    demo_chatgpt_competitor_research()