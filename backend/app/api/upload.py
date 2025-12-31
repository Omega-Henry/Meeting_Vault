from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from supabase import Client
from app.dependencies import get_supabase_client, get_current_user
from app.services.ingestion import clean_text, compute_hash
from app.services.hybrid_extraction import extract_meeting_data
from app.schemas import MeetingChatResponse
import json

router = APIRouter()

@router.post("/upload-meeting-chat", response_model=dict)
async def upload_meeting_chat(
    file: UploadFile = File(...),
    client: Client = Depends(get_supabase_client),
    user = Depends(get_current_user)
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
    user_id = user.id

    # 3. Check for duplicates (using the unique index on user_id, chat_hash)
    # We can try to insert and catch error, or check first.
    # Checking first is friendlier for the response.
    
    existing = client.table("meeting_chats").select("id").eq("user_id", user_id).eq("chat_hash", chat_hash).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="This meeting chat has already been uploaded.")

    # 4. Insert into meeting_chats
    meeting_data = {
        "user_id": user_id,
        "telegram_chat_id": "unknown", # Placeholder
        "meeting_name": file.filename or "Untitled Meeting",
        "chat_hash": chat_hash,
        "cleaned_text": cleaned_text,
        "digest_bullets": [] # Placeholder for future AI summary
    }
    
    try:
        chat_res = client.table("meeting_chats").insert(meeting_data).execute()
        chat_id = chat_res.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save meeting chat: {str(e)}")

    # 5. Extract Data using LLM
    try:
        extracted_data = extract_meeting_data(cleaned_text)
    except Exception as e:
        # Fallback or error? For now, log and fail, or we could fallback to regex.
        # But user specifically requested better extraction.
        print(f"LLM Extraction failed: {e}")
        # Create a basic summary saying extraction failed
        extracted_data = None

    if extracted_data:
        # Update meeting with summary
        client.table("meeting_chats").update({
            "digest_bullets": extracted_data.summary.model_dump(),
            "cleaned_transcript": [m.model_dump() for m in extracted_data.cleaned_transcript]
        }).eq("id", chat_id).execute()

        # Process Contacts
        contact_name_to_id = {}
        
        for contact in extracted_data.contacts:
            # Check existence by Email (if present) or Name
            contact_id = None
            
            if contact.email:
                res = client.table("contacts").select("id").eq("user_id", user_id).eq("email", contact.email).execute()
                if res.data:
                    contact_id = res.data[0]["id"]
            
            if not contact_id:
                # Check by Name
                res = client.table("contacts").select("id").eq("user_id", user_id).eq("name", contact.name).execute()
                if res.data:
                    contact_id = res.data[0]["id"]
            
            if not contact_id and contact.phone:
                # Check by Phone
                res = client.table("contacts").select("id").eq("user_id", user_id).eq("phone", contact.phone).execute()
                if res.data:
                    contact_id = res.data[0]["id"]
            
            if not contact_id:
                # Create
                new_contact = {
                    "user_id": user_id,
                    "name": contact.name,
                    "email": contact.email,
                    "phone": contact.phone
                    # "role": contact.role # Column missing in DB currently
                }
                res = client.table("contacts").insert(new_contact).execute()
                contact_id = res.data[0]["id"]
            
            contact_name_to_id[contact.name] = contact_id

        # Process Services
        for service in extracted_data.services:
            # Find contact ID
            contact_id = contact_name_to_id.get(service.contact_name)
            
            # If not found (maybe name mismatch), try to find "Unattributed" or create the contact
            if not contact_id:
                # Try to find contact by name again in case LLM hallucinated a slight variation
                # For now, fallback to Unattributed
                unattributed_res = client.table("contacts").select("id").eq("user_id", user_id).eq("name", "Unattributed").execute()
                if unattributed_res.data:
                    contact_id = unattributed_res.data[0]["id"]
                else:
                    res = client.table("contacts").insert({"user_id": user_id, "name": "Unattributed"}).execute()
                    contact_id = res.data[0]["id"]

            service_data = {
                "user_id": user_id,
                "contact_id": contact_id,
                "meeting_chat_id": chat_id,
                "type": service.type,
                "description": service.description,
                "links": service.links
            }
            client.table("services").insert(service_data).execute()

    return {"status": "success", "id": chat_id, "message": "File uploaded and processed successfully."}
