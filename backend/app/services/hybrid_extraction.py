"""
Hybrid Extraction Module

This module handles AI-powered extraction of contacts, services, and meeting summaries
from Zoom chat transcripts. It combines regex-based extraction with LLM analysis.

Key Components:
- Regex extraction for hard contacts (phone, email, links, roles)
- LLM-based intent analysis for offers/requests
- LLM-based validation to filter noise
- LLM-based summary generation
"""
import re
import logging
from typing import List, Dict, Set, Optional
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.llm_factory import get_structured_llm, invoke_with_retry

logger = logging.getLogger(__name__)


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class CleanedMessage(BaseModel):
    """A parsed message from the transcript."""
    id: int = Field(description="Index of the message")
    sender: str
    message: str
    timestamp: Optional[str] = None


class ExtractedContact(BaseModel):
    """Contact information extracted from transcript."""
    name: str = Field(description="Full name of the person")
    email: Optional[str] = Field(None, description="Email address if found")
    phone: Optional[str] = Field(None, description="Phone number if found")
    role: Optional[str] = Field(None, description="Job title or role if mentioned")


class ExtractedService(BaseModel):
    """An offer or request extracted from the transcript."""
    type: str = Field(description="Either 'offer' or 'request'")
    description: str = Field(description="Concise description of the offer or request")
    contact_name: str = Field(description="Name of the person associated with this service")
    links: List[str] = Field(default_factory=list, description="URLs mentioned")


class BuyBox(BaseModel):
    """Structured buy box criteria."""
    min_price: Optional[float] = Field(None, description="Minimum target price")
    max_price: Optional[float] = Field(None, description="Maximum target price")
    assets: List[str] = Field(default_factory=list, description="Target asset classes e.g. 'Multifamily', 'SFH'")
    markets: List[str] = Field(default_factory=list, description="Target markets/locations e.g. 'Texas', 'Atlanta'")
    strategy: List[str] = Field(default_factory=list, description="Strategies e.g. 'Buy & Hold', 'Fix & Flip'")
    description: Optional[str] = Field(None, description="Full description of the buy box")


class SocialLink(BaseModel):
    """A social media profile link."""
    platform: str = Field(description="Platform name e.g. 'Twitter', 'LinkedIn', 'Instagram', 'Blinq'")
    url: str = Field(description="Full URL to the profile")


class ExtractedProfile(BaseModel):
    """Rich contact profile information."""
    name: str = Field(description="Name of the person")
    # Core
    email: Optional[str] = None
    phone: Optional[str] = None
    role_tags: List[str] = Field(default_factory=list, description="Explicit roles e.g. 'Investor', 'Wholesaler'")
    
    # Rich fields
    communities: List[str] = Field(default_factory=list, description="Communities they belong to e.g. 'Subto', 'Gator'")
    asset_classes: List[str] = Field(default_factory=list, description="Asset classes they deal with")
    buy_box: Optional[BuyBox] = Field(None, description="Investment criteria if stated")
    
    # The Card fields
    hot_plate: Optional[str] = Field(None, description="Current specific focus/project")
    i_can_help_with: Optional[str] = Field(None, description="Skills or services they offer")
    help_me_with: Optional[str] = Field(None, description="What they are looking for help with")
    message_to_world: Optional[str] = Field(None, description="General statement or bio")
    
    # Socials
    blinq: Optional[str] = None
    website: Optional[str] = None
    social_media: List[SocialLink] = Field(default_factory=list, description="Other social media links")


class MeetingSummary(BaseModel):
    """Summary of the meeting discussion."""
    summary: str = Field(description="A concise summary of the meeting discussion (3-5 sentences).")
    key_topics: List[str] = Field(description="List of key topics discussed.")


class IntentAnalysis(BaseModel):
    """Result of LLM intent analysis on a chunk."""
    services: List[ExtractedService] = Field(description="List of extracted offers and requests")
    profiles: List["ExtractedProfile"] = Field(default_factory=list, description="List of rich contact profiles extracted")
    noise_message_ids: List[int] = Field(description="List of message IDs that are irrelevant noise")


