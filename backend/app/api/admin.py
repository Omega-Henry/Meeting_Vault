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

@router.post("/contacts/merge", response_model=dict)
def merge_contacts(
    request: MergeRequest,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Executes a merge of multiple contacts into a primary contact.
    Handles profiles, aliases, services, and ownership.
    """
    primary_id = request.primary_contact_id
    dup_ids = request.duplicate_contact_ids
    
    if primary_id in dup_ids:
         raise HTTPException(status_code=400, detail="Primary ID cannot be in duplicate list")

    all_ids = [primary_id] + dup_ids
    res = client.table("contacts").select("*, profile:contact_profiles(*)").in_("id", all_ids).execute()
    contacts = res.data
    
    if len(contacts) != len(all_ids):
        raise HTTPException(status_code=404, detail="One or more contacts not found")
        
    primary_contact = next((c for c in contacts if c["id"] == primary_id), None)
    duplicates = [c for c in contacts if c["id"] in dup_ids]
    
    # 0. Check Ownership / Claims
    # If duplicates are claimed by different users, we have a conflict.
    primary_owner = primary_contact.get("claimed_by_user_id")
    claiming_users = set()
    if primary_owner:
        claiming_users.add(primary_owner)
    
    for d in duplicates:
        if d.get("claimed_by_user_id"):
            claiming_users.add(d["claimed_by_user_id"])
            
    if len(claiming_users) > 1:
        raise HTTPException(status_code=409, detail="Cannot merge: Multiple different users validly claim these contacts.")
    
    # If primary is unclaimed but a duplicate is, transfer ownership
    new_owner = list(claiming_users)[0] if claiming_users else None
    
    # 1. Update Services & Links
    client.table("services").update({"contact_id": primary_id}).in_("contact_id", dup_ids).execute()
    # Also transfer claim requests?
    client.table("claim_requests").update({"contact_id": primary_id}).in_("contact_id", dup_ids).execute()

    # 2. Handle Aliases (Create alias from duplicate names)
    # We want to remember that 'John Doe' (dup) is now 'Jonathan Doe' (primary)
    # Check if contact_aliases table exists (from migration 006)
    existing_aliases = client.table("contact_aliases").select("alias").eq("contact_id", primary_id).execute()
    current_alias_names = {a['alias'].lower() for a in existing_aliases.data}
    
    new_aliases = []
    for d in duplicates:
        name = d.get("name")
        if name and name.lower() != "unattributed" and name.lower() not in current_alias_names:
            if name != primary_contact.get("name"): # Don't alias if exact match
                new_aliases.append({
                    "contact_id": primary_id,
                    "alias": name,
                    "source_meeting_id": None # We don't have this easy context here, optional
                })
                current_alias_names.add(name.lower())
    
    if new_aliases:
        client.table("contact_aliases").insert(new_aliases).execute()

    # 3. Merge Fields (Best Effort) to Primary
    updates = {}
    if new_owner and new_owner != primary_owner:
        updates["claimed_by_user_id"] = new_owner

    if not primary_contact.get("email"):
        for d in duplicates:
            if d.get("email"):
                updates["email"] = d["email"]
                break
    
    if not primary_contact.get("phone"):
        for d in duplicates:
            if d.get("phone"):
                updates["phone"] = d["phone"]
                break

    # 4. Handle Profile (Simple: Only create if primary missing)
    # If primary has no profile (profile field is null or empty list/obj), try to copy from duplicates?
    # RLS fetch usually returns 'profile' as list or object.
    # Assuming primary_contact['profile'] is the profile data.
    primary_profile = primary_contact.get("profile")
    if not primary_profile: 
        # Find first duplicate with a profile
        for d in duplicates:
            if d.get("profile"):
                # We need to INSERT a new profile for primary, copying data from d['profile']
                # But 'profile' in response is the joined data.
                # We need the raw profile row.
                # Actually, simpler: Just update the duplicate's profile to point to primary_id?
                # RLS might block if checks old parent? No, usually check new parent.
                # Let's try: Update contact_profiles set contact_id = primary_id where contact_id = d.id
                # Only need to do this ONCE.
                d_profile = d["profile"] 
                # d_profile is the dict. 
                # We can't easily get the ID unless we selected it?
                # Using contact_id is safer.
                try:
                    client.table("contact_profiles").update({"contact_id": primary_id}).eq("contact_id", d["id"]).execute()
                    # Once we moved one, stop. We don't want multiple profiles if 1:1.
                    break 
                except Exception as e:
                    logger.warning(f"Failed to move profile: {e}")
                    pass

    if updates:
        client.table("contacts").update(updates).eq("id", primary_id).execute()

    # 5. Archive Duplicates
    client.table("contacts").update({"is_archived": True}).in_("id", dup_ids).execute()

    # 6. Audit
    try:
        client.table("audit_log").insert({
            "org_id": ctx.org_id,
            "entity_type": "contact",
            "entity_id": primary_id,
            "action": "merged",
            "actor_id": ctx.user.id,
            "changes": {"merged_ids": dup_ids, "transferred_ownership": str(new_owner)}
        }).execute()
    except Exception:
        pass
    
    return {"status": "success", "message": f"Merged {len(dup_ids)} contacts"}

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

@router.get("/review-queue", response_model=List[Dict[str, Any]])
def get_review_queue(
    limit: int = 50,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Fetch recent services for review.
    """
    res = client.table("services").select("*, contacts(name, email)").order("created_at", desc=True).limit(limit).execute()
    return res.data

@router.get("/contacts/search", response_model=List[dict])
def search_contacts(
    q: str,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Admin search: looks at name, email, phone, and links.
    """
    filter_str = f"name.ilike.%{q}%,email.ilike.%{q}%,phone.ilike.%{q}%"
    res = client.table("contacts").select("*").or_(filter_str).eq("org_id", ctx.org_id).limit(20).execute()
    return res.data

@router.patch("/services/{service_id}", response_model=dict)
def update_service(
    service_id: str,
    payload: Dict[str, Any] = Body(...),
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Directly update a service's fields (Admin only).
    Useful for reassigning contact_id.
    """
    allowed = {"description", "contact_id", "type"} 
    update_data = {k: v for k, v in payload.items() if k in allowed}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
        
    client.table("services").update(update_data).eq("id", service_id).execute()
    return {"status": "success"}

