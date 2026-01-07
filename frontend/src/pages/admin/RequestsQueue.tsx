import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Check, UserCheck, FileEdit } from 'lucide-react'
import clsx from 'clsx'

export default function RequestsQueue() {
    const [activeTab, setActiveTab] = useState<'claims' | 'changes'>('claims')
    const [requests, setRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState<string | null>(null)

    useEffect(() => {
        fetchRequests()
    }, [activeTab])

    const fetchRequests = async () => {
        setLoading(true)
        setRequests([])
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const endpoint = activeTab === 'claims' ? 'claims' : 'changes'
        const url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/requests/${endpoint}?status=pending`

        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setRequests(data)
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        setProcessing(id)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const endpoint = activeTab === 'claims' ? 'claims' : 'changes'
        const url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/requests/${endpoint}/${id}/action`

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    action,
                    reason: action === 'reject' ? 'Admin rejected via Queue' : 'Admin approved'
                })
            })

            if (res.ok) {
                // Remove from list
                setRequests(prev => prev.filter(r => r.id !== id))
            } else {
                alert("Failed to process request")
            }
        } catch (error) {
            console.error(error)
            alert("Error processing request")
        } finally {
            setProcessing(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Requests Queue</h1>
                <div className="flex space-x-2 bg-muted p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('claims')}
                        className={clsx(
                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                            activeTab === 'claims' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Profile Claims
                    </button>
                    <button
                        onClick={() => setActiveTab('changes')}
                        className={clsx(
                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                            activeTab === 'changes' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Data Changes
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                {loading ? (
                    <div className="p-8 text-center text-muted-foreground">Loading requests...</div>
                ) : requests.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center justify-center text-muted-foreground">
                        <Check className="h-10 w-10 text-green-500 mb-4 opacity-50" />
                        <p className="text-lg font-medium">All caught up!</p>
                        <p className="text-sm">No pending requests in this queue.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {requests.map((req) => (
                            <div key={req.id} className="p-6 flex flex-col sm:flex-row gap-6 hover:bg-muted/10 transition-colors">
                                <div className="shrink-0 pt-1">
                                    {activeTab === 'claims' ? (
                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                            <UserCheck className="h-5 w-5" />
                                        </div>
                                    ) : (
                                        <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                                            <FileEdit className="h-5 w-5" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            {formatDate(req.created_at)}
                                        </span>
                                        <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">ID: {req.id.slice(0, 8)}</span>
                                    </div>

                                    {activeTab === 'claims' ? (
                                        <div>
                                            <h3 className="font-semibold text-lg">
                                                Claim for <span className="text-primary">{req.contact?.name || 'Unknown Contact'}</span>
                                            </h3>
                                            <div className="mt-2 p-3 bg-muted/30 rounded-md border border-border text-sm">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <span className="text-muted-foreground text-xs block">Contact Phone</span>
                                                        <span className="font-medium">{req.contact?.phone || 'N/A'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground text-xs block">Contact Email</span>
                                                        <span className="font-medium">{req.contact?.email || 'N/A'}</span>
                                                    </div>
                                                    <div className="col-span-2 pt-2 border-t border-dashed border-border/50">
                                                        <span className="text-muted-foreground text-xs block mb-1">Evidence / User Input</span>
                                                        <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground bg-background p-2 rounded border border-border">
                                                            {JSON.stringify(req.evidence || req.user_provided, null, 2)}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <h3 className="font-semibold text-lg">
                                                Change Request for <span className="text-primary">{req.table_name || 'Record'}</span>
                                            </h3>
                                            <div className="mt-2 p-3 bg-muted/30 rounded-md border border-border text-sm overflow-x-auto">
                                                <pre className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(req.data, null, 2)}</pre>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="shrink-0 flex items-start gap-3 pt-1">
                                    <button
                                        onClick={() => handleAction(req.id, 'reject')}
                                        disabled={processing === req.id}
                                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-input bg-background hover:bg-destructive hover:text-destructive-foreground h-9 px-4 disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => handleAction(req.id, 'approve')}
                                        disabled={processing === req.id}
                                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 disabled:opacity-50 min-w-[100px]"
                                    >
                                        {processing === req.id ? '...' : (
                                            <>
                                                <Check className="mr-2 h-4 w-4" /> Approve
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function formatDate(iso: string) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
