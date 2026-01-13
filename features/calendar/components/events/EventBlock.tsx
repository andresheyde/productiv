import { Pressable, Text } from "react-native";
import { CalendarEvent } from "../../types";

type EventBlockProps = {
    event: CalendarEvent,
    selectedEventId: string | null,
    onEventBlockPress: (arg0: CalendarEvent) => void,
}

export default function EventBlock({ event, selectedEventId, onEventBlockPress }: EventBlockProps) {
    return (<Pressable onPress={() => onEventBlockPress(event)} style={{
        flex: 1,
        backgroundColor: event.id === selectedEventId ? 'blue' : 'white',
        borderWidth: 1,
        borderColor: 'black'
    }}>
        <Text style={{
                    textAlign: 'left',
                    textAlignVertical: 'top',
                }}>{event.title}</Text>
    </Pressable>)
}