import { studentPortalClient, STUDENT_PORTAL_TOKEN_KEY } from './studentPortalClient';
import type { CourseCatalogItemOut } from '../types';

export interface StudentPortalProfile {
  id: number;
  full_name: string;
}

export interface UpcomingLesson {
  lesson_date: string;
  start_time: string;
  end_time: string | null;
  group_name: string | null;
  trainer_name: string;
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
  saveToken: (token: string) => localStorage.setItem(STUDENT_PORTAL_TOKEN_KEY, token),
  getToken: (): string | null => localStorage.getItem(STUDENT_PORTAL_TOKEN_KEY),
  logout: () => localStorage.removeItem(STUDENT_PORTAL_TOKEN_KEY),
};
