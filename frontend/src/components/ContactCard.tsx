import { Phone, Mail, Building, MapPin, Bot, CheckCircle, Globe } from "lucide-react"

// Role tag emoji mapping
const ROLE_TAG_EMOJIS: Record<string, string> = {
    'gator': '🐊',
    'subto': '✌🏼',
    'bird_dog': '🐕',
    'tc': '📋',
    'oc': '👑',
}

interface ContactCardProps {
    contact: any
    onClick: () => void
    compact?: boolean
}

export function ContactCard({ contact, onClick, compact = false }: ContactCardProps) {
    const profile = contact.profile || {}
    const initials = contact.name ? contact.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??'
    const provenance = profile.field_provenance || {}

    // Parse profile data
    const assets = Array.isArray(profile.assets) ? profile.assets : []
    const markets = Array.isArray(profile.markets) ? profile.markets : []
    const roleTags = Array.isArray(profile.role_tags) ? profile.role_tags : []
    const isClaimed = !!contact.claimed_by_user_id

    // AI provenance check for key fields
    const hasAiFields = Object.values(provenance).some(v => v === 'ai_generated')

    return (
        <div
            className="bg-card text-card-foreground rounded-xl border border-border shadow-sm hover:shadow-md transition-all cursor-pointer border-l-4 border-l-primary overflow-hidden flex flex-col group"
            onClick={onClick}
        >
            {/* Header with Avatar */}
            <div className="p-4 pb-2 flex items-center gap-4">
                <div className="relative">
                    <div className="h-12 w-12 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                        {profile.avatar_url ? (
                            <img src={profile.avatar_url} alt={contact.name} className="h-full w-full object-cover" />
                        ) : (
                            <span className="font-semibold text-lg text-muted-foreground">{initials}</span>
                        )}
                    </div>
                    {/* Verified badge */}
                    {isClaimed && (
                        <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full p-0.5" title="Verified Profile">
                            <CheckCircle className="h-3 w-3 text-white" />
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors">
                            {contact.name || "Unknown"}
                        </h3>
                        {hasAiFields && (
                            <span title="Contains AI-generated data">
                                <Bot className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                            </span>
                        )}
                    </div>
                    {profile.bio && <p className="text-xs text-muted-foreground line-clamp-1">{profile.bio}</p>}
                </div>
            </div>

            {/* Role Tags */}
            {roleTags.length > 0 && (
                <div className="px-4 flex flex-wrap gap-1">
                    {roleTags.slice(0, 4).map((tag: string) => (
                        <span
                            key={tag}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary"
                        >
                            {ROLE_TAG_EMOJIS[tag] || ''} {tag.toUpperCase()}
                        </span>
                    ))}
                </div>
            )}

            <div className="p-4 pt-2 space-y-2 text-sm flex-1">
                {/* Contact Info */}
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{contact.email || "No email"}</span>
                    {provenance.email === 'ai_generated' && <Bot className="h-3 w-3 opacity-40" />}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{contact.phone || profile.cell_phone || "No phone"}</span>
                </div>

                {/* Markets */}
                {markets.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{markets.slice(0, 5).join(', ')}</span>
                    </div>
                )}

                {/* Assets */}
                {assets.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Building className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{assets.slice(0, 3).join(', ')}</span>
                    </div>
                )}

                {/* Blinq or Website */}
                {(profile.blinq || profile.website) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <a
                            href={profile.blinq || profile.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {profile.blinq ? 'Blinq' : 'Website'}
                        </a>
                    </div>
                )}

                {/* Price Range */}
                {(profile.min_target_price || profile.max_target_price) && !compact && (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <span className="font-medium text-foreground">💰 Range:</span>
                        {profile.min_target_price && `$${(profile.min_target_price / 1000).toFixed(0)}k`}
                        {profile.min_target_price && profile.max_target_price && ' - '}
                        {profile.max_target_price && `$${(profile.max_target_price / 1000).toFixed(0)}k`}
                        {provenance.min_target_price === 'ai_generated' && <Bot className="h-3 w-3 opacity-40" />}
                    </div>
                )}

                {/* I can help with */}
                {profile.i_can_help_with && !compact && (
                    <div className="pt-1 text-xs text-muted-foreground">
                        <span className="font-medium text-green-600">✓ Can help:</span> {profile.i_can_help_with.substring(0, 80)}{profile.i_can_help_with.length > 80 ? '...' : ''}
                        {provenance.i_can_help_with === 'ai_generated' && <Bot className="h-3 w-3 opacity-40 inline ml-1" />}
                    </div>
                )}

                {/* Help me with */}
                {profile.help_me_with && !compact && (
                    <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-blue-600">⟡ Looking for:</span> {profile.help_me_with.substring(0, 80)}{profile.help_me_with.length > 80 ? '...' : ''}
                        {provenance.help_me_with === 'ai_generated' && <Bot className="h-3 w-3 opacity-40 inline ml-1" />}
                    </div>
                )}

                {/* Offers/Requests Summary */}
                {!compact && contact.services && contact.services.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-dashed border-border/50">
                        {contact.services?.filter((s: any) => s.type === 'offer' && !s.is_archived).slice(0, 2).map((s: any, i: number) => (
                            <span key={`offer-${i}`} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold border-transparent bg-green-500/10 text-green-600 max-w-[150px] truncate">
                                Offer: {s.description}
                            </span>
                        ))}
                        {contact.services?.filter((s: any) => s.type === 'request' && !s.is_archived).slice(0, 2).map((s: any, i: number) => (
                            <span key={`req-${i}`} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold border-blue-500/20 bg-blue-500/10 text-blue-600 max-w-[150px] truncate">
                                Need: {s.description}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
