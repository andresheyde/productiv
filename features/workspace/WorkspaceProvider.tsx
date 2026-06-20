import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  fetchAssistantThread,
  sendAssistantTurn as sendAssistantTurnRequest,
} from "@/features/assistant/api/assistantApi";
import type {
  AssistantMessage,
  AssistantThread,
  AssistantTurnMode,
} from "@/features/assistant/types";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  acceptSchedulingSuggestion as acceptSchedulingSuggestionRequest,
  dismissSchedulingSuggestion as dismissSchedulingSuggestionRequest,
  fetchSchedulingSuggestions,
  fetchUserSchedulingContext,
  updateUserSchedulingContext as updateUserSchedulingContextRequest,
} from "@/features/scheduling-context/api/schedulingContextApi";
import type {
  DerivedSchedulingSuggestion,
  UserSchedulingContext,
  UserSchedulingContextUpdate,
} from "@/features/scheduling-context/types";
import {
  addMetricEntry as addMetricEntryRequest,
  fetchGoals,
  fetchMetrics,
  fetchTasks,
  fetchWorkLogs,
  updateGoal as updateGoalRequest,
  updateMetric as updateMetricRequest,
  updateTask as updateTaskRequest,
} from "@/features/workspace/api/workspaceApi";
import type {
  Goal,
  GoalFocusArea,
  GoalMetric,
  MetricProgressEntry,
  Task,
  WorkLog,
} from "@/features/workspace/types";

