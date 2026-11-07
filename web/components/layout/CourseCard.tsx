"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Star, Check } from "lucide-react";

interface CourseCardProps {
  slug: string;
  title: string;
  productUuid?: string | null;
  tagline?: string;
  hoverDescription?: string;
  hoverDetails?: string[];
  instructorName?: string;
  /** Fully-resolved image URL — already processed by urlFor() at the call site */
  heroImageUrl: string;
  rating?: number;
  students?: number;
  price?: number;
  starterPrice?: number;
  duration?: string;
  hours?: number;
  index?: number;
  level?: string;
  updatedAt?: string;
  outcomes?: string[];
  keyConcepts?: { title: string }[];
}

export default function CourseCard({
  slug,
  title,
  tagline,
  instructorName,
  heroImageUrl,
  rating,
  students,
  price,
  starterPrice,
  level,
  updatedAt,
  outcomes,
  hours,
  keyConcepts,
  index,
  hoverDescription,
  hoverDetails,
  productUuid,
}: CourseCardProps) {
  const router = useRouter();
  const handleViewCourseDetailsClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    router.push(`/courses/${slug}`);
  };

  // The user requested to not have the instructor's name below the title.
  const subtitle = tagline;

  // Use hoverDescription if provided, else fallback to tagline for the popup
  const popupDescription = hoverDescription || tagline;

  const isRightEdge = index !== undefined && (index + 1) % 3 === 0;

  // Format the updated date (e.g. "June 2026")
  let formattedDate = "";
  if (updatedAt) {
    try {
      formattedDate = new Date(updatedAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    } catch (e) {
      // fallback if invalid
    }
  }

  // Pointers for hover popup: prioritize hoverDetails from Sanity, fallback to outcomes or keyConcepts
  const popupPointers = (hoverDetails && hoverDetails.length > 0)
    ? hoverDetails
    : (outcomes && outcomes.length > 0)
      ? outcomes
      : (keyConcepts && keyConcepts.length > 0)
        ? keyConcepts.map(kc => kc.title)
        : [
          "Hands-on project experience",
          "Comprehensive industry-standard curriculum",
          "Learn from seasoned professionals"
        ];

  const displayLevel = level || "Beginner";
  const displayHours = hours || 12;

  return (
    <div
      onClick={() => router.push(`/courses/${slug}`)}
      className="
        cursor-pointer
        group relative flex flex-col bg-white rounded-[24px]
        border border-slate-200
        hover:shadow-xl
        transition-all duration-300
        p-4
        h-full
      "
    >
      {/* Hero image */}
      <div className="relative aspect-[16/10] overflow-hidden rounded-[16px]">
        <Image
          src={heroImageUrl}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 pt-5 pb-2 px-1 gap-1">
        <h3 className="text-xl font-bold text-slate-800 leading-snug">
          {title}
        </h3>

        {subtitle && (
          <p className="text-[15px] text-slate-500 mt-1">
            {subtitle}
          </p>
        )}

        <div className="mt-auto flex flex-col">
          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="bg-[#c3e8e4] text-[#1b5e55] text-sm font-bold px-3 py-1 rounded-md">
              Bestseller
            </span>

            {rating != null && (
              <span className="flex items-center gap-1.5 text-sm font-medium border border-slate-300 rounded-md px-3 py-1 text-slate-600">
                <Star size={14} className="fill-[#d97706] text-[#d97706]" />
                {rating}
              </span>
            )}

            {students != null && (
              <span className="text-sm font-medium border border-slate-300 rounded-md px-3 py-1 text-slate-500">
                {students.toLocaleString()} ratings
              </span>
            )}
          </div>

          {/* Price row */}
          {(starterPrice != null || price != null) && (
            <div className="mt-6 mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                Starting from
              </span>
              <span className="text-2xl font-bold text-slate-900">
                ₹{(starterPrice ?? price)?.toLocaleString("en-IN")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Hover Popover */}
      <div
        className="absolute inset-0 bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 p-5 opacity-0 invisible scale-95 group-hover:scale-100 group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[100] pointer-events-none group-hover:pointer-events-auto flex flex-col justify-between"
      >
        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          <h3 className="text-xl font-bold text-slate-900 leading-snug">
            {title}
          </h3>

          <div className="flex items-center gap-3">
            <span className="bg-[#c3e8e4] text-[#1b5e55] text-sm font-bold px-3 py-1 rounded">
              Bestseller
            </span>
            {formattedDate && (
              <span className="text-base font-semibold text-green-700">
                Updated {formattedDate}
              </span>
            )}
          </div>

          <div className="text-sm text-slate-500 font-medium">
            {displayHours} total hours · {displayLevel} Level · Subtitles
          </div>

          {popupDescription && (
            <p className="text-base text-slate-600 leading-relaxed">
              {popupDescription}
            </p>
          )}

          {popupPointers && popupPointers.length > 0 && (
            <ul className="flex flex-col gap-4 mt-2">
              {popupPointers.slice(0, 4).map((pointer, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <Check size={20} className="text-slate-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-600 leading-relaxed">
                    {pointer}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex gap-2 w-full">
          <button
            type="button"
            className="w-full bg-brand-blue hover:bg-brand-dark text-white text-base md:text-lg font-bold py-3 md:py-4 rounded-xl transition-colors shrink-0 flex items-center justify-center gap-2"
            onClick={handleViewCourseDetailsClick}
          >
            <span>View course details</span>
          </button>
        </div>
      </div>
    </div>
  );
}
