import { format, isBefore } from "date-fns";
import { FlatList, Pressable, Text, View } from "react-native";

import type { PickerTarget } from "@/features/schedule/types";

type WebDateSelectorProps = {
  pickerTarget: PickerTarget;
  availableDates: Date[];
  startDate: Date;
  endDate: Date;
  onSelectDate: (date: Date) => void;
};

export default function WebDateSelector({
  pickerTarget,
  availableDates,
  startDate,
  endDate,
  onSelectDate,
}: WebDateSelectorProps) {
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          color: "#5f6b76",
          fontWeight: "600",
        }}
      >
        {pickerTarget === "end" ? "Choose an end date" : "Choose a start date"}
      </Text>
      <FlatList
        horizontal
        data={availableDates}
        keyExtractor={(item) => item.toISOString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => {
          const isDisabled = pickerTarget === "end" && isBefore(item, startDate);
          const isSelected =
            (pickerTarget === "start" && item.getTime() === startDate.getTime()) ||
            (pickerTarget === "end" && item.getTime() === endDate.getTime());

          return (
            <Pressable
              disabled={isDisabled}
              onPress={() => onSelectDate(item)}
              style={{
                minWidth: 112,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: isSelected ? "#16423c" : "#efe6d7",
                opacity: isDisabled ? 0.45 : 1,
              }}
            >
              <Text
                style={{
                  color: isSelected ? "#f4f1ea" : "#1f2937",
                  fontWeight: "700",
                }}
              >
                {format(item, "EEE")}
              </Text>
              <Text
                style={{
                  color: isSelected ? "#d9e7e3" : "#5f6b76",
                }}
              >
                {format(item, "MMM d")}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
