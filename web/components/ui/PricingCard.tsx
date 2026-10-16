"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Clock,
  LayoutList,
  Trash2,
  CircleSlash,
  ShoppingCart,
} from "lucide-react";
import { StarRating } from "@/components/ui/StarRating";
import { PlanFeatureList } from "@/components/ui/PlanFeatureList";
import { urlFor } from "@/lib/sanity.client";
import { Plan } from "@/lib/types/plan";
import { addToCart, removeFromCart, getCart } from "@/lib/services/cart";
import { getPlanDisplayName } from "@/lib/plan-display";
import { useAuth } from "@/contexts/AuthContext";

interface PricingCardProps {
  bundle: Plan;
  courseSlug?: string;
  /**
   * Sanity courseDetails._id for the course this card belongs to.
   * Required for correct cart identity. When omitted (e.g. the generic
   * /plans page), cart add/remove falls back to plan-level identity.
   */
  courseId?: string;
  /** Human-readable course name stored in the cart item. */
  courseTitle?: string;
  /** Override the primary button label (legacy prop — still respected) */
  buttonLabel?: string;
  /** Override the primary button href entirely (legacy prop — still respected) */
  buttonHref?: string;
  /** When true, shows a "Recommended" badge on the card */
  recommended?: boolean;
}

/**
 * Plan card used on the course plans grid and generic /plans page.
 *
 * - Clicking anywhere on the card navigates to the plan detail page.
 * - Buttons: [Add to Cart]  [Buy Now]
 *   • Premium plan: [View Plan] only (no cart / buy)
 *
 * Cart identity: (courseId ?? bundle._id, bundle._id) so plans are always unique.
 */
