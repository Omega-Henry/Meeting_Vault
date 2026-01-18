from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status, BackgroundTasks, Form
from typing import Optional
from supabase import Client, create_client
from app.dependencies import get_supabase_client, get_user_context, security, UserContext, require_admin
from app.services.ingestion import clean_text, compute_hash
from app.services.extraction_graph import run_extraction_pipeline
from app.services.profile_inference import update_contact_profile_from_services
from app.core.config import settings
from app.schemas import MeetingChatResponse
import json
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Maximum time for entire extraction (from config or default 5 minutes)
EXTRACTION_TIMEOUT_SECONDS = settings.EXTRACTION_TIMEOUT

async def run_core_extraction_logic(client: Client, chat_id: str, user_id: str, org_id: str, cleaned_text: str):
    """
    Core logic to run extraction pipeline and save results.
    Re-usable by upload and reprocess endpoints.
    """
    import asyncio
    
    # Wrap entire extraction in global timeout
    # Using the new LangGraph pipeline
    extracted_data = await asyncio.wait_for(
        run_extraction_pipeline(cleaned_text),
        timeout=EXTRACTION_TIMEOUT_SECONDS
    )
    
    # Update Meeting Chat (Sync wrapper for blocking DB calls)
    def save_results_sync():
        logger.info(f"Saving results for chat {chat_id} (Sync DB ops)...")
        try:
            client.table("meeting_chats").update({
                "digest_bullets": extracted_data.summary.model_dump(),
                "cleaned_transcript": [m.model_dump() for m in extracted_data.cleaned_transcript]
            }).eq("id", chat_id).execute()
        except Exception as e:
            logger.error(f"Failed to update meeting_chat {chat_id}: {e}")
            raise e

        # 3. Process Contacts & Services
        contact_name_to_id = {}
        newly_created_contact_ids = set()
        
        for contact in extracted_data.contacts:
            # Check existence and merge
            existing_contact = None
            
            # Check by Email
            if contact.email:
                res = client.table("contacts").select("*").eq("user_id", user_id).eq("email", contact.email).execute()
                if res.data:
                    existing_contact = res.data[0]
            
            # Check by Name (Name is less unique, keep Org scope or make User scope? Let's keep Org for Name to avoid merging John Smith across orgs improperly, but Email/Phone are unique identifiers)
            if not existing_contact:
                res = client.table("contacts").select("*").eq("org_id", org_id).eq("name", contact.name).execute()
                if res.data:
                    existing_contact = res.data[0]
            
            # Check by Phone
            if not existing_contact and contact.phone:
                res = client.table("contacts").select("*").eq("user_id", user_id).eq("phone", contact.phone).execute()
                if res.data:
                    existing_contact = res.data[0]
            
            if existing_contact:
                contact_id = existing_contact["id"]
                # Update fields if missing in DB but present in extraction
                updates = {}
                if not existing_contact.get("email") and contact.email:
                    updates["email"] = contact.email
                if not existing_contact.get("phone") and contact.phone:
                    updates["phone"] = contact.phone
                
                if updates:
                    client.table("contacts").update(updates).eq("id", contact_id).execute()
            else:
                # Create if new
                new_contact = {
                    "user_id": user_id,
                    "org_id": org_id,
                    "name": contact.name,
                    "email": contact.email,
                    "phone": contact.phone
                }
                res = client.table("contacts").insert(new_contact).execute()
                contact_id = res.data[0]["id"]
                newly_created_contact_ids.add(contact_id)
            
            contact_name_to_id[contact.name] = contact_id

        contacts_with_services = set()

        for service in extracted_data.services:
            contact_id = contact_name_to_id.get(service.contact_name)
            
            # If contact_name not in our map, create it (LLM may have returned a name not in regex contacts)
            if not contact_id:
                # First, check if this name already exists in the database
                existing_by_name = client.table("contacts").select("id").eq("org_id", org_id).eq("name", service.contact_name).execute()
                if existing_by_name.data:
                    contact_id = existing_by_name.data[0]["id"]
                else:
                    # Create new contact with the actual name from the service
                    res = client.table("contacts").insert({
                        "user_id": user_id, 
                        "org_id": org_id,
                        "name": service.contact_name  # Use actual name, not "Unattributed"
                    }).execute()
                    contact_id = res.data[0]["id"]
                    newly_created_contact_ids.add(contact_id)
                contact_name_to_id[service.contact_name] = contact_id

            # Track that this contact has a service
            contacts_with_services.add(contact_id)

            # Deduplication
            # Deduplication within THIS meeting chat
            existing_service = client.table("services").select("id").eq("meeting_chat_id", chat_id).eq("contact_id", contact_id).eq("type", service.type).ilike("description", service.description[:50] + "%").execute()
            
            if existing_service.data:
                continue

            service_data = {
                "user_id": user_id,
                "contact_id": contact_id,
                "org_id": org_id,
                "meeting_chat_id": chat_id,
                "type": service.type,
                "description": service.description,
                "links": service.links
            }
            client.table("services").insert(service_data).execute()
        
        # Cleanup Orphans: If we created a NEW contact but it ended up having NO services (e.g. invalid service or no service extracted), delete it.
        for cid in newly_created_contact_ids:
            if cid not in contacts_with_services:
                logger.info(f"Deleting orphan contact {cid} (created but no services added).")
                client.table("contacts").delete().eq("id", cid).execute()
        
        # 4. AI Profile Inference (Run blocking sync updates)
        logger.info("Starting AI profile inference...")
        for contact_name, contact_id in contact_name_to_id.items():
            if contact_name == "Unattributed":
                continue
            # Get this contact's services
            contact_services = [
                {"type": s.type, "description": s.description}
                for s in extracted_data.services 
                if s.contact_name == contact_name
            ]
            # Get roles from the contact data (e.g. "Gator Lender, Subto Student")
            contact_roles = []
            for c in extracted_data.contacts:
                if c.name == contact_name and c.role:
                        contact_roles = [r.strip() for r in c.role.split(',')]
            
            if contact_services or contact_roles:
                update_contact_profile_from_services(client, contact_id, user_id, contact_services, contact_roles)



        # 5. Save Rich Profiles (Explicit AI Extraction)
        logger.info("Saving Extracted Rich Profiles...")
        for profile in extracted_data.profiles:
            contact_id = contact_name_to_id.get(profile.name)
            if not contact_id:
                    continue 
            
            # Check existing profile
            existing_profile_res = client.table("contact_profiles").select("*").eq("contact_id", contact_id).execute()
            provenance = {}
            existing_data = {}
            if existing_profile_res.data:
                existing_data = existing_profile_res.data[0]
                provenance = existing_data.get("field_provenance") or {}
            
            updates = {}
            new_provenance = provenance.copy()

            def update_if_allowed(field_key, new_value):
                # Update if:
                # 1. New value exists matches database schema types (lists vs scalars)
                # 2. Existing field is empty OR Existing field is 'ai_generated' (we trust this explicit extraction more than regex)
                # 3. Existing field is NOT 'user_verified'
                
                if new_value is None:
                    return
                if isinstance(new_value, list) and not new_value:
                    return
                
                # Check provenance
                field_status = provenance.get(field_key)
                if field_status == "user_verified":
                    return
                    
                # Prepare update
                updates[field_key] = new_value
                new_provenance[field_key] = "ai_generated"

            # Map content
            update_if_allowed("bio", profile.message_to_world)
            update_if_allowed("hot_plate", profile.hot_plate)
            update_if_allowed("i_can_help_with", profile.i_can_help_with)
            update_if_allowed("help_me_with", profile.help_me_with)
            update_if_allowed("message_to_world", profile.message_to_world)
            
            update_if_allowed("communities", profile.communities)
            update_if_allowed("asset_classes", profile.asset_classes)
            update_if_allowed("role_tags", profile.role_tags)
            
            if profile.buy_box:
                # Flat fields
                update_if_allowed("min_target_price", profile.buy_box.min_price)
                update_if_allowed("max_target_price", profile.buy_box.max_price)
                
                # JSONB field
                # Merge logic for buy_box JSON? Or just overwrite?
                # Overwrite is safer for consistency if AI generated
                update_if_allowed("buy_box", profile.buy_box.model_dump())

            # Socials
            update_if_allowed("blinq", profile.blinq)
            update_if_allowed("website", profile.website)
            
            # Convert List[SocialLink] to Dict for DB
            social_dict = {}
            for link in profile.social_media:
                social_dict[link.platform] = link.url
            update_if_allowed("social_media", social_dict)

            if updates:
                updates["field_provenance"] = new_provenance
                updates["updated_at"] = "now()"
                
                if existing_profile_res.data:
                    client.table("contact_profiles").update(updates).eq("contact_id", contact_id).execute()
                else:
                    updates["contact_id"] = contact_id
                    updates["user_id"] = user_id 
                    client.table("contact_profiles").insert(updates).execute()
    
    # Execute the sync DB part in a thread (Create/Update Contacts & Services)
    contact_name_to_id = await asyncio.to_thread(save_results_sync)

    # 4b. AI Profile Enrichment (LLM) - Async
    if contact_name_to_id:
        from app.services.hybrid_extraction import enrich_contact_profiles
        names_to_enrich = [n for n in contact_name_to_id.keys() if n != 'Unattributed']
        
        if names_to_enrich:
            logger.info(f"Enriching profiles for {len(names_to_enrich)} contacts...")
            try:
                rich_profiles = await enrich_contact_profiles(cleaned_text, names_to_enrich)
                logger.info(f"Enrichment complete. Found {len(rich_profiles)} profiles.")
                
                # Save Rich Profiles (Sync DB ops)
                await asyncio.to_thread(save_rich_profiles_sync, client, contact_name_to_id, rich_profiles, user_id)
                
            except Exception as e:
                logger.error(f"Enrichment failed: {e}", exc_info=True)


