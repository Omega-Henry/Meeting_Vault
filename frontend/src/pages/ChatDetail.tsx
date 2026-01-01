import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ChevronDown, ChevronRight, User, Briefcase, Trash2, Pencil, Check, X } from 'lucide-react'

export default function ChatDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [chat, setChat] = useState<any>(null)
    const [services, setServices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showTranscript, setShowTranscript] = useState<'cleaned' | 'raw' | null>('cleaned')
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [newTitle, setNewTitle] = useState('')

    useEffect(() => {
        const fetchData = async () => {
            if (!id) return

            const chatRes = await supabase
                .from('meeting_chats')
                .select('*')
                .eq('id', id)
                .single()

            const servicesRes = await supabase
                .from('services')
                .select('*, contacts(name, email)')
                .eq('meeting_chat_id', id)

            if (chatRes.data) {
                setChat(chatRes.data)
                setNewTitle(chatRes.data.meeting_name)
            }
            if (servicesRes.data) setServices(servicesRes.data)
            setLoading(false)
        }
        fetchData()
    }, [id])

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this chat? This will remove all extracted services and data associated with this meeting.")) {
            return
        }

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/chats/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (res.ok) {
                navigate('/')
            } else {
                alert('Failed to delete chat')
            }
        } catch (error) {
            console.error(error)
            alert('Error deleting chat')
        }
    }

    const handleRename = async () => {
        if (!newTitle.trim()) return

        const { error } = await supabase
            .from('meeting_chats')
            .update({ meeting_name: newTitle })
            .eq('id', id)

        if (!error) {
            setChat({ ...chat, meeting_name: newTitle })
            setIsEditingTitle(false)
        } else {
            alert('Failed to rename chat')
        }
    }

    if (loading) return <div className="p-4">Loading...</div>
    if (!chat) return <div className="p-4">Chat not found</div>

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div>
                <div className="flex items-center justify-between">
                    <div className="flex-1 mr-4">
                        {isEditingTitle ? (
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="text-3xl font-bold border rounded px-2 py-1 w-full bg-background"
                                    autoFocus
                                />
                                <button onClick={handleRename} className="p-1 hover:bg-green-100 rounded text-green-600">
                                    <Check className="h-6 w-6" />
                                </button>
                                <button onClick={() => setIsEditingTitle(false)} className="p-1 hover:bg-red-100 rounded text-red-600">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center group">
                                <h1 className="text-3xl font-bold mr-2">{chat.meeting_name}</h1>
                                <button
                                    onClick={() => setIsEditingTitle(true)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                                >
                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                </button>
                            </div>
                        )}
                        <p className="text-muted-foreground mt-2">
                            Uploaded on {new Date(chat.created_at).toLocaleDateString()}
                        </p>
                    </div>
                    <button
                        onClick={handleDelete}
                        className="flex items-center text-destructive hover:bg-destructive/10 px-3 py-2 rounded-md transition-colors"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Chat
                    </button>
                </div>
            </div>

            {/* Digest / Summary Placeholder */}
            <div className="rounded-lg border bg-card p-6">
                <h3 className="font-semibold mb-4">Summary</h3>
                {chat.digest_bullets && chat.digest_bullets.length > 0 ? (
                    <div className="prose prose-sm max-w-none">
                        <p>{chat.digest_bullets?.summary}</p>
                        {chat.digest_bullets?.key_topics && (
                            <ul className="list-disc pl-5 mt-2">
                                {chat.digest_bullets.key_topics.map((topic: string, i: number) => (
                                    <li key={i}>{topic}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground italic">No summary available yet.</p>
                )}
            </div>

            {/* Extracted Services */}
            <div className="space-y-4">
                <h3 className="text-xl font-semibold flex items-center">
                    <Briefcase className="mr-2 h-5 w-5" />
                    Extracted Offers & Requests
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                    {services.map((service) => (
                        <ServiceCard key={service.id} service={service} onUpdate={() => {
                            // Refresh services
                            supabase
                                .from('services')
                                .select('*, contacts(name, email)')
                                .eq('meeting_chat_id', id)
                                .then(({ data }) => {
                                    if (data) setServices(data)
                                })
                        }} />
                    ))}
                    {services.length === 0 && (
                        <p className="text-sm text-muted-foreground col-span-full">No services extracted.</p>
                    )}
                </div>
            </div>

            {/* Cleaned Transcript / Full Transcript Toggles */}
            <div className="space-y-4">
                {/* Cleaned Transcript */}
                <div className="border rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowTranscript(showTranscript === 'cleaned' ? null : 'cleaned')}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition-colors"
                    >
                        <span className="font-medium flex items-center">
                            <Check className="h-4 w-4 mr-2 text-green-600" />
                            Cleaned Transcript
                        </span>
                        {showTranscript === 'cleaned' ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {showTranscript === 'cleaned' && (
                        <div className="p-4 bg-card border-t max-h-[600px] overflow-y-auto space-y-3">
                            {chat.cleaned_transcript && chat.cleaned_transcript.length > 0 ? (
                                chat.cleaned_transcript.map((msg: any, i: number) => (
                                    <div key={i} className="flex flex-col text-sm border-b pb-2 last:border-0">
                                        <span className="font-semibold text-primary">{msg.sender}</span>
                                        <span className="text-foreground/90 whitespace-pre-wrap">{msg.message}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground italic">No cleaned transcript available.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Raw Transcript */}
                <div className="border rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowTranscript(showTranscript === 'raw' ? null : 'raw')}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition-colors"
                    >
                        <span className="font-medium">Raw Transcript</span>
                        {showTranscript === 'raw' ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {showTranscript === 'raw' && (
                        <div className="p-4 bg-card border-t overflow-x-auto">
                            <pre className="whitespace-pre-wrap text-sm font-mono text-muted-foreground">
                                {chat.cleaned_text}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function ServiceCard({ service, onUpdate }: { service: any, onUpdate: () => void }) {
    const [isEditing, setIsEditing] = useState(false)
    const [description, setDescription] = useState(service.description)
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        const { error } = await supabase
            .from('services')
            .update({ description })
            .eq('id', service.id)

        setSaving(false)
        if (!error) {
            setIsEditing(false)
            onUpdate()
        } else {
            alert('Failed to update service')
        }
    }

    return (
        <div className="rounded-lg border p-4 bg-card">
            <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${service.type === 'offer' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                    {service.type.toUpperCase()}
                </span>
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-muted-foreground flex items-center">
                        <User className="h-3 w-3 mr-1" />
                        {service.contacts?.name || 'Unknown'}
                    </span>
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className="text-xs text-primary hover:underline"
                    >
                        {isEditing ? 'Cancel' : 'Edit'}
                    </button>
                </div>
            </div>

            {isEditing ? (
                <div className="space-y-2">
                    <textarea
                        className="w-full p-2 text-sm border rounded-md bg-background"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded-md"
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            ) : (
                <p className="text-sm">{service.description}</p>
            )}

            {service.links && service.links.length > 0 && (
                <div className="mt-2 space-y-1">
                    {service.links.map((link: string, i: number) => (
                        <a key={i} href={link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline block truncate">
                            {link}
                        </a>
                    ))}
                </div>
            )}
        </div>
    )
}
