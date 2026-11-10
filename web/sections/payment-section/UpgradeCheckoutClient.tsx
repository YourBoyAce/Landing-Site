"use client";

/**
 * UpgradeCheckoutClient.tsx
 *
 * Rendered ONLY when /payment?upgradeMode=1 with a valid handoff token.
 * Completely isolated from PaymentPageClient — no shared state or props.
 *
 * Flow
 *  1. On mount: call POST /api/upgrade/validate-handoff with the token so the
 *     server sets the HttpOnly upgrade_session cookie on the browser.
 *  2. Show collapsed dropdown of eligible courses. Nothing pre-selected.
 *  3. User selects courses; live total updates.
 *  4. "Pay to Upgrade" → POST /api/razorpay/create-upgrade-order (reads cookie)
 *     → open Razorpay modal → POST /api/razorpay/verify-payment on success
 *     → redirect to portal /upgrade/success.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Script from "next/script";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PaymentStatusModal from "./PaymentStatusModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpgradeEligibleCourse {
  courseId:     string;
  courseTitle:  string;
  enrollmentId: string;
  priceInr:     number;
}

interface Props {
  authUserId:      string;
  phase2UserId:    string;
  eligibleCourses: UpgradeEligibleCourse[];
  proBundleId:     string;
  /** One-time handoff token — used on mount to set the upgrade_session cookie */
  token:           string;
}

declare global {
  interface Window { Razorpay: any; }
}

// ── Collapsed dropdown checklist ──────────────────────────────────────────────

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
    <div className="relative" data-upgrade-dropdown>
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
                        ₹{course.priceInr.toLocaleString("en-IN")}
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

// ── Main component ────────────────────────────────────────────────────────────

