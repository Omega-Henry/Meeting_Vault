from pydantic import BaseModel, HttpUrl, Field
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

class ContactLink(BaseModel):
    link: str
    normalized_link: str

class ContactProfileBase(BaseModel):
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    assets: List[str] = []
    buy_box: Dict[str, Any] = {}
    field_provenance: Dict[str, str] = {} # e.g. {"bio": "user_verified", "phone": "ai_generated"}
    
    # New rich profile fields
    cell_phone: Optional[str] = None
    office_phone: Optional[str] = None
    blinq: Optional[str] = None
    website: Optional[str] = None
    communities: List[str] = []
    social_media: Dict[str, str] = {}
    
    # Structured Data
    role_tags: List[str] = []
    asset_classes: List[str] = []
    markets: List[str] = []
    min_target_price: Optional[float] = None
    max_target_price: Optional[float] = None
    
    # "The Card" Text Fields
    i_can_help_with: Optional[str] = None
    help_me_with: Optional[str] = None
    hot_plate: Optional[str] = None
    message_to_world: Optional[str] = None
    
    # The Buy Box (Queryable)
    buy_box: Dict[str, Any] = {}
    
    completeness_score: int = 0

class ContactBase(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    links: List[str] = []
    
    # New fields
    is_unverified: bool = False
    is_archived: bool = False
    organization_id: Optional[UUID] = None # previously org_id
    claimed_by_user_id: Optional[UUID] = None
    
    # Profile link
    profile: Optional[ContactProfileBase] = None

class Contact(ContactBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

class ServiceBase(BaseModel):
    type: str # 'offer' or 'request'
    description: str
    links: List[str] = []
    
    # New fields
    is_archived: bool = False
    archive_reason: Optional[str] = None
    created_by_user_id: Optional[UUID] = None

class Service(ServiceBase):
    id: UUID
    contact_id: UUID
    meeting_chat_id: Optional[UUID] = None
    user_id: UUID
    created_at: datetime

class MeetingChatBase(BaseModel):
    meeting_name: str
    cleaned_text: str
    digest_bullets: Optional[Dict[str, Any]] = None

class MeetingChatCreate(MeetingChatBase):
    telegram_chat_id: str = "unknown" # Default for uploaded files

class MeetingChatResponse(MeetingChatBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    
    class Config:
        from_attributes = True

class ExtractedData(BaseModel):
    contacts: List[ContactBase]
    services: List[ServiceBase]

class MergeSuggestion(BaseModel):
    suggestion_id: str
    contact_ids: List[str]
    confidence: str # 'High', 'Medium', 'Low'
    reasons: List[str]
    proposed_primary_contact_id: Optional[str] = None
    
class MergeRequest(BaseModel):
    primary_contact_id: str
    duplicate_contact_ids: List[str]
    merged_name: Optional[str] = None  # Optional: allows admin to set final name

# New Schemas for Claims and Requests

class ClaimRequestCreate(BaseModel):
    contact_id: UUID
    evidence: Dict[str, Any] = {}

class ClaimRequestResponse(BaseModel):
    id: UUID
    user_id: UUID
    contact_id: UUID
    status: str
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    decision_reason: Optional[str] = None
    
class ContactAlias(BaseModel):
    contact_id: UUID
    alias: str
    normalized_alias: str
    source_meeting_id: Optional[UUID] = None
