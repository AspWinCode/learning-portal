import { studentPortalClient, STUDENT_PORTAL_TOKEN_KEY } from './studentPortalClient';
import type { CourseCatalogItemOut } from '../types';

export interface StudentPortalProfile {
  id: number;
  full_name: string;
}

export interface StudentGrade {
  id: number;
  date: string;
  grade: number;
  topic_name: string;
  module_name: string;
  comment: string | null;
  trainer_name: string;
}

export interface UpcomingLesson {
  lesson_date: string;
  start_time: string;
  end_time: string | null;
  group_name: string | null;
  trainer_name: string;
  online_url?: string | null;
  kind: 'regular' | 'custom';
}

export const studentPortalApi = {
  login: async (login: string, password: string): Promise<{ access_token: string; student: StudentPortalProfile }> => {
    const response = await studentPortalClient.post('/api/student-portal/auth/login', { login, password });
    return response.data;
  },
  me: async (): Promise<StudentPortalProfile> => {
    const response = await studentPortalClient.get('/api/student-portal/me');
    return response.data;
  },
  listCourses: async (): Promise<CourseCatalogItemOut[]> => {
    const response = await studentPortalClient.get('/api/student-portal/courses');
    return response.data;
  },
  launchCourse: async (itemId: number): Promise<{ redirect_url: string }> => {
    const response = await studentPortalClient.post(`/api/student-portal/courses/${itemId}/launch`);
    return response.data;
  },
  getSchedule: async (): Promise<UpcomingLesson[]> => {
    const response = await studentPortalClient.get('/api/student-portal/schedule');
    return response.data;
  },
  getGrades: async (): Promise<StudentGrade[]> => {
    const response = await studentPortalClient.get('/api/student-portal/grades');
    return response.data;
  },
  changePassword: async (current_password: string, new_password: string): Promise<void> => {
    await studentPortalClient.post('/api/student-portal/change-password', { current_password, new_password });
  },
  getAbonement: async (): Promise<{ name: string; training_start_date: string | null } | null> => {
    try {
      const response = await studentPortalClient.get('/api/student-portal/abonement');
      return response.data;
    } catch {
      return null;
    }
  },
  saveToken: (token: string) => localStorage.setItem(STUDENT_PORTAL_TOKEN_KEY, token),
  getToken: (): string | null => localStorage.getItem(STUDENT_PORTAL_TOKEN_KEY),
  logout: () => localStorage.removeItem(STUDENT_PORTAL_TOKEN_KEY),
};
