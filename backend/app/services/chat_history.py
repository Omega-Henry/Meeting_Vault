"""
Chat History Manager

Handles persistent AI conversation history storage and retrieval.
Integrates with LangGraph agent to maintain context across sessions.
"""
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import UUID

from supabase import Client
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

logger = logging.getLogger(__name__)


class ChatHistoryManager:
    """Manages persistent chat history for AI assistant conversations."""
    
    def __init__(self, client: Client):
        self.client = client
    
    def create_session(self, user_id: str, org_id: Optional[str] = None, title: Optional[str] = None) -> str:
        """
        Create a new chat session.
        
        Returns:
            Session ID (UUID as string)
        """
        data = {
            "user_id": user_id,
            "title": title or f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        }
        if org_id:
            data["org_id"] = org_id
        
        result = self.client.table("ai_chat_sessions").insert(data).execute()
        
        if result.data:
            session_id = result.data[0]["id"]
            logger.info(f"Created chat session {session_id} for user {user_id}")
            return session_id
        else:
            raise Exception("Failed to create chat session")
    
    def get_or_create_active_session(self, user_id: str, org_id: Optional[str] = None) -> str:
        """
        Get the most recent active session for a user, or create a new one.
        
        Returns:
            Session ID (UUID as string)
        """
        # Get most recent session (within last 24 hours)
        result = self.client.table("ai_chat_sessions") \
            .select("id, created_at") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        
        if result.data:
            session_id = result.data[0]["id"]
            logger.info(f"Using existing session {session_id} for user {user_id}")
            return session_id
        else:
            # No session found, create new one
            return self.create_session(user_id, org_id)
    
    def list_sessions(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        List all chat sessions for a user.
        
        Returns:
            List of session metadata dicts
        """
        result = self.client.table("ai_chat_sessions") \
            .select("id, title, created_at, updated_at") \
            .eq("user_id", user_id) \
            .order("updated_at", desc=True) \
            .limit(limit) \
            .execute()
        
        return result.data or []
    
    def save_message(
        self, 
        session_id: str, 
        role: str, 
        content: str,
        tool_calls: Optional[List[Dict]] = None,
        tool_outputs: Optional[List[Dict]] = None
    ) -> str:
        """
        Save a single message to the session.
        
        Args:
            session_id: Session UUID
            role: 'user', 'assistant', 'system', or 'tool'
            content: Message content
            tool_calls: Optional tool invocations (for assistant messages)
            tool_outputs: Optional tool results (for tool messages)
        
        Returns:
            Message ID
        """
        data = {
            "session_id": session_id,
            "role": role,
            "content": content
        }
        
        if tool_calls:
            data["tool_calls"] = tool_calls
        if tool_outputs:
            data["tool_outputs"] = tool_outputs
        
        result = self.client.table("ai_chat_messages").insert(data).execute()
        
        if result.data:
            return result.data[0]["id"]
        else:
            raise Exception(f"Failed to save message to session {session_id}")
    
    def get_messages(self, session_id: str, limit: int = 50) -> List[BaseMessage]:
        """
        Retrieve messages from a session as LangChain BaseMessage objects.
        
        Args:
            session_id: Session UUID
            limit: Maximum number of recent messages to retrieve
        
        Returns:
            List of LangChain messages (HumanMessage, AIMessage, SystemMessage)
        """
        result = self.client.table("ai_chat_messages") \
            .select("role, content, tool_calls, created_at") \
            .eq("session_id", session_id) \
            .order("created_at", desc=False) \
            .limit(limit) \
            .execute()
        
        messages: List[BaseMessage] = []
        
        for msg in (result.data or []):
            role = msg["role"]
            content = msg["content"]
            
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                # Include tool calls if present
                msg_kwargs = {"content": content}
                if msg.get("tool_calls"):
                    msg_kwargs["additional_kwargs"] = {"tool_calls": msg["tool_calls"]}
                messages.append(AIMessage(**msg_kwargs))
            elif role == "system":
                messages.append(SystemMessage(content=content))
            # Skip 'tool' role messages for now (LangGraph handles these differently)
        
        return messages
    
    def clear_session(self, session_id: str) -> bool:
        """
        Delete all messages in a session (but keep the session).
        
        Returns:
            True if successful
        """
        result = self.client.table("ai_chat_messages") \
            .delete() \
            .eq("session_id", session_id) \
            .execute()
        
        logger.info(f"Cleared messages from session {session_id}")
        return True
    
    def delete_session(self, session_id: str) -> bool:
        """
        Delete a session and all its messages (CASCADE).
        
        Returns:
            True if successful
        """
        result = self.client.table("ai_chat_sessions") \
            .delete() \
            .eq("id", session_id) \
            .execute()
        
        logger.info(f"Deleted session {session_id}")
        return True
    
    def save_conversation(self, session_id: str, messages: List[BaseMessage]) -> None:
        """
        Save a full conversation history to the database.
        Typically called after LangGraph agent completes.
        
        Args:
            session_id: Session UUID
            messages: List of LangChain messages from the conversation
        """
        for msg in messages:
            role = "system"
            if isinstance(msg, HumanMessage):
                role = "user"
            elif isinstance(msg, AIMessage):
                role = "assistant"
            
            # Extract tool calls if present
            tool_calls = msg.additional_kwargs.get("tool_calls") if hasattr(msg, "additional_kwargs") else None
            
            self.save_message(
                session_id=session_id,
                role=role,
                content=msg.content,
                tool_calls=tool_calls
            )
