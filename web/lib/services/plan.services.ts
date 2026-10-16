import { client } from "@/lib/sanity.client";
import { PLANS_QUERY, PLAN_BY_BADGE_QUERY } from "@/lib/queries/plan";
import { Plan } from "@/lib/types/plan";
import { makePhase2Client } from "@/lib/supabase/server";

/**
 * Ensures that the price configured in Sanity for course plans is the ultimate price,
 * overwriting the price in Supabase phase2.bundles.
 */
export async function syncSanityPricesToSupabase(plansToSync?: Plan[]): Promise<{
    synced: Array<{ badge: string; bundleId: string; oldPrice: number; newPrice: number }>;
}> {
    try {
        const plans = plansToSync || (await client.fetch<Plan[]>(PLANS_QUERY, {}, { cache: "no-store" }));
        if (!plans || plans.length === 0) return { synced: [] };

        const supabase = makePhase2Client();
        const { data: dbBundles, error: fetchErr } = await supabase
            .from("bundles")
            .select("id, bundle_name, price");

        if (fetchErr || !dbBundles) {
            console.error("[plan.services] Failed to fetch phase2.bundles for price sync:", fetchErr?.message);
            return { synced: [] };
        }

        const synced: Array<{ badge: string; bundleId: string; oldPrice: number; newPrice: number }> = [];

        for (const plan of plans) {
            if (typeof plan.price !== "number" || isNaN(plan.price)) continue;

            const targetBadge = (plan.badge || plan.title || "").trim().toLowerCase();

            // Match bundle by bundleUuid, Sanity _id, or bundle_name
            const matchingBundle = dbBundles.find((b: any) => {
                if (plan.bundleUuid && b.id === plan.bundleUuid) return true;
                if (plan._id && b.id === plan._id) return true;
                const bName = (b.bundle_name || "").trim().toLowerCase();
                return bName === targetBadge || bName.includes(targetBadge) || targetBadge.includes(bName);
            });

            if (matchingBundle) {
                const currentPrice = Number(matchingBundle.price);
                const sanityPrice = Number(plan.price);

                if (currentPrice !== sanityPrice) {
                    const { error: updateErr } = await supabase
                        .from("bundles")
                        .update({
                            price: sanityPrice,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", matchingBundle.id);

                    if (!updateErr) {
                        console.log(
                            `[plan.services] Overwrote phase2.bundles "${matchingBundle.bundle_name}" price from ₹${currentPrice} to ₹${sanityPrice} (Sanity source of truth)`
                        );
                        synced.push({
                            badge: plan.badge,
                            bundleId: matchingBundle.id,
                            oldPrice: currentPrice,
                            newPrice: sanityPrice,
                        });
                    } else {
                        console.error(
                            `[plan.services] Error updating phase2.bundles for ${matchingBundle.bundle_name}:`,
                            updateErr.message
                        );
                    }
                }
            }
        }

        return { synced };
    } catch (err: any) {
        console.error("[plan.services] Unexpected error syncing prices to Supabase:", err);
        return { synced: [] };
    }
}

export async function getPlans(): Promise<Plan[]> {
    try {
        const plans = await client.fetch<Plan[]>(PLANS_QUERY, {}, { cache: "no-store" });
        // Overwrite Supabase phase2.bundles with Sanity ultimate prices in the background
        syncSanityPricesToSupabase(plans).catch((err) =>
            console.error("[plan.services] Background price sync failed:", err)
        );
        return plans ?? [];
    } catch (err: any) {
        console.error("[plan.services] Failed to fetch plans from Sanity:", err?.message ?? err);
        return [];
    }
}

/**
 * Fetch a single plan by its badge slug (e.g. "starter", "pro", "premium").
 * The slug is lowercased in the URL; we capitalise it to match Sanity badge values.
 */
export async function getPlanByBadge(badgeSlug: string): Promise<Plan | null> {
    try {
        const badge = badgeSlug.charAt(0).toUpperCase() + badgeSlug.slice(1).toLowerCase();
        const plan = await client.fetch<Plan | null>(PLAN_BY_BADGE_QUERY, { badge }, { cache: "no-store" });
        if (plan) {
            syncSanityPricesToSupabase([plan]).catch((err) =>
                console.error("[plan.services] Background single plan price sync failed:", err)
            );
        }
        return plan ?? null;
    } catch (err: any) {
        console.error("[plan.services] Failed to fetch plan by badge from Sanity:", err?.message ?? err);
        return null;
    }
}