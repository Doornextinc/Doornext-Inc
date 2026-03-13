import { createAdminClient } from '@/lib/supabase/server'

export default async function SettingsPage() {
  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('key, value, updated_at')
    .order('key')

  const settingsMap = Object.fromEntries(
    (settings ?? []).map((s) => [s.key, { value: s.value, updated_at: s.updated_at }])
  )

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Platform configuration</p>
      </div>

      <div className="max-w-lg space-y-4">
        <SettingRow
          label="Delivery Fee"
          description="Flat fee charged to customers per order"
          settingKey="delivery_fee"
          currentValue={settingsMap['delivery_fee']?.value ?? 3.99}
          prefix="$"
        />
        <SettingRow
          label="Platform Fee"
          description="Percentage taken as platform commission"
          settingKey="platform_fee_pct"
          currentValue={settingsMap['platform_fee_pct']?.value ?? 0.05}
          suffix="%"
          multiplier={100}
        />
        <SettingRow
          label="Service Active"
          description="Enable or disable the entire marketplace"
          settingKey="service_active"
          currentValue={settingsMap['service_active']?.value ?? true}
          isBoolean
        />
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
  isBoolean = false,
}: {
  label: string
  description: string
  settingKey: string
  currentValue: number | boolean | string
  prefix?: string
  suffix?: string
  multiplier?: number
  isBoolean?: boolean
}) {
  const displayValue = isBoolean
    ? currentValue
    : typeof currentValue === 'number'
    ? (currentValue * multiplier).toFixed(2)
    : currentValue

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">{label}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          <p className="text-sm font-semibold text-[#FF6B35] mt-2">
            Current: {prefix}{String(displayValue)}{suffix}
          </p>
        </div>
      </div>
      <form action="/api/admin/settings" method="POST" className="mt-4 flex gap-2">
        <input type="hidden" name="key" value={settingKey} />
        {isBoolean ? (
          <select
            name="value"
            defaultValue={String(currentValue)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#FF6B35]"
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        ) : (
          <input
            type="number"
            name="value"
            step="0.01"
            defaultValue={String(typeof currentValue === 'number' ? currentValue * multiplier : currentValue)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#FF6B35]"
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
