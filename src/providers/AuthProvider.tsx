import React, { createContext, useContext, useEffect, useState } from "react";
import * as Linking from "expo-linking";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import {
  addMonitoringBreadcrumb,
  captureMonitoringException,
  setMonitoringUser,
} from "../lib/monitoring";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isConfigured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  isLoading: true,
  isConfigured: hasSupabaseConfig,
  signInWithPassword: async () => undefined,
  signUp: async () => undefined,
  sendMagicLink: async () => undefined,
  signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const hydrateSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (isMounted) {
          setSession(data.session ?? null);
          setMonitoringUser(data.session?.user ?? null);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setSession(null);
          setMonitoringUser(null);
          setIsLoading(false);
        }
        captureMonitoringException(error, {
          component: "AuthProvider.hydrateSession",
        });
      }
    };

    hydrateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (isMounted) {
        setSession(nextSession);
        setMonitoringUser(nextSession?.user ?? null);
        setIsLoading(false);
      }

      addMonitoringBreadcrumb({
        category: "auth",
        message: `Supabase auth event: ${event}`,
        data: {
          hasSession: Boolean(nextSession),
          userId: nextSession?.user?.id,
        },
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    isLoading,
    isConfigured: hasSupabaseConfig,
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        captureMonitoringException(error, {
          component: "AuthProvider.signInWithPassword",
        });
        throw error;
      }
    },
    signUp: async (email, password) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        captureMonitoringException(error, {
          component: "AuthProvider.signUp",
        });
        throw error;
      }
    },
    sendMagicLink: async (email) => {
      const redirectTo = Linking.createURL("/callback");
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });

      if (error) {
        captureMonitoringException(error, {
          component: "AuthProvider.sendMagicLink",
        });
        throw error;
      }
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        captureMonitoringException(error, {
          component: "AuthProvider.signOut",
        });
        throw error;
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
