import { Pressable, Text, View } from "react-native";

import { formatLocaleDate } from "@/features/shared/utils/dateTime";

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
          {formatLocaleDate(value, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </Pressable>
    </View>
  );
}
