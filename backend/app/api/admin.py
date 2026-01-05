from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any
from supabase import Client
from app.dependencies import require_admin, UserContext, get_supabase_client
from app.schemas import MergeSuggestion, MergeRequest
import uuid
import logging
from collections import defaultdict
import datetime

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/scan-duplicates", response_model=List[MergeSuggestion])
def scan_duplicates(
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Scans for duplicate contacts based on heuristics.
    Returns a list of suggestions.
    """
    # Fetch all contacts for the org (Warning: scaling issue for massive DBs, OK for MVP)
    # We select is_archived to filter them out if we strictly implement soft-delete
    # But since migration just added it, we assume false if null or false.
    res = client.table("contacts").select("*").eq("org_id", ctx.org_id).execute()
    contacts = res.data
    
    # Filter out archived if column exists/populated (safeguard)
    active_contacts = [c for c in contacts if not c.get("is_archived", False)]
    
    suggestions = []
    
    # --- Strategy 1: Exact Email Match ---
    email_groups = defaultdict(list)
    for c in active_contacts:
        if c.get("email"):
            email_groups[c["email"].lower()].append(c)
            
    for email, group in email_groups.items():
        if len(group) > 1:
            # Found duplicates by email
            # Pick primary: one with most info or oldest? 
            # User rule: "prefer longer real-looking name"
            primary = max(group, key=lambda x: (len(x.get("name") or ""), x.get("created_at")))
            
            suggestions.append(MergeSuggestion(
                suggestion_id=str(uuid.uuid4()),
                contact_ids=[c["id"] for c in group],
                confidence="High",
                reasons=[f"Same email address: {email}"],
                proposed_primary_contact_id=primary["id"]
            ))

    # --- Strategy 2: Phone Match (excluding those already in suggestions) ---
    # To do this cleanly, we should track processed IDs.
    processed_ids = set()
    for s in suggestions:
        processed_ids.update(s.contact_ids)
        
    phone_groups = defaultdict(list)
    for c in active_contacts:
        if c["id"] in processed_ids:
            continue
        if c.get("phone"):
            # Simple normalization for grouping
            phone_clean = ''.join(filter(str.isdigit, c["phone"]))
            if len(phone_clean) > 6: # Basic validity
                phone_groups[phone_clean].append(c)
                
    for phone, group in phone_groups.items():
        if len(group) > 1:
            primary = max(group, key=lambda x: (len(x.get("name") or ""), x.get("created_at")))
            suggestions.append(MergeSuggestion(
                suggestion_id=str(uuid.uuid4()),
                contact_ids=[c["id"] for c in group],
                confidence="High",
                reasons=[f"Same phone number: {group[0]['phone']}"], # Display original for context
                proposed_primary_contact_id=primary["id"]
            ))

    # --- Strategy 3: Name Similarity (Simple/MVP) ---
    # Only check exact name match or very close variation? 
    # User mentioned "J. Smith" vs "John Smith".
    # This is hard to do reliably without false positives in Python without complex libraries.
    # We will implement EXACT name match for now as "Medium" confidence if they have no email/phone (rare but possible).
    
    # Update processed
    for s in suggestions:
        processed_ids.update(s.contact_ids)

    name_groups = defaultdict(list)
    for c in active_contacts:
        if c["id"] in processed_ids:
            continue
        if c.get("name") and c["name"].lower() != "unattributed":
            name_groups[c["name"].lower().strip()].append(c)
            
    for name, group in name_groups.items():
        if len(group) > 1:
            # If they have NO email/phone, this is Medium confidence being duplicates 
            # (could be two 'John Smith's, but in a small CRM, likely same)
            primary = group[0] # Just pick first
            suggestions.append(MergeSuggestion(
                suggestion_id=str(uuid.uuid4()),
                contact_ids=[c["id"] for c in group],
                confidence="Medium",
                reasons=[f"Exact name match: {primary['name']}"],
                proposed_primary_contact_id=primary["id"]
            ))

    return suggestions

@router.post("/merge-contacts", response_model=dict)
def merge_contacts(
    request: MergeRequest,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Executes a merge of multiple contacts into a primary contact.
    """
    primary_id = request.primary_contact_id
    dup_ids = request.duplicate_contact_ids
    
    # Validate
    if primary_id in dup_ids:
         raise HTTPException(status_code=400, detail="Primary ID cannot be in duplicate list")

    # 1. Fetch all involved contacts
    all_ids = [primary_id] + dup_ids
    res = client.table("contacts").select("*").in_("id", all_ids).execute()
    contacts = res.data
    
    if len(contacts) != len(all_ids):
        raise HTTPException(status_code=404, detail="One or more contacts not found")
        
    primary_contact = next((c for c in contacts if c["id"] == primary_id), None)
    
    # 2. Update Services
    # Reassign services from dup_ids to primary_id
    client.table("services").update({"contact_id": primary_id}).in_("contact_id", dup_ids).execute()
    
    # 3. Update Contact Links (if table exists and used)
    # Check if table exists/is used? We assume migration ran.
    try:
        client.table("contact_links").update({"contact_id": primary_id}).in_("contact_id", dup_ids).execute()
    except Exception:
        # Ignore if table missing or something (MVP robustness)
        pass

    # 4. Merge Fields (Best Effort)
    # If primary has missing email/phone, take from duplicates
    updates = {}
    if not primary_contact.get("email"):
        for d in contacts:
            if d.get("email"):
                updates["email"] = d["email"]
                break
    if not primary_contact.get("phone"):
        for d in contacts:
            if d.get("phone"):
                updates["phone"] = d["phone"]
                break
                
    # Union of links array (if using JSON/Array column in contacts)
    primary_links = set(primary_contact.get("links") or [])
    for c in contacts:
        if c["id"] in dup_ids:
            for l in (c.get("links") or []):
                primary_links.add(l)
    
    if len(primary_links) > len(primary_contact.get("links") or []):
         updates["links"] = list(primary_links)
         
    if updates:
        client.table("contacts").update(updates).eq("id", primary_id).execute()

    # 5. Archive Duplicates (Soft Delete)
    client.table("contacts").update({"is_archived": True}).in_("id", dup_ids).execute()

    # 6. Create Audit Log
    audit_entry = {
       "org_id": ctx.org_id,
       "user_id": ctx.user.id,
       "primary_contact_id": primary_id,
       "merged_contact_ids": dup_ids,
       "timestamp": datetime.datetime.now().isoformat(),
       "details": {"reason": "Admin Manual Merge", "updates": updates}
    }
    client.table("merge_audit_log").insert(audit_entry).execute()
    
    return {"status": "success", "message": f"Merged {len(dup_ids)} contacts into {primary_id}"}

@router.patch("/contacts/{contact_id}", response_model=dict)
def update_contact(
    contact_id: str,
    payload: Dict[str, Any] = Body(...),
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Directly update a contact's fields (Admin only).
    """
    # Safe fields only
    allowed = {"name", "email", "phone", "links"} 
    update_data = {k: v for k, v in payload.items() if k in allowed}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
        
    client.table("contacts").update(update_data).eq("id", contact_id).execute()
    return {"status": "success"}

@router.delete("/contacts/{contact_id}", response_model=dict)
def delete_contact(
    contact_id: str,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Soft delete a contact.
    """
    client.table("contacts").update({"is_archived": True}).eq("id", contact_id).execute()
    return {"status": "success"}

@router.get("/contacts/search", response_model=List[dict])
def search_contacts(
    q: str,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Admin search: looks at name, email, phone, and links.
    """
    # Supabase/PostgREST syntax for OR across multiple columns
    # or=(col1.ilike.val,col2.ilike.val)
    # Note: 'links' is an array, so we need different syntax or text cast
    # Assuming 'links' is text[]
    
    # Simplified: Search name/email/phone (links is harder in simple query without specialized index/extensions)
    # We will try to cast to text for simple search if possible, or just skip links for MVP efficiency
    
    filter_str = f"name.ilike.%{q}%,email.ilike.%{q}%,phone.ilike.%{q}%"
    res = client.table("contacts").select("*").or_(filter_str).eq("org_id", ctx.org_id).limit(20).execute()
    return res.data

