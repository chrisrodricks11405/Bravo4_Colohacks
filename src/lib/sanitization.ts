const BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const MONITORING_SECRET_KEY_REGEX =
  /token|password|authorization|cookie|secret|session|email|anonymous.?id|qr.?payload/i;

interface SanitizeTextOptions {
  allowMultiline?: boolean;
  fallback?: string;
  maxLength?: number;
}

function sanitizeWhitespace(value: string, allowMultiline: boolean) {
  if (!allowMultiline) {
    return value.replace(/\s+/g, " ").trim();
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeText(
  value: unknown,
  options: SanitizeTextOptions = {}
) {
  const { allowMultiline = false, fallback = "", maxLength } = options;

  if (typeof value !== "string") {
    return fallback;
  }

  let sanitized = value
    .normalize("NFKC")
    .replace(BIDI_CONTROL_REGEX, "")
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(CONTROL_CHAR_REGEX, "")
    .replace(/\t/g, " ");

  if (!allowMultiline) {
    sanitized = sanitized.replace(/[\r\n]+/g, " ");
  }

  sanitized = sanitizeWhitespace(sanitized, allowMultiline);

  if (sanitized.length === 0) {
    return fallback;
  }

  if (maxLength && sanitized.length > maxLength) {
    return sanitized.slice(0, maxLength).trimEnd();
  }

  return sanitized;
}

export function sanitizeSessionField(value: unknown, maxLength = 80) {
  return sanitizeText(value, { maxLength });
}

export function sanitizeStudentQuestionText(value: unknown) {
  return sanitizeText(value, {
    allowMultiline: true,
    maxLength: 280,
  });
}

export function sanitizeClusterTitle(value: unknown) {
  return sanitizeText(value, { maxLength: 96 });
}

export function sanitizeClusterSummary(value: unknown) {
  return sanitizeText(value, {
    allowMultiline: true,
    maxLength: 240,
  });
}

export function sanitizeRepresentativeQuestion(value: unknown) {
  return sanitizeText(value, {
    allowMultiline: true,
    maxLength: 280,
  });
}

export function sanitizePollQuestion(value: unknown) {
  return sanitizeText(value, {
    allowMultiline: true,
    maxLength: 200,
  });
}

export function sanitizePollOption(value: unknown) {
  return sanitizeText(value, { maxLength: 100 });
}

export function sanitizeTeacherNote(value: unknown) {
  return sanitizeText(value, {
    allowMultiline: true,
    maxLength: 400,
  });
}

export function sanitizeAnonymousId(value: unknown) {
  if (typeof value !== "string") {
    return "anonymous";
  }

  const sanitized = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);

  return sanitized.length > 0 ? sanitized : "anonymous";
}

export function sanitizeUrlForMonitoring(value: unknown) {
  const rawValue = sanitizeText(value, {
    allowMultiline: false,
    maxLength: 400,
  });

  if (!rawValue) {
    return rawValue;
  }

  try {
    const url = new URL(rawValue);

    ["token", "code", "access_token", "refresh_token"].forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    });

    return url.toString();
  } catch {
    return rawValue.replace(
      /([?&](?:token|code|access_token|refresh_token)=)[^&]+/gi,
      "$1[redacted]"
    );
  }
}

export function sanitizeObjectForMonitoring(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeText(value, {
      allowMultiline: true,
      maxLength: 400,
    });
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((entry) => sanitizeObjectForMonitoring(entry, depth + 1));
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce<Record<string, unknown>>((result, [key, entry]) => {
      result[key] = MONITORING_SECRET_KEY_REGEX.test(key)
        ? "[redacted]"
        : sanitizeObjectForMonitoring(entry, depth + 1);
      return result;
    }, {});
  }

  return undefined;
}
