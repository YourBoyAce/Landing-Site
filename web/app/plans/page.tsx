import { getPlans } from "@/lib/services/plan.services";
import { PricingCard } from "@/components/ui/PricingCard";
import CTA from "@/components/layout/CTA";

function formatCourseName(courseSlug?: string) {
  if (!courseSlug) return "Your Course";
  return courseSlug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams?: Promise<{ course?: string }>;
}) {
  const params = await searchParams;
  const plans = await getPlans().catch(() => []);
  const courseName = formatCourseName(params?.course);

  return (
    <main className="bg-white">
      <section className="bg-[#f3f8ff] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Choose the best Plan
          </h1>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            for Your Course
          </h1>
          <p className="mx-auto max-w-3xl text-base md:text-lg text-slate-600 leading-8">
            Select from our available plans and continue with the course that
            suits your goals. Each plan is crafted to give you the right mix of
            learning, support, and value.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
            {plans.length > 0 ? (
              plans.map((plan) => (
                <PricingCard
                  key={plan._id}
                  bundle={plan}
                  courseSlug={params?.course}
                  courseTitle={params?.course ? courseName : undefined}
                />
              ))
            ) : (
              <div className="rounded-[24px] border border-slate-200 bg-white p-12 text-center">
                <h2 className="text-2xl font-semibold text-slate-900 mb-3">
                  No bundles found
                </h2>
                <p className="text-slate-600">
                  We couldn't find any active plans right now. Please check back
                  later or contact support.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <CTA
        icon="/icons/consultation.png"
        title="Need help choosing a plan?"
        description="Our team can help you pick the right plan for your learning path. Reach out and we'll guide you through the best option."
        buttonText="Contact Us"
      />
    </main>
  );
}
