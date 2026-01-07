
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

import { useNavigate } from 'react-router-dom'

export default function DatabaseEditor() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<'scanner' | 'manual'>('scanner')
    const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([])
    const [loadingScan, setLoadingScan] = useState(false)
    const [scanned, setScanned] = useState(false)

    // Manual Editor State
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Scan Implementation
    const runScan = async () => {
        setLoadingScan(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/scan-duplicates`, {
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
        if (!confirm(`Merging ${duplicateIds.length} contact(s) into ${primaryId}. This cannot be undone. Continue?`)) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/contacts/merge`, {
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
                // Clear selection if valid
                setSelectedIds(new Set())
                // Refresh search if active
                if (activeTab === 'manual' && searchQuery) {
                    handleSearch(new Event('submit') as any)
                }
            } else {
                const err = await res.json()
                alert(`Merge failed: ${err.detail || 'Unknown error'}`)
            }
        } catch (err) {
            console.error(err)
            alert("Error merging")
        }
    }

    // Manual Operations
    const handleSearch = async (e: React.FormEvent) => {
        if (e) e.preventDefault()
        setSearching(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/contacts/search?q=${encodeURIComponent(searchQuery)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setSearchResults(data)
            setSelectedIds(new Set()) // Reset selection on new search
        } catch (err) {
            console.error(err)
        } finally {
            setSearching(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this contact? This cannot be undone and will remove all associated services.")) return
        try {
            const { error } = await supabase.from('contacts').delete().eq('id', id)
            if (error) throw error
            setSearchResults(prev => prev.filter(c => c.id !== id))
        } catch (err) {
            console.error(err)
            alert("Failed to delete contact")
        }
    }

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const handleManualMerge = () => {
        if (selectedIds.size < 2) return
        const ids = Array.from(selectedIds)
        // Heuristic: Pick the first or the one with most info? 
        // Logic: Let user pick? For MVP, we'll pick the one with most fields populated in the current list context 
        // OR just the first one selected as primary.
        // Better: Prompt user? Defaulting to first ID in the array as Primary.
        // Actually, let's look at searchResults to find the 'best' one. 
        // We'll trust the first one in the list order as 'Primary' if user selected top-down.
        // Or maybe just the first one.
        const primaryId = ids[0]
        const duplicates = ids.slice(1)
        mergeContacts(primaryId, duplicates)
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
                            className="flex-1 bg-input border border-input rounded px-3 py-2 text-foreground"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <button type="submit" disabled={searching} className="bg-secondary text-secondary-foreground px-4 py-2 rounded">
                            {searching ? <Loader2 className="animate-spin" /> : "Search"}
                        </button>
                    </form>

                    {selectedIds.size > 0 && (
                        <div className="mb-4 p-2 bg-primary/10 border border-primary/20 rounded flex items-center justify-between">
                            <span className="text-sm font-medium ml-2">{selectedIds.size} selected</span>
                            <button
                                onClick={handleManualMerge}
                                disabled={selectedIds.size < 2}
                                className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm flex items-center hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                                <Merge className="h-3.5 w-3.5 mr-1.5" />
                                Merge Selected
                            </button>
                        </div>
                    )}

                    <div className="space-y-2">
                        {searchResults.map((c) => (
                            <div key={c.id} className={`flex items-center justify-between p-3 border rounded bg-card transition-colors ${selectedIds.has(c.id) ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(c.id)}
                                        onChange={() => toggleSelection(c.id)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{c.name || "No Name"}</div>
                                        <div className="text-sm text-muted-foreground truncate">{c.email} • {c.phone}</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        onClick={() => navigate(`/admin/contacts?search=${encodeURIComponent(c.name || c.email || '')}`)}
                                        className="p-2 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                        title="Edit in Contacts"
                                    >
                                        <Edit className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(c.id)}
                                        className="p-2 hover:bg-red-500/10 text-red-500 rounded"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {searchResults.length === 0 && !searching && searchQuery && (
                            <div className="text-center py-8 text-muted-foreground">
                                No contacts found.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
