import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X, Search, Loader2 } from 'lucide-react'

interface MergeContactModalProps {
    isOpen: boolean
    onClose: () => void
    sourceContact: any
    onMergeComplete: () => void
}

export default function MergeContactModal({ isOpen, onClose, sourceContact, onMergeComplete }: MergeContactModalProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [candidates, setCandidates] = useState<any[]>([])
    const [selectedTarget, setSelectedTarget] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [merging, setMerging] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('')
            setCandidates([])
            setSelectedTarget(null)
        }
    }, [isOpen])

    useEffect(() => {
        const searchContacts = async () => {
            if (!searchTerm.trim()) {
                setCandidates([])
                return
            }

            setLoading(true)
            const { data } = await supabase
                .from('contacts')
                .select('id, name, email, phone')
                .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
                .neq('id', sourceContact?.id) // Exclude self
                .limit(5)

            setCandidates(data || [])
            setLoading(false)
        }

        const timer = setTimeout(searchContacts, 300)
        return () => clearTimeout(timer)
    }, [searchTerm, sourceContact])

    const handleMerge = async () => {
        if (!selectedTarget || !sourceContact) return

        if (!confirm(`Are you sure you want to merge "${sourceContact.name || 'Unknown'}" INTO "${selectedTarget.name}"? This cannot be undone.`)) return

        setMerging(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/contacts/merge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    primary_contact_id: selectedTarget.id,
                    duplicate_contact_ids: [sourceContact.id]
                })
            })

            if (!res.ok) throw new Error('Merge failed')

            onMergeComplete()
            onClose()
        } catch (error) {
            console.error(error)
            alert('Failed to merge contacts')
        } finally {
            setMerging(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-lg rounded-lg border border-border shadow-lg flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <h2 className="font-semibold text-lg">Merge Contact</h2>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    <div className="bg-muted/50 p-4 rounded-md">
                        <p className="text-sm font-medium text-muted-foreground mb-1">MOVING FROM (Will be deleted)</p>
                        <div className="font-bold">{sourceContact?.name || 'Unknown Name'}</div>
                        <div className="text-sm">{sourceContact?.email}</div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-sm font-medium">Merge into Target Contact:</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by name or email..."
                                className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {loading ? (
                            <div className="text-center py-4 text-muted-foreground text-sm">Searching...</div>
                        ) : (
                            <div className="space-y-2">
                                {candidates.map(candidate => (
                                    <div
                                        key={candidate.id}
                                        onClick={() => setSelectedTarget(candidate)}
                                        className={clsx(
                                            "p-3 rounded-md border cursor-pointer transition-colors",
                                            selectedTarget?.id === candidate.id
                                                ? "border-primary bg-primary/5"
                                                : "border-border hover:bg-muted"
                                        )}
                                    >
                                        <div className="font-medium">{candidate.name || 'Unknown'}</div>
                                        <div className="text-xs text-muted-foreground">{candidate.email} • {candidate.phone}</div>
                                    </div>
                                ))}
                                {searchTerm && candidates.length === 0 && (
                                    <div className="text-center py-2 text-sm text-muted-foreground">No matches found</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-border flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleMerge}
                        disabled={!selectedTarget || merging}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50 flex items-center"
                    >
                        {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Merge
                    </button>
                </div>
            </div>
        </div>
    )
}

// Minimal clsx replacement since I might have removed it from package.json? 
// Actually clsx is likely installed as I saw it in imports. Using it safely.
import clsx from 'clsx'
