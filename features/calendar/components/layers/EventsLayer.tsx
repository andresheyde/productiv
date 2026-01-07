import { Text, View } from 'react-native';
import { TIME_GUTTER_WIDTH, minutesToY } from '../../layout/calendarLayout';
import { CalendarEvent } from "../../types";

type EventsLayerProps = {
    events: CalendarEvent[],
    numDays: number,
    columnWidth: number,
}

export default function EventsLayer({ events, numDays, columnWidth }: EventsLayerProps) {
    return (
        events.filter(event => {
            return event.dayIndex >= 0 && event.dayIndex < numDays && event.startMinute > 0 && event.startMinute < event.endMinute && event.endMinute <= 1440;
        }).map(event => {
            const eventLengthMinutes = event.endMinute - event.startMinute

            return (<View key={event.id} style={{
                position: 'absolute',
                left: TIME_GUTTER_WIDTH + (event.dayIndex * columnWidth),
                width: columnWidth,
                top: minutesToY(event.startMinute),
                height: minutesToY(eventLengthMinutes),
                backgroundColor: 'blue',
                borderWidth: 1,
                borderColor: 'black'
            }}>
                <Text style={{
                    textAlign: 'left',
                    textAlignVertical: 'top',
                }}>{event.title}</Text>
                </View>)
        })
    )
}