import re
import logging
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

# Zoom Pattern: Optional Date + Time + From [Name] to Everyone: [Message]
ZOOM_MSG_PATTERN = re.compile(r'(?:\d{4}-\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}\s+From\s+(.+?)\s+to\s+Everyone:\s+(.*)', re.IGNORECASE)

def clean_description(text: str) -> str:
    """Removes URLs and extra whitespace."""
    text = re.sub(URL_REGEX, '', text)
    return text.strip()

def parse_transcript_lines(text: str) -> List[CleanedMessage]:
    """Parses raw text into structured messages."""
    lines = text.split('\n')
    parsed = []
    idx = 0
    for line in lines:
        match = ZOOM_MSG_PATTERN.search(line)
        if match:
            sender = match.group(1).strip()
            msg = match.group(2).strip()
            parsed.append(CleanedMessage(id=idx, sender=sender, message=msg))
            idx += 1
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

def analyze_with_llm(messages: List[CleanedMessage]) -> IntentAnalysis:
    """Pass 2: LLM Intent Analysis."""
    if not settings.OPENROUTER_API_KEY:
        logger.warning("No API Key found. Skipping LLM analysis.")
        return IntentAnalysis(services=[], noise_message_ids=[])

    try:
        llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.OPENROUTER_API_KEY,
            base_url=settings.OPENROUTER_BASE_URL,
            temperature=0
        )
        structured_llm = llm.with_structured_output(IntentAnalysis)

        # Prepare a concise version for LLM to save tokens
        transcript_text = "\n".join([f"[{m.id}] {m.sender}: {m.message}" for m in messages[:600]]) # Limit to ~600 messages for safety

        prompt = f"""
        You are an expert meeting assistant. Analyze the following Zoom chat transcript.
        
        Task 1: Extract all "Offers" and "Requests".
        - Offer: Someone offering a service, funding, help, or resource.
        - Request: Someone looking for a service, connection, or help.
        - For each, provide a clear description and the Sender's Name.
        
        Task 2: Identify "Noise".
        - Identify message IDs (numbers in brackets) that are pure noise, jokes, simple greetings ("hi"), or irrelevant chatter.
        - Keep messages that provide context to offers/requests.
        
        Transcript:
        {transcript_text}
        """
        
        logger.info("Sending transcript to LLM for Intent Analysis...")
        result = structured_llm.invoke(prompt)
        logger.info(f"LLM Analysis Complete. Found {len(result.services)} services and {len(result.noise_message_ids)} noise items.")
        return result

    except Exception as e:
        logger.error(f"LLM Intent Analysis Failed: {e}")
        return IntentAnalysis(services=[], noise_message_ids=[])

def extract_summary_with_llm(text: str) -> MeetingSummary:
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
        return structured_llm.invoke(prompt)
    except Exception as e:
        logger.error(f"Summary Generation Failed: {e}")
        return MeetingSummary(summary="Failed.", key_topics=[])

def extract_meeting_data(text: str) -> ExtractedMeetingData:
    logger.info("Starting Hybrid Extraction...")
    
    # 1. Parse Messages
    raw_messages = parse_transcript_lines(text)
    logger.info(f"Parsed {len(raw_messages)} raw messages.")
    
    # 2. Extract Hard Contact Info (Deterministic)
    contacts_map = extract_hard_contact_info(raw_messages)
    
    # 3. LLM Intent Analysis (Services + Noise Filter)
    intent_data = analyze_with_llm(raw_messages)
    
    # 4. Filter Transcript (Remove Noise)
    noise_ids = set(intent_data.noise_message_ids)
    final_transcript = [m for m in raw_messages if m.id not in noise_ids]
    
    # 5. Build Final Contacts List
    # We include a contact if they have a Service OR if we found Email/Phone
    final_contacts = []
    for name, info in contacts_map.items():
        has_service = any(s.contact_name == name for s in intent_data.services)
        has_contact_data = info["email"] or info["phone"]
        
        if has_service or has_contact_data:
            final_contacts.append(ExtractedContact(
                name=name,
                email=info["email"],
                phone=info["phone"],
                role=None
            ))
            
    # 6. Summary
    summary = extract_summary_with_llm(text)
    
    logger.info("Extraction Complete.")
    
    return ExtractedMeetingData(
        contacts=final_contacts,
        services=intent_data.services,
        summary=summary,
        cleaned_transcript=final_transcript
    )

