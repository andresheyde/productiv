import { Text, View } from "react-native";
import { CalendarEvent } from "../../types";

type EventBlockProps = {
    event: CalendarEvent,
}

export default function EventBlock({ event }: EventBlockProps) {
    return (<View style={{
        flex: 1,
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