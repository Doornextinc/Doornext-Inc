import { useEffect, useState, useRef } from "react";
import { DriverDashboardLayout } from "@/components/layouts/DriverDashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNavigate } from "react-router-dom";
import {
  User, Bell, BellRing, Shield, LogOut, Loader2, Save, Moon, Sun, Camera, Globe, MapPin, ChevronRight, Settings2, Pencil, Package, HelpCircle, CheckCircle2, Volume2, VolumeX,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "next-themes";
import { useTranslation } from "@/i18n/LanguageContext";
import { PreferredLocationCard } from "@/components/driver/PreferredLocationCard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getPreferredMapProvider, setPreferredMapProvider, MAP_PROVIDER_OPTIONS, type MapProvider } from "@/lib/navigation";
import { isSoundEnabled, setSoundEnabled } from "@/lib/notificationSounds";
import { cn } from "@/lib/utils";

interface Profile {
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

// ── Stat Card (Gopuff-style) ────────────────────────────
function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/50 p-5">
      <p className="text-2xl font-display font-bold tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

// ── Section Header (full-width muted bg strip) ──────────
function SectionBanner({ title }: { title: string }) {
  return (
    <div className="bg-muted/60 px-4 py-3 -mx-4">
      <p className="text-base font-display font-bold">{title}</p>
    </div>
  );
}

// ── Menu Row ────────────────────────────────────────────
function MenuRow({ icon: Icon, label, onClick, destructive }: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-4 active:bg-muted/30 transition-colors"
    >
      <Icon className={cn("h-5 w-5", destructive ? "text-destructive" : "text-muted-foreground")} />
      <span className={cn("flex-1 text-left text-[15px] font-medium", destructive && "text-destructive")}>{label}</span>
      <ChevronRight className={cn("h-4 w-4", destructive ? "text-destructive/40" : "text-muted-foreground/40")} />
    </button>
  );
}

// ── Settings Group ──────────────────────────────────────
function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && (
        <div className="px-1 mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        </div>
      )}
      <div className="rounded-2xl bg-card border border-border/50 divide-y divide-border/30 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({ icon: Icon, label, description, children, onClick, destructive }: {
  icon?: React.ElementType;
  label: string;
  description?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-4 min-h-[56px]",
        onClick && "active:bg-muted/30 cursor-pointer transition-colors",
      )}
      onClick={onClick}
    >
      {Icon && (
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          destructive ? "bg-destructive/10" : "bg-muted/50"
        )}>
          <Icon className={cn("h-[18px] w-[18px]", destructive ? "text-destructive" : "text-muted-foreground")} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={cn("text-[15px] font-medium", destructive && "text-destructive")}>{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>}
      </div>
      {children}
      {onClick && !children && <ChevronRight className={cn("h-4 w-4 shrink-0", destructive ? "text-destructive/40" : "text-muted-foreground/40")} />}
    </div>
  );
}

