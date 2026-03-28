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

/** Provider interface — implementations can be swapped */
export interface AIProvider {
  generateReteachPack(clusterContext: ClusterContext): Promise<ReteachPack>;
  generateQuickPoll(clusterContext: ClusterContext): Promise<AIQuickPollSuggestion>;
  generateSessionStarter(topic: string, subject: string, language: string): Promise<AISessionStarter>;
  generateSessionSummary(summaryInput: SessionSummaryAIInput): Promise<AISessionSummary>;
  generateWeeklyInsight(summaryData: unknown): Promise<AIWeeklyCoaching>;
}

export interface VoiceProvider {
  transcribe(audioUri: string): Promise<string>;
  speak(text: string, locale: string): Promise<string>;
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