class ExtractedMeetingData(BaseModel):
    """Complete extraction result for a meeting."""
    contacts: List[ExtractedContact]
    services: List[ExtractedService]
    summary: MeetingSummary
    cleaned_transcript: List[CleanedMessage] = Field(
        default_factory=list, 
        description="Structured parsed messages (filtered)"
    )
    profiles: List["ExtractedProfile"] = Field(default_factory=list, description="Rich profiles")


class ValidationResult(BaseModel):
    """Result of validating a single service."""
    is_valid: bool = Field(description="True if this is a legitimate business offer/request.")
    reason: str = Field(description="Reason for invalidity if False.")


class ValidatedServiceList(BaseModel):
    """Batch validation results."""
    results: List[ValidationResult]


# =============================================================================
# REGEX PATTERNS
# =============================================================================

PHONE_REGEX = r'\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}'
EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
URL_REGEX = r'(https?://[^\s]+)'

# Zoom message pattern: [Timestamp] From [Name] to Everyone: [Message]
ZOOM_MSG_PATTERN = re.compile(
    r'((?:\d{4}-\d{2}-\d{2}\s+)?\d{1,2}:\d{2}(?::\d{2})?)\s+From\s+(.+?)\s+to\s+Everyone:\s*(.*)',
    re.IGNORECASE
)

# Role identifiers (emojis and keywords)
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


# =============================================================================
# PARSING FUNCTIONS
# =============================================================================

def parse_transcript_lines(text: str) -> List[CleanedMessage]:
    """
    Parse raw transcript text into structured messages.
    Handles multi-line messages by appending to previous message.
    """
    lines = text.split('\n')
    parsed = []
    idx = 0
    current_msg = None

    for line in lines:
        match = ZOOM_MSG_PATTERN.search(line)
        if match:
            # Save previous message if exists
            if current_msg:
                parsed.append(current_msg)
            
            timestamp = match.group(1).strip()
            raw_sender = match.group(2).strip()
            initial_msg = match.group(3).strip()
            
            # Clean sender name to remove phone numbers and role tags
            sender = clean_sender_name(raw_sender)
            
            current_msg = CleanedMessage(
                id=idx, 
                sender=sender, 
                message=initial_msg, 
                timestamp=timestamp
            )
            idx += 1
        elif current_msg:
            # Append to current message if not a new header
            cleaned_line = line.strip()
            if cleaned_line:
                current_msg.message += " " + cleaned_line

    # Don't forget the last message
    if current_msg:
        parsed.append(current_msg)
        
    return parsed


def extract_roles(text: str) -> List[str]:
    """Extract known roles from text using emoji/keyword mapping."""
    found_roles: Set[str] = set()
    
    for marker, role_name in ROLES_MAP.items():
        # For emojis and short codes
        if not marker.isascii():
            # Emoji check
            if marker in text:
                found_roles.add(role_name)
        elif len(marker) > 2 and marker.isalpha():
            # Longer text codes - use word boundary
            if re.search(r'\b' + re.escape(marker) + r'\b', text, re.IGNORECASE):
                found_roles.add(role_name)
        else:
            # Short ASCII codes (TC, OC) - case sensitive with boundary
            if re.search(r'\b' + re.escape(marker) + r'\b', text):
                found_roles.add(role_name)
                
    return list(found_roles)


