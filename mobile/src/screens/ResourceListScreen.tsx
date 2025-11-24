import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Button,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api/client";
import { getUserIdFromToken } from "../auth/getUserId";

type Props = NativeStackScreenProps<RootStackParamList, "Resources">;

type Resource = {
  pk: string;
  sk: string;
  resourceId: string;
  title: string;
  type: string;
  status: "active" | "completed";
  minutesSpent: number;
};

export default function ResourceListScreen({ navigation }: Props) {
  const { token, signOut } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [deltaMinutes, setDeltaMinutes] = useState("30");

  const userId = getUserIdFromToken(token);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ resources: Resource[] }>(
        `/resources?userId=${userId}`,
        { token }
      );
      setResources(data.resources ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openProgress = (r: Resource) => {
    setSelected(r);
    setDeltaMinutes("30");
    setModalOpen(true);
  };

  const submitProgress = async () => {
    if (!selected) return;
    await apiFetch(`/resources/${selected.resourceId}/progress`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ userId, deltaMinutes: Number(deltaMinutes) }),
    });
    setModalOpen(false);
    await load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Button
          title="Add Resource"
          onPress={() => navigation.navigate("AddResource")}
        />
        <Button title="Sign out" onPress={signOut} />
      </View>

      <FlatList
        data={resources}
        refreshing={loading}
        onRefresh={load}
        keyExtractor={(r) => r.resourceId}
        renderItem={({ item }) => (
          <Pressable onPress={() => openProgress(item)} style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text>
              {item.type} • {item.status}
            </Text>
            <Text>{item.minutesSpent} min spent</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text>No resources yet.</Text>}
      />

      <Modal visible={modalOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Add progress{selected ? ` — ${selected.title}` : ""}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={deltaMinutes}
              onChangeText={setDeltaMinutes}
              placeholder="Minutes to add"
            />
            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setModalOpen(false)} />
              <Button title="Save" onPress={submitProgress} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  card: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
    gap: 4,
  },
  title: { fontSize: 18, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    backgroundColor: "white",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "600" },
  input: { borderWidth: 1, padding: 8, borderRadius: 8 },
  modalButtons: { flexDirection: "row", justifyContent: "space-between" },
});
