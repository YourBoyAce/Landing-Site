import React from "react";
import { Clock, LayoutList } from "lucide-react";
import { Plan } from "@/lib/types/plan";
import { StarRating } from "@/components/ui/StarRating";
import { PlanFeatureList } from "@/components/ui/PlanFeatureList";
import { getPlanDisplayName } from "@/lib/plan-display";

interface PlanDetailCardProps {
  plan: Plan;
}

/**
 * Left column of the plan detail page.
 * Displays all plan metadata and features.
 * Server-renderable — no client-side state.
 */
export function PlanDetailCard({ plan }: PlanDetailCardProps) {
  const batchLabel = "Recorded Video Access";
  const displayName = getPlanDisplayName(plan);

  return (
    <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 md:p-10 flex flex-col gap-6">
      {/* Badge */}
      <div>
        <span className="inline-block bg-[#EAF4FD] text-[#0166A7] text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
          {displayName}
        </span>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight">
          {displayName}
        </h1>
        <p className="text-sm text-slate-500 mt-1">By Auto-Mate</p>
      </div>

      {/* Rating */}
      {plan.rating != null && (
        <StarRating rating={plan.rating} showNumber size={18} />
      )}

      {/* Price */}
      {plan.price != null ? (
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-black text-slate-900">
            ₹{plan.price.toLocaleString("en-IN")}
          </span>
          <span className="text-slate-500 text-sm font-medium">/ one-time</span>
        </div>
      ) : (
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-[#0166A7]">Contact Us</span>
          <span className="text-slate-500 text-sm font-medium">for pricing</span>
        </div>
      )}

      <div className="h-px bg-slate-100 w-full" />

      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-600">
        {plan.duration && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>{plan.duration}</span>
          </div>
        )}
        {batchLabel && (
          <div className="flex items-center gap-2">
            <LayoutList className="w-4 h-4 text-slate-400" />
            <span>{batchLabel}</span>
          </div>
        )}
      </div>

      <div className="h-px bg-slate-100 w-full" />

      {/* Features */}
      {plan.features && plan.features.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
            What&apos;s included
          </h2>
          <PlanFeatureList features={plan.features} />
        </div>
      )}
    </div>
  );
}
