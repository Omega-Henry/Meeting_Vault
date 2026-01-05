import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
    Database,
    Search,
    RefreshCw,
    Merge,
    AlertTriangle,
    Check,
    X,
    Edit,
    Trash2
} from 'lucide-react'
import clsx from 'clsx'
import { useUserProfile } from '../../hooks/useUserContext'

// --- Types ---
interface MergeSuggestion {
    suggestion_id: string
    contact_ids: string[]
    confidence: string
    reasons: string[]
    proposed_primary_contact_id: string
}

interface Contact {
    id: string
    name: string
    email: string
    phone: string
    links: string[]
    org_id: string
}

// --- Scanner Component ---
function Scanner() {
    const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([])
    const [loading, setLoading] = useState(false)
    const [processingId, setProcessingId] = useState<string | null>(null)

    const runScan = async () => {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/scan-duplicates`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            if (res.ok) {
                setSuggestions(await res.json())
            }
        } catch (e) {
            console.error(e)
            alert("Scan failed")
        }
        setLoading(false)
    }

    const handleMerge = async (suggestion: MergeSuggestion) => {
        if (!confirm("Confirm merge? This action cannot be undone/reverted easily.")) return

        setProcessingId(suggestion.suggestion_id)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const payload = {
            primary_contact_id: suggestion.proposed_primary_contact_id,
            duplicate_contact_ids: suggestion.contact_ids.filter(id => id !== suggestion.proposed_primary_contact_id)
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/merge-contacts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(payload)
            })

            if (res.ok) {
                // Remove from list
                setSuggestions(prev => prev.filter(s => s.suggestion_id !== suggestion.suggestion_id))
            } else {
                const err = await res.json()
                alert(`Merge failed: ${err.detail}`)
            }
        } catch (e) {
            alert("Merge request failed")
        }
        setProcessingId(null)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">AI Database Scanner</h2>
                    <p className="text-sm text-muted-foreground">Detect and merge duplicate contacts based on email, phone, and name similarity.</p>
                </div>
                <button
                    onClick={runScan}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Run Scan
                </button>
            </div>

            {loading && suggestions.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">Scanning database...</div>
            )}

            <div className="space-y-4">
                {suggestions.map((s) => (
                    <div key={s.suggestion_id} className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-full text-xs font-medium",
                                        s.confidence === 'High' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                    )}>
                                        {s.confidence} Confidence
                                    </span>
                                    <span className="text-sm text-muted-foreground">{s.reasons.join(", ")}</span>
                                </div>
                                <div className="text-sm font-medium">Merging {s.contact_ids.length} contacts</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    Primary ID: {s.proposed_primary_contact_id}
                                </div>
                            </div>
                            <button
                                onClick={() => handleMerge(s)}
                                disabled={!!processingId}
                                className="flex items-center gap-1 rounded bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
                            >
                                {processingId === s.suggestion_id ? (
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Merge className="h-3 w-3" />
                                )}
                                Merge
                            </button>
                        </div>
                    </div>
                ))}
                {!loading && suggestions.length === 0 && (
                    <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">
                        No duplicates found. Run a scan?
                    </div>
                )}
            </div>
        </div>
    )
}

// --- Manual Editor Component ---
function ManualEditor() {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<Contact[]>([])
    const [searching, setSearching] = useState(false)
    const [editingContact, setEditingContact] = useState<Contact | null>(null)

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return
        setSearching(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/contacts/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
        if (res.ok) {
            setResults(await res.json())
        }
        setSearching(false)
    }

    const handleSave = async (updated: Contact) => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/contacts/${updated.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(updated)
            })

            if (res.ok) {
                setResults(results.map(c => c.id === updated.id ? updated : c))
                setEditingContact(null)
                alert("Saved successfully")
            } else {
                alert("Failed to save")
            }
        } catch (e) {
            alert("Error saving contact")
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this contact?")) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/contacts/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        })

        if (res.ok) {
            setResults(results.filter(c => c.id !== id))
            setEditingContact(null)
        } else {
            alert("Failed to delete")
        }
    }

    return (
        <div className="space-y-6">
            <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search by name, email, phone..."
                        className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <button
                    type="submit"
                    disabled={searching}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Search
                </button>
            </form>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    {results.map(contact => (
                        <div
                            key={contact.id}
                            onClick={() => setEditingContact(contact)}
                            className={clsx(
                                "cursor-pointer rounded-lg border p-3 hover:bg-muted/50 transition-colors",
                                editingContact?.id === contact.id ? "border-primary bg-muted/50" : "bg-card"
                            )}
                        >
                            <div className="font-medium">{contact.name || "Unnamed"}</div>
                            <div className="text-xs text-muted-foreground">{contact.email}</div>
                            <div className="text-xs text-muted-foreground">{contact.phone}</div>
                        </div>
                    ))}
                    {results.length === 0 && !searching && (
                        <div className="text-sm text-muted-foreground text-center py-8">
                            No results.
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {editingContact ? (
                        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-semibold">Edit Contact</h3>
                                <button onClick={() => handleDelete(editingContact.id)} className="text-red-500 hover:text-red-700">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium">Name</label>
                                <input
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={editingContact.name || ''}
                                    onChange={e => setEditingContact({ ...editingContact, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium">Email</label>
                                <input
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={editingContact.email || ''}
                                    onChange={e => setEditingContact({ ...editingContact, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium">Phone</label>
                                <input
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={editingContact.phone || ''}
                                    onChange={e => setEditingContact({ ...editingContact, phone: e.target.value })}
                                />
                            </div>

                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    onClick={() => setEditingContact(null)}
                                    className="px-3 py-1.5 text-xs font-medium hover:bg-muted rounded"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleSave(editingContact)}
                                    className="bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium rounded hover:bg-primary/90"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
                            Select a contact to edit details
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// --- Main Page ---
export default function DatabaseEditor() {
    const [activeTab, setActiveTab] = useState<'scanner' | 'manual'>('scanner')

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Database Editor</h1>

            <div className="border-b border-border">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('scanner')}
                        className={clsx(
                            "whitespace-nowrap border-b-2 pb-4 px-1 text-sm font-medium",
                            activeTab === 'scanner'
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground"
                        )}
                    >
                        AI Database Scanner
                    </button>
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={clsx(
                            "whitespace-nowrap border-b-2 pb-4 px-1 text-sm font-medium",
                            activeTab === 'manual'
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground"
                        )}
                    >
                        Manual Editor
                    </button>
                </nav>
            </div>

            <div className="pt-4">
                {activeTab === 'scanner' ? <Scanner /> : <ManualEditor />}
            </div>
        </div>
    )
}
