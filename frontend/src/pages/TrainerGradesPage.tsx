import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { gradesApi, programsApi, trainerLessonsApi } from '../services/api';
import type { TrainerLessonSlot } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { useTrainerCockpitStore } from '../stores/trainerCockpitStore';

type TopicOption = {
  id: number;
  label: string;
};

const buildLessonKey = (slot: TrainerLessonSlot) => `${slot.lesson_date}|${slot.group_id}|${slot.start_time}|${slot.end_time}`;

const TrainerGradesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const selectedLessonRef = useTrainerCockpitStore((state) => state.selectedLesson);
  const selectedStudentFromStore = useTrainerCockpitStore((state) => state.selectedStudentId);
  const resetGradeFlow = useTrainerCockpitStore((state) => state.resetGradeFlow);
  const [selectedLessonKey, setSelectedLessonKey] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [gradeValue, setGradeValue] = useState<string>('5');
  const [comment, setComment] = useState<string>('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<string | null>(null);

  const lessonDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => format(addDays(startOfDay(new Date()), index), 'yyyy-MM-dd')),
    []
  );

  const lessonsQuery = useQuery({
    queryKey: ['trainer-grades', 'lessons', lessonDates.join(',')],
    queryFn: async () => {
      const rows = await Promise.all(lessonDates.map((lessonDate) => trainerLessonsApi.getForDate(lessonDate)));
      return rows.flat();
    },
  });

  const lessonOptions = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);
  const selectedSlot = useMemo(
    () => lessonOptions.find((slot) => buildLessonKey(slot) === selectedLessonKey) ?? null,
    [lessonOptions, selectedLessonKey]
  );

  useEffect(() => {
    if (!lessonOptions.length) return;
    if (selectedLessonRef) {
      const storedKey = `${selectedLessonRef.lessonDate}|${selectedLessonRef.groupId}|${selectedLessonRef.startTime}|${selectedLessonRef.endTime}`;
      const hasStoredLesson = lessonOptions.some((slot) => buildLessonKey(slot) === storedKey);
      if (hasStoredLesson) {
        setSelectedLessonKey(storedKey);
        if (selectedStudentFromStore) {
          setSelectedStudentId(String(selectedStudentFromStore));
        }
        resetGradeFlow();
        return;
      }
    }
    if (!selectedLessonKey) {
      setSelectedLessonKey(buildLessonKey(lessonOptions[0]));
    }
  }, [lessonOptions, resetGradeFlow, selectedLessonKey, selectedLessonRef, selectedStudentFromStore]);

  useEffect(() => {
    if (!selectedSlot) return;
    if (!selectedSlot.students.length) {
      setSelectedStudentId('');
      return;
    }
    const hasSelectedStudent = selectedSlot.students.some((student) => String(student.id) === selectedStudentId);
    if (!hasSelectedStudent) {
      setSelectedStudentId(String(selectedSlot.students[0].id));
    }
  }, [selectedSlot, selectedStudentId]);

  const topicQuery = useQuery({
    queryKey: ['trainer-grades', 'topics', selectedStudentId],
    enabled: Boolean(selectedStudentId),
    queryFn: async () => {
      const progress = await gradesApi.getStudentProgress(Number(selectedStudentId));
      const programId = progress?.program_id;
      if (!programId) {
        return {
          programName: null as string | null,
          progressPercent: 0,
          topics: [] as TopicOption[],
        };
      }
      const [program, studentGrades] = await Promise.all([
        programsApi.getById(programId),
        gradesApi.getAll({ student_id: Number(selectedStudentId) }),
      ]);
      const gradedTopicIds = new Set(studentGrades.map((item) => item.topic_id));
      const topics: TopicOption[] = [];
      for (const module of [...program.modules].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))) {
        for (const topic of [...module.topics].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))) {
          if (topic.status === 'active' && !gradedTopicIds.has(topic.id)) {
            topics.push({
              id: topic.id,
              label: `${module.name} • ${topic.name}`,
            });
          }
        }
      }
      return {
        programName: program.name,
        progressPercent: progress?.progress_percent ?? 0,
        topics,
      };
    },
  });

  useEffect(() => {
    const topics = topicQuery.data?.topics ?? [];
    if (!topics.length) {
      setSelectedTopicId('');
      return;
    }
    const hasSelectedTopic = topics.some((topic) => String(topic.id) === selectedTopicId);
    if (!hasSelectedTopic) {
      setSelectedTopicId(String(topics[0].id));
    }
  }, [selectedTopicId, topicQuery.data]);

  const saveGradeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot || !selectedStudentId || !selectedTopicId) return;
      await gradesApi.create({
        student_id: Number(selectedStudentId),
        topic_id: Number(selectedTopicId),
        grade: Number(gradeValue),
        comment: comment.trim() || undefined,
        date: new Date(`${selectedSlot.lesson_date}T00:00:00`).toISOString(),
      } as never);
    },
    onSuccess: async () => {
      setPageError(null);
      setPageInfo('Оценка сохранена.');
      setComment('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trainer-grades', 'topics', selectedStudentId] }),
        queryClient.invalidateQueries({ queryKey: ['trainer-cockpit', 'summary'] }),
      ]);
    },
    onError: (error: unknown) => {
      setPageError(extractApiError(error, 'Не удалось сохранить оценку'));
    },
  });

  const selectedStudent = selectedSlot?.students.find((student) => String(student.id) === selectedStudentId) ?? null;
  const nextTopicLabel = topicQuery.data?.topics.find((topic) => String(topic.id) === selectedTopicId)?.label ?? '';

  return (
    <Layout>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Оценки тренера
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Укороченный сценарий: выбрать занятие, выбрать ученика, поставить оценку по следующей теме.
          </Typography>
        </Box>

        {(pageError || pageInfo) && (
          <Stack spacing={1}>
            {pageError ? <Alert severity="error" onClose={() => setPageError(null)}>{pageError}</Alert> : null}
            {pageInfo ? <Alert severity="success" onClose={() => setPageInfo(null)}>{pageInfo}</Alert> : null}
          </Stack>
        )}

        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              1. Выбери занятие
            </Typography>
            {lessonsQuery.isLoading ? (
              <LinearProgress />
            ) : lessonOptions.length === 0 ? (
              <Typography color="text.secondary">На ближайшие дни у тебя нет занятий.</Typography>
            ) : (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {lessonOptions.map((slot) => (
                  <Chip
                    key={buildLessonKey(slot)}
                    label={`${format(new Date(`${slot.lesson_date}T00:00:00`), 'd MMM', { locale: ru })} • ${slot.start_time.slice(0, 5)} • ${slot.group_name}`}
                    color={selectedLessonKey === buildLessonKey(slot) ? 'primary' : 'default'}
                    variant={selectedLessonKey === buildLessonKey(slot) ? 'filled' : 'outlined'}
                    onClick={() => setSelectedLessonKey(buildLessonKey(slot))}
                  />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              2. Выбери ученика
            </Typography>
            {!selectedSlot ? (
              <Typography color="text.secondary">Сначала выбери занятие.</Typography>
            ) : (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {selectedSlot.students.map((student) => (
                  <Chip
                    key={student.id}
                    label={student.full_name}
                    color={selectedStudentId === String(student.id) ? 'primary' : 'default'}
                    variant={selectedStudentId === String(student.id) ? 'filled' : 'outlined'}
                    onClick={() => setSelectedStudentId(String(student.id))}
                  />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              3. Поставь оценку
            </Typography>
            {!selectedStudent ? (
              <Typography color="text.secondary">Выбери ученика, чтобы увидеть следующую тему.</Typography>
            ) : topicQuery.isLoading ? (
              <LinearProgress />
            ) : (
              <Stack spacing={2}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>{selectedStudent.full_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedSlot?.group_name} • {topicQuery.data?.programName || 'Программа не назначена'}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Прогресс по программе: {topicQuery.data?.progressPercent ?? 0}%
                  </Typography>
                  <LinearProgress variant="determinate" value={topicQuery.data?.progressPercent ?? 0} />
                </Box>

                <FormControl fullWidth size="small">
                  <InputLabel>Следующая тема</InputLabel>
                  <Select
                    value={selectedTopicId}
                    label="Следующая тема"
                    onChange={(event) => setSelectedTopicId(event.target.value)}
                    disabled={!topicQuery.data?.topics.length}
                  >
                    {(topicQuery.data?.topics ?? []).map((topic) => (
                      <MenuItem key={topic.id} value={String(topic.id)}>
                        {topic.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {nextTopicLabel ? (
                  <Alert severity="info">Автоподсказка следующей темы: {nextTopicLabel}</Alert>
                ) : (
                  <Alert severity="warning">Для ученика не найдено активных тем без оценки.</Alert>
                )}

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    label="Оценка"
                    size="small"
                    value={gradeValue}
                    onChange={(event) => setGradeValue(event.target.value)}
                    sx={{ maxWidth: 180 }}
                  />
                  <TextField
                    label="Комментарий"
                    size="small"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    fullWidth
                  />
                </Stack>

                <Box>
                  <Button
                    variant="contained"
                    onClick={() => saveGradeMutation.mutate()}
                    disabled={!selectedTopicId || saveGradeMutation.isPending}
                  >
                    Сохранить оценку
                  </Button>
                </Box>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Layout>
  );
};

export default TrainerGradesPage;
