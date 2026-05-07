import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Store, MapPin, Phone, Loader2, CheckCircle2, Navigation, Camera, ImageIcon, MapPinCheck, LocateFixed, Package, User, Plus, X, Clock, KeyRound, EyeOff } from "lucide-react";
import { formatCurrency } from "@/lib/locale";
import { openNavigation } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ChatSheet } from "@/components/chat/ChatSheet";
import { isNearby, haversineDistance, haversineDistanceMiles } from "@/lib/geo";
import type { ActiveFoodOrder, GroupedDelivery } from "@/hooks/useActiveFoodDelivery";

interface ActiveFoodDeliveryProps {
  delivery: GroupedDelivery;
  updating: boolean;
  onUpdateStatus: (orderId: string, status: string) => void;
  driverLocation: { latitude: number; longitude: number } | null;
  newOrderAlert?: ActiveFoodOrder | null;
  onDismissAlert?: () => void;
}

function isLeaveAtDoor(instructions: string | null): boolean {
  if (!instructions) return false;
  const lower = instructions.toLowerCase();
  return lower.includes("leave at door") || lower.includes("leave at the door");
}

const STEPS = [
  { key: "preparing", label: "Prep" },
  { key: "ready", label: "Ready" },
  { key: "picked_up", label: "Picked" },
  { key: "delivering", label: "Route" },
  { key: "driver_arrived", label: "Arrived" },
];

function getStepIndex(status: string) {
  return STEPS.findIndex(s => s.key === status);
}

function useElapsedTime(since: string | null) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!since) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [since]);
  return elapsed;
}

