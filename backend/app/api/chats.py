from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from app.dependencies import get_supabase_client, get_current_user

router = APIRouter()

@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    client: Client = Depends(get_supabase_client),
    user = Depends(get_current_user)
):
    user_id = user.id
    
    # Delete the chat
    # We rely on ON DELETE CASCADE in the database to remove services.
    # User must run: ALTER TABLE services DROP CONSTRAINT services_meeting_chat_id_fkey; ...
    
    # Delete the chat
    client.table("meeting_chats").delete().eq("id", chat_id).execute()
    
    return {"status": "success", "message": "Chat and associated data deleted."}
