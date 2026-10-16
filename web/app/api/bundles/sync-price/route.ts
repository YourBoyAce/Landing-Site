import { NextResponse } from "next/server";
import { syncSanityPricesToSupabase } from "@/lib/services/plan.services";
import { makePhase2Client } from "@/lib/supabase/server";
import { client } from "@/lib/sanity.client";

export const dynamic = "force-dynamic";

// Helper for CORS preflight and responses
function checkSyncAuth(request: Request): boolean {
  const syncSecret = process.env.UPGRADE_HANDOFF_SECRET;
  if (!syncSecret) return true; // dev fallback if not configured
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const headerSecret = request.headers.get("x-sync-secret");
  return token === syncSecret || headerSecret === syncSecret;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

/**
 * API route to sync Sanity plan prices to Supabase phase2.bundles table.
 * Whenever a price is changed in Sanity, calling this ensures the Supabase
 * phase2.bundles price is overwritten with Sanity's ultimate price.
 */
export async function POST(request: Request) {
  if (!checkSyncAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is acceptable; defaults to full sync
    }

    const { badge, bundleUuid } = body;

    // If specific badge provided, fetch authoritative price from Sanity CMS
    if (badge) {
      const targetBadge = String(badge).trim().toLowerCase();

      // Query Sanity directly to ensure price authenticity
      const sanityPlan = await client.fetch<any>(
        `*[_type == "plan" && (lower(badge) == $targetBadge || lower(title) == $targetBadge || _id == $bundleUuid)][0]{
          _id,
          badge,
          title,
          price,
          bundleUuid
        }`,
        { targetBadge, bundleUuid: bundleUuid || "" },
        { cache: "no-store" }
      );

      if (!sanityPlan || typeof sanityPlan.price !== "number") {
        // Fall back to full Sanity CMS sync
        const result = await syncSanityPricesToSupabase();
        return NextResponse.json(
          { success: true, message: "Full sync completed", synced: result.synced },
          { status: 200, headers: corsHeaders() }
        );
      }

      const supabase = makePhase2Client();
      const { data: dbBundles, error: fetchErr } = await supabase
        .from("bundles")
        .select("id, bundle_name, price");

      if (fetchErr || !dbBundles) {
        console.error("[sync-price] Failed to fetch Supabase bundles:", fetchErr);
        return NextResponse.json(
          { error: "Failed to fetch Supabase bundles" },
          { status: 500, headers: corsHeaders() }
        );
      }

      const matchingBundle = dbBundles.find((b: any) => {
        if (bundleUuid && b.id === bundleUuid) return true;
        if (sanityPlan.bundleUuid && b.id === sanityPlan.bundleUuid) return true;
        const bName = (b.bundle_name || "").trim().toLowerCase();
        return bName === targetBadge || bName.includes(targetBadge) || targetBadge.includes(bName);
      });

      if (!matchingBundle) {
        return NextResponse.json(
          { error: `No matching Supabase bundle found for badge "${badge}"` },
          { status: 404, headers: corsHeaders() }
        );
      }

      const oldPrice = Number(matchingBundle.price);
      const newPrice = Number(sanityPlan.price);

      const { error: updateErr } = await supabase
        .from("bundles")
        .update({
          price: newPrice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchingBundle.id);

      if (updateErr) {
        console.error("[sync-price] Failed to update Supabase bundle:", updateErr);
        return NextResponse.json(
          { error: "Failed to update Supabase bundle" },
          { status: 500, headers: corsHeaders() }
        );
      }

      console.log(
        `[sync-price] Overwrote phase2.bundles "${matchingBundle.bundle_name}" price: ₹${oldPrice} -> ₹${newPrice}`
      );

      return NextResponse.json(
        {
          success: true,
          updated: {
            badge,
            bundleId: matchingBundle.id,
            bundleName: matchingBundle.bundle_name,
            oldPrice,
            newPrice,
          },
        },
        { status: 200, headers: corsHeaders() }
      );
    }

    // Default: full sync of all Sanity plans to Supabase phase2.bundles
    const result = await syncSanityPricesToSupabase();

    return NextResponse.json(
      {
        success: true,
        message: "All plan prices synced from Sanity to Supabase phase2.bundles",
        synced: result.synced,
      },
      { status: 200, headers: corsHeaders() }
    );
  } catch (error: any) {
    console.error("[api/bundles/sync-price] Error:", error);
    return NextResponse.json(
      { error: "Failed to sync price" },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function GET(request: Request) {
  if (!checkSyncAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncSanityPricesToSupabase();
  return NextResponse.json(
    {
      success: true,
      message: "Synced all Sanity plan prices to Supabase phase2.bundles",
      synced: result.synced,
    },
    { status: 200, headers: corsHeaders() }
  );
}