// ── DoorDash-style step progress bar ──
function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full h-1 rounded-full overflow-hidden bg-secondary">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: isCompleted ? "100%" : isCurrent ? "50%" : "0%" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <span className={`text-[10px] font-semibold ${
              isCompleted ? "text-primary" : isCurrent ? "text-foreground" : "text-muted-foreground"
            }`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ActiveFoodDelivery({ delivery, updating, onUpdateStatus, driverLocation, newOrderAlert, onDismissAlert }: ActiveFoodDeliveryProps) {
  const { user } = useAuth();
  const order = delivery.primaryOrder;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(order.proof_photo_url ?? null);
  const [arrivedAtStores, setArrivedAtStores] = useState<Set<string>>(new Set());
  const [navigatedStores, setNavigatedStores] = useState<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);
  const elapsed = useElapsedTime(order.created_at ?? null);

  const requiresPhoto = isLeaveAtDoor(order.delivery_instructions);

  const allPickedUp = delivery.orders.every(o => getStepIndex(o.status) >= 2);
  // const allDelivering = delivery.orders.every(o => getStepIndex(o.status) >= 3);

  const unpickedOrders = delivery.orders.filter(o => getStepIndex(o.status) < 2);
  const pickedOrders = delivery.orders.filter(o => getStepIndex(o.status) >= 2);
  const hasNewUnpickedOrders = pickedOrders.length > 0 && unpickedOrders.length > 0;

  const currentStep = allPickedUp ? getStepIndex(order.status) : Math.min(...delivery.orders.map(o => getStepIndex(o.status)));

  const isPickupPhase = !allPickedUp;
  const isPickedUp = allPickedUp && order.status === "picked_up";
  const isDelivering = order.status === "delivering";
  const isArrived = order.status === "driver_arrived";
  const canMarkDelivered = !requiresPhoto || !!proofUrl;

  const ARRIVAL_RADIUS = 200;

  const nearCustomer = driverLocation
    ? isNearby(driverLocation.latitude, driverLocation.longitude, order.delivery_latitude, order.delivery_longitude, ARRIVAL_RADIUS)
    : false;

  const navigate = (lat: number | null | undefined, lng: number | null | undefined, fallbackAddress?: string | null) => {
    const success = openNavigation(lat, lng, fallbackAddress);
    if (!success && !fallbackAddress) {
      toast.error("Location not available");
    }
  };

  const handleTakePhoto = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/proof-${order.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("delivery-proofs").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("delivery-proofs").getPublicUrl(filePath);
      const { error: updateError } = await supabase.from("orders").update({ proof_photo_url: publicUrl }).eq("id", order.id);
      if (updateError) throw updateError;
      setProofUrl(publicUrl);
      toast.success("Proof photo saved!");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Error uploading photo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const getLiveMessage = () => {
    if (isPickupPhase) {
      if (hasNewUnpickedOrders) {
        return `New pickup added! ${unpickedOrders.length} stop${unpickedOrders.length > 1 ? "s" : ""} left`;
      }
      const remaining = sortedOrders.filter(o => getStepIndex(o.status) < 2);
      if (delivery.isGrouped && remaining.length > 0) {
        const next = remaining[0];
        return `Head to ${next.store_name || "store"}`;
      }
      if (delivery.isGrouped) {
        return `${remaining.length} pickup${remaining.length > 1 ? "s" : ""} remaining`;
      }
      const currentOrder = remaining[0];
      if (!currentOrder) return "Pick up the order";
      const arrivedHere = arrivedAtStores.has(currentOrder.id);
      if (currentOrder.status === "ready" && arrivedHere) return "Order ready — pick it up!";
      if (currentOrder.status === "preparing" && arrivedHere) return "Waiting for preparation…";
      return `Head to ${currentOrder.store_name || "store"}`;
    }
    if (isPickedUp) return "Drive to customer";
    if (isDelivering) return "Almost there";
    if (isArrived) return "Complete delivery";
    return "";
  };

  const navigatedToCustomerRef = useRef(false);

  const getStoreAction = (o: ActiveFoodOrder) => {
    const stepIdx = getStepIndex(o.status);
    if (stepIdx >= 2) return null;

    const nearStore = driverLocation && o.store_latitude && o.store_longitude
      ? isNearby(driverLocation.latitude, driverLocation.longitude, o.store_latitude, o.store_longitude, ARRIVAL_RADIUS)
      : false;
    const arrivedHere = arrivedAtStores.has(o.id);
    const distanceToStore = driverLocation && o.store_latitude && o.store_longitude
      ? Math.round(haversineDistance(driverLocation.latitude, driverLocation.longitude, o.store_latitude, o.store_longitude))
      : null;

    const hasNavigated = navigatedStores.has(o.id);

    if (!hasNavigated && !arrivedHere && !nearStore) {
      return {
        label: distanceToStore ? `Navigate (${distanceToStore}m)` : "Navigate",
        action: () => {
          navigate(o.store_latitude, o.store_longitude, o.store_location);
          setNavigatedStores(prev => new Set(prev).add(o.id));
        },
        icon: Navigation,
        type: "navigate" as const,
      };
    }
    if (!arrivedHere && (nearStore || hasNavigated)) {
      return {
        label: "I've Arrived",
        action: () => {
          setArrivedAtStores(prev => new Set(prev).add(o.id));
          toast.success(`Arrived at ${o.store_name || "store"} ✓`);
        },
        icon: LocateFixed,
        type: "arrive" as const,
      };
    }
    if (o.status === "preparing") {
      return { label: "Waiting…", action: () => {}, disabled: true, type: "waiting" as const };
    }
    // Seller must verify PIN to mark picked_up — driver just waits
    return { label: "Waiting for Maker to verify PIN…", action: () => {}, disabled: true, type: "waiting" as const };
  };

  const getPostPickupAction = () => {
    const maxStepIdx = Math.max(...delivery.orders.map(o => getStepIndex(o.status)));
    const mostAdvancedOrder = delivery.orders.find(o => getStepIndex(o.status) === maxStepIdx) || order;
    const mostAdvancedStatus = mostAdvancedOrder.status;

    if (maxStepIdx <= 2) {
      return {
        label: "Start Delivering",
        action: () => {
          delivery.orders.forEach(o => {
            if (getStepIndex(o.status) === 2) onUpdateStatus(o.id, "delivering");
          });
        },
        type: "default" as const,
      };
    }
    if (mostAdvancedStatus === "delivering" && !nearCustomer && !navigatedToCustomerRef.current) {
      const needsTransition = delivery.orders.filter(o => o.status === "picked_up");
      if (needsTransition.length > 0) {
        needsTransition.forEach(o => onUpdateStatus(o.id, "delivering"));
      }
      return {
        label: "Navigate to Customer",
        action: () => { navigate(order.delivery_latitude, order.delivery_longitude, order.delivery_address); navigatedToCustomerRef.current = true; forceUpdate(n => n + 1); },
        icon: Navigation,
        type: "navigate" as const,
      };
    }
    if (mostAdvancedStatus === "delivering") return { label: "I've Arrived", action: () => onUpdateStatus(mostAdvancedOrder.id, "driver_arrived"), icon: MapPinCheck, type: "default" as const };
    if (mostAdvancedStatus === "driver_arrived") return { label: "Complete Delivery", action: () => { delivery.orders.forEach(o => onUpdateStatus(o.id, "delivered")); }, icon: CheckCircle2, disabled: !canMarkDelivered, type: "default" as const };
    return null;
  };

  const sortedOrders = useMemo(() => {
    if (!delivery.isGrouped || !isPickupPhase) return delivery.orders;

    return [...delivery.orders].sort((a, b) => {
      const aPickedUp = getStepIndex(a.status) >= 2;
      const bPickedUp = getStepIndex(b.status) >= 2;
      if (aPickedUp && !bPickedUp) return -1;
      if (!aPickedUp && bPickedUp) return 1;
      if (aPickedUp && bPickedUp) return 0;

      if (a.status === "ready" && b.status !== "ready") return -1;
      if (a.status !== "ready" && b.status === "ready") return 1;

      if (!driverLocation) return 0;
      const distA = a.store_latitude && a.store_longitude
        ? haversineDistanceMiles(driverLocation.latitude, driverLocation.longitude, a.store_latitude, a.store_longitude)
        : Infinity;
      const distB = b.store_latitude && b.store_longitude
        ? haversineDistanceMiles(driverLocation.latitude, driverLocation.longitude, b.store_latitude, b.store_longitude)
        : Infinity;
      return distA - distB;
    });
  }, [delivery.orders, delivery.isGrouped, isPickupPhase, driverLocation]);

  const postPickupAction = !isPickupPhase ? getPostPickupAction() : null;

  const suggestedNextId = useMemo(() => {
    if (!delivery.isGrouped || !isPickupPhase) return null;
    const first = sortedOrders.find(o => getStepIndex(o.status) < 2);
    return first?.id || null;
  }, [sortedOrders, delivery.isGrouped, isPickupPhase]);

  return (
    <div className="space-y-3">
      {/* ── Earnings banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between rounded-2xl bg-card p-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-lg font-display font-bold text-foreground leading-tight">{getLiveMessage()}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {elapsed && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />{elapsed}
                </span>
              )}
              {delivery.isGrouped && (
                <span className="text-xs text-muted-foreground">· {delivery.orders.length} stops</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-display font-bold text-primary">{formatCurrency(delivery.totalDriverEarnings)}</p>
          {delivery.totalTips > 0 && (
            <p className="text-[10px] text-muted-foreground">
              incl. {formatCurrency(delivery.totalTips)} tip
            </p>
          )}
        </div>
      </motion.div>

      {/* ── Step progress ── */}
      <StepProgress currentStep={currentStep} />

      {/* ── New Order Stacked Alert ── */}
      <AnimatePresence>
        {newOrderAlert && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="rounded-2xl bg-primary/10 border border-primary/20 p-4 flex items-start gap-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">New pickup added!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick up from <span className="font-semibold text-foreground">{newOrderAlert.store_name || "store"}</span> before delivering
              </p>
              <p className="text-xs text-primary font-bold mt-1">
                +{formatCurrency((newOrderAlert.delivery_fee || 0) + (newOrderAlert.driver_tip || 0))} earnings added
              </p>
            </div>
            <button onClick={onDismissAlert} className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mid-delivery stacking reminder ── */}
      <AnimatePresence>
        {hasNewUnpickedOrders && !newOrderAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-warning/10 border border-warning/20 p-3 flex items-center gap-3"
          >
            <Store className="h-4 w-4 text-warning shrink-0" />
            <p className="text-sm text-foreground font-medium">
              {unpickedOrders.length} more pickup{unpickedOrders.length > 1 ? "s" : ""} needed
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Journey cards ── */}
      <div className="space-y-2">
        {sortedOrders.map((o, idx) => {
          const storeAction = getStoreAction(o);
          const isStorePickedUp = getStepIndex(o.status) >= 2;
          const isSuggested = o.id === suggestedNextId;
          const distToStore = driverLocation && o.store_latitude && o.store_longitude
            ? haversineDistanceMiles(driverLocation.latitude, driverLocation.longitude, o.store_latitude, o.store_longitude)
            : null;

          const arrivedHere = arrivedAtStores.has(o.id);

          return (
            <motion.div
              key={o.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className={`rounded-2xl p-4 transition-colors duration-300 ${
                isStorePickedUp
                  ? "bg-card border border-primary/20"
                  : isSuggested
                  ? "bg-card border border-primary/40 ring-1 ring-primary/20"
                  : "bg-card border border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Left icon */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  isStorePickedUp ? "bg-primary/15" : "bg-secondary"
                }`}>
                  {isStorePickedUp ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Store className="h-5 w-5 text-foreground" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {delivery.isGrouped ? `Pickup ${idx + 1}` : "Pickup"}
                      </span>
                      {isSuggested && (
                        <Badge className="text-[9px] h-[18px] px-2 rounded-full bg-primary text-primary-foreground border-0 font-bold">
                          NEXT
                        </Badge>
                      )}
                      {isStorePickedUp && (
                        <Badge className="text-[9px] h-[18px] px-2 rounded-full bg-primary/15 text-primary border-0 font-bold">
                          DONE
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isStorePickedUp && distToStore !== null && (
                        <span className="text-xs text-muted-foreground font-medium">{distToStore.toFixed(1)} mi</span>
                      )}
                      {o.store_phone && (
                        <a href={`tel:${o.store_phone}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary hover:bg-secondary/80">
                          <Phone className="h-3.5 w-3.5 text-foreground" />
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="text-base font-display font-bold leading-tight mt-1">{o.store_name || "Store"}</p>
                  <p className="text-sm text-muted-foreground leading-snug mt-0.5 line-clamp-1">{o.store_location || "Address unavailable"}</p>

                  {delivery.isGrouped && (
                    <p className="text-xs text-muted-foreground mt-1">{o.items_count} item{o.items_count !== 1 ? "s" : ""} · {formatCurrency(o.total)}</p>
                  )}

                  {isSuggested && o.status === "ready" && (
                    <p className="text-xs text-primary font-semibold mt-1">✓ Order is ready for pickup</p>
                  )}
                  {isSuggested && o.status === "preparing" && (
                    <p className="text-xs text-warning font-semibold mt-1">⏳ Still preparing — head there now</p>
                  )}

                  {/* ── Pickup PIN — shown only after arriving at store ── */}
                  {arrivedHere && !isStorePickedUp && o.pickup_pin && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">Pickup PIN</span>
                      </div>
                      <div className="flex justify-center gap-2">
                        {o.pickup_pin.split("").map((digit, di) => (
                          <div
                            key={di}
                            className="flex h-10 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xl font-display font-bold"
                          >
                            {digit}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center mt-2">Show this PIN to the Maker to confirm pickup</p>
                    </motion.div>
                  )}

                  {/* ── Order details — hidden until arrived ── */}
                  {arrivedHere && !isStorePickedUp && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 rounded-xl bg-muted/40 border border-border/50 p-3 space-y-1.5"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Order Details</p>
                      <div className="flex items-center gap-2 text-sm">
                        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-foreground font-medium">
                          #{o.id.slice(0, 8)} · {o.items_count} item{o.items_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {o.customer_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-foreground font-medium">{o.customer_name}</span>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Not yet arrived — remind driver details are hidden */}
                  {!arrivedHere && !isStorePickedUp && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <EyeOff className="h-3 w-3 shrink-0" />
                      <span>Order details & PIN visible upon arrival</span>
                    </div>
                  )}

                  {/* Per-store action */}
                  {storeAction && (
                    <motion.div layout className="mt-3">
                      <Button
                        className={`w-full h-12 text-sm font-bold rounded-full gap-2 ${
                          storeAction.type === "waiting"
                            ? "bg-secondary text-muted-foreground"
                            : storeAction.type === "arrive"
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-secondary text-foreground hover:bg-secondary/80"
                        }`}
                        onClick={storeAction.action}
                        disabled={updating || storeAction.disabled}
                      >
                        {storeAction.icon && <storeAction.icon className="h-4 w-4" />}
                        {storeAction.label}
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Delivery card(s) */}
        {(() => {
          const uniqueDropoffs = delivery.orders.reduce<ActiveFoodOrder[]>((acc, o) => {
            if (!acc.find(a => a.delivery_address === o.delivery_address)) acc.push(o);
            return acc;
          }, []);
          return uniqueDropoffs.map((dropoff, dIdx) => (
            <motion.div
              key={dropoff.id + "-dropoff"}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sortedOrders.length * 0.05 + dIdx * 0.05, duration: 0.3 }}
              className={`rounded-2xl p-4 transition-colors duration-300 ${
                isArrived
                  ? "bg-card border border-primary/30 ring-1 ring-primary/15"
                  : !isPickupPhase
                  ? "bg-card border border-border"
                  : "bg-card/50 border border-border/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  isArrived ? "bg-primary/15" : !isPickupPhase ? "bg-secondary" : "bg-secondary/50"
                }`}>
                  {isArrived ? (
                    <MapPinCheck className="h-5 w-5 text-primary" />
                  ) : (
                    <MapPin className="h-5 w-5 text-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {uniqueDropoffs.length > 1 ? `Drop-off ${dIdx + 1}` : "Deliver"}
                    </span>
                    {dropoff.customer_phone && (
                      <a href={`tel:${dropoff.customer_phone}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary hover:bg-secondary/80">
                        <Phone className="h-3.5 w-3.5 text-foreground" />
                      </a>
                    )}
                  </div>
                  <p className="text-base font-display font-bold leading-tight mt-1">{dropoff.customer_name || "Customer"}</p>
                  <p className="text-sm text-muted-foreground leading-snug mt-0.5 line-clamp-1">{dropoff.delivery_address}</p>
                </div>
              </div>
            </motion.div>
          ));
        })()}
      </div>

      {/* ── Instructions ── */}
      {order.delivery_instructions && (
        <div className="rounded-2xl bg-card border border-border p-3 flex items-start gap-2.5">
          <span className="text-base">📝</span>
          <p className="text-sm text-muted-foreground">{order.delivery_instructions}</p>
        </div>
      )}

      {/* ── Proof photo ── */}
      {requiresPhoto && isArrived && (
        <div className="rounded-2xl border border-dashed border-warning/40 bg-warning/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Camera className="h-4 w-4 text-warning" />
            Photo required (Leave at door)
          </div>
          {proofUrl ? (
            <div className="space-y-1">
              <img src={proofUrl} alt="Delivery proof" className="w-full rounded-xl max-h-28 object-cover" />
              <p className="text-[10px] text-muted-foreground text-center">✓ Saved</p>
            </div>
          ) : (
            <Button className="w-full h-12 rounded-full bg-secondary text-foreground hover:bg-secondary/80 font-bold" onClick={handleTakePhoto} disabled={uploading}>
              {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : <><Camera className="mr-2 h-4 w-4" />Take Photo</>}
            </Button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {proofUrl && !requiresPhoto && (
        <div className="flex items-center gap-2 px-1">
          <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          <img src={proofUrl} alt="Proof" className="h-8 w-12 rounded object-cover" />
          <span className="text-[10px] text-muted-foreground">Proof saved</span>
        </div>
      )}

      {/* ── Main CTA ── */}
      {postPickupAction && (
        <motion.div
          layout
          className="flex gap-2"
        >
          <Button
            variant="outline"
            className="h-14 w-14 shrink-0 rounded-full border-border"
            onClick={() => navigate(order.delivery_latitude, order.delivery_longitude, order.delivery_address)}
          >
            <Navigation className="h-5 w-5 text-primary" />
          </Button>

          <Button
            className="flex-1 h-14 text-base font-display font-bold rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={postPickupAction.action}
            disabled={updating || postPickupAction.disabled}
          >
            {updating && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {postPickupAction.icon && !updating && <postPickupAction.icon className="mr-2 h-5 w-5" />}
            {postPickupAction.label}
          </Button>

          {order.customer_id && (
            <ChatSheet
              orderId={order.id}
              recipientId={order.customer_id}
              recipientName={order.customer_name || "Customer"}
              senderRole="driver"
            />
          )}
        </motion.div>
      )}

      {/* ── Chat during pickup ── */}
      {isPickupPhase && (
        <div className="flex gap-2 justify-end">
          {order.customer_id && (
            <ChatSheet
              orderId={order.id}
              recipientId={order.customer_id}
              recipientName={order.customer_name || "Customer"}
              senderRole="driver"
            />
          )}
        </div>
      )}

      {isArrived && requiresPhoto && !proofUrl && (
        <p className="text-sm text-center text-warning font-medium">Take a photo before completing delivery</p>
      )}
    </div>
  );
}
