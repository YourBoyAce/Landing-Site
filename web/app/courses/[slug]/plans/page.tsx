import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Sparkles, ArrowRight } from "lucide-react";
import { getCoursePlans } from "@/lib/services/course.service";
import { getPlans } from "@/lib/services/plan.services";
import { PricingCard } from "@/components/ui/PricingCard";
import { makeAdminClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ slug: string }>;
}

const isValidUuid = (val: any) =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

function normalize(str: string | null | undefined): string {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default async function CoursePlansPage({ params }: Props) {
  const { slug } = await params;

  // Fetch ALL plans + course info in parallel
  const [allPlans, courseData] = await Promise.all([
    getPlans().catch(() => []),
    getCoursePlans(slug).catch(() => null),
  ]);

  // Course must exist — 404 if not found
  if (!courseData) return notFound();

  // Verify that the course exists in public.maincourses (Automate Learning Portal)
  const rawId = courseData.productUuid || (courseData as any).productId;
  let courseExistsInPortal = false;
  let resolvedCourseId: string = courseData.productUuid || courseData._id;
  let resolvedCourseTitle: string = courseData.title;

  try {
    const supabase = makeAdminClient();
    const { data: allCourses } = await supabase
      .from("maincourses")
      .select("id, title");

    if (allCourses && allCourses.length > 0) {
      if (rawId && isValidUuid(rawId)) {
        const directMatch = allCourses.find(
          (c) => c.id.toLowerCase() === String(rawId).trim().toLowerCase()
        );
        if (directMatch) {
          courseExistsInPortal = true;
          resolvedCourseId = directMatch.id;
          resolvedCourseTitle = directMatch.title || courseData.title;
        }
      }

      if (!courseExistsInPortal && (courseData.title || slug)) {
        const normTitle = normalize(courseData.title);
        const normSlug = normalize(slug);

        for (const c of allCourses) {
          const normC = normalize(c.title);
          if (
            normC &&
            (normTitle.includes(normC) ||
              normC.includes(normTitle) ||
              normSlug.includes(normC) ||
              normC.includes(normSlug))
          ) {
            courseExistsInPortal = true;
            resolvedCourseId = c.id;
            resolvedCourseTitle = c.title || courseData.title;
            break;
          }
        }
      }
    }
  } catch (e) {
    console.error("[CoursePlansPage] Failed to verify course in Supabase:", e);
  }

  // If the course does not exist in learning portal, show the upcoming course state
  if (!courseExistsInPortal) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16 sm:py-24">
        <div className="max-w-xl w-full bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-xl text-center relative overflow-hidden">
          <div className="h-2 w-full bg-gradient-to-r from-amber-400 via-[#0166A7] to-[#0A3D62] absolute top-0 left-0 right-0" />

          <div className="relative mb-6 inline-flex">
            <div className="absolute inset-0 rounded-2xl bg-amber-400/20 blur-xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 border border-amber-200 text-amber-600 shadow-sm mx-auto">
              <Clock className="w-10 h-10 stroke-[2.2]" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80 mb-4 tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            Upcoming Course
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
            This is an Upcoming Course
          </h1>

          <p className="mt-2 text-xl font-semibold text-[#0166A7]">
            {courseData.title}
          </p>

          <div className="mt-4 space-y-2 text-slate-600">
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              This course has not yet been launched in the learning portal. Plan selections and enrollment will open once the course is released!
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/courses"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0166A7] hover:bg-[#004d7c] text-white py-3.5 px-6 font-semibold text-sm transition-all duration-200 shadow-md hover:shadow-lg shadow-blue-900/10"
            >
              Explore Available Courses
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={`/courses/${slug}`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 py-3.5 px-6 font-semibold text-sm transition-colors duration-200"
            >
              Course Overview
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // IDs of plans the course recommends via bundles[]
  const recommendedIds = new Set(
    (courseData.bundles ?? []).map((b) => b._id)
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="max-w-7xl mx-auto px-6 py-16 md:py-24">

        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#0166A7] mb-3">
            Choose Your Plan
          </p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 leading-tight">
            {resolvedCourseTitle || courseData.title}
          </h1>
          <p className="mt-4 text-slate-500 text-base max-w-xl mx-auto">
            All plans include full access to the course content. Choose the
            one that fits your goals.
          </p>
        </div>

        {allPlans.length === 0 ? (
          <p className="text-center text-slate-500 py-20 text-lg">
            No plans available yet — please check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {allPlans.map((plan) => (
              <PricingCard
                key={plan._id}
                bundle={plan}
                courseSlug={slug}
                // Pass the verified maincourses.id directly
                // This ensures cart and enrollments use the single canonical course_id.
                courseId={resolvedCourseId}
                courseTitle={resolvedCourseTitle || courseData.title}
                recommended={recommendedIds.has(plan._id)}
              />
            ))}
          </div>
        )}

      </section>
    </main>
  );
}
