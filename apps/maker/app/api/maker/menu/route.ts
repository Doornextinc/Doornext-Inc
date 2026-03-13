import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

async function getMakerFromSession() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, maker: null, supabase }
  const { data: maker } = await supabase
    .from('food_makers').select('id').eq('user_id', user.id).single()
  return { user, maker, supabase }
}

// POST — create menu item
export async function POST(req: NextRequest) {
  const { maker } = await getMakerFromSession()
  if (!maker) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, description, price, category, dietary_tags, is_available, daily_limit, prep_time_mins } = body

  if (!name || price === undefined) {
    return NextResponse.json({ error: 'name and price are required' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin
    .from('menu_items')
    .insert({
      maker_id: maker.id,
      name: name.trim(),
      description: description?.trim() || null,
      price: parseFloat(price),
      photo_url: body.photo_url ?? null,
      category: category?.trim() || null,
      dietary_tags: dietary_tags ?? [],
      is_available: is_available ?? true,
      daily_limit: daily_limit ? parseInt(daily_limit) : null,
      prep_time_mins: prep_time_mins ? parseInt(prep_time_mins) : 15,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// PATCH — update menu item
export async function PATCH(req: NextRequest) {
  const { maker } = await getMakerFromSession()
  if (!maker) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify item belongs to this maker
  const { data: existing } = await admin
    .from('menu_items').select('maker_id').eq('id', id).single()
  if (!existing || existing.maker_id !== maker.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}
  if (fields.name !== undefined) update.name = fields.name.trim()
  if (fields.description !== undefined) update.description = fields.description?.trim() || null
  if (fields.price !== undefined) update.price = parseFloat(fields.price)
  if (fields.photo_url !== undefined) update.photo_url = fields.photo_url ?? null
  if (fields.category !== undefined) update.category = fields.category?.trim() || null
  if (fields.dietary_tags !== undefined) update.dietary_tags = fields.dietary_tags
  if (fields.is_available !== undefined) update.is_available = fields.is_available
  if (fields.daily_limit !== undefined) update.daily_limit = fields.daily_limit ? parseInt(fields.daily_limit) : null
  if (fields.prep_time_mins !== undefined) update.prep_time_mins = parseInt(fields.prep_time_mins)

  const { data, error } = await admin
    .from('menu_items').update(update).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE — remove menu item
export async function DELETE(req: NextRequest) {
  const { maker } = await getMakerFromSession()
  if (!maker) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: existing } = await admin
    .from('menu_items').select('maker_id').eq('id', id).single()
  if (!existing || existing.maker_id !== maker.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await admin.from('menu_items').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
