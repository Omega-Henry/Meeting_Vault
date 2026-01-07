from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from supabase import Client
from app.dependencies import get_current_user, get_supabase_client
from app.schemas import ClaimRequestCreate, ClaimRequestResponse, ContactBase
from pydantic import BaseModel
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class ClaimCandidate(BaseModel):
    contact: Dict[str, Any]
    match_type: str # 'strong_phone', 'strong_email', 'medium_name', 'weak_name'
    confidence: str # 'High', 'Medium', 'Low'

@router.post("/search", response_model=List[ClaimCandidate])
def search_claimable_contacts(
    payload: Dict[str, str] = Body(...),
    user = Depends(get_current_user),
    client: Client = Depends(get_supabase_client)
):
    """
    Finds contacts that might belong to the user based on phone, email, or name.
    """
    phone = payload.get("phone", "").strip()
    email = payload.get("email", "").strip()
    name = payload.get("name", "").strip()
    
    candidates = []
    seen_ids = set()
    
    # 1. Strong Match: Phone
    if phone:
        # Simple cleanup for matching
        # In a real app, we'd use a better normalization strategy. 
        # Here we assume the DB has raw phone strings.
        # We try exact match first
        res = client.table("contacts").select("*").eq("phone", phone).execute()
        for c in res.data:
            if c["id"] not in seen_ids and not c.get("claimed_by_user_id"):
                candidates.append(ClaimCandidate(
                    contact=c,
                    match_type="strong_phone",
                    confidence="High"
                ))
                seen_ids.add(c["id"])

    # 2. Strong Match: Email
    if email:
        res = client.table("contacts").select("*").ilike("email", email).execute()
        for c in res.data:
            if c["id"] not in seen_ids and not c.get("claimed_by_user_id"):
                candidates.append(ClaimCandidate(
                    contact=c,
                    match_type="strong_email",
                    confidence="High"
                ))
                seen_ids.add(c["id"])

    # 3. Weak/Fuzzy Match: Name
    if name and len(name) > 3:
        # ILIKE match
        res = client.table("contacts").select("*").ilike("name", f"%{name}%").limit(5).execute()
        for c in res.data:
            if c["id"] not in seen_ids and not c.get("claimed_by_user_id"):
                confidence = "Medium" if c["name"].lower() == name.lower() else "Low"
                candidates.append(ClaimCandidate(
                    contact=c,
                    match_type="name_similarity",
                    confidence=confidence
                ))
                seen_ids.add(c["id"])
                
    return candidates

@router.post("/", response_model=Dict[str, Any])
def create_claim_request(
    claim: ClaimRequestCreate,
    user = Depends(get_current_user),
    client: Client = Depends(get_supabase_client)
):
    """
    Submits a request to claim a contact profile.
    """
    # Check if already pending
    res = client.table("claim_requests").select("*")\
        .eq("user_id", user.id)\
        .eq("contact_id", str(claim.contact_id))\
        .in_("status", ["pending", "approved"])\
        .execute()
        
    if res.data:
        raise HTTPException(status_code=400, detail="Claim request already exists or approved")

    payload = {
        "user_id": user.id,
        "contact_id": str(claim.contact_id),
        "status": "pending",
        "evidence": claim.evidence
    }
    
    res = client.table("claim_requests").insert(payload).execute()
    return {"status": "success", "data": res.data[0]}

@router.get("/mine", response_model=List[Dict[str, Any]])
def get_my_claims(
    user = Depends(get_current_user),
    client: Client = Depends(get_supabase_client)
):
    """
    List user's claim requests
    """
    res = client.table("claim_requests").select("*, contact:contacts(name)").eq("user_id", user.id).execute()
    return res.data
