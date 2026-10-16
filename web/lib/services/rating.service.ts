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

export interface CourseRating {
  averageRating: number;
  totalReviews: number;
}

const isValidUuid = (val: any) =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

/**
 * Fetches the live learner rating aggregate for a course from Supabase.
 */
export async function getCourseRating(
  courseId: string
): Promise<CourseRating | null> {
  if (!courseId) {
    return { averageRating: 0, totalReviews: 0 };
  }

  try {
    const supabase = getClient();
    const candidateIds = [courseId];

    if (isValidUuid(courseId)) {
      const { data: mcData } = await supabase
        .from("maincourses")
        .select("id, product_id")
        .or(`id.eq.${courseId},product_id.eq.${courseId}`);

      if (mcData) {
        mcData.forEach((mc: any) => {
          if (mc.id && !candidateIds.includes(mc.id)) candidateIds.push(mc.id);
          if (mc.product_id && !candidateIds.includes(mc.product_id)) candidateIds.push(mc.product_id);
        });
      }
    }

    const { data, error } = await supabase
      .from("course_ratings")
      .select("rating")
      .or(`course_id.in.(${candidateIds.join(",")}),product_id.in.(${candidateIds.join(",")})`)
      .returns<{ rating: number }[]>();

    if (error) {
      console.error(
        `[rating.service] Failed to fetch ratings for course ${courseId}:`,
        error.message
      );
      return null;
    }

    const rows = data ?? [];

    if (rows.length === 0) {
      return { averageRating: 0, totalReviews: 0 };
    }

    const totalReviews = rows.length;
    const sum = rows.reduce((acc, row) => acc + (row.rating ?? 0), 0);
    const averageRating = sum / totalReviews;

    return { averageRating, totalReviews };
  } catch (err) {
    console.error(
      `[rating.service] Unexpected error for course ${courseId}:`,
      err
    );
    return null;
  }
}

export interface DetailedReview {
  rating: number;
  review: string;
  created_at: string;
  profiles?: {
    full_name: string;
    avatar_url?: string;
  };
}

/**
 * Fetches detailed reviews for a course from Supabase.
 */
export async function getCourseReviews(
  courseId: string
): Promise<DetailedReview[]> {
  if (!courseId) {
    return [];
  }

  try {
    const supabase = getClient();
    const candidateIds = [courseId];

    if (isValidUuid(courseId)) {
      const { data: mcData } = await supabase
        .from("maincourses")
        .select("id, product_id")
        .or(`id.eq.${courseId},product_id.eq.${courseId}`);

      if (mcData) {
        mcData.forEach((mc: any) => {
          if (mc.id && !candidateIds.includes(mc.id)) candidateIds.push(mc.id);
          if (mc.product_id && !candidateIds.includes(mc.product_id)) candidateIds.push(mc.product_id);
        });
      }
    }

    // Fetch ratings
    const { data: reviewsData, error } = await supabase
      .from("course_ratings")
      .select("rating, review, created_at, user_id")
      .or(`course_id.in.(${candidateIds.join(",")}),product_id.in.(${candidateIds.join(",")})`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        `[rating.service] Failed to fetch detailed reviews for course ${courseId}:`,
        error.message
      );
      return [];
    }

    if (!reviewsData || reviewsData.length === 0) {
      return [];
    }

    const reviews = reviewsData as { rating: number; review: string; created_at: string; user_id: string }[];

    // Fetch associated usernames from phase2.users
    const userIds = [...new Set(reviews.map((r) => r.user_id).filter(Boolean))];
    
    let profilesMap: Record<string, { full_name: string; avatar_url?: string }> = {};
    
    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await (supabase as any)
        .schema("phase2")
        .from("users")
        .select("auth_user_id, username")
        .in("auth_user_id", userIds);
        
      if (!usersError && usersData) {
        profilesMap = (usersData as any[]).reduce((acc: Record<string, { full_name: string; avatar_url?: string }>, u: any) => {
          if (u.auth_user_id) {
            acc[u.auth_user_id] = { full_name: u.username || "Anonymous User" };
          }
          return acc;
        }, {} as Record<string, { full_name: string; avatar_url?: string }>);
      } else if (usersError) {
        console.error(
          `[rating.service] Failed to fetch phase2 users for reviews:`,
          usersError.message
        );
      }
    }

    return reviews.map((r) => ({
      rating: r.rating,
      review: r.review,
      created_at: r.created_at,
      profiles: profilesMap[r.user_id] || { full_name: "Anonymous User" },
    }));
  } catch (err) {
    console.error(
      `[rating.service] Unexpected error fetching detailed reviews for course ${courseId}:`,
      err
    );
    return [];
  }
}