def clean_sender_name(raw_name: str) -> str:
    """
    Clean sender name by removing phone numbers and role tags.
    
    This fixes the critical issue where Zoom displays names like:
    - "Micah Wylie TC 3852082523" 
    - "Dr. Tami Romriell  208-589-7775"
    - "Jesus Yuma AZ 7609785676"
    
    Returns cleaned name: "Micah Wylie", "Dr. Tami Romriell", "Jesus Yuma"
    """
    name = raw_name.strip()
    
    # Remove 10+ digit phone numbers (e.g. 3852082523)
    name = re.sub(r'\b\d{10,}\b', '', name)
    
    # Remove formatted phone numbers (e.g. 208-589-7775, (385) 208-2523, 385.208.2523)
    name = re.sub(r'\b\d{3}[-.)\s]?\d{3}[-.)\s]?\d{4}\b', '', name)
    
    # Remove common role tags that appear in names
    # Case-insensitive for full words, case-sensitive for acronyms
    role_patterns = [
        r'\bTC\b',           # Transaction Coordinator
        r'\bTTTC\b',         # Top Tier TC  
        r'\bTM\b',           # Transaction Manager
        r'\bEA\b',           # Executive Assistant
        r'\bVA\b',           # Virtual Assistant
        r'\bDTS\b',          # Direct To Seller
        r'\bDTA\b',          # Direct To Agent
        r'\bZDB\b',          # Zero Down Business
        r'\bOC\b',           # Owners Club
    ]
    
    for pattern in role_patterns:
        name = re.sub(pattern, '', name)
    
    # Remove emojis (they're often roles: ✌️, 🐊, 🐕, 🐦)
    # Keep only ASCII characters, spaces, and common name characters (hyphens, apostrophes)
    name = re.sub(r'[^\x00-\x7F]+', '', name)
    
    # Remove state codes at end of name (e.g., "Jesus Yuma AZ")
    state_codes = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    ]
    for state in state_codes:
        # Remove if it's the last word
        name = re.sub(rf'\s+{state}\s*$', '', name)
    
    # Clean up multiple spaces, leading/trailing whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    
    # If name is now empty or too short, return original (better to have weird name than no name)
    if len(name) < 2:
        return raw_name.strip()
    
    return name


def extract_hard_contact_info(messages: List[CleanedMessage]) -> Dict[str, Dict]:
    """
    Pass 1: Regex extraction of Phone, Email, Links AND Roles.
    Returns a dict mapping sender name to their extracted info.
    """
    contacts_map: Dict[str, Dict] = {}

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


# =============================================================================
# LLM ANALYSIS FUNCTIONS
# =============================================================================

async def analyze_chunk(messages_chunk: List[CleanedMessage], chunk_index: int) -> IntentAnalysis:
    """
    Analyze a chunk of messages using LLM to extract offers/requests.
    Uses centralized LLM factory with retry and rate limiting.
    """
    if not settings.OPENROUTER_API_KEY:
        logger.warning("No API key configured, skipping LLM analysis")
        return IntentAnalysis(services=[], noise_message_ids=[])

    try:
        # Get structured LLM with rate limiting
        structured_llm = get_structured_llm(IntentAnalysis)

        # Prepare transcript text
        transcript_text = "\n".join([
            f"[{m.id}] {m.sender}: {m.message}" 
            for m in messages_chunk
        ])

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
           
        4. **EXTRACT RICH PROFILE DATA**:
           For each person found, extract strictly what is present:
           - **Communities**: Map symbols/acronyms (TC, Gator 🐊, Subto ✌️, OC, Bird Dog 🐕, DTS, DTA, ZD/ZDB) to their full names.
           - **Buy Box**: If they state investment criteria (min/max price, location, strategy).
           - **Asset Classes**: e.g., Multifamily, SFH, Land.
           - **"Hot Plate"**: What they are currently working on.
           - **"I Can Help With"**: Services or skills they offer.
           - **"Help Me With"**: What they need.
           - **Socials**: Blinq, Website, etc.

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
        result = await invoke_with_retry(structured_llm, prompt)
        logger.info(f"Chunk {chunk_index} analysis complete.")
        return result

    except Exception as e:
        logger.error(f"LLM Chunk Analysis Failed (Chunk {chunk_index}): {e}")
        return IntentAnalysis(services=[], noise_message_ids=[])


