import { useEffect, useState, createContext, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface UserProfile {
    id: string
    email: string
    org_id: string
    role: 'admin' | 'user'
}

interface SavedSession {
    email: string
    access_token: string
    refresh_token: string
    user_id: string
    storageKey?: string
}

interface UserContextType {
    profile: UserProfile | null
    loading: boolean
    savedSessions: SavedSession[]
    switchAccount: (email: string) => Promise<void>
    addSession: (session: any) => void
    signOut: (options?: { keepStorage?: boolean, scope?: 'global' | 'local' | 'others' }) => Promise<void>
    removeSession: (email: string) => void
}

// Global variable to prevent multiple listeners
const SESSIONS_KEY = 'mv_auth_sessions'

export const UserContext = createContext<UserContextType>({
    profile: null,
    loading: true,
    savedSessions: [],
    switchAccount: async () => { },
    addSession: () => { },
    signOut: async () => { },
    removeSession: () => { },
})

// Helper to get sessions from storage
const getStoredSessions = (): SavedSession[] => {
    try {
        const stored = localStorage.getItem(SESSIONS_KEY)
        return stored ? JSON.parse(stored) : []
    } catch {
        return []
    }
}

export function useUserProfile() {
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [savedSessions, setSavedSessions] = useState<SavedSession[]>([])

    // Load initial sessions
    useEffect(() => {
        setSavedSessions(getStoredSessions())
    }, [])

    const updateSavedSession = useCallback((session: any) => {
        if (!session?.user?.email) return

        // Validation: Ensure we have a refresh token. 
        if (!session.refresh_token) {
            console.warn("Session missing refresh_token! Not saving to storage.", session)
            return
        }

        // Find the Supabase storage key (sb-*-auth-token)
        const storageKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'))

        console.log(`[Auth] Updating session for ${session.user.email}. RT: ...${session.refresh_token.slice(-5)} Key: ${storageKey}`)

        const currentSessions = getStoredSessions()
        const newSession: SavedSession = {
            email: session.user.email,
            user_id: session.user.id,
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            storageKey: storageKey || undefined
        }

        // Upsert session
        const existingIndex = currentSessions.findIndex(s => s.email === newSession.email)
        let updatedSessions
        if (existingIndex >= 0) {
            updatedSessions = [...currentSessions]
            updatedSessions[existingIndex] = newSession
        } else {
            updatedSessions = [...currentSessions, newSession]
        }

        localStorage.setItem(SESSIONS_KEY, JSON.stringify(updatedSessions))
        setSavedSessions(updatedSessions)
    }, [])

    const removeSession = (email: string) => {
        const currentSessions = getStoredSessions()
        const filtered = currentSessions.filter(s => s.email !== email)
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered))
        setSavedSessions(filtered)
    }

    const switchAccount = async (email: string) => {
        setLoading(true)
        const targetSession = savedSessions.find(s => s.email === email)

        if (targetSession) {
            console.log(`[Auth] Switching to ${email}.`)

            // Strategy: Swap LocalStorage and Reload
            // This is more robust than setSession() because it forces a clean client initialization.

            // 1. Determine key
            let key = targetSession.storageKey
            if (!key) {
                // Try to find existing key suitable for this project
                // Note: If we are logged out, this might be empty, but usually the project ref is constant.
                // We fallback to searching or we might be stuck. 
                // BUT, since we just added storageKey capture, older sessions might not have it.
                // We'll try to find any existing key first.
                key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
            }

            if (!key) {
                console.error("[Auth] Could not determine Supabase storage key for switch.")
                alert("Could not switch: Config error. Please login again.")
                setLoading(false)
                return
            }

            // 2. Construct session object expected by Supabase
            // It expects: { access_token, refresh_token, user, ... }
            // However, we only strictly need access_token and refresh_token to hydrate?
            // Actually, Supabase client expects the full session object in storage usually.
            // But we only have partial data (SavedSession has email, id, tokens).
            // LUCKILY, we can try to use `setSession` one last time if this fails?
            // NO, let's use the provided tokens. The client basically needs the tokens.
            // Wait, if we only store partial data, the client might barf on "user" missing.

            // Revert: We DIDN'T save the full session object in SavedSession. We only saved tokens.
            // So we CAN'T just dump it into LS because the LS format is different (contains full user object).
            // 
            // BACKTRACK: We must use `setSession`.
            // The issue is likely `setSession` failing due to race conditions.
            //
            // ALTERNATIVE FIX:
            // Use `setSession` but handle the failure by clearing storage and asking user to re-login?
            // OR, maybe pass `refresh_token` AND `access_token` to setSession?

            // Let's try passing BOTH.
            // @ts-ignore
            const { data, error } = await supabase.auth.setSession({
                access_token: targetSession.access_token,
                refresh_token: targetSession.refresh_token,
            })

            if (error) {
                console.error("[Auth] Failed to switch session", error)
                // If "Auth session missing", it usually means Refresh Token is dead.
                // We should alert user.
                alert(`Failed to switch to ${email}: Session expired. Please login again.`)
                // removeSession(email) // Optional
            } else {
                console.log("[Auth] Switch successful", data)
                // Force navigation to root to trigger role-based redirect (Admin -> /admin, User -> /app)
                window.location.href = '/'
            }
        }
        setLoading(false)
    }



    // ... (skipping to signOut implementation)

    const signOut = async (options?: { keepStorage?: boolean, scope?: 'global' | 'local' | 'others' }) => {
        // Only remove from storage if keepStorage is NOT true
        if (!options?.keepStorage && profile?.email) {
            const currentSessions = getStoredSessions()
            const filtered = currentSessions.filter(s => s.email !== profile.email)
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered))
            setSavedSessions(filtered)
        }
        await supabase.auth.signOut({ scope: options?.scope })
    }

    useEffect(() => {
        const handleStorageChange = async (e: StorageEvent) => {
            if (e.key === SESSIONS_KEY) {
                console.log("Storage update detected:", e.newValue)
                const newSessions: SavedSession[] = e.newValue ? JSON.parse(e.newValue) : []
                const oldSessions: SavedSession[] = e.oldValue ? JSON.parse(e.oldValue) : []

                setSavedSessions(newSessions)

                console.log("Checking auto-sync. Profile:", profile, "NewSessions:", newSessions.length)

                // Auto-login logic:
                // If we are currently logged out (!profile) and a session appears/updates (from another tab),
                // we should try to sign in with it.
                if (!profile && newSessions.length > 0) {
                    // Find the session that CHANGED (added or updated)
                    // We look for a session in newSessions that isn't in oldSessions 
                    // OR is in oldSessions but has different tokens.
                    const changedSession = newSessions.find(ns => {
                        const oldMatch = oldSessions.find(os => os.email === ns.email)
                        if (!oldMatch) return true // It's new
                        return oldMatch.access_token !== ns.access_token // It updated
                    })

                    // Fallback to last session if we can't determine (e.g. slight timing issue)
                    const targetSession = changedSession || newSessions[newSessions.length - 1]

                    if (targetSession) {
                        try {
                            console.log("Attempting auto-sync with:", targetSession.email)
                            // @ts-ignore
                            const { error } = await supabase.auth.setSession({
                                refresh_token: targetSession.refresh_token,
                            })
                            if (!error) {
                                console.log("Auto-sync success!")
                            } else {
                                console.error("Auto-sync error:", error)
                            }
                        } catch (err) {
                            console.error("Auto-sync session failed", err)
                        }
                    }
                }
            }
        }

        window.addEventListener('storage', handleStorageChange)
        return () => window.removeEventListener('storage', handleStorageChange)
    }, [profile]) // Re-bind if profile changes so we know if we are logged out

    useEffect(() => {
        let mounted = true

        const getProfile = async (session: any) => {
            if (!session) {
                if (mounted) {
                    setProfile(null)
                    setLoading(false)
                }
                return
            }

            // Sync session to persistence
            updateSavedSession(session)

            try {
                const token = session.access_token
                const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })

                if (res.ok) {
                    const data = await res.json()
                    if (mounted) setProfile(data)
                } else {
                    console.error("Failed to fetch profile")
                    if (mounted) setProfile(null)
                }
            } catch (e) {
                console.error(e)
                if (mounted) setProfile(null)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            getProfile(session)
        })

        // 2. Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            getProfile(session)
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [updateSavedSession])

    return {
        profile,
        loading,
        savedSessions,
        switchAccount,
        addSession: updateSavedSession,
        signOut,
        removeSession
    }
}
