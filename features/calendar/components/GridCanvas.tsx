import { View } from 'react-native';
import { DEFAULT_GRID_HEIGHT } from '../layout/calendarLayout';
import { CalendarEvent } from '../types';
import ColumnDividers from './layers/ColumnDividers';
import EventsLayer from './layers/EventsLayer';
import HourLines from './layers/HourLines';
import TimeGutters from './layers/TimeGutters';

type GridCanvasProps = {
    numDays: number,
    columnWidth: number
}

export default function GridCanvas({ numDays, columnWidth }: GridCanvasProps) {
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
        <EventsLayer events={events} numDays={numDays} columnWidth={columnWidth}/>
      </View>)
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