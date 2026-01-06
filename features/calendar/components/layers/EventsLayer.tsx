import { Text, View } from 'react-native';
import { MINUTES, TIME_GUTTER_WIDTH, timeToY } from '../../layout/calendarLayout';
import { CalendarEvent } from "../../types";

type EventsLayerProps = {
    events: CalendarEvent[],
    numDays: number,
    columnWidth: number,
}

export default function EventsLayer({ events, numDays, columnWidth }: EventsLayerProps) {
    return (
        events.map((event, i) => {
            const eventLengthMinutes = event.endMinute - event.startMinute

            return (<View key={i} style={{
                position: 'absolute',
                left: TIME_GUTTER_WIDTH + (event.dayIndex * columnWidth),
                width: columnWidth,
                top: timeToY(Math.floor(event.startMinute/60), event.startMinute%MINUTES),
                height: timeToY(Math.floor(eventLengthMinutes/60), eventLengthMinutes%MINUTES),
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