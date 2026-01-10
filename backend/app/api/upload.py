from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status, BackgroundTasks, Form
from typing import Optional
from supabase import Client, create_client
from app.dependencies import get_supabase_client, get_user_context, security, UserContext, require_admin
from app.services.ingestion import clean_text, compute_hash
from app.services.hybrid_extraction import extract_meeting_data
from app.services.profile_inference import update_contact_profile_from_services
from app.core.config import settings
from app.schemas import MeetingChatResponse
import json
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

async def process_extraction_background(chat_id: str, user_id: str, org_id: str, cleaned_text: str, auth_token: str):
    """
    Background task to run the heavy AI extraction.
    Creates its own Supabase client to ensure thread/context safety.
    """
    logger.info(f"Starting background extraction for chat {chat_id}")
    
    try:
        # Initialize Supabase Client for this task
        # We use the anon key but set the user's auth token to respect RLS
        client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        client.auth.set_session(access_token=auth_token, refresh_token=auth_token)
        
        # 1. Run Extraction (Async)
        extracted_data = await extract_meeting_data(cleaned_text)
        
        # 2. Update Meeting Chat
        logger.info(f"Updating meeting_chat {chat_id} with summary & cleaned transcript...")
        try:
             client.table("meeting_chats").update({
                "digest_bullets": extracted_data.summary.model_dump(),
                "cleaned_transcript": [m.model_dump() for m in extracted_data.cleaned_transcript]
            }).eq("id", chat_id).execute()
        except Exception as e:
            # Pydantic/Supabase specific errors or Row-not-found if deleted
            logger.error(f"Failed to update meeting_chat {chat_id}: {e}")
            return # Stop if we can't update the chat (likely deleted)

        # 3. Process Contacts & Services
        # Note: This logic duplicates the original sync logic but is now safe in background
        contact_name_to_id = {}
        
        for contact in extracted_data.contacts:
            contact_id = None
            
            # Check existence by Email
            if contact.email:
                res = client.table("contacts").select("id").eq("org_id", org_id).eq("email", contact.email).execute()
                if res.data:
                    contact_id = res.data[0]["id"]
            
            # Check by Name
            if not contact_id:
                res = client.table("contacts").select("id").eq("org_id", org_id).eq("name", contact.name).execute()
                if res.data:
                    contact_id = res.data[0]["id"]
            
            # Check by Phone
            if not contact_id and contact.phone:
                res = client.table("contacts").select("id").eq("org_id", org_id).eq("phone", contact.phone).execute()
                if res.data:
                    contact_id = res.data[0]["id"]
            
            # Create if new
            if not contact_id:
                new_contact = {
                    "user_id": user_id,
                    "org_id": org_id,
                    "name": contact.name,
                    "email": contact.email,
                    "phone": contact.phone
                }
                res = client.table("contacts").insert(new_contact).execute()
                contact_id = res.data[0]["id"]
            
            contact_name_to_id[contact.name] = contact_id

        # Insert Services (with deduplication check)
        for service in extracted_data.services:
            contact_id = contact_name_to_id.get(service.contact_name)
            
            # Fallback for unattributed/hallucinated names
            if not contact_id:
                unattributed_res = client.table("contacts").select("id").eq("org_id", org_id).eq("name", "Unattributed").execute()
                if unattributed_res.data:
                    contact_id = unattributed_res.data[0]["id"]
                else:
                    res = client.table("contacts").insert({
                        "user_id": user_id, 
                        "org_id": org_id,
                        "name": "Unattributed"
                    }).execute()
                    contact_id = res.data[0]["id"]

            # Deduplication: Check if similar service already exists
            existing_service = client.table("services").select("id").eq("contact_id", contact_id).eq("type", service.type).ilike("description", service.description[:50] + "%").execute()
            
            if existing_service.data:
                logger.info(f"Skipping duplicate service: {service.description[:50]}...")
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
        
        # 4. AI Profile Inference - Pre-fill profiles from services
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
            if contact_services:
                await update_contact_profile_from_services(client, contact_id, contact_services)
        
        logger.info(f"Background extraction finished for {chat_id}")

    except Exception as e:
        logger.error(f"Background Task Error for chat {chat_id}: {e}")
        # Mark the chat as failed so it doesn't stay stuck on "Processing..."
        try:
            client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
            client.auth.set_session(access_token=auth_token, refresh_token=auth_token)
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

    # 5. Schedule Background Extraction
    # We pass the raw token string
    raw_token = token_payload.credentials
    background_tasks.add_task(process_extraction_background, chat_id, user_id, org_id, cleaned_text, raw_token)

    return {"status": "success", "id": chat_id, "message": "File uploaded. Extraction started in background."}
