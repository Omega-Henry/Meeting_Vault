
import asyncio
import sys
import os

# Add backend directory to sys.path to allow imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.services.hybrid_extraction import extract_meeting_data, ExtractedMeetingData
from app.core.config import settings

# Sample transcript provided by user (truncated for relevance but keeping key parts)
SAMPLE_TRANSCRIPT = """
11:58:57 From Isaac Santana to Everyone:
	yes
11:59:02 From Miguel Rascon| SubTo| Gator| San Diego| 619-861-4388 to Everyone:
	yes
11:59:05 From Mel Smith to Everyone:
	Dude duh
12:00:04 From @Carly.Grundmann to Everyone:
	🚐 RSVP (for FREE) to hang with pace at the creative nation tour: www.creativenationtour.com
	 🩷Please no self promotion in the chat 
	
	✌🏻join subto, email: joel.perez@subto.com
12:00:51 From zaza mata to Everyone:
	Pace, thx for all the vidoes and info you provide...i got a question since we talked about lease opriln for this buyer... what is the difference is master lease and a lease option?  and with a lease optikn..how protected is the buyer if the seller defaults or decides to sell to someone else?
12:09:54 From josh wells to Everyone:
	Pace, Thanks for all info, respect buddy… got a question …How can I approach a seller for option to buy in a prime market that appreciation of property is massive in short period of time and interest rates are high? Thanks
12:23:03 From Victor Vizquerra to Everyone:
	Hey Pace - Two questions on lease option: 	How attractive is it to include Seller’s financing in a lease option with a low interest rate? 	For depreciation, how will it work if seller and buyer claim depreciation on the same property?
12:26:49 From Mike V. to Everyone:
	yes but they charge transaction tax
12:31:48 From Gideon Bruwer to Everyone:
	Pace w.r.t. Wrap & Lease Options: have you or someone in the Community tried co-living in tiny homes or Mobile Homes in city parks to fill Wrap or Lease Options, ie Los Angeles Mobile Parks?
"""

async def test_extraction():
    print("Running extraction on user sample transcript...")
    try:
        data: ExtractedMeetingData = await extract_meeting_data(SAMPLE_TRANSCRIPT)
        
        print(f"\nExtracted {len(data.services)} services:")
        
        found_carly = False
        found_zaza = False
        found_miguel_noise = True # Should NOT find Miguel as a service (he just said 'yes')

        for s in data.services:
            print(f" - [{s.type.upper()}] {s.contact_name}: {s.description}")
            
            if "Carly.Grundmann" in s.contact_name and "creativenationtour.com" in s.description:
                found_carly = True
            if "zaza mata" in s.contact_name and "master lease" in s.description.lower(): # Check for verbatim detail presence
                found_zaza = True
            if "Miguel" in s.contact_name and "yes" in s.description.lower():
                found_miguel_noise = False

        print("-" * 30)
        print("VERIFICATION RESULTS:")
        
        if found_carly:
            print("[PASS] Found Carly's Offer with link")
        else:
            print("[FAIL] Missed Carly's Offer or link")

        if found_zaza:
            print("[PASS] Found Zaza's detailed request")
        else:
            print("[FAIL] Missed Zaza's request or detail too summarized")
            
        if found_miguel_noise:
            print("[PASS] Correctly ignored Miguel's 'yes'")
        else:
            print("[FAIL] Incorrectly extracted Miguel's 'yes' as offer/request")

        # Check for Unattributed
        unattributed_count = sum(1 for s in data.services if "unattributed" in s.contact_name.lower())
        if unattributed_count == 0:
             print("[PASS] No Unattributed contacts found")
        else:
             print(f"[FAIL] Found {unattributed_count} Unattributed contacts")
        
        # Check Timestamp Capture (Cleaned Transcript)
        print("\nChecking Cleaned Transcript format...")
        if data.cleaned_transcript:
            first_msg = data.cleaned_transcript[0]
            if first_msg.timestamp:
                print(f"[PASS] Timestamp captured: {first_msg.timestamp}")
            else:
                print("[FAIL] Timestamp MISSING in cleaned transcript")
        else:
            print("[WARN] Cleaned transcript empty (might be all noise?)")

    except Exception as e:
        print(f"Error during extraction: {e}")

if __name__ == "__main__":
    if not settings.OPENROUTER_API_KEY and not settings.OPENAI_API_KEY:
        print("Skipping test: No API Key configured.")
    else:
        asyncio.run(test_extraction())
