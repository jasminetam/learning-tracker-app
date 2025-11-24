import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api/client";
import { getUserIdFromToken } from "../auth/getUserId";

type Props = NativeStackScreenProps<RootStackParamList, "AddResource">;

export default function AddResourceScreen({ navigation }: Props) {
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("book");
  const [saving, setSaving] = useState(false);

  const userId = getUserIdFromToken(token);

  const onSave = async () => {
    if (!title.trim()) return;

    setSaving(true);
    try {
      await apiFetch("/resources", {
        method: "POST",
        token,
        body: JSON.stringify({ userId, title, type }),
      });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Type (course/book/video/article)</Text>
      <TextInput style={styles.input} value={type} onChangeText={setType} />

      <Button
        title={saving ? "Saving..." : "Save"}
        onPress={onSave}
        disabled={saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { fontSize: 16 },
  input: { borderWidth: 1, padding: 8, borderRadius: 8 },
});
