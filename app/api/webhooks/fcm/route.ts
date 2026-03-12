import { NextRequest, NextResponse } from 'next/server'

/**
 * Internal endpoint called by Supabase Edge Functions or backend jobs
 * to send FCM push notifications to users.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, token, title, body: msgBody, data } = body

    if (!token || !title) {
      return NextResponse.json({ error: 'token and title required' }, { status: 400 })
    }

    // In production, send via Firebase Admin SDK:
    // const admin = getFirebaseAdmin()
    // await admin.messaging().send({
    //   token,
    //   notification: { title, body: msgBody },
    //   data: data ?? {},
    //   apns: { payload: { aps: { sound: 'default' } } },
    //   android: { priority: 'high' },
    // })

    return NextResponse.json({ success: true, userId })
  } catch (error) {
    console.error('FCM push error:', error)
    return NextResponse.json({ error: 'Push failed' }, { status: 500 })
  }
}
