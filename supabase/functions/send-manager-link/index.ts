import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }

  try {
    const { managerToken } = await req.json();

    if (typeof managerToken !== "string" || !/^[a-f0-9]{32}$/i.test(managerToken)) {
      return json({ error: "Invalid manager token" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: initiative, error: initiativeError } = await admin
      .from("initiatives_v04")
      .select("title, manager_email")
      .eq("manager_token", managerToken)
      .maybeSingle();

    if (initiativeError) {
      console.error("Initiative lookup error:", initiativeError);
      return json({ error: "Unable to load initiative" }, 500);
    }

    if (!initiative) {
      return json({ error: "Initiative not found" }, 404);
    }

    if (!initiative.manager_email) {
      return json({ error: "Manager email is not set" }, 400);
    }

    const managerUrl = `https://comfundy.com/#/manage/${managerToken}`;
    const accountRedirectUrl = `https://comfundy.com/?claim=${managerToken}`;
    const safeTitle = escapeHtml(initiative.title || "Ініціатива");
    const safeManagerUrl = escapeHtml(managerUrl);

    // The redirect carries this initiative's manager token. After the email is
    // verified, the frontend claims only this initiative for the authenticated user.
    const { data: accountLinkData, error: accountLinkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: initiative.manager_email,
      options: { redirectTo: accountRedirectUrl },
    });

    if (accountLinkError) {
      console.error("Account magic-link generation error:", accountLinkError);
    }

    const accountUrl = accountLinkData?.properties?.action_link || null;
    const accountSection = accountUrl
      ? `
          <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e5ded2">
            <h3 style="margin:0 0 10px">Усі ініціативи в одному місці</h3>
            <p style="margin:0 0 16px">Підтвердьте email, щоб користуватися розділом <strong>«Мої ініціативи»</strong>. Там будуть зібрані ваші ініціативи.</p>
            <p style="margin:20px 0">
              <a href="${escapeHtml(accountUrl)}" style="display:inline-block;padding:12px 20px;background:#fff;color:#245447;text-decoration:none;border:1px solid #245447;border-radius:999px;font-weight:700">Підтвердити email</a>
            </p>
            <p style="font-size:13px;color:#667085;margin-bottom:0">Після підтвердження ця ініціатива буде додана до вашого акаунта.</p>
          </div>
        `
      : "";

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Comfundy <hello@comfundy.com>",
        to: [initiative.manager_email],
        subject: `Ваша ініціатива «${initiative.title}» створена`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172033;line-height:1.5">
            <h2 style="margin-bottom:16px">Ваша ініціатива створена</h2>
            <p>Ініціатива <strong>«${safeTitle}»</strong> успішно створена в Comfundy.</p>
            <p>Збережіть цей лист, щоб у будь-який момент повернутися до кабінету менеджера.</p>
            <p style="margin:28px 0">
              <a href="${safeManagerUrl}" style="display:inline-block;padding:12px 20px;background:#245447;color:#fff;text-decoration:none;border-radius:999px;font-weight:700">Відкрити ініціативу</a>
            </p>
            <p style="font-size:14px;color:#667085">Це посилання відкриває кабінет менеджера. Не пересилайте його іншим людям.</p>
            ${accountSection}
          </div>
        `,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend error:", resendData);
      return json({ error: "Failed to send email" }, 502);
    }

    return json({
      success: true,
      id: resendData.id,
      accountLinkIncluded: Boolean(accountUrl),
    });
  } catch (error) {
    console.error("send-manager-link error:", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
