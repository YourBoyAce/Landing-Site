"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OrderSummary from "./OrderSummary";
import { getCart, CartItem, clearCart } from "@/lib/services/cart";
import { getPlanDisplayNameFromTitle } from "@/lib/plan-display";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  courseSlug: string;
  courseTitle: string;
  productUuid?: string;
  bundleId: string;
  bundleTitle: string;
  bundlePrice: number;
  batch: string;
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  /** True when arriving from /cart with multiple items in localStorage */
  fromCart?: boolean;
}

/**
 * Client component — owns mutable form state only.
 * Course + plan are already resolved server-side and shown as read-only.
 * No dropdowns, no STATIC_COURSES, no client-side fetches.
 */

// ── Collapsed dropdown checklist ──────────────────────────────────────────────

export interface UpgradeEligibleCourse {
  courseId:     string;
  courseTitle:  string;
  enrollmentId: string;
  upgradePrice: number;
}

function CourseDropdown({
  courses, selected, onToggle, onSelectAll, onClearAll, disabled,
}: {
  courses:     UpgradeEligibleCourse[];
  selected:    Set<string>;
  onToggle:    (id: string) => void;
  onSelectAll: () => void;
  onClearAll:  () => void;
  disabled:    boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-upgrade-dropdown]")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label =
    selected.size === 0 ? "Choose courses to upgrade…"
    : selected.size === 1 ? (courses.find((c) => selected.has(c.courseId))?.courseTitle ?? "1 course selected")
    : `${selected.size} courses selected`;

  return (
    <div className="relative mb-6" data-upgrade-dropdown>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E90FF]/40",
          selected.size === 0 ? "border-slate-200 bg-slate-50 text-slate-400" : "border-[#1E90FF]/40 bg-blue-50/40 text-slate-900",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[#1E90FF]/60",
        ].join(" ")}
      >
        <span className="truncate font-medium">{label}</span>
        {open ? <ChevronUp className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
               : <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />}
      </button>

      {open && (
        <div role="listbox" aria-multiselectable="true"
          className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/80 px-4 py-2.5">
            <span className="text-xs font-semibold text-slate-500">
              {courses.length} course{courses.length !== 1 ? "s" : ""} eligible
            </span>
            <div className="flex gap-3">
              <button type="button" onClick={onSelectAll} className="text-xs font-medium text-[#1E90FF] hover:underline">Select all</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={onClearAll} className="text-xs font-medium text-slate-400 hover:underline">Clear</button>
            </div>
          </div>
          <ul className="max-h-60 divide-y divide-slate-50 overflow-y-auto">
            {courses.map((course) => {
              const checked = selected.has(course.courseId);
              return (
                <li key={course.courseId} role="option" aria-selected={checked}>
                  <label className={["flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors", checked ? "bg-blue-50/60" : "hover:bg-slate-50/60"].join(" ")}>
                    <input type="checkbox" checked={checked} onChange={() => onToggle(course.courseId)}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-[#1E90FF]"
                      aria-label={`Select ${course.courseTitle} for Pro upgrade`} />
                    <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{course.courseTitle}</p>
                        <p className="text-xs text-slate-400">Current plan: Starter</p>
                      </div>
                      <span className={["shrink-0 text-xs font-bold", checked ? "text-[#1E90FF]" : "text-slate-400"].join(" ")}>
                        ₹{course.upgradePrice.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-slate-100 px-4 py-2 text-right">
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-slate-500 hover:underline">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PaymentPageClient({
  courseSlug,
  courseTitle,
  productUuid,
  bundleTitle,
  bundlePrice,
  batch: initialBatch,
  initialName,
  initialEmail,
  initialPhone,
  fromCart = false,
}: Props) {
  const [batch, setBatch] = useState(initialBatch || "recorded");
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [comments, setComments] = useState("");
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
  }>({});

  // Cart items — populated on mount when coming from /cart with multiple items
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const { user } = useAuth();

  const hasInitializedNameRef = useRef(Boolean(initialName));
  const hasInitializedEmailRef = useRef(Boolean(initialEmail));

  useEffect(() => {
    if (user?.email && !hasInitializedEmailRef.current) {
      setEmail(user.email);
      hasInitializedEmailRef.current = true;
    }
    if (user?.name && !hasInitializedNameRef.current) {
      setName(user.name);
      hasInitializedNameRef.current = true;
    }
  }, [user]);

  useEffect(() => {
    if (fromCart) {
      const items = getCart();
      setCartItems(items);
    }
  }, [fromCart]);

  // For single-course checkout the total is bundlePrice (possibly pro-rated).
  const validateForm = () => {
    const newErrors: { name?: string; email?: string; phone?: string } = {};

    if (!name.trim()) {
      newErrors.name = "Please fill in your full name";
    }

    if (!email.trim()) {
      newErrors.email = "Please fill in your email address";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!phone.trim()) {
      newErrors.phone = "Please fill in your WhatsApp number";
    } else if (phone.trim().length < 10) {
      newErrors.phone = "Please enter a valid 10-digit WhatsApp number";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstKey = Object.keys(newErrors)[0];
      const elem = document.getElementById(firstKey);
      elem?.focus();
      elem?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }

    return true;
  };
  const cartTotal = cartItems.reduce((s, i) => s + i.selectedPlanPrice, 0);

  const [finalPrice, setFinalPrice] = useState(bundlePrice);
  const [isUpgradeEligible, setIsUpgradeEligible] = useState(false);
  const [eligibleCourses, setEligibleCourses] = useState<UpgradeEligibleCourse[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isCheckingUpgrade, setIsCheckingUpgrade] = useState(false);

  const [resolvedProductUuid, setResolvedProductUuid] = useState(productUuid);
  const [resolvedCourseTitle, setResolvedCourseTitle] = useState(courseTitle);
  const [isPhoneAutofilled, setIsPhoneAutofilled] = useState(!!initialPhone);

  useEffect(() => {
    if (isUpgradeEligible && eligibleCourses.length > 0) {
      const newPrice = eligibleCourses
        .filter((c) => selectedCourses.has(c.courseId))
        .reduce((sum, c) => sum + c.upgradePrice, 0);
      setFinalPrice(newPrice);
    }
  }, [selectedCourses, isUpgradeEligible, eligibleCourses]);

  useEffect(() => {
    // Skip upgrade check entirely for cart checkouts
    if (fromCart) return;

    // Only check if it's a valid looking email and they are trying to buy Pro/Live Sessions
    const isProPlan =
      bundleTitle.toLowerCase().includes("pro") ||
      bundleTitle.toLowerCase().includes("premium") ||
      bundleTitle.toLowerCase().includes("live sessions");
    if (!email || !email.includes("@") || !isProPlan) {
      setFinalPrice(bundlePrice);
      setIsUpgradeEligible(false);
      setTimeRemaining(null);
      return;
    }

    const checkUpgrade = async () => {
      setIsCheckingUpgrade(true);
      try {
        const response = await fetch("/api/razorpay/check-upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            productUuid,
            targetBundleTitle: bundleTitle,
            targetBundlePrice: bundlePrice,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.eligible && data.price !== undefined) {
            if (data.eligibleCourses && data.eligibleCourses.length > 0) {
              setEligibleCourses(data.eligibleCourses);
              const initialSelected = new Set([data.resolvedProductUuid]);
              setSelectedCourses(initialSelected);
              const initialPrice = data.eligibleCourses
                .filter((c: any) => initialSelected.has(c.courseId))
                .reduce((s: number, c: any) => s + c.upgradePrice, 0);
              setFinalPrice(initialPrice);
            } else {
              setFinalPrice(data.price);
            }
            setIsUpgradeEligible(true);
            setTimeRemaining(Math.round(data.timeRemainingHours || 120));
            if (data.resolvedProductUuid)
              setResolvedProductUuid(data.resolvedProductUuid);
            if (data.resolvedCourseTitle)
              setResolvedCourseTitle(data.resolvedCourseTitle);
            if (data.resolvedBatchType) setBatch(data.resolvedBatchType);
            if (data.resolvedPhone && !phone) {
              setPhone(data.resolvedPhone);
              setIsPhoneAutofilled(true);
            }
          } else {
            setFinalPrice(bundlePrice);
            setIsUpgradeEligible(false);
            setEligibleCourses([]);
            setSelectedCourses(new Set());
            setTimeRemaining(null);
          }
        }
      } catch (error) {
        console.error("Upgrade check failed:", error);
      } finally {
        setIsCheckingUpgrade(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      checkUpgrade();
    }, 800);

    return () => clearTimeout(delayDebounce);
  }, [email, bundleTitle, bundlePrice, productUuid, phone]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 md:pt-32 md:pb-24">
      {/* Page heading */}
      <div className="mb-12 text-center lg:text-left">
        <h1
          className="text-3xl sm:text-4xl md:text-6xl font-bold bg-clip-text text-transparent
                       bg-gradient-to-r from-[#0A3D62] via-[#1E90FF] to-[#0A3D62] leading-tight pb-2"
        >
          Secure Checkout
        </h1>
        <p className="text-slate-500 text-sm md:text-base max-w-2xl lg:mx-0 mx-auto">
          Complete the form below to finalise your enrolment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* ── Left column: forms ── */}
        <div className="lg:col-span-7 order-1 space-y-6 md:space-y-10">
          {/* ── Enrolment summary (read-only) ── */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 md:p-8 rounded-[24px] shadow-sm border border-gray-200"
          >
            <div className="flex items-center gap-3 pb-4 mb-6 border-b border-gray-100">
              <div className="p-2 bg-blue-50 rounded-lg text-[#1E90FF]">
                <BookOpen className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-[#0A3D62]">
                Your Selection
              </h2>
            </div>

            {isUpgradeEligible && eligibleCourses.length > 0 && (
              <CourseDropdown
                courses={eligibleCourses}
                selected={selectedCourses}
                onToggle={(id) => {
                  const next = new Set(selectedCourses);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  setSelectedCourses(next);
                }}
                onSelectAll={() => setSelectedCourses(new Set(eligibleCourses.map((c) => c.courseId)))}
                onClearAll={() => setSelectedCourses(new Set())}
                disabled={isCheckingUpgrade}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {fromCart && cartItems.length > 0 ? (
                /* ── Cart mode: show each course + plan as its own row ── */
                <div className="sm:col-span-2 space-y-3">
                  {cartItems.map((item) => (
                    <div
                      key={`${item.courseId}-${item.selectedPlanId}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {item.courseTitle}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {getPlanDisplayNameFromTitle(item.selectedPlanTitle)}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-[#0A3D62] whitespace-nowrap ml-4">
                        ₹{item.selectedPlanPrice.toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                /* ── Single-course mode: original layout ── */
                <>
                  {(!isUpgradeEligible || eligibleCourses.length === 0) && (
                    <>
                      {/* Course — read-only */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-gray-700">
                          Course
                        </Label>
                        <div className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 flex items-center text-slate-700 font-medium text-sm">
                          {resolvedCourseTitle || courseTitle || "Your Course"}
                        </div>
                      </div>

                      {/* Plan — read-only */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-gray-700">
                          Plan
                        </Label>
                        <div className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 flex items-center text-slate-700 font-medium text-sm">
                          {bundleTitle}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Amount — read-only */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-gray-700">
                      Amount
                    </Label>
                    <div
                      className={`h-12 rounded-xl border flex items-center px-4 font-bold text-sm transition-colors ${isUpgradeEligible ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-slate-50 border-[#1E90FF] text-[#0A3D62]"}`}
                    >
                      {isCheckingUpgrade ? (
                        <span className="text-xs font-normal text-slate-500 animate-pulse">
                          Calculating...
                        </span>
                      ) : (
                        <>
                          ₹{finalPrice.toLocaleString("en-IN")}
                          {isUpgradeEligible && (
                            <span className="ml-2 text-xs font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                              Pro-rated
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.section>

          {/* ── Personal details ── */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 md:p-8 rounded-[24px] shadow-sm border border-gray-200"
          >
            <div className="flex items-center gap-3 pb-4 mb-6 border-b border-gray-100">
              <div className="p-2 bg-blue-50 rounded-lg text-[#1E90FF]">
                <User className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-[#0A3D62]">
                Personal Details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="name"
                  className="text-sm font-semibold text-gray-700"
                >
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className={`h-12 rounded-xl transition-all ${
                    errors.name
                      ? "border-red-500 focus-visible:ring-red-500 ring-1 ring-red-500 bg-red-50/20"
                      : ""
                  }`}
                />
                {errors.name && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm font-semibold text-gray-700"
                >
                  Email Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={email}
                  disabled
                  className="h-12 rounded-xl bg-slate-50 cursor-not-allowed text-slate-500 border-slate-200"
                />
                {errors.email && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.email}</p>
                )}
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label
                  htmlFor="phone"
                  className="text-sm font-semibold text-gray-700"
                >
                  WhatsApp Number <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className={`font-medium text-sm ${errors.phone ? "text-red-500" : "text-slate-500"}`}>
                      +91
                    </span>
                  </div>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 10) setPhone(val);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    disabled={isUpgradeEligible && isPhoneAutofilled}
                    className={`h-12 rounded-xl pl-12 transition-all ${
                      errors.phone
                        ? "border-red-500 focus-visible:ring-red-500 ring-1 ring-red-500 bg-red-50/20"
                        : ""
                    } ${isUpgradeEligible && isPhoneAutofilled ? "bg-slate-50 cursor-not-allowed text-slate-500" : ""}`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.phone}</p>
                )}
              </div>
            </div>
          </motion.section>
        </div>

        {/* ── Right column: order summary + pay button ── */}
        <div className="lg:col-span-5 order-2 lg:sticky lg:top-28">
          <OrderSummary
            courseName={resolvedCourseTitle || courseTitle}
            courseKey={courseSlug}
            productUuid={
              (isUpgradeEligible && eligibleCourses.length > 1) 
                ? undefined 
                : (resolvedProductUuid || productUuid)
            }
            bundleTitle={bundleTitle}
            customAmount={
              (fromCart && cartItems.length > 0) || (isUpgradeEligible && eligibleCourses.length > 0)
                ? finalPrice
                : finalPrice
            }
            targetBundlePrice={bundlePrice}
            batch={batch}
            userData={{ name, email, phone, comments }}
            onValidate={validateForm}
            cartItems={
              fromCart && cartItems.length > 0
                ? cartItems
                : isUpgradeEligible && eligibleCourses.length > 0
                  ? eligibleCourses.filter(c => selectedCourses.has(c.courseId)).map(c => ({
                      courseId: c.courseId,
                      courseSlug: c.courseId, // if needed
                      courseTitle: c.courseTitle,
                      selectedPlanId: bundleTitle,
                      selectedPlanTitle: bundleTitle,
                      selectedPlanPrice: c.upgradePrice
                    })) as CartItem[]
                  : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
