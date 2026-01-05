import { useState } from 'react'
import { ChevronUp, LogOut, Plus, UserCircle, Users, Trash2 } from 'lucide-react'
import { useUserProfile } from '../hooks/useUserContext'
import clsx from 'clsx'

export default function AccountSwitcher() {
    const { profile, savedSessions, switchAccount, signOut, removeSession } = useUserProfile()
    const [isOpen, setIsOpen] = useState(false)

    // Filter out current session from saved list for display
    const otherSessions = savedSessions.filter(s => s.email !== profile?.email)

    const handleSwitch = async (email: string) => {
        await switchAccount(email)
        setIsOpen(false)
    }

    const handleAddAccount = () => {
        // Manually clear Supabase session from storage without notifying server
        // This is safer than signOut({ scope: 'local' }) which might still trigger side effects
        // or be mishandled by the client, causing token revocation.
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                localStorage.removeItem(key)
            }
        })

        // Force reload to reset Supabase client state
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
                                    className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-muted group"
                                >
                                    <div className="flex items-center truncate">
                                        <Users className="mr-2 h-4 w-4 opacity-70" />
                                        <span className="truncate">{session.email}</span>
                                    </div>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (confirm(`Remove ${session.email} from saved accounts?`)) {
                                                removeSession(session.email)
                                            }
                                        }}
                                        className="hidden group-hover:block p-1 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Remove account"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </div>
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