async def validate_services(services: List[ExtractedService]) -> List[ExtractedService]:
    """
    Stage 2: Relevance Validator.
    Filters out non-business items from the extracted services.
    Processes in batches to avoid context limits.
    """
    if not services or not settings.OPENROUTER_API_KEY:
        return services

    BATCH_SIZE = 20
    validated_services = []
    
    try:
        structured_llm = get_structured_llm(ValidatedServiceList)
        
        for i in range(0, len(services), BATCH_SIZE):
            batch = services[i:i + BATCH_SIZE]
            items_text = "\n".join([
                f"{idx}. [{s.type.upper()}] {s.description}" 
                for idx, s in enumerate(batch)
            ])
            
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
            
            logger.info(f"Validating batch {i // BATCH_SIZE + 1} ({len(batch)} items)...")
            res = await invoke_with_retry(structured_llm, prompt)
            
            if res and len(res.results) == len(batch):
                for idx, result in enumerate(res.results):
                    if result.is_valid:
                        validated_services.append(batch[idx])
                    else:
                        logger.info(
                            f"Validator Dropped: {batch[idx].description[:50]}... "
                            f"(Reason: {result.reason})"
                        )
            else:
                logger.warning(
                    f"Validator batch mismatch ({len(res.results) if res else 0} vs {len(batch)}). "
                    "Keeping batch."
                )
                validated_services.extend(batch)
                
        return validated_services
        
    except Exception as e:
        logger.error(f"Validator Failed: {e}")
        return services  # Return original on failure

async def enrich_profile_from_services_with_llm(name: str, services: List[str]) -> ExtractedProfile:
    """
    Enrich a contact's profile based purely on their historical services (offers/requests).
    Used for scanning the database to backfill profiles without re-reading transcripts.
    """
    if not services or not settings.OPENROUTER_API_KEY:
        # Return empty profile if no services or no key
        return ExtractedProfile(name=name)

    try:
        structured_llm = get_structured_llm(ExtractedProfile)
        
        services_text = "\n".join([f"- {s}" for s in services])
        
        prompt = f"""
        You are an expert Real Estate Investor Profile Analyzer.
        Your goal is to build a Rich Profile for '{name}' based on their history of service posts.
        
        Analyze the following list of Offers and Requests they have posted:
        
        {services_text}
        
        Task:
        1. Infer their **Role** (e.g., Wholesaler, Lender, Gator, Buyer).
        2. Identify **Communities** they mentioned (e.g. Subto, Astro, Gator).
        3. Identify **Asset Classes** they deal with (e.g. SFH, Multifamily).
        4. Construct a **Bio** (message_to_world) summarizing who they are.
        5. Extract **Hot Plate** (what are they working on NOW? specific deals?).
        6. Extract **Buy Box** criteria if they mentioned buying.
        7. Extract **I Can Help With** (what do they offer?) and **Help Me With** (what do they need?).
        
        Output a structured JSON profile.
        If strict data is missing, leave fields empty. Do NOT hallucinate.
        """
        
        logger.info(f"Enriching profile for {name} from {len(services)} services...")
        result = await invoke_with_retry(structured_llm, prompt)
        
        # Ensure name is preserved
        if result:
            result.name = name
            
        return result

    except Exception as e:
        logger.error(f"Profile Enrichment from Services Failed for {name}: {e}")
        return ExtractedProfile(name=name)


async def extract_summary_with_llm(text: str) -> MeetingSummary:
    """Generate a meeting summary using LLM."""
    if not settings.OPENROUTER_API_KEY:
        return MeetingSummary(summary="No API Key configured.", key_topics=[])

    try:
        structured_llm = get_structured_llm(MeetingSummary)
        
        # Truncate to avoid context limits
        prompt = f"Summarize this meeting transcript (max 15000 chars):\n{text[:15000]}"
        
        logger.info("Generating Summary...")
        return await invoke_with_retry(structured_llm, prompt)
        
    except Exception as e:
        logger.error(f"Summary Generation Failed: {e}")
        return MeetingSummary(summary="Summary generation failed.", key_topics=[])
