import json
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from crewai import Agent, Task, Crew, Process, LLM
from langchain_core.tools import tool

from app.core.config import settings
from app.services import tools as db_tools
# from app.services.llm_factory import get_llm # Deprecated for CrewAI

logger = logging.getLogger(__name__)

# =============================================================================
# TOOLS
# =============================================================================

from crewai.tools import BaseTool
from pydantic import PrivateAttr, Field

# Define Custom Tools using CrewAI BaseTool
class SearchContactsTool(BaseTool):
    name: str = "Search Contacts"
    description: str = "Search contacts by name, email, or bio. Returns JSON list."
    client: Any = Field(description="Supabase client", exclude=True)

    def _run(self, query: str) -> str:
        return json.dumps(db_tools.search_contacts(self.client, query), default=str)

class GetContactDetailsTool(BaseTool):
    name: str = "Get Contact Details"
    description: str = "Get full detailed profile of a specific contact by ID."
    client: Any = Field(description="Supabase client", exclude=True)

    def _run(self, contact_id: str) -> str:
        res = self.client.table("contacts").select("*, contact_profiles(*)").eq("id", contact_id).execute()
        if res.data:
            return json.dumps(res.data[0], default=str)
        return "Contact not found."

class AdvancedSearchTool(BaseTool):
    name: str = "Advanced Structured Search"
    description: str = "Precise database search with filters like role_tags, asset_classes, markets, price."
    client: Any = Field(description="Supabase client", exclude=True)

    def _run(
        self, 
        role_tags: Optional[List[str]] = None, 
        asset_classes: Optional[List[str]] = None, 
        markets: Optional[List[str]] = None, 
        min_price: Optional[float] = None, 
        max_price: Optional[float] = None
    ) -> str:
        # Ensure lists are lists
        if role_tags and isinstance(role_tags, str): role_tags = [role_tags]
        if asset_classes and isinstance(asset_classes, str): asset_classes = [asset_classes]
        if markets and isinstance(markets, str): markets = [markets]
        
        data = db_tools.advanced_contact_search(
            self.client,
            role_tags=role_tags,
            asset_classes=asset_classes,
            markets=markets,
            min_price=min_price,
            max_price=max_price
        )
        return json.dumps(data, default=str)

def get_crew_tools(client):
    return [
        SearchContactsTool(client=client),
        GetContactDetailsTool(client=client),
        AdvancedSearchTool(client=client)
    ]


