export const COURSES_QUERY = `
*[_type=="courseDetails"] | order(displayOrder asc){
  _id,
  title,
  "slug": slug.current,
  productUuid,
  productId,
  tagline,
  "hoverDetails": coalesce(hoverDetails, hoverDescription),
  hoverDescription,
  rating,
  students,
  hours,
  duration,
  "starterPrice": coalesce(bundles[@->badge=="Starter" || @->title=="Starter"][0]->price, *[_type=="plan" && (lower(badge)=="starter" || lower(title)=="starter") && active==true] | order(displayOrder asc)[0].price),
  "price": coalesce(bundles[@->badge=="Starter" || @->title=="Starter"][0]->price, *[_type=="plan" && (lower(badge)=="starter" || lower(title)=="starter") && active==true] | order(displayOrder asc)[0].price, price),
  level,
  _updatedAt,
  outcomes,
  keyConcepts[]{ title },
  instructorImage,
  instructorName,
  "heroImage": coalesce(heroImage, *[_type=="course" && slug.current == ^.slug.current][0].heroImage)
}
`;


export const COURSE_BY_SLUG_QUERY = `
*[_type=="courseDetails" && slug.current==$slug][0]{
  _id,
  title,
  "slug": slug.current,
  productUuid,
  productId,
  tagline,
  "hoverDetails": coalesce(hoverDetails, hoverDescription),
  rating,
  students,
  hours,
  duration,
  "starterPrice": coalesce(bundles[@->badge=="Starter" || @->title=="Starter"][0]->price, *[_type=="plan" && (lower(badge)=="starter" || lower(title)=="starter") && active==true] | order(displayOrder asc)[0].price),
  "price": coalesce(bundles[@->badge=="Starter" || @->title=="Starter"][0]->price, *[_type=="plan" && (lower(badge)=="starter" || lower(title)=="starter") && active==true] | order(displayOrder asc)[0].price, price),
  level,
  instructorImage,
  instructorName,
  "heroImage": coalesce(heroImage, *[_type=="course" && slug.current == ^.slug.current][0].heroImage),
  description,
  sampleVideos[]{
    _key,
    title,
    description,
    "url": video.asset->url,
    "mimeType": video.asset->mimeType,
    poster
  },
  keyConcepts[]{
    title,
    icon,
    description
  },
  whoFor,
  curriculum[]{
    subheading,
    points,
    summary
  },
  outcomes,
  highlights[]{
    icon,
    title
  },
  projects,
  batchDetails,
  bundles[]->{
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
}
`;


/**
 * Fetches a course's title + the full plan shape required by PricingCard.
 * Uses the bundles[] reference array on the course document.
 */
export const COURSE_PLANS_QUERY = `
*[_type=="courseDetails" && slug.current==$slug][0]{
  _id,
  productUuid,
  productId,
  title,
  "slug": slug.current,
  bundles[]->{
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
}
`;
