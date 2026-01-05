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
}

interface UserContextType {
    profile: UserProfile | null
    loading: boolean
    savedSessions: SavedSession[]
    switchAccount: (email: string) => Promise<void>
    addSession: (session: any) => void
    signOut: () => Promise<void>
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

        const currentSessions = getStoredSessions()
        const newSession: SavedSession = {
            email: session.user.email,
            user_id: session.user.id,
            access_token: session.access_token,
            refresh_token: session.refresh_token
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

    const switchAccount = async (email: string) => {
        setLoading(true)
        const targetSession = savedSessions.find(s => s.email === email)
        if (targetSession) {
            const { error } = await supabase.auth.setSession({
                access_token: targetSession.access_token,
                refresh_token: targetSession.refresh_token,
            })
            if (error) {
                console.error("Failed to switch session", error)
                // Remove invalid session
                const filtered = savedSessions.filter(s => s.email !== email)
                localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered))
                setSavedSessions(filtered)
                if (savedSessions.length === 0) {
                    await supabase.auth.signOut()
                }
            }
        }
        setLoading(false)
    }

    const signOut = async () => {
        // Just sign out current. Keep others in storage? 
        // User asked for "switch options instead of logging out". 
        // But explicit sign out should probably clear current session from storage 
        // OR allow "Forget Account" separately.
        // For now, standard signOut clears current supabase session.
        // We will keep it in storage unless explicitly removed (which we can add later if requested)
        // actually, let's remove CURRENT user from storage on explicit sign out
        if (profile?.email) {
            const currentSessions = getStoredSessions()
            const filtered = currentSessions.filter(s => s.email !== profile.email)
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered))
            setSavedSessions(filtered)
        }
        await supabase.auth.signOut()
    }

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
        signOut
    }
}
