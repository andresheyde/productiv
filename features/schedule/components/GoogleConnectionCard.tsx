import { Pressable, Text, View } from "react-native";

type GoogleConnectionCardProps = {
  isAuthenticated: boolean;
  isAuthReady: boolean;
  isConnectingGoogle: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnect: () => Promise<void>;
};

export default function GoogleConnectionCard({
  isAuthenticated,
  isAuthReady,
  isConnectingGoogle,
  onConnectGoogle,
  onDisconnect,
}: GoogleConnectionCardProps) {
  return (
    <View
      style={{
        backgroundColor: "#fffdf8",
        borderRadius: 20,
        padding: 18,
        gap: 14,
        borderWidth: 1,
        borderColor: "#dfd6c8",
      }}
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: "#1f2937",
        }}
      >
        2. Connect Google
      </Text>
      <Text
        style={{
          color: !isAuthReady || isAuthenticated ? "#166534" : "#5f6b76",
          fontWeight: "600",
        }}
      >
        {!isAuthReady
          ? "Checking Google connection..."
          : isAuthenticated
            ? "Google Calendar connected"
            : "Google Calendar not connected yet"}
      </Text>
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Pressable
          onPress={onConnectGoogle}
          disabled={isConnectingGoogle}
          style={{
            backgroundColor: "#1f6f78",
            opacity: isConnectingGoogle ? 0.6 : 1,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#f4f1ea",
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            {isConnectingGoogle ? "Connecting..." : "Connect Google"}
          </Text>
        </Pressable>
        {isAuthenticated ? (
          <Pressable
            onPress={() => {
              void onDisconnect();
            }}
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
              Disconnect
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
