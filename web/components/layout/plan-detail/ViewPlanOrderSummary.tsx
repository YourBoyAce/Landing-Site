"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Clock, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plan } from "@/lib/types/plan";
import { getPlanDisplayName } from "@/lib/plan-display";
import { getCart, CartItem } from "@/lib/services/cart";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

interface ViewPlanOrderSummaryProps {
  plan: Plan;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
}

/**
 * Right column for Starter / Pro plan detail pages.
 * Shows a mini order summary and redirects to the existing /payment page.
 * All course access is self-paced and recorded-video based.
 */
export function ViewPlanOrderSummary({
  plan,
  courseId,
  courseSlug,
  courseTitle,
}: ViewPlanOrderSummaryProps) {
  const router = useRouter();
  const displayName = getPlanDisplayName(plan);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const { isLoggedIn, openAuth, enrolledCourseIds, enrolledPlanKeys, enrolledCourseMap } = useAuth();

  const STARTER_BUNDLE_UUID = "350edd44-752b-454a-8bf3-0ffb1915fd78".toLowerCase();
  const PRO_BUNDLE_UUID = "196003df-766a-44a8-8c5c-ab0f6568431b".toLowerCase();
  const PREMIUM_BUNDLE_UUID = "38518a2c-79c7-4776-8198-ab4a3889d24f".toLowerCase();

  const getPlanTierLevel = (identifier?: string | null): number => {
    if (!identifier) return 0;
    const lower = identifier.toLowerCase().trim();
    if (
      lower === PRO_BUNDLE_UUID ||
      lower === "pro" ||
      lower.startsWith("pro ") ||
      lower.endsWith(" pro") ||
      lower.includes("pro plan") ||
      lower === "pro-plan"
    ) {
      return 2;
    }
    if (
      lower === PREMIUM_BUNDLE_UUID ||
      lower === "premium" ||
      lower.startsWith("premium ") ||
      lower.endsWith(" premium") ||
      lower.includes("premium plan") ||
      lower.includes("live sessions")
    ) {
      return 3;
    }
    if (
      lower === STARTER_BUNDLE_UUID ||
      lower === "starter" ||
      lower.startsWith("starter ") ||
      lower.endsWith(" starter") ||
      lower.includes("starter plan") ||
      lower === "starter-plan"
    ) {
      return 1;
    }
    return 0;
  };

  const badgeSlug = (plan.badge || "").toLowerCase();
  let finalBundleUuid = plan.bundleUuid;
  if (!finalBundleUuid) {
    if (badgeSlug === "starter") finalBundleUuid = STARTER_BUNDLE_UUID;
    else if (badgeSlug === "pro") finalBundleUuid = PRO_BUNDLE_UUID;
    else if (badgeSlug === "premium") finalBundleUuid = PREMIUM_BUNDLE_UUID;
    else finalBundleUuid = plan._id;
  }

  const candidateCourseIds = [courseId, courseSlug].filter(Boolean);
  const isEnrolledInCourse = candidateCourseIds.some((id) => enrolledCourseIds?.has(id));
  const resolvedCourseId = candidateCourseIds.find((id) => enrolledCourseIds?.has(id)) || courseId;

  const userPlanKeysForCourse = Array.from(enrolledPlanKeys || [])
    .filter((key) => candidateCourseIds.some((id) => key.startsWith(`${id}::`)))
    .map((key) => {
      const matchId = candidateCourseIds.find((id) => key.startsWith(`${id}::`));
      return matchId ? key.slice(`${matchId}::`.length) : "";
    })
    .filter(Boolean);

  const hasSpecificPlan = userPlanKeysForCourse.length > 0;

  let userEnrolledTier = 0;
  if (hasSpecificPlan) {
    userEnrolledTier = userPlanKeysForCourse.reduce((max, key) => {
      const tier = getPlanTierLevel(key);
      return tier > max ? tier : max;
    }, 0);
  }
  if (userEnrolledTier === 0 && isEnrolledInCourse) {
    userEnrolledTier = 1;
  }

  const thisPlanTier = getPlanTierLevel(badgeSlug) || getPlanTierLevel(finalBundleUuid) || 1;

  const isEnrolledInThisPlan = hasSpecificPlan
    ? candidateCourseIds.some((id) => enrolledPlanKeys?.has(`${id}::${finalBundleUuid}`)) ||
      userPlanKeysForCourse.some((k) => getPlanTierLevel(k) === thisPlanTier)
    : (isEnrolledInCourse && thisPlanTier === 1);

  const isLowerTierDisabled = isEnrolledInCourse && !isEnrolledInThisPlan && thisPlanTier < userEnrolledTier;
  const isUpgrade = isEnrolledInCourse && !isEnrolledInThisPlan && thisPlanTier > userEnrolledTier;

  React.useEffect(() => {
    const loadCart = () => setCartItems(getCart());

    loadCart();
    window.addEventListener("cart-updated", loadCart);
    window.addEventListener("storage", loadCart);
    return () => {
      window.removeEventListener("cart-updated", loadCart);
      window.removeEventListener("storage", loadCart);
    };
  }, []);

  const anotherPlanInCart = cartItems.some(
    (item) => item.courseId === courseId && item.selectedPlanId !== plan._id,
  );

  const handleProceed = () => {
    const params = new URLSearchParams();
    params.set("course", courseSlug);
    if (courseId) params.set("courseId", courseId);
    if (courseTitle) params.set("courseTitle", courseTitle);
    params.set("bundleId", plan._id);
    params.set("bundleTitle", displayName);
    params.set("amount", (plan.price ?? 0).toString());
    const paymentUrl = `/payment?${params.toString()}`;

    if (!isLoggedIn) {
      openAuth({ type: "buyNow", payload: paymentUrl });
      return;
    }

    router.push(paymentUrl);
  };

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-[#0A3D62] px-6 py-5 text-white text-center">
        <p className="text-blue-200 text-xs font-bold uppercase tracking-[0.2em]">
          Order Summary
        </p>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {/* Course + plan row */}
        <div className="flex justify-between items-start gap-4 border-b border-slate-50 pb-6">
          <div className="space-y-1">
            <h3 className="font-bold text-[#0A3D62] text-lg leading-tight">
              {courseTitle}
            </h3>
            <p className="text-sm text-slate-500">{displayName}</p>
          </div>
          <span className="font-bold text-xl text-[#0A3D62] whitespace-nowrap">
            {plan.price != null ? `₹${plan.price.toLocaleString("en-IN")}` : "Contact Us"}
          </span>
        </div>

        {/* Pricing rows */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span className="font-medium text-gray-900">
              {plan.price != null ? `₹${plan.price.toLocaleString("en-IN")}` : "—"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tax / Processing</span>
            <span className="text-green-600 font-bold uppercase text-[10px] bg-green-50 px-2 py-0.5 rounded">
              Free
            </span>
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-dashed border-gray-200">
            <span className="font-bold text-[#0A3D62]">Grand Total</span>
            <div className="text-right">
              <span className="block font-black text-3xl text-[#1E90FF]">
                {plan.price != null ? `₹${plan.price.toLocaleString("en-IN")}` : "Contact Us"}
              </span>
              <span className="text-[10px] text-gray-400 font-medium italic">
                Inclusive of all taxes
              </span>
            </div>
          </div>
        </div>

        {/* CTA */}
        {isEnrolledInThisPlan ? (
          <Button
            className="w-full bg-[#16a34a] hover:bg-[#15803d] h-14 rounded-full text-sm font-bold text-white transition-all duration-300 shadow-xl cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              const baseUrl = process.env.NEXT_PUBLIC_LEARNING_PORTAL_URL || '';
              const targetMaincourseId =
                candidateCourseIds.map((id) => enrolledCourseMap?.[id]).find(Boolean) ||
                enrolledCourseMap?.[resolvedCourseId] ||
                (resolvedCourseId && enrolledCourseIds?.has(resolvedCourseId) ? resolvedCourseId : null);
              const nextUrl = targetMaincourseId ? `/courses/${targetMaincourseId}` : '/courses';
              window.location.href = `${baseUrl}/login?next=${encodeURIComponent(nextUrl)}`;
            }}
          >
            Go to Course
          </Button>
        ) : isLowerTierDisabled ? (
          <Button
            disabled
            className="w-full bg-slate-100 text-slate-400 h-14 rounded-full text-sm font-bold border border-slate-200 cursor-not-allowed flex items-center justify-center gap-2 pointer-events-none"
            title="You already own a higher plan for this course"
          >
            <CircleSlash className="w-4 h-4" /> Disabled
          </Button>
        ) : anotherPlanInCart ? (
          <Button
            asChild
            className="w-full bg-[#1B262C] hover:bg-gray-600 h-14 rounded-full text-sm font-bold transition-all duration-300 shadow-xl active:scale-95"
          >
            <Link href="/cart">Review Cart</Link>
          </Button>
        ) : isUpgrade ? (
          <Button
            onClick={handleProceed}
            className="w-full bg-[#0166A7] hover:bg-[#014f82] h-14 rounded-full text-sm font-bold text-white transition-all duration-300 shadow-xl active:scale-95"
          >
            <CreditCard className="w-5 h-5 mr-2" />
            Upgrade Now
          </Button>
        ) : (
          <Button
            onClick={handleProceed}
            className="w-full bg-[#1B262C] hover:bg-gray-600 h-14 rounded-full text-sm font-bold transition-all duration-300 shadow-xl active:scale-95"
          >
            <CreditCard className="w-5 h-5 mr-2" />
            Buy Now
          </Button>
        )}

        <p className="text-center text-[11px] text-gray-400 uppercase tracking-wider">
          🔒 Verified &amp; Secure Checkout
        </p>
      </div>
    </div>
  );
}
