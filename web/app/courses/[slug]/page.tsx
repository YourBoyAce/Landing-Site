import Image from "next/image";
import { notFound } from "next/navigation";
import { PortableText } from "@portabletext/react";
import { getCourseBySlug } from "@/lib/services/course.service";
import { getCourseRating, getCourseReviews } from "@/lib/services/rating.service";
import { getCourseModules } from "@/lib/services/module.service";
import { urlFor } from "@/lib/sanity.client";
import { StarRating } from "@/components/ui/StarRating";
import ContactCTA from "@/sections/HomeCTA";
import PlanSelector from "@/components/layout/PlanSelector";
import SampleVideoPreview from "@/components/course/SampleVideoPreview";
import CourseContentAccordion from "@/components/course/CourseContentAccordion";
import CourseReviewsModal from "@/components/course/CourseReviewsModal";
import { Check, ChevronRight, Sparkles } from "lucide-react";

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;

  // Fetch Sanity course data first — we need productUuid to fire the rating query.
  // Both fetches are then made in parallel once productUuid is known.
  const course = await getCourseBySlug(slug);
  if (!course) return notFound();

  // Parallel fetch: Supabase live rating alongside any other async work.
  // getCourseRating returns null on DB error (page still renders safely).
  const [liveRating, courseData, detailedReviews] = await Promise.all([
    course.productUuid ? getCourseRating(course.productUuid) : Promise.resolve({ averageRating: 0, totalReviews: 0 }),
    getCourseModules(course.productUuid || "", course.title),
    course.productUuid ? getCourseReviews(course.productUuid) : Promise.resolve([])
  ]);

  const displayModules = courseData.modules;
  const dbSections = courseData.sections;
  const curriculum = course.curriculum || [];

  const groupedSections: { title: string; lectures: typeof displayModules }[] = [];
  
  if (dbSections && dbSections.length > 0) {
    dbSections.forEach((sec) => {
      const sectionLectures = displayModules.filter((m: any) => String(m.section_id) === String(sec.id));
      groupedSections.push({ title: sec.title, lectures: sectionLectures });
    });
    
    const ungrouped = displayModules.filter((m: any) => !m.section_id || !dbSections.find((s: any) => String(s.id) === String(m.section_id)));
    if (ungrouped.length > 0) {
      groupedSections.push({ title: "Additional Modules", lectures: ungrouped });
    }
  } else {
    let moduleIndex = 0;
    if (curriculum && curriculum.length > 0) {
      curriculum.forEach((section: any) => {
        const sectionLectures: any[] = [];
        const numPoints = section.points ? section.points.length : 0;
        for (let i = 0; i < Math.max(1, numPoints); i++) {
          if (moduleIndex < displayModules.length) {
            sectionLectures.push(displayModules[moduleIndex]);
            moduleIndex++;
          }
        }
        if (sectionLectures.length > 0) {
          groupedSections.push({ title: section.subheading, lectures: sectionLectures });
        }
      });
    }
  
    if (moduleIndex < displayModules.length) {
      const remaining = displayModules.slice(moduleIndex);
      groupedSections.push({
        title: curriculum && curriculum.length > 0 ? "Additional Modules" : "Course Modules",
        lectures: remaining,
      });
    }
  }

  const orderedModules = groupedSections.flatMap(sec => sec.lectures.map(lec => ({ ...lec, sectionTitle: sec.title })));
  const videoModules = orderedModules.filter(m => {
    const t = (m.module_type || (m as any).type || 'video').toLowerCase();
    return t !== 'quiz' && t !== 'artifact';
  });


  const heroImageUrl = course.heroImage
    ? urlFor(course.heroImage).width(1200).url()
    : "/placeholder.png";

  // Determine what to show in the rating area:
  //   liveRating === null  → DB error  → show nothing (safe fallback)
  //   totalReviews === 0   → no reviews yet
  //   totalReviews > 0     → show stars + count
  const hasReviews = liveRating !== null && liveRating.totalReviews > 0;
  const ratingError = liveRating === null;
  const featuredSampleVideo = videoModules.length > 0 ? videoModules[0] : undefined;

  return (
    <main className="bg-white text-slate-900">
      {/* Hero Section */}
      <section className="bg-brand-deep text-white py-12 lg:py-16 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-10">
            {/* Left Content (2/3 width on desktop) */}
            <div className="lg:col-span-2 space-y-5">
              {/* Category Breadcrumbs Placeholder */}
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <span className="cursor-pointer hover:text-white">Courses</span>
                <ChevronRight className="w-4 h-4" />
                <span>{course.title}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                {/* Course Logo */}
                <div className="shrink-0">
                  <Image
                    src={heroImageUrl}
                    alt={`${course.title} logo`}
                    width={100}
                    height={100}
                    className="rounded-xl shadow-lg border border-white/20 object-cover w-24 h-24"
                  />
                </div>
                
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold leading-tight">{course.title}</h1>
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm mt-4">
                {!ratingError && (
                  <div className="flex items-center gap-2">
                    {hasReviews ? (
                      <>
                        <span className="text-amber-400 font-bold">{liveRating!.averageRating.toFixed(1)}</span>
                        <StarRating
                          rating={liveRating!.averageRating}
                          showNumber={false}
                          size={16}
                        />
                        <CourseReviewsModal 
                          averageRating={liveRating!.averageRating}
                          totalReviews={liveRating!.totalReviews}
                          reviews={detailedReviews}
                        />
                      </>
                    ) : (
                      <span className="text-slate-400">No ratings yet</span>
                    )}
                  </div>
                )}
                {course.students != null && (
                  <div className="text-slate-300">{course.students} students</div>
                )}
                  </div>
                </div>
              </div>
              
              {course.instructorName && (
                <div className="text-slate-200 text-sm">
                  Created by <span className="underline cursor-pointer hover:text-white">{course.instructorName}</span>
                </div>
              )}
            </div>
            
            {/* Right column placeholder in hero to maintain grid structure */}
            <div className="hidden lg:block"></div>
          </div>
        </div>
      </section>

      {/* Main Content & Sidebar Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="grid lg:grid-cols-3 gap-10 relative">
          
          {/* Left Column - Main Details */}
          <div className="lg:col-span-2 space-y-12 lg:pr-8 pt-8 pb-4">
            
            {/* What you'll learn */}
            {course.curriculum && course.curriculum.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-6 sm:p-8 bg-slate-50/50">
                <h2 className="text-2xl font-bold mb-6">What you'll learn</h2>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                  {course.curriculum.map((mod, index) => (
                    <div key={index}>
                      <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 shrink-0 text-slate-700 mt-0.5" />
                        <div>
                           <span className="text-sm text-slate-700">{mod.subheading}</span>
                           {mod.summary && (
                             <p className="mt-1 text-xs text-slate-500 italic">{mod.summary}</p>
                           )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Course Highlights */}
            {course.highlights && course.highlights.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6 text-slate-900">Course Highlights</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {course.highlights.map((highlight, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-[#0166A7]/40 hover:bg-blue-50/20 transition-all duration-200 group"
                    >
                      {highlight.icon ? (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm p-1.5 group-hover:border-[#0166A7]/30 transition-colors">
                          <Image
                            src={urlFor(highlight.icon).width(44).height(44).url()}
                            alt={highlight.title}
                            width={32}
                            height={32}
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0166A7]">
                          <Sparkles className="w-5 h-5 text-[#0166A7]" />
                        </div>
                      )}
                      <span className="font-semibold text-slate-800 text-sm leading-snug">
                        {highlight.title}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Key Concepts */}
            {course.keyConcepts && course.keyConcepts.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6 text-slate-900">Key Concepts</h2>
                <div className="space-y-4">
                  {course.keyConcepts.map((concept, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors"
                    >
                      {concept.icon && (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200/80 shadow-sm p-1.5">
                          <Image
                            src={urlFor(concept.icon).width(48).height(48).url()}
                            alt={concept.title}
                            width={36}
                            height={36}
                            className="object-contain"
                          />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-slate-900">{concept.title}</h3>
                        {concept.description && (
                          <p className="text-slate-600 text-sm mt-1 leading-relaxed">{concept.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Requirements */}
            {course.whoFor && course.whoFor.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Requirements</h2>
                <ul className="space-y-2 list-disc list-inside text-slate-700">
                  {course.whoFor.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Description */}
            {course.description && course.description.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Description</h2>
                <div className="text-slate-700 leading-relaxed prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600">
                  <PortableText value={course.description} />
                </div>
              </section>
            )}

            {/* Outcomes */}
            {course.outcomes && course.outcomes.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Outcomes</h2>
                <ul className="space-y-2 list-disc list-inside text-slate-700">
                  {course.outcomes.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Course Content (Modules List) */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Course content</h2>
              {displayModules && displayModules.length > 0 ? (
                <CourseContentAccordion curriculum={course.curriculum || []} modules={displayModules} dbSections={dbSections} />
              ) : (
                <div className="p-6 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-sm font-medium text-center">
                  No preview available
                </div>
              )}
            </section>
            
          </div>

          {/* Right Column - Floating Sidebar */}
          <div className="relative">
            {/* The negative top margin pulls it up over the dark hero section on large screens */}
            <div className="lg:-mt-[280px] lg:sticky lg:top-8 z-10 rounded-xl bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] border border-slate-200 overflow-hidden">
              
              {/* Video Preview */}
              <div className="bg-white">
                {featuredSampleVideo ? (
                  <div className="p-1 pb-0">
                    <SampleVideoPreview
                      courseTitle={course.title}
                      featuredVideo={{
                        key: (featuredSampleVideo as any)._key ?? (featuredSampleVideo as any).id ?? String((featuredSampleVideo as any).url),
                        title: (featuredSampleVideo as any).title,
                        url: (featuredSampleVideo as any).url,
                        cloudflareId: (featuredSampleVideo as any).video_cf_id,
                        description: (featuredSampleVideo as any).description,
                        duration: (featuredSampleVideo as any).duration,
                        poster: (featuredSampleVideo as any).thumbnail_url || ((featuredSampleVideo as any).video_cf_id
                          ? `https://videodelivery.net/${(featuredSampleVideo as any).video_cf_id}/thumbnails/thumbnail.jpg`
                          : ((featuredSampleVideo as any).poster
                            ? urlFor((featuredSampleVideo as any).poster).width(600).url()
                            : heroImageUrl)),
                        isLocked: false,
                      }}
                      videos={videoModules.map((mod, index) => ({
                        key: mod.id,
                        title: mod.title,
                        cloudflareId: mod.video_cf_id || undefined,
                        poster: mod.thumbnail_url || (mod.video_cf_id ? `https://videodelivery.net/${mod.video_cf_id}/thumbnails/thumbnail.jpg` : undefined),
                        description: mod.description || undefined,
                        duration: mod.duration || undefined,
                        isLocked: index >= 5,
                        sectionTitle: mod.sectionTitle,
                      }))}
                    />
                  </div>
                ) : (
                  <div className="aspect-video w-full overflow-hidden border-b border-slate-100">
                    <Image
                      src={heroImageUrl}
                      alt={course.title}
                      width={600}
                      height={340}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              {/* Sidebar Body */}
              <div className="p-6">
                <div className="mb-6">
                  <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 block mb-1">
                    Starting from
                  </span>
                  <div className="text-3xl font-bold text-slate-900">
                    ₹{(course.starterPrice ?? course.price)?.toLocaleString("en-IN") ?? "—"}
                  </div>
                </div>
                
                <PlanSelector
                  courseSlug={course.slug}
                  courseTitle={course.title}
                  productUuid={course.productUuid}
                />

                <div className="mt-6 text-xs text-center text-slate-500 mb-6">
                  30-Day Money-Back Guarantee
                </div>

                <div className="space-y-4 text-sm text-slate-700">
                  <div className="font-bold text-slate-900 mb-2">This course includes:</div>
                  
                  {course.duration && (
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 text-slate-900 flex items-center justify-center">🎥</span>
                      <span>{course.duration} on-demand video</span>
                    </div>
                  )}
                  {course.hours != null && (
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 text-slate-900 flex items-center justify-center">⏱️</span>
                      <span>{course.hours} hours of content</span>
                    </div>
                  )}
                  {course.students != null && (
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 text-slate-900 flex items-center justify-center">👥</span>
                      <span>{course.students} students</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 text-slate-900 flex items-center justify-center">⭐</span>
                    <span>Certificate of completion</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      <ContactCTA />
    </main>
  );
}
