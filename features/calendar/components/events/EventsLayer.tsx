import { Pressable, View } from 'react-native';
import { DEFAULT_GRID_HEIGHT, TIME_GUTTER_WIDTH, minutesToY } from '../../layout/calendarLayout';
import { CalendarEvent } from "../../types";
import EventBlock from './EventBlock';

type EventsLayerProps = {
    events: CalendarEvent[],
    numDays: number,
    columnWidth: number,
    selectedEventId: string,
    onEventBlockPress: (arg0: CalendarEvent) => void,
    onEventsLayerEmptyPress: () => void,
}

export default function EventsLayer({ events, numDays, columnWidth, selectedEventId, onEventBlockPress, onEventsLayerEmptyPress }: EventsLayerProps) {
    return (<Pressable onPress={onEventsLayerEmptyPress} style={{
        position: 'absolute',
        left: TIME_GUTTER_WIDTH,
        right: 0,
        top: 0,
        height: DEFAULT_GRID_HEIGHT
    }}>
        {events.filter(event => {
            return event.dayIndex >= 0 && event.dayIndex < numDays && event.startMinute >= 0 && event.startMinute < event.endMinute && event.endMinute <= 1440;
        }).map(event => {
            const eventLengthMinutes = event.endMinute - event.startMinute

            return (<View key={event.id} style={{
                position: 'absolute',
                left: (event.dayIndex * columnWidth),
                width: columnWidth,
                top: minutesToY(event.startMinute),
                height: minutesToY(eventLengthMinutes),
            }}>
                <EventBlock event={event} selectedEventId={selectedEventId} onEventBlockPress={onEventBlockPress}/>
            </View>)
        })}
    </Pressable>)
}