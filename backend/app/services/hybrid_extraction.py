import re
import logging
import asyncio
from typing import List, Dict, Set, Optional, Tuple
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from app.core.config import settings

# --- Logging ---
logger = logging.getLogger(__name__)

# --- Pydantic Models ---
class CleanedMessage(BaseModel):
    id: int = Field(description="Index of the message")
    sender: str
    message: str
    timestamp: Optional[str] = None

class ExtractedContact(BaseModel):
    name: str = Field(description="Full name of the person")
    email: Optional[str] = Field(None, description="Email address if found")
    phone: Optional[str] = Field(None, description="Phone number if found")
    role: Optional[str] = Field(None, description="Job title or role if mentioned")

class ExtractedService(BaseModel):
    type: str = Field(description="Either 'offer' or 'request'")
    description: str = Field(description="Concise description of the offer or request")
    contact_name: str = Field(description="Name of the person associated with this service")
    links: List[str] = Field(default_factory=list, description="URLs mentioned")

class MeetingSummary(BaseModel):
    summary: str = Field(description="A concise summary of the meeting discussion (3-5 sentences).")
    key_topics: List[str] = Field(description="List of key topics discussed.")

class IntentAnalysis(BaseModel):
    services: List[ExtractedService] = Field(description="List of extracted offers and requests")
    noise_message_ids: List[int] = Field(description="List of message IDs (indices) that are irrelevant noise, jokes, or pure chatter")

class ExtractedMeetingData(BaseModel):
    contacts: List[ExtractedContact]
    services: List[ExtractedService]
    summary: MeetingSummary
    cleaned_transcript: List[CleanedMessage] = Field(default_factory=list, description="Structured parsed messages (filtered)")

# --- Regex Patterns ---
PHONE_REGEX = r'\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}'
EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
URL_REGEX = r'(https?://[^\s]+)'

# Zoom Pattern: [Timestamp] From [Name] to Everyone: [Message]
# Group 1: Timestamp (including date if present)
# Group 2: Sender Name
# Group 3: Message Content
ZOOM_MSG_PATTERN = re.compile(r'((?:\d{4}-\d{2}-\d{2}\s+)?\d{1,2}:\d{2}(?::\d{2})?)\s+From\s+(.+?)\s+to\s+Everyone:\s*(.*)', re.IGNORECASE)

def clean_description(text: str) -> str:
    """Removes URLs and extra whitespace."""
    text = re.sub(URL_REGEX, '', text)
    return text.strip()

def parse_transcript_lines(text: str) -> List[CleanedMessage]:
    """Parses raw text into structured messages. Handles multi-line messages."""
    lines = text.split('\n')
    parsed = []
    idx = 0
    current_msg = None

    for line in lines:
        match = ZOOM_MSG_PATTERN.search(line)
        if match:
            # If we were building a previous message, save it
            if current_msg:
                parsed.append(current_msg)
            
            timestamp = match.group(1).strip()
            sender = match.group(2).strip()
            # The message might start on this line or be empty
            initial_msg = match.group(3).strip()
            
            current_msg = CleanedMessage(id=idx, sender=sender, message=initial_msg, timestamp=timestamp)
            idx += 1
        elif current_msg:
            # Strict multi-line handling: append to current message if it's not a new timestamp header
            cleaned_line = line.strip()
            if cleaned_line:
                current_msg.message += " " + cleaned_line

    if current_msg:
        parsed.append(current_msg)
        
    return parsed

def extract_hard_contact_info(messages: List[CleanedMessage]) -> Dict[str, Dict]:
    """Pass 1: Regex extraction of Phone, Email, Links from structured messages."""
    contacts_map: Dict[str, Dict] = {} # Name -> {email, phone, links}

    for m in messages:
        sender = m.sender
        text = m.message
        
        if sender not in contacts_map:
            contacts_map[sender] = {"email": None, "phone": None, "links": set()}

        # Check combined text (Name + Message)
        combined = f"{sender} {text}"
        
        phones = re.findall(PHONE_REGEX, combined)
        emails = re.findall(EMAIL_REGEX, combined)
        urls = re.findall(URL_REGEX, combined)

        if phones and not contacts_map[sender]["phone"]:
            contacts_map[sender]["phone"] = phones[0]
        if emails and not contacts_map[sender]["email"]:
            contacts_map[sender]["email"] = emails[0]
        for url in urls:
            contacts_map[sender]["links"].add(url)
            
    return contacts_map

