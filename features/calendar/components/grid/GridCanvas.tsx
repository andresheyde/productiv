import { View } from 'react-native';
import { DEFAULT_GRID_HEIGHT } from '../../layout/calendarLayout';
import { CalendarEvent } from '../../types';
import EventsLayer from '../events/EventsLayer';
import ColumnDividers from './ColumnDividers';
import HourLines from './HourLines';
import TimeGutters from './TimeGutters';

type GridCanvasProps = {
    numDays: number,
    columnWidth: number,
    events: CalendarEvent[],
    selectedEvent: CalendarEvent | null,
    onEventBlockPress: (arg0: CalendarEvent) => void,
    onEventsLayerEmptyPress: () => void
}

export default function GridCanvas({ numDays, columnWidth, events, selectedEvent, onEventBlockPress, onEventsLayerEmptyPress }: GridCanvasProps) {
    return (<View
        style={{
          position: "relative",
          height: DEFAULT_GRID_HEIGHT,
          backgroundColor: "black",
        }}
      >
        <HourLines />
        <TimeGutters />
        <ColumnDividers numDays={numDays} columnWidth={columnWidth} />
        <EventsLayer events={events} numDays={numDays} columnWidth={columnWidth} selectedEvent={selectedEvent}
          onEventBlockPress={onEventBlockPress} onEventsLayerEmptyPress={onEventsLayerEmptyPress}
        />
      </View>)
}