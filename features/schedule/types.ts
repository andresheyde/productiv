import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";

import type { BackendScheduleEvent } from "@/features/schedule/api/scheduleApi";

export type PickerTarget = "start" | "end" | null;

export type ScheduleFlowState = {
  today: Date;
  startDate: Date;
  endDate: Date;
  pickerTarget: PickerTarget;
  availableDates: Date[];
  isAuthReady: boolean;
  validationMessage: string | null;
  isAuthenticated: boolean;
  isConnectingGoogle: boolean;
  isLoadingEvents: boolean;
  errorMessage: string | null;
  events: BackendScheduleEvent[];
  canFetchEvents: boolean;
  openStartDatePicker: () => void;
  openEndDatePicker: () => void;
  closePicker: () => void;
  selectWebDate: (date: Date) => void;
  handleNativeDateChange: (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => void;
  handleConnectGoogle: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleFetchEvents: () => Promise<void>;
};
