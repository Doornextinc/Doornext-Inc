import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "*";
if (allowedOrigins === "*") {
  console.warn("[SECURITY] ALLOWED_ORIGINS not set — using wildcard CORS. Set this env var in production!");
}
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigins,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// FIX H12: Use custom domain
function getEmailFrom(): string { return `DoorNext <noreply@${Deno.env.get("EMAIL_DOMAIN") || "doornext.com"}>`; }

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: only callable with service role key (cron jobs use this)
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader !== `Bearer ${supabaseServiceKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: expiringLicenses, error } = await supabase
      .from("seller_licenses")
      .select("id, user_id, store_id, expires_at, last_expiry_reminder_at")
      .eq("status", "approved")
      .not("expires_at", "is", null)
      .lte("expires_at", in30Days.toISOString())
      .gt("expires_at", now.toISOString());

    if (error) throw error;
    if (!expiringLicenses || expiringLicenses.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No expiring licenses found", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let emailsSent = 0;

    for (const license of expiringLicenses) {
      const expiresAt = new Date(license.expires_at!);
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const is30DayWindow = daysLeft <= 31 && daysLeft >= 29;
      const is7DayWindow = daysLeft <= 8 && daysLeft >= 6;

      if (!is30DayWindow && !is7DayWindow) continue;

      // FIX M12: Deduplication — skip if already reminded in the last 5 days
      if (license.last_expiry_reminder_at) {
        const lastReminder = new Date(license.last_expiry_reminder_at);
        const daysSinceReminder = (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceReminder < 5) continue;
      }

      const [userRes, profileRes, storeRes] = await Promise.all([
        supabase.auth.admin.getUserById(license.user_id),
        supabase.from("profiles").select("full_name").eq("user_id", license.user_id).single(),
        supabase.from("seller_stores").select("business_name").eq("id", license.store_id).single(),
      ]);

      const email = userRes.data?.user?.email;
      if (!email) continue;

      const userName = profileRes.data?.full_name || "Seller";
      const storeName = storeRes.data?.business_name || "Your Store";
      const expiryDate = expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const isUrgent = daysLeft <= 8;

      const subject = isUrgent
        ? `🚨 Your Business License Expires in ${daysLeft} Days!`
        : `⏰ License Renewal Reminder — ${daysLeft} Days Left`;

      const headerBg = isUrgent
        ? "linear-gradient(135deg, #ef4444, #dc2626)"
        : "linear-gradient(135deg, #f59e0b, #d97706)";

      const htmlContent = `
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:-apple-system,sans-serif;line-height:1.6;color:#1f2937;">
          <div style="max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:${headerBg};color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;font-size:24px;">${isUrgent ? "⚠️ Urgent Renewal" : "📋 Renewal Reminder"}</h1>
              <p style="margin:8px 0 0;opacity:0.9;">DoorNext Maker</p>
            </div>
            <div style="background:#f9fafb;padding:32px 24px;border-radius:0 0 12px 12px;">
              <p>Hello ${userName},</p>
              <p>Your business license for <strong>${storeName}</strong> is expiring soon.</p>
              <div style="text-align:center;margin:24px 0;">
                <span style="display:inline-block;background:${isUrgent ? "#fef2f2" : "#fffbeb"};color:${isUrgent ? "#991b1b" : "#92400e"};padding:8px 20px;border-radius:20px;font-size:16px;font-weight:700;">${daysLeft} days remaining</span>
              </div>
              <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;border:1px solid #e5e7eb;">
                <p style="margin:4px 0;font-size:14px;">📅 Expiry Date: <strong>${expiryDate}</strong></p>
                <p style="margin:4px 0;font-size:14px;">🏪 Store: <strong>${storeName}</strong></p>
              </div>
              ${isUrgent ? '<p style="color:#991b1b;font-weight:600;">⚠️ If your license expires, your Verified Seller badge will be removed.</p>' : ""}
              <p>If you have questions, contact our support team.</p>
            </div>
            <div style="text-align:center;padding:20px;color:#6b7280;font-size:12px;">
              <p>© ${new Date().getFullYear()} DoorNext. All rights reserved.</p>
            </div>
          </div>
        </body></html>`;

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: getEmailFrom(), to: [email], subject, html: htmlContent }),
      });

      if (emailResponse.ok) {
        emailsSent++;
        // FIX M12: Record when we sent the reminder
        await supabase.from("seller_licenses")
          .update({ last_expiry_reminder_at: now.toISOString() })
          .eq("id", license.id);
        console.log(`Expiry reminder sent to ${email} (${daysLeft} days left)`);
      } else {
        const errData = await emailResponse.json();
        console.error(`Failed to send to ${email}:`, errData);
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent, totalExpiring: expiringLicenses.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error checking license expiry:", error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
