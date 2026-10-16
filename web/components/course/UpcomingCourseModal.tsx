"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Clock, ArrowRight, X } from "lucide-react";

interface UpcomingCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseTitle?: string;
}

export default function UpcomingCourseModal({
  isOpen,
  onClose,
  courseTitle,
}: UpcomingCourseModalProps) {
  const router = useRouter();

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upcoming-modal-title"
    >
      {/* Blurred Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] transition-all animate-in zoom-in-95 fade-in duration-200"
      >
        {/* Top Decorative Gradient Ribbon */}
        <div className="h-2 w-full bg-gradient-to-r from-amber-400 via-[#0166A7] to-[#0A3D62]" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 rounded-full p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8 text-center flex flex-col items-center">
          {/* Glowing Icon Container */}
          <div className="relative mb-5">
            <div className="absolute inset-0 rounded-2xl bg-amber-400/20 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 border border-amber-200 text-amber-600 shadow-sm">
              <Clock className="w-8 h-8 stroke-[2.2]" />
            </div>
          </div>

          {/* Upcoming Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80 mb-3 tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            Upcoming Course
          </div>

          {/* Heading */}
          <h3
            id="upcoming-modal-title"
            className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug"
          >
            This is an Upcoming Course
          </h3>

          {/* Course Name */}
          {courseTitle && (
            <p className="mt-2 text-base font-semibold text-[#0166A7]">
              {courseTitle}
            </p>
          )}

          {/* Primary & Secondary Description */}
          <div className="mt-3 space-y-2 text-slate-600">
            <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
              This course has not yet been launched in the learning portal. Curriculum modules and enrollment plans will open once the course is released!
            </p>
          </div>

          {/* Actions */}
          <div className="mt-7 flex flex-col sm:flex-row gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/courses");
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0166A7] hover:bg-[#004d7c] text-white py-3.5 px-4 font-semibold text-sm transition-all duration-200 shadow-md hover:shadow-lg shadow-blue-900/10 active:scale-[0.98]"
            >
              Explore Available Courses
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 py-3.5 px-5 font-semibold text-sm transition-colors duration-200 active:scale-[0.98]"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
