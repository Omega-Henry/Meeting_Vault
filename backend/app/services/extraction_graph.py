"""
Extraction Graph Module

This module implements a LangGraph-based pipeline for extracting data from
meeting transcripts. The graph processes transcripts through multiple stages:

1. Parse & Chunk - Split transcript into manageable chunks
2. Map Extraction - Parallel LLM analysis of each chunk
3. Summarize - Generate meeting summary
4. Deduplicate & Finalize - Merge results and validate

Features:
- Checkpointing for fault tolerance and resumption
- Parallel chunk processing with asyncio
- Rate-limited LLM calls via llm_factory
"""
import asyncio
import logging
import uuid
from typing import Dict, List, Any, TypedDict, Optional

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import InMemorySaver

from app.services.hybrid_extraction import (
    CleanedMessage, 
    ExtractedMeetingData, 
    IntentAnalysis, 
    MeetingSummary, 
    ExtractedContact, 
    ExtractedService,
    ExtractedProfile,
    parse_transcript_lines, 
    extract_hard_contact_info, 
    analyze_chunk, 
    extract_summary_with_llm, 
    validate_services
)
from app.core.config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION
# =============================================================================

CHUNK_SIZE = 50
CHUNK_OVERLAP = 5  # Overlap to avoid missing context at boundaries


# =============================================================================
# STATE DEFINITION
# =============================================================================

class PipelineState(TypedDict):
    """State maintained throughout the extraction pipeline."""
    transcript: str
    raw_messages: List[CleanedMessage]
    chunks: List[List[CleanedMessage]]
    chunk_results: List[IntentAnalysis]
    summary_result: MeetingSummary
    final_data: Optional[ExtractedMeetingData]


# =============================================================================
# GRAPH NODES
# =============================================================================

async def parse_and_chunk_node(state: PipelineState) -> Dict[str, Any]:
    """
    Parses transcript and creates chunks with overlap.
    Runs heavy parsing in thread to avoid blocking event loop.
    """
    text = state["transcript"]
    logger.info("Parsing transcript...")
    
    def parse_logic():
        raw_messages = parse_transcript_lines(text)
        
        if not raw_messages:
            return {"raw_messages": [], "chunks": []}
            
        # Create chunks with overlap for context continuity
        chunks = []
        total_msgs = len(raw_messages)
        
        if total_msgs <= CHUNK_SIZE:
            chunks.append(raw_messages)
        else:
            start = 0
            while start < total_msgs:
                end = min(start + CHUNK_SIZE, total_msgs)
                chunks.append(raw_messages[start:end])
                
                if end >= total_msgs:
                    break
                    
                # Advance by (CHUNK_SIZE - OVERLAP) for overlapping windows
                start += (CHUNK_SIZE - CHUNK_OVERLAP)
                
        return {"raw_messages": raw_messages, "chunks": chunks}

    result = await asyncio.to_thread(parse_logic)
    logger.info(f"Created {len(result['chunks'])} chunks from {len(result['raw_messages'])} messages.")
    return result


