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

const isValidUuid = (val: any) =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

function normalize(str: string | null | undefined): string {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

  // Verify that the course exists in public.maincourses (Automate Learning Portal)
  const rawId = courseData.productUuid || (courseData as any).productId;
  let courseExistsInPortal = false;
  let resolvedCourseId: string = courseData.productUuid || courseData._id;
  let resolvedCourseTitle: string = courseData.title;

  try {
    const supabase = makeAdminClient();
    const { data: allCourses } = await supabase
      .from("maincourses")
      .select("id, title");

    if (allCourses && allCourses.length > 0) {
      if (rawId && isValidUuid(rawId)) {
        const directMatch = allCourses.find(
          (c) => c.id.toLowerCase() === String(rawId).trim().toLowerCase()
        );
        if (directMatch) {
          courseExistsInPortal = true;
          resolvedCourseId = directMatch.id;
          resolvedCourseTitle = directMatch.title || courseData.title;
        }
      }

      if (!courseExistsInPortal && (courseData.title || courseSlug)) {
        const normTitle = normalize(courseData.title);
        const normSlug = normalize(courseSlug);

        for (const c of allCourses) {
          const normC = normalize(c.title);
          if (
            normC &&
            (normTitle.includes(normC) ||
              normC.includes(normTitle) ||
              normSlug.includes(normC) ||
              normC.includes(normSlug))
          ) {
            courseExistsInPortal = true;
            resolvedCourseId = c.id;
            resolvedCourseTitle = c.title || courseData.title;
            break;
          }
        }
      }
    }
  } catch (e) {
    console.error("[PlanDetailPage] Failed to verify course in Supabase:", e);
  }

  if (!courseExistsInPortal) {
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
            {resolvedCourseTitle || courseData.title}
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
              <PremiumContactForm courseTitle={resolvedCourseTitle || courseData.title} />
            ) : (
              <ViewPlanOrderSummary
                plan={plan}
                courseId={resolvedCourseId}
                courseSlug={courseSlug}
                courseTitle={resolvedCourseTitle || courseData.title}
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
