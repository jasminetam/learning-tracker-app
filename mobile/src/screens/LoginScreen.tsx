import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";
import { useAuth } from "../auth/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [userId, setUserId] = useState("dev-user");

  const onLogin = async () => {
    // TEMP: backend doesn’t enforce auth yet
    // Later: replace with Cognito sign-in → real JWT
    await signIn(`dev-token:${userId}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>User ID (dev)</Text>
      <TextInput style={styles.input} value={userId} onChangeText={setUserId} />
      <Button title="Login" onPress={onLogin} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { fontSize: 16 },
  input: { borderWidth: 1, padding: 8, borderRadius: 8 },
});
