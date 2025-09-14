import requests
from bs4 import BeautifulSoup

url = "https://www.argentaust.com.au/villeroy-boch-sinks-under-mount-no-drainer-subway-xu-545-1-13-under-counter-sink-no-tap-hole-alpine"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
r = requests.get(url, headers=headers, timeout=30)
html = r.text

# Check if content is there
print("HTML length:", len(html))
if "Villeroy" in html or "Subway" in html:
    print("✅ Page content loaded.")
else:
    print("⚠️ Page content NOT loaded—likely needs JavaScript.")

# Optional: Pretty print snippet
soup = BeautifulSoup(html, "html.parser")
print(soup.prettify()[:2000])

