import { useWindowDimensions, View } from "react-native";
import { TIME_GUTTER_WIDTH } from "../../layout/calendarLayout";

type ColumnDividersProps = {
    numDays: number,
    columnWidth: number,
}

export default function ColumnDividers({ numDays, columnWidth }: ColumnDividersProps) {
    const totalWidth = useWindowDimensions().width - TIME_GUTTER_WIDTH;

    return Array.from({ length: numDays - 1 }, (_, i) => {
        return (
            <View key={i} style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: TIME_GUTTER_WIDTH + (totalWidth/numDays)*(i+1),
                width: 1,
                backgroundColor: 'white',
                opacity: 1,
            }}/>
        )
    })
}