
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, RefreshCcw, Merge, Edit, Trash2 } from 'lucide-react'

// Types (simplified)
interface MergeSuggestion {
    suggestion_id: string
    contact_ids: string[]
    confidence: string
    reasons: string[]
    proposed_primary_contact_id: string
}

export default function DatabaseEditor() {
    const [activeTab, setActiveTab] = useState<'scanner' | 'manual'>('scanner')
    const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([])
    const [loadingScan, setLoadingScan] = useState(false)
    const [scanned, setScanned] = useState(false)

    // Manual Editor State
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)

    // Scan Implementation
    const runScan = async () => {
        setLoadingScan(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/scan-duplicates`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setSuggestions(data)
            setScanned(true)
        } catch (err) {
            console.error(err)
            alert("Scan failed")
        } finally {
            setLoadingScan(false)
        }
    }

    const mergeContacts = async (primaryId: string, duplicateIds: string[]) => {
        if (!confirm("This will merge contacts. Continue?")) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/merge-contacts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ primary_contact_id: primaryId, duplicate_contact_ids: duplicateIds })
            })
            if (res.ok) {
                alert("Merge successful")
                setSuggestions(prev => prev.filter(s => s.proposed_primary_contact_id !== primaryId))
            } else {
                alert("Merge failed")
            }
        } catch (err) {
            console.error(err)
            alert("Error merging")
        }
    }

    // Manual Search
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        setSearching(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/contacts/search?q=${searchQuery}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setSearchResults(data)
        } catch (err) {
            console.error(err)
        } finally {
            setSearching(false)
        }
    }

    return (
        <div className="p-6 h-full flex flex-col bg-background text-foreground">
            <h1 className="text-2xl font-bold mb-6">Database Editor</h1>

            <div className="flex gap-4 border-b border-border mb-6">
                <button
                    onClick={() => setActiveTab('scanner')}
                    className={`pb-2 text-sm font-medium ${activeTab === 'scanner' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
                >
                    Duplicate Scanner (AI)
                </button>
                <button
                    onClick={() => setActiveTab('manual')}
                    className={`pb-2 text-sm font-medium ${activeTab === 'manual' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
                >
                    Manual Editor
                </button>
            </div>

            {activeTab === 'scanner' && (
                <div className="flex-1 overflow-y-auto">
                    <div className="mb-6">
                        <button
                            onClick={runScan}
                            disabled={loadingScan}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded flex items-center hover:bg-primary/90 disabled:opacity-50"
                        >
                            {loadingScan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                            {scanned ? "Re-Scan Database" : "Scan for Duplicates"}
                        </button>
                    </div>

                    {suggestions.length === 0 && scanned && !loadingScan && (
                        <p className="text-muted-foreground">No duplicates found.</p>
                    )}

                    <div className="space-y-4">
                        {suggestions.map((s) => (
                            <div key={s.suggestion_id} className="border border-border rounded-lg p-4 bg-card">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-xs px-2 py-0.5 rounded ${s.confidence === 'High' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                                {s.confidence} Confidence
                                            </span>
                                            <span className="text-xs text-muted-foreground">ID: {s.suggestion_id.slice(0, 8)}</span>
                                        </div>
                                        <p className="text-sm font-medium">{s.reasons.join(", ")}</p>
                                    </div>
                                    <button
                                        onClick={() => mergeContacts(s.proposed_primary_contact_id, s.contact_ids.filter(id => id !== s.proposed_primary_contact_id))}
                                        className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded text-sm flex items-center"
                                    >
                                        <Merge className="h-4 w-4 mr-1.5" />
                                        Merge All
                                    </button>
                                </div>

                                <div className="bg-muted/30 rounded p-3 text-sm">
                                    <p className="text-xs font-semibold uppercase opacity-50 mb-2">Candidates ({s.contact_ids.length})</p>
                                    <div className="flex gap-2 text-xs opacity-70">
                                        {s.contact_ids.map(id => (
                                            <span key={id} className={id === s.proposed_primary_contact_id ? "font-bold text-primary" : ""}>
                                                {id.slice(0, 8)} {id === s.proposed_primary_contact_id ? "(Target)" : ""}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'manual' && (
                <div className="flex-1 overflow-y-auto">
                    <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                        <input
                            type="text"
                            placeholder="Search contacts by name, email, or phone..."
                            className="flex-1 bg-input border border-input rounded px-3 py-2"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <button type="submit" disabled={searching} className="bg-secondary text-secondary-foreground px-4 py-2 rounded">
                            {searching ? <Loader2 className="animate-spin" /> : "Search"}
                        </button>
                    </form>

                    <div className="space-y-2">
                        {searchResults.map((c) => (
                            <div key={c.id} className="flex items-center justify-between p-3 border border-border rounded bg-card">
                                <div>
                                    <div className="font-medium">{c.name || "No Name"}</div>
                                    <div className="text-sm text-muted-foreground">{c.email} • {c.phone}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button className="p-2 hover:bg-muted rounded" title="Edit">
                                        <Edit className="h-4 w-4" />
                                    </button>
                                    <button className="p-2 hover:bg-red-500/10 text-red-500 rounded" title="Delete">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
