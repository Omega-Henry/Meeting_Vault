import { ExternalLink, Mail, Phone, Building, Globe, Copy, Check, X, Briefcase } from "lucide-react"
import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import clsx from "clsx"

interface ContactDetailProps {
    contact: any
    isOpen: boolean
    onClose: () => void
    editable?: boolean
}

export function ContactDetail({ contact, isOpen, onClose, editable }: ContactDetailProps) {
    const [activeTab, setActiveTab] = useState('profile')

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

    const profile = contact.profile || {}
    const services = contact.services || []

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

            {/* Modal Content */}
            <div className="relative z-50 w-full max-w-2xl bg-card border border-border rounded-lg shadow-lg flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-border bg-muted/10 shrink-0">
                    <button onClick={onClose} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </button>

                    <div className="flex items-start gap-4 pr-6">
                        <div className="h-16 w-16 rounded-full bg-muted overflow-hidden shrink-0 border-2 border-background shadow-sm flex items-center justify-center">
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="text-xl font-bold text-muted-foreground">
                                    {contact.name?.substring(0, 2).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold tracking-tight">{contact.name}</h2>
                            <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                                {profile.bio ? (
                                    <span>{profile.bio}</span>
                                ) : (
                                    <span className="italic">No bio available</span>
                                )}
                                <div className="flex gap-2 mt-2">
                                    {contact.is_unverified && (
                                        <span className="inline-flex items-center rounded-full border border-destructive/50 px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-destructive/10 text-destructive">
                                            Unverified
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
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
                        <div className="space-y-1">
                            <Field label="Email" value={contact.email} icon={Mail} provenance={profile.field_provenance?.email} />
                            <Field label="Phone" value={contact.phone} icon={Phone} provenance={profile.field_provenance?.phone} />
                            {contact.links?.map((link: string, i: number) => (
                                <Field key={i} label="Link" value={link} icon={Globe} />
                            ))}
                            <Field label="Assets" value={profile.assets?.join(', ')} icon={Building} />
                            <Field label="Buy Box" value={profile.buy_box ? JSON.stringify(profile.buy_box) : null} icon={Briefcase} />
                        </div>
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