async def process_extraction_background(chat_id: str, user_id: str, org_id: str, cleaned_text: str, auth_token: str):
    """
    Background task to run the heavy AI extraction.
    Creates its own Supabase client to ensure thread/context safety.
    Wrapped in global timeout for serverless reliability.
    """
    import asyncio
    logger.info(f"Starting background extraction for chat {chat_id}")
    
    # Create client. Use Service Role Key if available for robustness (no expiry/RLS blocks)
    # Otherwise fallback to user token, but that risks expiry during long tasks.
    if settings.SUPABASE_SERVICE_ROLE_KEY:
        client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        # No need to set session for service role (it's admin)
        logger.info("Using Service Role Key for extraction task.")
    else:
        client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        client.auth.set_session(access_token=auth_token, refresh_token=auth_token)
        logger.warning("Using User Token for extraction task (risk of expiry).")
    
    try:
        await run_core_extraction_logic(client, chat_id, user_id, org_id, cleaned_text)
        logger.info(f"Background extraction AND saving finished for {chat_id}")

    except asyncio.TimeoutError:
        logger.error(f"Extraction timed out for chat {chat_id} after {EXTRACTION_TIMEOUT_SECONDS}s")
        try:
            client.table("meeting_chats").update({
                "digest_bullets": {
                    "summary": "Extraction timed out. Chat may be too large. Try splitting into smaller parts.",
                    "key_topics": []
                }
            }).eq("id", chat_id).execute()
        except Exception as update_err:
            logger.error(f"Failed to mark chat as timed out: {update_err}")

    except Exception as e:
        logger.error(f"Background Task Error for chat {chat_id}: {e}")
        try:
            client.table("meeting_chats").update({
                "digest_bullets": {
                    "summary": f"Extraction failed: {str(e)[:100]}. Please delete and re-upload.",
                    "key_topics": []
                }
            }).eq("id", chat_id).execute()
            logger.info(f"Marked chat {chat_id} as failed")
        except Exception as update_err:
            logger.error(f"Failed to mark chat as failed: {update_err}")