export function PricingCard({
  bundle,
  courseSlug,
  courseId,
  courseTitle,
  buttonLabel,
  buttonHref,
  recommended = false,
}: PricingCardProps) {
  const router = useRouter();
  const { isLoggedIn, openAuth, enrolledCourseIds, enrolledPlanKeys, enrolledCourseMap } = useAuth();

  const imageUrl = bundle.coverImage
    ? urlFor(bundle.coverImage).width(800).url()
    : "/placeholder.png";

  const batchLabel = bundle.batchOptions?.length
    ? bundle.batchOptions.join(" or ")
    : "Weekday or Weekend";
  const displayName = getPlanDisplayName(bundle);

  // ---------------------------------------------------------------------------
  // Navigation URLs
  // ---------------------------------------------------------------------------
  const badgeSlug = bundle.badge.toLowerCase();
  const titleSlug = bundle.title
    ? bundle.title.toLowerCase().replace(/\s+/g, "-")
    : bundle._id;

  // View-plan href: course-specific → /courses/[slug]/plans/[badgeSlug]
  //                 generic          → /plan/[titleSlug]
  const viewPlanHref = courseSlug
    ? `/courses/${courseSlug}/plans/${badgeSlug}`
    : `/plan/${titleSlug}`;

  let finalBundleUuid = bundle.bundleUuid;
  if (!finalBundleUuid) {
    if (badgeSlug === 'starter') finalBundleUuid = '350edd44-752b-454a-8bf3-0ffb1915fd78';
    else if (badgeSlug === 'pro') finalBundleUuid = '196003df-766a-44a8-8c5c-ab0f6568431b';
    else if (badgeSlug === 'premium') finalBundleUuid = '38518a2c-79c7-4776-8198-ab4a3889d24f';
    else finalBundleUuid = bundle._id;
  }

  const paymentParams = new URLSearchParams();
  // Course identifiers
  if (courseSlug) paymentParams.set("course", courseSlug);
  if (courseId) paymentParams.set("courseId", courseId);
  if (courseTitle) paymentParams.set("courseTitle", courseTitle);
  // Plan details
  paymentParams.set("bundleId", finalBundleUuid);
  paymentParams.set("bundleTitle", displayName);
  paymentParams.set("amount", (bundle.price ?? 0).toString());
  if (bundle.duration) paymentParams.set("duration", bundle.duration);
  const paymentUrl = `/payment?${paymentParams.toString()}`;
  const buyHref = buttonHref ?? paymentUrl;
  const buyLabel = buttonLabel ?? "Buy Now";

  const isPremium = badgeSlug === "premium";

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

  // ---------------------------------------------------------------------------
  // Cart & Enrollment state — keyed on (resolvedCourseId, bundle._id)
  // ---------------------------------------------------------------------------
  const candidateCourseIds = [courseId, courseSlug, bundle._id].filter(Boolean) as string[];
  const isEnrolledInCourse = candidateCourseIds.some((id) => enrolledCourseIds?.has(id));
  const resolvedCourseId = candidateCourseIds.find((id) => enrolledCourseIds?.has(id)) || courseId || bundle._id;

  // Check if they have ANY specific plan for this course (i.e. phase2 enrollment)
  const userPlanKeysForCourse = Array.from(enrolledPlanKeys || [])
    .filter((key) => candidateCourseIds.some((id) => key.startsWith(`${id}::`)))
    .map((key) => {
      const matchId = candidateCourseIds.find((id) => key.startsWith(`${id}::`));
      return matchId ? key.slice(`${matchId}::`.length) : "";
    })
    .filter(Boolean);

  const hasSpecificPlan = userPlanKeysForCourse.length > 0;

  // Determine highest tier the user owns for this course:
  // 1 = Starter, 2 = Pro, 3 = Premium
  let userEnrolledTier = 0;
  if (hasSpecificPlan) {
    userEnrolledTier = userPlanKeysForCourse.reduce((max, key) => {
      const tier = getPlanTierLevel(key);
      return tier > max ? tier : max;
    }, 0);
  }
  // If enrolled in course (legacy) without specific plan key, default to Starter (tier 1)
  if (userEnrolledTier === 0 && isEnrolledInCourse) {
    userEnrolledTier = 1;
  }

  // Tier of this card
  const thisCardTier = getPlanTierLevel(badgeSlug) || getPlanTierLevel(finalBundleUuid) || 1;

  // Determine if this exact plan is owned.
  const isEnrolledInThisPlan = hasSpecificPlan
    ? candidateCourseIds.some((id) => enrolledPlanKeys?.has(`${id}::${finalBundleUuid}`)) ||
      userPlanKeysForCourse.some((k) => getPlanTierLevel(k) === thisCardTier)
    : (isEnrolledInCourse && thisCardTier === 1);

  // If user owns a higher tier, this lower tier is disabled
  const isLowerTierDisabled = isEnrolledInCourse && !isEnrolledInThisPlan && thisCardTier < userEnrolledTier;

  // Upgrade is only available when user owns a lower tier and this card is a higher tier
  const isUpgrade = isEnrolledInCourse && !isEnrolledInThisPlan && thisCardTier > userEnrolledTier;
  
  const [addedToCart, setAddedToCart] = useState(false);
  const [isOtherPlanInCart, setIsOtherPlanInCart] = useState(false);

  useEffect(() => {
    const checkCart = () => {
      const cart = getCart();
      const thisPlanInCart = cart.some(
        (item) =>
          item.courseId === resolvedCourseId &&
          item.selectedPlanId === finalBundleUuid,
      );
      const anyPlanInCart = cart.some(
        (item) => item.courseId === resolvedCourseId,
      );
      setAddedToCart(thisPlanInCart);
      setIsOtherPlanInCart(!thisPlanInCart && anyPlanInCart);
    };

    checkCart();
    window.addEventListener("cart-updated", checkCart);
    window.addEventListener("storage", checkCart);
    return () => {
      window.removeEventListener("cart-updated", checkCart);
      window.removeEventListener("storage", checkCart);
    };
  }, [resolvedCourseId, finalBundleUuid]);

  const getCartItemPayload = () => ({
    courseId: resolvedCourseId,
    courseTitle: courseTitle ?? courseSlug ?? displayName,
    courseSlug: courseSlug ?? titleSlug,
    selectedPlanId: finalBundleUuid,
    selectedPlanTitle: displayName,
    selectedPlanPrice: bundle.price,
    thumbnailUrl: bundle.coverImage
      ? urlFor(bundle.coverImage).width(400).url()
      : null,
  });

  /** The actual cart add (called directly when logged in, or deferred after login) */
  const doAddToCart = () => {
    addToCart(getCartItemPayload());
  };

  const handleCartToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (addedToCart) {
      // Remove doesn't need auth guard
      removeFromCart(resolvedCourseId, finalBundleUuid);
      return;
    }

    if (!isLoggedIn) {
      openAuth({ type: "addToCart", payload: getCartItemPayload() });
      return;
    }

    doAddToCart();
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      openAuth({ type: "buyNow", payload: buyHref });
      return;
    }

    router.push(buyHref);
  };

  // ---------------------------------------------------------------------------
  // Whole-card click → navigate to view plan page
  // ---------------------------------------------------------------------------
  const handleCardClick = () => {
    if (isLowerTierDisabled) return;
    router.push(viewPlanHref);
  };

  /** Stop event from bubbling up to the card click handler */
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={handleCardClick}
      className={`rounded-[24px] overflow-hidden flex flex-col border transition-all duration-300 relative
        ${isLowerTierDisabled
          ? "bg-slate-50/70 border-slate-200 opacity-60 cursor-not-allowed shadow-none"
          : `bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] cursor-pointer group ${recommended ? "border-[#0166A7] ring-2 ring-[#0166A7]/30" : "border-slate-100"}`
        }`}
    >
      {/* Recommended banner */}
      {recommended && !isLowerTierDisabled && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-[#0166A7] text-white text-xs font-bold uppercase tracking-widest text-center py-1.5">
          ⭐ Recommended for this course
        </div>
      )}

      {/* Cover image + badge chip */}
      <div
        className={`h-48 md:h-56 relative overflow-hidden ${recommended && !isLowerTierDisabled ? "mt-8" : ""}`}
      >
        <Image
          src={imageUrl}
          alt={displayName}
          fill
          className={`object-cover transition-transform duration-500 ${!isLowerTierDisabled ? "group-hover:scale-105" : ""}`}
        />
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold text-slate-700 shadow-sm border border-slate-100">
          {displayName}
        </div>
      </div>

      {/* Card body */}
      <div className="p-6 md:p-8 flex flex-col flex-grow">
        {/* Rating & Price */}
        <div className="flex items-center justify-between mb-4">
          <StarRating rating={bundle.rating ?? 5} showNumber size={16} />
          <span className="font-bold text-slate-900 text-lg">
            {bundle.price != null ? `₹${bundle.price.toLocaleString("en-IN")}` : "Contact Us"}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-xl md:text-2xl font-bold mb-1 text-slate-900">
          {displayName}
        </h3>
        <p className="text-sm text-slate-500 mb-5">By Auto-Mate</p>

        {/* Metadata */}
        <div className="flex items-center gap-5 text-xs font-medium text-slate-600 mb-6">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            {bundle.duration}
          </div>
          <div className="flex items-center gap-1.5">
            <LayoutList className="w-4 h-4 text-slate-400" />
            {batchLabel}
          </div>
        </div>

        <div className="h-px bg-slate-100 w-full mb-6" />

        {/* Feature list */}
        <div className="flex-grow mb-8">
          <PlanFeatureList features={bundle.features ?? []} />
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Action buttons — stop propagation so card-click doesn't also fire  */}
        {/* ------------------------------------------------------------------ */}
        <div className="mt-auto" onClick={stopProp}>
          {isEnrolledInThisPlan ? (
            /* Enrolled in this exact plan: Go to Course */
            <Button
              className="w-full rounded-full bg-[#16a34a] text-white font-bold py-6 hover:bg-[#15803d] transition-all border-0 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
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
            /* Higher plan owned: This lower plan is disabled */
            <Button
              disabled
              className="w-full rounded-full bg-slate-100 text-slate-400 font-bold py-6 border border-slate-200 cursor-not-allowed hover:bg-slate-100 pointer-events-none flex items-center justify-center gap-2"
              title="You already own a higher plan for this course"
            >
              <CircleSlash className="w-4 h-4" /> Disabled
            </Button>
          ) : isPremium ? (
            /* Premium: View Plan only */
            <Link href={viewPlanHref} onClick={stopProp}>
              <Button
                variant="outline"
                className="w-full rounded-full border-[#0166A7] text-[#0166A7] font-bold py-6 hover:bg-[#0166A7] hover:text-white hover:border-[#0166A7] transition-all"
              >
                View Plan
              </Button>
            </Link>
          ) : isUpgrade ? (
            /* Enrolled in a lower plan: Upgrade */
            <Button
              className="w-full rounded-full bg-[#0166A7] text-white font-bold py-6 hover:bg-[#014f82] transition-all border-0"
              onClick={handleBuyNow}
            >
              Upgrade
            </Button>
          ) : (
            /* Starter / Pro: Add to Cart + Buy Now */
            <div className="flex gap-3">
              {/* Add to Cart */}
              {isOtherPlanInCart ? (
                <div
                  title="Another plan for this course is already in your cart. Remove it first to choose a different plan."
                  className="flex-1 cursor-not-allowed"
                >
                  <Button
                    variant="outline"
                    disabled
                    className="w-full rounded-full font-bold py-6 flex items-center justify-center gap-2 bg-slate-50 text-slate-400 border-slate-200 pointer-events-none"
                  >
                    <CircleSlash className="w-4 h-4" /> Unavailable
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleCartToggle}
                  className={`flex-1 rounded-full font-bold py-6 transition-all flex items-center justify-center gap-2 ${
                    addedToCart
                      ? "bg-[#0166A7] border-[#0166A7] text-white hover:bg-white hover:text-[#0166A7] hover:border-[#0166A7]"
                      : "border-slate-300 text-slate-700 hover:bg-[#0166A7] hover:text-white hover:border-[#0166A7]"
                  }`}
                >
                  {addedToCart ? (
                    <>
                      Added <Trash2 className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" /> Add to Cart
                    </>
                  )}
                </Button>
              )}

              {/* Buy Now */}
              <Button
                className="flex-1 rounded-full bg-[#0166A7] text-white font-bold py-6 hover:bg-[#014f82] transition-all border-0"
                onClick={handleBuyNow}
              >
                {buyLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
