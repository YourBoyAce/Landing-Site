import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { client } from "@/lib/sanity.client";
import { makeAdminClient } from "@/lib/supabase/server";
import PaymentPageClient from "@/sections/payment-section/PaymentPageClient";
import UpgradeCheckoutClient, {
  type UpgradeEligibleCourse,
} from "@/sections/payment-section/UpgradeCheckoutClient";

/**
 * Server component — reads course + plan from search params, fetches both
 * from Sanity, then passes resolved data to the client-side form/checkout.
 *
 * Normal purchase URL shape (built by PricingCard):
 *   /payment?course=<courseSlug>&bundleId=<planId>&bundleTitle=...&amount=...
 *
 * Portal upgrade URL shape (set by portal /api/upgrade/request-handoff):
 *   /payment?upgradeMode=1&token=<handoff-token>
 *
 * When upgradeMode=1:
 *   1. validate-handoff is called server-side with the token.
 *   2. On success an HttpOnly cookie is set and UpgradeCheckoutClient renders.
 *   3. On failure the user is shown a clear error — normal checkout is NOT shown.
 *   4. The token in the URL is a one-time nonce and is never trusted by
 *      subsequent API calls; the session cookie is the authority after step 1.
 */

// ── Search param shape ────────────────────────────────────────────────────────

interface SearchParams {
  course?:      string;
  courseId?:    string;
  courseTitle?: string;
  bundleId?:    string;
  bundleTitle?: string;
  amount?:      string;
  duration?:    string;
  batch?:       string;
  name?:        string;
  email?:       string;
  phone?:       string;
  planId?:      string;
  planName?:    string;
  planPrice?:   string;
  fromCart?:    string;
  /** "1" when arriving from the learning portal for a Pro upgrade */
  upgradeMode?: string;
  /** One-time HMAC-signed handoff token issued by the portal */
  token?:       string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

// ── Sanity queries (normal purchase only) ────────────────────────────────────

const COURSE_TITLE_QUERY = `
  *[_type=="courseDetails" && slug.current==$slug][0]{ _id, title, productUuid }
`;

const PLAN_QUERY = `
  *[_type=="plan" && _id==$planId][0]{
    _id, title, badge, price, rating, reviewCount,
    duration, batchOptions, coverImage,
    features[]{ title, included }
  }
`;

// ── Upgrade-mode server-side validation ──────────────────────────────────────

type ValidateResult =
  | {
      ok:         true;
      authUserId: string;
      phase2UserId: string;
      eligibleCourses: UpgradeEligibleCourse[];
      proBundleId: string;
    }
  | { ok: false; error: string };

async function validateUpgradeHandoff(token: string): Promise<ValidateResult> {
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!baseUrl) {
    try {
      const headerList = await headers();
      const host = headerList.get("host");
      const proto = headerList.get("x-forwarded-proto") || "https";
      if (host) baseUrl = `${proto}://${host}`;
    } catch {
      // In case headers() is unavailable
    }
  }

  const cookieStore = await cookies();
  // Forward any existing upgrade_session cookie so validate-handoff can detect replays
  const existingCookie = cookieStore.get("upgrade_session")?.value ?? "";
  const cookieHeader = existingCookie
    ? `upgrade_session=${encodeURIComponent(existingCookie)}`
    : "";

  const res = await fetch(`${baseUrl}/api/upgrade/validate-handoff`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ token }),
    // Don't cache — this is a one-time operation
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Validation failed." }));
    return { ok: false, error: body.error ?? "Invalid or expired upgrade session." };
  }

  const data = await res.json();

  // Forward the Set-Cookie header from validate-handoff so the HttpOnly
  // upgrade_session cookie is set on the browser response.
  // (Next.js server components can read but not directly set cookies from
  //  fetch responses; we rely on validate-handoff setting the cookie via its
  //  own NextResponse and the browser receiving it through the API call made
  //  client-side when the page loads — see UpgradeCheckoutClient's initiation.)
  //
  // Because this is a server component calling our own API internally, the
  // Set-Cookie on the validate-handoff response is handled differently.
  // We pass the validated data to the component; the UpgradeCheckoutClient
  // calls validate-handoff from the browser on mount to acquire the cookie.
  // The server component therefore only uses this call for error detection.

  return {
    ok:              true,
    authUserId:      data.authUserId,
    phase2UserId:    data.phase2UserId,
    eligibleCourses: data.eligibleCourses ?? [],
    proBundleId:     data.proBundleId,
  };
}

// ── Page component ────────────────────────────────────────────────────────────

