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



# Role Identifiers Map
ROLES_MAP = {
    "TC": "Transaction Coordinator",
    "TTTC": "Top Tier Transaction Coordinator",
    "TTC": "Transaction Coordinator",
    "Gator": "Gator Lender",
    "🐊": "Gator Lender",
    "Subto": "Subto Student",
    "✌️": "Subto Student",
    "✌🏼": "Subto Student",
    "✌🏽": "Subto Student",
    "✌🏾": "Subto Student",
    "✌": "Subto Student",
    "OC": "Owners Club",
    "Bird Dog": "Bird Dog",
    "BirdDog": "Bird Dog",
    "🐕": "Bird Dog",
    "🐶": "Bird Dog",
    "🐦": "Bird Dog",
    "DTS": "Direct To Seller",
    "DTA": "Direct To Agent",
    "ZD": "Zero Down Business",
    "ZDB": "Zero Down Business",
    "Zero Down": "Zero Down Business"
}



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

def extract_roles(text: str) -> List[str]:
    """Extracts known roles from text using emoji/keyword mapping."""
    found_roles = set()
    for marker, role_name in ROLES_MAP.items():
        if marker in text or marker.lower() in text.lower():
            # Basic check, can be improved with regex strict word boundary for text terms
            # For specific short acronyms like TC/OC/ZD be careful of substrings
            # Emojis are safe.
            if len(marker) > 2 and marker.isascii() and marker.isalpha():
                 # Word boundary check for text codes
                 if re.search(r'\b' + re.escape(marker) + r'\b', text, re.IGNORECASE):
                     found_roles.add(role_name)
            else:
                 # Symbols or short codes, strict check or loose?
                 # Emojis just loose check
                 if not marker.isascii():
                     if marker in text:
                         found_roles.add(role_name)
                 else:
                     # Short ASCII codes like TC, OC
                     if re.search(r'\b' + re.escape(marker) + r'\b', text): # Case sensitive for TC? Or ignore case?
                         found_roles.add(role_name)
    return list(found_roles)

def extract_hard_contact_info(messages: List[CleanedMessage]) -> Dict[str, Dict]:
    """Pass 1: Regex extraction of Phone, Email, Links AND Roles from structured messages."""
    contacts_map: Dict[str, Dict] = {} # Name -> {email, phone, links, roles}

    for m in messages:
        sender = m.sender
        text = m.message
        
        if sender not in contacts_map:
            contacts_map[sender] = {"email": None, "phone": None, "links": set(), "roles": set()}

        # Check combined text (Name + Message) for contacts AND roles
        combined = f"{sender} {text}"
        
        phones = re.findall(PHONE_REGEX, combined)
        emails = re.findall(EMAIL_REGEX, combined)
        urls = re.findall(URL_REGEX, combined)
        
        # Extract roles from sender name AND message
        roles_in_sender = extract_roles(sender)
        roles_in_msg = extract_roles(text)
        
        contacts_map[sender]["roles"].update(roles_in_sender)
        contacts_map[sender]["roles"].update(roles_in_msg)

        if phones and not contacts_map[sender]["phone"]:
            contacts_map[sender]["phone"] = phones[0]
        if emails and not contacts_map[sender]["email"]:
            contacts_map[sender]["email"] = emails[0]
        for url in urls:
            contacts_map[sender]["links"].add(url)
            
    return contacts_map

# chunk_messages removed, handled by graph node now

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
        2. Identify EVERY message ID that is Noise (jokes, greetings, irrelevant chatter, poll responses).
        3. For valid Offers/Requests, extract:
           - Type (offer/request)
           - Description: The VERBATIM (or slightly cleaned) message content preserving all links and details.
           - Sender Name: The exact name from the "From" field.

        # Role Identifiers (IMPORTANT)
        The following symbols/acronyms indicate specific roles. If seen in the name or message, they are VALUABLE context, not noise.
        - 🐊 / Gator -> Gator Lender
        - ✌️ / Subto -> Subto Student
        - 🐕 / 🐦 / Bird Dog -> Bird Dog
        - TC / TTTC -> Transaction Coordinator
        - OC -> Owners Club
        - ZDB / Zero Down -> Zero Down Business
        
        Do NOT treat a message as noise if it contains these symbols AND contact info/offers, even if short.
        HOWEVER, if a message is ONLY a symbol (e.g. just "✌️") with no other text, it IS noise/preach.

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
        You are a Quality Control Validator for a Real Estate & Creative Finance Database.
        Your job is to keep REAL business offers/requests and REJECT noise/spam.
        
        === VALID (Keep) - Real business value ===
        - TC Offers: "I'm a Top Tier Transaction Coordinator", "Let our team make sure you make it to closing"
        - Lender Offers: "I can fund your deals with hard money and DSCR loans", "I have capital to deploy"
        - Buyer Offers: "We are buying in Atlanta", "Looking for deals under $500k", "Nashville seller, who wants it, SFH?"
        - Service Offers: "Bird dog service: off-market outreach → qualified lead", "I do title work"
        - Specific Requests: "I am looking for a TC to join my team in Idaho", "Need a lender for a $200k deal"
        - Deal Posts: "I have a lead in Rock Springs Wyoming that really wants to sell"
        
        === INVALID (Reject) - Common noise patterns ===
        - One-word responses: "Less", "Nope", "Yes", "Guilty", "Same", "Mine", "True", "Me", "No"
        - Poll responses: "1", "2", "3" (answering polls without business context)
        - Social chatter: "Good morning", "Happy Saturday", "Love this", "So true", "Heck yeah!"
        - Blinq-only: "https://blinq.me/..." without any offer/request context
        - Reactions/agreements: "🔥", "❤️", "Me too", "Count me in", "Amen"
        - Vague connection requests: "would like to connect", "let's connect", "sent you my blinq" (without business context)
        - Off-topic discussion: Marriage advice, jokes, personal comments, logistics
        - Duplicate spam: Same message posted 3+ times by same person (keep only first)
        
        === GRAY AREA (Use judgment) ===
        - "Let's connect [blinq link]" after stating a service → KEEP (the service is the value)
        - "Happy to help! [blinq]" without specifics → REJECT (too vague)
        - "I'm a buyer in TX, let's connect" → KEEP (buyer offer with location)
        - "Anyone doing wholesaling?" → REJECT (learning question, not deal request)
        
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



