/** AI provider abstraction types */

export interface ReteachPack {
  simpleExplanation: string;
  localLanguageExplanation?: string;
  analogyExplanation: string;
  boardScript: string;
  misconceptionExample: string;
}

export interface AIQuickPollSuggestion {
  question: string;
  options: string[];
  correctIndex: number;
  rationale: string;
}

export interface TeacherVoicePollContext {
  subject: string;
  topic: string;
  language: string;
  gradeClass?: string;
}

export interface AISessionStarter {
  likelyMisconceptions: string[];
  starterPoll?: AIQuickPollSuggestion;
  bilingualExplanation?: string;
  analogyPrompt?: string;
  expectedDifficultSteps: string[];
}

export interface AIWeeklyCoaching {
  mostDifficultTopic: string;
  worstTimeSlot: string;
  bestInterventionStyle: string;
  revisionPriorities: string[];
  narrative: string;
}

export interface SessionSummaryAIInput {
  subject: string;
  topic: string;
  gradeClass: string;
  durationMinutes: number;
  totalParticipants: number;
  peakMomentLabel?: string;
  peakConfusionIndex: number;
  peakLostPercent: number;
  endingConfusionIndex: number;
  endingLostPercent: number;
  topClusterTitle?: string;
  topClusterAffectedCount?: number;
  topReasonChip?: string;
  dominantPollOption?: string;
  dominantPollPercent?: number;
  bestInterventionType?: string;
  bestInterventionRecovery?: number;
  recoveryScore: number;
}

export interface AISessionSummary {
  narrative: string;
  suggestedOpeningActivity: string;
  source: "edge" | "fallback";
}

export interface VoiceReflectionContext {
  subject: string;
  topic: string;
  gradeClass: string;
  suggestedNextActivity?: string;
}

export interface VoiceReflectionAction {
  id: string;
  title: string;
  detail: string;
  timing: "opening" | "check_in" | "follow_up";
}

export interface VoiceReflectionPlan {
  summary: string;
  actions: VoiceReflectionAction[];
  source: "edge" | "fallback";
}

export interface SpokenExplanationAudio {
  uri: string;
  mimeType: string;
  voice?: string;
  source: "edge" | "fallback";
}

export interface VoiceProviderCapabilities {
  available: boolean;
  transcriptionAvailable: boolean;
  speechGenerationAvailable: boolean;
  voices: string[];
  defaultVoice?: string;
  reason?: string;
}

export interface VoiceTranscriptionOptions {
  locale?: string;
  hint?: string;
}

export interface SpokenExplanationOptions {
  voice?: string;
}

/** Provider interface — implementations can be swapped */
export interface AIProvider {
  generateReteachPack(clusterContext: ClusterContext): Promise<ReteachPack>;
  generateQuickPoll(clusterContext: ClusterContext): Promise<AIQuickPollSuggestion>;
  generateTeacherVoicePoll(
    prompt: string,
    context: TeacherVoicePollContext
  ): Promise<AIQuickPollSuggestion>;
  generateSessionStarter(topic: string, subject: string, language: string): Promise<AISessionStarter>;
  generateSessionSummary(summaryInput: SessionSummaryAIInput): Promise<AISessionSummary>;
  structureVoiceReflection(
    transcript: string,
    context: VoiceReflectionContext
  ): Promise<VoiceReflectionPlan>;
  generateWeeklyInsight(summaryData: unknown): Promise<AIWeeklyCoaching>;
}

export interface VoiceProvider {
  getCapabilities(): VoiceProviderCapabilities;
  transcribeTeacherVoicePrompt(
    audioUri: string,
    options?: VoiceTranscriptionOptions
  ): Promise<string>;
  generateSpokenExplanation(
    text: string,
    locale: string,
    options?: SpokenExplanationOptions
  ): Promise<SpokenExplanationAudio>;
}

export interface ClusterContext {
  clusterId: string;
  title: string;
  summary: string;
  representativeQuestion: string;
  topic: string;
  subject: string;
  language: string;
  affectedCount: number;
  reasonChip?: string;
  translation?: string;
  suggestedInterventions?: string[];
}