export default async function PaymentPage({ searchParams }: Props) {
  const params = await searchParams;

  // ── Branch: portal upgrade mode ──────────────────────────────────────────
  if (params.upgradeMode === "1") {
    const token = params.token ?? "";

    // Guard: token must be present (middleware already blocked cookie-less
    // requests, but a direct token-less URL still needs handling).
    if (!token) {
      return (
        <main className="min-h-screen bg-slate-50/30 flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold text-red-700 mb-3">Invalid upgrade link</h1>
            <p className="text-slate-600 text-sm">
              This upgrade link is missing required parameters. Please start the upgrade
              again from your courses page in the learning portal.
            </p>
          </div>
        </main>
      );
    }

    const validation = await validateUpgradeHandoff(token);

    if (!validation.ok) {
      return (
        <main className="min-h-screen bg-slate-50/30 flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold text-red-700 mb-3">Upgrade session invalid</h1>
            <p className="text-slate-600 text-sm mb-4">{validation.error}</p>
            <p className="text-xs text-slate-400">
              Please return to the learning portal and start the upgrade again.
            </p>
          </div>
        </main>
      );
    }

    if (validation.eligibleCourses.length === 0) {
      return (
        <main className="min-h-screen bg-slate-50/30 flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold text-[#0A3D62] mb-3">No courses to upgrade</h1>
            <p className="text-slate-600 text-sm">
              All your enrolled courses are already on the Pro plan, or no eligible
              Starter enrollments were found.
            </p>
          </div>
        </main>
      );
    }

    // ── Render upgrade checkout — completely separate from normal purchase ──
    return (
      <main className="min-h-screen bg-slate-50/30">
        <Suspense fallback={<div className="p-20 text-center">Loading upgrade checkout…</div>}>
          <UpgradeCheckoutClient
            authUserId={validation.authUserId}
            phase2UserId={validation.phase2UserId}
            eligibleCourses={validation.eligibleCourses}
            proBundleId={validation.proBundleId}
            token={token}
          />
        </Suspense>
      </main>
    );
  }

  // ── Normal purchase path (100% unchanged) ─────────────────────────────────

  const courseSlug   = params.course ?? "";
  const bundleId     = params.bundleId ?? params.planId ?? "";
  const bundleTitle  = params.bundleTitle ?? params.planName ?? "";
  const amount       = Number(params.amount ?? params.planPrice ?? 0);
  const batch        = params.batch ?? "recorded";
  const name         = params.name ?? "";
  const email        = params.email ?? "";
  const phone        = params.phone ?? "";
  const fromCart     = params.fromCart === "1";
  const urlCourseTitle = params.courseTitle ?? "";

  const [courseData, planData] = await Promise.all([
    !fromCart && courseSlug
      ? client
          .fetch<{ _id: string; title: string; productUuid: string } | null>(
            COURSE_TITLE_QUERY,
            { slug: courseSlug },
          )
          .catch(() => null)
      : Promise.resolve(null),
    !fromCart && bundleId
      ? client.fetch(PLAN_QUERY, { planId: bundleId }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const courseTitle   = courseData?.title ?? (urlCourseTitle || courseSlug);
  
  // If we only have planName (bundleTitle) but not bundleId, try to fetch plan by title
  let resolvedPlanData = planData;
  if (!fromCart && !bundleId && bundleTitle) {
    const PLAN_BY_TITLE_QUERY = `
      *[_type=="plan" && title match $title][0]{
        _id, title, badge, price, rating, reviewCount,
        duration, batchOptions, coverImage,
        features[]{ title, included }
      }
    `;
    resolvedPlanData = await client.fetch(PLAN_BY_TITLE_QUERY, { title: bundleTitle }).catch(() => null);
  }

  const resolvedBundle = resolvedPlanData ?? null;
  const resolvedPrice  = resolvedBundle?.price ?? amount;
  const resolvedTitle  = resolvedBundle?.title ?? bundleTitle;

  let canonicalCourseId = params.courseId || "";
  let canonicalCourseTitle = courseTitle;
  const isValidUuid = (val: any) =>
    typeof val === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  if (!fromCart && (courseSlug || courseTitle || canonicalCourseId)) {
    try {
      const supabase = makeAdminClient();
      const { data: allCourses } = await supabase.from("maincourses").select("id, title");
      if (allCourses && allCourses.length > 0) {
        if (canonicalCourseId && isValidUuid(canonicalCourseId)) {
          const directMatch = allCourses.find((c) => c.id.toLowerCase() === canonicalCourseId.toLowerCase());
          if (directMatch) {
            canonicalCourseId = directMatch.id;
            canonicalCourseTitle = directMatch.title || courseTitle;
          }
        }
        if (!canonicalCourseId || !isValidUuid(canonicalCourseId)) {
          const normTitle = (courseTitle || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const normSlug = (courseSlug || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          for (const c of allCourses) {
            const normC = (c.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            if (normC && (normTitle.includes(normC) || normC.includes(normTitle) || normSlug.includes(normC) || normC.includes(normSlug))) {
              canonicalCourseId = c.id;
              canonicalCourseTitle = c.title || courseTitle;
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("[PaymentPage] Failed to resolve maincourse:", e);
    }
  }

  if (!canonicalCourseId) {
    canonicalCourseId = courseData?.productUuid || courseData?._id || "";
  }

  return (
    <main className="min-h-screen bg-slate-50/30">
      <Suspense fallback={<div className="p-20 text-center">Loading checkout…</div>}>
        <PaymentPageClient
          courseSlug={courseSlug}
          courseTitle={canonicalCourseTitle || courseTitle}
          productUuid={canonicalCourseId}
          bundleId={resolvedBundle?._id ?? bundleId}
          bundleTitle={resolvedTitle}
          bundlePrice={resolvedPrice}
          batch={batch}
          initialName={name}
          initialEmail={email}
          initialPhone={phone}
          fromCart={fromCart}
        />
      </Suspense>
    </main>
  );
}
