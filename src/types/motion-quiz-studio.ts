/**
 * MotionArcade — touchless AR arcade gaming platform
 * Copyright (C) 2025-2026 Kartik Hawelikar, Sam Alex, Shubham Bolave, and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export interface QuizQuestion {
  id: string;
  question: string;
  options: [string, string, string, string]; // 4 options for fingers 1, 2, 3, 4
  correctOption: 1 | 2 | 3 | 4; // 1-indexed finger count
  points: number; // positive score earned (default 10)
  penalty: number; // negative score penalty (default 0)
  timeLimit: number; // seconds allowed (default 15)
  explanation?: string; // optional explanation shown during feedback
}

export interface QuizDeck {
  id: string;
  name: string;
  description?: string;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
  questions: QuizQuestion[];
  isPreset?: boolean; // built-in preset deck flag
}

export interface GameSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  holdTimeSeconds: number; // default 3
  showExplanations: boolean;
}

export type MotionQuizGameState = 
  | 'DECK_SELECTION' 
  | 'DECK_EDITOR' 
  | 'LOADING_GAME' 
  | 'PLAYING' 
  | 'HOLDING' 
  | 'FEEDBACK' 
  | 'GAME_OVER';
