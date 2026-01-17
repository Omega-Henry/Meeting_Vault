import asyncio
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# Manually load if not expecting .env in CWD
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not url or not key:
    print("Missing SUPABASE_URL or Key")
    # Try to import from app settings
    try:
        from app.core.config import settings
        url = settings.SUPABASE_URL
        key = settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_ANON_KEY
        print("Loaded from app settings")
    except ImportError:
        print("Could not load settings")
        exit(1)

print(f"Connecting to {url}")
client = create_client(url, key)

def check_latest_chat():
    res = client.table("meeting_chats").select("*").order("created_at", desc=True).limit(1).execute()
    if not res.data:
        print("No chats found.")
        return

    chat = res.data[0]
    print(f"Latest Chat ID: {chat['id']}")
    print(f"Name: {chat['meeting_name']}")
    print(f"Created At: {chat['created_at']}")
    print(f"Digest Bullets: {chat.get('digest_bullets')}")
    
    summary = chat.get('digest_bullets', {}).get('summary')
    print(f"Summary Field: '{summary}'")

    if summary == "Processing...":
        print("STATUS: STUCK IN PROCESSING")
    else:
        print("STATUS: DONE (or failed with message)")

if __name__ == "__main__":
    check_latest_chat()