async def extraction_map_node(state: PipelineState) -> Dict[str, Any]:
    """
    Runs extraction on all chunks in parallel.
    Uses asyncio.gather for concurrent processing with rate limiting
    handled by the LLM factory.
    """
    chunks = state["chunks"]
    
    if not chunks:
        return {"chunk_results": []}

    logger.info(f"Starting parallel extraction for {len(chunks)} chunks...")
    
    # Create tasks for parallel execution
    # Rate limiting is handled internally by llm_factory
    tasks = [analyze_chunk(chunk, i) for i, chunk in enumerate(chunks)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    valid_results = []
    for i, res in enumerate(results):
        if isinstance(res, Exception):
            logger.error(f"Chunk {i} extraction failed: {res}")
        elif isinstance(res, IntentAnalysis):
            valid_results.append(res)
        else:
            logger.warning(f"Chunk {i} returned unexpected type: {type(res)}")
            
    logger.info(f"Extraction complete: {len(valid_results)}/{len(chunks)} chunks succeeded")
    return {"chunk_results": valid_results}


async def summary_node(state: PipelineState) -> Dict[str, Any]:
    """Generates meeting summary."""
    text = state["transcript"]
    logger.info("Generating summary...")
    summary = await extract_summary_with_llm(text)
    return {"summary_result": summary}


async def deduplicate_and_finalize_node(state: PipelineState) -> Dict[str, Any]:
    """
    Merges results from all chunks:
    - Deduplicates services
    - Merges rich contact profiles
    - Extracts hard contact info (regex fallback)
    - Runs validation
    - Builds final output
    """
    raw_messages = state["raw_messages"]
    chunk_results = state["chunk_results"]
    summary = state["summary_result"]
    
    logger.info("Deduplicating and finalizing results...")
    
    def finalize_logic():
        # 1. Merge all services with deduplication
        all_services = []
        seen_service_hashes = set()
        
        # 2. Merge Rich Profiles
        profiles_map: Dict[str, ExtractedProfile] = {}
        
        for res in chunk_results:
            # Services
            for svc in res.services:
                svc_id = f"{svc.type}|{svc.contact_name}|{svc.description[:50]}"
                if svc_id not in seen_service_hashes:
                    all_services.append(svc)
                    seen_service_hashes.add(svc_id)
            
            # Profiles - Merge logic
            for prof in res.profiles:
                if prof.name not in profiles_map:
                    profiles_map[prof.name] = prof
                else:
                    existing = profiles_map[prof.name]
                    # Merge Lists (Set logic)
                    existing.communities = list(set(existing.communities + prof.communities))
                    existing.asset_classes = list(set(existing.asset_classes + prof.asset_classes))
                    existing.role_tags = list(set(existing.role_tags + prof.role_tags))
                    
                    # Merge Scalars (Prefer non-null/longer)
                    if not existing.hot_plate and prof.hot_plate:
                        existing.hot_plate = prof.hot_plate
                    if not existing.i_can_help_with and prof.i_can_help_with:
                        existing.i_can_help_with = prof.i_can_help_with
                    if not existing.help_me_with and prof.help_me_with:
                        existing.help_me_with = prof.help_me_with
                    if not existing.message_to_world and prof.message_to_world:
                        existing.message_to_world = prof.message_to_world
                        
                    # Socials
                    if not existing.blinq and prof.blinq:
                        existing.blinq = prof.blinq
                    
                    # Merge Social Links (List of SocialLink objects)
                    for link in prof.social_media:
                        # simple check if platform exists in list?
                        # Since internal storage in extraction is List[SocialLink], we append unique ones
                        exists = any(s.platform.lower() == link.platform.lower() for s in existing.social_media)
                        if not exists:
                            existing.social_media.append(link)
                            
                    # Buy Box (Overwrite if meaningful data present)
                    if prof.buy_box:
                        if not existing.buy_box:
                            existing.buy_box = prof.buy_box
                        elif prof.buy_box.min_price or prof.buy_box.assets:
                            # Simple heuristic: if new one has data, take it. 
                            # Ideally we merge, but buy box is complex.
                            existing.buy_box = prof.buy_box

        # 3. Extract hard contact info (regex-based)
        contacts_map = extract_hard_contact_info(raw_messages)
        
        return all_services, contacts_map, profiles_map

    # Run CPU-bound operations in thread
    all_services, contacts_map, profiles_map = await asyncio.to_thread(finalize_logic)
    
    # Validation uses LLM - must be awaited outside thread
    logger.info(f"Running Relevancy Validator on {len(all_services)} services...")
    validated_services = await validate_services(all_services)
    logger.info(f"Validation complete: {len(validated_services)} services kept")
    
    def build_final_data():
        # Build final contact list
        final_contacts = []
        final_profiles = []
        
        # We start with the contacts_map (Regex) as the base for "Contacts"
        # But we also need to include profiles found by AI even if Regex missed them (rare but possible)
        
        all_names = set(contacts_map.keys()) | set(profiles_map.keys())
        
        for name in all_names:
            # Info from Regex
            regex_info = contacts_map.get(name, {"email": None, "phone": None, "roles": set()})
            
            # Info from AI Profile
            ai_profile = profiles_map.get(name)
            
            # Check relevance: Has service OR has contact info OR has rich profile
            has_service = any(s.contact_name == name for s in validated_services)
            has_contact_data = regex_info["email"] or regex_info["phone"] or regex_info["roles"]
            has_rich_data = ai_profile and (ai_profile.communities or ai_profile.buy_box or ai_profile.role_tags)
            
            if has_service or has_contact_data or has_rich_data:
                # Merge Roles
                roles_list = list(regex_info["roles"])
                if ai_profile:
                    roles_list.extend(ai_profile.role_tags)
                role_str = ", ".join(list(set(roles_list))) if roles_list else None
                
                # Merge Email/Phone (Regex usually better for strict parsing, AI better for context)
                # We prioritize Regex for Email/Phone if available
                email = regex_info["email"]
                phone = regex_info["phone"]
                
                if ai_profile:
                    if not email and ai_profile.email:
                        email = ai_profile.email
                    if not phone and ai_profile.phone:
                        phone = ai_profile.phone
                        
                final_contacts.append(ExtractedContact(
                    name=name,
                    email=email,
                    phone=phone,
                    role=role_str
                ))
                
                if ai_profile:
                    final_profiles.append(ai_profile)
                
        # Filter noise from transcript
        all_noise_ids = set()
        for res in chunk_results:
            all_noise_ids.update(res.noise_message_ids)
            
        final_transcript = [m for m in raw_messages if m.id not in all_noise_ids]
        
        return ExtractedMeetingData(
            contacts=final_contacts,
            services=validated_services,
            summary=summary,
            cleaned_transcript=final_transcript,
            profiles=final_profiles
        )

    final_data = await asyncio.to_thread(build_final_data)
    logger.info(
        f"Finalization complete: {len(final_data.contacts)} contacts, "
        f"{len(final_data.services)} services"
    )
    
    return {"final_data": final_data}


# =============================================================================
# GRAPH CONSTRUCTION
# =============================================================================

# Singleton checkpointer for development
# TODO: Replace with PostgresSaver for production persistence
_checkpointer = InMemorySaver()


def build_extraction_graph():
    """
    Builds the extraction pipeline graph.
    
    Flow:
    parse_chunk -> map_extraction -> summarize -> deduplicate -> END
    """
    workflow = StateGraph(PipelineState)
    
    # Add nodes
    workflow.add_node("parse_chunk", parse_and_chunk_node)
    workflow.add_node("map_extraction", extraction_map_node)
    workflow.add_node("summarize", summary_node)
    workflow.add_node("deduplicate", deduplicate_and_finalize_node)
    
    # Set entry point
    workflow.set_entry_point("parse_chunk")
    
    # Define linear flow
    # Note: Summary and Extraction could run in parallel, but sequential
    # is simpler and the performance impact is minimal vs extraction time
    workflow.add_edge("parse_chunk", "map_extraction")
    workflow.add_edge("map_extraction", "summarize") 
    workflow.add_edge("summarize", "deduplicate")
    workflow.add_edge("deduplicate", END)
    
    # Compile with checkpointer for fault tolerance
    return workflow.compile(checkpointer=_checkpointer)


# Singleton compiled graph
extraction_app = build_extraction_graph()


async def run_extraction_pipeline(
    transcript: str,
    thread_id: Optional[str] = None
) -> ExtractedMeetingData:
    """
    Entry point to run the extraction pipeline.
    
    Args:
        transcript: Raw meeting transcript text
        thread_id: Optional unique ID for checkpointing. If not provided,
                   a new UUID is generated.
    
    Returns:
        ExtractedMeetingData containing contacts, services, summary,
        and cleaned transcript.
    """
    # Generate thread_id if not provided
    if thread_id is None:
        thread_id = str(uuid.uuid4())
    
    initial_state = PipelineState(
        transcript=transcript, 
        raw_messages=[], 
        chunks=[], 
        chunk_results=[], 
        summary_result=MeetingSummary(summary="", key_topics=[]), 
        final_data=None
    )
    
    # Config with thread_id for checkpointing
    config = {"configurable": {"thread_id": thread_id}}
    
    logger.info(f"Starting extraction pipeline (thread_id={thread_id})")
    result = await extraction_app.ainvoke(initial_state, config=config)
    logger.info(f"Extraction pipeline complete (thread_id={thread_id})")
    
    return result["final_data"]
