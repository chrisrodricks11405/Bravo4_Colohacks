import { useCallback, useEffect, useRef, useState } from "react";
import { Audio, type AVPlaybackStatus } from "expo-av";
import { prepareAudioPlaybackMode } from "../services/audioSession";

export function useAudioPlayback() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [activeUri, setActiveUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    const existingSound = soundRef.current;
    soundRef.current = null;

    if (existingSound) {
      try {
        await existingSound.stopAsync();
      } catch {
        // Ignore stop failures during cleanup.
      }

      try {
        await existingSound.unloadAsync();
      } catch {
        // Ignore unload failures during cleanup.
      }
    }

    setActiveUri(null);
    setIsPlaying(false);
  }, []);

  const play = useCallback(
    async (uri: string) => {
      if (!uri) {
        throw new Error("No audio is available for playback.");
      }

      setPlaybackError(null);

      if (soundRef.current) {
        await stop();
      }

      await prepareAudioPlaybackMode();

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status: AVPlaybackStatus) => {
          if (!status.isLoaded) {
            if (status.error) {
              setPlaybackError(status.error);
            }

            setIsPlaying(false);
            return;
          }

          setIsPlaying(status.isPlaying);

          if (status.didJustFinish) {
            void stop();
          }
        }
      );

      soundRef.current = sound;
      setActiveUri(uri);
      setIsPlaying(true);
    },
    [stop]
  );

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    activeUri,
    isPlaying,
    playbackError,
    play,
    stop,
  };
}
