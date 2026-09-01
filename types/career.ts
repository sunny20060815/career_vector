export const FORECAST_YEARS = [2026, 2027, 2028] as const;

export type ForecastYear = (typeof FORECAST_YEARS)[number];

export type QueryIntent =
  | "career_recommendation"
  | "skill_trend"
  | "city_recommendation"
  | "job_comparison"
  | "skill_growth";

export type EducationLevel =
  | "secondary"
  | "associate"
  | "bachelor"
  | "master"
  | "doctor";

export interface ParsedCareerQuery {
  skills: string[];
  occupationKeywords: string[];
  cities: string[];
  salaryMinYuan: number | null;
  salaryMaxYuan: number | null;
  experienceYears: number | null;
  education: EducationLevel | null;
  forecastYear: ForecastYear;
  intent: QueryIntent;
  programKey: string | null;
  school: string | null;
  cohort: string | null;
  major: string | null;
}
