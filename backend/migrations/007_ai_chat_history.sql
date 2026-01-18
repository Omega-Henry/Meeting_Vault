-- Migration 007: AI Chat History Tables
-- Creates tables for persistent AI conversation history per user

-- AI Chat Sessions
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT,  -- Optional session title
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- AI Chat Messages
CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB,  -- Store LangGraph tool invocations
    tool_outputs JSONB,  -- Store tool results
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_ai_chat_sessions_user_id ON ai_chat_sessions(user_id);
CREATE INDEX idx_ai_chat_sessions_org_id ON ai_chat_sessions(org_id);
CREATE INDEX idx_ai_chat_messages_session_id ON ai_chat_messages(session_id);
CREATE INDEX idx_ai_chat_messages_created_at ON ai_chat_messages(created_at);

-- RLS Policies: Users can only access their own sessions
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own chat sessions
CREATE POLICY "Users can only access their own chat sessions"
ON ai_chat_sessions FOR ALL
USING (user_id = auth.uid());

-- Policy: Users can only see messages from their own sessions
CREATE POLICY "Users can only access messages from their sessions"
ON ai_chat_messages FOR ALL
USING (
    session_id IN (
        SELECT id FROM ai_chat_sessions WHERE user_id = auth.uid()
    )
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ai_chat_sessions 
    SET updated_at = now() 
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session timestamp when new message added
CREATE TRIGGER update_session_on_message
AFTER INSERT ON ai_chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_ai_session_timestamp();

-- Comments for documentation
COMMENT ON TABLE ai_chat_sessions IS 'Stores AI assistant conversation sessions per user';
COMMENT ON TABLE ai_chat_messages IS 'Stores individual messages within AI chat sessions';
COMMENT ON COLUMN ai_chat_messages.role IS 'Message role: user (human input), assistant (AI response), system (context), tool (function call)';
COMMENT ON COLUMN ai_chat_messages.tool_calls IS 'JSON array of tool invocations made by the assistant';
COMMENT ON COLUMN ai_chat_messages.tool_outputs IS 'JSON array of tool execution results';