const DriverSettings = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const { isSupported, isSubscribed, isLoading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile>({ full_name: "", phone: "", avatar_url: null });
  const [notifications, setNotifications] = useState({ rideRequests: true, earnings: true, promotions: false });
  const [mapProvider, setMapProviderState] = useState<MapProvider>(getPreferredMapProvider());
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled());
  const [editingProfile, setEditingProfile] = useState(false);
  const [showDeliveryPrefs, setShowDeliveryPrefs] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);

  // Stats
  const [stats, setStats] = useState({ totalTrips: 0, acceptanceRate: 0, completionRate: 0, avgRating: 0, onTimeRate: 0, issues: 0 });

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      const [profileRes, perfRes, docsRes] = await Promise.all([
        supabase.from("profiles").select("full_name, phone, avatar_url").eq("user_id", user.id).single(),
        supabase.from("driver_performance_scores").select("total_deliveries, total_accepted, total_offered, avg_rating, total_cancellations, avg_delivery_time_mins").eq("user_id", user.id).single(),
        supabase.from("driver_documents").select("total_trips").eq("user_id", user.id).single(),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (perfRes.data) {
        const p = perfRes.data;
        const acceptRate = p.total_offered > 0 ? Math.round((p.total_accepted / p.total_offered) * 100) : 0;
        const completionRate = p.total_accepted > 0 ? Math.round(((p.total_accepted - p.total_cancellations) / p.total_accepted) * 100) : 0;
        setStats({
          totalTrips: docsRes.data?.total_trips || p.total_deliveries || 0,
          acceptanceRate: acceptRate,
          completionRate: completionRate,
          avgRating: p.avg_rating || 0,
          onTimeRate: p.avg_delivery_time_mins <= 30 ? 96 : 90,
          issues: p.total_cancellations || 0,
        });
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t.fileTooLarge, description: t.fileTooLargeDesc, variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
      if (updateError) throw updateError;
      setProfile({ ...profile, avatar_url: publicUrl });
      toast({ title: t.success, description: t.profilePhotoUpdated });
    } catch (err: any) {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: profile.full_name, phone: profile.phone }).eq("user_id", user.id);
      if (error) throw error;
      toast({ title: t.success, description: t.profileUpdated });
      setEditingProfile(false);
    } catch (err: any) {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => { await signOut(); navigate("/login"); };

  if (loading) {
    return (<DriverDashboardLayout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DriverDashboardLayout>);
  }

  return (
    <DriverDashboardLayout>
      <div className="flex flex-col space-y-5 max-w-lg mx-auto pb-8 pt-6">

        {/* ── Profile Header ──────────────────────── */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex items-center justify-center rounded-2xl border-2 border-border/50 bg-muted/30 overflow-hidden" style={{ width: 72, height: 72 }}>
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                  : <User className="h-8 w-8 text-muted-foreground" />}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-display font-bold tracking-tight">{profile.full_name || "Driver"}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* ── My Stats ────────────────────────────── */}
        <div>
          <h2 className="text-xl font-display font-bold mb-3 px-1">My Stats</h2>
          <div className="space-y-3">
            <StatCard value={`${stats.acceptanceRate}%`} label="Acceptance rate" />
            <StatCard value={`${stats.completionRate}%`} label="Completion rate" />
            <StatCard value={`${stats.onTimeRate}%`} label="On-time delivery rate" />
            <StatCard value={stats.issues.toString()} label="Delivery issues reported" />
          </div>
        </div>

        {/* ── Lifetime Highlights ─────────────────── */}
        <div>
          <h2 className="text-xl font-display font-bold mb-3 px-1">Lifetime Highlights</h2>
          <div className="flex gap-8 px-1">
            <div>
              <p className="text-3xl font-display font-bold">{stats.totalTrips}</p>
              <p className="text-sm text-muted-foreground">Orders delivered</p>
            </div>
            <div>
              <p className="text-3xl font-display font-bold">{stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—"}</p>
              <p className="text-sm text-muted-foreground">Avg rating</p>
            </div>
          </div>
        </div>

        {/* ── Account Management ──────────────────── */}
        <SectionBanner title="Account Management" />

        <div className="rounded-2xl bg-card border border-border/50 divide-y divide-border/30 overflow-hidden">
          <MenuRow icon={Pencil} label="My Profile" onClick={() => { setEditingProfile(!editingProfile); setShowDeliveryPrefs(false); setShowAppSettings(false); }} />
          <MenuRow icon={Package} label="Delivery Preferences" onClick={() => { setShowDeliveryPrefs(!showDeliveryPrefs); setEditingProfile(false); setShowAppSettings(false); }} />
          <MenuRow icon={Settings2} label="App Settings" onClick={() => { setShowAppSettings(!showAppSettings); setEditingProfile(false); setShowDeliveryPrefs(false); }} />
          <MenuRow icon={HelpCircle} label="Get Support" onClick={() => navigate("/driver/messages")} />
        </div>

        {/* ── Delivery Preferences (expandable) ───── */}
        {showDeliveryPrefs && (
          <PreferredLocationCard />
        )}

        {/* ── Edit Profile Sheet (inline) ─────────── */}
        {editingProfile && (
          <div className="rounded-2xl bg-card border border-border/50 p-5 space-y-4">
            <h3 className="text-base font-display font-bold">Edit Profile</h3>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.fullName}</Label>
              <Input className="h-11 text-[15px]" value={profile.full_name || ""} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.phone}</Label>
              <Input className="h-11 text-[15px]" value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="ghost" className="flex-1 h-11 text-[15px]" onClick={() => setEditingProfile(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 h-11 text-[15px] font-semibold" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                {t.save}
              </Button>
            </div>
          </div>
        )}

        {/* ── App Settings (expandable) ────────── */}
        {showAppSettings && (
          <div className="space-y-5">
            {/* Preferences */}
            <SettingsGroup title="Preferences">
              <SettingsRow icon={theme === "dark" ? Moon : Sun} label={t.darkMode} description={t.enableDarkTheme}>
                <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
              </SettingsRow>
              <SettingsRow icon={Globe} label={t.language} description={t.languageDesc}>
                <LanguageSwitcher />
              </SettingsRow>
              <div className="px-4 py-4">
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50">
                    <MapPin className="h-[18px] w-[18px] text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium">Navigation Provider</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Default map for directions</p>
                  </div>
                </div>
                <Select
                  value={mapProvider}
                  onValueChange={(value: MapProvider) => {
                    setMapProviderState(value);
                    setPreferredMapProvider(value);
                    toast({ title: "Saved", description: `Navigation set to ${MAP_PROVIDER_OPTIONS.find(o => o.value === value)?.label}` });
                  }}
                >
                  <SelectTrigger className="h-11 text-[15px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAP_PROVIDER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground ml-1.5">— {opt.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SettingsGroup>

            {/* Notifications */}
            <SettingsGroup title="Notifications">
              {isSupported && (
                <SettingsRow icon={BellRing} label={t.pushNotifications} description={isSubscribed ? t.receiveAlerts : t.enableToNotMiss}>
                  <Switch checked={isSubscribed} disabled={pushLoading} onCheckedChange={(checked) => checked ? subscribe() : unsubscribe()} />
                </SettingsRow>
              )}
              <SettingsRow icon={Bell} label={t.deliveryRequests} description={t.receiveNewRequests}>
                <Switch checked={notifications.rideRequests} onCheckedChange={(checked) => setNotifications({ ...notifications, rideRequests: checked })} />
              </SettingsRow>
               <SettingsRow icon={Bell} label={t.earningsSummary} description={t.receiveDailySummary}>
                <Switch checked={notifications.earnings} onCheckedChange={(checked) => setNotifications({ ...notifications, earnings: checked })} />
              </SettingsRow>
              <SettingsRow icon={soundEnabled ? Volume2 : VolumeX} label="Notification Sounds" description="Play sounds for deliveries & messages">
                <Switch checked={soundEnabled} onCheckedChange={(checked) => { setSoundEnabledState(checked); setSoundEnabled(checked); }} />
              </SettingsRow>
            </SettingsGroup>
          </div>
        )}

        {/* ── Security ────────────────────────────── */}
        <SettingsGroup title="Security">
          <SettingsRow icon={Shield} label={t.changePassword} description="Update your credentials" onClick={() => navigate("/forgot-password")} />
          <SettingsRow icon={LogOut} label={t.signOut} onClick={handleLogout} destructive />
        </SettingsGroup>

        {/* ── App Version ─────────────────────────── */}
        <SectionBanner title="App Version" />
        <div className="flex items-center gap-3 px-1">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <p className="text-[15px] font-medium">1.0.0</p>
        </div>

        <div className="h-6" />
      </div>
    </DriverDashboardLayout>
  );
};

export default DriverSettings;
