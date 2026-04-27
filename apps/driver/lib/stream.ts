'use client'

import { StreamChat } from 'stream-chat'

let client: StreamChat | null = null

const STREAM_NOT_CONFIGURED = 'STREAM_NOT_CONFIGURED'

function notConfigured(): never {
  throw Object.assign(new Error('Stream not configured'), { code: STREAM_NOT_CONFIGURED })
}

function isKeyValid(key?: string): key is string {
  return !!key && !key.startsWith('your-') && !key.includes('placeholder') && key.length >= 8
}

export function getStreamClient(): StreamChat {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
  if (!isKeyValid(apiKey)) notConfigured()
  if (!client) {
    client = StreamChat.getInstance(apiKey)
  }
  return client
}

export async function connectStreamUser(userId: string, name: string, image?: string): Promise<StreamChat> {
  // Throws STREAM_NOT_CONFIGURED immediately if the key is absent/placeholder
  const streamClient = getStreamClient()

  if (streamClient.userID === userId) return streamClient

  if (streamClient.userID) {
    await streamClient.disconnectUser()
  }

  const res = await fetch('/api/stream/token', { method: 'POST' })
  if (res.status === 503) notConfigured()
  if (!res.ok) throw new Error('Failed to get Stream token')
  const { token } = await res.json()

  try {
    await streamClient.connectUser({ id: userId, name, image }, token)
  } catch (err) {
    // WS failure means the key is invalid or the service is unreachable —
    // surface it as STREAM_NOT_CONFIGURED so the UI shows "coming soon".
    if ((err as { isWSFailure?: boolean })?.isWSFailure) notConfigured()
    throw err
  }

  return streamClient
}

export async function disconnectStreamUser(): Promise<void> {
  if (client?.userID) {
    await client.disconnectUser()
  }
}
