"""
Optimized AI Extractor with Concurrent Processing and Advanced Caching
PERFORMANCE IMPROVEMENTS:
- Concurrent API requests using asyncio
- Smart caching to avoid repeated requests
- Batch processing optimization
- Reduced rate limiting delays
- Connection pooling for better performance
"""
import asyncio
import json
import re
import logging
import time
from typing import Dict, List, Any, Optional, Union
import aiohttp
import hashlib
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

from config.settings import get_settings
from config.collections import get_collection_config, CollectionConfig
from core.google_apps_script_manager import google_apps_script_manager
from core.cache_manager import cache_manager

logger = logging.getLogger(__name__)

class OptimizedAIExtractor:
    """High-performance AI extractor with concurrent processing and smart caching"""

    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.OPENAI_API_KEY

        # Performance settings
        self.max_concurrent_requests = getattr(self.settings, 'MAX_CONCURRENT_AI_REQUESTS', 5)
        self.request_timeout = getattr(self.settings, 'AI_REQUEST_TIMEOUT', 30)
        self.cache_ttl = getattr(self.settings, 'AI_CACHE_TTL', 3600)  # 1 hour

        # Reduced rate limiting for better performance
        self.min_request_interval = getattr(self.settings, 'AI_MIN_REQUEST_INTERVAL', 0.2)  # 200ms instead of 1s

        # Connection pool for better performance
        self.connector = None
        self.session = None

        # Cache for expensive operations
        self.url_content_cache = {}
        self.prompt_cache = {}

    async def __aenter__(self):
        """Async context manager entry"""
        self.connector = aiohttp.TCPConnector(
            limit=20,  # Total connection pool size
            limit_per_host=10,  # Per-host connection limit
            ttl_dns_cache=300,  # DNS cache TTL
            use_dns_cache=True,
        )

        timeout = aiohttp.ClientTimeout(total=self.request_timeout)
        self.session = aiohttp.ClientSession(
            connector=self.connector,
            timeout=timeout,
            headers={'Authorization': f'Bearer {self.api_key}'}
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
        if self.connector:
            await self.connector.close()

    def _generate_cache_key(self, prompt: str, url: str = None) -> str:
        """Generate cache key for requests"""
        content = f"{prompt}:{url or ''}"
        return hashlib.md5(content.encode()).hexdigest()

    async def generate_product_content_batch(self, requests: List[Dict]) -> List[Dict]:
        """
        Generate content for multiple products concurrently

        Args:
            requests: List of request dicts with keys:
                - collection_name: str
                - product_data: Dict
                - fields_to_generate: List[str]
                - url: Optional[str]
                - use_url_content: bool

        Returns:
            List of results for each request
        """
        logger.info(f"🚀 Starting concurrent batch processing for {len(requests)} requests")

        async with self:
            # Create semaphore to limit concurrent requests
            semaphore = asyncio.Semaphore(self.max_concurrent_requests)

            # Create tasks for all requests
            tasks = []
            for i, request in enumerate(requests):
                task = self._process_single_request_with_semaphore(semaphore, i, request)
                tasks.append(task)

            # Execute all tasks concurrently
            start_time = time.time()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            end_time = time.time()

            # Process results and handle exceptions
            processed_results = []
            success_count = 0

            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"❌ Request {i} failed: {result}")
                    processed_results.append({
                        'success': False,
                        'error': str(result),
                        'request_index': i
                    })
                else:
                    processed_results.append(result)
                    if result.get('success'):
                        success_count += 1

            logger.info(f"✅ Batch processing complete: {success_count}/{len(requests)} successful in {end_time - start_time:.2f}s")
            return processed_results

    async def _process_single_request_with_semaphore(self, semaphore: asyncio.Semaphore,
                                                   index: int, request: Dict) -> Dict:
        """Process a single request with concurrency control"""
        async with semaphore:
            try:
                return await self._process_single_request_async(index, request)
            except Exception as e:
                logger.error(f"❌ Error processing request {index}: {e}")
                return {
                    'success': False,
                    'error': str(e),
                    'request_index': index
                }

    async def _process_single_request_async(self, index: int, request: Dict) -> Dict:
        """Process a single AI generation request asynchronously"""
        collection_name = request['collection_name']
        product_data = request['product_data']
        fields_to_generate = request['fields_to_generate']
        url = request.get('url')
        use_url_content = request.get('use_url_content', False)

        logger.info(f"🔄 Processing request {index} for {collection_name}")

        # Check cache first
        cache_key = self._generate_cache_key(
            f"{collection_name}:{fields_to_generate}:{json.dumps(product_data, sort_keys=True)}",
            url
        )

        cached_result = cache_manager.get('ai_generation', cache_key)
        if cached_result:
            logger.info(f"💾 Cache hit for request {index}")
            return {
                'success': True,
                'cached': True,
                'request_index': index,
                **cached_result
            }

        # Generate content
        result = await self._generate_with_chatgpt_async(
            collection_name, product_data, url, use_url_content, fields_to_generate
        )

        # Cache successful results
        if result and any(result.values()):
            cache_manager.set('ai_generation', cache_key, result, ttl=self.cache_ttl)
            logger.info(f"💾 Cached result for request {index}")

        return {
            'success': bool(result and any(result.values())),
            'cached': False,
            'request_index': index,
            'generated_content': result or {},
            'collection_name': collection_name,
            'fields_generated': list(result.keys()) if result else []
        }

    async def _generate_with_chatgpt_async(self, collection_name: str, product_data: Dict[str, Any],
                                         url: Optional[str], use_url_content: bool,
                                         fields_to_generate: List[str]) -> Dict[str, str]:
        """Generate content using ChatGPT asynchronously"""

        try:
            # Prepare context (with caching)
            context = await self._prepare_product_context_async(product_data, url, use_url_content)

            if not context:
                logger.warning("No context available for ChatGPT generation")
                return {}

            # Build prompt (with caching)
            prompt = self._build_chatgpt_prompt_cached(collection_name, context, fields_to_generate)

            # Make ChatGPT request
            response = await self._make_chatgpt_request_async(prompt)

            if not response:
                return {}

            # Parse response
            return self._parse_chatgpt_response(response, fields_to_generate)

        except Exception as e:
            logger.error(f"Error in ChatGPT generation: {e}")
            return {}

    async def _prepare_product_context_async(self, product_data: Dict[str, Any],
                                           url: Optional[str], use_url_content: bool) -> str:
        """Prepare product context for ChatGPT asynchronously with caching"""

        context_parts = []

        # Product data context
        if product_data:
            context_parts.append("Product Information:")
            for key, value in product_data.items():
                if value and str(value).strip():
                    context_parts.append(f"- {key}: {value}")

        # URL content (with caching)
        if url and use_url_content:
            cache_key = hashlib.md5(url.encode()).hexdigest()

            # Check cache first
            url_content = cache_manager.get('url_content', cache_key)
            if not url_content:
                # Fetch content asynchronously
                url_content = await self._fetch_url_content_async(url)
                if url_content:
                    cache_manager.set('url_content', cache_key, url_content, ttl=self.cache_ttl)

            if url_content:
                context_parts.append(f"\nProduct Page Content:\n{url_content}")

        return "\n".join(context_parts)

    async def _fetch_url_content_async(self, url: str) -> Optional[str]:
        """Fetch URL content asynchronously"""
        try:
            if not self.session:
                return None

            async with self.session.get(url) as response:
                if response.status == 200:
                    html_content = await response.text()
                    return self._extract_text_from_html(html_content)
                else:
                    logger.warning(f"Failed to fetch URL {url}: {response.status}")
                    return None

        except Exception as e:
            logger.error(f"Error fetching URL {url}: {e}")
            return None

    def _extract_text_from_html(self, html_content: str) -> str:
        """Extract clean text from HTML content"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')

            # Remove scripts and styles
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()

            # Get text and clean it
            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)

            # Limit length to avoid token limits
            return text[:3000]

        except Exception as e:
            logger.error(f"Error extracting text from HTML: {e}")
            return ""

    def _build_chatgpt_prompt_cached(self, collection_name: str, context: str,
                                   fields_to_generate: List[str]) -> str:
        """Build ChatGPT prompt with caching"""

        # Create cache key
        cache_key = hashlib.md5(f"{collection_name}:{fields_to_generate}:{context}".encode()).hexdigest()

        # Check cache
        if cache_key in self.prompt_cache:
            return self.prompt_cache[cache_key]

        # Build prompt
        prompt = self._build_optimized_prompt(collection_name, context, fields_to_generate)

        # Cache prompt
        self.prompt_cache[cache_key] = prompt

        return prompt

    def _build_optimized_prompt(self, collection_name: str, context: str,
                              fields_to_generate: List[str]) -> str:
        """Build optimized prompt for faster processing"""

        # Shorter, more direct prompts for speed
        field_instructions = {
            'features': "Generate exactly 5 concise key features (max 8 words each).",
            'body_html': "Write a compelling 2-3 sentence product description.",
            'care_instructions': "Provide 3-4 essential care tips in bullet points."
        }

        instructions = []
        for field in fields_to_generate:
            if field in field_instructions:
                instructions.append(field_instructions[field])

        prompt = f"""Generate content for a {collection_name} product. Be concise and direct.

