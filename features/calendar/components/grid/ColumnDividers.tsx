import { View } from "react-native";
import { TIME_GUTTER_WIDTH } from "../../layout/calendarLayout";

type ColumnDividersProps = {
    numDays: number,
    columnWidth: number,
}

export default function ColumnDividers({ numDays, columnWidth }: ColumnDividersProps) {
    return Array.from({ length: numDays - 1 }, (_, i) => {
        return (
            <View key={i} pointerEvents="none" style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: TIME_GUTTER_WIDTH + (columnWidth)*(i+1),
                width: 1,
                backgroundColor: 'white',
                opacity: 1,
            }}/>
        )
    })
}