import { Text, View } from "react-native";
import { CalendarEvent } from "../../types";

type EventBlockProps = {
    event: CalendarEvent,
}

export default function EventBlock({ event }: EventBlockProps) {
    return (<View style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'blue',
        borderWidth: 1,
        borderColor: 'black'
    }}>
        <Text style={{
                    textAlign: 'left',
                    textAlignVertical: 'top',
                }}>{event.title}</Text>
    </View>)
}