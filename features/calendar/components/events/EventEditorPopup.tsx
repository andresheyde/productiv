import { Text, View } from "react-native";
import { EVENT_EDITOR_POPUP_HEIGHT } from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";

type EventEditorPopupProps = {
    selectedEvent: CalendarEvent;
}

export default function EventEditorPopup({ selectedEvent }: EventEditorPopupProps) {
    return (<View style={{
        height: EVENT_EDITOR_POPUP_HEIGHT,
        borderTopWidth: 2,
        borderTopColor: 'white',
        backgroundColor: 'gray'
    }}>
        <Text>{selectedEvent.title ? selectedEvent.title : 'Untitled Event'}</Text>
    </View>)
}