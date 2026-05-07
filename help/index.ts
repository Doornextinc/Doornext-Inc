import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "*";
if (allowedOrigins === "*") {
  console.warn("[SECURITY] ALLOWED_ORIGINS not set — using wildcard CORS. Set this env var in production!");
}
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigins,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Valid status transitions ─────────────────────────────────
const DRIVER_STATUS_TRANSITIONS: Record<string, string[]> = {
  // Drivers cannot mark picked_up themselves — seller must verify PIN first
  picked_up: ["delivering"],
  delivering: ["driver_arrived"],
  driver_arrived: ["delivered"],
};

const SELLER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing"],
  preparing: ["ready"],
};

const ROAD_DETOUR_FACTOR = 1.4; // Approximate driving distance from straight-line

const haversineMiles = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3959; // Earth radius in miles (US market)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * ROAD_DETOUR_FACTOR;
};

// ── Fare calculation using delivery price tiers ─────────────
interface PriceTier {
  min_distance_miles: number;
  max_distance_miles: number;
  price: number;
}

function lookupFare(distanceMiles: number, tiers: PriceTier[]): number {
  const sorted = [...tiers].sort((a, b) => a.min_distance_miles - b.min_distance_miles);
  for (const tier of sorted) {
    if (distanceMiles >= tier.min_distance_miles && distanceMiles <= tier.max_distance_miles) {
      return tier.price;
    }
  }
  // Beyond max tier → use highest tier price
  return sorted.length > 0 ? sorted[sorted.length - 1].price : 2.99;
}

/**
 * Calculate multi-stop route distance using greedy nearest-neighbor:
 * Start from first store, visit remaining stores, then deliver to customer.
 * Returns per-order delivery fee split proportionally by each store's leg distance.
 */
async function calculateGroupFares(
  supabase: ReturnType<typeof createClient>,
  orderIds: string[],
): Promise<Map<string, number>> {
  const feeMap = new Map<string, number>();

  // Fetch orders with delivery coords
  const { data: orders } = await supabase
    .from("orders")
    .select("id, store_id, delivery_latitude, delivery_longitude")
    .in("id", orderIds);

  if (!orders || orders.length === 0) return feeMap;

  // Fetch stores
  const storeIds = [...new Set(orders.map(o => o.store_id))];
  const { data: stores } = await supabase
    .from("seller_stores")
    .select("id, latitude, longitude")
    .in("id", storeIds);

  const storeMap = new Map(stores?.map(s => [s.id, s]) || []);

  // Fetch price tiers
  const { data: tiers } = await supabase
    .from("delivery_price_tiers")
    .select("min_distance_miles, max_distance_miles, price")
    .order("min_distance_miles", { ascending: true });

  if (!tiers || tiers.length === 0) {
    // Fallback: flat fee
    orders.forEach(o => feeMap.set(o.id, 2.99));
    return feeMap;
  }

  if (orders.length === 1) {
    // Simple single-order fare
    const o = orders[0];
    const store = storeMap.get(o.store_id);
    if (store?.latitude && store?.longitude) {
      const dist = haversineMiles(store.latitude, store.longitude, o.delivery_latitude, o.delivery_longitude);
      feeMap.set(o.id, lookupFare(dist, tiers));
    } else {
      feeMap.set(o.id, tiers[0].price);
    }
    return feeMap;
  }

  // Multi-store: each order gets its OWN independent delivery fee
  // based on its store-to-customer distance. The driver visits each
  // store, so each leg deserves its own fare (like DoorDash).
  const deliveryLat = orders[0].delivery_latitude;
  const deliveryLng = orders[0].delivery_longitude;

  for (const o of orders) {
    const store = storeMap.get(o.store_id);
    if (store?.latitude && store?.longitude) {
      const dist = haversineMiles(store.latitude, store.longitude, deliveryLat, deliveryLng);
      feeMap.set(o.id, lookupFare(dist, tiers));
    } else {
      feeMap.set(o.id, tiers[0].price);
    }
  }

  return feeMap;
}

