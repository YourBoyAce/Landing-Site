import { Plan } from "@/lib/types/plan";

export function getPlanDisplayName(
  plan?: Pick<Plan, "title" | "badge"> | null,
): string {
  if (!plan) return "Plan";
  return (plan.badge || "").toLowerCase() === "premium" ? "Live Sessions" : (plan.title || "Plan");
}

export function getPlanDisplayNameFromTitle(title?: string | null): string {
  if (!title) return "Plan";
  return title.toLowerCase().startsWith("premium") ? "Live Sessions" : title;
}

export function getPlanSubtitle(
  plan?: Pick<Plan, "title" | "badge"> | null,
  courseTitle?: string | null,
): string {
  if (!plan) return "By Auto-Mate";

  const badgeLower = (plan.badge || "").trim().toLowerCase();
  const titleLower = (plan.title || "").trim().toLowerCase();

  const isStarter =
    badgeLower === "starter" ||
    titleLower === "starter" ||
    titleLower.startsWith("starter ") ||
    titleLower.includes("starter");

  if (isStarter) {
    const trimmedTitle = courseTitle?.trim();
    if (trimmedTitle) {
      return trimmedTitle.toLowerCase().startsWith("learn ")
        ? trimmedTitle
        : `Learn ${trimmedTitle}`;
    }
    return "Learn Your Course";
  }

  const isPro =
    badgeLower === "pro" ||
    titleLower === "pro" ||
    titleLower.startsWith("pro ") ||
    titleLower.includes("pro");

  if (isPro) {
    return "Full Course Access, Live Sessions & Career Growth.";
  }

  // Live sessions (Premium) & others stay unchanged:
  return "By Auto-Mate";
}