CONTEXT:
{context[:1500]}  # Limit context for speed

GENERATE:
{chr(10).join(instructions)}

RESPONSE FORMAT (JSON only):
{{
{chr(10).join(f'  "{field}": "..."' for field in fields_to_generate)}
}}

IMPORTANT: Return only valid JSON. No explanations."""

        return prompt

    async def _make_chatgpt_request_async(self, prompt: str, max_retries: int = 2) -> Optional[str]:
        """Make ChatGPT request asynchronously with retries"""

        if not self.session:
            logger.error("No HTTP session available")
            return None

        chatgpt_model = getattr(self.settings, 'CHATGPT_MODEL', 'gpt-4o-mini')  # Use faster model

        payload = {
            'model': chatgpt_model,
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are a product content generator. Return only valid JSON responses.'
                },
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            'max_tokens': 800,  # Reduced for speed
            'temperature': 0.3,  # Lower for consistency and speed
        }

        for attempt in range(max_retries + 1):
            try:
                # Rate limiting (much reduced)
                if attempt > 0:
                    await asyncio.sleep(min(0.5 * attempt, 2.0))  # Progressive backoff
                else:
                    await asyncio.sleep(self.min_request_interval)

                async with self.session.post(
                    'https://api.openai.com/v1/chat/completions',
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                ) as response:

                    if response.status == 200:
                        data = await response.json()
                        content = data['choices'][0]['message']['content'].strip()
                        return content

                    elif response.status == 429:  # Rate limit
                        if attempt < max_retries:
                            wait_time = 2 ** attempt  # Exponential backoff
                            logger.warning(f"Rate limit hit, waiting {wait_time}s...")
                            await asyncio.sleep(wait_time)
                            continue
                        else:
                            logger.error("Max retries reached for rate limit")
                            return None

                    else:
                        error_text = await response.text()
                        logger.error(f"ChatGPT API error {response.status}: {error_text}")
                        return None

            except asyncio.TimeoutError:
                logger.warning(f"Request timeout (attempt {attempt + 1})")
                if attempt == max_retries:
                    return None

            except Exception as e:
                logger.error(f"ChatGPT request error (attempt {attempt + 1}): {e}")
                if attempt == max_retries:
                    return None

        return None

    def _parse_chatgpt_response(self, response: str, fields_to_generate: List[str]) -> Dict[str, str]:
        """Parse ChatGPT JSON response with better error handling"""
        try:
            # Clean response
            response = response.strip()
            if response.startswith('```json'):
                response = response[7:]
            if response.endswith('```'):
                response = response[:-3]

            # Parse JSON
            parsed = json.loads(response)

            result = {}
            for field in fields_to_generate:
                if field in parsed and parsed[field]:
                    content = str(parsed[field]).strip()
                    if content and content != "...":
                        if field == 'features':
                            # Validate feature count
                            content = self._validate_feature_count(content)
                        result[field] = content

            return result

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            # Try to extract content with regex as fallback
            return self._parse_response_with_regex(response, fields_to_generate)

        except Exception as e:
            logger.error(f"Error parsing ChatGPT response: {e}")
            return {}

    def _parse_response_with_regex(self, response: str, fields_to_generate: List[str]) -> Dict[str, str]:
        """Fallback parser using regex"""
        result = {}

        for field in fields_to_generate:
            # Try to find field content with regex
            patterns = [
                f'"{field}"\\s*:\\s*"([^"]+)"',
                f'{field}\\s*:\\s*"([^"]+)"',
                f'{field}\\s*:\\s*([^\\n]+)'
            ]

            for pattern in patterns:
                match = re.search(pattern, response, re.IGNORECASE)
                if match:
                    content = match.group(1).strip()
                    if content and content != "...":
                        result[field] = content
                    break

        return result

    def _validate_feature_count(self, features_text: str, target_count: int = 5) -> str:
        """Ensure exactly 5 features are generated"""
        try:
            # Split features by common separators
            separators = ['\n', '•', '-', '1.', '2.', '3.', '4.', '5.']
            features = [features_text]

            for sep in separators:
                if sep in features_text:
                    features = [f.strip() for f in features_text.split(sep) if f.strip()]
                    break

            # Clean features
            features = [f.strip('123456789.-• ') for f in features if f.strip()]
            features = [f for f in features if len(f) > 5]  # Remove very short features

            # Ensure exactly target_count features
            if len(features) < target_count:
                # Pad with generic features
                generic_features = [
                    "Premium quality construction",
                    "Easy installation process",
                    "Durable and long-lasting",
                    "Professional grade finish",
                    "Reliable performance"
                ]
                while len(features) < target_count:
                    features.append(generic_features[len(features) % len(generic_features)])

            elif len(features) > target_count:
                # Take first target_count features
                features = features[:target_count]

            return '\n'.join(f"• {feature}" for feature in features)

        except Exception as e:
            logger.error(f"Error validating features: {e}")
            return features_text

    # ==================== HIGH-LEVEL API METHODS ====================

    async def generate_descriptions_batch(self, products: List[Dict]) -> List[Dict]:
        """Generate descriptions for multiple products concurrently"""
        requests = []

        for product in products:
            requests.append({
                'collection_name': product['collection_name'],
                'product_data': product['product_data'],
                'fields_to_generate': ['body_html', 'care_instructions'],
                'url': product.get('url'),
                'use_url_content': product.get('use_url_content', False)
            })

        return await self.generate_product_content_batch(requests)

    async def generate_features_batch(self, products: List[Dict]) -> List[Dict]:
        """Generate features for multiple products concurrently"""
        requests = []

        for product in products:
            requests.append({
                'collection_name': product['collection_name'],
                'product_data': product['product_data'],
                'fields_to_generate': ['features'],
                'url': product.get('url'),
                'use_url_content': product.get('use_url_content', False)
            })

        return await self.generate_product_content_batch(requests)

    async def generate_single_product_fast(self, collection_name: str, product_data: Dict,
                                         fields_to_generate: List[str], url: str = None,
                                         use_url_content: bool = False) -> Dict:
        """Generate content for a single product with optimized performance"""

        requests = [{
            'collection_name': collection_name,
            'product_data': product_data,
            'fields_to_generate': fields_to_generate,
            'url': url,
            'use_url_content': use_url_content
        }]

        results = await self.generate_product_content_batch(requests)
        return results[0] if results else {'success': False, 'error': 'No result generated'}

# ==================== HELPER FUNCTIONS ====================

async def create_optimized_extractor():
    """Create and return an optimized AI extractor instance"""
    return OptimizedAIExtractor()

def get_optimized_ai_extractor():
    """Get optimized AI extractor instance (for compatibility)"""
    return OptimizedAIExtractor()