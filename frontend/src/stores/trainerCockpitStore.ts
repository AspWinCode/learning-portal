import { create } from 'zustand';

type SelectedLessonRef = {
  groupId: number;
  lessonDate: string;
  startTime: string;
  endTime: string;
} | null;

interface TrainerCockpitStore {
  selectedLesson: SelectedLessonRef;
  selectedStudentId: number | null;
  setSelectedLesson: (lesson: SelectedLessonRef) => void;
  setSelectedStudentId: (studentId: number | null) => void;
  resetGradeFlow: () => void;
}

export const useTrainerCockpitStore = create<TrainerCockpitStore>((set) => ({
  selectedLesson: null,
  selectedStudentId: null,
  setSelectedLesson: (lesson) => set({ selectedLesson: lesson }),
  setSelectedStudentId: (studentId) => set({ selectedStudentId: studentId }),
  resetGradeFlow: () => set({ selectedLesson: null, selectedStudentId: null }),
}));
