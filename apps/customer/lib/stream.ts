'use client'

import { StreamChat } from 'stream-chat'

// Codes used throughout the app for graceful "chat unavailable" handling
export const STREAM_NOT_CONFIGURED = 'STREAM_NOT_CONFIGURED'
export const STREAM_UNAVAILABLE    = 'STREAM_UNAVAILABLE'

export function isChatUnavailableError(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  return code === STREAM_NOT_CONFIGURED || code === STREAM_UNAVAILABLE
}

let client: StreamChat | null = null

export function getStreamClient(): StreamChat {
  if (!client) {
    const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
    if (!apiKey || apiKey.length < 4) {
      throw Object.assign(new Error('Stream not configured'), { code: STREAM_NOT_CONFIGURED })
    }
    // Suppress internal WS / reconnect noise in the browser console.
    // The SDK logger receives ('warn'|'error'|'info', ...) — we only forward
    // info-level messages so SDK errors don't pollute DevTools.
    client = StreamChat.getInstance(apiKey, {
      logger: (logLevel, message, extraData) => {
        if (logLevel === 'info') {
           
          console.debug('[Stream]', message, extraData ?? '')
        }
      },
    })
  }
  return client
}

export async function connectStreamUser(userId: string, name: string, image?: string): Promise<StreamChat> {
  const streamClient = getStreamClient()

  // Already connected as this user — nothing to do
  if (streamClient.userID === userId) return streamClient

  // Disconnect if connected as a different user
  if (streamClient.userID) {
    await streamClient.disconnectUser()
  }

  // Fetch a short-lived token from our API
  const res = await fetch('/api/stream/token', { method: 'POST' })
  if (res.status === 503) {
    throw Object.assign(new Error('Stream not configured'), { code: STREAM_NOT_CONFIGURED })
  }
  if (!res.ok) throw new Error('Failed to get Stream token')
  const { token } = await res.json()

  try {
    await streamClient.connectUser({ id: userId, name, image }, token)
  } catch (err) {
    // Network-level WS failure (no internet, firewall, Stream outage, etc.)
    const wsErr = err as { isWSFailure?: boolean; message?: string }
    if (wsErr?.isWSFailure) {
      throw Object.assign(
        new Error(wsErr.message ?? 'Chat service temporarily unavailable'),
        { code: STREAM_UNAVAILABLE }
      )
    }
    throw err
  }

  return streamClient
}

export async function disconnectStreamUser(): Promise<void> {
  if (client?.userID) {
    await client.disconnectUser()
  }
}

export async function getOrCreateOrderChannel(
  orderId: string,
  customerId: string,
  makerId: string,
  makerName: string
): Promise<ReturnType<StreamChat['channel']>> {
  const streamClient = getStreamClient()

  // Stream Chat v9 channel() signature: channel(type, id, data?)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = (streamClient.channel as any)(
    'messaging',
    `order-${orderId}`,
    { members: [customerId, makerId] }
  )

  await channel.watch()
  return channel
}
