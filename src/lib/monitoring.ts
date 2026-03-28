import Constants from "expo-constants";
import type { User } from "@supabase/supabase-js";
import * as Sentry from "@sentry/react-native";
import type { SessionMeta } from "../types";
import {
  sanitizeObjectForMonitoring,
  sanitizeText,
  sanitizeUrlForMonitoring,
} from "./sanitization";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const APP_ENVIRONMENT =
  process.env.EXPO_PUBLIC_APP_ENV?.trim() || (__DEV__ ? "development" : "production");

let isMonitoringInitialized = false;

function resolveRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sanitizeBreadcrumbData(data: Record<string, unknown> | undefined) {
  if (!data) {
    return data;
  }

  return sanitizeObjectForMonitoring(data) as Record<string, unknown>;
}

export function initializeMonitoring() {
  if (isMonitoringInitialized) {
    return;
  }

  isMonitoringInitialized = true;

  if (!SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: true,
    debug: __DEV__,
    environment: APP_ENVIRONMENT,
    release: `${Constants.expoConfig?.slug ?? "classpulse-teacher"}@${
      Constants.expoConfig?.version ?? "1.0.0"
    }`,
    tracesSampleRate: resolveRate(
      process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      __DEV__ ? 1 : 0.25
    ),
    profilesSampleRate: resolveRate(
      process.env.EXPO_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE,
      __DEV__ ? 1 : 0.15
    ),
    attachStacktrace: true,
    sendDefaultPii: false,
    enableAutoPerformanceTracing: true,
    beforeBreadcrumb(breadcrumb) {
      const nextBreadcrumb = { ...breadcrumb };
      if (typeof nextBreadcrumb.message === "string") {
        nextBreadcrumb.message = sanitizeText(nextBreadcrumb.message, {
          allowMultiline: true,
          maxLength: 240,
        });
      }

      if (nextBreadcrumb.category?.includes("navigation") && nextBreadcrumb.data?.to) {
        nextBreadcrumb.data = {
          ...nextBreadcrumb.data,
          to: sanitizeUrlForMonitoring(nextBreadcrumb.data.to),
        };
      } else {
        nextBreadcrumb.data = sanitizeBreadcrumbData(nextBreadcrumb.data);
      }

      return nextBreadcrumb;
    },
    beforeSend(event) {
      return {
        ...event,
        request: event.request
          ? {
              ...event.request,
              url: sanitizeUrlForMonitoring(event.request.url),
              headers: sanitizeObjectForMonitoring(event.request.headers) as
                | Record<string, string>
                | undefined,
              data: sanitizeObjectForMonitoring(event.request.data),
            }
          : event.request,
        extra: sanitizeObjectForMonitoring(event.extra) as
          | Record<string, unknown>
          | undefined,
        contexts: sanitizeObjectForMonitoring(event.contexts) as
          | Record<string, Record<string, unknown>>
          | undefined,
        tags: sanitizeObjectForMonitoring(event.tags) as
          | Record<string, Primitive>
          | undefined,
        breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
          ...breadcrumb,
          message:
            typeof breadcrumb.message === "string"
              ? sanitizeText(breadcrumb.message, {
                  allowMultiline: true,
                  maxLength: 240,
                })
              : breadcrumb.message,
          data: sanitizeBreadcrumbData(breadcrumb.data),
        })),
      };
    },
  });

  Sentry.setTags({
    app_platform: Constants.platform?.ios ? "ios" : Constants.platform?.android ? "android" : "web",
    app_role: "teacher",
  });
}

type Primitive = string | number | boolean | null;

export function addMonitoringBreadcrumb(args: {
  category: string;
  level?: Sentry.SeverityLevel;
  message: string;
  data?: Record<string, unknown>;
}) {
  if (!SENTRY_DSN) {
    return;
  }

  Sentry.addBreadcrumb({
    category: args.category,
    level: args.level,
    message: sanitizeText(args.message, {
      allowMultiline: true,
      maxLength: 240,
    }),
    data: sanitizeBreadcrumbData(args.data),
  });
}

export function captureMonitoringException(
  error: unknown,
  context?: {
    component?: string;
    data?: Record<string, unknown>;
  }
) {
  if (!SENTRY_DSN) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context?.component) {
      scope.setTag("component", context.component);
    }

    if (context?.data) {
      scope.setContext(
        "capture_context",
        sanitizeObjectForMonitoring(context.data) as Record<string, unknown>
      );
    }

    Sentry.captureException(error);
  });
}

export function setMonitoringUser(user: User | null) {
  if (!SENTRY_DSN) {
    return;
  }

  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id,
    role: "teacher",
  });
}

export function setMonitoringSession(session: SessionMeta | null) {
  if (!SENTRY_DSN) {
    return;
  }

  if (!session) {
    Sentry.setContext("session", null);
    return;
  }

  Sentry.setContext("session", {
    id: session.id,
    status: session.status,
    mode: session.mode,
    participantCount: session.participantCount,
    subject: sanitizeText(session.subject, { maxLength: 80 }),
    topic: sanitizeText(session.topic, { maxLength: 120 }),
  });

  Sentry.setTags({
    session_mode: session.mode,
    session_status: session.status,
  });
}

export function setMonitoringTag(key: string, value: Primitive | undefined) {
  if (!SENTRY_DSN || value == null) {
    return;
  }

  Sentry.setTag(key, String(value));
}

export { Sentry };
