import { Phone, Mail } from "lucide-react"

interface ContactCardProps {
    contact: any
    onClick: () => void
}

export function ContactCard({ contact, onClick }: ContactCardProps) {
    const profile = contact.profile || {}
    const initials = contact.name ? contact.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??'

    return (
        <div
            className="bg-card text-card-foreground rounded-xl border border-border shadow-sm hover:shadow-md transition-all cursor-pointer border-l-4 border-l-primary overflow-hidden flex flex-col group"
            onClick={onClick}
        >
            <div className="p-4 pb-2 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                    {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={contact.name} className="h-full w-full object-cover" />
                    ) : (
                        <span className="font-semibold text-lg text-muted-foreground">{initials}</span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors">{contact.name || "Unknown"}</h3>
                    {profile.bio && <p className="text-xs text-muted-foreground line-clamp-1">{profile.bio}</p>}
                </div>
            </div>

            <div className="p-4 pt-2 space-y-2 text-sm flex-1">
                {/* Key Info */}
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{contact.email || "No email"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{contact.phone || "No phone"}</span>
                </div>

                {/* Offers/Requests Summary */}
                <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-dashed border-border/50">
                    {contact.services?.filter((s: any) => s.type === 'offer' && !s.is_archived).slice(0, 2).map((s: any, i: number) => (
                        <span key={i} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 max-w-[150px] truncate">
                            Offer: {s.description}
                        </span>
                    ))}
                    {contact.services?.filter((s: any) => s.type === 'request' && !s.is_archived).slice(0, 2).map((s: any, i: number) => (
                        <span key={i} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-input bg-background hover:bg-accent hover:text-accent-foreground max-w-[150px] truncate">
                            Req: {s.description}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}
