import React from "react";
import { PricingCard } from "@/components/ui/PricingCard";
import { getPlans } from "@/lib/services/plan.services";
import { Plan } from "@/lib/types/plan";

export default async function Courses() {
  const plans: Plan[] = await getPlans().catch(() => []);

  return (
    <section className="py-16 md:py-24 px-4 sm:px-6 bg-slate-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-center text-slate-900 mb-12">
          Our Featured <span className="text-[#0166A7] italic">Plans</span>
        </h2>

        {plans.length > 0 ? (
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
            {plans.map((plan) => (
              <PricingCard
                key={plan._id}
                bundle={plan}
                buttonLabel="View Courses"
                buttonHref={`/plan/${encodeURIComponent(plan._id)}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 text-lg py-12">
            Plans coming soon — stay tuned!
          </p>
        )}
      </div>
    </section>
  );
}