@router.post("/upload-meeting-chat", response_model=dict)
async def upload_meeting_chat(
    background_tasks: BackgroundTasks,
    meeting_name: Optional[str] = Form(None),
    file: UploadFile = File(...),
    client: Client = Depends(get_supabase_client),
    ctx: UserContext = Depends(get_user_context),
    admin_ctx: UserContext = Depends(require_admin), # Enforce Admin
    token_payload = Depends(security) # Need raw token for background task
):

    # 1. Read file
    try:
        content = await file.read()
        text = content.decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file encoding. Please upload UTF-8 text files.")

    # 2. Ingestion Pipeline
    cleaned_text = clean_text(text)
    chat_hash = compute_hash(cleaned_text)
    user_id = ctx.user.id
    org_id = ctx.org_id

    # 3. Check for duplicates
    existing = client.table("meeting_chats").select("id").eq("org_id", org_id).eq("chat_hash", chat_hash).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="This meeting chat has already been uploaded.")

    # 4. Insert into meeting_chats (Initial State)
    meeting_data = {
        "user_id": user_id,
        "org_id": org_id,
        "telegram_chat_id": "unknown", 
        "meeting_name": meeting_name or file.filename or "Untitled Meeting",
        "chat_hash": chat_hash,
        "cleaned_text": cleaned_text,
        "digest_bullets": {"summary": "Processing...", "key_topics": []} # Placeholder
    }
    
    try:
        chat_res = client.table("meeting_chats").insert(meeting_data).execute()
        chat_id = chat_res.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save meeting chat: {str(e)}")

    # 5. Schedule Background Extraction using FastAPI BackgroundTasks
    # This is standard and reliable for FastAPI apps
    raw_token = token_payload.credentials
    background_tasks.add_task(process_extraction_background, chat_id, user_id, org_id, cleaned_text, raw_token)

    return {"status": "success", "id": chat_id, "message": "File uploaded. Extraction started in background."}

