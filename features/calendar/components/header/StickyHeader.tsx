import { addDays } from "date-fns";
import { View } from "react-native";
import {
    STICKY_HEADER_HEIGHT,
    TIME_GUTTER_WIDTH,
} from "../../layout/calendarLayout";
import StickyHeaderColumn from "./StickyHeaderColumn";

type StickyHeaderProps = {
  today: Date;
  startDate: Date;
  numDays: number;
  columnWidth: number;
};

export default function StickyHeader({
  today,
  startDate,
  numDays,
  columnWidth,
}: StickyHeaderProps) {
  return (
    <View
      style={{
        height: STICKY_HEADER_HEIGHT,
        borderBottomWidth: 2,
        borderBottomColor: "white",
        backgroundColor: "gray",
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: STICKY_HEADER_HEIGHT,
          width: TIME_GUTTER_WIDTH,
          backgroundColor: "grey",
        }}
      />
      {Array.from({ length: numDays }, (_, i) => {
        const date = addDays(startDate, i);
        return (
          <StickyHeaderColumn
            key={date.toString()}
            today={today}
            date={date}
            columnWidth={columnWidth}
            dayIndex={i}
          />
        );
      })}
    </View>
  );
}
