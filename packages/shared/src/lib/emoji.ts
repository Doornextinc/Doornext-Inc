/**
 * Doornext semantic emoji map.
 *
 * Goal: replace lucide-react icons with emojis for warm, neighborly visual
 * voice ("neighbors cooking for neighbors"). Emojis match cross-platform on
 * mobile (iOS / Android / desktop browsers) and require no asset pipeline.
 *
 * **Use this map** anywhere we want a consistent visual symbol — status
 * indicators, list items, empty states, etc.
 *
 * **Do NOT replace** these classes of icons with emojis:
 *   - Navigation chevrons / arrows ("‹" "›" or lucide ChevronLeft/Right)
 *   - Loading spinners (need animation)
 *   - Form-control glyphs (×, ✓ for checkboxes have native semantics)
 *
 * Naming convention: lowercase with hyphens, grouped by category.
 *
 *   Use:    EMOJI.delivery → '🛵'
 *   Or:     <Emoji name="delivery" />   (see emoji.tsx)
 */

export const EMOJI = {
  // ── Brand / structural ─────────────────────────────────────────────────
  doornext: '🚪',       // platform symbol
  bell: '🔔',
  chat: '💬',
  search: '🔍',
  heart: '❤️',
  star: '⭐',
  warning: '⚠️',
  info: 'ℹ️',
  success: '✅',
  error: '❌',
  blocked: '🚫',
  pending: '⏳',
  refresh: '🔄',
  lock: '🔒',
  unlock: '🔓',
  shield: '🛡️',
  verified: '✅',
  pin: '📍',

  // ── People ─────────────────────────────────────────────────────────────
  user: '👤',
  users: '👥',
  maker: '👨‍🍳',         // home cook
  nexter: '🛵',           // delivery person — we use the scooter as the symbol
  neighbor: '🏘️',
  support: '🎧',

  // ── Food / kitchen ─────────────────────────────────────────────────────
  food: '🍽️',
  cooking: '🍳',
  burger: '🍔',
  pizza: '🍕',
  ramen: '🍜',
  taco: '🌮',
  dessert: '🍰',
  drink: '🥤',
  utensils: '🍴',

  // ── Order lifecycle (matches OrderStatus values where relevant) ────────
  'order-pending': '⏳',
  'order-confirmed': '✅',
  'order-preparing': '🍳',
  'order-ready': '🎉',
  'order-driver-assigned': '🛵',
  'order-arrived-at-maker': '📦',
  'order-picked-up': '📦',
  'order-on-the-way': '🚀',
  'order-arrived-at-customer': '🏠',
  'order-delivered': '🎉',
  'order-failed': '⚠️',
  'order-cancelled': '🚫',

  // ── Money / payments ───────────────────────────────────────────────────
  money: '💰',
  cash: '💵',
  card: '💳',
  tip: '💸',
  earnings: '📈',
  payout: '💰',
  withdrawal: '🏦',
  receipt: '🧾',

  // ── Logistics ──────────────────────────────────────────────────────────
  delivery: '🛵',
  package: '📦',
  map: '🗺️',
  location: '📍',
  route: '🛣️',
  navigation: '🧭',
  time: '⏱️',
  clock: '🕐',
  fast: '⚡',

  // ── Document / KYC ─────────────────────────────────────────────────────
  document: '📄',
  id: '🪪',
  license: '📜',
  camera: '📷',
  signature: '✍️',
  certificate: '🎓',

  // ── Action / state ─────────────────────────────────────────────────────
  edit: '✏️',
  trash: '🗑️',
  add: '➕',
  remove: '➖',
  send: '📤',
  download: '📥',
  upload: '📤',
  save: '💾',
  copy: '📋',
  share: '🔗',
  settings: '⚙️',
  notifications: '🔔',
  history: '📜',
  trips: '🗺️',
  home: '🏠',

  // ── Sentiment ──────────────────────────────────────────────────────────
  celebrate: '🎉',
  thumbs_up: '👍',
  fire: '🔥',
  sparkles: '✨',
  wave: '👋',
  thinking: '🤔',
  sad: '😞',
  cold: '🥶',

  // ── Connectivity ───────────────────────────────────────────────────────
  online: '🟢',
  offline: '⚫',
  signal: '📶',
} as const

export type EmojiName = keyof typeof EMOJI

/** Lookup helper. Returns the literal emoji string, or '' if name unknown. */
export function emoji(name: EmojiName): string {
  return EMOJI[name] ?? ''
}
