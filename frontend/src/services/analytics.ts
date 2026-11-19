export interface AnalyticsData {
  period: { days: number; from: string; to: string; timeZone: string };
  trackingSince: string | null;
  metrics: {
    sessions: number; started: number; turns: number; answers: number; clarifications: number;
    humanRequests: number; appointments: number; offers: number; scheduled: number;
    positive: number; negative: number; ratings: number; satisfied: number;
    averageRating: number | null; expired: number; schedulingRate: number | null;
    resolutionRate: number | null; csat: number | null;
  };
  daily: { date: string; sessions: number; answers: number; appointments: number; expired: number }[];
  topMenus: { label: string; count: number }[];
  topQuestions: { label: string; count: number }[];
  expiredByStage: { stage: string | null; count: number }[];
  answerTypes: { kind: string | null; count: number }[];
}