def chunk_messages(messages: List[CleanedMessage], chunk_size: int = 50) -> List[List[CleanedMessage]]:
    """Splits messages into chunks for parallel processing. Smaller chunks = faster individual calls."""
    return [messages[i:i + chunk_size] for i in range(0, len(messages), chunk_size)]

# LLM call timeout in seconds
LLM_TIMEOUT_SECONDS = 60

async def analyze_chunk(messages_chunk: List[CleanedMessage], chunk_index: int) -> IntentAnalysis:
    """Analyzes a single chunk of messages."""
    if not settings.OPENROUTER_API_KEY:
        return IntentAnalysis(services=[], noise_message_ids=[])

    try:
        llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.OPENROUTER_API_KEY,
            base_url=settings.OPENROUTER_BASE_URL,
            temperature=0,
            request_timeout=120
        )
        structured_llm = llm.with_structured_output(IntentAnalysis)

        # Prepare text for this chunk
        transcript_text = "\n".join([f"[{m.id}] {m.sender}: {m.message}" for m in messages_chunk])

        prompt = f"""
        # Role
        You are an expert Data Analyst. Your goal is to capture value from chat logs by extracting offers and requests EXACTLY as they were stated.

        # Definitions
        1. **OFFER**: Explicit provision of a service, product, or professional resource.
           - INCLUDES: "I am a buyer", "I have capital to deploy", "I am a TC", "I am a transaction coordinator", "I have a deal in Texas", "I can help you...", "We are buying".
           - EXCLUDES: Jokes ("I offer my soul"), vague interest ("Me too"), or personal non-business non-offers.
        2. **REQUEST**: Explicit need for a business service, product, connection, OR **specific questions** about business topics/strategy.
           - INCLUDES: "Looking for a React dev", "Need a lawyer", "How do I structure a wrap?", "What is a lease option?", "Who wants this deal?", "What are your funding requirements?".
           - EXCLUDES: Rhetorical questions, personal banter.
        3. **NOISE**: Salutations ("Hi"), Jokes ("Haha"), Logistics ("Can you hear me?"), Vague comments ("Interested", "Yes", "Agreed", "Nope").

        # Critical Guidelines
        1. **BIAS TOWARDS EXTRACTION**:
           - If a message *might* be a business offer or request, extract it. Do not discard potential value.

        2. **ATTRIBUTION IS MANDATORY**: 
           - You MUST attribute the offer/request to the name in the "From [Name]" field.
           - NEVER use "Unattributed" if a name is present.
        
        2. **PRESERVE DETAIL (Do Not Summarize)**:
           - The user wants the ORIGINAL CONTEXT in the description.
           - Do not shorten "I have a deal in Texas looking for buyers, hit me up at 555-0199" to "Real estate deal". Keep the phone number!
           - EXTRACT THE FULL RELEVANT SENTENCE/PARAGRAPH.

        # Task
        Analyze the refined transcript chunk below.
        1. Identify EVERY message that is a clear Business Offer or Request.
        2. Identify EVERY message ID that is Noise (jokes, greetings, irrelevant chatter).
        3. For valid Offers/Requests, extract:
           - Type (offer/request)
           - Description: The VERBATIM (or slightly cleaned) message content preserving all links and details.
           - Sender Name: The exact name from the "From" field.

        <transcript_chunk index="{chunk_index}">
        {transcript_text}
        </transcript_chunk>
        """
        
        logger.info(f"Analyzing chunk {chunk_index} ({len(messages_chunk)} messages)...")
        result = await structured_llm.ainvoke(prompt)
        logger.info(f"Chunk {chunk_index} analysis complete.")
        return result

    except Exception as e:
        logger.error(f"LLM Chunk Analysis Failed (Chunk {chunk_index}): {e}")
        return IntentAnalysis(services=[], noise_message_ids=[])

class ValidationResult(BaseModel):
    is_valid: bool = Field(description="True if this is a legitimate business offer/request.")
    reason: str = Field(description="Reason for invalidity if False.")

