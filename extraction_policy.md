# Extraction Policy & Guidelines

## Objective
To extract **business-related** offers and requests from meeting transcripts, prioritizing **verbatim message content** and **strict sender attribution**. The goal is to capture the raw intent and context of the user, not to summarize it into a generic bullet point.

## 1. Definitions

### What is an OFFER?
- **Explicit** provision of a service, product, or resource.
- **Sharing** of a business-relevant link (portfolio, calendar, website) with context.
- **Volunteering** to facilitate a connection or introduction.
- **Content Rule:** The extraction description must include the specific details, links, and context provided by the user. Do count "I can help with SEO, here is my link" as an offer.
- **Format:** "Original message content or detailed paraphrase including all links and key specifics."

### What is a REQUEST?
- **Explicit** need for a service, product, or resource.
- **Asking** for a connection, introduction, or specific advice.
- **Content Rule:** Capture the full scope of the request. "Looking for a lawyer in NY for a real estate deal" is better than "Legal help needed".

### What is NOISE (Must Filter)?
- **Salutations/Exchanges:** "Hi everyone", "Thanks", "Great session", "Yes", "No".
- **Jokes/Banter:** "Haha", "I need a coffee", "Don't tell my boss".
- **Logistics:** "Can you hear me?", "I'm on mute", "Recording started".
- **Vague/Passive inputs:** "Interested" (without saying in what), "Me too" (unless directly threading to an offer, but usually noise).
- **Repetitive confirmations:** "Yes", "Yep", "Totally" in response to a speaker are noise.

## 2. Extraction Strategy

### A. Pre-processing
1.  **Parse & Clean:** Convert raw zoom format (`HH:MM:SS From X to Everyone: Msg`) to structured objects.
2.  **Deduplication:** Remove identical consecutive messages.

### B. LLM Prompting Guidelines
To achieve high-quality extraction, the LLM prompt must follow these principles:

1.  **Persona Assignment:**
    > "You are an expert Data Analyst. Your goal is to capture value from chat logs by extracting offers and requests exactly as they were stated."

2.  **Attribution (CRITICAL):**
    - The transcript provides explicit "From [Name]" fields. 
    - **NEVER** return "Unattributed" if a name is present in the line.
    - Trust the "From" field implicitly.
    - If the message says "From Pace Morby to Everyone: link...", the sender is "Pace Morby".

3.  **Description Quality:**
    - **Do NOT Summarize:** Do not convert "I have a deal in Texas looking for buyers, hit me up at 555-0199" into "Real estate deal".
    - **Preserve Detail:** Keep the phone numbers, emails, and specific locations in the description.
    - **Preserve Links:** If a link is shared, include it in the description (or separate field), but ensure the context of *why* it was shared remains.

### 4. Cleaned Transcript Formatting
- **Format:** The cleaned transcript MUST mirror the original Zoom input format:
  `HH:MM:SS From [Name] to Everyone: [Message]`
- **Content:** It should contain ONLY valid offers/requests and contextually relevant conversation, strictly identifying and removing "Noise" (jokes, spam, pure chatter).
- **Presentation:** In the UI, this should be presented similarly to the raw transcript but "cleaned".

## 5. Performance & Speed
- **Parallelization:** Independent LLM tasks (e.g., Intent Analysis and Summarization) MUST run in parallel to reduce total processing time.
- **Optimization:** Use efficient regex for initial parsing and single-pass LLM prompts where possible.

### C. Contact Attribution Rules
- **Hard Attribute:** The "From" name is the primary source of truth.
- **Regex Fallback:** If the message contains an email/phone different from the sender's profile (e.g., posting on behalf of someone), note it, but primarily attribute to the sender.

## 3. Improvements
- [ ] Prompt: explicitly instruct to "preserve original message text" for the description.
- [ ] Prompt: Punishment for "Unattributed" when names are available.
