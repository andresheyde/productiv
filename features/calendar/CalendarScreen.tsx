import { ScrollView, useWindowDimensions } from "react-native";
import GridCanvas from "./components/GridCanvas";
import EventsLayer from "./components/layers/EventsLayer";
import StickyHeader from "./components/layers/StickyHeader";
import { TIME_GUTTER_WIDTH } from "./layout/calendarLayout";
import { CalendarEvent } from "./types";

const events: CalendarEvent[] = [
  {
    id: '1',
    dayIndex: 0,
    startMinute: 0,
    endMinute: 60,
    title: 'First event'
  },
  {
    id: '2',
    dayIndex: 1,
    startMinute: 0,
    endMinute: 60,
    title: 'second event'
  },
  {
    id: '3',
    dayIndex: 3,
    startMinute: 75,
    endMinute: 1200,
    title: 'third event'
  }
]

export default function CalendarScreen() {
    const numDays = 7;
    const columnWidth = (useWindowDimensions().width - TIME_GUTTER_WIDTH)/numDays;

  return (<>
    <StickyHeader startDate={new Date()} numDays={numDays} columnWidth={columnWidth}/>
    <ScrollView style={{ flex: 1 }}>
        <GridCanvas numDays={numDays} columnWidth={columnWidth}/>
        <EventsLayer events={events} numDays={numDays} columnWidth={columnWidth}/>
    </ScrollView>
  </>);
}