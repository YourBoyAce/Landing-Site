import { NextResponse } from "next/server";
import { client } from "@/lib/sanity.client";
import { makeAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const isValidUuid = (val: unknown) =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const directId =
    searchParams.get("courseId") ||
    searchParams.get("productId") ||
    searchParams.get("productUuid");

  if (!slug && !directId) {
    return NextResponse.json(
      { error: "Course slug or courseId is required" },
      { status: 400 }
    );
  }

  try {
    let targetId: string | null = slug ? null : directId ? String(directId).trim() : null;
    let courseTitle = "";

    // 1. If slug is provided, check course in Sanity
    if (slug) {
      const course = await client.fetch(
        `*[_type == "courseDetails" && slug.current == $slug][0]{
          _id,
          title,
          productUuid,
          productId
        }`,
        { slug },
        { cache: "no-store" }
      );

      if (!course) {
        return NextResponse.json({
          exists: false,
          courseFound: false,
          title: "",
          slug,
          message: "This is an Upcoming Course",
        });
      }

      courseTitle = course.title || "";
      const rawId = course.productUuid || course.productId;
      if (rawId && typeof rawId === "string" && rawId.trim().length > 0) {
        targetId = rawId.trim();
      }
    }

    // 2. Verify whether the course exists in automate-learning-portal (public.maincourses)
    let courseExistsInPortal = false;
    let resolvedCourseId: string | null = null;
    let resolvedCourseTitle: string = courseTitle;

    try {
      const supabase = makeAdminClient();
      const { data: allCourses, error: dbErr } = await supabase
        .from("maincourses")
        .select("id, title");

      if (!dbErr && allCourses && allCourses.length > 0) {
        // Direct UUID match
        if (targetId && isValidUuid(targetId)) {
          const directMatch = allCourses.find(
            (c) => c.id.toLowerCase() === targetId!.toLowerCase()
          );
          if (directMatch) {
            courseExistsInPortal = true;
            resolvedCourseId = directMatch.id;
            resolvedCourseTitle = directMatch.title || courseTitle;
          }
        }
      }
    } catch (dbError) {
      console.error("[api/courses/check-product] Supabase verification error:", dbError);
    }

    return NextResponse.json({
      exists: courseExistsInPortal,
      courseFound: true,
      courseId: resolvedCourseId,
      productId: resolvedCourseId,
      title: resolvedCourseTitle,
      slug,
      isPortalProduct: courseExistsInPortal,
      message: courseExistsInPortal
        ? "Active course found in Learning Portal"
        : "This is an Upcoming Course",
    });
  } catch (error: unknown) {
    console.error("[api/courses/check-product] Error querying Sanity/Supabase:", error);
    return NextResponse.json(
      {
        error: "Failed to check course",
        message: "This is an Upcoming Course",
      },
      { status: 500 }
    );
  }
}
