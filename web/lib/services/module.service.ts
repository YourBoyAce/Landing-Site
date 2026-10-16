import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}

export interface CourseModule {
  id: string;
  title: string;
  duration: string | null;
  order_index: number;
  description?: string;
  thumbnail_url?: string;
  video_cf_id?: string;
  section_id?: string | null;
  module_type?: string;
  type?: string;
}

export interface CourseSection {
  id: string;
  title: string;
  order_index: number;
}

const isValidUuid = (val: any) =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export async function getCourseModules(
  courseId: string,
  courseTitle?: string
): Promise<{ modules: CourseModule[]; sections: CourseSection[] }> {
  try {
    const supabase = getClient();
    let targetCourseId: string | null = null;

    // 1. Direct Course ID check
    if (courseId && isValidUuid(courseId)) {
      const { data: mc } = await supabase
        .from("maincourses")
        .select("id")
        .eq("id", courseId)
        .maybeSingle();

      const row = mc as any;
      if (row?.id) {
        targetCourseId = row.id;
      }
    }

    // 2. Title matching in maincourses if not resolved yet
    if (!targetCourseId && (courseTitle || courseId)) {
      const { data: allCourses } = await supabase
        .from("maincourses")
        .select("id, title");

      const coursesList = (allCourses as any[]) || [];
      if (coursesList.length > 0) {
        const norm = (s: any) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const searchNorm = norm(courseTitle || courseId);
        const match = coursesList.find((c: any) => {
          const cNorm = norm(c.title);
          return cNorm && (searchNorm.includes(cNorm) || cNorm.includes(searchNorm));
        });
        if (match) {
          targetCourseId = match.id;
        }
      }
    }

    // If still null, try using courseId as raw ID fallback
    if (!targetCourseId && courseId && isValidUuid(courseId)) {
      targetCourseId = courseId;
    }

    if (!targetCourseId) {
      return { modules: [], sections: [] };
    }

    // Fetch modules directly by canonical maincourse_id
    const { data: modulesData, error: modErr } = await supabase
      .from("coursemodules")
      .select("id, title, duration, order_index, description, thumbnail_url, video_cf_id, section_id, module_type")
      .eq("maincourse_id", targetCourseId)
      .order("order_index", { ascending: true, nullsFirst: false });

    const { data: sectionData } = await supabase
      .from("course_sections")
      .select("id, title, order_index")
      .eq("maincourse_id", targetCourseId)
      .order("order_index", { ascending: true });

    return {
      modules: (!modErr && modulesData) ? modulesData : [],
      sections: sectionData || [],
    };
  } catch (err) {
    console.error(
      `[module.service] Unexpected error for course ${courseId}:`,
      err
    );
    return { modules: [], sections: [] };
  }
}
