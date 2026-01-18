
import asyncio
import os
import sys

sys.path.append(os.path.join(os.getcwd(), 'backend'))

from supabase import create_client
from app.core.config import settings

async def main():
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
    client = create_client(url, key)
    
    print("Fetching contacts with service counts...")
    # Fetch contacts with services
    res = client.table("contacts").select("id, name, services(id)").execute()
    
    total = len(res.data)
    zero_services = 0
    names = []
    
    for c in res.data:
        s_count = len(c.get('services', []))
        if s_count == 0:
            zero_services += 1
            names.append(c['name'])
            
    print(f"Total Contacts: {total}")
    print(f"Contacts with 0 services: {zero_services}")
    if names:
        print(f"Examples: {names[:5]}")
    
    # Check top 5 contacts
    print("\nChecking Top 5 Contacts for Profile Data...")
    res = client.table("contacts").select("name, profile:contact_profiles(*)").limit(5).execute()
    for c in res.data:
        name = c['name']
        p = c.get('profile')
        if isinstance(p, list): p = p[0] if p else {}
        elif p is None: p = {}
        
        bio = p.get('bio')
        hot_plate = p.get('hot_plate')
        print(f"Name: {name} | Bio: {bio} | HotPlate: {hot_plate}")

if __name__ == "__main__":
    asyncio.run(main())
