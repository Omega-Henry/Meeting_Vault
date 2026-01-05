
import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ChangeRequestModalProps {
    isOpen: boolean
    onClose: () => void
    target: any // contact or service object
    type: 'contact' | 'service'
}

export default function ChangeRequestModal({ isOpen, onClose, target, type }: ChangeRequestModalProps) {
    // Let's parse 'target' and show fields.
    const [formData, setFormData] = useState<any>(target)
    const [loading, setLoading] = useState(false)

    if (!isOpen) return null

    const handleChange = (key: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [key]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        // Calculate diff
        const diff: any = {}
        Object.keys(formData).forEach(key => {
            if (formData[key] !== target[key]) {
                diff[key] = formData[key]
            }
        })

        if (Object.keys(diff).length === 0) {
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border border-border p-6 rounded-lg w-full max-w-md shadow-lg relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                </button>
                <h3 className="text-lg font-semibold mb-4">Suggest Edit for {type}</h3>

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
                                    className="w-full bg-input border border-input rounded p-2 text-sm"
                                    value={formData.description || ''}
                                    onChange={e => handleChange('description', e.target.value)}
                                    rows={3}
                                    placeholder="Description"
                                />
                            </div>
                        </>
                    )}

                    <div className="flex justify-end pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="mr-2 px-3 py-2 text-sm hover:bg-muted rounded"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-primary text-primary-foreground px-3 py-2 text-sm rounded hover:bg-primary/90 flex items-center"
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
