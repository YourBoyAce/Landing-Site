import Razorpay from "razorpay";
import { NextResponse, NextRequest } from "next/server";

import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  try {
    const {
      amount: requestedAmount,
      courseKey,
      productUuid,
      courseId,
      email,
      bundleTitle,
      targetBundlePrice,
    } = await req.json();

    if (!requestedAmount || isNaN(requestedAmount)) {
      return NextResponse.json(
        { error: "Amount is required and must be a number" },
        { status: 400 },
      );
    }

    let verifiedAmount = Number(requestedAmount);

    // Helper to determine hierarchy
    const getTierLevel = (name: string) => {
      const lower = name.toLowerCase();
      if (lower.includes("premium") || lower.includes("live sessions"))
        return 3;
      if (lower.includes("pro")) return 2;
      return 1; // Default to Starter
    };

    // Server-side verification for upgrades
    const targetCourseId = courseId || productUuid;
    if (
      email &&
      targetCourseId &&
      (bundleTitle?.toLowerCase().includes("pro") ||
        bundleTitle?.toLowerCase().includes("premium") ||
        bundleTitle?.toLowerCase().includes("live sessions"))
    ) {
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: "phase2" },
      });
      const supabasePublic = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );

      const { data: profile } = await supabasePublic
        .from("profiles")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (profile) {
        const { data: phase2User } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", profile.id)
          .maybeSingle();

        if (phase2User) {
          const { data: enrollment } = await supabase
            .from("enrollments")
            .select("*, bundles(bundle_name)")
            .eq("user_id", phase2User.id)
            .or(`course_id.eq.${targetCourseId},product_id.eq.${targetCourseId}`)
            .eq("status", "active")
            .maybeSingle();

          if (enrollment) {
            const currentBundleName =
              (enrollment.bundles as any)?.bundle_name || "Starter";
            const currentLevel = getTierLevel(currentBundleName);
            const targetLevel = getTierLevel(bundleTitle);

            if (targetLevel > currentLevel) {
              const accessStartDate = new Date(
                enrollment.access_start_date || enrollment.created_at,
              );
              const now = new Date();
              const diffHours =
                (now.getTime() - accessStartDate.getTime()) / (1000 * 60 * 60);

              if (diffHours <= 120) {
                // Eligible for prorated upgrade! Calculate total paid for this course
                const { data: orders } = await supabase
                  .from("orders")
                  .select("amount")
                  .eq("user_id", phase2User.id)
                  .or(`course_id.eq.${targetCourseId},course_id.eq.${enrollment.course_id}`)
                  .in("status", [
                    "paid",
                    "captured",
                    "successful",
                    "authorized",
                  ]);

                let totalPaid = 0;
                if (orders) {
                  totalPaid = orders.reduce(
                    (sum, p) => sum + (Number(p.amount) || 0),
                    0,
                  );
                }

                const retailPrice = targetBundlePrice || 5000;
                verifiedAmount = Math.max(0, retailPrice - totalPaid);
              } else {
                // Outside upgrade window, ensure full price
                verifiedAmount = targetBundlePrice || 5000;
              }
            } else {
              // Cannot downgrade or buy same tier, ensure full price
              verifiedAmount = targetBundlePrice || 5000;
            }
          }
        }
      }
    }

    // Amount comes from frontend in INR, Razorpay expects Paise (INR * 100)
    const totalPaise = Math.round(verifiedAmount * 100);

    const order = await razorpay.orders.create({
      amount: totalPaise,
      currency: "INR",
      receipt: `rcpt_${courseKey.substring(0, 15)}_${Date.now()}`.substring(
        0,
        40,
      ),
    });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Error creating Razorpay order:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create order" },
      { status: 500 },
    );
  }
}
