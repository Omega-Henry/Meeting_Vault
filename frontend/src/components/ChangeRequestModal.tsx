import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ChangeRequestModalProps {
    isOpen: boolean
    onClose: () => void
    targetType: 'contact' | 'service' | 'contact_link'
    targetId?: string
    initialData?: any
}

export default function ChangeRequestModal({ isOpen, onClose, targetType, targetId, initialData }: ChangeRequestModalProps) {
    const [summary, setSummary] = useState('')
    const [payloadStr, setPayloadStr] = useState(JSON.stringify(initialData || {}, null, 2))
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setSummary('')
            setPayloadStr(JSON.stringify(initialData || {}, null, 2))
            setError('')
        }
    }, [isOpen, initialData])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            let parsedPayload;
            try {
                parsedPayload = JSON.parse(payloadStr)
            } catch (e) {
                throw new Error("Invalid JSON payload")
            }

            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error("Not authenticated")

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/change-requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    target_type: targetType,
                    target_id: targetId,
                    summary,
                    payload: parsedPayload
                })
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || "Failed to submit request")
            }

            onClose()
            alert("Suggestion submitted for review!")
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4 md:inset-0 md:h-full">
            <div className="relative w-full max-w-2xl h-full md:h-auto">
                {/* Modal content */}
                <div className="relative rounded-lg bg-background border border-border shadow-xl">
                    {/* Modal header */}
                    <div className="flex items-start justify-between rounded-t border-b p-4 dark:border-gray-600">
                        <h3 className="text-xl font-semibold text-foreground">
                            Suggest Change
                        </h3>
                        <button
                            type="button"
                            onClick={onClose}
                            className="ml-auto inline-flex items-center rounded-lg bg-transparent p-1.5 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-600 dark:hover:text-white"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    {/* Modal body */}
                    <div className="p-6 space-y-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground">Reason / Summary</label>
                                <input
                                    type="text"
                                    required
                                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                    placeholder="e.g. Corrected phone number"
                                    value={summary}
                                    onChange={e => setSummary(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground">Proposed Data (JSON)</label>
                                <textarea
                                    rows={8}
                                    required
                                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none"
                                    value={payloadStr}
                                    onChange={e => setPayloadStr(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground mt-1">Edit the JSON to reflect your proposed changes.</p>
                            </div>

                            {error && <div className="text-red-500 text-sm">{error}</div>}

                            <div className="flex items-center justify-end space-x-2 border-t border-gray-200 p-6 rounded-b dark:border-gray-600">
                                <button
                                    type="button"
                                    className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:z-10 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-gray-600"
                                    onClick={onClose}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-lg bg-primary px-5 py-2.5 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50"
                                >
                                    {loading ? 'Submitting...' : 'Submit Suggestion'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}
