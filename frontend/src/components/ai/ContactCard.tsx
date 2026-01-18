import { User, Phone, Mail, Map, Merge, ExternalLink } from 'lucide-react'

interface ContactCardProps {
    contact: {
        id: string
        name?: string
        email?: string
        phone?: string
        location?: string
        role_tags?: string[]
        match_reason?: string
        score?: number
    }
    onView?: (id: string) => void
    onMerge?: (id: string) => void
}

export default function ContactCard({ contact, onView, onMerge }: ContactCardProps) {
    return (
        <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition-all hover:bg-white/10 hover:shadow-lg hover:shadow-primary/5">
            {/* Glossy overlay effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

            <div className="relative z-10 flex gap-4">
                {/* Avatar / Initials */}
                <div className="shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20">
                        {contact.name ? (
                            <span className="text-lg font-bold">{contact.name.substring(0, 2).toUpperCase()}</span>
                        ) : (
                            <User className="h-6 w-6" />
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-semibold text-foreground truncate flex items-center gap-2">
                                {contact.name || 'Unknown Contact'}
                                {contact.role_tags?.includes('gator') && (
                                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
                                        Gator
                                    </span>
                                )}
                            </h3>
                            {/* Role Tags Badges */}
                            {contact.role_tags && contact.role_tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {contact.role_tags.filter(t => t !== 'gator').slice(0, 3).map(tag => (
                                        <span key={tag} className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] uppercase font-medium text-muted-foreground tracking-wider">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Match Reason / Score */}
                        {contact.match_reason && (
                            <div className="text-[10px] italic text-primary/80 max-w-[120px] text-right truncate" title={contact.match_reason}>
                                "{contact.match_reason}"
                            </div>
                        )}
                    </div>

                    {/* Meta Info */}
                    <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                        {contact.email && (
                            <div className="flex items-center gap-2 truncate">
                                <Mail className="h-3 w-3 shrink-0" />
                                {contact.email}
                            </div>
                        )}
                        {contact.phone && (
                            <div className="flex items-center gap-2 truncate">
                                <Phone className="h-3 w-3 shrink-0" />
                                {contact.phone}
                            </div>
                        )}
                        {contact.location && (
                            <div className="flex items-center gap-2 truncate">
                                <Map className="h-3 w-3 shrink-0" />
                                {contact.location}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions Footer */}
            <div className="relative z-10 mt-4 flex gap-2 border-t border-white/5 pt-3 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => onView && onView(contact.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                    <ExternalLink className="h-3 w-3" />
                    View Profile
                </button>
                <button
                    onClick={() => onMerge && onMerge(contact.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                    title="Merge Contact"
                >
                    <Merge className="h-3 w-3" />
                </button>
            </div>
        </div>
    )
}
