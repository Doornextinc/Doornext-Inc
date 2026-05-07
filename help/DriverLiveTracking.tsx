/**
 * DriverLiveTracking - Live GPS tracking view for driver
 */

import { DriverDashboardLayout } from "@/components/layouts/DriverDashboardLayout";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { GoogleMap } from "@/components/maps/GoogleMap";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigation, Gauge, Target, Wifi, WifiOff } from "lucide-react";
import { useMemo } from "react";
import { motion } from "framer-motion";

const DriverLiveTracking = () => {
  const { isOnline, location } = useDriverLocation();

  const markers = useMemo(() => {
    if (!location) return [];
    return [
      {
        id: "self",
        position: { lat: location.latitude, lng: location.longitude },
        heading: location.heading,
        type: "driver" as const,
        vehicleType: "car" as const,
      },
    ];
  }, [location]);

  const center = location
    ? { lat: location.latitude, lng: location.longitude }
    : undefined;

  return (
    <DriverDashboardLayout>
      <div className="space-y-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-display font-bold">Live Tracking</h1>
          <Badge variant={isOnline ? "default" : "secondary"} className="gap-1.5">
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? "Online" : "Offline"}
          </Badge>
        </div>

        {/* Map */}
        <div className="relative -mx-4 rounded-none overflow-hidden" style={{ height: "55dvh" }}>
          <GoogleMap
            center={center}
            zoom={16}
            markers={markers}
            className="absolute inset-0 h-full w-full"
          />
          {!location && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm">
              <p className="text-sm text-muted-foreground">Acquiring GPS signal...</p>
            </div>
          )}
        </div>

        {/* Location stats */}
        {location && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-3"
          >
            <Card className="p-3 text-center">
              <Navigation className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-lg font-bold">{Math.round(location.heading)}°</p>
              <p className="text-[10px] text-muted-foreground">Heading</p>
            </Card>
            <Card className="p-3 text-center">
              <Gauge className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-lg font-bold">
                {location.speed > 0 ? (location.speed * 2.237).toFixed(0) : "0"}
              </p>
              <p className="text-[10px] text-muted-foreground">MPH</p>
            </Card>
            <Card className="p-3 text-center">
              <Target className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-lg font-bold">{Math.round(location.accuracy)}m</p>
              <p className="text-[10px] text-muted-foreground">Accuracy</p>
            </Card>
          </motion.div>
        )}

        {/* Coordinates */}
        {location && (
          <Card className="p-3">
            <p className="text-xs text-muted-foreground font-mono">
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </p>
          </Card>
        )}
      </div>
    </DriverDashboardLayout>
  );
};

export default DriverLiveTracking;
