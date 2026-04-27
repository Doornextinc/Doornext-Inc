import { createAdminClient } from '@/lib/supabase/server'

export default async function SettingsPage() {
  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('key, value, updated_at')
    .order('key')

  const sm = Object.fromEntries(
    (settings ?? []).map((s) => [s.key, s.value])
  )

  const sections = [
    {
      title: 'Pricing',
      rows: [
        { label: 'Delivery Fee', description: 'Flat fee charged to customers per order', key: 'delivery_fee', prefix: '$', type: 'number' },
        { label: 'Platform Fee %', description: 'Platform commission taken from each order', key: 'platform_fee_pct', suffix: '%', multiplier: 100, type: 'number' },
        { label: 'Min Order Amount', description: 'Minimum order total for customers', key: 'min_order_amount', prefix: '$', type: 'number' },
        { label: 'Max Delivery Radius (km)', description: 'Maximum delivery distance from seller', key: 'max_delivery_radius', suffix: ' km', type: 'number' },
      ],
    },
    {
      title: 'Driver Payouts',
      rows: [
        { label: 'Driver Base Payout', description: 'Fixed payout per completed delivery', key: 'driver_base_payout', prefix: '$', type: 'number' },
        { label: 'Driver Per KM Payout', description: 'Additional payout per km driven', key: 'driver_per_km_payout', prefix: '$', type: 'number' },
      ],
    },
    {
      title: 'Platform',
      rows: [
        { label: 'Service Active', description: 'Enable or disable the entire marketplace', key: 'service_active', type: 'boolean' },
        { label: 'Maintenance Mode', description: 'Show maintenance page to all users', key: 'maintenance_mode', type: 'boolean' },
        { label: 'Support Email', description: 'Email shown in the customer app for support', key: 'support_email', type: 'text' },
      ],
    },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Platform configuration — changes take effect immediately</p>
      </div>

      <div className="max-w-xl space-y-8">
        {sections.map(({ title, rows }) => (
          <div key={title}>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{title}</h2>
            <div className="space-y-3">
              {rows.map((row) => (
                <SettingRow
                  key={row.key}
                  label={row.label}
                  description={row.description}
                  settingKey={row.key}
                  currentValue={sm[row.key] ?? null}
                  prefix={(row as { prefix?: string }).prefix}
                  suffix={(row as { suffix?: string }).suffix}
                  multiplier={(row as { multiplier?: number }).multiplier ?? 1}
                  type={row.type as 'number' | 'boolean' | 'text'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  settingKey,
  currentValue,
  prefix,
  suffix,
  multiplier = 1,
  type = 'number',
}: {
  label: string
  description: string
  settingKey: string
  currentValue: unknown
  prefix?: string
  suffix?: string
  multiplier?: number
  type?: 'number' | 'boolean' | 'text'
}) {
  const raw = currentValue
  let displayValue: string
  let inputDefault: string

  if (type === 'boolean') {
    displayValue = raw === true || raw === 'true' ? 'Enabled' : 'Disabled'
    inputDefault = String(raw === true || raw === 'true')
  } else if (type === 'number') {
    const num = parseFloat(String(raw ?? 0))
    displayValue = `${prefix ?? ''}${(num * multiplier).toFixed(2)}${suffix ?? ''}`
    inputDefault = String(num * multiplier)
  } else {
    const str = String(raw ?? '').replace(/^"|"$/g, '')
    displayValue = str || '—'
    inputDefault = str
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="mb-3">
        <h3 className="font-bold text-gray-900">{label}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        <p className="text-sm font-semibold text-[#FF6B35] mt-1.5">
          Current: {displayValue}
        </p>
      </div>
      <form action="/api/admin/settings" method="POST" className="flex gap-2">
        <input type="hidden" name="key" value={settingKey} />
        {type === 'boolean' ? (
          <select
            name="value"
            defaultValue={inputDefault}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#FF6B35] focus:outline-none"
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        ) : type === 'text' ? (
          <input
            type="text"
            name="value"
            defaultValue={inputDefault}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#FF6B35] focus:outline-none"
          />
        ) : (
          <input
            type="number"
            name="value"
            step="0.01"
            defaultValue={inputDefault}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#FF6B35] focus:outline-none"
          />
        )}
        <button
          type="submit"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          Save
        </button>
      </form>
    </div>
  )
}
