from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from supabase import Client
from app.dependencies import require_admin, UserContext, get_supabase_client, get_service_role_client
from app.schemas import MergeSuggestion, MergeRequest, MergeProposal
import uuid
import logging
from collections import defaultdict
import datetime
import asyncio
from app.services.hybrid_extraction import enrich_profile_from_services_with_llm, generate_merge_suggestion
from app.core.config import settings
from rapidfuzz import fuzz


router = APIRouter()
logger = logging.getLogger(__name__)

# Simple in-memory status for the profile scan job
# In a multi-worker env, this should be in Redis/DB, but for this singe-instance tool, memory is fine.
SCAN_JOB_STATUS = {
    "is_running": False,
    "total": 0,
    "processed": 0,
    "status": "idle" # idle, running, completed, failed
}


@router.post("/scan-duplicates", response_model=List[MergeSuggestion])
def scan_duplicates(
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Scans for duplicate contacts based on heuristics.
    Returns a list of suggestions.
    """
    # Batch process contacts to avoid memory issues
    batch_size = 1000
    offset = 0
    active_contacts = []
    
    while True:
        try:
             res = client.table("contacts").select("*").eq("org_id", ctx.org_id)\
                 .range(offset, offset + batch_size - 1).execute()
             
             batch = res.data
             if not batch:
                 break
                 
             # Filter out archived contacts
             active_contacts.extend([c for c in batch if not c.get("is_archived", False)])
             
             if len(batch) < batch_size:
                 break
                 
             offset += batch_size
        except Exception as e:
            logger.error(f"Error fetching contacts batch at offset {offset}: {e}")
            break
            
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

    # --- Strategy 3: Name Similarity ---
    # We use EXACT name match as a 'Medium' confidence signal.
    # While fuzzy matching is powerful, it carries a risk of false positives.
    # For a production system without human-in-the-loop for every single match, 
    # exact matching avoids merging distinct individuals (e.g. John Smith vs. Joan Smith).
    
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


@router.post("/scan-duplicates-fuzzy", response_model=List[MergeSuggestion])
def scan_duplicates_fuzzy(
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client),
    min_similarity: int = 80  # 0-100 similarity threshold
):
    """
    Scans for duplicate contacts using FUZZY name matching.
    Returns suggestions for admin manual review.
    Higher min_similarity = stricter matching (fewer false positives).
    """
    # Fetch active contacts
    res = client.table("contacts").select("*").eq("org_id", ctx.org_id).execute()
    active_contacts = [c for c in (res.data or []) if not c.get("is_archived", False)]
    
    logger.info(f"Running fuzzy duplicate scan on {len(active_contacts)} contacts (min_similarity={min_similarity})")
    
    suggestions = []
    processed_pairs = set()
    
    # Compare each contact with every other contact
    for i, contact_a in enumerate(active_contacts):
        name_a = contact_a.get("name", "").strip()
        if not name_a or name_a.lower() == "unattributed":
            continue
        
        for j in range(i + 1, len(active_contacts)):
            contact_b = active_contacts[j]
            name_b = contact_b.get("name", "").strip()
            
            if not name_b or name_b.lower() == "unattributed":
                continue
            
            # Create pair ID to avoid duplicate suggestions
            pair_id = tuple(sorted([contact_a["id"], contact_b["id"]]))
            if pair_id in processed_pairs:
                continue
            
            # Calculate similarity using token-based matching (handles variations)
            similarity = fuzz.token_set_ratio(name_a.lower(), name_b.lower())
            
            if similarity >= min_similarity:
                # Additional signals to boost confidence
                reasons = [f"Name similarity: {similarity}% ('{name_a}' vs '{name_b}')"]
                confidence = "Medium"
                
                # Check for matching email/phone to upgrade confidence
                if contact_a.get("email") and contact_b.get("email"):
                    if contact_a["email"].lower() == contact_b["email"].lower():
                        reasons.append("Matching email")
                        confidence = "High"
                
                if contact_a.get("phone") and contact_b.get("phone"):
                    phone_a = ''.join(filter(str.isdigit, contact_a["phone"]))
                    phone_b = ''.join(filter(str.isdigit, contact_b["phone"]))
                    if phone_a == phone_b and len(phone_a) > 6:
                        reasons.append("Matching phone")
                        confidence = "High"
                
                # Pick primary (prefer one with more data)
                score_a = sum([
                    bool(contact_a.get("email")),
                    bool(contact_a.get("phone")),
                    len(contact_a.get("name", "")) > 5
                ])
                score_b = sum([
                    bool(contact_b.get("email")),
                    bool(contact_b.get("phone")),
                    len(contact_b.get("name", "")) > 5
                ])
                
                primary_id = contact_a["id"] if score_a >= score_b else contact_b["id"]
                
                suggestions.append(MergeSuggestion(
                    suggestion_id=str(uuid.uuid4()),
                    contact_ids=[contact_a["id"], contact_b["id"]],
                    confidence=confidence,
                    reasons=reasons,
                    proposed_primary_contact_id=primary_id
                ))
                
                processed_pairs.add(pair_id)
    
    logger.info(f"Found {len(suggestions)} fuzzy duplicate suggestions")
    return suggestions


class ScanProfilesRequest(BaseModel):
    contact_ids: Optional[List[str]] = None

async def process_profile_scan(contact_ids: List[str], org_id: str, raw_token: str):
    """
    Background task to scan services and enrich profiles using PARALLEL processing.
    Processes multiple contacts concurrently for massive performance improvement.
    """
    
    logger.info(f"Starting PARALLEL Profile Scan for {len(contact_ids)} contacts...")
    
    # Update Status
    SCAN_JOB_STATUS["is_running"] = True
    SCAN_JOB_STATUS["total"] = len(contact_ids)
    SCAN_JOB_STATUS["processed"] = 0
    SCAN_JOB_STATUS["status"] = "running"
    SCAN_JOB_STATUS["errors"] = []  # Track errors for reporting
    
    # We use Service Role for reliability in background
    try:
        client = get_service_role_client()
    except Exception as e:
        logger.error(f"Failed to init client for background scan: {e}", exc_info=True)
        SCAN_JOB_STATUS["is_running"] = False
        SCAN_JOB_STATUS["status"] = "failed"
        SCAN_JOB_STATUS["errors"].append(str(e))
        return

    async def process_single_contact(cid: str, index: int):
        """
        Process a single contact's profile enrichment.
        Returns (success: bool, contact_id: str, error: str|None)
        """
        target_user_id = None
        contact_name = "Unknown"
        
        try:
            # 1. Fetch Contact Name & Services & User ID
            c_res = client.table("contacts").select("name, user_id").eq("id", cid).single().execute()
            if not c_res.data:
                logger.warning(f"Contact {cid} not found, skipping")
                return (False, cid, "Contact not found")
                
            contact_name = c_res.data["name"]
            target_user_id = c_res.data["user_id"]

            s_res = client.table("services").select("type, description").eq("contact_id", cid).execute()
            if not s_res.data:
                logger.info(f"No services for {contact_name}, skipping enrichment")
                return (False, cid, "No services to enrich from")
            
            services_text = [f"[{s['type'].upper()}] {s['description']}" for s in s_res.data]
            
            # 2. Run LLM Enrichment (this is the slow I/O operation)
            profile = await enrich_profile_from_services_with_llm(contact_name, services_text)
            
            # 3. Save / Upsert Profile
            existing_prof = client.table("contact_profiles").select("*").eq("contact_id", cid).execute()
            provenance = {}
            if existing_prof.data:
                provenance = existing_prof.data[0].get("field_provenance") or {}
            
            updates = {}
            new_provenance = provenance.copy()
            
            def update_if_allowed(field_key, new_value):
                if new_value is None: return
                if isinstance(new_value, list) and not new_value: return
                # Check provenance - User Verified trumps AI
                if provenance.get(field_key) == "user_verified": return
                updates[field_key] = new_value
                new_provenance[field_key] = "ai_generated"

            # Core Rich fields
            update_if_allowed("bio", profile.message_to_world)
            update_if_allowed("hot_plate", profile.hot_plate)
            update_if_allowed("role_tags", profile.role_tags)
            update_if_allowed("communities", profile.communities)
            update_if_allowed("asset_classes", profile.asset_classes)
            update_if_allowed("i_can_help_with", profile.i_can_help_with)
            update_if_allowed("help_me_with", profile.help_me_with)
            
            # Buy Box (JSON)
            if profile.buy_box:
                 if provenance.get("buy_box") != "user_verified":
                     updates["buy_box"] = profile.buy_box.model_dump()
                     new_provenance["buy_box"] = "ai_generated"

            if updates:
                updates["field_provenance"] = new_provenance
                updates["updated_at"] = datetime.datetime.now().isoformat()
                
                # Check if insert or update
                if existing_prof.data:
                    client.table("contact_profiles").update(updates).eq("contact_id", cid).execute()
                else:
                    updates["contact_id"] = cid
                    if target_user_id:
                        updates["user_id"] = target_user_id
                    client.table("contact_profiles").insert(updates).execute()
                
                logger.info(f"✓ Updated profile for {contact_name} ({cid})")
                return (True, cid, None)
            else:
                logger.info(f"No updates needed for {contact_name}")
                return (True, cid, None)
                
        except Exception as e:
            error_msg = f"Error scanning profile for {contact_name} ({cid}): {e}"
            logger.error(error_msg, exc_info=True)
            return (False, cid, str(e))
    
    # Process contacts in parallel with rate limiting
    # Process in batches to avoid overwhelming LLM API
    BATCH_SIZE = 10  # Process 10 contacts concurrently at a time
    total_processed = 0
    total_success = 0
    total_errors = 0
    
    for batch_start in range(0, len(contact_ids), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(contact_ids))
        batch = contact_ids[batch_start:batch_end]
        
        logger.info(f"Processing batch {batch_start//BATCH_SIZE + 1}: contacts {batch_start + 1}-{batch_end} of {len(contact_ids)}")
        
        # Create tasks for this batch
        tasks = [process_single_contact(cid, i) for i, cid in enumerate(batch, start=batch_start)]
        
        # Execute batch in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for result in results:
            total_processed += 1
            SCAN_JOB_STATUS["processed"] = total_processed
            
            if isinstance(result, Exception):
                total_errors += 1
                error_msg = f"Task raised exception: {result}"
                logger.error(error_msg)
                SCAN_JOB_STATUS["errors"].append(error_msg)
            elif result:
                success, cid, error = result
                if success:
                    total_success += 1
                else:
                    total_errors += 1
                    if error:
                        SCAN_JOB_STATUS["errors"].append(f"{cid}: {error}")

    logger.info(
        f"Profile Scan Complete: {total_success} successful, {total_errors} errors, "
        f"{total_processed} total"
    )
    SCAN_JOB_STATUS["is_running"] = False
    SCAN_JOB_STATUS["status"] = "completed" if total_errors == 0 else "completed_with_errors"
    SCAN_JOB_STATUS["success_count"] = total_success
    SCAN_JOB_STATUS["error_count"] = total_errors

@router.get("/scan-status")
def get_scan_status(ctx: UserContext = Depends(require_admin)):
    """Return the current status of the profile scan job."""
    return SCAN_JOB_STATUS



@router.post("/scan-profiles")
async def scan_profiles(
    background_tasks: BackgroundTasks,
    payload: ScanProfilesRequest = Body(...),
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client),
    token_auth: Any = Depends(require_admin) # Just to ensure admin auth, but we need raw token maybe?
):
    """
    Trigger AI analysis of services to populate rich profiles.
    If contact_ids provided, scans only those.
    Else, scans ALL contacts in org.
    """
    targets = []
    if payload.contact_ids:
        targets = payload.contact_ids
    else:
        # Fetch ALL contacts IDs
        # Warning: This could be large. Pagination?
        # For now, fetch IDs only.
        res = client.table("contacts").select("id").eq("org_id", ctx.org_id).execute()
        if res.data:
            targets = [c['id'] for c in res.data]
    
    if not targets:
        return {"message": "No contacts to scan."}

    # Pass raw token if we need it, but we use Service Key in Background typically
    # We'll pass a placeholder or the token from context if we can access it.
    # We don't have easy access to raw token here without `HTTPBearer` depends returning it.
    # But `process_profile_scan` handles Service Key fallback.
    
    background_tasks.add_task(process_profile_scan, targets, ctx.org_id, "background_token")
    
    return {"message": f"Started profile scan for {len(targets)} contacts."}


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

    # 4.5 Apply merged fields if provided
    merged_updates = {}
    if request.merged_name and request.merged_name.strip():
        merged_updates["name"] = request.merged_name.strip()
    if hasattr(request, 'merged_email') and request.merged_email:
        merged_updates["email"] = request.merged_email.strip()
    if hasattr(request, 'merged_phone') and request.merged_phone:
        merged_updates["phone"] = request.merged_phone.strip()
    
    if merged_updates:
        client.table("contacts").update(merged_updates).eq("id", primary_id).execute()

    # 5. DELETE Duplicates (not archive) - clean database
    # First delete their profiles
    client.table("contact_profiles").delete().in_("contact_id", dup_ids).execute()
    # Then delete the contacts themselves
    client.table("contacts").delete().in_("id", dup_ids).execute()

    # 6. Audit
    try:
        client.table("audit_log").insert({
            "org_id": ctx.org_id,
            "entity_type": "contact",
            "entity_id": primary_id,
            "action": "merged",
            "actor_id": ctx.user.id,
            "changes": {"merged_ids": dup_ids, "deleted": True}
        }).execute()
    except Exception:
        pass
    
    return {"status": "success", "merged_id": primary_id, "deleted_ids": dup_ids}

class ReprocessRequest(BaseModel):
    chat_id: Optional[str] = None
    all_chats: Optional[bool] = False

@router.post("/reprocess_chats", response_model=dict)
async def reprocess_chats(
    request: ReprocessRequest,
    background_tasks: BackgroundTasks,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Trigger re-extraction for one or all meeting chats.
    Uses the new run_core_extraction_logic via background task.
    """
    from app.api.upload import run_core_extraction_logic
    import asyncio

    # Helper wrapper for background task
    async def _reprocess_single(cid, uid, oid, text):
        try:
            # We need a fresh client for background task if possible, 
            # but since we are admin here, passing the current client *might* work 
            # if we trust it doesn't expire immediately. 
            # Safer to just pass the client we have or create new one.
            # Let's rely on the fact we are admin and just run the logic.
            # Note: run_core_extraction_logic is async.
            
            # Since background_tasks.add_task expects a function, we define this wrapper.
            await run_core_extraction_logic(client, cid, uid, oid, text)
        except Exception as e:
            print(f"Reprocess failed for {cid}: {e}")

    # Fetch chats
    query = client.table("meeting_chats").select("id, user_id, org_id, cleaned_text").eq("org_id", ctx.org_id)
    
    if request.chat_id:
        query = query.eq("id", request.chat_id)
    
    # If all_chats is false and no chat_id, error
    if not request.chat_id and not request.all_chats:
         raise HTTPException(status_code=400, detail="Must specify chat_id or all_chats=True")

    res = query.execute()
    chats = res.data
    
    if not chats:
        return {"status": "success", "message": "No chats found to reprocess."}

    # Schedule tasks
    count = 0
    for chat in chats:
        # We use background_tasks to schedule the execution
        # But wait... background tokens.
        # Ideally we pass a fresh client creation inside the task. 
        # For simplicity in this quick implementation, we will define a standalone background func.
        
        # We will reuse process_extraction_background from upload.py if we have the token
        # But we don't have the raw token here easily unless we pass it.
        # Let's import the wrapper from upload.py and use it if possible, 
        # or just define a specific one here.
        
        # Actually, let's just run `run_core_extraction_logic` directly in a loop 
        # if the user asks for *one*. If *all*, we should queue them.
        
        # For robustness, let's just queue `process_extraction_background` logic 
        # but we need to mock the token.
        # Alternate: Just run `run_core_extraction_logic` with the Admin Client.
        
        background_tasks.add_task(run_core_extraction_logic, client, chat['id'], chat['user_id'], chat['org_id'], chat['cleaned_text'])
        count += 1
        
    return {"status": "success", "queued": count, "message": f"Queued {count} chats for reprocessing."}

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
    allowed = {"name", "email", "phone", "links", "profile"} 
    
    # Split updates
    contact_updates = {}
    profile_updates = None
    
    for k, v in payload.items():
        if k == "profile":
            profile_updates = v
        elif k in allowed:
            contact_updates[k] = v

    if not contact_updates and not profile_updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
        
    if contact_updates:
        client.table("contacts").update(contact_updates).eq("id", contact_id).execute()
        
    if profile_updates:
        # Check if profile exists
        res = client.table("contact_profiles").select("id").eq("contact_id", contact_id).execute()
        if res.data:
            # Update
            client.table("contact_profiles").update(profile_updates).eq("contact_id", contact_id).execute()
        else:
            # Insert - need user_id from contact
            contact_res = client.table("contacts").select("user_id").eq("id", contact_id).single().execute()
            if contact_res.data:
                profile_updates["contact_id"] = contact_id
                profile_updates["user_id"] = contact_res.data["user_id"]
                client.table("contact_profiles").insert(profile_updates).execute()
            
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


class SuggestMergeRequest(BaseModel):
    contact_ids: List[str]

@router.post("/contacts/suggest-merge", response_model=MergeProposal)
def suggest_merge(
    request: SuggestMergeRequest,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Analyzes a list of contacts and suggests the best merged profile using AI.
    """
    if len(request.contact_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 contacts required for merge suggestion")

    # Fetch full contact data + profiles
    res = client.table("contacts").select("*, services(*), profile:contact_profiles(*)").in_("id", request.contact_ids).execute()
    contacts = res.data
    
    if len(contacts) < 2:
        raise HTTPException(status_code=404, detail="Contacts not found")

    # Add service count metadata for the LLM
    for c in contacts:
        c["services_count"] = len(c.get("services") or [])
    
    # Generate suggestion
    result = generate_merge_suggestion(contacts)
    
    return MergeProposal(
        name=result.master_name,
        email=result.master_email,
        phone=result.master_phone,
        bio=result.combined_bio,
        hot_plate=result.combined_hot_plate,
        role_tags=result.all_role_tags,
        reasoning=result.reasoning
    )
