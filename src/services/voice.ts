import type {
  SpokenExplanationAudio,
  SpokenExplanationOptions,
  VoiceProvider,
  VoiceProviderCapabilities,
  VoiceTranscriptionOptions,
} from "../types";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

const teacherAIFunction =
  process.env.EXPO_PUBLIC_SUPABASE_TEACHER_AI_FUNCTION ?? "teacher-ai";

export const VOICE_TTS_OPTIONS = [
  "marin",
  "cedar",
  "alloy",
  "coral",
  "sage",
] as const;

export const VOICE_LOCALE_OPTIONS = [
  { label: "English (US)", value: "en-US" },
  { label: "Hindi (India)", value: "hi-IN" },
  { label: "Marathi (India)", value: "mr-IN" },
  { label: "Kannada (India)", value: "kn-IN" },
] as const;

const DEFAULT_VOICE = "marin";

function resolveVoiceProviderMode() {
  return (process.env.EXPO_PUBLIC_VOICE_PROVIDER ?? "edge").trim().toLowerCase();
}

export function isVoiceProviderConfigured() {
  return resolveVoiceProviderMode() === "edge" && hasSupabaseConfig;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("We could not read the recorded audio."));
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("We could not prepare the recorded audio for upload."));
    };
    reader.readAsDataURL(blob);
  });
}

async function loadAudioAsBase64(audioUri: string) {
  const response = await fetch(audioUri);
  const audioBlob = await response.blob();

  if (audioBlob.size > 8_000_000) {
    throw new Error("Keep voice notes under about a minute so transcription stays fast.");
  }

  const dataUrl = await blobToDataUrl(audioBlob);
  const match = /^data:(.*?);base64,(.*)$/i.exec(dataUrl);

  if (!match) {
    throw new Error("We could not encode the recorded audio.");
  }

  return {
    audioBase64: match[2],
    mimeType: match[1] || "audio/m4a",
  };
}

function sanitizeVoice(value?: string) {
  if (!value) {
    return DEFAULT_VOICE;
  }

  return VOICE_TTS_OPTIONS.includes(value as (typeof VOICE_TTS_OPTIONS)[number])
    ? value
    : DEFAULT_VOICE;
}

export class StubVoiceProvider implements VoiceProvider {
  getCapabilities(): VoiceProviderCapabilities {
    return {
      available: false,
      transcriptionAvailable: false,
      speechGenerationAvailable: false,
      voices: [...VOICE_TTS_OPTIONS],
      defaultVoice: DEFAULT_VOICE,
      reason: "Voice provider is not configured.",
    };
  }

  async transcribeTeacherVoicePrompt(): Promise<string> {
    throw new Error("Voice transcription is unavailable right now.");
  }

  async generateSpokenExplanation(): Promise<SpokenExplanationAudio> {
    throw new Error("Spoken explanations are unavailable right now.");
  }
}

class EdgeFunctionVoiceProvider implements VoiceProvider {
  getCapabilities(): VoiceProviderCapabilities {
    const configured = isVoiceProviderConfigured();

    return {
      available: configured,
      transcriptionAvailable: configured,
      speechGenerationAvailable: configured,
      voices: [...VOICE_TTS_OPTIONS],
      defaultVoice: DEFAULT_VOICE,
      reason: configured
        ? undefined
        : "Configure Supabase and the edge voice provider to enable voice tools.",
    };
  }

  async transcribeTeacherVoicePrompt(
    audioUri: string,
    options?: VoiceTranscriptionOptions
  ): Promise<string> {
    if (!isVoiceProviderConfigured()) {
      throw new Error("Voice transcription is unavailable until the provider is configured.");
    }

    const payload = await loadAudioAsBase64(audioUri);
    const { data, error } = await supabase.functions.invoke(teacherAIFunction, {
      body: {
        action: "transcribeTeacherVoicePrompt",
        ...payload,
        locale: options?.locale,
        hint: options?.hint,
      },
    });

    if (error) {
      throw error;
    }

    if (!data || typeof data !== "object" || !("text" in data)) {
      throw new Error("Voice transcription returned an unexpected response.");
    }

    const transcript = (data as { text?: string }).text?.trim();

    if (!transcript) {
      throw new Error("The voice provider returned an empty transcript.");
    }

    return transcript;
  }

  async generateSpokenExplanation(
    text: string,
    locale: string,
    options?: SpokenExplanationOptions
  ): Promise<SpokenExplanationAudio> {
    if (!isVoiceProviderConfigured()) {
      throw new Error("Spoken explanations are unavailable until the provider is configured.");
    }

    const normalizedText = text.replace(/\s+/g, " ").trim();

    if (!normalizedText) {
      throw new Error("Add some explanation text before generating speech.");
    }

    const selectedVoice = sanitizeVoice(options?.voice);
    const { data, error } = await supabase.functions.invoke(teacherAIFunction, {
      body: {
        action: "generateSpokenExplanation",
        text: normalizedText.slice(0, 1_800),
        locale,
        voice: selectedVoice,
      },
    });

    if (error) {
      throw error;
    }

    if (!data || typeof data !== "object" || !("audioBase64" in data)) {
      throw new Error("The voice provider returned an unexpected speech payload.");
    }

    const audioBase64 = (data as { audioBase64?: string }).audioBase64?.trim();
    const mimeType =
      (data as { mimeType?: string }).mimeType?.trim() || "audio/wav";

    if (!audioBase64) {
      throw new Error("The voice provider did not return any audio.");
    }

    return {
      uri: `data:${mimeType};base64,${audioBase64}`,
      mimeType,
      voice: selectedVoice,
      source: "edge",
    };
  }
}

export const voiceProvider: VoiceProvider = isVoiceProviderConfigured()
  ? new EdgeFunctionVoiceProvider()
  : new StubVoiceProvider();
