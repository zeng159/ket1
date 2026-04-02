export interface Word {
  id: string;
  english: string;
  chinese: string;
  explanation?: string;
  sentence?: string;
  imageUrl?: string;
  isMastered: boolean;
  reviewLevel: number; // 0: new, 1: 3h, 2: 1d, 3: 3d, 4: 7d, 5: mastered
  nextReviewAt?: number; // timestamp
}

export interface AppState {
  words: Word[];
  currentIndex: number;
  showDetail: boolean;
  isFinished: boolean;
}
