import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import tokens from "@llos/design-tokens";
import { type MarketEntry, MockApiClient } from "@llos/api-client";

const client = new MockApiClient();

const PRICE_LABEL = {
  free: "免费",
  one_time: "买断",
  subscription: "订阅",
} as const;

export default function MarketScreen() {
  const [entries, setEntries] = useState<readonly MarketEntry[]>([]);

  useEffect(() => {
    void client.listMarket().then(setEntries);
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.dlc_id}
        ListEmptyComponent={<Text style={styles.empty}>市场为空（空白态）</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.detail}>
              {item.language.toUpperCase()} · {item.difficulty} · {PRICE_LABEL[item.price_model]}
              {item.owned ? " · 已获得" : ""}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.lg },
  card: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  title: { color: tokens.color.ink, fontSize: tokens.font.size_lg, fontWeight: "600" },
  detail: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_md, marginTop: tokens.space.xs },
  empty: { color: tokens.color.ink_secondary, padding: tokens.space.lg },
});
