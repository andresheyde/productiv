import { useState } from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import GridCanvas from "./components/grid/GridCanvas";
import StickyHeader from "./components/header/StickyHeader";
import { TIME_GUTTER_WIDTH } from "./layout/calendarLayout";
import { CalendarEvent } from "./types";

export default function CalendarScreen() {
    const numDays = 7;
    const columnWidth = (useWindowDimensions().width - TIME_GUTTER_WIDTH)/numDays;
    const [selectedEventId, setSelectedEventId] = useState('');

  return (<>
    <StickyHeader startDate={new Date()} numDays={numDays} columnWidth={columnWidth}/>
    <ScrollView style={{ flex: 1 }}>
        <GridCanvas numDays={numDays} columnWidth={columnWidth} events={events} selectedEventId={selectedEventId}
          onEventBlockPress={onEventBlockPress} onEventsLayerEmptyPress={onEventsLayerEmptyPress}
        />
    </ScrollView>
  </>);

  function onEventBlockPress(event: CalendarEvent) {
    // console.log(`EventBlockPress logged: event.id=${event.id}`);
    setSelectedEventId(event.id);
  }

  function onEventsLayerEmptyPress() {
    // console.log(`EventsLayerEmptyPress logged`);
    setSelectedEventId('');
  }
}

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
  },
  { id: '4',
    dayIndex: 6,
    startMinute: 1380,
    endMinute: 1440,
    title: 'fourth event'
  }
]