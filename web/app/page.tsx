import Blog from '@/sections/Blog';
import Hero from '@/sections/Hero';
import HomeFeaturedCourses from '@/sections/HomeFeaturedCourses';
import HomeAbout from '@/sections/HomeAbout';
import HomeCTA from '@/sections/HomeCTA';
import Testimonials from '@/sections/Testimonials';
import HomeHighlight from '@/sections/HomeHighlight';
import { client } from '@/lib/sanity.client';

const TESTIMONIALS_QUERY = `*[_type == "testimonial"] | order(_createdAt desc) {
  name,
  text,
  "image": image.asset->url
}`;

export default async function HomePage() {
  const testimonials = await client.fetch(TESTIMONIALS_QUERY).catch(() => []);

  return (
    <div className="min-h-screen">
      <Hero />
      <HomeFeaturedCourses />
      <HomeHighlight />
      <HomeAbout />
      <Testimonials initialData={testimonials} />
      <Blog />
      <HomeCTA />
    </div>
  );
}