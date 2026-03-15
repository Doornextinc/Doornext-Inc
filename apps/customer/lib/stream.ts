'use client'

import { StreamChat } from 'stream-chat'

let client: StreamChat | null = null

export function getStreamClient(): StreamChat {
  if (!client) {
    client = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!)
  }
  return client
}

export async function connectStreamUser(userId: string, name: string, image?: string): Promise<StreamChat> {
  const streamClient = getStreamClient()

  // Already connected as this user
  if (streamClient.userID === userId) return streamClient

  // Disconnect if connected as someone else
  if (streamClient.userID) {
    await streamClient.disconnectUser()
  }

  // Fetch token from our API
  const res = await fetch('/api/stream/token', { method: 'POST' })
  if (res.status === 503) {
    // Stream not configured — chat feature unavailable
    throw Object.assign(new Error('Stream not configured'), { code: 'STREAM_NOT_CONFIGURED' })
  }
  if (!res.ok) throw new Error('Failed to get Stream token')
  const { token } = await res.json()

  await streamClient.connectUser(
    { id: userId, name, image },
    token
  )

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
