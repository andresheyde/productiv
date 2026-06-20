import { isEqual } from "date-fns";
import { Text, View } from "react-native";
import {
  HEADER_BUTTON_BAR_HEIGHT,
  STICKY_HEADER_HEIGHT,
  TIME_GUTTER_WIDTH,
} from "../../layout/calendarLayout";
import { formatLocaleDate } from "@/features/shared/utils/dateTime";

type StickyHeaderColumnProps = {
  today: Date;
  date: Date;
  columnWidth: number;
  dayIndex: number;
};

export default function StickyHeaderColumn({
  today,
  date,
  columnWidth,
  dayIndex,
}: StickyHeaderColumnProps) {
  return (
    <View
      style={{
        position: "absolute",
        top: HEADER_BUTTON_BAR_HEIGHT,
        left: TIME_GUTTER_WIDTH + columnWidth * dayIndex,
        width: columnWidth,
        height: STICKY_HEADER_HEIGHT - HEADER_BUTTON_BAR_HEIGHT,
        borderLeftColor: "#dfd6c8",
        borderLeftWidth: 1,
        borderBottomColor: "#dfd6c8",
        borderBottomWidth: 1,
        backgroundColor: isEqual(
          new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        )
          ? "#d9e7e3"
          : "#fffdf8",
        opacity: 1,
      }}
    >
      <Text
        style={{
          position: "absolute",
          top: 4,
          left: 6,
          fontWeight: "600",
          color: "#5f6b76",
        }}
        numberOfLines={1}
      >
        {formatLocaleDate(date, { weekday: "short" })}
      </Text>
      <Text
        style={{
          position: "absolute",
          bottom: 4,
          right: 6,
          fontWeight: "700",
          color: "#16423c",
        }}
      >
        {formatLocaleDate(date, { day: "numeric" })}
      </Text>
    </View>
  );
}
