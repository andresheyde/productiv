import { View } from 'react-native'
import { STICKY_HEADER_HEIGHT, TIME_GUTTER_WIDTH } from '../../layout/calendarLayout'

type StickyHeaderProps = {
    startDate: Date,
    numDays: number,
    columnWidth: number,
}

export default function StickyHeader({ startDate, numDays, columnWidth }: StickyHeaderProps) {
    return <View style={{
        height: STICKY_HEADER_HEIGHT,
        borderBottomWidth: 2,
        borderBottomColor: 'white',
        backgroundColor: 'gray',
    }}>
        <View style={{
            left: TIME_GUTTER_WIDTH,
            top: 0,
            height: STICKY_HEADER_HEIGHT,
            width: 1,
            backgroundColor: 'red'
        }} />
        {Array.from( {length: numDays - 1}, (_, i) => {
            return (<View key={i} style={{
                position: 'absolute',
                top: 0,
                left: TIME_GUTTER_WIDTH + columnWidth*(i+1),
                width: 1,
                height: STICKY_HEADER_HEIGHT,
                backgroundColor: 'red',
                opacity: 1,
            }}/>)
        })}
    </View>
}