export type IntelligenceFeatureKey =
  | "ai_classroom_twin"
  | "misconception_forecasting"
  | "ai_socratic_question_generator"
  | "multimodal_lesson_rebuilder"
  | "ai_learning_recovery_engine"
  | "peer_learning_orchestrator"
  | "explanation_style_adaptation"
  | "teacher_growth_copilot"
  | "learning_equity_lens";

export type IntelligenceFeatureCategory = "classroom" | "recovery" | "growth";

export type IntelligenceTone =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral"
  | "primary";

export interface IntelligenceMetric {
  label: string;
  value: string;
}

export interface IntelligenceSection {
  title: string;
  items: string[];
}

export interface IntelligenceFeature {
  key: IntelligenceFeatureKey;
  category: IntelligenceFeatureCategory;
  name: string;
  statusLabel: string;
  tone: IntelligenceTone;
  summary: string;
  detail: string;
  metrics: IntelligenceMetric[];
  sections: IntelligenceSection[];
  recommendedAction: string;
}

export interface IntelligenceDashboard {
  generatedAt: string;
  headline: string;
  summary: string;
  dataCoverageLabel: string;
  metrics: IntelligenceMetric[];
  features: IntelligenceFeature[];
}
