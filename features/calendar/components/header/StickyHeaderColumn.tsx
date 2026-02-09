import { format, isEqual } from "date-fns";
import { Text, View } from "react-native";
import {
  HEADER_BUTTON_BAR_HEIGHT,
  STICKY_HEADER_HEIGHT,
  TIME_GUTTER_WIDTH,
} from "../../layout/calendarLayout";

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
        borderLeftColor: "red",
        borderLeftWidth: 1,
        borderBottomColor: "white",
        borderBottomWidth: 2,
        backgroundColor: isEqual(
          new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        )
          ? "green"
          : "grey",
        opacity: 1,
      }}
    >
      <Text
        style={{
          position: "absolute",
          top: 4,
          left: 6,
          fontWeight: "600",
        }}
        numberOfLines={1}
      >
        {format(date, "EEE")}
      </Text>
      <Text
        style={{
          position: "absolute",
          bottom: 4,
          right: 6,
          fontWeight: "700",
        }}
      >
        {format(date, "d")}
      </Text>
    </View>
  );
}
