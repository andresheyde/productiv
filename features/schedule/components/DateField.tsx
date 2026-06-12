import { format } from "date-fns";
import { Pressable, Text, View } from "react-native";

type DateFieldProps = {
  label: string;
  value: Date;
  onPress: () => void;
};

export default function DateField({ label, value, onPress }: DateFieldProps) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: "#1f2937",
        }}
      >
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: "#efe6d7",
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#1f2937",
            fontSize: 15,
            fontWeight: "700",
          }}
        >
          {format(value, "EEEE, MMMM d, yyyy")}
        </Text>
      </Pressable>
    </View>
  );
}
