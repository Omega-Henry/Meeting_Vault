import { ExternalLink, Mail, Phone, Building, Globe, Copy, Check, X, Briefcase, Trash2 } from "lucide-react"
import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import clsx from "clsx"

interface ContactDetailProps {
    contact: any
    isOpen: boolean
    onClose: () => void
    editable?: boolean
    onDelete?: () => void  // Callback after successful deletion
}

export function ContactDetail({ contact, isOpen, onClose, editable, onDelete }: ContactDetailProps) {
    const [activeTab, setActiveTab] = useState('profile')
    const [deleting, setDeleting] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editForm, setEditForm] = useState<any>({})

    // Helper to safely get profile object
    const getProfile = (c: any) => {
        if (!c?.profile) return {}
        return Array.isArray(c.profile) ? c.profile[0] || {} : c.profile
    }

    // Initialize form when opening edit mode
    useEffect(() => {
        if (editing && contact) {
            const profile = getProfile(contact)
            setEditForm({
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                ...profile,
                // Flatten arrays for text input (comma separated)
                communities: profile.communities?.join(', '),
                assets: profile.assets?.join(', '),
                role_tags: profile.role_tags?.join(', '),
                buy_box_min: profile.buy_box?.min_price,
                buy_box_max: profile.buy_box?.max_price,
                buy_box_desc: profile.buy_box?.description
            })
        }
    }, [editing, contact])

    const handleSaveProfile = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const currentProfile = getProfile(contact)

            // Prepare payload
            const payload = {
                name: editForm.name,
                email: editForm.email,
                phone: editForm.phone,
                profile: {
                    ...currentProfile, // keep existing fields not in form
                    bio: editForm.bio,
                    hot_plate: editForm.hot_plate,
                    i_can_help_with: editForm.i_can_help_with,
                    help_me_with: editForm.help_me_with,
                    message_to_world: editForm.message_to_world,
                    blinq: editForm.blinq,
                    website: editForm.website,

                    // Parse lists
                    communities: editForm.communities?.split(',').map((s: string) => s.trim()).filter(Boolean),
                    assets: editForm.assets?.split(',').map((s: string) => s.trim()).filter(Boolean),
                    role_tags: editForm.role_tags?.split(',').map((s: string) => s.trim()).filter(Boolean),

                    // Reconstruct Buy Box
                    buy_box: {
                        ...(currentProfile.buy_box || {}),
                        min_price: editForm.buy_box_min ? Number(editForm.buy_box_min) : null,
                        max_price: editForm.buy_box_max ? Number(editForm.buy_box_max) : null,
                        description: editForm.buy_box_desc
                    },

                    // Mark edited fields as user_verified
                    field_provenance: {
                        ...(currentProfile.field_provenance || {}),
                        hot_plate: 'user_verified',
                        bio: 'user_verified',
                        communities: 'user_verified',
                        assets: 'user_verified',
                        buy_box: 'user_verified'
                    }
                }
            }

            // Hit API
            // Assumption: API supports PATCH /api/contacts/:id
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/contacts/${contact.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error("Failed to update")

            setEditing(false)
            onClose() // simpler reload
            // In a perfect world we'd update locally, but this ensures fresh sync

        } catch (e) {
            console.error(e)
            alert("Failed to save profile")
        }
    }

    const handleDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${contact.name}? This will also delete all their services.`)) return

        setDeleting(true)
        try {
            const { error } = await supabase
                .from('contacts')
                .delete()
                .eq('id', contact.id)

            if (error) throw error

            onClose()
            onDelete?.()
        } catch (e) {
            console.error(e)
            alert('Failed to delete contact')
        } finally {
            setDeleting(false)
        }
    }

    // Lock body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = 'unset'
        }
        return () => { document.body.style.overflow = 'unset' }
    }, [isOpen])

    if (!contact || !isOpen) return null

    const profile = getProfile(contact)
    const services = contact.services || []

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

            {/* Modal Content */}
            <div className="relative z-50 w-full max-w-2xl bg-card border border-border rounded-lg shadow-lg flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header Actions */}
                <div className="p-6 border-b border-border bg-muted/10 shrink-0 relative">
                    <div className="absolute top-4 right-12 flex gap-2">
                        {editable && !editing && (
                            <button onClick={() => setEditing(true)} className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90">
                                Edit Profile
                            </button>
                        )}
                        {editable && editing && (
                            <div className="flex gap-2">
                                <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded hover:bg-secondary/80">
                                    Cancel
                                </button>
                                <button onClick={handleSaveProfile} className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700">
                                    Save
                                </button>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </button>

                    <div className="flex items-start gap-4 pr-6">
                        {/* Avatar */}
                        <div className="h-16 w-16 rounded-full bg-muted overflow-hidden shrink-0 border-2 border-background shadow-sm flex items-center justify-center">
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="text-xl font-bold text-muted-foreground">
                                    {contact.name?.substring(0, 2).toUpperCase()}
                                </div>
                            )}
                        </div>

                        {/* Name & Bio */}
                        <div className="flex-1">
                            {editing ? (
                                <div className="space-y-2">
                                    <input className="w-full text-xl font-bold bg-background border rounded px-2 py-1" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                                    <textarea className="w-full text-sm bg-background border rounded px-2 py-1 min-h-[60px]" value={editForm.bio || ''} onChange={e => setEditForm({ ...editForm, bio: e.target.value })} placeholder="Bio/Message to World" />
                                </div>
                            ) : (
                                <>
                                    <h2 className="text-2xl font-bold tracking-tight">{contact.name}</h2>
                                    <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                                        {profile.bio ? <span>{profile.bio}</span> : <span className="italic">No bio available</span>}
                                        <div className="flex gap-2 mt-2">
                                            {contact.is_unverified && (
                                                <span className="inline-flex items-center rounded-full border border-destructive/50 px-2.5 py-0.5 text-xs font-semibold bg-destructive/10 text-destructive">
                                                    Unverified
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    {/* Delete Button for Admins (only show if not editing to avoid clutter) */}
                    {editable && !editing && (
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="mt-4 flex items-center text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-50"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {deleting ? 'Deleting...' : 'Delete Contact'}
                        </button>
                    )}
                </div>

                {/* Tabs Header */}
                <div className="border-b border-border px-6 pt-2 shrink-0 bg-background">
                    <div className="flex space-x-6">
                        {['profile', 'offers', 'requests'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={clsx(
                                    "pb-3 text-sm font-medium border-b-2 transition-colors capitalize",
                                    activeTab === tab
                                        ? "border-primary text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                )}
                            >
                                {tab}
                                {tab !== 'profile' &&
                                    <span className="ml-2 px-1.5 py-0.5 rounded-full bg-muted text-xs">
                                        {services.filter((s: any) => s.type === tab.slice(0, -1)).length}
                                    </span>
                                }
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-background">
                    {activeTab === 'profile' && (
                        editing ? (
                            <div className="space-y-6">
                                {/* Basic Info Section */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-foreground border-b pb-1">Basic Details</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <EditField label="Email" value={editForm.email} onChange={v => setEditForm({ ...editForm, email: v })} />
                                        <EditField label="Phone" value={editForm.phone} onChange={v => setEditForm({ ...editForm, phone: v })} />
                                    </div>
                                </div>

                                {/* Needs / Haves Section */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-foreground border-b pb-1">I Can Help With...</h3>
                                    <EditField label="Hot Plate (Current Focus)" value={editForm.hot_plate} onChange={v => setEditForm({ ...editForm, hot_plate: v })} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <EditField label="I can help with" value={editForm.i_can_help_with} onChange={v => setEditForm({ ...editForm, i_can_help_with: v })} />
                                        <EditField label="Help me with" value={editForm.help_me_with} onChange={v => setEditForm({ ...editForm, help_me_with: v })} />
                                    </div>
                                </div>

                                {/* Tags Section */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-foreground border-b pb-1">Tags & Communities</h3>
                                    <EditField label="Communities (comma separated)" value={editForm.communities} onChange={v => setEditForm({ ...editForm, communities: v })} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <EditField label="Role Tags" value={editForm.role_tags} onChange={v => setEditForm({ ...editForm, role_tags: v })} />
                                        <EditField label="Asset Classes" value={editForm.assets} onChange={v => setEditForm({ ...editForm, assets: v })} />
                                    </div>
                                </div>

                                {/* Buy Box Section */}
                                <div className="p-4 border rounded-md bg-muted/20 space-y-3">
                                    <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">Buy Box Details</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Min Price</label>
                                            <input className="w-full border rounded px-2 py-1.5 text-sm mt-1" type="number" placeholder="0" value={editForm.buy_box_min || ''} onChange={e => setEditForm({ ...editForm, buy_box_min: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Max Price</label>
                                            <input className="w-full border rounded px-2 py-1.5 text-sm mt-1" type="number" placeholder="No Limit" value={editForm.buy_box_max || ''} onChange={e => setEditForm({ ...editForm, buy_box_max: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Strategy / Description</label>
                                        <textarea className="w-full border rounded px-2 py-1.5 text-sm mt-1 min-h-[60px]" placeholder="Specific buy criteria..." value={editForm.buy_box_desc || ''} onChange={e => setEditForm({ ...editForm, buy_box_desc: e.target.value })} />
                                    </div>
                                </div>

                                {/* Links Section */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-foreground border-b pb-1">Links</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <EditField label="Blinq URL" value={editForm.blinq} onChange={v => setEditForm({ ...editForm, blinq: v })} />
                                        <EditField label="Website" value={editForm.website} onChange={v => setEditForm({ ...editForm, website: v })} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <Field label="Email" value={contact.email} icon={Mail} provenance={profile.field_provenance?.email} />
                                <Field label="Phone" value={contact.phone} icon={Phone} provenance={profile.field_provenance?.phone} />

                                {/* Rich Fields */}
                                <Field label="Hot Plate" value={profile.hot_plate} icon={Briefcase} provenance={profile.field_provenance?.hot_plate} />
                                <Field label="Bio / Message" value={profile.message_to_world || profile.bio} icon={null} provenance={profile.field_provenance?.message_to_world} />

                                <div className="grid grid-cols-2 gap-4">
                                    <Field label="I can help with" value={profile.i_can_help_with} icon={Check} provenance={profile.field_provenance?.i_can_help_with} />
                                    <Field label="Help me with" value={profile.help_me_with} icon={Briefcase} provenance={profile.field_provenance?.help_me_with} />
                                </div>

                                <Field label="Communities" value={profile.communities?.join(', ')} icon={Globe} provenance={profile.field_provenance?.communities} />
                                <Field label="Role Tags" value={profile.role_tags?.join(', ')} icon={null} provenance={profile.field_provenance?.role_tags} />
                                <Field label="Asset Classes" value={profile.assets?.join(', ')} icon={Building} provenance={profile.field_provenance?.assets} />

                                {/* Buy Box Detail */}
                                {profile.buy_box && (
                                    <div className="py-3 border-b border-border/50">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1 flex items-center gap-2">
                                            Buy Box
                                            {profile.field_provenance?.buy_box === 'ai_generated' && <span className="text-[10px] bg-muted px-1.5 rounded-full">✨ AI</span>}
                                        </p>
                                        <div className="bg-muted/30 p-3 rounded-md text-sm space-y-1">
                                            {profile.buy_box.min_price && <div className="flex justify-between"><span className="text-muted-foreground">Min Price:</span> <span>${profile.buy_box.min_price.toLocaleString()}</span></div>}
                                            {profile.buy_box.max_price && <div className="flex justify-between"><span className="text-muted-foreground">Max Price:</span> <span>${profile.buy_box.max_price.toLocaleString()}</span></div>}
                                            {profile.buy_box.markets?.length > 0 && <div><span className="text-muted-foreground">Markets:</span> {profile.buy_box.markets.join(', ')}</div>}
                                            {profile.buy_box.strategy?.length > 0 && <div><span className="text-muted-foreground">Strategy:</span> {profile.buy_box.strategy.join(', ')}</div>}
                                            {profile.buy_box.description && <div className="mt-2 text-muted-foreground italic">"{profile.buy_box.description}"</div>}
                                        </div>
                                    </div>
                                )}

                                {/* Links */}
                                {(contact.links?.length > 0 || profile.blinq || profile.website || profile.social_media) && (
                                    <div className="py-3">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Links</p>
                                        <div className="flex flex-wrap gap-2">
                                            {profile.blinq && <a href={profile.blinq} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/50 text-secondary-foreground text-sm hover:bg-secondary"><ExternalLink className="h-3 w-3" /> Blinq</a>}
                                            {profile.website && <a href={profile.website} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/50 text-secondary-foreground text-sm hover:bg-secondary"><Globe className="h-3 w-3" /> Website</a>}

                                            {/* Generic links from contact.links */}
                                            {contact.links?.map((link: string, i: number) => (
                                                <a key={i} href={link} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/50 text-secondary-foreground text-sm hover:bg-secondary truncate max-w-[200px]"><ExternalLink className="h-3 w-3" /> Link {i + 1}</a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    )}

                    {(activeTab === 'offers' || activeTab === 'requests') && (
                        <div className="space-y-4">
                            {editable && (
                                <AddServiceForm
                                    contactId={contact.id}
                                    type={activeTab === 'offers' ? 'offer' : 'request'}
                                    onSuccess={onClose} // Ideally refresh data, but closing forces refresh on re-open
                                />
                            )}

                            {services.filter((s: any) => s.type === activeTab.slice(0, -1) && (!s.is_archived || editable)).map((s: any) => (
                                <ServiceCard key={s.id} service={s} editable={editable} />
                            ))}

                            {services.filter((s: any) => s.type === activeTab.slice(0, -1) && !s.is_archived).length === 0 && !editable && (
                                <p className="text-center text-muted-foreground py-8">No {activeTab} listed.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function Field({ label, value, icon: Icon, provenance }: any) {
    const [copied, setCopied] = useState(false)
    if (!value) return null

    const copy = () => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="flex items-start justify-between py-3 border-b border-border/50 last:border-0 hover:bg-muted/20 -mx-2 px-2 rounded-md transition-colors">
            <div className="flex gap-3">
                {Icon && <Icon className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />}
                <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-medium mt-0.5 break-all">{value}</p>
                    {provenance && (
                        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground mt-1 bg-background">
                            {provenance === 'ai_generated' ? '✨ AI Extracted' : successIcon(provenance)}
                        </span>
                    )}
                </div>
            </div>
            <button onClick={copy} className="p-1.5 hover:bg-muted rounded text-muted-foreground shrink-0">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
        </div>
    )
}

function successIcon(p: string) {
    if (p === 'user_verified') return 'Verified'
    if (p === 'admin_verified') return 'Admin Verified'
    return p
}

function ServiceCard({ service, editable }: { service: any, editable?: boolean }) {
    const [archived, setArchived] = useState(service.is_archived)

    const toggleArchive = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/services/${service.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ is_archived: !archived })
            })
            setArchived(!archived)
        } catch (e) {
            console.error(e)
            alert("Failed to update service")
        }
    }

    return (
        <div className={clsx("p-4 rounded-lg border bg-card text-card-foreground shadow-sm transition-colors",
            archived ? "border-dashed opacity-70 bg-muted/40" : "border-border hover:border-primary/50"
        )}>
            <div className="flex justify-between items-start gap-2">
                <p className="text-sm leading-relaxed">{service.description}</p>
                <div className="flex items-center gap-2">
                    {archived && (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground">Archived</span>
                    )}
                    {editable && (
                        <button onClick={toggleArchive} className="text-xs text-muted-foreground hover:text-foreground underline">
                            {archived ? "Restore" : "Archive"}
                        </button>
                    )}
                </div>
            </div>
            {service.meeting_chat_id && (
                <div className="mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="font-medium">Source:</span> Meeting Chat
                    <ExternalLink className="h-3 w-3 opacity-70" />
                </div>
            )}
        </div>
    )
}

function AddServiceForm({ contactId, type, onSuccess }: { contactId: string, type: string, onSuccess: () => void }) {
    const [desc, setDesc] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!desc.trim()) return
        setLoading(true)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/services`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ contact_id: contactId, type, description: desc })
            })

            if (res.ok) {
                setDesc('')
                onSuccess()
            } else {
                alert("Failed to add service")
            }
        } catch (err) {
            alert("Error adding service")
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mb-4 p-3 border border-dashed border-input rounded-lg bg-muted/20">
            <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Add New {type}</label>
            <div className="flex gap-2">
                <input
                    className="flex-1 bg-background border border-input rounded px-3 py-1.5 text-sm"
                    placeholder={`Describe the ${type}...`}
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                />
                <button
                    disabled={loading || !desc}
                    className="bg-primary text-primary-foreground text-xs font-medium px-3 rounded hover:bg-primary/90 disabled:opacity-50"
                >
                    Add
                </button>
            </div>
        </form>
    )
}

function EditField({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
    return (
        <div>
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            <input
                className="w-full border rounded px-2 py-1.5 text-sm bg-background mt-1 focus:ring-2 focus:ring-primary/20"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
            />
        </div>
    )
}