class ValidatedServiceList(BaseModel):
    results: List[ValidationResult]

async def validate_services(services: List[ExtractedService]) -> List[ExtractedService]:
    """Stage 2: Relevance Validator. Filters out non-business items."""
    if not services or not settings.OPENROUTER_API_KEY:
        return services

    # Batch process all services
    # We send them to LLM to check validity
    try:
        llm = ChatOpenAI(
            model=settings.LLM_MODEL, # Use same model or cheaper one
            api_key=settings.OPENROUTER_API_KEY,
            base_url=settings.OPENROUTER_BASE_URL,
            temperature=0
        )
        structured_llm = llm.with_structured_output(ValidatedServiceList)
        
        items_text = "\n".join([f"{i}. [{s.type.upper()}] {s.description}" for i, s in enumerate(services)])
        
        prompt = f"""
        You are a STRICT Quality Control Validator for a Real Estate & Creative Finance Business Database.
        Your job is to REJECT anything that is NOT a clear, actionable business offer or request.
        
        === VALID (Keep) ===
        - Offers of capital, lending, services, deals, properties
        - Looking for buyers, sellers, lenders, TCs, contractors
        - "I have $500k to deploy", "Looking for SFH in Texas", "I'm a TC", "We fund deals"
        
        === INVALID (Reject) ===
        - Personal comments, jokes, banter: "I asked to be sued", "BEING CORRECT", "haha", "lol"
        - Vague or incomplete: "Interested", "Me too", "Yes", "No", "Agreed", "Same"
        - Logistical: "Can you hear me?", "Check your email", "Sent DM", "Call me"
        - Emojis only or emoji-heavy without business content
        - Self-references without business value: "I'm here", "Hey everyone", "Good morning"
        - Anything that does NOT offer or request a specific business service/product/deal
        
        === RULE ===
        If you're unsure whether something is business-related, REJECT it. Be strict.
        The description must contain a SPECIFIC service, product, deal, or professional offering.
        
        Items to Validate:
        {items_text}
        
        Return a list of validation results matching the order of input items.
        """
        
        res = await structured_llm.ainvoke(prompt)
        
        validated_services = []
        if res and len(res.results) == len(services):
            for i, result in enumerate(res.results):
                if result.is_valid:
                    validated_services.append(services[i])
                else:
                    logger.info(f"Validator Dropped: {services[i].description} (Reason: {result.reason})")
        else:
            logger.warning("Validator returned mismatched count or failed. Keeping all.")
            return services
            
        return validated_services
        
    except Exception as e:
        logger.error(f"Validator Failed: {e}")
        return services

async def extract_summary_with_llm(text: str) -> MeetingSummary:
    """Pass 3: Summary Generation."""
    if not settings.OPENROUTER_API_KEY:
        return MeetingSummary(summary="No API Key.", key_topics=[])

    try:
        llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.OPENROUTER_API_KEY,
            base_url=settings.OPENROUTER_BASE_URL,
            temperature=0
        )
        structured_llm = llm.with_structured_output(MeetingSummary)
        prompt = f"Summarize this meeting transcript (max 15000 chars):\n{text[:15000]}"
        
        logger.info("Generating Summary...")
        return await structured_llm.ainvoke(prompt)
    except Exception as e:
        logger.error(f"Summary Generation Failed: {e}")
        return MeetingSummary(summary="Failed.", key_topics=[])

