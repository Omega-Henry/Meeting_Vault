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
    
    # Verify ownership
    res = client.table("meeting_chats").select("id").eq("id", chat_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Chat not found or access denied")
        
    # Delete associated services manually since we have ON DELETE SET NULL in schema (oops)
    # Ideally we should have ON DELETE CASCADE. 
    # But we can just delete them here.
    client.table("services").delete().eq("meeting_chat_id", chat_id).execute()
    
    # Delete the chat
    client.table("meeting_chats").delete().eq("id", chat_id).execute()
    
    return {"status": "success", "message": "Chat and associated data deleted."}
