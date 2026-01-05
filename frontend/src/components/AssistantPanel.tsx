import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Send, Bot, Loader2, ExternalLink } from 'lucide-react'
import clsx from 'clsx'

interface Message {
    role: 'user' | 'assistant'
    content: string
    data?: any
}

import ChangeRequestModal from './ChangeRequestModal'

export default function AssistantPanel() {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Hello! I can help you find meetings, contacts, or services. What are you looking for?' }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Edit Modal State
    const [editTarget, setEditTarget] = useState<any>(null)
    const [editType, setEditType] = useState<'contact' | 'service'>('contact')
    const [isEditModalOpen, setEditModalOpen] = useState(false)

    const handleEditClick = (target: any, type: 'contact' | 'service') => {
        setEditTarget(target)
        setEditType(type)
        setEditModalOpen(true)
    }

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        const userMsg = input.trim()
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: userMsg }])
        setLoading(true)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/assistant/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ query: userMsg })
            })

            if (!res.ok) {
                throw new Error('Failed to get response')
            }

            const data = await res.json()

            // data format: { assistant_text: string, ui: { intent: string, data: any, count: number } }
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.assistant_text,
                data: data.ui
            }])

        } catch (error) {
            console.error(error)
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-border bg-muted/20">
                <h2 className="font-semibold flex items-center">
                    <Bot className="mr-2 h-5 w-5" />
                    AI Assistant
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map((msg, idx) => (
                    <div key={idx} className={clsx("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
                        <div className={clsx(
                            "max-w-[85%] rounded-lg p-3 text-sm",
                            msg.role === 'user'
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
                        )}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>

                            {/* Render UI Data if present */}
                            {msg.data && msg.data.data && (
                                <div className="mt-3 pt-3 border-t border-border/20">
                                    {msg.data.intent === 'list_chats' && Array.isArray(msg.data.data) && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold opacity-70">Found {msg.data.count} chats:</p>
                                            {msg.data.data.map((chat: any) => (
                                                <div key={chat.id} className="text-xs bg-background/50 p-2 rounded">
                                                    {chat.meeting_name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {msg.data.intent === 'search_contacts' && Array.isArray(msg.data.data) && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold opacity-70">Found {msg.data.count} contacts:</p>
                                            <div className="max-h-60 overflow-y-auto space-y-2">
                                                {msg.data.data.map((contact: any) => (
                                                    <div key={contact.id} className="text-xs bg-background/50 p-2 rounded flex justify-between items-center group">
                                                        <div>
                                                            <div className="font-medium">{contact.name || 'Unknown Name'}</div>
                                                            <div className="text-[10px] opacity-70">{contact.email}</div>
                                                            <div className="text-[10px] opacity-70">{contact.phone}</div>
                                                        </div>
                                                        <button
                                                            className="opacity-0 group-hover:opacity-100 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded transition-opacity"
                                                            onClick={() => handleEditClick(contact, 'contact')}
                                                        >
                                                            Edit
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {msg.data.intent === 'list_services' && Array.isArray(msg.data.data) && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold opacity-70">Found {msg.data.count} services:</p>
                                            <div className="max-h-60 overflow-y-auto space-y-2">
                                                {msg.data.data.map((service: any) => (
                                                    <div key={service.id} className="text-xs bg-background/50 p-2 rounded border-l-2 border-primary group hover:bg-muted transition-colors">
                                                        <div className="flex justify-between">
                                                            <span className={clsx("uppercase text-[10px] px-1 rounded", service.type === 'offer' ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-500")}>
                                                                {service.type}
                                                            </span>
                                                            <span className="text-[10px] opacity-50">{service.contacts?.name}</span>
                                                        </div>
                                                        {service.links && service.links.length > 0 ? (
                                                            <a href={service.links[0]} target="_blank" rel="noopener noreferrer" className="mt-1 block hover:underline text-primary flex items-center justify-between">
                                                                {service.description}
                                                                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                                            </a>
                                                        ) : (
                                                            <div className="mt-1">{service.description}</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {msg.data.intent === 'search_everything' && msg.data.data && (
                                        <div className="space-y-3">
                                            {/* Contacts */}
                                            {msg.data.data.contacts?.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase opacity-50 mb-1">Contacts ({msg.data.data.contacts.length})</p>
                                                    <div className="space-y-1">
                                                        {msg.data.data.contacts.slice(0, 3).map((c: any) => (
                                                            <div key={c.id} className="text-xs bg-background/50 p-1.5 rounded">{c.name || c.email}</div>
                                                        ))}
                                                        {msg.data.data.contacts.length > 3 && <div className="text-[10px] text-center opacity-50">...and {msg.data.data.contacts.length - 3} more</div>}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Services */}
                                            {msg.data.data.services?.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase opacity-50 mb-1">Services ({msg.data.data.services.length})</p>
                                                    <div className="space-y-1">
                                                        {msg.data.data.services.slice(0, 3).map((s: any) => (
                                                            <div key={s.id} className="text-xs bg-background/50 p-1.5 rounded truncate">{s.description}</div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Chats */}
                                            {msg.data.data.chats?.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase opacity-50 mb-1">Chats ({msg.data.data.chats.length})</p>
                                                    <div className="space-y-1">
                                                        {msg.data.data.chats.slice(0, 3).map((c: any) => (
                                                            <div key={c.id} className="text-xs bg-background/50 p-1.5 rounded">{c.meeting_name}</div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {/* Add more UI renderers as needed */}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex items-center text-muted-foreground text-sm">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Thinking...
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-border">
                <form onSubmit={handleSend} className="flex gap-2">
                    <input
                        type="text"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Ask about your meetings..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="inline-flex items-center justify-center rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </form>
            </div>
            {editTarget && (
                <ChangeRequestModal
                    isOpen={isEditModalOpen}
                    onClose={() => setEditModalOpen(false)}
                    target={editTarget}
                    type={editType}
                />
            )}
        </div>
    )
}
