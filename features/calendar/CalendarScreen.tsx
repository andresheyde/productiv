import * as Crypto from 'expo-crypto';
import { useEffect, useState } from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import EventEditorPopup from "./components/events/EventEditorPopup";
import GridCanvas from "./components/grid/GridCanvas";
import StickyHeader from "./components/header/StickyHeader";
import useDeviceCalendarPermissions from './components/hooks/useDeviceCalendarPermissions';
import useDeviceCalendars from './components/hooks/useDeviceCalendars';
import { TIME_GUTTER_WIDTH, xToDayIndex, yToMinutes } from "./layout/calendarLayout";
import { CalendarEvent } from "./types";

export default function CalendarScreen() {
  const numDays = 7;
  const columnWidth = (useWindowDimensions().width - TIME_GUTTER_WIDTH)/numDays;
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [events, setEvents] = useState(testEvents)
  const { permissions, requestPermissions, refreshPermissions } = useDeviceCalendarPermissions()
  const { calendars, loading, error, blocked, refresh } = useDeviceCalendars();

  useEffect(() => {
    if (error) {
      console.log(`Error while attempting to get calendars: ${error}`);
      return;
    }
    if (!loading && calendars.length > 0) {
      console.log(`Calendars loaded.`);
      calendars.forEach(calendar => {
        console.log(`${calendar.source} ${calendar.id} ${calendar.title}`)
      })
      return;
    }
    if (!loading && calendars.length === 0) {
      console.log(`No calendars found`);
      return;
    }
    if (blocked && permissions.canAskAgain) {
      console.log(`Requesting permissions`);
      requestPermissions();
      return;
    }
    if (blocked && !permissions.canAskAgain) {
      console.log(`No permissions granted`);
      return;
    }
    if (loading && permissions.granted) {
      console.log('Getting device calendars');
      refresh();
      return;
    }
  }, [calendars, permissions, blocked, loading, error, refresh, requestPermissions, refreshPermissions])

  return (<>
    <StickyHeader startDate={new Date()} numDays={numDays} columnWidth={columnWidth}/>
    <ScrollView style={{ flex: 1 }}>
        <GridCanvas numDays={numDays} columnWidth={columnWidth} events={events} selectedEvent={selectedEvent}
          onEventBlockPress={onEventBlockPress} onEventsLayerEmptyPress={onEventsLayerEmptyPress} onEventsLayerLongPress={onEventsLayerLongPress}
        />
    </ScrollView>
    {selectedEvent && <EventEditorPopup selectedEvent={selectedEvent} />}
  </>);

  function onEventBlockPress(event: CalendarEvent) {
    console.log(`EventBlockPress logged: event.id=${event.id}`);
    setSelectedEvent(event);
  }

  function onEventsLayerEmptyPress() {
    console.log(`EventsLayerEmptyPress logged`);
    setSelectedEvent(null);
  }

  function onEventsLayerLongPress(x: number, y: number) {
    console.log(`EventsLayerLongPress logged: (${x}, ${y})`)
    const startMinute = Math.floor(yToMinutes(y)/5)*5;
    const dayIndex = xToDayIndex(x, numDays, columnWidth);
    const newEvent: CalendarEvent = {
      id: Crypto.randomUUID(),
      dayIndex: dayIndex,
      startMinute: startMinute,
      endMinute: startMinute + 60,
      title: 'New Event'
    }
    setEvents(prev => [...prev, newEvent])
  }
}

const testEvents: CalendarEvent[] = [
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