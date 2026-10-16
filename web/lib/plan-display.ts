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
