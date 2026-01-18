import json
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from crewai import Agent, Task, Crew, Process
from langchain_core.tools import tool

from app.core.config import settings
from app.services import tools as db_tools
from app.services.llm_factory import get_llm

logger = logging.getLogger(__name__)

# =============================================================================
# TOOLS
# =============================================================================

class DatabaseTools:
    """
    Set of SAFE, READ-ONLY database tools for the Crew.
    """
    
    @tool("Search Contacts")
    def search_contacts(query: str):
        """
        Search for contacts by name, email, or simple keyword. 
        Useful for finding specific people.
        """
        # We need a client. In CrewAI, tools usually don't have context injection easily
        # without custom classes. We'll grab a client from a context variable or 
        # initialize a service role client for this specific 'internal' agent.
        # For safety/RLS, normally we want the user's client. 
        # But for an 'Internal Expert', we might use the admin client and filter by user_id if needed.
        # For this implementation, we will assume we can access a global or contextual client, 
        # OR we will require the agent to pass the user_id implicitly.
        # 
        # Let's use the 'supa_client' passed in the tool's bind or global context if possible.
        # However, for simplicity here, we'll instantiate a fresh client or use the `db_tools` which need a client.
        
        # ACTUALLY: The best pattern for CrewAI + FastAPI + RLS is to pass the 'client' 
        # into the tool constructor if using class-based tools, or look it up.
        # Since these are static @tool decorators, we'll use a ContextVar or similar if strictly needed.
        # But `db_tools` functions require `client`.
        # 
        # WORKAROUND: We will define a class `CrewToolKit` that is initialized with the client.
        pass

class SafeDbSearchTool:
    def __init__(self, client):
        self.client = client

    @tool("Search Contacts Vector")
    def search_contacts(self, query: str):
        """
        Search contacts by semantic query (name, bio, role).
        Use this to find people based on description.
        """
        # This needs to call db_tools.search_contacts(client, query)
        # But 'self' isn't available in the static method decorated by @tool.
        # We will define the tools dynamically or use the `StructuredTool` from langchain.
        pass

# We will use a function-factory approach to generate tools bound to a client
def get_crew_tools(client):
    
    @tool("Search Contacts (Name/Email/Bio)")
    def search_contacts_tool(query: str) -> str:
        """
        Search contacts by text query. Returns JSON list of matches with IDs and names.
        """
        return json.dumps(db_tools.search_contacts(client, query), default=str)

    @tool("Get Contact Details")
    def get_contact_details_tool(contact_id: str) -> str:
        """
        Get full detailed profile of a specific contact by ID.
        Includes bio, asset classes, buy box, etc.
        """
        # We don't have a direct 'get_contact' in db_tools exposed yet, 
        # but search_contacts returns details.
        # Let's reuse search or assume the Analyst needs deep dive.
        # We will just search by ID which works in many search impls, or add a specific get.
        
        # Quick impl using supabase directly for specific ID
        res = client.table("contacts").select("*, contact_profiles(*)").eq("id", contact_id).execute()
        if res.data:
            return json.dumps(res.data[0], default=str)
        return "Contact not found."

    @tool("Advanced Filter (Structured)")
    def advanced_search_tool(
        role_tags: Optional[List[str]] = None,
        asset_classes: Optional[List[str]] = None,
        markets: Optional[List[str]] = None,
        min_price: Optional[float] = None, 
        max_price: Optional[float] = None
    ) -> str:
        """
        Precise database search. Use this when you have specific criteria.
        - role_tags: ['lender', 'buyer', 'gator', 'wholesaler']
        - asset_classes: ['SFH', 'Multifamily', 'Commercial']
        - markets: State codes like ['TX', 'FL', 'MO']
        - min_price/max_price: numeric
        """
        # Ensure lists are lists
        if role_tags and isinstance(role_tags, str): role_tags = [role_tags]
        if asset_classes and isinstance(asset_classes, str): asset_classes = [asset_classes]
        if markets and isinstance(markets, str): markets = [markets]
        
        data = db_tools.advanced_contact_search(
            client,
            role_tags=role_tags,
            asset_classes=asset_classes,
            markets=markets,
            min_price=min_price,
            max_price=max_price
        )
        return json.dumps(data, default=str)

    return [search_contacts_tool, get_contact_details_tool, advanced_search_tool]


# =============================================================================
# AGENTS
# =============================================================================

