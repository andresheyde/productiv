import { View } from "react-native";
import { DEFAULT_GRID_HEIGHT } from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";
import EventsLayer from "../events/EventsLayer";
import ColumnDividers from "./ColumnDividers";
import HourLines from "./HourLines";
import TimeGutters from "./TimeGutters";

type GridCanvasProps = {
  numDays: number;
  leftDate: Date;
  columnWidth: number;
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  onEventBlockPress: (arg0: CalendarEvent) => void;
  onEventsLayerEmptyPress: () => void;
  onEventsLayerLongPress: (arg0: number, arg1: number) => void;
};

export default function GridCanvas({
  numDays,
  leftDate,
  columnWidth,
  events,
  selectedEvent,
  onEventBlockPress,
  onEventsLayerEmptyPress,
  onEventsLayerLongPress,
}: GridCanvasProps) {
  return (
    <View
      style={{
        position: "relative",
        height: DEFAULT_GRID_HEIGHT,
        backgroundColor: "black",
      }}
    >
      <HourLines />
      <TimeGutters />
      <ColumnDividers numDays={numDays} columnWidth={columnWidth} />
      <EventsLayer
        events={events}
        leftDate={leftDate}
        numDays={numDays}
        columnWidth={columnWidth}
        selectedEvent={selectedEvent}
        onEventBlockPress={onEventBlockPress}
        onEventsLayerEmptyPress={onEventsLayerEmptyPress}
        onEventsLayerLongPress={onEventsLayerLongPress}
      />
    </View>
  );
}
