/**
 * Fetch a single plan by its badge value (Starter | Pro | Premium).
 * Used by the /courses/[courseSlug]/plans/[planSlug] detail page.
 */
export const PLAN_BY_BADGE_QUERY = `
*[_type=="plan" && badge==$badge && active==true][0]{
  _id,
  bundleUuid,
  title,
  badge,
  price,
  rating,
  reviewCount,
  duration,
  batchOptions,
  coverImage,
  features[]{
    title,
    included
  }
}
`;

export const PLANS_QUERY = `
*[_type=="plan" && active == true]
| order(displayOrder asc){
    _id,
    bundleUuid,
    title,
    badge,
    price,
    rating,
    reviewCount,
    duration,
    batchOptions,
    coverImage,
    features[]{
        title,
        included
    }
}
`;