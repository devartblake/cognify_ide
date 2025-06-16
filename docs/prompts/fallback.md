# AI Quota Fallback Strategy

Whenever one of our AI agents returns a **rate‐limit error (HTTP 429)** or fails due to quota, we:

1. **Detect & Parse the Error**
   - Look for `error.code == 429` or `error.message` containing “quota”/“rate limit” in the CLI response.

2. **Rotation Sequence**
   1. **Primary** → GPT-4‐turbo (Plus tier)
   2. **Secondary** → Gemini CLI (Free tier)
   3. **Tertiary** → Bolt CLI (Free tier)

   After a 429 from one, retry the **same prompt** against the next agent in the list.

3. **Back-off & Retry**
   - On any 429, wait **2 seconds** and retry the same agent once more before rotating.
   - Log each fallback in `logs/ai_fallback.log` with timestamp, agent name, and error.

4. **User-Friendly Error**
   - If *all* agents fail, surface a consistent message in the IDE:
     > “AI services are temporarily unavailable. Please try again in a few minutes.”

5. **Cached Responses**
   - For repetitive prompts (e.g. CI-YAML scaffolding), cache successful output in `./.cache/` keyed by prompt-hash.
   - On any fallback or quota error, first check the cache and return a hit if available.

6. **Example Fallback Flow**
   ```text
   [GPT4] → 429 Quota
   delay 2s → retry GPT4 → 429
   [Gemini] → success
