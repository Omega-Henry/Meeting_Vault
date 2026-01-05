import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserProfile } from '../hooks/useUserContext'
import { UserCircle, Trash2 } from 'lucide-react'

export default function Login() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const { savedSessions, switchAccount, removeSession } = useUserProfile()
    const [otpSent, setOtpSent] = useState(false)
    const [token, setToken] = useState('')

    // Step 1: Send OTP
    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    // With OTP, we don't strictly need a redirect, but good practice
                    shouldCreateUser: true,
                },
            })

            if (error) {
                setMessage(error.message)
            } else {
                setOtpSent(true)
                setMessage('Code sent! Please check your email.')
            }
        } catch (error: any) {
            setMessage(error.message || 'Error sending code')
        } finally {
            setLoading(false)
        }
    }

    // Step 2: Verify OTP
    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        try {
            // @ts-ignore
            const { data, error } = await supabase.auth.verifyOtp({
                email,
                token,
                type: 'email',
            })

            if (error) {
                setMessage(error.message)
                setLoading(false)
            } else {
                // Success! Supabase client will update the session automatically.
                // The useUserContext hook is listening to onAuthStateChange and will redirect/save session.
                setMessage('Verified! Logging in...')
                // No need to set loading false immediately, let redirect happen
            }
        } catch (error: any) {
            setMessage(error.message || 'Error verifying code')
            setLoading(false)
        }
    }

    // Handle initial form submit based on state
    const handleSubmit = (e: React.FormEvent) => {
        if (otpSent) {
            handleVerifyOtp(e)
        } else {
            handleSendOtp(e)
        }
    }

    const handleSwitch = async (email: string) => {
        try {
            await switchAccount(email)
        } catch (e: any) {
            // Error is handled in switchAccount mainly (alerts) but simple catch here
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="w-full max-w-md space-y-8 rounded-lg border bg-card p-10 shadow-lg">
                <div className="text-center">
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">MeetingVault</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Sign in to access your meetings</p>
                </div>

                {/* Saved Accounts List - Only show if not in OTP mode */}
                {!otpSent && savedSessions.length > 0 && (
                    <div className="mt-8 space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground text-center">Choose an account</h3>
                        <div className="space-y-2">
                            {savedSessions.map(session => (
                                <div key={session.email} className="group flex items-center justify-between rounded-md border border-input bg-background p-3 hover:bg-muted/50 transition-colors">
                                    <button
                                        onClick={() => handleSwitch(session.email)}
                                        className="flex flex-1 items-center space-x-3 text-left"
                                    >
                                        <UserCircle className="h-8 w-8 text-primary/80" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-foreground">{session.email}</span>
                                            <span className="text-xs text-muted-foreground">Signed in</span>
                                        </div>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (confirm(`Remove ${session.email} from saved accounts?`)) {
                                                removeSession(session.email)
                                            }
                                        }}
                                        className="hidden group-hover:block p-2 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Remove account"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-muted" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground">Or sign in with new email</span>
                            </div>
                        </div>
                    </div>
                )}

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>

                    {!otpSent ? (
                        <>
                            <div>
                                <label htmlFor="email" className="sr-only">Email address</label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    className="relative block w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder-muted-foreground focus:z-10 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm"
                                    placeholder="Email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="group relative flex w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
                                >
                                    {loading ? 'Sending code...' : 'Send Login Code'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <div className="text-sm text-center text-muted-foreground">
                                    Sent code to <strong>{email}</strong>
                                    <button
                                        type="button"
                                        onClick={() => { setOtpSent(false); setMessage('') }}
                                        className="ml-2 text-primary hover:underline font-medium"
                                    >
                                        Change?
                                    </button>
                                </div>
                                <label htmlFor="token" className="sr-only">Verification Code</label>
                                <input
                                    id="token"
                                    name="token"
                                    type="text"
                                    required
                                    className="relative block w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder-muted-foreground focus:z-10 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm text-center tracking-widest text-lg"
                                    placeholder="Enter code"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                />
                            </div>
                            <div>
                                <button
                                    type="submit"
                                    disabled={loading || token.length < 6}
                                    className="group relative flex w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Verifying...' : 'Verify & Sign In'}
                                </button>
                            </div>
                        </>
                    )}

                    {message && (
                        <div className={`text-center text-sm ${message.includes('Verified') || message.includes('sent') ? 'text-green-500' : 'text-destructive'}`}>
                            {message}
                        </div>
                    )}
                </form>
            </div>
        </div>
    )
}
