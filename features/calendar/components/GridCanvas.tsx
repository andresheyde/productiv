import { View } from 'react-native';
import { DEFAULT_GRID_HEIGHT } from '../layout/calendarLayout';
import ColumnDividers from './layers/ColumnDividers';
import HourLines from './layers/HourLines';
import TimeGutters from './layers/TimeGutters';

type GridCanvasProps = {
    numDays: number,
    columnWidth: number
}

export default function GridCanvas({ numDays, columnWidth }: GridCanvasProps) {
    return (<View
        style={{
          position: "relative",
          height: DEFAULT_GRID_HEIGHT,
          backgroundColor: "black",
        }}
      >
        <HourLines />
        <TimeGutters />
        <ColumnDividers numDays={numDays} columnWidth={columnWidth} />
      </View>)
}