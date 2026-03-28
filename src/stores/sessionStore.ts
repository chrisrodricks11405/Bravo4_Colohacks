import { create } from "zustand";
import type {
  SessionMeta,
  SessionStatus,
  PulseAggregateSnapshot,
  ConfusionTrendPoint,
  MisconceptionClusterSummary,
  LessonMarker,
  InterventionActionPayload,
  QuickPollPayload,
  PollDistributionSnapshot,
} from "../types";

interface SessionState {
  // Current session
  session: SessionMeta | null;
  isSessionActive: boolean;

  // Live pulse data
  currentPulse: PulseAggregateSnapshot | null;
  confusionTrend: ConfusionTrendPoint[];

  // Clusters and questions
  clusters: MisconceptionClusterSummary[];
  pinnedClusterIds: string[];
  selectedClusterId: string | null;
  isClusterDrawerOpen: boolean;

  // Lesson markers
  lessonMarkers: LessonMarker[];

  // Interventions
  interventions: InterventionActionPayload[];

  // Active poll
  activePoll: QuickPollPayload | null;
  pollDistribution: PollDistributionSnapshot | null;

  // Actions
  setSession: (session: SessionMeta | null) => void;
  patchSession: (updates: Partial<SessionMeta>) => void;
  updateSessionStatus: (status: SessionStatus) => void;
  updateParticipantCount: (count: number) => void;

  updatePulse: (pulse: PulseAggregateSnapshot | null) => void;
  addTrendPoint: (point: ConfusionTrendPoint) => void;
  setConfusionTrend: (points: ConfusionTrendPoint[]) => void;

  setClusters: (clusters: MisconceptionClusterSummary[]) => void;
  addCluster: (cluster: MisconceptionClusterSummary) => void;
  updateCluster: (id: string, updates: Partial<MisconceptionClusterSummary>) => void;
  setClusterDrawerOpen: (open: boolean) => void;
  selectCluster: (id: string | null) => void;
  toggleClusterPin: (id: string) => void;
  clearClusterPin: (id: string) => void;

  setLessonMarkers: (markers: LessonMarker[]) => void;
  addLessonMarker: (marker: LessonMarker) => void;
  setInterventions: (interventions: InterventionActionPayload[]) => void;
  addIntervention: (intervention: InterventionActionPayload) => void;

  setActivePoll: (poll: QuickPollPayload | null) => void;
  updatePollDistribution: (distribution: PollDistributionSnapshot | null) => void;

  resetSession: () => void;
}

const initialState = {
  session: null,
  isSessionActive: false,
  currentPulse: null,
  confusionTrend: [],
  clusters: [],
  pinnedClusterIds: [],
  selectedClusterId: null,
  isClusterDrawerOpen: false,
  lessonMarkers: [],
  interventions: [],
  activePoll: null,
  pollDistribution: null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,

  setSession: (session) =>
    set((state) => {
      const isSameSession =
        Boolean(session) &&
        Boolean(state.session) &&
        state.session?.id === session?.id;

      if (isSameSession) {
        return {
          session,
          isSessionActive: session?.status === "active",
        };
      }

      return {
        ...initialState,
        session,
        isSessionActive: session?.status === "active",
      };
    }),

  patchSession: (updates) =>
    set((state) => {
      if (!state.session) {
        return {
          session: null,
          isSessionActive: false,
        };
      }

      const nextSession = { ...state.session, ...updates };

      return {
        session: nextSession,
        isSessionActive: nextSession.status === "active",
      };
    }),

  updateSessionStatus: (status) =>
    set((state) => {
      if (!state.session) {
        return {
          session: null,
          isSessionActive: false,
        };
      }

      return {
        session: { ...state.session, status },
        isSessionActive: status === "active",
      };
    }),

  updateParticipantCount: (count) =>
    set((state) => ({
      session: state.session
        ? { ...state.session, participantCount: count }
        : null,
    })),

  updatePulse: (pulse) => set({ currentPulse: pulse }),

  addTrendPoint: (point) =>
    set((state) => ({
      confusionTrend: [...state.confusionTrend.slice(-299), point],
    })),

  setConfusionTrend: (points) =>
    set({
      confusionTrend: points.slice(-300),
    }),

  setClusters: (clusters) =>
    set((state) => {
      const nextPinnedIds = state.pinnedClusterIds.filter((id) =>
        clusters.some((cluster) => cluster.id === id)
      );
      const nextSelectedClusterId =
        state.selectedClusterId && clusters.some((cluster) => cluster.id === state.selectedClusterId)
          ? state.selectedClusterId
          : clusters[0]?.id ?? null;

      return {
        clusters,
        pinnedClusterIds: nextPinnedIds,
        selectedClusterId: nextSelectedClusterId,
      };
    }),

  addCluster: (cluster) =>
    set((state) => ({
      clusters: [cluster, ...state.clusters],
      selectedClusterId: state.selectedClusterId ?? cluster.id,
    })),

  updateCluster: (id, updates) =>
    set((state) => ({
      clusters: state.clusters.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  setClusterDrawerOpen: (open) => set({ isClusterDrawerOpen: open }),

  selectCluster: (id) => set({ selectedClusterId: id }),

  toggleClusterPin: (id) =>
    set((state) => ({
      pinnedClusterIds: state.pinnedClusterIds.includes(id)
        ? state.pinnedClusterIds.filter((clusterId) => clusterId !== id)
        : [id, ...state.pinnedClusterIds],
      selectedClusterId: id,
    })),

  clearClusterPin: (id) =>
    set((state) => ({
      pinnedClusterIds: state.pinnedClusterIds.filter((clusterId) => clusterId !== id),
    })),

  setLessonMarkers: (markers) =>
    set({
      lessonMarkers: markers,
    }),

  addLessonMarker: (marker) =>
    set((state) => ({
      lessonMarkers: [...state.lessonMarkers, marker],
    })),

  setInterventions: (interventions) =>
    set({
      interventions: [...interventions].sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp)
      ),
    }),

  addIntervention: (intervention) =>
    set((state) => ({
      interventions: [...state.interventions.filter((item) => item.id !== intervention.id), intervention]
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
    })),

  setActivePoll: (poll) => set({ activePoll: poll }),

  updatePollDistribution: (distribution) =>
    set({ pollDistribution: distribution }),

  resetSession: () => set(initialState),
}));
