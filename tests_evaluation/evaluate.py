import sys
import os
import json
import asyncio
from typing import List, Dict, Any

# Add backend to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.hybrid_extraction import extract_meeting_data, ExtractedMeetingData, CleanedMessage

def load_gold_standard(path: str) -> List[Dict[str, Any]]:
    with open(path, 'r') as f:
        return json.load(f)

def find_matching_message(content: str, extracted_messages: List[CleanedMessage]) -> CleanedMessage | None:
    # Simple substring match or exact match
    for msg in extracted_messages:
        # Normalize whitespace
        clean_target = " ".join(content.split())
        clean_candidate = " ".join(msg.message.split())
        if clean_target in clean_candidate or clean_candidate in clean_target:
            return msg
    return None

def find_matching_service(content: str, extracted_data: ExtractedMeetingData) -> Any | None:
    # Services in extracted data store the original message content in 'description'
    for service in extracted_data.services:
        clean_target = " ".join(content.split())
        clean_candidate = " ".join(service.description.split())
        if clean_target in clean_candidate or clean_candidate in clean_target:
            return service
    return None

async def run_evaluation():
    chat_path = 'tests_evaluation/chat_1.txt'
    gold_path = 'tests_evaluation/gold_standard.json'
    
    # Read chat content
    with open(chat_path, 'r') as f:
        chat_content = f.read()
        
    print(f"Running extraction on {chat_path}...")
    try:
        # Run extraction
        # Note: extract_meeting_data is async or sync? It was defined as async in previous turns.
        # Let's check hybrid_extraction.py content if possible, but assume async based on typical usage.
        # Actually in the code interaction summary, `extract_meeting_data` was used in `upload.py` which is an async route.
        # But `hybrid_extraction.py` might define it as async.
        # Let's try awaiting it.
        extracted_data = await extract_meeting_data(chat_content)
    except Exception as e:
        print(f"Error during extraction: {e}")
        import traceback
        traceback.print_exc()
        return

    print("Extraction complete. Comparing with Gold Standard...")
    gold_standard = load_gold_standard(gold_path)
    
    results = {
        "classification_matches": 0,
        "classification_mismatches": 0,
        "services_found": 0,
        "services_missed": 0,
        "contacts_found": 0,
        "contacts_missed": 0,
        "noise_filtered_correctly": 0,
        "noise_missed": 0
    }
    
    print("\n--- DETAILED COMPARISON ---\n")
    
    for gold in gold_standard:
        print(f"Evaluating: [{gold['sender']}] {gold['content'][:50]}...")
        
        # 1. Check Classification/Noise Filtering
        # If gold classification is 'noise', it should NOT be in cleaned_transcript list (or marked as noise if logic differs)
        # The hybrid logic removes noise from cleaned_transcript IIRC.
        match = find_matching_message(gold['content'], extracted_data.cleaned_transcript)
        
        if gold['classification'] == 'noise':
            if match is None:
                print("  ✅ Correctly filtered as noise.")
                results['noise_filtered_correctly'] += 1
            else:
                print(f"  ❌ Failed to filter noise. Present in transcript.")
                results['noise_missed'] += 1
        else:
            # It should be in the transcript
            if match:
                print(f"  ✅ Found in transcript.")
                # 2. Check Service Extraction
                if 'expected_service' in gold:
                    found_service = find_matching_service(gold['content'], extracted_data)
                    if found_service:
                        print(f"  ✅ Service identified: {found_service.type}")
                        if found_service.type == gold['expected_service']['service_type']:
                            results['services_found'] += 1
                        else:
                             print(f"  ⚠️ Service type mismatch. Expected {gold['expected_service']['service_type']}, got {found_service.type}")
                             results['classification_mismatches'] += 1
                    else:
                        print(f"  ❌ Service NOT extracted.")
                        results['services_missed'] += 1
            else:
                 print(f"  ❌ NOT found in transcript (Incorrectly filtered as noise?)")
    
    print("\n--- SUMMARY ---")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    asyncio.run(run_evaluation())
