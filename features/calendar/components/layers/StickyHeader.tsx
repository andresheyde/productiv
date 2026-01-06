import { View } from 'react-native'
import { STICKY_HEADER_HEIGHT } from '../../layout/calendarLayout'

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
        backgroundColor: 'gray'
    }}>
        {Array.from( {length: numDays - 1}, (_, i) => {
            return (<View key={i} style={{
                position: 'absolute',
                top: 0,
                left: columnWidth*(i+1),
                width: 1,
                height: STICKY_HEADER_HEIGHT,
                backgroundColor: 'red',
                opacity: 1,
            }}/>)
        })}
    </View>
}