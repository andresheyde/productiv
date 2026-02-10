import { addDays } from "date-fns";
import { View } from "react-native";
import {
  ALL_DAY_EVENTS_HEADER_HEIGHT,
  HEADER_BUTTON_BAR_HEIGHT,
  STICKY_HEADER_HEIGHT,
  TIME_GUTTER_WIDTH,
} from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";
import AllDayEventsHeader from "./AllDayEventsHeader";
import StickyHeaderButtons from "./StickyHeaderButtons";
import StickyHeaderColumn from "./StickyHeaderColumn";

type StickyHeaderProps = {
  today: Date;
  startDate: Date;
  numDays: number;
  columnWidth: number;
  events?: CalendarEvent[];
  onTodayPress?: () => void;
  onPrevPress?: () => void;
  onNextPress?: () => void;
};

export default function StickyHeader({
  today,
  startDate,
  numDays,
  columnWidth,
  events = [],
  onTodayPress,
  onPrevPress,
  onNextPress,
}: StickyHeaderProps) {
  return (
    <View
      style={{
        height: STICKY_HEADER_HEIGHT + ALL_DAY_EVENTS_HEADER_HEIGHT,
        borderBottomWidth: 2,
        borderBottomColor: "white",
        backgroundColor: "gray",
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          top: HEADER_BUTTON_BAR_HEIGHT,
          height: STICKY_HEADER_HEIGHT - HEADER_BUTTON_BAR_HEIGHT,
          width: TIME_GUTTER_WIDTH,
          backgroundColor: "grey",
        }}
      />
      <StickyHeaderButtons
        today={today}
        startDate={startDate}
        numDays={numDays}
        onTodayPress={onTodayPress}
        onPrevPress={onPrevPress}
        onNextPress={onNextPress}
      />
      <AllDayEventsHeader
        events={events}
        startDate={startDate}
        numDays={numDays}
        columnWidth={columnWidth}
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