async def extract_meeting_data(text: str) -> ExtractedMeetingData:
    logger.info("Starting Hybrid Extraction...")
    
    # 1. Parse Messages
    raw_messages = parse_transcript_lines(text)
    if not raw_messages:
        logger.warning("No messages parsed from transcript! Check date format or regex.")
    logger.info(f"Parsed {len(raw_messages)} raw messages.")
    
    # 2. Extract Hard Contact Info (Deterministic)
    contacts_map = extract_hard_contact_info(raw_messages)
    
    # 3. LLM Intent Analysis (Parallel Chunks) + Summary
    logger.info("Starting Parallel LLM Tasks...")
    
    # Chunking - use smaller chunks configured above
    chunks = chunk_messages(raw_messages)  # Uses default 50 msg chunks
    logger.info(f"Split transcript into {len(chunks)} chunks for parallel analysis.")
    
    # Create semaphore to limit concurrency (increased for faster processing)
    sem = asyncio.Semaphore(8)

    async def protected_analyze_chunk(chunk, i):
        """Analyze chunk with timeout and semaphore protection."""
        async with sem:
            try:
                return await asyncio.wait_for(
                    analyze_chunk(chunk, i),
                    timeout=LLM_TIMEOUT_SECONDS
                )
            except asyncio.TimeoutError:
                logger.warning(f"Chunk {i} timed out after {LLM_TIMEOUT_SECONDS}s, skipping...")
                return IntentAnalysis(services=[], noise_message_ids=[])
            except Exception as e:
                logger.error(f"Chunk {i} failed: {e}")
                return IntentAnalysis(services=[], noise_message_ids=[])

    # Create tasks
    intent_tasks = [protected_analyze_chunk(chunk, i) for i, chunk in enumerate(chunks)]
    
    # Summary also gets a timeout
    async def protected_summary():
        try:
            return await asyncio.wait_for(
                extract_summary_with_llm(text),
                timeout=LLM_TIMEOUT_SECONDS * 2  # Summary gets more time
            )
        except asyncio.TimeoutError:
            logger.warning("Summary generation timed out")
            return MeetingSummary(summary="Summary generation timed out.", key_topics=[])
    
    summary_task = protected_summary()
    
    # Run all in parallel
    results = await asyncio.gather(*intent_tasks, summary_task, return_exceptions=True)
    
    # Separate results
    chunk_results = results[:-1]
    summary = results[-1]
    
    # Merge Intent Analysis Results
    all_services = []
    all_noise_ids = set()
    
    for res in chunk_results:
        if isinstance(res, IntentAnalysis):
            all_services.extend(res.services)
            all_noise_ids.update(res.noise_message_ids)
    
    logger.info(f"Merged Parallel Results: {len(all_services)} services, {len(all_noise_ids)} noise items.")

    # 3.5 Stage 2: Relevance Validator
    logger.info("Running Relevance Validator...")
    all_services = await validate_services(all_services)
    logger.info(f"Post-Validation Services: {len(all_services)}")

    # 4. Strict Regex Noise Filter (Post-Processing)
    # Catches short "Yes/No/Lol" messages that LLM might miss or classify as "Chat" instead of "Noise"
    # Regex for short conversational fillers. Includes optional punctuation/whitespace.
    STRICT_NOISE_REGEX = re.compile(r'^\W*(yes|no|nope|nah|yeah|yep|yup|ok|okay|thx|thanks|thank you|lol|lmao|haha|right|correct|sure|agreed|absolutely|less|more|same|me too|details\?)\W*$', re.IGNORECASE)
    
    for m in raw_messages:
        # If it's already marked as noise, skip
        if m.id in all_noise_ids:
            continue
            
        clean_content = m.message.strip()
        
        # Check if it looks like contact info (don't delete phones/emails)
        has_contact_info = re.search(PHONE_REGEX, clean_content) or re.search(EMAIL_REGEX, clean_content)
        
        if not has_contact_info:
            # If extremely short (< 20 chars) and matches noise words
            if len(clean_content) < 20 and STRICT_NOISE_REGEX.search(clean_content):
                 all_noise_ids.add(m.id)
            # Also filter single emojis/punctuation if needed, but the regex above covers common words
    
    # 5. Filter Transcript (Remove Noise)
    final_transcript = [m for m in raw_messages if m.id not in all_noise_ids]
    
    # 5. Build Final Contacts List
    final_contacts = []
    for name, info in contacts_map.items():
        has_service = any(s.contact_name == name for s in all_services)
        has_contact_data = info["email"] or info["phone"]
        
        if has_service or has_contact_data:
            final_contacts.append(ExtractedContact(
                name=name,
                email=info["email"],
                phone=info["phone"],
                role=None
            ))
            
    logger.info("Extraction Complete.")
    
    return ExtractedMeetingData(
        contacts=final_contacts,
        services=all_services,
        summary=summary,
        cleaned_transcript=final_transcript
    )

