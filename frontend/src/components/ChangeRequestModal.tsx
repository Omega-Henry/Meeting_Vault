
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ChangeRequestModalProps {
    isOpen: boolean
    onClose: () => void
    target: any // contact or service object
    type: 'contact' | 'service'
}

export default function ChangeRequestModal({ isOpen, onClose, target, type }: ChangeRequestModalProps) {
    const [formData, setFormData] = useState<any>({})
    const [loading, setLoading] = useState(false)

    // Reset and populate form data when target changes
    useEffect(() => {
        if (target) {
            if (type === 'contact') {
                setFormData({
                    name: target.name || '',
                    email: target.email || '',
                    phone: target.phone || '',
                })
            } else if (type === 'service') {
                setFormData({
                    description: target.description || '',
                })
            }
        }
    }, [target, type])

    if (!isOpen || !target) return null

    const handleChange = (key: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [key]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        // Calculate diff
        const diff: any = {}
        let hasChanges = false

        if (type === 'contact') {
            if (formData.name !== (target.name || '')) { diff.name = formData.name; hasChanges = true }
            if (formData.email !== (target.email || '')) { diff.email = formData.email; hasChanges = true }
            if (formData.phone !== (target.phone || '')) { diff.phone = formData.phone; hasChanges = true }
        } else if (type === 'service') {
            if (formData.description !== (target.description || '')) { diff.description = formData.description; hasChanges = true }
            // Suggested contact fields are always changes if present and non-empty
            if (formData.suggested_contact_name) { diff.suggested_contact_name = formData.suggested_contact_name; hasChanges = true }
            if (formData.suggested_contact_email) { diff.suggested_contact_email = formData.suggested_contact_email; hasChanges = true }
        }

        if (!hasChanges) {
            alert("No changes detected")
            setLoading(false)
            return
        }

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/change-requests/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    target_type: type,
                    target_id: target.id,
                    changes: diff
                })
            })

            if (!res.ok) throw new Error("Failed to submit")

            alert("Request submitted!")
            onClose()
        } catch (err) {
            console.error(err)
            alert("Error submitting request")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background border border-border p-6 rounded-lg w-full max-w-md shadow-lg relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                </button>
                <h3 className="text-lg font-semibold mb-4">Suggest Edit for {type === 'contact' ? 'Contact' : 'Service'}</h3>
                <p className="text-xs text-muted-foreground mb-4">
                    Submit changes for admin review. Only fields you modify will be requested.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {type === 'contact' && (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Name</label>
                                <input
                                    className="w-full bg-input border border-input rounded p-2 text-sm"
                                    value={formData.name || ''}
                                    onChange={e => handleChange('name', e.target.value)}
                                    placeholder="Name"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Email</label>
                                <input
                                    className="w-full bg-input border border-input rounded p-2 text-sm"
                                    value={formData.email || ''}
                                    onChange={e => handleChange('email', e.target.value)}
                                    placeholder="Email"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Phone</label>
                                <input
                                    className="w-full bg-input border border-input rounded p-2 text-sm"
                                    value={formData.phone || ''}
                                    onChange={e => handleChange('phone', e.target.value)}
                                    placeholder="Phone"
                                />
                            </div>
                        </>
                    )}
                    {type === 'service' && (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Description</label>
                                <textarea
                                    className="w-full bg-input border border-input rounded p-2 text-sm min-h-[100px]"
                                    value={formData.description || ''}
                                    onChange={e => handleChange('description', e.target.value)}
                                    placeholder="Description"
                                />
                            </div>
                            <div className="pt-4 border-t border-border mt-4">
                                <h4 className="text-sm font-semibold mb-2">Suggest New Contact Assignment</h4>
                                <p className="text-xs text-muted-foreground mb-2">If this service is attributed to the wrong person, suggest the correct contact here.</p>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Contact Name</label>
                                    <input
                                        className="w-full bg-input border border-input rounded p-2 text-sm"
                                        value={formData.suggested_contact_name || ''}
                                        onChange={e => handleChange('suggested_contact_name', e.target.value)}
                                        placeholder="Name"
                                    />
                                </div>
                                <div className="space-y-2 mt-2">
                                    <label className="text-sm font-medium">Contact Email</label>
                                    <input
                                        className="w-full bg-input border border-input rounded p-2 text-sm"
                                        value={formData.suggested_contact_email || ''}
                                        onChange={e => handleChange('suggested_contact_email', e.target.value)}
                                        placeholder="Email"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <div className="flex justify-end pt-4 gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-2 text-sm hover:bg-muted rounded text-muted-foreground"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-primary text-primary-foreground px-4 py-2 text-sm rounded hover:bg-primary/90 flex items-center shadow-sm"
                        >
                            {loading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                            Submit Request
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
