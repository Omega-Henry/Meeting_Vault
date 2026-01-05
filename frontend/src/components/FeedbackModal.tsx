
import { useState } from 'react'
import { X, Loader2, Star, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface FeedbackModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
    const [message, setMessage] = useState('')
    const [rating, setRating] = useState<number>(0)
    const [loading, setLoading] = useState(false)
    const [hoverRating, setHoverRating] = useState(0)

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!message.trim()) return

        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/feedback/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message,
                    rating: rating || null
                })
            })

            if (!res.ok) throw new Error("Failed to submit feedback")

            alert("Thank you for your feedback!")
            onClose()
            setMessage('')
            setRating(0)
        } catch (err) {
            console.error(err)
            alert("Error submitting feedback")
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

                <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Send Feedback</h3>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                    Help us improve MeetingVault! Let us know what you think or report issues.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Your Message</label>
                        <textarea
                            className="w-full bg-input border border-input rounded p-2 text-sm min-h-[100px]"
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Tell us what you like or what needs improvement..."
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Rating (Optional)</label>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    className="focus:outline-none"
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                    onClick={() => setRating(star)}
                                >
                                    <Star
                                        className={`h-6 w-6 transition-colors ${(hoverRating || rating) >= star
                                                ? 'text-yellow-400 fill-yellow-400'
                                                : 'text-muted-foreground'
                                            }`}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

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
                            disabled={loading || !message.trim()}
                            className="bg-primary text-primary-foreground px-4 py-2 text-sm rounded hover:bg-primary/90 flex items-center shadow-sm disabled:opacity-50"
                        >
                            {loading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                            Submit Feedback
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
