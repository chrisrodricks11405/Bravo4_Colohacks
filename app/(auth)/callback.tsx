import React, { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { StateScreen } from "../../src/components/app/StateScreen";
import { supabase } from "../../src/lib/supabase";

function getQueryParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const currentUrl = Linking.useURL();
  const [message, setMessage] = useState("Finishing your Supabase sign-in.");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isActive = true;

    const handleCallback = async () => {
      if (!currentUrl) {
        if (isActive) {
          setHasError(true);
          setMessage("We could not read the sign-in link. Please request a new magic link.");
        }
        return;
      }

      const normalizedUrl = currentUrl.includes("#")
        ? currentUrl.replace("#", "?")
        : currentUrl;
      const { queryParams } = Linking.parse(normalizedUrl);

      try {
        const errorDescription = getQueryParam(queryParams?.error_description);
        if (errorDescription) {
          throw new Error(errorDescription);
        }

        const accessToken = getQueryParam(queryParams?.access_token);
        const refreshToken = getQueryParam(queryParams?.refresh_token);
        const tokenHash = getQueryParam(queryParams?.token_hash);
        const code = getQueryParam(queryParams?.code);
        const type = getQueryParam(queryParams?.type);

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as EmailOtpType,
          });

          if (error) {
            throw error;
          }
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
        } else {
          throw new Error("Missing token details in the sign-in link.");
        }

        if (isActive) {
          setMessage("Sign-in confirmed. Opening your home screen.");
          router.replace("/");
        }
      } catch (error) {
        if (isActive) {
          setHasError(true);
          setMessage(
            error instanceof Error
              ? error.message
              : "We could not finish sign-in. Please try again."
          );
        }
      }
    };

    handleCallback();

    return () => {
      isActive = false;
    };
  }, [currentUrl, router]);

  return (
    <StateScreen
      title={hasError ? "Sign-in link expired" : "Signing you in"}
      message={message}
      tone="dark"
      loading={!hasError}
    />
  );
}
