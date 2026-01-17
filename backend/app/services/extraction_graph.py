import asyncio
import logging
from typing import Annotated, Dict, List, Any, TypedDict
from langgraph.graph import StateGraph, END
from app.services.hybrid_extraction import (
    CleanedMessage, 
    ExtractedMeetingData, 
    IntentAnalysis, 
    MeetingSummary, 
    ExtractedContact, 
    ExtractedService,
    parse_transcript_lines, 
    extract_hard_contact_info, 
    analyze_chunk, 
    extract_summary_with_llm, 
    validate_services
)

# --- Logging ---
logger = logging.getLogger(__name__)

# --- Configuration ---
CHUNK_SIZE = 50
CHUNK_OVERLAP = 5  # Number of messages to overlap between chunks

# --- State Definition ---
class PipelineState(TypedDict):
    transcript: str
    raw_messages: List[CleanedMessage]
    chunks: List[List[CleanedMessage]]
    chunk_results: List[IntentAnalysis]
    summary_result: MeetingSummary
    final_data: ExtractedMeetingData

# --- Nodes ---

def parse_and_chunk_node(state: PipelineState) -> Dict[str, Any]:
    """Parses transcript and creates chunks with overlap."""
    text = state["transcript"]
    logger.info("Parsing transcript...")
    raw_messages = parse_transcript_lines(text)
    
    if not raw_messages:
        logger.warning("No messages parsed.")
        return {"raw_messages": [], "chunks": []}
        
    # Create chunks with overlap
    chunks = []
    total_msgs = len(raw_messages)
    
    if total_msgs <= CHUNK_SIZE:
        chunks.append(raw_messages)
    else:
        start = 0
        while start < total_msgs:
            end = min(start + CHUNK_SIZE, total_msgs)
            chunks.append(raw_messages[start:end])
            
            # Stop if we reached the end
            if end >= total_msgs:
                break
                
            # Move start pointer forward by (CHUNK_SIZE - OVERLAP)
            # This ensures the next chunk starts 'overlap' messages before the current one ended
            start += (CHUNK_SIZE - CHUNK_OVERLAP)

    logger.info(f"Created {len(chunks)} chunks from {total_msgs} messages (Overlap={CHUNK_OVERLAP}).")
    return {"raw_messages": raw_messages, "chunks": chunks}

async def extraction_map_node(state: PipelineState) -> Dict[str, Any]:
    """Runs extraction on all chunks in parallel."""
    chunks = state["chunks"]
    
    if not chunks:
        return {"chunk_results": []}

    logger.info(f"Starting parallel extraction for {len(chunks)} chunks...")
    
    # Map step: create task for each chunk
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
            
    return {"chunk_results": valid_results}

async def summary_node(state: PipelineState) -> Dict[str, Any]:
    """Generates meeting summary in parallel (conceptually)."""
    # In a DAG, this can run parallel to map node if dependencies allow, 
    # but here we just run it as a node.
    text = state["transcript"]
    logger.info("Generating summary...")
    summary = await extract_summary_with_llm(text)
    return {"summary_result": summary}

async def deduplicate_and_finalize_node(state: PipelineState) -> Dict[str, Any]:
    """Merges results, deduplicates services/contacts, and builds final object."""
    raw_messages = state["raw_messages"]
    chunk_results = state["chunk_results"]
    summary = state["summary_result"]
    
    logger.info("Deduplicating and finalizing results...")
    
    # 1. Merge all services
    all_services = []
    seen_service_hashes = set()
    
    for res in chunk_results:
        for svc in res.services:
            # Simple content hash for deduplication (overlap might cause exact dupes)
            # Create unique key based on type, description, and contact
            svc_id = f"{svc.type}|{svc.contact_name}|{svc.description[:50]}"
            if svc_id not in seen_service_hashes:
                all_services.append(svc)
                seen_service_hashes.add(svc_id)
    
    # 2. Extract Hard Contact Info (Pass 1 - Regex + Roles)
    contacts_map = extract_hard_contact_info(raw_messages)
    
    # 3. Validation (Optional Step - can be its own node, but fine here)
    logger.info("Running Relevancy Validator...")
    validated_services = await validate_services(all_services)
    
    # 4. Build Final Contact List
    final_contacts = []
    for name, info in contacts_map.items():
        # Check if contact is relevant (has service OR valid info)
        has_service = any(s.contact_name == name for s in validated_services)
        has_contact_data = info["email"] or info["phone"] or info["roles"]
        
        if has_service or has_contact_data:
            role_str = ", ".join(info["roles"]) if info["roles"] else None
            final_contacts.append(ExtractedContact(
                name=name,
                email=info["email"],
                phone=info["phone"],
                role=role_str
            ))
            
    # 5. Filter noise from transcript for 'cleaned_transcript' view
    # Collect all noise IDs
    all_noise_ids = set()
    for res in chunk_results:
        all_noise_ids.update(res.noise_message_ids)
        
    final_transcript = [m for m in raw_messages if m.id not in all_noise_ids]
    
    final_data = ExtractedMeetingData(
        contacts=final_contacts,
        services=validated_services,
        summary=summary,
        cleaned_transcript=final_transcript
    )
    
    return {"final_data": final_data}


# --- Graph Construction ---

def build_extraction_graph():
    workflow = StateGraph(PipelineState)
    
    # Add Nodes
    workflow.add_node("parse_chunk", parse_and_chunk_node)
    workflow.add_node("map_extraction", extraction_map_node)
    workflow.add_node("summarize", summary_node)
    workflow.add_node("deduplicate", deduplicate_and_finalize_node)
    
    # Set Entry Point
    workflow.set_entry_point("parse_chunk")
    
    # Define Flow
    # We branch execution: parse -> (extract, summarize) -> deduplicate
    # LangGraph supports parallel branches via 'map' or just defining edges from one node to multiple?
    # Actually, standard LangGraph flows are usually linear or conditional. 
    # To run Summary and Extract in parallel, we can put them in the same "stage" if using pure asyncio,
    # or just run them sequentially for simplicity in this MVP graph.
    # Let's run them sequentially for now to avoid complexity, or use asyncio.gather inside a wrapper node?
    # Better: sequence. Impact of parallelizing summary vs extract is minimal compared to extract duration.
    
    workflow.add_edge("parse_chunk", "map_extraction")
    workflow.add_edge("map_extraction", "summarize") 
    workflow.add_edge("summarize", "deduplicate")
    workflow.add_edge("deduplicate", END)
    
    return workflow.compile()

# Singleton for reuse
extraction_app = build_extraction_graph()

async def run_extraction_pipeline(transcript: str) -> ExtractedMeetingData:
    """Entry point to run the pipeline."""
    initial_state = PipelineState(
        transcript=transcript, 
        raw_messages=[], 
        chunks=[], 
        chunk_results=[], 
        summary_result=MeetingSummary(summary="", key_topics=[]), 
        final_data=None # Placeholder
    )
    
    result = await extraction_app.ainvoke(initial_state)
    return result["final_data"]