export default function UpgradeCheckoutClient({ eligibleCourses, token }: Props) {
  const [selected, setSelected]             = useState<Set<string>>(
    new Set(eligibleCourses.map(c => c.courseId))
  );
  const [isProcessing, setIsProcessing]     = useState(false);
  const [inlineError, setInlineError]       = useState("");
  const [sessionReady, setSessionReady]     = useState(false);
  const [sessionError, setSessionError]     = useState("");
  const [modal, setModal] = useState<{
    isOpen: boolean;
    status: "success" | "error" | "loading";
    message: string;
    orderId?: string;
    redirectUrl?: string;
    isExistingUser?: boolean;
  }>({ isOpen: false, status: "loading", message: "" });

  // On mount: call validate-handoff from the browser to acquire the HttpOnly
  // upgrade_session cookie that create-upgrade-order will read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/upgrade/validate-handoff", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSessionError(data.error ?? "Upgrade session could not be established.");
        } else {
          setSessionReady(true);
        }
      } catch {
        if (!cancelled) setSessionError("Network error. Please check your connection and try again.");
      }
    })();
    return () => { cancelled = true; };
  // token is stable for the lifetime of this render — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setInlineError("");
  };
  const selectAll = () => { setSelected(new Set(eligibleCourses.map((c) => c.courseId))); setInlineError(""); };
  const clearAll  = () => { setSelected(new Set()); setInlineError(""); };

  const displayTotalInr = eligibleCourses
    .filter((c) => selected.has(c.courseId))
    .reduce((sum, c) => sum + c.priceInr, 0);

  const handlePayment = async () => {
    if (selected.size === 0) { setInlineError("Please select at least one course to upgrade."); return; }
    setInlineError("");
    setIsProcessing(true);
    setModal({ isOpen: true, status: "loading", message: "Creating payment order…" });

    try {
      // 1. Create upgrade order — server validates selection + price from cookie
      const orderRes = await fetch("/api/razorpay/create-upgrade-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ selectedCourseIds: [...selected] }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.orderId) {
        setModal({ isOpen: true, status: "error", message: orderData.error ?? "Failed to create payment order." });
        setIsProcessing(false);
        return;
      }
      const { orderId, keyId, totalInr, selectedCourseIds, selectedEnrollmentIds, proBundleId } =
        orderData as { orderId: string; keyId: string; totalInr: number; selectedCourseIds: string; selectedEnrollmentIds: string; proBundleId: string; };

      // 2. Open Razorpay modal
      const options = {
        key:         keyId,
        amount:      totalInr * 100,
        currency:    "INR",
        name:        "Auto-Mate — Pro Upgrade",
        description: `Pro upgrade for ${selected.size} course${selected.size > 1 ? "s" : ""}`,
        order_id:    orderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; }) => {
          setModal({ isOpen: true, status: "loading", message: "Verifying payment…" });
          // 3. Verify payment — server uses portalUpgradeMeta fast-path
          const verifyRes = await fetch("/api/razorpay/verify-payment", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              course_id:      selectedCourseIds.split(",")[0] ?? "",
              course_name:    "Pro Upgrade",
              bundle_id:      proBundleId,
              batch_type:     "recorded",
              customer_name:  "", customer_email: "", customer_phone: "",
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            setModal({ isOpen: true, status: "success",
              message: "Your Pro upgrade is confirmed! Returning to the portal…",
              orderId: verifyData.orderId, redirectUrl: verifyData.redirectUrl, isExistingUser: true });
          } else {
            setModal({ isOpen: true, status: "error",
              message: verifyData.error ?? "Payment verification failed. Please contact support." });
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
            setModal((prev) => ({ ...prev, isOpen: false }));
            setInlineError("Payment was cancelled. Your plan is unchanged.");
          },
        },
        theme: { color: "#0A3D62" },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp: any) => {
        setModal({ isOpen: true, status: "error", message: resp.error?.description ?? "Payment failed." });
        setIsProcessing(false);
      });
      rzp.open();
    } catch (err) {
      console.error("[UpgradeCheckoutClient]", err);
      setModal({ isOpen: true, status: "error", message: "An unexpected error occurred. Please try again." });
      setIsProcessing(false);
    }
  };

  // ── Render: session loading / error ───────────────────────────────────────
  if (!sessionReady && !sessionError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Preparing your upgrade session…</span>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="max-w-lg mx-auto mt-20 rounded-2xl border border-red-100 bg-red-50 p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
        <p className="text-sm font-medium text-red-700">{sessionError}</p>
        <p className="mt-2 text-xs text-red-500">Please return to the portal and start the upgrade again.</p>
      </div>
    );
  }

  // ── Render: main checkout UI ───────────────────────────────────────────────
  return (
    <>
      <Script id="razorpay-checkout-js" src="https://checkout.razorpay.com/v1/checkout.js" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 md:pt-32 md:pb-24">
        {/* Heading */}
        <div className="mb-10 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 mb-3 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
            <Sparkles className="h-3.5 w-3.5" /> Portal Pro Upgrade
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#0A3D62] via-[#1E90FF] to-[#0A3D62] leading-tight pb-2">
            Upgrade to Pro
          </h1>
          <p className="text-slate-500 text-sm md:text-base max-w-2xl lg:mx-0 mx-auto">
            Select the courses you want to upgrade. Unlock Live Sessions, Labs, and Quizzes.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left: course selector */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-7 order-1 bg-white p-6 md:p-8 rounded-[24px] shadow-sm border border-gray-200 space-y-5">
            <h2 className="text-xl font-bold text-[#0A3D62]">Select courses to upgrade</h2>
            <p className="text-sm text-slate-500">
              Only your Starter-plan enrollments are shown. Choose one, several, or all.
            </p>
            <CourseDropdown courses={eligibleCourses} selected={selected}
              onToggle={toggle} onSelectAll={selectAll} onClearAll={clearAll} disabled={isProcessing} />
            {selected.size === 0 ? (
              <p className="text-xs text-slate-400">No courses selected — select at least one to continue.</p>
            ) : (
              <ul className="space-y-2 pt-1">
                {eligibleCourses.filter((c) => selected.has(c.courseId)).map((c) => (
                  <li key={c.courseId} className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1E90FF]" />
                      <span className="truncate font-medium text-slate-800">{c.courseTitle}</span>
                    </div>
                    <span className="shrink-0 ml-4 font-bold text-[#0A3D62]">₹{c.priceInr.toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
            {inlineError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{inlineError}</span>
              </div>
            )}
          </motion.div>

          {/* Right: order summary + pay */}
          <div className="lg:col-span-5 order-2 lg:sticky lg:top-28">
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full">
              <Card className="border-none shadow-2xl overflow-hidden rounded-[32px] bg-white">
                <div className="bg-[#0A3D62] p-5 md:p-6 text-white text-center">
                  <p className="text-blue-200 text-xs font-bold uppercase tracking-[0.2em]">Order Summary</p>
                </div>
                <CardContent className="p-6 md:p-8 space-y-6">
                  {selected.size === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Select courses to see your total.</p>
                  ) : (
                    <div className="space-y-3 border-b border-gray-50 pb-6">
                      {eligibleCourses.filter((c) => selected.has(c.courseId)).map((c) => (
                        <div key={c.courseId} className="flex justify-between items-start gap-4">
                          <div>
                            <h3 className="font-bold text-[#0A3D62] text-sm leading-tight">{c.courseTitle}</h3>
                            <p className="text-xs text-slate-500">Pro Plan Upgrade</p>
                          </div>
                          <span className="font-bold text-sm text-[#0A3D62] whitespace-nowrap">₹{c.priceInr.toLocaleString("en-IN")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span>
                      <span className="font-medium text-gray-900">{displayTotalInr > 0 ? `₹${displayTotalInr.toLocaleString("en-IN")}` : "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax / Processing</span>
                      <span className="text-green-600 font-bold uppercase text-[10px] bg-green-50 px-2 py-0.5 rounded">Free</span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-dashed border-gray-200">
                      <span className="font-bold text-[#0A3D62]">Grand Total</span>
                      <div className="text-right">
                        <span className="block font-black text-3xl text-[#1E90FF]">
                          {displayTotalInr > 0 ? `₹${displayTotalInr.toLocaleString("en-IN")}` : "—"}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium italic">Inclusive of all taxes</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-[#1B262C] hover:bg-gray-700 h-14 md:h-16 rounded-full text-sm font-bold transition-all duration-300 shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handlePayment}
                    disabled={isProcessing || selected.size === 0 || displayTotalInr <= 0}
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <CreditCard className="w-5 h-5 mr-3" />}
                    {selected.size === 0 ? "Select a course first" : isProcessing ? "Processing…" : `Pay ₹${displayTotalInr.toLocaleString("en-IN")} to Upgrade`}
                  </Button>
                  <div className="flex items-center justify-center gap-2 text-gray-400 text-[11px] font-medium uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                    Verified &amp; Secure · Powered by Razorpay
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      <PaymentStatusModal
        isOpen={modal.isOpen}
        status={modal.status}
        message={modal.message}
        orderId={modal.orderId}
        redirectUrl={modal.redirectUrl}
        isExistingUser={modal.isExistingUser}
        onClose={() => { setModal((prev) => ({ ...prev, isOpen: false })); setIsProcessing(false); }}
      />
    </>
  );
}
