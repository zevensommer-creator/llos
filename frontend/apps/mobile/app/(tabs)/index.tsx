import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import tokens from "@llos/design-tokens";
import { type HomeCard, MockApiClient } from "@llos/api-client";

const client = new MockApiClient();

export default function HomeScreen() {
  const [cards, setCards] = useState<readonly HomeCard[]>([]);

  useEffect(() => {
    void client.getHomeOverview().then((overview) => setCards(overview.cards));
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>暂无内容（空白态）</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDetail}>{item.detail}</Text>
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
  cardTitle: { color: tokens.color.ink, fontSize: tokens.font.size_lg, fontWeight: "600" },
  cardDetail: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_md, marginTop: tokens.space.xs },
  empty: { color: tokens.color.ink_secondary, padding: tokens.space.lg },
});
