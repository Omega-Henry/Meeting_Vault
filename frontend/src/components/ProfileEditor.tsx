import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Save, Loader2, Bot, CheckCircle, X } from 'lucide-react'
import clsx from 'clsx'

interface ProfileEditorProps {
    contact: any
    onSave?: () => void
    onClose?: () => void
}

// Common asset classes in real estate
const ASSET_CLASS_OPTIONS = ['SFH', 'Multifamily', 'Commercial', 'Land', 'Mobile Home', 'Industrial', 'Retail', 'Mixed Use']

// Common US state codes
const MARKET_OPTIONS = ['Nationwide', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']

// Role tags
const ROLE_TAG_OPTIONS = [
    { value: 'buyer', label: 'Buyer' },
    { value: 'seller', label: 'Seller' },
    { value: 'wholesaler', label: 'Wholesaler' },
    { value: 'lender', label: 'Lender' },
    { value: 'investor', label: 'Investor' },
    { value: 'tc', label: 'Transaction Coordinator' },
    { value: 'gator', label: 'Gator Lender 🐊' },
    { value: 'subto', label: 'Subto Specialist ✌🏼' },
    { value: 'bird_dog', label: 'Bird Dog 🐕' },
    { value: 'oc', label: 'Owners Club' },
    { value: 'dts', label: 'Direct To Seller' },
    { value: 'dta', label: 'Direct To Agent' },
]

export default function ProfileEditor({ contact, onSave, onClose }: ProfileEditorProps) {
    const profile = contact?.profile || {}
    const provenance = profile.field_provenance || {}

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        // Contact fields
        name: contact?.name || '',
        email: contact?.email || '',
        phone: contact?.phone || '',

        // Profile fields
        bio: profile.bio || '',
        cell_phone: profile.cell_phone || '',
        office_phone: profile.office_phone || '',
        blinq: profile.blinq || '',
        website: profile.website || '',
        assets: profile.assets || [],
        markets: profile.markets || [],
        min_target_price: profile.min_target_price || '',
        max_target_price: profile.max_target_price || '',
        i_can_help_with: profile.i_can_help_with || '',
        help_me_with: profile.help_me_with || '',
        hot_plate: profile.hot_plate || '',
        message_to_world: profile.message_to_world || '',
        role_tags: profile.role_tags || [],
    })

    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setSuccess(false)
    }

    const toggleArrayItem = (field: 'assets' | 'markets' | 'role_tags', item: string) => {
        setFormData(prev => {
            const arr = prev[field] as string[]
            if (arr.includes(item)) {
                return { ...prev, [field]: arr.filter(x => x !== item) }
            } else {
                return { ...prev, [field]: [...arr, item] }
            }
        })
        setSuccess(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not authenticated')

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/profiles/me`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    ...formData,
                    min_target_price: formData.min_target_price ? parseFloat(formData.min_target_price as string) : null,
                    max_target_price: formData.max_target_price ? parseFloat(formData.max_target_price as string) : null,
                })
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || 'Failed to save profile')
            }

            setSuccess(true)
            onSave?.()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const isAiField = (field: string) => provenance[field] === 'ai_generated'

    return (
        <div className="bg-card rounded-xl border border-border shadow-lg overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
                <h2 className="text-lg font-bold">Edit Your Profile</h2>
                {onClose && (
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded">
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {error && (
                    <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="p-3 rounded-md bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" /> Profile saved successfully!
                    </div>
                )}

                {/* Basic Info Section */}
                <section className="space-y-4">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Basic Info</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium flex items-center gap-1">
                                Name {isAiField('name') && <Bot className="h-3 w-3 text-muted-foreground/50" />}
                            </label>
                            <input
                                className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background"
                                value={formData.name}
                                onChange={e => handleChange('name', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Email</label>
                            <input
                                type="email"
                                className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background"
                                value={formData.email}
                                onChange={e => handleChange('email', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Cell Phone</label>
                            <input
                                className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background"
                                value={formData.cell_phone}
                                onChange={e => handleChange('cell_phone', e.target.value)}
                                placeholder="+1 555 000 0000"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Office Phone</label>
                            <input
                                className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background"
                                value={formData.office_phone}
                                onChange={e => handleChange('office_phone', e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium">Bio</label>
                        <textarea
                            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background min-h-[80px]"
                            value={formData.bio}
                            onChange={e => handleChange('bio', e.target.value)}
                            placeholder="Tell the community about yourself..."
                        />
                    </div>
                </section>

                {/* Links Section */}
                <section className="space-y-4">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Links</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium">Blinq</label>
                            <input
                                className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background"
                                value={formData.blinq}
                                onChange={e => handleChange('blinq', e.target.value)}
                                placeholder="https://blinq.me/..."
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Website</label>
                            <input
                                className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background"
                                value={formData.website}
                                onChange={e => handleChange('website', e.target.value)}
                                placeholder="https://..."
                            />
                        </div>
                    </div>
                </section>

                {/* Role Tags */}
                <section className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">What You Do (Roles)</h3>
                    <div className="flex flex-wrap gap-2">
                        {ROLE_TAG_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggleArrayItem('role_tags', opt.value)}
                                className={clsx(
                                    "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                                    formData.role_tags.includes(opt.value)
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Asset Classes */}
                <section className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Asset Classes</h3>
                    <div className="flex flex-wrap gap-2">
                        {ASSET_CLASS_OPTIONS.map(asset => (
                            <button
                                key={asset}
                                type="button"
                                onClick={() => toggleArrayItem('assets', asset)}
                                className={clsx(
                                    "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                                    formData.assets.includes(asset)
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                                )}
                            >
                                {asset}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Markets */}
                <section className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Markets (States)</h3>
                    <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                        {MARKET_OPTIONS.map(market => (
                            <button
                                key={market}
                                type="button"
                                onClick={() => toggleArrayItem('markets', market)}
                                className={clsx(
                                    "px-2 py-1 rounded text-xs font-medium border transition-colors",
                                    formData.markets.includes(market)
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background text-muted-foreground border-border hover:border-primary/50"
                                )}
                            >
                                {market}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Price Range */}
                <section className="space-y-4">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Target Price Range</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium">Min ($)</label>
                            <input
                                type="number"
                                className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background"
                                value={formData.min_target_price}
                                onChange={e => handleChange('min_target_price', e.target.value)}
                                placeholder="50000"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Max ($)</label>
                            <input
                                type="number"
                                className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background"
                                value={formData.max_target_price}
                                onChange={e => handleChange('max_target_price', e.target.value)}
                                placeholder="500000"
                            />
                        </div>
                    </div>
                </section>

                {/* Value Props */}
                <section className="space-y-4">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Value Exchange</h3>
                    <div>
                        <label className="text-sm font-medium">I can help you with:</label>
                        <textarea
                            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background min-h-[60px]"
                            value={formData.i_can_help_with}
                            onChange={e => handleChange('i_can_help_with', e.target.value)}
                            placeholder="What value do you bring to the community?"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Help me with:</label>
                        <textarea
                            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background min-h-[60px]"
                            value={formData.help_me_with}
                            onChange={e => handleChange('help_me_with', e.target.value)}
                            placeholder="What are you looking for?"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">What's on your hot plate? (Currently working on)</label>
                        <textarea
                            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background min-h-[60px]"
                            value={formData.hot_plate}
                            onChange={e => handleChange('hot_plate', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Message to the world:</label>
                        <textarea
                            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background min-h-[60px]"
                            value={formData.message_to_world}
                            onChange={e => handleChange('message_to_world', e.target.value)}
                        />
                    </div>
                </section>

                {/* Submit */}
                <div className="pt-4 border-t border-border">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {loading ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            </form>
        </div>
    )
}