// ── Rate limit config per action (requests per window) ───────
const RATE_LIMITS: Record<string, { max: number; windowSeconds: number }> = {
  update_order_status: { max: 30, windowSeconds: 60 },
  accept_food_order: { max: 10, windowSeconds: 60 },
  accept_package_delivery: { max: 10, windowSeconds: 60 },
  request_withdrawal: { max: 5, windowSeconds: 300 },
  claim_flash_offer: { max: 10, windowSeconds: 60 },
  cancel_order: { max: 10, windowSeconds: 60 },
  verify_pickup_pin: { max: 10, windowSeconds: 60 },
  unassign_order: { max: 5, windowSeconds: 3600 },
  tip_driver: { max: 10, windowSeconds: 60 },
  tip_restaurant: { max: 10, windowSeconds: 60 },
  process_claim: { max: 5, windowSeconds: 300 },
  create_support_ticket: { max: 5, windowSeconds: 3600 },
  update_ticket_status: { max: 10, windowSeconds: 60 },
};

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  action: string,
): Promise<boolean> {
  const config = RATE_LIMITS[action];
  if (!config) return true; // no limit configured

  const windowStart = new Date(Date.now() - config.windowSeconds * 1000).toISOString();

  // Clean old entries & count recent ones
  await supabase
    .from("api_rate_limits")
    .delete()
    .eq("client_id", userId)
    .eq("endpoint", action)
    .lt("created_at", windowStart);

  const { count } = await supabase
    .from("api_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("client_id", userId)
    .eq("endpoint", action)
    .gte("created_at", windowStart);

  if ((count ?? 0) >= config.max) return false;

  // Record this request
  await supabase
    .from("api_rate_limits")
    .insert({ client_id: userId, endpoint: action });

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Extract user from JWT
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResponse({ error: "Authorization required" }, 401);

  // FIX C8: Use getUser instead of getClaims
  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await anonClient.auth.getUser();
  if (authError || !authData?.user) return jsonResponse({ error: "Invalid token" }, 401);
  const user = { id: authData.user.id };

  // Get user role
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  const userRole = roleData?.role;

  try {
    const body = await req.json();
    const { action } = body;

    // ── Rate limiting ──────────────────────────────────────────
    const statusAllowed = await checkRateLimit(supabase, user.id, action);
    if (!statusAllowed) {
      const config = RATE_LIMITS[action];
      return jsonResponse({
        error: `Rate limit exceeded. Max ${config.max} requests per ${config.windowSeconds}s.`,
      }, 429);
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: verify_pickup_pin
    // Seller verifies driver's PIN before releasing order
    // 5 wrong attempts → 30 minute lockout
    // ══════════════════════════════════════════════════════════
    if (action === "verify_pickup_pin") {
      const { order_id, pin } = body;
      if (!order_id || !pin) return jsonResponse({ error: "order_id and pin required" }, 400);

      // Fetch only required columns
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("pickup_pin, pickup_pin_attempts, pin_locked_until, driver_id, store_id, status")
        .eq("id", order_id)
        .single();

      if (orderErr || !order) return jsonResponse({ error: "Order not found" }, 404);

      // Check caller is the seller for this store (or admin)
      if (userRole === "seller") {
        const { data: store } = await supabase
          .from("seller_stores")
          .select("id")
          .eq("id", order.store_id)
          .eq("user_id", user.id)
          .single();
        if (!store) return jsonResponse({ error: "Not your store's order" }, 403);
      } else if (userRole !== "admin") {
        return jsonResponse({ error: "Only sellers or admins can verify pickup PIN" }, 403);
      }

      // Check lockout
      if (order.pin_locked_until && new Date(order.pin_locked_until) > new Date()) {
        return jsonResponse({
          error: "PIN locked due to too many attempts",
          locked_until: order.pin_locked_until,
        }, 423);
      }

      // Compare PIN
      if (String(pin) !== String(order.pickup_pin)) {
        // Atomic increment — uses the DB RPC to prevent race conditions where
        // concurrent wrong-PIN submissions could bypass the 5-attempt lockout.
        const { data: newAttempts, error: incErr } = await supabase
          .rpc("increment_pin_attempts", { p_order_id: order_id });
        if (incErr) throw incErr;
        const attempts = newAttempts ?? (order.pickup_pin_attempts || 0) + 1;
        if (attempts >= 5) {
          return jsonResponse({
            error: "Too many incorrect attempts. This pickup has been locked for 30 minutes.",
            locked: true,
          }, 423);
        }
        return jsonResponse({
          error: "Incorrect PIN",
          attempts_remaining: Math.max(0, 5 - attempts),
        }, 400);
      }

      // PIN correct — reset attempts, mark as picked_up
      await supabase.from("orders").update({
        pickup_pin_attempts: 0,
        pin_locked_until: null,
        status: "picked_up",
        picked_up_at: new Date().toISOString(),
      }).eq("id", order_id);

      // Notify customer
      try {
        await supabase.functions.invoke("notify-order-status", {
          body: { order_id, status: "picked_up", customer_id: order.driver_id ? undefined : undefined },
        });
      } catch (e) {
        console.error("PIN verify notification error:", e);
      }

      return jsonResponse({ success: true });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: unassign_order
    // Driver drops an order before pickup
    // ══════════════════════════════════════════════════════════
    if (action === "unassign_order") {
      const { order_id, reason } = body;
      if (!order_id) return jsonResponse({ error: "order_id required" }, 400);

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, status, driver_id, order_group_id, customer_id, store_id")
        .eq("id", order_id)
        .single();

      if (orderErr || !order) return jsonResponse({ error: "Order not found" }, 404);

      // Only assigned driver or admin can unassign
      if (userRole === "driver" && order.driver_id !== user.id) {
        return jsonResponse({ error: "You are not assigned to this order" }, 403);
      }
      if (userRole !== "driver" && userRole !== "admin") {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      // Cannot unassign after pickup
      if (!["confirmed", "preparing", "ready"].includes(order.status)) {
        return jsonResponse({ error: "Cannot unassign after pickup" }, 400);
      }

      // Unassign this order
      await supabase.from("orders").update({
        driver_id: null,
        status: "preparing",
        pickup_pin: null,
        pickup_pin_attempts: 0,
        pin_locked_until: null,
        order_group_id: null,
      }).eq("id", order_id);

      // If order had a group, unassign ALL orders in the group
      if (order.order_group_id) {
        await supabase.from("orders").update({
          driver_id: null,
          status: "preparing",
          pickup_pin: null,
          pickup_pin_attempts: 0,
          pin_locked_until: null,
          order_group_id: null,
        }).eq("order_group_id", order.order_group_id);
      }

      // Reset driver streak on unassign
      await supabase.from("driver_performance_scores").update({
        current_streak: 0,
        updated_at: new Date().toISOString(),
      }).eq("user_id", order.driver_id);

      return jsonResponse({ success: true });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: update_order_status
    // Server validates: role, ownership, valid transition
    // ══════════════════════════════════════════════════════════
    if (action === "update_order_status") {
      const { order_id, new_status } = body;
      if (!order_id || !new_status) return jsonResponse({ error: "order_id and new_status required" }, 400);

      // Fetch current order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, status, driver_id, customer_id, store_id, delivery_fee, delivery_instructions, proof_photo_url")
        .eq("id", order_id)
        .single();

      if (orderErr || !order) return jsonResponse({ error: "Order not found" }, 404);

      // IDEMPOTENT CHECK: if already at target status, return success immediately
      if (order.status === new_status) {
        return jsonResponse({ success: true, status: new_status });
      }

      // Determine allowed transitions based on role
      let allowed = false;

      if (userRole === "driver") {
        if (order.driver_id !== user.id) {
          return jsonResponse({ error: "You are not assigned to this order" }, 403);
        }
        const { data: docs } = await supabase
          .from("driver_documents")
          .select("verification_status")
          .eq("user_id", user.id)
          .single();

        if (docs?.verification_status !== "approved") {
          return jsonResponse({ error: "Driver not verified" }, 403);
        }

        const validNext = DRIVER_STATUS_TRANSITIONS[order.status];
        allowed = !!validNext && validNext.includes(new_status);
      } else if (userRole === "seller") {
        const { data: store } = await supabase
          .from("seller_stores")
          .select("id")
          .eq("id", order.store_id)
          .eq("user_id", user.id)
          .single();

        if (!store) return jsonResponse({ error: "Not your store's order" }, 403);

        const validNext = SELLER_STATUS_TRANSITIONS[order.status];
        allowed = !!validNext && validNext.includes(new_status);
      } else if (userRole === "admin") {
        allowed = true;
      }

      if (!allowed) {
        return jsonResponse({ error: `Invalid status transition: ${order.status} → ${new_status}` }, 400);
      }

      // Leave-at-door proof photo check
      if (new_status === "delivered" && order.delivery_instructions) {
        const instructions = order.delivery_instructions.toLowerCase();
        if ((instructions.includes("leave at door") || instructions.includes("leave at the door")) && !order.proof_photo_url) {
          return jsonResponse({ error: "Proof photo required for leave-at-door deliveries" }, 400);
        }
      }

      // Build update payload with server-controlled timestamps
      const updateData: Record<string, unknown> = { status: new_status };
      if (new_status === "ready") updateData.ready_at = new Date().toISOString();
      if (new_status === "picked_up") updateData.picked_up_at = new Date().toISOString();

      // For "delivered": use the bulletproof RPC that pre-inserts wallet
      // transactions before the order UPDATE, eliminating the duplicate-key
      // race across all accumulated wallet triggers.
      // Falls back to a direct UPDATE when the RPC is not found (PGRST202 =
      // migration not yet applied to this environment) — triggers have
      // ON CONFLICT DO NOTHING so the fallback is still safe.
      if (new_status === "delivered") {
        const { data: rpcResult, error: rpcErr } = await supabase
          .rpc("complete_order_delivery", { p_order_id: order_id });
        if (rpcErr) {
          // 23505 = PostgreSQL unique violation error code
          const isDuplicateKey = rpcErr.code === "23505" ||
            rpcErr.message?.includes("duplicate key") ||
            rpcErr.message?.includes("idx_wallet_tx_order_idempotency") ||
            (rpcErr as any).details?.includes("idx_wallet_tx_order_idempotency");

          if (rpcErr.code === "PGRST202" || isDuplicateKey) {
            // RPC not found OR duplicate wallet tx (old triggers without ON CONFLICT)
            // Wallet tx already exists — just flip the order status to delivered.
            console.warn("RPC failed, falling back to direct UPDATE:", rpcErr.code, rpcErr.message);
            const { error: updateErr } = await supabase
              .from("orders")
              .update({ status: "delivered", paid_at: new Date().toISOString() })
              .eq("id", order_id);
            if (updateErr) throw updateErr;
          } else {
            throw rpcErr;
          }
        } else if (rpcResult?.error) {
          // RPC returned an app-level error (e.g. invalid transition)
          // But if it's a duplicate key from inside the RPC, treat as success
          const rpcErrMsg = String(rpcResult.error);
          if (rpcErrMsg.includes("duplicate key") || rpcErrMsg.includes("idx_wallet_tx_order_idempotency")) {
            console.warn("RPC wallet duplicate — falling back to direct UPDATE");
            const { error: updateErr } = await supabase
              .from("orders")
              .update({ status: "delivered", paid_at: new Date().toISOString() })
              .eq("id", order_id);
            if (updateErr) throw updateErr;
          } else {
            return jsonResponse({ error: rpcResult.error }, 400);
          }
        }
      } else {
        const { error: updateErr } = await supabase
          .from("orders")
          .update(updateData)
          .eq("id", order_id);
        if (updateErr) throw updateErr;
      }

      // Notify customer + driver (if status changed by seller)
      try {
        await supabase.functions.invoke("notify-order-status", {
          body: {
            order_id,
            status: new_status,
            customer_id: order.customer_id,
            driver_id: order.driver_id,
          },
        });
      } catch (e) {
        console.error("Notification error:", e);
      }

      return jsonResponse({ success: true, status: new_status });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: accept_food_order
    // Server validates: driver verified, order unassigned, status valid
    // ══════════════════════════════════════════════════════════
    if (action === "accept_food_order") {
      const { order_id } = body;
      if (!order_id) return jsonResponse({ error: "order_id required" }, 400);

      if (userRole !== "driver") return jsonResponse({ error: "Only drivers can accept orders" }, 403);

      // Check driver is verified
      const { data: docs } = await supabase
        .from("driver_documents")
        .select("verification_status")
        .eq("user_id", user.id)
        .single();

      if (docs?.verification_status !== "approved") {
        return jsonResponse({ error: "Driver not verified. Complete verification first." }, 403);
      }

      // Check driver doesn't already have an active delivery (unless stacking is possible)
      const { data: activeOrders } = await supabase
        .from("orders")
        .select("id, order_group_id")
        .eq("driver_id", user.id)
        .in("status", ["preparing", "ready", "picked_up", "delivering", "driver_arrived"])
        .limit(10);

      if (activeOrders && activeOrders.length > 0) {
        // Allow if the new order is in the same group as the active one
        const activeGroupId = activeOrders[0].order_group_id;
        if (activeGroupId) {
          // Check if the target order is in the same group
          const { data: targetOrder } = await supabase
            .from("orders")
            .select("order_group_id")
            .eq("id", order_id)
            .single();
          if (!targetOrder || targetOrder.order_group_id !== activeGroupId) {
            return jsonResponse({ error: "You already have an active delivery. Complete it first." }, 400);
          }
        } else if (activeOrders.length >= 2) {
          // Already at max stack size
          return jsonResponse({ error: "You already have an active delivery. Complete it first." }, 400);
        }
        // If only 1 active order without a group, allow — stacking will handle it
      }

      // Generate a 4-digit pickup PIN for secure handover
      const pickupPin = String(Math.floor(1000 + Math.random() * 9000));

      // Atomically assign driver (only if still unassigned)
      const { data: updated, error: updateErr } = await supabase
        .from("orders")
        .update({ driver_id: user.id, pickup_pin: pickupPin })
        .eq("id", order_id)
        .in("status", ["preparing", "ready"])
        .is("driver_id", null)
        .select("id, customer_id, order_group_id")
        .maybeSingle();

      if (updateErr) throw updateErr;
      if (!updated) {
        return jsonResponse({ error: "Order already taken or no longer available" }, 409);
      }

      // If this order is part of a group, assign driver to ALL orders in the group
      let groupOrderIds: string[] = [order_id];
      if (updated.order_group_id) {
        const { data: groupOrders, error: groupErr } = await supabase
          .from("orders")
          .update({ driver_id: user.id, pickup_pin: pickupPin })
          .eq("order_group_id", updated.order_group_id)
          .is("driver_id", null)
          .in("status", ["preparing", "ready"])
          .select("id");

        if (!groupErr && groupOrders) {
          groupOrderIds = [order_id, ...groupOrders.filter((o: any) => o.id !== order_id).map((o: any) => o.id)];
        }
      }

      // ── STACKED ORDER AUTO-ASSIGNMENT (DoorDash-style) ──
      // Find a nearby unassigned order with a close drop-off and stack it
      const STACK_DROPOFF_RADIUS_MILES = 1.5; // Drop-offs must be within 1.5 mi
      const STACK_STORE_RADIUS_MILES = 3;     // Stores must be within 3 mi
      const MAX_STACK_SIZE = 2;               // Max 2 orders per stack

      if (groupOrderIds.length < MAX_STACK_SIZE) {
        // Fetch the accepted order's full coords
        const { data: acceptedOrder } = await supabase
          .from("orders")
          .select("delivery_latitude, delivery_longitude, store_id")
          .eq("id", order_id)
          .single();

        if (acceptedOrder) {
          // Get the accepted order's store coords
          const { data: acceptedStore } = await supabase
            .from("seller_stores")
            .select("latitude, longitude")
            .eq("id", acceptedOrder.store_id)
            .single();

          // Find candidate orders to stack
          const { data: candidates } = await supabase
            .from("orders")
            .select("id, delivery_latitude, delivery_longitude, store_id, customer_id")
            .in("status", ["preparing", "ready"])
            .is("driver_id", null)
            .neq("id", order_id)
            .order("created_at", { ascending: true })
            .limit(20);

          if (candidates && candidates.length > 0 && acceptedStore?.latitude && acceptedStore?.longitude) {
            // Score each candidate: drop-off distance + store distance
            let bestCandidate: any = null;
            let bestDropoffDist = Infinity;

            for (const c of candidates) {
              // Skip if already in our group
              if (groupOrderIds.includes(c.id)) continue;

              const dropoffDist = haversineMiles(
                acceptedOrder.delivery_latitude, acceptedOrder.delivery_longitude,
                c.delivery_latitude, c.delivery_longitude
              );
              if (dropoffDist > STACK_DROPOFF_RADIUS_MILES) continue;

              // Check store proximity
              const { data: candStore } = await supabase
                .from("seller_stores")
                .select("latitude, longitude")
                .eq("id", c.store_id)
                .single();

              if (candStore?.latitude && candStore?.longitude) {
                const storeDist = haversineMiles(
                  acceptedStore.latitude, acceptedStore.longitude,
                  candStore.latitude, candStore.longitude
                );
                if (storeDist > STACK_STORE_RADIUS_MILES) continue;
              }

              if (dropoffDist < bestDropoffDist) {
                bestDropoffDist = dropoffDist;
                bestCandidate = c;
              }
            }

            // Auto-assign the best candidate
            if (bestCandidate) {
              // Generate a group ID if we don't have one yet
              let groupId = updated.order_group_id;
              if (!groupId) {
                groupId = crypto.randomUUID();
                // Tag the accepted order with the group
                await supabase.from("orders")
                  .update({ order_group_id: groupId })
                  .eq("id", order_id);
              }

              // Assign the stacked order (share the same pickup PIN)
              const { data: stacked } = await supabase
                .from("orders")
                .update({ driver_id: user.id, order_group_id: groupId, pickup_pin: pickupPin })
                .eq("id", bestCandidate.id)
                .is("driver_id", null)
                .in("status", ["preparing", "ready"])
                .select("id, customer_id")
                .maybeSingle();

              if (stacked) {
                groupOrderIds.push(stacked.id);

                // Notify the stacked order's customer too
                try {
                  await supabase.functions.invoke("notify-order-status", {
                    body: {
                      order_id: stacked.id,
                      status: "driver_assigned",
                      customer_id: stacked.customer_id,
                      driver_id: user.id,
                    },
                  });
                } catch (e) {
                  console.error("Stacked notification error:", e);
                }
              }
            }
          }
        }
      }

      // ── Calculate & apply delivery fares ──
      try {
        const fares = await calculateGroupFares(supabase, groupOrderIds);
        for (const [oid, fee] of fares) {
          await supabase.from("orders").update({ delivery_fee: fee }).eq("id", oid);
        }
      } catch (e) {
        console.error("Fare calculation error (non-blocking):", e);
      }

      // Notify customer
      try {
        await supabase.functions.invoke("notify-order-status", {
          body: {
            order_id,
            status: "driver_assigned",
            customer_id: updated.customer_id,
            driver_id: user.id,
          },
        });
      } catch (e) {
        console.error("Notification error:", e);
      }

      return jsonResponse({
        success: true,
        order_id,
        group_order_ids: groupOrderIds,
        stacked: groupOrderIds.length > 1,
      });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: accept_package_delivery
    // Server validates: driver verified, delivery pending
    // ══════════════════════════════════════════════════════════
    if (action === "accept_package_delivery") {
      const { delivery_id } = body;
      if (!delivery_id) return jsonResponse({ error: "delivery_id required" }, 400);

      if (userRole !== "driver") return jsonResponse({ error: "Only drivers can accept deliveries" }, 403);

      // Check driver is verified
      const { data: docs } = await supabase
        .from("driver_documents")
        .select("verification_status")
        .eq("user_id", user.id)
        .single();

      if (docs?.verification_status !== "approved") {
        return jsonResponse({ error: "Driver not verified" }, 403);
      }

      const { data: updated, error: updateErr } = await supabase
        .from("package_deliveries")
        .update({
          driver_id: user.id,
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", delivery_id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (updateErr) throw updateErr;
      if (!updated) return jsonResponse({ error: "Delivery already taken or unavailable" }, 409);

      return jsonResponse({ success: true, delivery_id });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: request_withdrawal
    // Server validates: amount, balance, rate limiting
    // ══════════════════════════════════════════════════════════
    if (action === "request_withdrawal") {
      const { amount, payment_method, payment_details } = body;
      if (!amount || !payment_method) return jsonResponse({ error: "amount and payment_method required" }, 400);

      if (userRole !== "driver" && userRole !== "seller") {
        return jsonResponse({ error: "Only drivers and sellers can withdraw" }, 403);
      }

      const withdrawAmount = Number(amount);
      const MIN_WITHDRAWAL = 10;
      const MAX_WITHDRAWAL = 10000;

      if (isNaN(withdrawAmount) || withdrawAmount < MIN_WITHDRAWAL || withdrawAmount > MAX_WITHDRAWAL) {
        return jsonResponse({ error: `Amount must be between $${MIN_WITHDRAWAL} and $${MAX_WITHDRAWAL}` }, 400);
      }

      // Get wallet based on role
      const walletTable = userRole === "seller" ? "seller_wallets" : "driver_wallets";
      const { data: wallet, error: walletErr } = await supabase
        .from(walletTable)
        .select("balance, pending_withdrawal")
        .eq("user_id", user.id)
        .single();

      if (walletErr || !wallet) return jsonResponse({ error: "Wallet not found" }, 404);

      const availableBalance = wallet.balance - wallet.pending_withdrawal;
      if (withdrawAmount > availableBalance) {
        return jsonResponse({ error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` }, 400);
      }

      // Rate limiting: max 3 pending withdrawals
      const { count } = await supabase
        .from("withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending");

      if ((count || 0) >= 3) {
        return jsonResponse({ error: "Too many pending withdrawals. Wait for existing ones to process." }, 429);
      }

      // Create withdrawal request
      const { error: reqErr } = await supabase
        .from("withdrawal_requests")
        .insert({
          user_id: user.id,
          amount: withdrawAmount,
          payment_method,
          payment_details: payment_details || {},
        });

      if (reqErr) throw reqErr;

      // Update pending_withdrawal server-side
      const { error: walletUpdateErr } = await supabase
        .from(walletTable)
        .update({ pending_withdrawal: wallet.pending_withdrawal + withdrawAmount })
        .eq("user_id", user.id);

      if (walletUpdateErr) throw walletUpdateErr;

      return jsonResponse({ success: true, new_pending: wallet.pending_withdrawal + withdrawAmount });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: claim_flash_offer
    // Server validates: offer active, driver in zone, not already claimed
    // ══════════════════════════════════════════════════════════
    if (action === "claim_flash_offer") {
      const { offer_id, driver_latitude, driver_longitude } = body;
      if (!offer_id) return jsonResponse({ error: "offer_id required" }, 400);

      if (userRole !== "driver") return jsonResponse({ error: "Only drivers can claim offers" }, 403);

      // Verify offer is still active
      const { data: offer, error: offerErr } = await supabase
        .from("flash_offers")
        .select("*")
        .eq("id", offer_id)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString())
        .single();

      if (offerErr || !offer) return jsonResponse({ error: "Offer expired or not found" }, 404);

      // Verify driver is within zone (if coordinates provided)
      if (driver_latitude && driver_longitude) {
        const distance = haversineMiles(driver_latitude, driver_longitude, offer.zone_latitude, offer.zone_longitude);
        if (distance > offer.zone_radius_miles) {
          return jsonResponse({ error: `You are ${distance.toFixed(1)} mi away. Must be within ${offer.zone_radius_miles} mi.` }, 400);
        }
      }

      // Check not already claimed
      const { data: existing } = await supabase
        .from("driver_flash_claims")
        .select("id")
        .eq("offer_id", offer_id)
        .eq("driver_id", user.id)
        .maybeSingle();

      if (existing) return jsonResponse({ error: "Already claimed" }, 409);

      const { error: claimErr } = await supabase
        .from("driver_flash_claims")
        .insert({ offer_id, driver_id: user.id });

      if (claimErr) throw claimErr;

      return jsonResponse({ success: true, bonus_amount: offer.bonus_amount });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: cancel_order (customer, seller, or admin)
    // Customers: cancel pending/confirmed only; refund wallet
    // Sellers: cancel pending only
    // Admin: cancel any non-delivered order
    // ══════════════════════════════════════════════════════════
    if (action === "cancel_order") {
      const { order_id, reason } = body;
      if (!order_id) return jsonResponse({ error: "order_id required" }, 400);

      const { data: order } = await supabase
        .from("orders")
        .select("id, status, store_id, customer_id, driver_id, total, payment_status")
        .eq("id", order_id)
        .single();

      if (!order) return jsonResponse({ error: "Order not found" }, 404);

      if (userRole === "seller") {
        const { data: store } = await supabase
          .from("seller_stores")
          .select("id")
          .eq("id", order.store_id)
          .eq("user_id", user.id)
          .single();

        if (!store) return jsonResponse({ error: "Not your store's order" }, 403);
        if (order.status !== "pending") {
          return jsonResponse({ error: "Can only cancel pending orders" }, 400);
        }
      } else if (userRole === "rider") {
        // Customers can cancel pending or confirmed orders
        if (order.customer_id !== user.id) return jsonResponse({ error: "Not your order" }, 403);
        if (!["pending", "confirmed"].includes(order.status)) {
          return jsonResponse({ error: "Cannot cancel after preparation has started" }, 400);
        }
      } else if (userRole !== "admin") {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      // Cancel the order
      const { error: updateErr } = await supabase
        .from("orders")
        .update({ status: "cancelled", notes: reason ? `Cancelled: ${reason}` : null })
        .eq("id", order_id);

      if (updateErr) throw updateErr;

      // Refund to rider wallet if payment was made
      if (order.payment_status === "paid" && order.total > 0) {
        const refundAmount = Number(order.total);
        const { data: wallet } = await supabase
          .from("rider_wallets")
          .select("balance")
          .eq("user_id", order.customer_id)
          .maybeSingle();

        if (wallet) {
          await supabase.from("rider_wallets").update({
            balance: Number(wallet.balance) + refundAmount,
          }).eq("user_id", order.customer_id);
        } else {
          await supabase.from("rider_wallets").insert({
            user_id: order.customer_id, balance: refundAmount,
          });
        }

        await supabase.from("wallet_transactions").insert({
          user_id: order.customer_id,
          amount: refundAmount,
          type: "refund",
          description: `Cancelled order #${order_id.slice(0, 8)} refund`,
          order_id,
        });

        await supabase.from("orders").update({
          payment_status: "refunded",
          refunded_at: new Date().toISOString(),
        }).eq("id", order_id);
      }

      // Unassign driver if assigned
      if (order.driver_id) {
        await supabase.from("orders").update({
          driver_id: null,
          pickup_pin: null,
          pickup_pin_attempts: 0,
          pin_locked_until: null,
        }).eq("id", order_id);
      }

      return jsonResponse({ success: true });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: process_claim
    // Seller approves/rejects a replacement or refund claim
    // Uses service role to create replacement orders (bypasses RLS)
    // ══════════════════════════════════════════════════════════
    if (action === "process_claim") {
      const { claim_id, approved, seller_notes } = body;
      if (!claim_id || typeof approved !== "boolean") {
        return jsonResponse({ error: "claim_id and approved (boolean) required" }, 400);
      }
      if (userRole !== "seller" && userRole !== "admin") {
        return jsonResponse({ error: "Only sellers can process claims" }, 403);
      }

      // Fetch the claim
      const { data: claim, error: claimErr } = await supabase
        .from("order_claims")
        .select("*")
        .eq("id", claim_id)
        .eq("status", "pending")
        .single();
      if (claimErr || !claim) return jsonResponse({ error: "Claim not found or already processed" }, 404);

      // Fetch the order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, total, subtotal, delivery_fee, delivery_address, delivery_latitude, delivery_longitude, delivery_instructions, store_id, customer_id")
        .eq("id", claim.order_id)
        .single();
      if (orderErr || !order) return jsonResponse({ error: "Original order not found" }, 404);

      // Verify seller owns the store
      if (userRole === "seller") {
        const { data: store } = await supabase
          .from("seller_stores")
          .select("id")
          .eq("id", order.store_id)
          .eq("user_id", user.id)
          .single();
        if (!store) return jsonResponse({ error: "Not your store's order" }, 403);
      }

      // Update claim status
      await supabase.from("order_claims").update({
        status: approved ? "approved" : "rejected",
        seller_notes: seller_notes || null,
        processed_at: new Date().toISOString(),
        processed_by: user.id,
      }).eq("id", claim_id);

      if (!approved) {
        return jsonResponse({ success: true, action_taken: "rejected" });
      }

      // ── REFUND ──
      if (claim.type === "refund") {
        const refundAmount = Number(order.total);
        const { data: wallet } = await supabase
          .from("rider_wallets")
          .select("balance")
          .eq("user_id", claim.customer_id)
          .maybeSingle();

        if (wallet) {
          await supabase.from("rider_wallets").update({
            balance: Number(wallet.balance) + refundAmount,
          }).eq("user_id", claim.customer_id);
        } else {
          await supabase.from("rider_wallets").insert({
            user_id: claim.customer_id,
            balance: refundAmount,
          });
        }
        await supabase.from("wallet_transactions").insert({
          user_id: claim.customer_id,
          amount: refundAmount,
          type: "claim_refund",
          description: `Refund for order #${order.id.slice(0, 8)}`,
        });
        await supabase.from("orders").update({
          payment_status: "refunded",
          refunded_at: new Date().toISOString(),
        }).eq("id", order.id);

        return jsonResponse({ success: true, action_taken: "refund", amount: refundAmount });
      }

      // ── REPLACEMENT ──
      if (claim.type === "replacement") {
        // Create a new $0 replacement order (service role bypasses RLS)
        const { data: newOrder, error: newErr } = await supabase.from("orders").insert({
          customer_id: claim.customer_id,
          store_id: order.store_id,
          delivery_address: order.delivery_address,
          delivery_latitude: order.delivery_latitude,
          delivery_longitude: order.delivery_longitude,
          delivery_instructions: order.delivery_instructions,
          subtotal: 0,
          delivery_fee: 0,
          total: 0,
          payment_status: "paid",
          status: "pending",
          notes: `🔄 Replacement for order #${order.id.slice(0, 8)}`,
        }).select("id").single();

        if (newErr) throw newErr;

        // Link original order to replacement
        if (newOrder) {
          await supabase.from("orders").update({
            replacement_order_id: newOrder.id,
          }).eq("id", order.id);
        }

        // 50/50 split: deduct half the delivery fee from seller's wallet
        const sellerShare = Math.round(((order.delivery_fee ?? 0) / 2) * 100) / 100;
        if (sellerShare > 0) {
          const { data: sellerStore } = await supabase
            .from("seller_stores")
            .select("user_id")
            .eq("id", order.store_id)
            .single();

          if (sellerStore) {
            const sellerId = sellerStore.user_id;
            // Deduct from seller wallet
            const { data: sellerWallet } = await supabase
              .from("seller_wallets")
              .select("balance")
              .eq("user_id", sellerId)
              .maybeSingle();

            if (sellerWallet) {
              await supabase.from("seller_wallets").update({
                balance: Math.max(0, Number(sellerWallet.balance) - sellerShare),
              }).eq("user_id", sellerId);
            }

            await supabase.from("wallet_transactions").insert({
              user_id: sellerId,
              amount: -sellerShare,
              type: "replacement_fee",
              description: `50% replacement delivery fee - Order #${order.id.slice(0, 8)}`,
              order_id: order.id,
            });
          }
        }

        // Copy original items
        const { data: origItems } = await supabase
          .from("order_items")
          .select("product_id, quantity, unit_price, total_price, notes")
          .eq("order_id", order.id);

        if (origItems && origItems.length > 0 && newOrder) {
          await supabase.from("order_items").insert(
            origItems.map((item: any) => ({
              order_id: newOrder.id,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: 0,
              total_price: 0,
              notes: item.notes ? `(Replacement) ${item.notes}` : "(Replacement)",
            }))
          );
        }

        return jsonResponse({ success: true, action_taken: "replacement", new_order_id: newOrder?.id, seller_charged: sellerShare });
      }

      return jsonResponse({ success: true, action_taken: "approved" });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: tip_driver (post-delivery tipping by customer)
    // ══════════════════════════════════════════════════════════
    if (action === "tip_driver") {
      const { order_id, tip_amount } = body;
      if (!order_id) return jsonResponse({ error: "order_id required" }, 400);

      const tipValue = Number(tip_amount);
      if (isNaN(tipValue) || tipValue < 0 || tipValue > 200) {
        return jsonResponse({ error: "Tip must be between $0 and $200" }, 400);
      }

      // Fetch order using the user's auth context (RLS lets customers read their own orders)
      const { data: order, error: orderErr } = await anonClient
        .from("orders")
        .select("id, status, customer_id, driver_id, driver_tip")
        .eq("id", order_id)
        .eq("customer_id", user.id)
        .single();

      if (orderErr || !order) {
        console.error("tip_driver order fetch error:", orderErr);
        return jsonResponse({ error: "Order not found or not accessible" }, 404);
      }
      if (order.status !== "delivered") return jsonResponse({ error: "Can only tip on delivered orders" }, 400);
      if (!order.driver_id) return jsonResponse({ error: "No driver assigned" }, 400);

      const previousTip = Number(order.driver_tip) || 0;
      const tipDelta = tipValue - previousTip;

      // Update the order's tip
      const { error: tipErr } = await supabase
        .from("orders")
        .update({ driver_tip: tipValue })
        .eq("id", order_id);

      if (tipErr) throw tipErr;

      // Update driver wallet with the delta
      if (tipDelta !== 0) {
        const { data: wallet } = await supabase
          .from("driver_wallets")
          .select("balance, total_earned")
          .eq("user_id", order.driver_id)
          .single();

        if (wallet) {
          const { error: walletErr } = await supabase
            .from("driver_wallets")
            .update({
              balance: Number(wallet.balance) + tipDelta,
              total_earned: Number(wallet.total_earned) + tipDelta,
            })
            .eq("user_id", order.driver_id);
          if (walletErr) {
            console.error("Driver wallet update error:", walletErr);
            return jsonResponse({ error: "Failed to update driver wallet" }, 500);
          }
        } else {
          // Create wallet if it doesn't exist
          const { error: insertErr } = await supabase
            .from("driver_wallets")
            .insert({ user_id: order.driver_id, balance: tipDelta, total_earned: tipDelta });
          if (insertErr) console.error("Driver wallet insert error:", insertErr);
        }

        // Log the tip transaction (idempotent: update existing tip tx or insert)
        const { data: existingTipTx } = await supabase
          .from("wallet_transactions")
          .select("id, amount")
          .eq("user_id", order.driver_id)
          .eq("order_id", order_id)
          .eq("type", "tip")
          .maybeSingle();

        if (existingTipTx) {
          const { error: txErr } = await supabase
            .from("wallet_transactions")
            .update({ amount: tipValue, description: `Tip updated to $${tipValue.toFixed(2)} - Order #${order_id.slice(0, 8)}` })
            .eq("id", existingTipTx.id);
          if (txErr) console.error("Tip tx update error:", txErr);
        } else if (tipDelta > 0) {
          const { error: txErr } = await supabase
            .from("wallet_transactions")
            .insert({
              user_id: order.driver_id,
              amount: tipDelta,
              type: "tip",
              description: `Tip $${tipValue.toFixed(2)} - Order #${order_id.slice(0, 8)}`,
              order_id,
            });
          if (txErr) {
            console.error("Tip tx insert error:", txErr);
            return jsonResponse({ error: "Failed to record tip transaction" }, 500);
          }
        }

        // Notify driver
        try {
          await supabase.from("notifications").insert({
            user_id: order.driver_id,
            title: "New Tip! 💰",
            message: `You received a $${tipValue.toFixed(2)} tip for order #${order_id.slice(0, 8)}`,
            notification_type: "tip",
            metadata: { order_id, tip_amount: tipValue },
          });
        } catch (e) {
          console.error("Tip notification error:", e);
        }
      }

      return jsonResponse({ success: true, tip_amount: tipValue, previous_tip: previousTip });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: tip_restaurant (post-delivery tipping by customer)
    // ══════════════════════════════════════════════════════════
    if (action === "tip_restaurant") {
      const { order_id, tip_amount } = body;
      if (!order_id) return jsonResponse({ error: "order_id required" }, 400);

      const tipValue = Number(tip_amount);
      if (isNaN(tipValue) || tipValue < 0 || tipValue > 200) {
        return jsonResponse({ error: "Tip must be between $0 and $200" }, 400);
      }

      // Fetch order using the user's auth context (RLS lets customers read their own orders)
      const { data: order, error: orderErr } = await anonClient
        .from("orders")
        .select("id, status, customer_id, store_id, restaurant_tip")
        .eq("id", order_id)
        .eq("customer_id", user.id)
        .single();

      if (orderErr || !order) {
        console.error("tip_restaurant order fetch error:", orderErr);
        return jsonResponse({ error: "Order not found or not accessible" }, 404);
      }
      if (order.status !== "delivered") return jsonResponse({ error: "Can only tip on delivered orders" }, 400);

      // Get seller user_id from store
      const { data: store } = await supabase
        .from("seller_stores")
        .select("user_id")
        .eq("id", order.store_id)
        .single();

      if (!store) return jsonResponse({ error: "Store not found" }, 404);

      const previousTip = Number(order.restaurant_tip) || 0;
      const tipDelta = tipValue - previousTip;

      // Update the order's restaurant tip
      const { error: tipErr } = await supabase
        .from("orders")
        .update({ restaurant_tip: tipValue })
        .eq("id", order_id);

      if (tipErr) throw tipErr;

      // Update seller wallet with the delta
      if (tipDelta !== 0) {
        const { data: wallet } = await supabase
          .from("seller_wallets")
          .select("balance, total_earned")
          .eq("user_id", store.user_id)
          .single();

        if (wallet) {
          const { error: walletErr } = await supabase
            .from("seller_wallets")
            .update({
              balance: Number(wallet.balance) + tipDelta,
              total_earned: Number(wallet.total_earned) + tipDelta,
            })
            .eq("user_id", store.user_id);
          if (walletErr) {
            console.error("Seller wallet update error:", walletErr);
            return jsonResponse({ error: "Failed to update seller wallet" }, 500);
          }
        } else {
          // Create wallet if it doesn't exist
          const { error: insertErr } = await supabase
            .from("seller_wallets")
            .insert({ user_id: store.user_id, balance: tipDelta, total_earned: tipDelta });
          if (insertErr) console.error("Seller wallet insert error:", insertErr);
        }

        // Log the tip transaction
        const { data: existingTipTx } = await supabase
          .from("wallet_transactions")
          .select("id, amount")
          .eq("user_id", store.user_id)
          .eq("order_id", order_id)
          .eq("type", "tip")
          .maybeSingle();

        if (existingTipTx) {
          const { error: txErr } = await supabase
            .from("wallet_transactions")
            .update({ amount: tipValue, description: `Restaurant tip updated to $${tipValue.toFixed(2)} - Order #${order_id.slice(0, 8)}` })
            .eq("id", existingTipTx.id);
          if (txErr) console.error("Seller tip tx update error:", txErr);
        } else if (tipDelta > 0) {
          const { error: txErr } = await supabase
            .from("wallet_transactions")
            .insert({
              user_id: store.user_id,
              amount: tipDelta,
              type: "tip",
              description: `Restaurant tip $${tipValue.toFixed(2)} - Order #${order_id.slice(0, 8)}`,
              order_id,
            });
          if (txErr) {
            console.error("Seller tip tx insert error:", txErr);
            return jsonResponse({ error: "Failed to record tip transaction" }, 500);
          }
        }

        // Notify seller
        try {
          await supabase.from("notifications").insert({
            user_id: store.user_id,
            title: "New Tip! 💰",
            message: `You received a $${tipValue.toFixed(2)} tip for order #${order_id.slice(0, 8)}`,
            notification_type: "tip",
            metadata: { order_id, tip_amount: tipValue },
          });
        } catch (e) {
          console.error("Restaurant tip notification error:", e);
        }
      }

      return jsonResponse({ success: true, tip_amount: tipValue, previous_tip: previousTip });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: create_support_ticket
    // ══════════════════════════════════════════════════════════
    if (action === "create_support_ticket") {
      const { subject, message, category } = body;
      if (!subject || !message) return jsonResponse({ error: "subject and message required" }, 400);

      // Insert ticket
      const { data: ticket, error: ticketErr } = await supabase
        .from("support_tickets")
        .insert({
          user_id: user.id,
          subject,
          category: category || "general",
          status: "open",
          priority: "normal",
        })
        .select()
        .single();

      if (ticketErr) throw ticketErr;

      // Create conversation for this ticket
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          customer_id: user.id,
          order_id: ticket.id, // reuse order_id field for ticket reference
          type: "support",
          status: "active",
        })
        .select()
        .single();

      if (convErr) throw convErr;

      // Link conversation to ticket
      await supabase.from("support_tickets")
        .update({ conversation_id: conv.id })
        .eq("id", ticket.id);

      // Send first message
      await supabase.from("messages").insert({
        conversation_id: conv.id,
        order_id: ticket.id,
        sender_id: user.id,
        sender_type: "customer",
        message_type: "text",
        content: message,
      });

      return jsonResponse({ success: true, ticket_id: ticket.id, conversation_id: conv.id });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: get_support_tickets
    // ══════════════════════════════════════════════════════════
    if (action === "get_support_tickets") {
      const { data: tickets } = await supabase
        .from("support_tickets")
        .select("id, subject, status, priority, category, conversation_id, created_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      return jsonResponse({ tickets: tickets || [] });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: update_ticket_status (admin only)
    // ══════════════════════════════════════════════════════════
    if (action === "update_ticket_status") {
      if (userRole !== "admin") return jsonResponse({ error: "Admin only" }, 403);

      const { ticket_id, status, notes } = body;
      if (!ticket_id || !status) return jsonResponse({ error: "ticket_id and status required" }, 400);

      const { error: updateErr } = await supabase
        .from("support_tickets")
        .update({ status, admin_notes: notes || null, updated_at: new Date().toISOString() })
        .eq("id", ticket_id);

      if (updateErr) throw updateErr;
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);

  } catch (err: any) {
    console.error("business-logic error:", err);
    // Don't leak internal error details to client
    const safeMessage = err.message?.startsWith("PGRST") || err.message?.includes("violates")
      ? "An internal error occurred. Please try again."
      : err.message || "An internal error occurred.";
    return jsonResponse({ error: safeMessage }, 500);
  }
});
