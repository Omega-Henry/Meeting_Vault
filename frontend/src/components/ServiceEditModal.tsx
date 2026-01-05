import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X, Search, Loader2, Check } from 'lucide-react'


interface ServiceEditModalProps {
    isOpen: boolean
    onClose: () => void
    service: any
    onUpdateComplete: () => void
}

export default function ServiceEditModal({ isOpen, onClose, service, onUpdateComplete }: ServiceEditModalProps) {
    const [description, setDescription] = useState('')
    const [selectedContact, setSelectedContact] = useState<any>(null)

    // Search State
    const [searchTerm, setSearchTerm] = useState('')
    const [candidates, setCandidates] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (isOpen && service) {
            setDescription(service.description || '')
            setSelectedContact(service.contacts || null)
            setSearchTerm('')
            setCandidates([])
        }
    }, [isOpen, service])

    // Search contacts for reassignment
    useEffect(() => {
        const searchContacts = async () => {
            if (!searchTerm.trim()) {
                setCandidates([])
                return
            }

            setSearching(true)
            const { data } = await supabase
                .from('contacts')
                .select('id, name, email')
                .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
                .limit(5)

            setCandidates(data || [])
            setSearching(false)
        }

        const timer = setTimeout(searchContacts, 300)
        return () => clearTimeout(timer)
    }, [searchTerm])

    const handleSave = async () => {
        if (!service) return

        setSaving(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/services/${service.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    description,
                    contact_id: selectedContact?.id
                })
            })

            if (!res.ok) throw new Error('Update failed')

            onUpdateComplete()
            onClose()
        } catch (error) {
            console.error(error)
            alert('Failed to update service')
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-lg rounded-lg border border-border shadow-lg flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <h2 className="font-semibold text-lg">Edit Service</h2>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Description</label>
                        <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>

                    {/* Contact Assignment */}
                    <div className="space-y-4">
                        <label className="text-sm font-medium">Assigned Contact</label>

                        {/* Current Selection */}
                        <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                            <div>
                                <div className="font-medium">{selectedContact?.name || selectedContact?.email || 'Unattributed'}</div>
                                {selectedContact?.email && <div className="text-xs text-muted-foreground">{selectedContact.email}</div>}
                            </div>
                            {selectedContact && (
                                <button
                                    onClick={() => setSelectedContact(null)}
                                    className="text-xs text-destructive hover:underline"
                                >
                                    Remove
                                </button>
                            )}
                        </div>

                        {/* Search to Change */}
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search to change contact..."
                                className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {searching ? (
                            <div className="text-center py-2 text-muted-foreground text-sm">Searching...</div>
                        ) : (
                            <div className="space-y-2">
                                {candidates.map(candidate => (
                                    <div
                                        key={candidate.id}
                                        onClick={() => {
                                            setSelectedContact(candidate)
                                            setSearchTerm('')
                                            setCandidates([])
                                        }}
                                        className="p-2 rounded-md border border-border hover:bg-muted cursor-pointer flex items-center justify-between"
                                    >
                                        <div>
                                            <div className="font-medium text-sm">{candidate.name || 'Unknown'}</div>
                                            <div className="text-xs text-muted-foreground">{candidate.email}</div>
                                        </div>
                                        {selectedContact?.id === candidate.id && <Check className="h-4 w-4 text-primary" />}
                                    </div>
                                ))}
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
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50 flex items-center"
                    >
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    )
}
