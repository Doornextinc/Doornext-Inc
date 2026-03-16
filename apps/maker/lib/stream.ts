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

  if (streamClient.userID === userId) return streamClient

  if (streamClient.userID) {
    await streamClient.disconnectUser()
  }

  const res = await fetch('/api/stream/token', { method: 'POST' })
  if (res.status === 503) {
    throw Object.assign(new Error('Stream not configured'), { code: 'STREAM_NOT_CONFIGURED' })
  }
  if (!res.ok) throw new Error('Failed to get Stream token')
  const { token } = await res.json()

  await streamClient.connectUser({ id: userId, name, image }, token)
  return streamClient
}

export async function disconnectStreamUser(): Promise<void> {
  if (client?.userID) {
    await client.disconnectUser()
  }
}
