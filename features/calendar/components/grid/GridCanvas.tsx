import { isWithinInterval } from "date-fns";
import { View } from "react-native";
import {
  CalendarTimeWindow,
  getCalendarGridHeight,
  TIME_GUTTER_WIDTH,
} from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";
import EventsLayer from "../eventsLayer/EventsLayer";
import ColumnDividers from "./ColumnDividers";
import CurrentTimeBar from "./CurrentTimeBar";
import HourLines from "./HourLines";
import TimeGutters from "./TimeGutters";

type GridCanvasProps = {
  numDays: number;
  leftDate: Date;
  rightDate: Date;
  today: Date;
  columnWidth: number;
  timeWindow: CalendarTimeWindow;
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  onEventBlockPress: (arg0: CalendarEvent) => void;
  onEventsLayerEmptyPress: (arg0: number, arg1: number) => void;
  onEventsLayerLongPressBegin: (arg0: number, arg1: number) => void;
  onEventsLayerLongPressEnd: (arg0: number, arg1: number) => void;
};

export default function GridCanvas({
  numDays,
  leftDate,
  rightDate,
  today,
  columnWidth,
  timeWindow,
  events,
  selectedEvent,
  onEventBlockPress,
  onEventsLayerEmptyPress,
  onEventsLayerLongPressBegin,
  onEventsLayerLongPressEnd,
}: GridCanvasProps) {
  const gridHeight = getCalendarGridHeight(timeWindow);

  return (
    <View
      style={{
        position: "relative",
        height: gridHeight,
        backgroundColor: "#fffdf8",
      }}
    >
      <TimeGutters timeWindow={timeWindow} />
      <View
        style={{
          position: "absolute",
          left: TIME_GUTTER_WIDTH,
          right: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <HourLines timeWindow={timeWindow} />
        <ColumnDividers numDays={numDays} columnWidth={columnWidth} />
        <EventsLayer
          events={events}
          leftDate={leftDate}
          numDays={numDays}
          columnWidth={columnWidth}
          timeWindow={timeWindow}
          selectedEvent={selectedEvent}
          onEventBlockPress={onEventBlockPress}
          onEventsLayerEmptyPress={onEventsLayerEmptyPress}
          onEventsLayerLongPressBegin={onEventsLayerLongPressBegin}
          onEventsLayerLongPressEnd={onEventsLayerLongPressEnd}
        />
        {isWithinInterval(today, {
          start: leftDate,
          end: rightDate,
        }) && (
          <CurrentTimeBar
            currentTime={today}
            leftDate={leftDate}
            columnWidth={columnWidth}
            timeWindow={timeWindow}
          />
        )}
      </View>
    </View>
  );
}
