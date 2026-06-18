import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Platform, Pressable, Text, View } from "react-native";

import type { PickerTarget } from "@/features/schedule/types";

type MobileDatePickerProps = {
  pickerTarget: PickerTarget;
  startDate: Date;
  endDate: Date;
  today: Date;
  onDateChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  onClose: () => void;
};

export default function MobileDatePicker({
  pickerTarget,
  startDate,
  endDate,
  today,
  onDateChange,
  onClose,
}: MobileDatePickerProps) {
  if (!pickerTarget) {
    return null;
  }

  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: "#f4f1ea",
        padding: 12,
      }}
    >
      <DateTimePicker
        value={pickerTarget === "start" ? startDate : endDate}
        mode="date"
        display={Platform.OS === "ios" ? "spinner" : "default"}
        minimumDate={pickerTarget === "start" ? today : startDate}
        onChange={onDateChange}
        textColor="#1f2937"
        accentColor="#16423c"
        themeVariant="light"
      />
      {Platform.OS === "ios" ? (
        <Pressable
          onPress={onClose}
          style={{
            backgroundColor: "#16423c",
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#f4f1ea",
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            Done
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