def create_agents(tools):
    # Use the centralized LLM factory which supports OpenRouter
    llm = get_llm()
    
    # 1. The Data Custodian
    custodian = Agent(
        role='Data Custodian',
        goal='Retrieve accurate data from the database based on strict criteria.',
        backstory="""You are the guardian of the MeetingVault database. 
        You speak SQL (figuratively) and precise JSON. 
        You never guess. You only return what is in the database.
        You take the Analyst's translated requirements and run the correct tool.""",
        tools=tools,
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

    # 2. The Domain Analyst
    analyst = Agent(
        role='Domain Analyst',
        goal='Translate real estate jargon into database filters.',
        backstory="""You are a Real Estate expert. You know that:
        - "Gator" means EMD Lender (Role: lender or gator).
        - "Subto" means Subject-To (Role: subto).
        - "Whale" usually means a Buyer with high max_price (> 1M) or 'investor'.
        - "Hotel" is Commercial asset class.
        Your job is to take the user's intent and give the Custodian precise instructions.""",
        verbose=True,
        allow_delegation=True, # Can delegate to Custodian
        llm=llm
    )

    # 3. The Interaction Manager
    manager = Agent(
        role='Interaction Manager',
        goal='Manage the conversation, handle ambiguity, and ensure helpful responses.',
        backstory="""You are the face of the AI Assistant. 
        - If the user's request is vague ("Find buyers"), ask "Which market?".
        - IF THE USER SAYS "I DON'T KNOW", DO NOT STALL. Suggest defaults (e.g. "I'll check nationwide").
        - You coordinate the Analyst to get data.
        - You format the final answer to be clean and concise.""",
        verbose=True,
        allow_delegation=True, # Delegates to Analyst
        llm=llm
    )
    
    return manager, analyst, custodian

# =============================================================================
# EXECUTION
# =============================================================================

class AssistantResponse(BaseModel):
    text: str
    ui_cards: List[Dict[str, Any]] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)

def run_crew_search(query: str, client) -> AssistantResponse:
    """
    Main entry point to run the CrewAI pipeline.
    """
    tools = get_crew_tools(client)
    manager, analyst, custodian = create_agents(tools)
    
    # Define the process
    # Task 1: Analyze and Search
    # We'll create a single complex task or a sequential set. 
    # For speed, let's do a hierarchical approach or sequential.
    # Manager -> Analyst -> Custodian is the flow.
    
    task_analyze_and_fetch = Task(
        description=f"""
        The user asked: "{query}".
        
        1. Search Phase:
           - Analyze the query for real estate terms.
           - Search the database using the tools.
        
        2. Response Phase:
           - If contacts/services are found, you MUST include their details in the output.
           - If "I don't know" or ambiguity, provide helpful defaults.
           
        CRITICAL OUTPUT FORMAT:
        You must return a valid JSON object (no markdown formatting, just raw JSON) with this structure:
        {{
            "text": "Your friendly conversation response here.",
            "ui_cards": [
                {{
                    "type": "contact",
                    "id": "uuid",
                    "name": "Name",
                    "email": "email@example.com",
                    "phone": "123-456-7890",
                    "location": "City, State",
                    "role_tags": ["tag1"],
                    "match_reason": "Why this result matches"
                }}
            ],
            "suggestions": ["Suggestion 1", "Suggestion 2"]
        }}
        """,
        expected_output="A valid JSON object containing 'text', 'ui_cards', and 'suggestions'.",
        agent=manager
    )
    
    # CrewAI Execution
    crew = Crew(
        agents=[manager, analyst, custodian],
        tasks=[task_analyze_and_fetch],
        verbose=1,
        process=Process.sequential
    )
    
    result_output = crew.kickoff()
    
    # Parse Result
    raw_result = str(result_output)
    
    # Attempt to clean markdown if present (```json ... ```)
    if "```json" in raw_result:
        raw_result = raw_result.split("```json")[1].split("```")[0].strip()
    elif "```" in raw_result:
        raw_result = raw_result.split("```")[1].split("```")[0].strip()
        
    try:
        parsed = json.loads(raw_result)
        return AssistantResponse(
            text=parsed.get("text", raw_result),
            ui_cards=parsed.get("ui_cards", []),
            suggestions=parsed.get("suggestions", [])
        )
    except Exception as e:
        logger.error(f"Failed to parse CrewAI JSON: {e}. Raw: {raw_result}")
        # Fallback
        return AssistantResponse(
            text=raw_result,
            ui_cards=[],
            suggestions=[]
        )
