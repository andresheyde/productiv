import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Platform, Text, View } from "react-native";

import DateField from "@/features/schedule/components/DateField";
import MobileDatePicker from "@/features/schedule/components/MobileDatePicker";
import WebDateSelector from "@/features/schedule/components/WebDateSelector";
import type { PickerTarget } from "@/features/schedule/types";

type DateRangeCardProps = {
  startDate: Date;
  endDate: Date;
  pickerTarget: PickerTarget;
  today: Date;
  availableDates: Date[];
  validationMessage: string | null;
  onStartDatePress: () => void;
  onEndDatePress: () => void;
  onWebDateSelect: (date: Date) => void;
  onNativeDateChange: (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => void;
  onClosePicker: () => void;
};

export default function DateRangeCard({
  startDate,
  endDate,
  pickerTarget,
  today,
  availableDates,
  validationMessage,
  onStartDatePress,
  onEndDatePress,
  onWebDateSelect,
  onNativeDateChange,
  onClosePicker,
}: DateRangeCardProps) {
  return (
    <View
      style={{
        backgroundColor: "#fffdf8",
        borderRadius: 20,
        padding: 18,
        gap: 14,
        borderWidth: 1,
        borderColor: "#dfd6c8",
      }}
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: "#1f2937",
        }}
      >
        1. Choose a date range
      </Text>
      <Text
        style={{
          color: "#5f6b76",
          lineHeight: 20,
        }}
      >
        Dates must start today or later and stay within a single 7-day window.
      </Text>

      <DateField label="Start date" value={startDate} onPress={onStartDatePress} />
      <DateField label="End date" value={endDate} onPress={onEndDatePress} />

      {Platform.OS === "web" ? (
        <WebDateSelector
          pickerTarget={pickerTarget}
          availableDates={availableDates}
          startDate={startDate}
          endDate={endDate}
          onSelectDate={onWebDateSelect}
        />
      ) : (
        <MobileDatePicker
          pickerTarget={pickerTarget}
          startDate={startDate}
          endDate={endDate}
          today={today}
          onDateChange={onNativeDateChange}
          onClose={onClosePicker}
        />
      )}

      {validationMessage ? (
        <Text
          style={{
            color: "#b42318",
            fontWeight: "600",
          }}
        >
          {validationMessage}
        </Text>
      ) : null}
    </View>
  );
}
