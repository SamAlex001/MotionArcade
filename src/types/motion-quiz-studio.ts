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