def create_agents(tools):
    # Use CrewAI's native LLM class which uses LiteLLM under the hood.
    # We point it to OpenRouter.
    # "openai/" prefix tells LiteLLM to use OpenAI-compatible endpoint.
    # If the user has LLM_MODEL set (e.g. "anthropic/claude-3"), we use it. 
    # Default to a smart model effectively.
    
    model_name = settings.LLM_MODEL or "openai/gpt-4o"
    if not model_name.startswith("openai/") and not "/" in model_name:
         # If just "gpt-4o", prepend openai/ for safety with base_url
         model_name = f"openai/{model_name}"

    llm = LLM(
        model=model_name,
        api_key=settings.OPENROUTER_API_KEY,
        base_url=settings.OPENROUTER_BASE_URL
    )
    
    # 1. The Data Custodian
    # (Optional now if Analyst does the work, but we keep it for potential future use or just unused)
    custodian = Agent(
        role='Data Custodian',
        goal='Retrieve accurate data from the database based on strict criteria.',
        backstory="""You are the guardian of the MeetingVault database. 
        You speak SQL (figuratively) and precise JSON. 
        You never guess. You only return what is in the database.""",
        tools=tools,
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

    # 2. The Domain Analyst
    # We give tools to Analyst so it can search directly.
    analyst = Agent(
        role='Domain Analyst',
        goal='Translate user requests into database searches and ALWAYS EXECUTE.',
        backstory="""You are a Real Estate database expert. Your job is to SEARCH the database.

        DOMAIN KNOWLEDGE:
        - "Gator" = EMD Lender (role: lender or gator)
        - "Subto" = Subject-To investor (role: subto)
        - "Whale" = High-value buyer (max_price > 1M)
        - "Park" = Mobile Home Park or RV Park (asset_class: park)
        - "Land" = Vacant land (asset_class: land)
        
        CRITICAL RULES:
        1. ALWAYS RUN A SEARCH when the user asks for contacts, buyers, sellers, lenders, or any real estate role.
        2. If the query is vague, do a BROAD search (e.g. no location filter).
        3. If the user says "nationwide", search WITHOUT a location filter.
        4. NEVER just return "no contacts" without actually running the search tool.
        5. Only skip searching for pure greetings like "hello" or "thanks".""",
        verbose=True,
        tools=tools,
        allow_delegation=False,
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
        allow_delegation=False,
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

def run_crew_search(query: str, messages: List[Dict[str, str]], client) -> AssistantResponse:
    """
    Main entry point to run the CrewAI pipeline.
    """
    tools = get_crew_tools(client)
    manager, analyst, custodian = create_agents(tools)
    
    # Format History
    # We take the last 5 messages to avoid blowing up the context window
    recent_messages = messages[-5:]
    history_context = ""
    if recent_messages:
        history_context = "=== CONVERSATION HISTORY ===\n"
        for msg in recent_messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            history_context += f"{role.upper()}: {content}\n"
        history_context += "============================\n"

    # Define the process
    # Task 1: Search (Assigned to Analyst)
    # This forces the agent to actually use the tools to find data first.
    search_task = Task(
        description=f"""
        {history_context}
        
        The user just asked: "{query}".
        
        YOUR MISSION: Search the database to fulfill the user's request.
        
        ACTIONS:
        1. Parse the query for: role (buyer, seller, lender, gator, subto), asset_class (land, park, multifamily), location (city, state), and other keywords.
        2. RUN the search_contacts or advanced_search tool with appropriate filters.
        3. If the query mentions "nationwide" or doesn't specify location, search WITHOUT location filter.
        4. If the query is just a greeting ("hello") or thanks, return "GREETING_ONLY".
        
        Return the raw search results (JSON list of contacts).
        """,
        expected_output="Raw JSON list of contacts from the database, or 'GREETING_ONLY' for simple greetings.",
        agent=analyst
    )

    # Task 2: Format & Response (Assigned to Manager)
    # This agent takes the findings and formats them for the frontend.
    response_task = Task(
        description=f"""
        Review the search results from the previous task.
        
        The user's original query was: "{query}"
        
        RESPONSE LOGIC:
        
        1. IF findings == "GREETING_ONLY":
           - Reply conversationally (e.g. "Hello! How can I help you find contacts today?").
           - Return empty ui_cards.
           
        2. IF contacts were found (a list of results):
           - In 'text', write a brief summary: "I found X contacts matching your search."
           - DO NOT list contact details in 'text'. Put them in 'ui_cards'.
           - Each ui_card should have: type, id, name, email, phone, location, role_tags, match_reason.
           
        3. IF 0 results were found:
           - Say "No contacts found matching your criteria."
           - Suggest the user try broader terms or different filters.
        
        RULES:
        - NEVER invent contacts. Only use data from the search results.
        - Keep 'text' short and professional.
        
        OUTPUT FORMAT (valid JSON only, no markdown):
        {{
            "text": "Brief summary here",
            "ui_cards": [
                {{
                    "type": "contact",
                    "id": "uuid",
                    "name": "Full Name",
                    "email": "email@example.com",
                    "phone": "555-1234",
                    "location": "City, State",
                    "role_tags": ["buyer", "investor"],
                    "match_reason": "Why this contact matches"
                }}
            ],
            "suggestions": ["Try searching by region", "Filter by role"]
        }}
        """,
        expected_output="A valid JSON object containing 'text', 'ui_cards', and 'suggestions'.",
        agent=manager,
        context=[search_task]
    )

    # CrewAI Execution
    crew = Crew(
        agents=[analyst, manager],
        tasks=[search_task, response_task],
        verbose=True,
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
        # Fallback: Treat the entire raw result as the text response
        return AssistantResponse(
            text=raw_result,
            ui_cards=[],
            suggestions=[]
        )
