// Shared type definitions

export interface User {
  id: string;
  email: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  zodiacSign?: string;
  premiumTier?: 'free' | 'celestial' | 'cosmic';
}

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  bio?: string;
  photos: string[];
  birthChart?: BirthChart;
}

export interface BirthChart {
  sun: ZodiacPosition;
  moon: ZodiacPosition;
  ascendant: ZodiacPosition;
  planets: Record<string, ZodiacPosition>;
}

export interface ZodiacPosition {
  sign: string;
  degree: number;
  house?: number;
}

export interface Match {
  id: string;
  userId: string;
  matchedUserId: string;
  compatibilityScore: number;
  synastryReport?: SynastryReport;
  createdAt: string;
}

export interface SynastryReport {
  overallScore: number;
  aspects: Aspect[];
  strengths: string[];
  challenges: string[];
}

export interface Aspect {
  planet1: string;
  planet2: string;
  type: 'conjunction' | 'opposition' | 'trine' | 'square' | 'sextile';
  orb: number;
  interpretation: string;
}