type WorkspaceContextValue = {
  addMetricEntry: (input: {
    metricId: string;
    deltaValue: number;
    note?: string | null;
  }) => Promise<void>;
  errorMessage: string | null;
  goals: Goal[];
  isLoading: boolean;
  isSendingMessage: boolean;
  messages: AssistantMessage[];
  metrics: GoalMetric[];
  refreshWorkspace: () => Promise<void>;
  schedulingContext: UserSchedulingContext | null;
  schedulingSuggestions: DerivedSchedulingSuggestion[];
  sendAssistantTurn: (input: {
    message: string;
    mode?: AssistantTurnMode;
  }) => Promise<boolean>;
  tasks: Task[];
  thread: AssistantThread | null;
  acceptSchedulingSuggestion: (suggestionId: string) => Promise<void>;
  dismissSchedulingSuggestion: (suggestionId: string) => Promise<void>;
  updateSchedulingContext: (input: UserSchedulingContextUpdate) => Promise<void>;
  updateGoal: (input: {
    goalId: string;
    definition?: string;
    successCriteria?: string[];
    focusAreas?: GoalFocusArea[];
    scheduleGuidance?: Record<string, unknown>;
    constraints?: string[];
    notes?: string | null;
    priorityRank?: number;
    status?: Goal["status"];
    title?: string;
  }) => Promise<void>;
  updateMetric: (input: {
    currentValue?: number;
    isActive?: boolean;
    metricId: string;
    name?: string;
    targetValue?: number;
    unitLabel?: string;
  }) => Promise<void>;
  updateTask: (input: {
    description?: string;
    dueAt?: string | null;
    estimatedMinutes?: number | null;
    goalId?: string | null;
    priorityRank?: number;
    scheduleIntent?: Task["scheduleIntent"];
    status?: Task["status"];
    taskId: string;
    title?: string;
  }) => Promise<void>;
  workLogs: WorkLog[];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { isAuthReady, isAuthenticated, sessionToken } = useAuth();
  const [thread, setThread] = useState<AssistantThread | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [metrics, setMetrics] = useState<GoalMetric[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [schedulingContext, setSchedulingContext] =
    useState<UserSchedulingContext | null>(null);
  const [schedulingSuggestions, setSchedulingSuggestions] = useState<
    DerivedSchedulingSuggestion[]
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const refreshWorkspace = useCallback(async () => {
    if (!isAuthenticated) {
      setThread(null);
      setMessages([]);
      setGoals([]);
      setTasks([]);
      setMetrics([]);
      setWorkLogs([]);
      setSchedulingContext(null);
      setSchedulingSuggestions([]);
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [
        threadResponse,
        nextGoals,
        nextTasks,
        nextMetrics,
        nextWorkLogs,
        nextSchedulingContext,
        nextSchedulingSuggestions,
      ] =
        await Promise.all([
          fetchAssistantThread(sessionToken),
          fetchGoals(sessionToken),
          fetchTasks(sessionToken),
          fetchMetrics(sessionToken),
          fetchWorkLogs(sessionToken),
          fetchUserSchedulingContext(sessionToken),
          fetchSchedulingSuggestions(sessionToken),
        ]);

      setThread(threadResponse.thread);
      setMessages(threadResponse.messages);
      setGoals(nextGoals);
      setTasks(nextTasks);
      setMetrics(nextMetrics);
      setWorkLogs(nextWorkLogs);
      setSchedulingContext(nextSchedulingContext);
      setSchedulingSuggestions(nextSchedulingSuggestions);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load workspace data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, sessionToken]);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    void refreshWorkspace();
  }, [isAuthReady, refreshWorkspace]);

  const sendAssistantTurn = useCallback(
    async (input: { message: string; mode?: AssistantTurnMode }) => {
      if (!isAuthenticated) {
        setErrorMessage("Connect Google to use the Productiv assistant.");
        return false;
      }

      const optimisticMessage: AssistantMessage = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: "user",
        intent:
          input.mode === "work_log" || input.mode === "schedule_reflection"
            ? input.mode
            : "chat",
        content: input.message,
        structuredPayload: {},
        createdAt: new Date().toISOString(),
      };

      setMessages((previousMessages) => [
        ...previousMessages,
        optimisticMessage,
      ]);
      setIsSendingMessage(true);
      setErrorMessage(null);

      try {
        const response = await sendAssistantTurnRequest({
          message: input.message,
          mode: input.mode,
          sessionToken,
        });

        setThread(response.thread);
        setMessages(response.messages);
        setGoals((previousGoals) =>
          upsertRecords(previousGoals, response.sideEffects.goals),
        );
        setTasks((previousTasks) =>
          upsertRecords(previousTasks, response.sideEffects.tasks),
        );
        setMetrics((previousMetrics) =>
          upsertRecords(previousMetrics, response.sideEffects.metrics),
        );
        setWorkLogs((previousWorkLogs) =>
          upsertRecords(previousWorkLogs, response.sideEffects.workLogs, true),
        );
        setSchedulingSuggestions((previousSuggestions) =>
          upsertRecords(
            previousSuggestions,
            response.sideEffects.schedulingSuggestions,
            true,
          ),
        );
        return true;
      } catch (error) {
        setMessages((previousMessages) =>
          previousMessages.filter((message) => message.id !== optimisticMessage.id),
        );
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to send assistant message.",
        );
        return false;
      } finally {
        setIsSendingMessage(false);
      }
    },
    [isAuthenticated, sessionToken],
  );

  const updateGoal = useCallback(
    async (input: {
      goalId: string;
      definition?: string;
      successCriteria?: string[];
      focusAreas?: GoalFocusArea[];
      scheduleGuidance?: Record<string, unknown>;
      constraints?: string[];
      notes?: string | null;
      priorityRank?: number;
      status?: Goal["status"];
      title?: string;
    }) => {
      const goal = await updateGoalRequest({
        ...input,
        sessionToken,
      });

      setGoals((previousGoals) => upsertRecords(previousGoals, [goal]));
      setMetrics(await fetchMetrics(sessionToken));
    },
    [sessionToken],
  );

  const updateTask = useCallback(
    async (input: {
      description?: string;
      dueAt?: string | null;
      estimatedMinutes?: number | null;
      goalId?: string | null;
      priorityRank?: number;
      scheduleIntent?: Task["scheduleIntent"];
      status?: Task["status"];
      taskId: string;
      title?: string;
    }) => {
      const task = await updateTaskRequest({
        ...input,
        sessionToken,
      });

      setTasks((previousTasks) => upsertRecords(previousTasks, [task]));
    },
    [sessionToken],
  );

  const updateMetric = useCallback(
    async (input: {
      currentValue?: number;
      isActive?: boolean;
      metricId: string;
      name?: string;
      targetValue?: number;
      unitLabel?: string;
    }) => {
      const metric = await updateMetricRequest({
        ...input,
        sessionToken,
      });

      setMetrics((previousMetrics) => upsertRecords(previousMetrics, [metric]));
    },
    [sessionToken],
  );

  const addMetricEntry = useCallback(
    async (input: {
      metricId: string;
      deltaValue: number;
      note?: string | null;
    }) => {
      const result = await addMetricEntryRequest({
        ...input,
        sessionToken,
      });

      setMetrics((previousMetrics) =>
        upsertRecords(previousMetrics, [result.metric]),
      );
    },
    [sessionToken],
  );

  const updateSchedulingContext = useCallback(
    async (input: UserSchedulingContextUpdate) => {
      const nextContext = await updateUserSchedulingContextRequest({
        ...input,
        sessionToken,
      });

      setSchedulingContext(nextContext);
    },
    [sessionToken],
  );

  const acceptSchedulingSuggestion = useCallback(
    async (suggestionId: string) => {
      const result = await acceptSchedulingSuggestionRequest({
        suggestionId,
        sessionToken,
      });

      setSchedulingContext(result.context);
      setSchedulingSuggestions((currentValue) =>
        currentValue.filter((suggestion) => suggestion.id !== suggestionId),
      );
    },
    [sessionToken],
  );

  const dismissSchedulingSuggestion = useCallback(
    async (suggestionId: string) => {
      await dismissSchedulingSuggestionRequest({
        suggestionId,
        sessionToken,
      });

      setSchedulingSuggestions((currentValue) =>
        currentValue.filter((suggestion) => suggestion.id !== suggestionId),
      );
    },
    [sessionToken],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      addMetricEntry,
      acceptSchedulingSuggestion,
      dismissSchedulingSuggestion,
      errorMessage,
      goals,
      isLoading,
      isSendingMessage,
      messages,
      metrics,
      refreshWorkspace,
      schedulingContext,
      schedulingSuggestions,
      sendAssistantTurn,
      tasks,
      thread,
      updateSchedulingContext,
      updateGoal,
      updateMetric,
      updateTask,
      workLogs,
    }),
    [
      addMetricEntry,
      acceptSchedulingSuggestion,
      dismissSchedulingSuggestion,
      errorMessage,
      goals,
      isLoading,
      isSendingMessage,
      messages,
      metrics,
      refreshWorkspace,
      schedulingContext,
      schedulingSuggestions,
      sendAssistantTurn,
      tasks,
      thread,
      updateSchedulingContext,
      updateGoal,
      updateMetric,
      updateTask,
      workLogs,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }

  return context;
}

function upsertRecords<T extends { id: string }>(
  currentRecords: T[],
  nextRecords: T[],
  sortByNewestFirst: boolean = false,
) {
  const recordMap = new Map(currentRecords.map((record) => [record.id, record]));

  nextRecords.forEach((record) => {
    recordMap.set(record.id, record);
  });

  const records = Array.from(recordMap.values());

  if (!sortByNewestFirst) {
    return records;
  }

  return records.sort((left, right) => {
    const leftDate = getRecordSortDate(left);
    const rightDate = getRecordSortDate(right);

    return rightDate.localeCompare(leftDate);
  });
}

function getRecordSortDate(record: { id: string }) {
  if ("recordedAt" in record && typeof record.recordedAt === "string") {
    return record.recordedAt;
  }

  if ("createdAt" in record && typeof record.createdAt === "string") {
    return record.createdAt;
  }

  if ("updatedAt" in record && typeof record.updatedAt === "string") {
    return record.updatedAt;
  }

  return record.id;
}
