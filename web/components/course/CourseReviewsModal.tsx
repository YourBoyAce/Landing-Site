"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { DetailedReview } from "@/lib/services/rating.service";

interface CourseReviewsModalProps {
  averageRating: number;
  totalReviews: number;
  reviews: DetailedReview[];
  triggerClassName?: string;
}

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
}

export default function CourseReviewsModal({
  averageRating,
  totalReviews,
  reviews,
  triggerClassName,
}: CourseReviewsModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Calculate rating distribution
  const ratingCounts = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      const star = Math.round(r.rating) as 1 | 2 | 3 | 4 | 5;
      if (counts[star] !== undefined) {
        counts[star]++;
      }
    });
    return counts;
  }, [reviews]);

  return (
    <>
      <span
        onClick={() => setIsOpen(true)}
        className={triggerClassName || "text-slate-300 underline cursor-pointer hover:text-white"}
      >
        ({totalReviews} {totalReviews === 1 ? "rating" : "ratings"})
      </span>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-amber-500 font-black text-2xl flex items-center gap-1">
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {averageRating.toFixed(1)}
                </span>
                <h2 className="text-2xl font-bold text-slate-900">course rating</h2>
                <span className="text-2xl font-bold text-slate-400">&bull;</span>
                <span className="text-2xl font-bold text-slate-900">{totalReviews} ratings</span>
              </div>
              
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* Left Sidebar - Distribution */}
              <div className="w-full md:w-1/3 p-6 border-r border-slate-100 bg-slate-50/50 overflow-y-auto">
                <div className="space-y-3">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = ratingCounts[star as keyof typeof ratingCounts];
                    const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
                    return (
                      <div key={star} className="flex items-center gap-3">
                        <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-400 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="flex text-amber-500">
                          {[...Array(5)].map((_, i) => (
                            <svg key={i} className={`w-3.5 h-3.5 ${i < star ? "fill-current" : "fill-transparent border border-amber-500 rounded-sm"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={i < star ? "0" : "2"}>
                              {i < star ? (
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              ) : (
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              )}
                            </svg>
                          ))}
                        </div>
                        <span className="text-sm font-medium text-blue-600 w-8 text-right">
                          {percentage}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Side - Reviews List */}
              <div className="flex-1 p-6 overflow-y-auto bg-white">
                {reviews.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    No reviews available.
                  </div>
                ) : (
                  <div className="space-y-8">
                    {reviews.map((review, idx) => (
                      <div key={idx} className="border-b border-slate-100 pb-8 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-4">
                            {review.profiles?.avatar_url ? (
                              <img
                                src={review.profiles.avatar_url}
                                alt={review.profiles.full_name}
                                className="w-12 h-12 rounded-full object-cover bg-slate-100"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg">
                                {(review.profiles?.full_name || "U").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <h4 className="font-bold text-slate-900 text-base">
                                {review.profiles?.full_name || "Anonymous User"}
                              </h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <div className="flex text-amber-500">
                                  {[...Array(5)].map((_, i) => (
                                    <svg key={i} className={`w-3.5 h-3.5 ${i < review.rating ? "fill-current" : "text-slate-300 fill-current"}`} viewBox="0 0 24 24">
                                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </svg>
                                  ))}
                                </div>
                                <span className="text-sm font-semibold text-slate-500">
                                  {timeAgo(review.created_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-slate-600 text-[15px] leading-relaxed whitespace-pre-wrap">
                          {review.review}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
