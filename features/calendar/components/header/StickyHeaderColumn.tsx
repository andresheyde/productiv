import { isEqual } from "date-fns";
import { Text, View } from "react-native";
import { STICKY_HEADER_HEIGHT, TIME_GUTTER_WIDTH } from "../../layout/calendarLayout";

type StickyHeaderColumnProps = {
    today: Date,
    date: Date,
    columnWidth: number,
    dayIndex: number,
}

export default function StickyHeaderColumn({ today, date, columnWidth, dayIndex }: StickyHeaderColumnProps) {
    return (<View style={{
                position: 'absolute',
                top: 0,
                left: TIME_GUTTER_WIDTH + columnWidth*(dayIndex),
                width: columnWidth,
                height: STICKY_HEADER_HEIGHT,
                borderLeftColor: 'red',
                borderLeftWidth: 1,
                borderBottomColor: 'white',
                borderBottomWidth: 2,
                backgroundColor: isEqual(date, today) ? 'green' : 'grey',
                opacity: 1,
            }}>
                <Text>{date.toString()}</Text>
            </View>)
}