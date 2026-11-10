"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase.browser";

import { CartItem, addToCart } from "@/lib/services/cart";

type PendingAction =
  | { type: "addToCart"; payload: CartItem }
  | { type: "buyNow"; payload: string } // href
  | null;

interface AuthContextValue {
  isOpen: boolean;
  openAuth: (pendingAction?: PendingAction) => void;
  closeAuth: () => void;
  pendingAction: PendingAction;
  isLoggedIn: boolean;
  user: { name: string; email: string; id: string } | null;
  executePendingAction: () => void;
  needsPassword: boolean;
  onPasswordSet: () => void;
  logout: () => void;
  enrolledCourseIds: Set<string>;
  enrolledPlanKeys: Set<string>;
  enrolledCourseMap: Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; id: string } | null>(null);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set());
  const [enrolledPlanKeys, setEnrolledPlanKeys] = useState<Set<string>>(new Set());
  const [enrolledCourseMap, setEnrolledCourseMap] = useState<Record<string, string>>({});

  useEffect(() => {
    // Reusable fetch for user profile to sync username and email from phase2.users / profiles
    const fetchUserProfile = async (userId: string, initialName?: string) => {
      try {
        const { data: p2User } = await supabaseBrowser
          .schema("phase2")
          .from("users")
          .select("username, email")
          .eq("auth_user_id", userId)
          .maybeSingle();

        if (p2User?.username?.trim() || p2User?.email?.trim()) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  ...(p2User.username?.trim() ? { name: p2User.username.trim() } : {}),
                  ...(p2User.email?.trim() ? { email: p2User.email.trim() } : {}),
                }
              : prev
          );
          return;
        }

        const { data: profile } = await supabaseBrowser
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .maybeSingle();

        if (profile?.full_name?.trim() || profile?.email?.trim()) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  ...(profile.full_name?.trim() ? { name: profile.full_name.trim() } : {}),
                  ...(profile.email?.trim() ? { email: profile.email.trim() } : {}),
                }
              : prev
          );
          return;
        }

        if (initialName?.trim()) {
          setUser((prev) => (prev ? { ...prev, name: initialName.trim() } : prev));
        }
      } catch (err) {
        console.error("Failed to fetch user profile name:", err);
      }
    };

    // Reusable fetch for user enrollments to update UI buttons
    const fetchEnrollments = async (userId: string) => {
      let { data } = await supabaseBrowser
        .schema("phase2")
        .from("enrollments")
        .select("course_id, product_id, bundle_id, users!inner(auth_user_id)")
        .eq("users.auth_user_id", userId)
        .eq("status", "active");

      if (!data || data.length === 0) {
        const { data: directData } = await supabaseBrowser
          .schema("phase2")
          .from("enrollments")
          .select("course_id, product_id, bundle_id")
          .eq("user_id", userId)
          .eq("status", "active");
        if (directData && directData.length > 0) {
          data = directData.map((d) => ({ ...d, users: [] }));
        }
      }

      if (data) {
        const courseIds = new Set<string>();
        const planKeys = new Set<string>();
        const courseMap: Record<string, string> = {};
        
        const allCourseAndProductIds = Array.from(
          new Set(data.flatMap((e: any) => [e.course_id, e.product_id].filter(Boolean)))
        );
        let resolvedProducts: Record<string, string> = {};
        let resolvedMaincourses: Record<string, string> = {};
        
        if (allCourseAndProductIds.length > 0) {
          try {
            const { data: mcData } = await supabaseBrowser
              .from("maincourses")
              .select("id, product_id")
              .or(
                `id.in.(${allCourseAndProductIds.join(",")}),product_id.in.(${allCourseAndProductIds.join(",")})`
              );
              
            if (mcData) {
              mcData.forEach((mc: any) => {
                if (mc.id) {
                  resolvedMaincourses[mc.id] = mc.id;
                  if (mc.product_id) {
                    resolvedProducts[mc.id] = mc.product_id;
                    resolvedMaincourses[mc.product_id] = mc.id;
                  }
                }
              });
            }
          } catch (mcErr) {
            console.error("Failed to resolve maincourses mapping:", mcErr);
          }
        }

        const PRO_UUID = "196003df-766a-44a8-8c5c-ab0f6568431b".toLowerCase();
        const STARTER_UUID = "350edd44-752b-454a-8bf3-0ffb1915fd78".toLowerCase();
        const PREMIUM_UUID = "38518a2c-79c7-4776-8198-ab4a3889d24f".toLowerCase();

        const classifyTier = (bId?: string | null): string => {
          if (!bId) return "starter";
          const lower = String(bId).toLowerCase().trim();
          if (lower === PRO_UUID || lower === "pro" || lower.includes("pro plan") || lower === "pro-plan") return "pro";
          if (lower === PREMIUM_UUID || lower === "premium" || lower.includes("premium plan") || lower.includes("live sessions")) return "premium";
          if (lower === STARTER_UUID || lower === "starter" || lower.includes("starter plan") || lower === "starter-plan") return "starter";
          return "starter";
        };

        data.forEach((e: any) => {
          const maincourseId = e.course_id ? String(e.course_id) : (e.product_id ? resolvedMaincourses[e.product_id] : null);
          const finalProductId = e.product_id || (e.course_id ? resolvedProducts[e.course_id] : null);

          if (maincourseId) {
            courseIds.add(maincourseId);
            courseMap[maincourseId] = maincourseId;
          }
          if (finalProductId) {
            courseIds.add(String(finalProductId));
            if (maincourseId) {
              courseMap[String(finalProductId)] = maincourseId;
            }
          }
          
          const tierSlug = classifyTier(e.bundle_id);

          if (maincourseId) {
            if (e.bundle_id) planKeys.add(`${maincourseId}::${e.bundle_id}`);
            planKeys.add(`${maincourseId}::${tierSlug}`);
          }
          if (finalProductId) {
            if (e.bundle_id) planKeys.add(`${finalProductId}::${e.bundle_id}`);
            planKeys.add(`${finalProductId}::${tierSlug}`);
          }
        });

        setEnrolledCourseIds(courseIds);
        setEnrolledPlanKeys(planKeys);
        setEnrolledCourseMap(courseMap);
      }
    };

    // Check active session on mount
    supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const lastSignInAt = new Date(session.user.last_sign_in_at || session.user.created_at).getTime();
        const daysSinceSignIn = (Date.now() - lastSignInAt) / (1000 * 60 * 60 * 24);

        if (daysSinceSignIn > 14) {
          supabaseBrowser.auth.signOut();
          return;
        }

        const fallbackName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.user_metadata?.username || session.user.email?.split("@")[0] || "";
        setUser({
          id: session.user.id,
          email: session.user.email || "",
          name: fallbackName,
        });
        localStorage.setItem("automate-current-user-id", session.user.id);
        window.dispatchEvent(new Event("cart-updated"));
        
        // Sync profile name from phase2.users
        fetchUserProfile(session.user.id, fallbackName);

        const hasEmailProvider = session.user.app_metadata?.providers?.includes('email');
        const hasSetPassword = session.user.user_metadata?.has_set_password === true;
        
        // If they created their account within the last 15 seconds, it's a sign up.
        const createdAt = new Date(session.user.created_at).getTime();
        const isFirstLogin = Math.abs(lastSignInAt - createdAt) < 15000;
        
        if (!hasEmailProvider && !hasSetPassword && isFirstLogin) {
          setNeedsPassword(true);
          setIsLoggedIn(false);
          setIsOpen(true);
        } else {
          setIsLoggedIn(true);
          setNeedsPassword(false);
          fetchEnrollments(session.user.id);

          // If we have a pending action in sessionStorage from an OAuth redirect, execute it!
          const savedAction = sessionStorage.getItem("pendingAuthAction");
          if (savedAction) {
            try {
              const action = JSON.parse(savedAction) as PendingAction;
              if (action) {
                sessionStorage.removeItem("pendingAuthAction");
                // Execute it
                setTimeout(() => {
                  if (action.type === "addToCart" && typeof action.payload === "object") {
                    addToCart(action.payload as CartItem);
                  } else if (action.type === "buyNow" && typeof action.payload === "string") {
                    window.location.href = action.payload;
                  }
                }, 500);
              }
            } catch (e) {
              console.error("Failed to parse pendingAuthAction", e);
            }
          }
        }
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const lastSignInAt = new Date(session.user.last_sign_in_at || session.user.created_at).getTime();
        const daysSinceSignIn = (Date.now() - lastSignInAt) / (1000 * 60 * 60 * 24);

        if (daysSinceSignIn > 14) {
          supabaseBrowser.auth.signOut();
          return;
        }

        const fallbackName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.user_metadata?.username || session.user.email?.split("@")[0] || "";
        setUser({
          id: session.user.id,
          email: session.user.email || "",
          name: fallbackName,
        });
        localStorage.setItem("automate-current-user-id", session.user.id);
        window.dispatchEvent(new Event("cart-updated"));
        
        // Sync profile name from phase2.users
        fetchUserProfile(session.user.id, fallbackName);

        const hasEmailProvider = session.user.app_metadata?.providers?.includes('email');
        const hasSetPassword = session.user.user_metadata?.has_set_password === true;
        
        // If they created their account within the last 15 seconds, it's a sign up.
        const createdAt = new Date(session.user.created_at).getTime();
        const isFirstLogin = Math.abs(lastSignInAt - createdAt) < 15000;
        
        if (!hasEmailProvider && !hasSetPassword && isFirstLogin) {
          setNeedsPassword(true);
          setIsLoggedIn(false);
          setIsOpen(true);
        } else {
          setIsLoggedIn(true);
          setNeedsPassword(false);
          fetchEnrollments(session.user.id);
        }
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setEnrolledCourseIds(new Set());
        setEnrolledPlanKeys(new Set());
        setEnrolledCourseMap({});
        setNeedsPassword(false);
        localStorage.removeItem("automate-current-user-id");
        window.dispatchEvent(new Event("cart-updated"));
      }
    });

    // Keep profile and enrollments fresh when window regains focus or tab is revisited
    let lastSyncedAt = 0;
    const handleSyncProfile = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastSyncedAt < 1000) return;
      lastSyncedAt = now;

      supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) {
          fetchUserProfile(session.user.id);
          fetchEnrollments(session.user.id);
        }
      });
    };

    window.addEventListener("focus", handleSyncProfile);
    document.addEventListener("visibilitychange", handleSyncProfile);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", handleSyncProfile);
      document.removeEventListener("visibilitychange", handleSyncProfile);
    };
  }, []);

  const openAuth = useCallback((action?: PendingAction) => {
    setPendingAction(action ?? null);
    if (action) {
      sessionStorage.setItem("pendingAuthAction", JSON.stringify(action));
    } else {
      sessionStorage.removeItem("pendingAuthAction");
    }
    setIsOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setIsOpen(false);
    sessionStorage.removeItem("pendingAuthAction");
    if (needsPassword) {
      supabaseBrowser.auth.signOut();
      setNeedsPassword(false);
      setUser(null);
    }
  }, [needsPassword]);

  const executePendingAction = useCallback(() => {
    setIsOpen(false);
    sessionStorage.removeItem("pendingAuthAction");
    if (pendingAction?.type === "addToCart" && typeof pendingAction.payload === "object") {
      addToCart(pendingAction.payload);
    } else if (pendingAction?.type === "buyNow" && typeof pendingAction.payload === "string") {
      window.location.href = pendingAction.payload;
    }
    setPendingAction(null);
  }, [pendingAction]);

  const onPasswordSet = useCallback(() => {
    setNeedsPassword(false);
    setIsLoggedIn(true);
    const savedActionStr = sessionStorage.getItem("pendingAuthAction");
    if (savedActionStr || pendingAction) {
      if (!pendingAction && savedActionStr) {
        try {
          const action = JSON.parse(savedActionStr) as PendingAction;
          setPendingAction(action);
          setTimeout(() => {
            setIsOpen(false);
            sessionStorage.removeItem("pendingAuthAction");
            if (action?.type === "addToCart" && typeof action.payload === "object") {
              addToCart(action.payload);
            } else if (action?.type === "buyNow" && typeof action.payload === "string") {
              window.location.href = action.payload;
            }
            setPendingAction(null);
          }, 0);
          return;
        } catch (e) {
          console.error(e);
        }
      }
      executePendingAction();
    } else {
      setIsOpen(false);
    }
  }, [pendingAction, executePendingAction]);

  const logout = useCallback(async () => {
    await supabaseBrowser.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isOpen,
        openAuth,
        closeAuth,
        pendingAction,
        isLoggedIn,
        user,
        executePendingAction,
        needsPassword,
        onPasswordSet,
        logout,
        enrolledCourseIds,
        enrolledPlanKeys,
        enrolledCourseMap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
