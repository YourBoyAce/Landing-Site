import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import { transporter } from "@/lib/mailer";
import { renderToStream } from "@react-pdf/renderer";
import { InvoicePDF } from "@/components/pdf/InvoicePDF";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID!;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LEARNING_PORTAL_URL = (
  process.env.LEARNING_PORTAL_URL ||
  process.env.NEXT_PUBLIC_LEARNING_PORTAL_URL ||
  ""
).replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Supabase client – scoped to the "phase-2" schema for table operations.
// Auth admin calls always go to the auth schema automatically.
// ---------------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "phase2" },
});

const supabasePublic = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Razorpay SDK instance
// ---------------------------------------------------------------------------
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// ---------------------------------------------------------------------------
// POST /api/razorpay/verify-payment
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    // ------------------------------------------------------------------
    // 1. Parse request body
    // ------------------------------------------------------------------
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      course_id,
      course_name,
      bundle_id,
      batch_type,
      customer_name,
      customer_email,
      customer_phone,
      customer_comments,
      product_uuid,
      // Optional — sent when checkout originates from the cart with multiple items.
      // Shape: { course_slug, course_title, plan_id, plan_title, plan_price }[]
      cart_items,
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, error: "Missing required payment fields." },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Verify Razorpay signature
    // ------------------------------------------------------------------
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const isDevelopment = process.env.NODE_ENV === "development";

    if (expectedSignature !== razorpay_signature && !isDevelopment) {
      console.error("[verify-payment] Signature mismatch.");
      return NextResponse.json(
        { success: false, error: "Payment signature verification failed." },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 2a. Idempotency — if this Razorpay order has already been processed,
    //     return the original success response without re-running side effects.
    //     This makes repeated webhook deliveries and browser retries safe.
    // ------------------------------------------------------------------
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, status, additional_comments")
      .eq("razorpay_order_id", razorpay_order_id)
      .not("status", "eq", "pending")
      .limit(1)
      .maybeSingle();

    if (existingOrder) {
      console.log(
        "[verify-payment] Duplicate callback for already-processed order:",
        razorpay_order_id,
      );
      // Determine redirect URL for portal upgrade returns
      let redirectUrl: string | undefined;
      try {
        const meta = existingOrder.additional_comments
          ? JSON.parse(existingOrder.additional_comments)
          : null;
        if (meta?.upgrade_type === "portal_pro_upgrade") {
          redirectUrl = LEARNING_PORTAL_URL
            ? `${LEARNING_PORTAL_URL}/upgrade/success?payment_id=${encodeURIComponent(razorpay_payment_id)}&source=landing`
            : `/upgrade/success?payment_id=${encodeURIComponent(razorpay_payment_id)}&source=landing`;
        }
      } catch { /* ignore parse errors */ }

      return NextResponse.json({
        success: true,
        redirectUrl:
          redirectUrl ??
          (LEARNING_PORTAL_URL
            ? `${LEARNING_PORTAL_URL}/login?message=${encodeURIComponent("Your payment has already been processed.")}`
            : `/login?message=${encodeURIComponent("Your payment has already been processed.")}`),
        orderId: existingOrder.id,
        message: "Payment already recorded.",
      });
    }

    // ------------------------------------------------------------------
    // 2b. Portal upgrade fast-path — if a pending order row exists with
    //     upgrade metadata, retrieve the authoritative context from there
    //     instead of relying on client-submitted course_id / bundle_id.
    // ------------------------------------------------------------------
    const { data: pendingUpgradeOrder } = await supabase
      .from("orders")
      .select("id, user_id, additional_comments")
      .eq("razorpay_order_id", razorpay_order_id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    let portalUpgradeMeta: {
      upgrade_type: string;
      course_ids: string;
      enrollment_ids: string;
      pro_bundle_id: string;
    } | null = null;

    if (pendingUpgradeOrder?.additional_comments) {
      try {
        const parsed = JSON.parse((pendingUpgradeOrder as any).additional_comments);
        if (parsed?.upgrade_type === "portal_pro_upgrade") {
          portalUpgradeMeta = parsed;
        }
      } catch { /* not an upgrade order, proceed normally */ }
    }

    // ------------------------------------------------------------------
    // 3. Fetch payment details from Razorpay to get customer info
    // ------------------------------------------------------------------
    let paymentDetails: any;
    try {
      if (isDevelopment && razorpay_payment_id.startsWith("pay_test_")) {
        // Mock payment details for local testing
        paymentDetails = {
          email: req.headers.get("x-mock-email") || "tester@example.com",
          notes: { name: req.headers.get("x-mock-name") || "Test User" },
          amount: 50000, // 500.00 INR
          status: "captured",
        };
      } else {
        paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
      }
    } catch (fetchErr: any) {
      console.error("[verify-payment] Razorpay fetch error:", fetchErr);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to retrieve payment details from Razorpay.",
        },
        { status: 502 },
      );
    }

    const email: string | undefined = paymentDetails.email || customer_email;
    const name: string | undefined =
      customer_name ??
      paymentDetails.notes?.name ??
      paymentDetails.notes?.customer_name ??
      null;
    const amountPaise: number = paymentDetails.amount;

    if (!email) {
      console.error("[verify-payment] No email found on Razorpay payment.");
      return NextResponse.json(
        {
          success: false,
          error: "Customer email not found on the payment record.",
        },
        { status: 422 },
      );
    }

    // ------------------------------------------------------------------
    // 2.5. Role Gate — block admins and mentors/instructors from purchasing
    // ------------------------------------------------------------------
    // Check profiles table (covers anyone with a portal account).
    const { data: existingProfile } = await supabasePublic
      .from("profiles")
      .select("role")
      .eq("email", email)
      .maybeSingle();

    const blockedRoles = ["admin", "instructor"];
    const profileRole = existingProfile?.role?.toLowerCase() ?? "";

    if (blockedRoles.includes(profileRole)) {
      console.warn(
        `[verify-payment] Blocked purchase attempt by ${profileRole}: ${email}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: `This email is registered as a ${profileRole} on the platform and cannot purchase courses. Please contact support if this is an error.`,
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 3. User Resolution — three-tier lookup
    //
    //  Tier 1: phase2.users    (full purchase/enrollment record)
    //  Tier 2: profiles table  (auth account exists but no phase2 row yet)
    //  Tier 3: create new      (truly first-time user)
    //
    // This prevents the "user already registered" error that occurs when
    // someone has a Supabase Auth account (tier 2) but never purchased before.
    // ------------------------------------------------------------------
    const { data: existingUser, error: lookupError } = await supabase
      .from("users")
      .select("id, email, auth_user_id")
      .eq("email", email)
      .maybeSingle();

    let userId: string;
    let authUserId: string | null = null;
    let isNewUser: boolean;
    let generatedTempPassword: string | null = null;

    if (lookupError) {
      console.error("[verify-payment] User lookup error:", lookupError);
      return NextResponse.json(
        {
          success: false,
          error: `Database error while checking user: ${lookupError.message || JSON.stringify(lookupError)}`,
        },
        { status: 500 },
      );
    }

    if (existingUser) {
      // ── Tier 1: user exists in phase2.users ──────────────────────────
      userId = existingUser.id;
      authUserId = existingUser.auth_user_id;
      isNewUser = false;
    } else {
      // Not in phase2.users — check profiles (auth-only accounts)
      const { data: existingProfile } = await supabasePublic
        .from("profiles")
        .select("id, email")
        .eq("email", email)
        .maybeSingle();

      if (existingProfile) {
        // ── Tier 2: auth account exists, phase2.users row is missing ───
        // Recover their auth ID and create the missing phase2 record.
        console.log(
          "[verify-payment] Tier-2 user found in profiles, backfilling phase2.users for:",
          email,
        );
        authUserId = existingProfile.id; // profiles.id === auth user UUID

        const { data: backfilledUser, error: backfillError } = await supabase
          .from("users")
          .insert({
            email,
            username: name || email.split("@")[0],
            auth_user_id: authUserId,
            role: "user",
          })
          .select("id")
          .single();

        if (backfillError || !backfilledUser) {
          console.error(
            "[verify-payment] Backfill phase2.users error:",
            backfillError,
          );
          return NextResponse.json(
            {
              success: false,
              error: `Failed to sync user record: ${backfillError?.message || JSON.stringify(backfillError)}`,
            },
            { status: 500 },
          );
        }

        userId = backfilledUser.id;
        isNewUser = false; // Has existing auth credentials → redirect to /login?message=
      } else {
        // ── Tier 3: attempt to create a brand-new auth account ──────────
        // If createUser returns "already registered", we recover the existing
        // auth user via admin.listUsers() rather than hard-failing.
        isNewUser = true;
        let authErrorMessage = "Unknown auth error";
        let authCreateFailed = false;

        try {
          const randomSecurePassword = crypto.randomBytes(4).toString("hex") + "Aa1!";
          const { data: authData, error: authError } =
            await supabase.auth.admin.createUser({
              email,
              password: randomSecurePassword,
              email_confirm: true,
              user_metadata: { full_name: name ?? "" },
            });
            
          if (!authError) {
             generatedTempPassword = randomSecurePassword;
          }

          if (authError) {
            authErrorMessage = authError.message || JSON.stringify(authError);
            const alreadyExists =
              authError.message?.toLowerCase().includes("already") ||
              authError.message?.toLowerCase().includes("registered") ||
              authError.message
                ?.toLowerCase()
                .includes("email address has already");

            if (alreadyExists) {
              // ── Tier 3b: auth account exists but slipped past profile lookup ──
              // Scan auth users to recover the existing auth UID.
              console.log(
                "[verify-payment] createUser blocked — recovering existing auth user for:",
                email,
              );
              const { data: usersPage } = await supabase.auth.admin.listUsers({
                page: 1,
                perPage: 1000,
              });
              const matched = usersPage?.users?.find(
                (u) => u.email?.toLowerCase() === email.toLowerCase(),
              );
              if (matched) {
                authUserId = matched.id;
                isNewUser = false; // Has credentials already → redirect to /login?message=
                console.log(
                  "[verify-payment] Recovered auth user ID:",
                  authUserId,
                );
              } else {
                authCreateFailed = true;
              }
            } else {
              authCreateFailed = true;
              console.error(
                "[verify-payment] Auth account creation error:",
                authError,
              );
            }
          } else {
            authUserId = authData.user.id;
          }
        } catch (authErr: any) {
          authErrorMessage = authErr?.message || String(authErr);
          authCreateFailed = true;
          console.error(
            "[verify-payment] Unexpected auth creation error:",
            authErr,
          );
        }

        if (!authUserId) {
          // Failed to create OR recover an auth user — genuine failure
          return NextResponse.json(
            {
              success: false,
              error: authCreateFailed
                ? `Failed to create Supabase Auth account: ${authErrorMessage}`
                : "Could not resolve auth user. Please contact support.",
            },
            { status: 500 },
          );
        }

        // Upsert profile (safe even if it already exists)
        const { error: profileError } = await supabasePublic
          .from("profiles")
          .upsert({
            id: authUserId,
            email,
            full_name: name ?? "",
            role: "user",
            created_at: new Date().toISOString(),
          });

        if (profileError) {
          console.error("[verify-payment] Profile upsert error:", profileError);
        }

        // Upsert phase2.users (safe if it already exists due to a race or prior backfill)
        const { data: upsertedUser, error: upsertUserError } = await supabase
          .from("users")
          .upsert(
            {
              email,
              username: name || email.split("@")[0],
              auth_user_id: authUserId,
              role: "user",
            },
            { onConflict: "email" },
          )
          .select("id")
          .single();

        if (upsertUserError || !upsertedUser) {
          console.error("[verify-payment] User upsert error:", upsertUserError);
          return NextResponse.json(
            {
              success: false,
              error: `Failed to create user record: ${upsertUserError?.message || JSON.stringify(upsertUserError)}`,
            },
            { status: 500 },
          );
        }

        userId = upsertedUser.id;
      }
    }
    
    // ------------------------------------------------------------------
    // If this is a portal upgrade, the definitive user is the one who 
    // initiated the checkout, regardless of what email they used on Razorpay.
    // ------------------------------------------------------------------
    if (pendingUpgradeOrder?.user_id) {
      userId = pendingUpgradeOrder.user_id;
    }
    
    // ------------------------------------------------------------------
    // 4.5. Resolve UUIDs for Course and Bundle
    // ------------------------------------------------------------------
    let finalBundleId = bundle_id;
    // Check if bundle exists if it looks like a UUID
    if (finalBundleId && finalBundleId.length === 36) {
      const { data: bCheck } = await supabase
        .from("bundles")
        .select("id")
        .eq("id", finalBundleId)
        .maybeSingle();
      if (!bCheck) finalBundleId = null;
    }

    // If not a UUID or didn't exist, try looking up by name or fallback
    if (!finalBundleId || finalBundleId.length !== 36) {
      // Frontend often sends "Starter Plan" but DB has "Starter", so we match by the first word
      const bundleKeyword = bundle_id?.toLowerCase().startsWith("live sessions")
        ? "premium"
        : (bundle_id || "").split(" ")[0];

      const { data: bundleData } = await supabase
        .from("bundles")
        .select("id")
        .ilike("bundle_name", `%${bundleKeyword}%`)
        .limit(1)
        .maybeSingle();

      if (bundleData) {
        finalBundleId = bundleData.id;
      } else {
        const { data: anyBundle } = await supabase
          .from("bundles")
          .select("id")
          .limit(1)
          .single();
        if (anyBundle) finalBundleId = anyBundle.id;
      }
    }

    let finalCourseId: string | null = null;
    const isValidUuid = (id: any) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // 1. Direct course ID check
    const candidateId = isValidUuid(course_id) ? course_id : (isValidUuid(product_uuid) ? product_uuid : null);
    if (candidateId) {
      const { data: cCheck } = await supabasePublic
        .from("maincourses")
        .select("id")
        .eq("id", candidateId)
        .maybeSingle();
      if (cCheck) finalCourseId = cCheck.id;
    }

    // 2. Title matching in maincourses
    if (!finalCourseId) {
      const { data: allCourses } = await supabasePublic
        .from("maincourses")
        .select("id, title");

      if (allCourses && allCourses.length > 0) {
        const norm = (s: any) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const targetSearch = norm(course_name || course_id);
        const match = allCourses.find((c) => {
          const cNorm = norm(c.title);
          return cNorm && (targetSearch.includes(cNorm) || cNorm.includes(targetSearch));
        });
        if (match) {
          finalCourseId = match.id;
        } else {
          finalCourseId = allCourses[0].id;
        }
      }
    }

    let finalProductUuid = finalCourseId;

    // ------------------------------------------------------------------
    // 5. Create order in phase-2.orders
    // ------------------------------------------------------------------
    // 5. Create or update order in phase-2.orders
    // ------------------------------------------------------------------
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .upsert(
        {
          ...(pendingUpgradeOrder ? { id: pendingUpgradeOrder.id } : {}),
          user_id: userId,
          course_id: finalCourseId,
          bundle_id: finalBundleId,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          amount: amountPaise / 100, // Store in base currency (INR)
          status: "paid",
          phone_number: customer_phone,
          additional_comments: pendingUpgradeOrder?.additional_comments
            ? (customer_comments
                ? JSON.stringify({ ...portalUpgradeMeta, user_comment: customer_comments })
                : pendingUpgradeOrder.additional_comments)
            : customer_comments,
        },
        { onConflict: "razorpay_order_id" }
      )
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("[verify-payment] Order insert error:", orderError);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to create order record: ${orderError?.message || JSON.stringify(orderError)}`,
        },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Create payment record in phase-2.payments
    // ------------------------------------------------------------------
    // Map Razorpay's 'captured' status to standard 'success' status to satisfy database constraint
    const mappedStatus =
      paymentDetails.status === "captured"
        ? "success"
        : paymentDetails.status || "success";

    const { error: paymentError } = await supabase.from("payments").insert({
      order_id: order.id,
      payment_gateway: "razorpay",
      gateway_order_id: razorpay_order_id,
      gateway_payment_id: razorpay_payment_id,
      gateway_signature: razorpay_signature,
      amount: amountPaise / 100,
      payment_status: mappedStatus,
      paid_at: new Date().toISOString(),
    });

    if (paymentError) {
      console.error("[verify-payment] Payment insert error:", paymentError);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to create payment record: ${paymentError?.message || JSON.stringify(paymentError)}`,
        },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 6.5. Create enrollment record(s) in phase-2.enrollments
    //
    // Portal upgrade fast-path: if this is a portal_pro_upgrade order,
    // use the server-stored course/enrollment IDs (never client body).
    // Normal cart/single-course flow continues unchanged below.
    // ------------------------------------------------------------------
    const accessStartDate = new Date();
    const accessEndDate = new Date();
    accessEndDate.setFullYear(accessEndDate.getFullYear() + 1);

    if (portalUpgradeMeta) {
      // ── Portal upgrade path ────────────────────────────────────────────
      // course_ids and enrollment_ids come from the DB-stored order row,
      // NOT from the client callback body.
      const courseArr = portalUpgradeMeta.course_ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const enrollArr = portalUpgradeMeta.enrollment_ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const proBundleIdUpgrade = portalUpgradeMeta.pro_bundle_id;

      for (let i = 0; i < courseArr.length; i++) {
        const courseId   = courseArr[i];
        const enrollId   = enrollArr[i] ?? null;

        if (enrollId) {
          // Update the existing Starter enrollment row in-place
          const { error: upErr } = await supabase
            .from("enrollments")
            .update({
              bundle_id:       proBundleIdUpgrade,
              status:          "active",
              order_id:        order.id,
              access_end_date: accessEndDate.toISOString(),
            })
            .eq("id", enrollId)
            .eq("user_id", userId)   // ownership guard
            .eq("course_id", courseId);

          if (upErr) {
            console.error(
              `[verify-payment][portal-upgrade] UPDATE failed for enrollment ${enrollId}:`,
              upErr.message,
            );
            // Fallback: upsert
            const { error: upsErr } = await supabase
              .from("enrollments")
              .upsert(
                {
                  user_id:          userId,
                  course_id:        courseId,
                  bundle_id:        proBundleIdUpgrade,
                  status:           "active",
                  order_id:         order.id,
                  access_start_date: accessStartDate.toISOString(),
                  access_end_date:   accessEndDate.toISOString(),
                },
                { onConflict: "user_id,course_id" },
              );
            if (upsErr) {
              console.error(
                `[verify-payment][portal-upgrade] UPSERT fallback failed for course ${courseId}:`,
                upsErr.message,
              );
            }
          }
        } else {
          // No enrollment id — upsert on (user_id, course_id)
          const { error: upsErr } = await supabase
            .from("enrollments")
            .upsert(
              {
                user_id:          userId,
                course_id:        courseId,
                bundle_id:        proBundleIdUpgrade,
                status:           "active",
                order_id:         order.id,
                access_start_date: accessStartDate.toISOString(),
                access_end_date:   accessEndDate.toISOString(),
              },
              { onConflict: "user_id,course_id" },
            );
          if (upsErr) {
            console.error(
              `[verify-payment][portal-upgrade] UPSERT failed for course ${courseId}:`,
              upsErr.message,
            );
          }
        }
      }

      // (The order was already marked as paid during the upsert)

      // ── Return portal-specific redirect ─────────────────────────────
      const portalRedirect = LEARNING_PORTAL_URL
        ? `${LEARNING_PORTAL_URL}/upgrade/success?payment_id=${encodeURIComponent(razorpay_payment_id)}&source=landing`
        : `/upgrade/success?payment_id=${encodeURIComponent(razorpay_payment_id)}&source=landing`;

      return NextResponse.json(
        {
          success:      true,
          redirectUrl:  portalRedirect,
          isNewUser:    false,
          existingUser: true,
          orderId:      order.id,
          message:      "Pro upgrade activated. Redirecting to the learning portal.",
        },
        { status: 200 },
      );
    }

    // ── Normal (non-portal) enrollment path continues below ───────────────

    interface CartItemPayload {
      course_slug: string;
      course_title: string;
      product_id?: string;
      plan_id: string;
      plan_title: string;
      plan_price: number;
    }

    // Build the list of items to enroll.
    const itemsToEnroll: CartItemPayload[] =
      Array.isArray(cart_items) && cart_items.length > 0
        ? cart_items
        : [
            {
              course_slug: course_id,
              course_title: course_name,
              product_id: finalProductUuid,
              plan_id: bundle_id,
              plan_title: bundle_id,
              plan_price: amountPaise / 100,
            },
          ];

    const enrollmentErrors: Array<{ course: string; error: string }> = [];

    for (const cartItem of itemsToEnroll) {
      // 1. Resolve course ID for this item (must be a valid UUID in public.maincourses)
      let itemCourseId: string | null = null;

      if (itemsToEnroll.length === 1 && finalCourseId) {
        // Single-course mode — reuse already-resolved IDs
        itemCourseId = finalCourseId;
      } else {
        // Cart mode — direct course ID or title search
        const candidateCartId = isValidUuid(cartItem.product_id) ? cartItem.product_id : (isValidUuid(cartItem.course_slug) ? cartItem.course_slug : null);
        if (candidateCartId) {
          const { data: mcCheck } = await supabasePublic
            .from("maincourses")
            .select("id")
            .eq("id", candidateCartId)
            .maybeSingle();
          if (mcCheck?.id) itemCourseId = mcCheck.id;
        }

        if (!itemCourseId && cartItem.course_title) {
          const { data: allCourses } = await supabasePublic
            .from("maincourses")
            .select("id, title");
          if (allCourses && allCourses.length > 0) {
            const norm = (s: any) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const titleNorm = norm(cartItem.course_title);
            const match = allCourses.find((c) => {
              const cNorm = norm(c.title);
              return cNorm && (titleNorm.includes(cNorm) || cNorm.includes(titleNorm));
            });
            if (match?.id) itemCourseId = match.id;
          }
        }

        if (!itemCourseId) {
          itemCourseId = finalCourseId;
        }
      }

      // 2. Resolve bundle ID for this item: MUST be a valid UUID in phase2.bundles!
      let itemBundleId: string | null = null;

      // Check if plan_id is already a valid UUID and exists in bundles
      if (isValidUuid(cartItem.plan_id)) {
        const { data: bCheck } = await supabase
          .from("bundles")
          .select("id")
          .eq("id", cartItem.plan_id)
          .maybeSingle();
        if (bCheck?.id) itemBundleId = bCheck.id;
      }

      // If not a valid UUID or not found in DB, resolve by plan title/keyword
      if (!itemBundleId) {
        const planText = cartItem.plan_title || cartItem.plan_id || "";
        const bundleKeyword = planText.toLowerCase().startsWith("live sessions")
          ? "premium"
          : planText.split(" ")[0];

        if (bundleKeyword) {
          const { data: bundleData } = await supabase
            .from("bundles")
            .select("id")
            .ilike("bundle_name", `%${bundleKeyword}%`)
            .limit(1)
            .maybeSingle();
          if (bundleData?.id) itemBundleId = bundleData.id;
        }
      }

      // Fall back to finalBundleId (already resolved earlier)
      if (!itemBundleId) {
        itemBundleId = finalBundleId;
      }

      // 3. Course-first enrollment: product_id is null to avoid legacy foreign key constraint violations
      let itemProductId: string | null = null;

      const { data: existingEnrollment } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", itemCourseId)
        .maybeSingle();

      let enrollmentError;
      if (existingEnrollment) {
        const { error } = await supabase
          .from("enrollments")
          .update({
            order_id: order.id,
            bundle_id: itemBundleId,
            status: "active",
            batch_type: batch_type || "recorded",
          })
          .eq("id", existingEnrollment.id);
        enrollmentError = error;
      } else {
        const { error } = await supabase.from("enrollments").insert({
          user_id: userId,
          order_id: order.id,
          course_id: itemCourseId,
          product_id: itemProductId,
          bundle_id: itemBundleId,
          status: "active",
          batch_type: batch_type || "recorded",
          access_start_date: accessStartDate.toISOString(),
          access_end_date: accessEndDate.toISOString(),
        });
        enrollmentError = error;
      }

      // Sync to course_members and course_enrollments for legacy & portal views
      try {
        if (itemCourseId && email) {
          await supabasePublic
            .from("course_members")
            .delete()
            .eq("email", email.toLowerCase().trim());

          await supabasePublic.from("course_members").insert({
            maincourse_id: itemCourseId,
            email: email.toLowerCase().trim(),
            status: "active",
          });
        }
        if (itemCourseId && authUserId) {
          await supabasePublic.from("course_enrollments").upsert(
            {
              user_id: authUserId,
              course_id: itemCourseId,
              status: "active",
            },
            { onConflict: "user_id,course_id" },
          );
        }
      } catch (syncErr) {
        console.warn("[verify-payment] course_members/course_enrollments sync warning:", syncErr);
      }

      if (enrollmentError) {
        console.error(
          `[verify-payment] Enrollment error for course "${cartItem.course_title}":`,
          enrollmentError,
        );
        enrollmentErrors.push({
          course: cartItem.course_title,
          error: enrollmentError.message || JSON.stringify(enrollmentError),
        });
        // Log but don't hard-fail — other courses in the cart should still enroll
      }
    }

    // ------------------------------------------------------------------
    // 6.75. Send Invoice Email
    // ------------------------------------------------------------------
    try {
      const pdfStream = await renderToStream(
        <InvoicePDF
          invoiceNumber={String(order.id).split("-")[0].toUpperCase()}
          date={new Date().toLocaleDateString()}
          clientName={name || email.split("@")[0]}
          clientPhone={customer_phone || "N/A"}
          itemName={course_name || "Premium Course"}
          amount={amountPaise / 100}
        />,
      );

      // Convert Node stream to Buffer for Nodemailer attachment
      const chunks: Buffer[] = [];
      for await (const chunk of pdfStream as AsyncIterable<
        Uint8Array | string | Buffer
      >) {
        chunks.push(Buffer.from(chunk));
      }
      const pdfBuffer = Buffer.concat(chunks);

      const emailSubject = isNewUser
        ? `Invoice & Welcome to ${course_name || "Premium Plan"} - The Automate`
        : `Your new course has been added — Invoice for ${course_name || "Premium Plan"} - The Automate`;

      const emailIntro = isNewUser
        ? `Thank you for choosing to learn with us! We are thrilled to welcome you to our community. Your payment for <strong>${course_name || "the course"}</strong> has been successfully processed, and your enrollment is now active.`
        : `Great news! Your payment for <strong>${course_name || "the course"}</strong> has been successfully processed, and access has been added to your existing account. You can log in with your existing credentials to start learning right away.`;

      await transporter.sendMail({
        from: `"The Automate" <${process.env.ADMIN_EMAIL}>`,
        to: email,
        subject: emailSubject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px;">
            <h2 style="color: #174778;">${isNewUser ? "Welcome to The Automate!" : "New Course Access Added!"}</h2>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Dear ${name || "Valued Student"},<br/><br/>
              ${emailIntro}
            </p>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Please find your official tax invoice attached to this email for your records.
            </p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
              <h3 style="margin-top: 0; color: #111827;">Order Summary</h3>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;"><strong>Order ID:</strong> ${razorpay_order_id}</p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;"><strong>Amount Paid:</strong> ₹${amountPaise / 100}</p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            
            ${generatedTempPassword ? `
            <div style="background-color: #FFF3CD; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #FFEEBA;">
              <h3 style="margin-top: 0; color: #856404;">Your Login Details</h3>
              <p style="margin: 5px 0; color: #856404; font-size: 14px;">
                You can log in using your email address and the temporary password below:
              </p>
              <p style="margin: 10px 0; font-size: 18px; font-weight: bold; letter-spacing: 1px; color: #856404; text-align: center; background: white; padding: 10px; border-radius: 4px;">
                ${generatedTempPassword}
              </p>
              <p style="margin: 5px 0; color: #856404; font-size: 14px;">
                <strong>Note:</strong> We recommend changing this password from your profile page after you log in.
              </p>
            </div>
            ` : ""}

            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Click the button below to access your learning portal.
            </p>

            <a href="${LEARNING_PORTAL_URL ? `${LEARNING_PORTAL_URL}/login` : '/login'}" 
               style="display: inline-block; background-color: #2283FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">
              Access Learning Portal
            </a>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
              If you have any questions or need assistance, please feel free to reply to this email. We're here to help!<br/><br/>
              Best regards,<br/>
              <strong>The Automate Team</strong>
            </p>
          </div>
        `,
        attachments: [
          {
            filename: `Invoice-${String(order.id).split("-")[0].toUpperCase()}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });
    } catch (emailError) {
      console.error("[verify-payment] Email sending failed:", emailError);
    }

    // ------------------------------------------------------------------
    // 7. Build redirect URL and respond
    // ------------------------------------------------------------------
    // Redirect to the portal login page with the user's email pre-filled.
    // - New users: ?newUser=true triggers auto-login with the default password
    //   set during account creation, then routes them to /dashboard.
    // - Existing users: ?message= shows a friendly prompt to log in with
    //   their existing credentials. Both paths are handled by the portal's
    //   login page without any magic-link / hash-fragment token dependency.
    const loginParams = new URLSearchParams({ email });
    if (isNewUser) {
      loginParams.set("newUser", "true");
    } else {
      loginParams.set(
        "message",
        "Your new course has been added. Please log in to access it.",
      );
    }
    const redirectUrl = LEARNING_PORTAL_URL
      ? `${LEARNING_PORTAL_URL}/login?${loginParams.toString()}`
      : `/login?${loginParams.toString()}`;

    const invoiceSecret = process.env.UPGRADE_HANDOFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "invoice-fallback-secret";
    const invoiceToken = crypto.createHmac("sha256", invoiceSecret).update(String(order.id)).digest("hex");

    return NextResponse.json(
      {
        success: true,
        redirectUrl,
        isNewUser,
        existingUser: !isNewUser,
        orderId: order.id,
        invoiceToken,
        enrollmentErrors: enrollmentErrors.length > 0 ? enrollmentErrors : undefined,
        message: isNewUser
          ? "Account created successfully. Check your email for login instructions."
          : "Payment recorded. Your new course has been added to your existing account.",
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error("[verify-payment] Unhandled error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred during payment verification.",
      },
      { status: 500 },
    );
  }
}
