import { Audio } from "expo-av";

const RECORDING_AUDIO_MODE: Parameters<typeof Audio.setAudioModeAsync>[0] = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
};

const PLAYBACK_AUDIO_MODE: Parameters<typeof Audio.setAudioModeAsync>[0] = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
};

export async function prepareAudioPlaybackMode() {
  await Audio.setAudioModeAsync(PLAYBACK_AUDIO_MODE);
}

export async function startAudioRecording() {
  const permission = await Audio.requestPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Microphone access is needed to capture voice notes.");
  }

  await Audio.setAudioModeAsync(RECORDING_AUDIO_MODE);

  const created = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );

  return created.recording;
}

export async function stopAudioRecording(recording: Audio.Recording) {
  await recording.stopAndUnloadAsync();
  await prepareAudioPlaybackMode();

  const uri = recording.getURI();

  if (!uri) {
    throw new Error("The recording finished, but no audio file was returned.");
  }

  return uri;
}
