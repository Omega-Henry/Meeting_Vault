
import asyncio
import os
from app.services.hybrid_extraction import enrich_profile_from_services_with_llm
from app.api.admin import process_profile_scan
# Need to mock settings or have env vars loaded
import sys

# Add backend to path
sys.path.append(os.getcwd() + "/backend")

async def test_enrich():
    print("Testing Enrich Logic...")
    name = "Test Investor"
    services = [
        "[OFFER] I have a subto deal in Houston, 3bed 2bath, low entry",
        "[REQUEST] Looking for a Gator lender for EMD on a deal in FL",
        "[OFFER] I am a private money lender, looking to deploy capital"
    ]
    
    profile = await enrich_profile_from_services_with_llm(name, services)
    print("\n--- Result ---")
    print(profile.model_dump_json(indent=2))

if __name__ == "__main__":
    # Load env for OPENROUTER_API_KEY
    from dotenv import load_dotenv
    load_dotenv("backend/.env")
    
    asyncio.run(test_enrich())
