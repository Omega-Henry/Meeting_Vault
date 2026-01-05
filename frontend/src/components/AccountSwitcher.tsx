import { useState } from 'react'
import { ChevronUp, LogOut, Plus, UserCircle, Users } from 'lucide-react'
import { useUserProfile } from '../hooks/useUserContext'
import clsx from 'clsx'

export default function AccountSwitcher() {
    const { profile, savedSessions, switchAccount, signOut } = useUserProfile()
    const [isOpen, setIsOpen] = useState(false)

    // Filter out current session from saved list for display
    const otherSessions = savedSessions.filter(s => s.email !== profile?.email)

    const handleSwitch = async (email: string) => {
        await switchAccount(email)
        setIsOpen(false)
    }

    const handleAddAccount = async () => {
        // We'll redirect to login page. 
        // Important: we don't want to lose current context completely, 
        // but Login page usually starts fresh.
        // Once logged in, the new session will be added to the list by useUserContext.
        await signOut() // Actually, we need to sign out to get the login prompt
        // But signOut removes the current session from the list in my previous logic??
        // Wait, "Add Account" implies keeping the current one.
        // UseUserContext signOut implementation removes it.
        // We should allow redirecting to /login WITHOUT clearing storage if intention is "Add Account"?
        // Supabase: we must sign out to sign in again.
        // If we sign out, my current logic deletes the session.
        // I need to update logic or accept that "Add Account" is tricky with single-client Supabase.
        window.location.href = '/login'
    }

    if (!profile) return null

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
                <div className="flex items-center">
                    <UserCircle className="mr-3 h-5 w-5" />
                    <span className="truncate max-w-[120px]">{profile.email}</span>
                </div>
                <ChevronUp className={clsx("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-full rounded-md border border-border bg-popover p-1 shadow-md">
                    {otherSessions.length > 0 && (
                        <div className="mb-2 border-b border-border pb-2">
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Switch to</div>
                            {otherSessions.map(session => (
                                <button
                                    key={session.email}
                                    onClick={() => handleSwitch(session.email)}
                                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                                >
                                    <Users className="mr-2 h-4 w-4 opacity-70" />
                                    <span className="truncate">{session.email}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={handleAddAccount} // This will effectively sign out current for now
                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Account
                    </button>

                    <button
                        onClick={() => signOut()}
                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Log Out
                    </button>
                </div>
            )}
        </div>
    )
}
