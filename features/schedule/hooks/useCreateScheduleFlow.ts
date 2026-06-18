import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/features/auth/AuthProvider";
import { connectGoogleCalendar } from "@/features/auth/googleAuth";
import {
  type BackendScheduleEvent,
  fetchScheduleEvents,
} from "@/features/schedule/api/scheduleApi";
import { ApiError } from "@/features/shared/api/request";
import type {
  PickerTarget,
  ScheduleFlowState,
} from "@/features/schedule/types";
import { getSessionTokenFromUrl } from "@/features/schedule/utils/scheduleAuth";
import {
  getAvailableDates,
  getDefaultScheduleEndDate,
  getDefaultScheduleStartDate,
  getValidationMessage,
  normalizeScheduleDate,
} from "@/features/schedule/utils/scheduleDates";

export default function useCreateScheduleFlow(): ScheduleFlowState {
  const today = getDefaultScheduleStartDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(getDefaultScheduleEndDate(today));
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [events, setEvents] = useState<BackendScheduleEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    clearSession,
    isAuthenticated,
    isAuthReady,
    refreshAuthState,
    sessionToken,
    setSessionToken,
  } = useAuth();

  const availableDates = getAvailableDates(today, 21);
  const validationMessage = getValidationMessage(startDate, endDate, today);
  const canFetchEvents =
    isAuthReady &&
    isAuthenticated &&
    validationMessage === null &&
    !isConnectingGoogle &&
    !isLoadingEvents;

  async function handleConnectGoogle() {
    setErrorMessage(null);
    setIsConnectingGoogle(true);

    try {
      const result = await connectGoogleCalendar("/schedule");

      if (result.type === "success") {
        const nextSessionToken = getSessionTokenFromUrl(result.url);

        if (nextSessionToken) {
          setSessionToken(nextSessionToken);
          return;
        }

        if (await refreshAuthState()) {
          return;
        }
      }

      if (result.type === "cancel" || result.type === "dismiss") {
        setErrorMessage("Google authentication was cancelled.");
      } else if (result.type === "success") {
        setErrorMessage(
          "Google authentication finished, but no session was created.",
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to Google right now.",
      );
    } finally {
      setIsConnectingGoogle(false);
    }
  }

  async function handleFetchEvents() {
    if (!isAuthenticated) {
      setErrorMessage("Connect Google before fetching events.");
      return;
    }

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);
    setIsLoadingEvents(true);

    try {
      const nextEvents = await fetchScheduleEvents(
        startDate,
        endDate,
        sessionToken,
      );
      setEvents(nextEvents);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await handleDisconnect();
        setErrorMessage("Your Google session expired. Connect Google again.");
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Failed to fetch events.",
      );
    } finally {
      setIsLoadingEvents(false);
    }
  }

  function handleNativeDateChange(
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    if (!selectedDate) {
      if (Platform.OS !== "ios") {
        setPickerTarget(null);
      }
      return;
    }

    applySelectedDate(normalizeScheduleDate(selectedDate));

    if (Platform.OS !== "ios") {
      setPickerTarget(null);
    }
  }

  function selectWebDate(date: Date) {
    applySelectedDate(date);
  }

  function applySelectedDate(date: Date) {
    if (pickerTarget === "end") {
      setEndDate(date);
      return;
    }

    setStartDate(date);
  }

  async function handleDisconnect() {
    await clearSession();
    setEvents([]);
    setErrorMessage(null);
  }

  return {
    today,
    startDate,
    endDate,
    pickerTarget,
    availableDates,
    isAuthReady,
    validationMessage,
    isAuthenticated,
    isConnectingGoogle,
    isLoadingEvents,
    errorMessage,
    events,
    canFetchEvents,
    openStartDatePicker: () => setPickerTarget("start"),
    openEndDatePicker: () => setPickerTarget("end"),
    closePicker: () => setPickerTarget(null),
    selectWebDate,
    handleNativeDateChange,
    handleConnectGoogle,
    handleDisconnect,
    handleFetchEvents,
  };
}