def save_rich_profiles_sync(client: Client, contact_name_to_id: dict, profiles: list, user_id: str):
    logger.info(f"Saving {len(profiles)} rich profiles (sync)...")
    for profile in profiles:
        contact_id = contact_name_to_id.get(profile.name)
        if not contact_id:
            continue 
        
        # Check existing profile
        existing_profile_res = client.table("contact_profiles").select("*").eq("contact_id", contact_id).execute()
        provenance = {}
        if existing_profile_res.data:
            provenance = existing_profile_res.data[0].get("field_provenance") or {}
        
        updates = {}
        new_provenance = provenance.copy()

        def update_if_allowed(field_key, new_value):
            if new_value is None: return
            if isinstance(new_value, list) and not new_value: return
            
            # Check provenance
            field_status = provenance.get(field_key)
            if field_status == "user_verified": return
                
            updates[field_key] = new_value
            new_provenance[field_key] = "ai_generated"

        # Map content
        update_if_allowed("bio", profile.message_to_world)
        update_if_allowed("hot_plate", profile.hot_plate)
        update_if_allowed("i_can_help_with", profile.i_can_help_with)
        update_if_allowed("help_me_with", profile.help_me_with)
        update_if_allowed("message_to_world", profile.message_to_world)
        
        update_if_allowed("communities", profile.communities)
        update_if_allowed("asset_classes", profile.asset_classes)
        update_if_allowed("role_tags", profile.role_tags)
        
        if profile.buy_box:
            update_if_allowed("min_target_price", profile.buy_box.min_price)
            update_if_allowed("max_target_price", profile.buy_box.max_price)
            update_if_allowed("buy_box", profile.buy_box.model_dump())

        update_if_allowed("blinq", profile.blinq)
        update_if_allowed("website", profile.website)
        
        social_dict = {}
        for link in profile.social_media:
            social_dict[link.platform] = link.url
        update_if_allowed("social_media", social_dict)

        if updates:
            updates["field_provenance"] = new_provenance
            updates["updated_at"] = "now()"
            
            if existing_profile_res.data:
                client.table("contact_profiles").update(updates).eq("contact_id", contact_id).execute()
            else:
                updates["contact_id"] = contact_id
                updates["user_id"] = user_id 
                client.table("contact_profiles").insert(updates).execute()
