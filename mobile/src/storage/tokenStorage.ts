import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "auth_token";

export async function getToken() {
  if (Platform.OS === "web") return window.localStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

export async function setToken(token: string) {
  if (Platform.OS === "web") {
    window.localStorage.setItem(KEY, token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function deleteToken() {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
