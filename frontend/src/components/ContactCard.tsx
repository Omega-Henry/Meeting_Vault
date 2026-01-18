import { Phone, Mail, Building, MapPin, Bot, CheckCircle, Globe, Check } from "lucide-react"

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
    selectable?: boolean
    selected?: boolean
    onSelect?: (id: string) => void
}

export function ContactCard({ contact, onClick, compact = false, selectable = false, selected = false, onSelect }: ContactCardProps) {
    const profileData = contact.profile
    const profile = Array.isArray(profileData) ? profileData[0] || {} : profileData || {}
    const initials = contact.name ? contact.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??'
    const provenance = profile.field_provenance || {}

    // Parse profile data
    const assets = Array.isArray(profile.assets) ? profile.assets : []
    const markets = Array.isArray(profile.markets) ? profile.markets : []
    const roleTags = Array.isArray(profile.role_tags) ? profile.role_tags : []
    const isClaimed = !!contact.claimed_by_user_id

    // AI provenance check for key fields
    const hasAiFields = Object.values(provenance).some(v => v === 'ai_generated')

    const handleCheckboxClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onSelect?.(contact.id)
    }

    return (
        <div
            className={`bg-card text-card-foreground rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer border-l-4 border-l-primary overflow-hidden flex flex-col group relative ${selected ? 'ring-2 ring-primary' : 'border-border'}`}
            onClick={onClick}
        >
            {/* Selection Checkbox */}
            {selectable && (
                <div
                    className={`absolute top-2 left-2 z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    onClick={handleCheckboxClick}
                >
                    <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${selected ? 'bg-primary border-primary' : 'bg-background border-muted-foreground/50 hover:border-primary'}`}>
                        {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                </div>
            )}
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
                    {profile.bio || profile.message_to_world && <p className="text-xs text-muted-foreground line-clamp-1">{profile.bio || profile.message_to_world}</p>}
                </div>
            </div>



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
                        <div className="flex gap-2">
                            {profile.blinq && <a href={profile.blinq} target="_blank" rel="noopener" className="text-primary hover:underline hover:text-primary/80" onClick={e => e.stopPropagation()}>Blinq</a>}
                            {profile.website && <a href={profile.website} target="_blank" rel="noopener" className="text-primary hover:underline hover:text-primary/80" onClick={e => e.stopPropagation()}>Website</a>}
                        </div>
                    </div>
                )}

                {/* Communities & Roles */}
                {(roleTags.length > 0 || (profile.communities && profile.communities.length > 0)) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {/* Communities */}
                        {profile.communities?.map((c: string) => (
                            <span key={`comm-${c}`} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 border border-purple-200">
                                {c}
                                {provenance.communities === 'ai_generated' && <Bot className="h-2 w-2 ml-1 opacity-50" />}
                            </span>
                        ))}
                        {/* Roles */}
                        {roleTags.slice(0, 4).map((tag: string) => (
                            <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                                {ROLE_TAG_EMOJIS[tag] || ''} {tag.toUpperCase()}
                            </span>
                        ))}
                    </div>
                )}

                {/* Hot Plate */}
                {profile.hot_plate && !compact && (
                    <div className="text-xs border-l-2 border-orange-500 pl-2 py-0.5 bg-orange-50/50 dark:bg-orange-950/20 italic text-muted-foreground my-1">
                        <span className="font-semibold text-orange-600 not-italic">🔥 Hot Plate:</span> {profile.hot_plate}
                        {provenance.hot_plate === 'ai_generated' && <Bot className="h-3 w-3 opacity-40 inline ml-1" />}
                    </div>
                )}

                {/* Buy Box Summary */}
                {profile.buy_box && !compact && (
                    <div className="text-[10px] bg-muted/50 p-1.5 rounded space-y-0.5">
                        <div className="font-semibold text-muted-foreground flex justify-between">
                            <span>📦 Buy Box</span>
                            {provenance.buy_box === 'ai_generated' && <Bot className="h-3 w-3 opacity-40" />}
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
                            {profile.buy_box.min_price && <span>Min: ${(profile.buy_box.min_price / 1000).toFixed(0)}k</span>}
                            {profile.buy_box.max_price && <span>Max: ${(profile.buy_box.max_price / 1000).toFixed(0)}k</span>}
                            {profile.buy_box.strategy && profile.buy_box.strategy.length > 0 && (
                                <span className="col-span-2 truncate">Strat: {profile.buy_box.strategy.join(', ')}</span>
                            )}
                        </div>
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
