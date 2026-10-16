import { notFound, redirect } from "next/navigation";
import { getPlanByBadge } from "@/lib/services/plan.services";
import { getCoursePlans } from "@/lib/services/course.service";
import { makeAdminClient } from "@/lib/supabase/server";
import { PlanDetailCard } from "@/components/layout/plan-detail/PlanDetailCard";
import { ViewPlanOrderSummary } from "@/components/layout/plan-detail/ViewPlanOrderSummary";
import { PremiumContactForm } from "@/components/layout/plan-detail/PremiumContactForm";
import { getPlanDisplayName } from "@/lib/plan-display";

interface Props {
  params: Promise<{ slug: string; planSlug: string }>;
}

/**
 * Generic plan detail page.
 * Route: /courses/[slug]/plans/[planSlug]
 *
 * planSlug is the lowercased badge value: starter | pro | premium
 *
 * - Starter / Pro  → left: plan details  |  right: order summary → existing /payment
 * - Premium        → left: plan details  |  right: WhatsApp contact form
 */
export default async function PlanDetailPage({ params }: Props) {
  const { slug: courseSlug, planSlug } = await params;

  // Fetch course and plan in parallel
  const [courseData, plan] = await Promise.all([
    getCoursePlans(courseSlug).catch(() => null),
    getPlanByBadge(planSlug).catch(() => null),
  ]);

  if (!courseData || !plan) return notFound();

  // Verify that the product exists in public.products
  const rawProductId =
    courseData.productUuid || (courseData as any).productId;
  let productExistsInPortal = false;
  if (rawProductId && typeof rawProductId === "string" && rawProductId.trim().length > 0) {
    try {
      const supabase = makeAdminClient();
      const { data: productRow } = await supabase
        .from("products")
        .select("id, is_active")
        .eq("id", String(rawProductId).trim())
        .maybeSingle();

      if (productRow && productRow.is_active !== false) {
        productExistsInPortal = true;
      }
    } catch (e) {
      console.error("[PlanDetailPage] Failed to verify product in Supabase:", e);
    }
  }

  if (!productExistsInPortal) {
    redirect(`/courses/${courseSlug}/plans`);
  }

  const isPremium = plan.badge.toLowerCase() === "premium";
  const displayName = getPlanDisplayName(plan);

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Breadcrumb / header strip */}
      <section className="bg-white border-b border-slate-100 pt-28 md:pt-32">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center gap-2 text-sm text-slate-500">
          <a
            href={`/courses/${courseSlug}`}
            className="hover:text-[#0166A7] transition-colors"
          >
            {courseData.title}
          </a>
          <span>/</span>
          <a
            href={`/courses/${courseSlug}/plans`}
            className="hover:text-[#0166A7] transition-colors"
          >
            Plans
          </a>
          <span>/</span>
          <span className="text-slate-900 font-medium">{displayName}</span>
        </div>
      </section>

      {/* Main two-column layout */}
      <section className="max-w-7xl mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 lg:gap-12 items-start">
          {/* Left column — plan details */}
          <PlanDetailCard plan={plan} />

          {/* Right column — sticky on desktop */}
          <div className="lg:sticky lg:top-28">
            {isPremium ? (
              <PremiumContactForm courseTitle={courseData.title} />
            ) : (
              <ViewPlanOrderSummary
                plan={plan}
                courseId={courseData.productUuid || courseData._id}
                courseSlug={courseSlug}
                courseTitle={courseData.title}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Pre-render the three known badge slugs so they are statically optimised.
 * The dynamic fallback still handles any future badges automatically.
 */
export function generateStaticParams() {
  return [
    { planSlug: "starter" },
    { planSlug: "pro" },
    { planSlug: "premium" },
  ];
}
