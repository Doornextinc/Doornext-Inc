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

// HTML-escape to prevent XSS in email templates
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// FIX M5: Timing-safe comparison for service key
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) return false;
  let mismatch = 0;
  for (let i = 0; i < bufA.length; i++) {
    mismatch |= bufA[i] ^ bufB[i];
  }
  return mismatch === 0;
}

// FIX H12: Use EMAIL_DOMAIN secret for branded email sender
function getEmailFrom(): string {
  const domain = Deno.env.get("EMAIL_DOMAIN") || "doornext.com";
  return `DoorNext <noreply@${domain}>`;
}

interface LicenseNotificationRequest {
  licenseId: string;
  status: "approved" | "rejected";
  adminNotes?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // FIX M5: Validate internal caller with timing-safe comparison
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !timingSafeEqual(authHeader, `Bearer ${supabaseServiceKey}`)) {
      return new Response(
        JSON.stringify({ error: "Internal function — not callable externally" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { licenseId, status, adminNotes }: LicenseNotificationRequest = await req.json();

    if (!licenseId || !status) {
      throw new Error("Missing required fields: licenseId, status");
    }

    if (!["approved", "rejected"].includes(status)) {
      throw new Error("Invalid status: must be 'approved' or 'rejected'");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: license, error: licError } = await supabase
      .from("seller_licenses")
      .select("*")
      .eq("id", licenseId)
      .single();

    if (licError || !license) {
      throw new Error("License not found");
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(license.user_id);
    if (userError || !userData?.user?.email) {
      throw new Error("User email not found");
    }

    const [profileRes, storeRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", license.user_id).single(),
      supabase.from("seller_stores").select("business_name").eq("id", license.store_id).single(),
    ]);

    const userName = escapeHtml(profileRes.data?.full_name || "Seller");
    const storeName = escapeHtml(storeRes.data?.business_name || "Your Store");
    const userEmail = userData.user.email;
    const safeAdminNotes = adminNotes ? escapeHtml(String(adminNotes).slice(0, 1000)) : "";

    let subject: string;
    let htmlContent: string;

    if (status === "approved") {
      subject = "✅ Your Business License Has Been Approved!";
      htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin:0;font-size:24px;">🎉 License Approved!</h1>
            <p style="margin:8px 0 0;opacity:0.9;">DoorNext Maker</p>
          </div>
          <div style="background: #f9fafb; padding: 32px 24px; border-radius: 0 0 12px 12px;">
            <p>Hello ${userName},</p>
            <p>Great news! Your business license for <strong>${storeName}</strong> has been approved.</p>
            <div style="text-align:center;margin:24px 0;">
              <span style="display:inline-block;background:#d1fae5;color:#065f46;padding:6px 16px;border-radius:20px;font-size:14px;font-weight:600;">✓ Licensed &amp; Verified</span>
            </div>
            <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;border:1px solid #e5e7eb;">
              <p style="margin:4px 0;font-size:14px;">🛡️ Your store now shows a <strong>Verified Seller</strong> badge</p>
              <p style="margin:4px 0;font-size:14px;">🛒 Customers can order your homemade goods with confidence</p>
              ${license.expires_at ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">License valid until: ${new Date(license.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>` : ""}
            </div>
            <p>Start adding your products and grow your business with DoorNext!</p>
          </div>
          <div style="text-align:center;padding:20px;color:#6b7280;font-size:12px;">
            <p>© ${new Date().getFullYear()} DoorNext. All rights reserved.</p>
          </div>
        </div>
      `;
    } else {
      subject = "⚠️ Your Business License Application Needs Attention";
      htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin:0;font-size:24px;">Application Update</h1>
            <p style="margin:8px 0 0;opacity:0.9;">DoorNext Maker</p>
          </div>
          <div style="background: #f9fafb; padding: 32px 24px; border-radius: 0 0 12px 12px;">
            <p>Hello ${userName},</p>
            <p>We've reviewed your business license application for <strong>${storeName}</strong> and unfortunately it could not be approved at this time.</p>
            ${safeAdminNotes ? `
            <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
              <p style="margin:0;font-weight:600;color:#991b1b;">Reason:</p>
              <p style="margin:8px 0 0;font-size:14px;">${safeAdminNotes}</p>
            </div>` : ""}
            <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;border:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-weight:600;">What to do next:</p>
              <p style="margin:4px 0;font-size:14px;">1. Review the feedback above</p>
              <p style="margin:4px 0;font-size:14px;">2. Update your documents in the Licenses section</p>
              <p style="margin:4px 0;font-size:14px;">3. Resubmit your application</p>
            </div>
            <p>If you have questions, please contact our support team.</p>
          </div>
          <div style="text-align:center;padding:20px;color:#6b7280;font-size:12px;">
            <p>© ${new Date().getFullYear()} DoorNext. All rights reserved.</p>
          </div>
        </div>
      `;
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    // FIX H12: Use branded email domain
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getEmailFrom(),
        to: [userEmail],
        subject,
        html: htmlContent,
      }),
    });

    const emailData = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("Resend API error:", emailData);
      throw new Error(emailData.message || "Failed to send email");
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending license notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
