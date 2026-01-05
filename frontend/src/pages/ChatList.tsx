import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Upload, FileText } from 'lucide-react'
import { format } from 'date-fns'

export default function ChatList() {
    const [chats, setChats] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)

    const fetchChats = async () => {
        const { data, error } = await supabase
            .from('meeting_chats')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error("Error fetching chats:", error)
        }

        if (data) setChats(data)
        setLoading(false)
    }

    useEffect(() => {
        fetchChats()
    }, [])

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/upload-meeting-chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            })

            if (!res.ok) {
                const err = await res.json()
                alert(`Upload failed: ${err.detail}`)
            } else {
                await fetchChats()
            }
        } catch (error) {
            console.error(error)
            alert('Upload failed')
        } finally {
            setUploading(false)
        }
    }

    if (loading) return <div className="p-4">Loading chats...</div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">Meeting Chats</h2>
                <div className="relative">
                    <input
                        type="file"
                        id="file-upload"
                        className="hidden"
                        accept=".txt,.md"
                        onChange={handleFileUpload}
                        disabled={uploading}
                    />
                    <label
                        htmlFor="file-upload"
                        className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        {uploading ? 'Uploading...' : 'Upload Chat'}
                    </label>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {chats.map((chat) => {
                    const isProcessing = chat.digest_bullets?.summary === 'Processing...';

                    return (
                        <Link
                            key={chat.id}
                            to={`/admin/chats/${chat.id}`}
                            className={`group relative flex flex-col justify-between rounded-lg border p-6 transition-colors ${isProcessing ? 'bg-muted/30 cursor-wait' : 'hover:bg-muted/50'
                                }`}
                            onClick={(e) => isProcessing && e.preventDefault()} // Prevent click if processing? Maybe user wants to see raw text? Let's allow click but show status.
                        >
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <FileText className={`h-8 w-8 transition-colors ${isProcessing ? 'text-muted-foreground animate-pulse' : 'text-muted-foreground group-hover:text-primary'}`} />
                                    <span className="text-xs text-muted-foreground">
                                        {format(new Date(chat.created_at), 'MMM d, yyyy')}
                                    </span>
                                </div>
                                <h3 className="font-semibold tracking-tight">{chat.meeting_name}</h3>

                                {isProcessing ? (
                                    <div className="flex items-center gap-2 text-sm text-amber-600 font-medium">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                        </span>
                                        Processing Extraction...
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                        {chat.cleaned_text.substring(0, 100)}...
                                    </p>
                                )}
                            </div>
                        </Link>
                    )
                })}

                {chats.length === 0 && (
                    <div className="col-span-full text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                        No chats uploaded yet. Upload a transcript to get started.
                    </div>
                )}
            </div>
        </div>
    )
}
