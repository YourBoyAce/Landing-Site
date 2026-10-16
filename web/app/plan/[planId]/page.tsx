import { notFound } from "next/navigation";
import { getPlans } from "@/lib/services/plan.services";
import { Plan } from "@/lib/types/plan";
import { getPlanDisplayName } from "@/lib/plan-display";
import { PlanDetailCard } from "@/components/layout/plan-detail/PlanDetailCard";
import { ViewPlanOrderSummary } from "@/components/layout/plan-detail/ViewPlanOrderSummary";
import { PremiumContactForm } from "@/components/layout/plan-detail/PremiumContactForm";
import Link from "next/link";

interface PlanPageProps {
  params: Promise<{
    planId: string;
  }>;
}

export default async function PlanPage({ params }: PlanPageProps) {
  const { planId: planParam } = await params;

  const plans: Plan[] = await getPlans().catch(() => []);
  const normalizedPlanParam = planParam?.toLowerCase() ?? "";

  const plan = plans.find((p) => {
    const titleSlug = p.title
      ? p.title.toLowerCase().replace(/\s+/g, "-")
      : "";

    return (
      p._id === planParam ||
      titleSlug === normalizedPlanParam ||
      p.badge.toLowerCase() === normalizedPlanParam
    );
  });

  if (!plan) return notFound();

  const displayName = getPlanDisplayName(plan);
  const isPremium = plan.badge.toLowerCase() === "premium";

  // For the generic /plan page we don't have a specific course context.
  // Pass generic placeholder IDs so the cart/payment summary still renders.
  const genericCourseId = plan.bundleUuid ?? plan._id;
  const genericCourseSlug = "";
  const genericCourseTitle = "Auto-Mate Course";

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Breadcrumb / header strip */}
      <section className="bg-white border-b border-slate-100 pt-28 md:pt-32">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/plans" className="hover:text-[#0166A7] transition-colors">
            Plans
          </Link>
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
              <PremiumContactForm courseTitle={genericCourseTitle} />
            ) : (
              <ViewPlanOrderSummary
                plan={plan}
                courseId={genericCourseId}
                courseSlug={genericCourseSlug}
                courseTitle={genericCourseTitle}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
