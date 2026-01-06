import { Text, View } from 'react-native';
import { DEFAULT_GRID_HEIGHT, HOURS, TIME_GUTTER_HEIGHT, TIME_GUTTER_WIDTH, timeToY } from "../../layout/calendarLayout";

export default function TimeGutters() {
    return (<View style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: TIME_GUTTER_WIDTH,
        height: DEFAULT_GRID_HEIGHT,
        backgroundColor: 'gray'
    }}>
        {Array.from({ length: HOURS - 1 }, (_, i) => {
        return (<View key={i} style={{
            position: 'absolute',
            left: 0,
            top: timeToY(i, 55),
            width: TIME_GUTTER_WIDTH,
            height: TIME_GUTTER_HEIGHT,
        }}>
            <Text style={{
                textAlign: 'center'
            }}>{hourToString(i+1)}</Text>
        </View>)})}
    </View>)
}

function hourToString(hour: number) {
    if (hour > 12) {
        return `${hour - 12}pm`
    }
    return `${hour}am`
}