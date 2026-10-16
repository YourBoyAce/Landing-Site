import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const {
      email,
      productUuid: providedProductUuid,
      courseId: providedCourseId,
      targetBundleTitle,
      targetBundlePrice,
    } = await req.json();

    const targetCourseFilter = providedCourseId || providedProductUuid;

    if (!email || !targetBundleTitle || targetBundlePrice === undefined) {
      return NextResponse.json(
        {
          error:
            "Email, targetBundleTitle, and targetBundlePrice are required.",
        },
        { status: 400 },
      );
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "phase2" },
    });

    const fullPrice = targetBundlePrice;

    // Helper to determine hierarchy
    const getTierLevel = (name: string) => {
      const lower = name.toLowerCase();
      if (lower.includes("premium") || lower.includes("live sessions"))
        return 3;
      if (lower.includes("pro")) return 2;
      return 1; // Default to Starter
    };

    // 1. Find user by email
    const supabasePublic = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
    const { data: profile } = await supabasePublic
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (!profile)
      return NextResponse.json({ eligible: false, price: fullPrice });

    // 2. Find phase2 user_id
    const { data: phase2User } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", profile.id)
      .maybeSingle();

    if (!phase2User)
      return NextResponse.json({ eligible: false, price: fullPrice });

    // 3. Find active enrollment for this course
    let enrollmentQuery = supabase
      .from("enrollments")
      .select("*, bundles(bundle_name)")
      .eq("user_id", phase2User.id)
      .eq("status", "active");

    if (targetCourseFilter) {
      enrollmentQuery = enrollmentQuery.or(
        `course_id.eq.${targetCourseFilter},product_id.eq.${targetCourseFilter}`,
      );
    }

    const { data: enrollments, error: enrollmentsError } =
      await enrollmentQuery;

    if (!enrollments || enrollments.length === 0)
      return NextResponse.json({ eligible: false, price: fullPrice });

    // Filter enrollments eligible for upgrade
    const targetLevel = getTierLevel(targetBundleTitle);
    
    const eligibleEnrollments = enrollments.filter((e) => {
      const bName = (e.bundles as any)?.bundle_name || "Starter";
      return getTierLevel(bName) < targetLevel;
    });

    if (eligibleEnrollments.length === 0) {
      return NextResponse.json({
        eligible: false,
        price: fullPrice,
        message: "No eligible enrollment found to upgrade from.",
      });
    }

    // Fetch canonical course titles from public.maincourses
    const courseIds = [...new Set(eligibleEnrollments.map((e) => e.course_id).filter(Boolean))];
    const { data: coursesData } = await supabasePublic
      .from("maincourses")
      .select("id, title")
      .in("id", courseIds);

    const courseTitleMap = new Map<string, string>(
      (coursesData || []).map((c) => [c.id, c.title])
    );

    const eligibleCoursesData = [];
    let earliestAccessDate = new Date();
    let maxDiffHours = 0;
    
    for (const enrollment of eligibleEnrollments) {
      const resolvedCourseId = enrollment.course_id;
      const resolvedBatchType = enrollment.batch_type || "recorded";
      const resolvedCourseTitle = courseTitleMap.get(resolvedCourseId) || "Your Course";

      const accessStartDate = new Date(enrollment.access_start_date || enrollment.created_at);
      const diffHours = (new Date().getTime() - accessStartDate.getTime()) / (1000 * 60 * 60);
      if (diffHours > maxDiffHours) maxDiffHours = diffHours;
      if (accessStartDate < earliestAccessDate) earliestAccessDate = accessStartDate;

      // Only allow if within 120 hours
      if (diffHours <= 120) {
        const { data: orders } = await supabase
          .from("orders")
          .select("amount, created_at")
          .eq("user_id", phase2User.id)
          .eq("course_id", resolvedCourseId)
          .in("status", ["paid", "captured", "successful", "authorized"]);

        let totalPaid = 0;
        if (orders && orders.length > 0) {
          totalPaid = orders.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        }

        const upgradePrice = Math.max(0, targetBundlePrice - totalPaid);
        
        eligibleCoursesData.push({
          courseId: resolvedCourseId,
          courseTitle: resolvedCourseTitle,
          upgradePrice,
          enrollmentId: enrollment.id,
          resolvedBatchType,
          resolvedCourseId,
        });
      }
    }

    if (eligibleCoursesData.length === 0) {
      return NextResponse.json({
        eligible: false,
        price: fullPrice,
        message: "Outside upgrade window.",
      });
    }

    // Determine the primary course for default return values
    const primaryCourse =
      eligibleCoursesData.find((c) => c.courseId === targetCourseFilter) ||
      eligibleCoursesData[0];

    return NextResponse.json({
      eligible: true,
      price: primaryCourse.upgradePrice,
      timeRemainingHours: Math.max(0, 120 - maxDiffHours),
      resolvedProductUuid: primaryCourse.courseId,
      resolvedCourseId: primaryCourse.courseId,
      resolvedCourseTitle: primaryCourse.courseTitle,
      resolvedBatchType: primaryCourse.resolvedBatchType,
      eligibleCourses: eligibleCoursesData,
    });
  } catch (error: any) {
    console.error("Error in check-upgrade:", error);
    return NextResponse.json(
      { error: "Failed to check upgrade eligibility" },
      { status: 500 },
    );
  }
}
