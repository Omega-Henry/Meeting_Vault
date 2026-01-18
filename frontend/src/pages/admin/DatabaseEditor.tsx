import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, RefreshCcw, Merge, Edit, Trash2, Bot, Download, Eye, X, Check, Sparkles, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Types
interface MergeSuggestion {
    suggestion_id: string
    contact_ids: string[]
    confidence: string
    reasons: string[]
    proposed_primary_contact_id: string
    contacts?: any[] // Full contact data for display
}

interface ContactForMerge {
    id: string
    name: string
    email: string | null
    phone: string | null
    services_count: number
    profile?: any
}

export default function DatabaseEditor() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<'enrichment' | 'scanner' | 'manual'>('enrichment')

    // Profile Enrichment State
    const [loadingProfileScan, setLoadingProfileScan] = useState(false)
    const [profileScanTriggered, setProfileScanTriggered] = useState(false)
    const [scanStatus, setScanStatus] = useState<any>(null)

    // Duplicate Scanner State
    const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([])
    const [loadingScan, setLoadingScan] = useState(false)
    const [scanned, setScanned] = useState(false)

    // Merge Modal State
    const [mergeModalOpen, setMergeModalOpen] = useState(false)
    const [selectedSuggestion, setSelectedSuggestion] = useState<MergeSuggestion | null>(null)
    const [mergeContacts, setMergeContacts] = useState<ContactForMerge[]>([])
    const [primaryContactId, setPrimaryContactId] = useState<string>('')
    const [mergedName, setMergedName] = useState('')
    const [loadingMergeData, setLoadingMergeData] = useState(false)
    const [merging, setMerging] = useState(false)

    // Manual Editor State
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Poll for scan status
    useEffect(() => {
        let interval: NodeJS.Timeout
        if (profileScanTriggered || (scanStatus && scanStatus.is_running)) {
            interval = setInterval(async () => {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.access_token) return
                try {
                    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/scan-status`, {
                        headers: { 'Authorization': `Bearer ${session.access_token}` }
                    })
                    if (res.ok) {
                        const status = await res.json()
                        setScanStatus(status)
                        if (status.status === 'completed' || status.status === 'failed') {
                            setProfileScanTriggered(false)
                            setLoadingProfileScan(false)
                        }
                    }
                } catch (e) {
                    console.error("Poll error", e)
                }
            }, 2000)
        }
        return () => clearInterval(interval)
    }, [profileScanTriggered, scanStatus])

    // Profile Enrichment
    const runProfileScan = async () => {
        setLoadingProfileScan(true)
        setScanStatus(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/scan-profiles`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            })
            if (res.ok) {
                setProfileScanTriggered(true)
            } else {
                alert("Failed to start scan")
                setLoadingProfileScan(false)
            }
        } catch (err) {
            console.error(err)
            alert("Error starting scan")
            setLoadingProfileScan(false)
        }
    }

    // Duplicate Scanner
    const runDuplicateScan = async () => {
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

    // Open Merge Modal
    const openMergeModal = async (suggestion: MergeSuggestion) => {
        setSelectedSuggestion(suggestion)
        setMergeModalOpen(true)
        setLoadingMergeData(true)

        try {
            // Fetch full contact data for comparison
            await supabase.auth.getSession() // Ensure auth is active
            const contacts: ContactForMerge[] = []

            for (const contactId of suggestion.contact_ids) {
                const { data: contact } = await supabase
                    .from('contacts')
                    .select('id, name, email, phone, services(id), profile:contact_profiles(*)')
                    .eq('id', contactId)
                    .single()

                if (contact) {
                    contacts.push({
                        id: contact.id,
                        name: contact.name || 'No Name',
                        email: contact.email,
                        phone: contact.phone,
                        services_count: contact.services?.length || 0,
                        profile: Array.isArray(contact.profile) ? contact.profile[0] : contact.profile
                    })
                }
            }

            setMergeContacts(contacts)
            setPrimaryContactId(suggestion.proposed_primary_contact_id)
            // Set initial merged name from the proposed primary
            const primary = contacts.find(c => c.id === suggestion.proposed_primary_contact_id)
            setMergedName(primary?.name || contacts[0]?.name || '')
        } catch (err) {
            console.error(err)
            alert("Failed to load contact details")
            setMergeModalOpen(false)
        } finally {
            setLoadingMergeData(false)
        }
    }

    // Execute Merge
    const executeMerge = async () => {
        if (!primaryContactId || mergeContacts.length < 2) return

        setMerging(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const duplicateIds = mergeContacts
                .filter(c => c.id !== primaryContactId)
                .map(c => c.id)

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/contacts/merge`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    primary_contact_id: primaryContactId,
                    duplicate_contact_ids: duplicateIds,
                    merged_name: mergedName // Pass the user-edited name
                })
            })

            if (res.ok) {
                // Remove from suggestions
                setSuggestions(prev => prev.filter(s => s.suggestion_id !== selectedSuggestion?.suggestion_id))
                setMergeModalOpen(false)
                setSelectedSuggestion(null)
                setMergeContacts([])
            } else {
                const err = await res.json()
                alert(`Merge failed: ${err.detail || 'Unknown error'}`)
            }
        } catch (err) {
            console.error(err)
            alert("Error merging contacts")
        } finally {
            setMerging(false)
        }
    }

    // Manual Search
    const handleSearch = async (e?: React.FormEvent) => {
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
            setSelectedIds(new Set())
        } catch (err) {
            console.error(err)
        } finally {
            setSearching(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this contact? This cannot be undone.")) return
        try {
            const { error } = await supabase.from('contacts').delete().eq('id', id)
            if (error) throw error
            setSearchResults(prev => prev.filter(c => c.id !== id))
        } catch (err) {
            console.error(err)
            alert("Failed to delete contact")
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`Delete ${selectedIds.size} contact(s)? This cannot be undone.`)) return

        try {
            const { error } = await supabase.from('contacts').delete().in('id', Array.from(selectedIds))
            if (error) throw error
            setSearchResults(prev => prev.filter(c => !selectedIds.has(c.id)))
            setSelectedIds(new Set())
        } catch (err) {
            console.error(err)
            alert("Failed to delete contacts")
        }
    }

    const exportToCSV = () => {
        const selected = searchResults.filter(c => selectedIds.has(c.id))
        if (selected.length === 0) return

        const headers = ['Name', 'Email', 'Phone']
        const rows = selected.map(c => [c.name || '', c.email || '', c.phone || ''])
        const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')

        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'contacts_export.csv'
        a.click()
    }

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedIds(newSet)
    }

    const handleManualMerge = () => {
        if (selectedIds.size < 2) return
        const ids = Array.from(selectedIds)
        // Create a synthetic suggestion
        openMergeModal({
            suggestion_id: 'manual-merge',
            contact_ids: ids,
            confidence: 'Manual',
            reasons: ['Manually selected by admin'],
            proposed_primary_contact_id: ids[0]
        })
    }

    return (
        <div className="p-6 h-full flex flex-col bg-background text-foreground">
            <h1 className="text-2xl font-bold mb-6">Database Editor</h1>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-border mb-6">
                <button
                    onClick={() => setActiveTab('enrichment')}
                    className={`pb-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'enrichment' ? 'border-b-2 border-purple-500 text-purple-500' : 'text-muted-foreground'}`}
                >
                    <Sparkles className="h-4 w-4" />
                    Profile Enrichment
                </button>
                <button
                    onClick={() => setActiveTab('scanner')}
                    className={`pb-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'scanner' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
                >
                    <Users className="h-4 w-4" />
                    Duplicate Scanner
                </button>
                <button
                    onClick={() => setActiveTab('manual')}
                    className={`pb-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'manual' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
                >
                    <Edit className="h-4 w-4" />
                    Manual Editor
                </button>
            </div>

            {/* Profile Enrichment Tab */}
            {activeTab === 'enrichment' && (
                <div className="flex-1">
                    <div className="max-w-xl">
                        <div className="p-6 border border-border rounded-lg bg-card">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-purple-500/10 rounded-lg">
                                    <Bot className="h-6 w-6 text-purple-500" />
                                </div>
                                <div>
                                    <h3 className="font-semibold">AI Profile Enrichment</h3>
                                    <p className="text-sm text-muted-foreground">Uses AI to infer Bio, Hot Plate, and Buy Box from services.</p>
                                </div>
                            </div>

                            <button
                                onClick={runProfileScan}
                                disabled={loadingProfileScan}
                                className="w-full bg-purple-600 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                            >
                                {loadingProfileScan ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        {scanStatus?.is_running
                                            ? `Scanning... (${scanStatus.processed}/${scanStatus.total})`
                                            : 'Starting...'}
                                    </>
                                ) : scanStatus?.status === 'completed' ? (
                                    <>
                                        <Check className="h-5 w-5" />
                                        Scan Complete! ({scanStatus.success_count} enriched)
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-5 w-5" />
                                        Scan All Profiles
                                    </>
                                )}
                            </button>

                            {scanStatus?.status === 'completed' && (
                                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm">
                                    <p className="font-medium text-green-600">✓ {scanStatus.success_count} profiles enriched</p>
                                    {scanStatus.error_count > 0 && (
                                        <p className="text-yellow-600">{scanStatus.error_count} errors (check console)</p>
                                    )}
                                    <button
                                        onClick={() => navigate('/admin/directory')}
                                        className="mt-2 text-purple-500 hover:underline"
                                    >
                                        View Updated Profiles →
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Duplicate Scanner Tab */}
            {activeTab === 'scanner' && (
                <div className="flex-1 overflow-y-auto">
                    <div className="mb-6">
                        <button
                            onClick={runDuplicateScan}
                            disabled={loadingScan}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded flex items-center hover:bg-primary/90 disabled:opacity-50"
                        >
                            {loadingScan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                            {scanned ? "Re-Scan Database" : "Scan for Duplicates"}
                        </button>
                    </div>

                    {suggestions.length === 0 && scanned && !loadingScan && (
                        <p className="text-muted-foreground">No duplicates found. Great job keeping your database clean!</p>
                    )}

                    <div className="space-y-4">
                        {suggestions.map((s) => (
                            <div key={s.suggestion_id} className="border border-border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-xs px-2 py-0.5 rounded ${s.confidence === 'High' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                                {s.confidence} Confidence
                                            </span>
                                            <span className="text-xs text-muted-foreground">{s.contact_ids.length} contacts</span>
                                        </div>
                                        <p className="text-sm font-medium">{s.reasons.join(", ")}</p>
                                    </div>
                                    <button
                                        onClick={() => openMergeModal(s)}
                                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded text-sm flex items-center"
                                    >
                                        <Eye className="h-4 w-4 mr-2" />
                                        Review & Merge
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Manual Editor Tab */}
            {activeTab === 'manual' && (
                <div className="flex-1 overflow-y-auto">
                    <form onSubmit={handleSearch} className="flex gap-2 mb-4">
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

                    {/* Bulk Actions */}
                    {selectedIds.size > 0 && (
                        <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg flex items-center justify-between">
                            <span className="text-sm font-medium">{selectedIds.size} selected</span>
                            <div className="flex gap-2">
                                <button onClick={exportToCSV} className="px-3 py-1.5 rounded text-sm flex items-center gap-1 bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                    <Download className="h-3.5 w-3.5" /> Export CSV
                                </button>
                                {selectedIds.size >= 2 && (
                                    <button onClick={handleManualMerge} className="px-3 py-1.5 rounded text-sm flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
                                        <Merge className="h-3.5 w-3.5" /> Merge
                                    </button>
                                )}
                                <button onClick={handleBulkDelete} className="px-3 py-1.5 rounded text-sm flex items-center gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                </button>
                            </div>
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
                                        onClick={() => navigate(`/admin/directory?search=${encodeURIComponent(c.name || c.email || '')}`)}
                                        className="p-2 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                        title="View in Directory"
                                    >
                                        <Eye className="h-4 w-4" />
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
                            <div className="text-center py-8 text-muted-foreground">No contacts found.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Merge Modal */}
            {mergeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => !merging && setMergeModalOpen(false)} />
                    <div className="relative z-50 w-full max-w-3xl bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Merge Contacts</h2>
                            <button onClick={() => !merging && setMergeModalOpen(false)} className="p-1 hover:bg-muted rounded">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-6">
                            {loadingMergeData ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-muted-foreground mb-4">Select the primary contact. All services will be merged into this contact.</p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                        {mergeContacts.map((contact) => (
                                            <div
                                                key={contact.id}
                                                onClick={() => {
                                                    setPrimaryContactId(contact.id)
                                                    setMergedName(contact.name)
                                                }}
                                                className={`p-4 border rounded-lg cursor-pointer transition-all ${primaryContactId === contact.id
                                                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                                                    : 'border-border hover:border-muted-foreground'
                                                    }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <input
                                                        type="radio"
                                                        checked={primaryContactId === contact.id}
                                                        onChange={() => {
                                                            setPrimaryContactId(contact.id)
                                                            setMergedName(contact.name)
                                                        }}
                                                        className="mt-1"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium truncate">{contact.name}</p>
                                                        <p className="text-sm text-muted-foreground truncate">{contact.email || 'No email'}</p>
                                                        <p className="text-sm text-muted-foreground">{contact.phone || 'No phone'}</p>
                                                        <div className="mt-2 flex items-center gap-2 text-xs">
                                                            <span className="bg-muted px-2 py-0.5 rounded">{contact.services_count} services</span>
                                                            {contact.profile?.bio && <span className="bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded">Has Bio</span>}
                                                        </div>
                                                        {contact.profile?.role_tags?.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {contact.profile.role_tags.slice(0, 3).map((tag: string) => (
                                                                    <span key={tag} className="text-xs bg-secondary px-1.5 py-0.5 rounded">{tag}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mb-6">
                                        <label className="text-sm font-medium mb-1 block">Merged Contact Name</label>
                                        <input
                                            type="text"
                                            value={mergedName}
                                            onChange={(e) => setMergedName(e.target.value)}
                                            className="w-full bg-input border border-input rounded px-3 py-2"
                                            placeholder="Enter final name for merged contact"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="p-4 border-t border-border flex justify-end gap-3">
                            <button
                                onClick={() => setMergeModalOpen(false)}
                                disabled={merging}
                                className="px-4 py-2 rounded text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeMerge}
                                disabled={merging || !primaryContactId || !mergedName.trim()}
                                className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                            >
                                {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Confirm Merge
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
